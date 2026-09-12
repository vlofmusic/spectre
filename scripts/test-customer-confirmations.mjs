import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseOrder,submitOrder} from '../server/orders.js';
import {hashToken,setQuantity,readBag,HOLD_SECONDS} from '../server/reservations.js';
import {confirmationCapabilities,publicCustomerConfirmation,telegramReceiptWebhook,customerReceiptText,boundedSend} from '../server/customer-confirmations.js';
import worker from '../server/worker.js';

// An isolated SQLite database and synthetic transports only. Never reads local secrets.
function database(){
 const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');
 for(const file of readdirSync('drizzle').filter(file=>file.endsWith('.sql')).sort())sql.exec(readFileSync('drizzle/'+file,'utf8'));
 sql.exec(readFileSync('db/seed-local.sql','utf8'));
 return {
  rows(query,...params){return sql.prepare(query).all(...params);},close(){sql.close();},
  prepare(query){return {query,params:[],bind(...params){this.params=params;return this;}};},
  async batch(statements){
   sql.exec('BEGIN IMMEDIATE');
   try{
    const results=statements.map(({query,params})=>{
     const statement=sql.prepare(query);
     return query.trim().startsWith('SELECT')?{results:statement.all(...params),meta:{changes:0}}:{results:[],meta:{changes:Number(statement.run(...params).changes)}};
    });sql.exec('COMMIT');return results;
   }catch(error){sql.exec('ROLLBACK');throw error;}
  }
 };
}
function fixture(t,overrides={}){
 const DB=database();t.after(()=>DB.close());
 return {DB,TELEGRAM_BOT_TOKEN:'123456789:TEST_ONLY_NOT_A_REAL_TOKEN_123456789',TELEGRAM_CHAT_ID:'9000000',
  TELEGRAM_BOT_USERNAME:'spectreorders_bot',TELEGRAM_WEBHOOK_SECRET:'TEST_ONLY_WEBHOOK_SECRET_NOT_REAL_123456789',
  RESEND_API_KEY:'re_TEST_ONLY_NOT_REAL_123456789',RESEND_FROM:'Spectre <requests@example.com>',...overrides};
}
const payload=(overrides={})=>({name:'Test Customer',contactMethod:'email',contact:'customer@example.com',drawstrings:false,notes:'Private note not for receipts',requestKey:crypto.randomUUID(),...overrides});
const sent=()=>Response.json({ok:true,result:{message_id:17}});
const accepted=()=>Response.json({id:'00000000-0000-4000-8000-000000000001'});
const transport=async url=>url==='https://api.resend.com/emails'?accepted():sent();
const noSend=async()=>assert.fail('Unexpected outbound send');
const row=(env,reference)=>env.DB.rows('SELECT * FROM orders WHERE reference=?',reference)[0];
const receipt=(env,reference)=>env.DB.rows('SELECT * FROM customer_confirmations WHERE reference=?',reference)[0];
async function order(env,options={}){
 const hash=options.hash||'shopper',now=options.now||101,input=options.input||payload();
 await setQuantity(env.DB,hash,'S',1,now-1);
 const response=await submitOrder(env,hash,parseOrder(input),now,options.send||transport,options.context||{});
 return {hash,input,response,order:response.body.order};
}
const tokenFrom=value=>new URL(value).searchParams.get('start');
const update=(token,overrides={})=>({update_id:1,message:{chat:{id:12345,type:'private'},from:{id:12345,is_bot:false},text:`/start ${token}`},...overrides});
function webhookRequest(env,body,options={}){
 const method=options.method||'POST';
 return new Request('https://spectre.example/api/telegram/webhook',{method,
  headers:{'Content-Type':'application/json','X-Telegram-Bot-Api-Secret-Token':env.TELEGRAM_WEBHOOK_SECRET,...options.headers},
  ...(method!=='GET'?{body:typeof body==='string'?body:JSON.stringify(body)}:{})});
}

test('capabilities fail closed for missing or unsafe configuration and accept one sender mailbox',t=>{
 const env=fixture(t);
 assert.deepEqual(confirmationCapabilities(env),{email:true,telegram:true});
 for(const from of ['one@example.com,two@example.com','Spectre <one@example.com>, <two@example.com>','one@example.com\r\nBcc: bad@example.com','<one@example.com>','one@localhost',''])
  assert.equal(confirmationCapabilities({...env,RESEND_FROM:from}).email,false,from);
 assert.equal(confirmationCapabilities({...env,RESEND_FROM:'one@example.com'}).email,true);
 for(const changes of [{TELEGRAM_WEBHOOK_SECRET:''},{TELEGRAM_BOT_USERNAME:'@spectreorders_bot'},{TELEGRAM_BOT_TOKEN:''},{DB:null}])
  assert.equal(confirmationCapabilities({...env,...changes}).telegram,false);
 assert.equal(confirmationCapabilities({...env,RESEND_API_KEY:'bad key'}).email,false);
});

test('email and owner Telegram start independently in parallel, and public receipt contains no private data',{timeout:3000},async t=>{
 const env=fixture(t);let release,announce;const gate=new Promise(resolve=>release=resolve),started=new Promise(resolve=>announce=resolve);const calls=[];
 const pending=order(env,{send:async(url,options)=>{
  calls.push({url,body:JSON.parse(options.body),headers:options.headers});if(calls.length===2)announce();await gate;return transport(url);
 }});
 await started;release();const result=await pending;
 assert.equal(result.response.status,200);
 assert.equal(result.order.notificationStatus,'sent');
 assert.deepEqual(result.order.customerConfirmation,{channel:'email',status:'accepted'});
 const email=calls.find(call=>call.url==='https://api.resend.com/emails');
 assert.equal(email.headers['Idempotency-Key'],`customer-receipt/${result.order.reference}`);
 assert.deepEqual(email.body.to,['customer@example.com']);
 assert.equal(email.body.html,undefined);assert.equal(email.body.cc,undefined);assert.equal(email.body.bcc,undefined);
 assert.match(email.body.text,/S × 1/);assert.match(email.body.text,/Subtotal: CHF 50/);
 assert.match(email.body.text,/No payment has been taken/);assert.match(email.body.text,/does not extend/);
 assert.doesNotMatch(email.body.text,/Private note|Test Customer|customer@example/);
 assert.doesNotMatch(JSON.stringify(result.order),/token_hash|chat_id|Test Customer|customer@example|Private note/);
});

test('same request key concurrently creates and sends exactly one customer receipt',async t=>{
 const env=fixture(t),input=payload();await setQuantity(env.DB,'shopper','S',1,100);let emailCalls=0,adminCalls=0;
 const send=async url=>{if(url==='https://api.resend.com/emails')emailCalls++;else adminCalls++;return transport(url);};
 const results=await Promise.all(Array.from({length:5},()=>submitOrder(env,'shopper',input,101,send)));
 assert.equal(new Set(results.map(result=>result.body.order.reference)).size,1);
 assert.equal(emailCalls,1);assert.equal(adminCalls,1);
 assert.equal(env.DB.rows('SELECT * FROM orders').length,1);
 assert.equal(env.DB.rows('SELECT * FROM customer_confirmation_attempts').length,1);
 const retry=await submitOrder(env,'shopper',input,110,noSend);
 assert.equal(retry.body.order.customerConfirmation.status,'accepted');
});

test('customer failure never discards the saved request and retries never send again',async t=>{
 const cases=[['explicit rejection',async()=>Response.json({name:'validation_error'},{status:422}),'failed'],
  ['server failure',async()=>Response.json({name:'server_error'},{status:500}),'uncertain'],
  ['network failure',async()=>{throw new TypeError('Synthetic failure');},'uncertain'],
  ['bad JSON',async()=>new Response('invalid'),'uncertain'],['missing provider id',async()=>Response.json({}),'uncertain']];
 for(const [name,emailSend,expected] of cases)await t.test(name,async t=>{
  const env=fixture(t);let emailCalls=0;
  const result=await order(env,{send:async url=>{if(url==='https://api.resend.com/emails'){emailCalls++;return emailSend();}return sent();}});
  assert.equal(result.response.status,200);assert.equal(result.order.notificationStatus,'sent');
  assert.equal(result.order.customerConfirmation.status,expected);
  const retry=await submitOrder(env,result.hash,result.input,2000,noSend);
  assert.equal(retry.body.order.reference,result.order.reference);
  assert.equal(retry.body.order.customerConfirmation.status,expected);assert.equal(emailCalls,1);
 });
});

test('owner Telegram failure does not stop an accepted customer email',async t=>{
 const env=fixture(t),result=await order(env,{send:async url=>url==='https://api.resend.com/emails'?accepted():Response.json({ok:false},{status:400})});
 assert.equal(result.order.notificationStatus,'failed');assert.equal(result.order.customerConfirmation.status,'accepted');
});

test('customer status-write failure remains pending then uncertain and is never blindly resent',async t=>{
 const env=fixture(t),batch=env.DB.batch.bind(env.DB);let emails=0;
 env.DB.batch=async statements=>{
  if(statements.some(statement=>statement.query.startsWith('UPDATE customer_confirmations SET status=?,provider_id=?')))throw new Error('Synthetic status write failure');
  return batch(statements);
 };
 const result=await order(env,{send:async url=>{if(url==='https://api.resend.com/emails')emails++;return transport(url);}});
 assert.equal(result.response.status,200);assert.equal(result.order.customerConfirmation.status,'pending');env.DB.batch=batch;
 const retry=await submitOrder(env,result.hash,result.input,132,noSend);
 assert.equal(retry.body.order.customerConfirmation.status,'uncertain');assert.equal(emails,1);
});

test('confirmation database failure fails closed without losing the order or sending customer email',async t=>{
 const env=fixture(t),batch=env.DB.batch.bind(env.DB);let emails=0;
 env.DB.batch=async statements=>{
  if(statements.some(statement=>statement.query.startsWith('INSERT INTO customer_confirmations')))throw new Error('Synthetic unavailable receipt storage');
  return batch(statements);
 };
 const result=await order(env,{send:async url=>{if(url==='https://api.resend.com/emails')emails++;return transport(url);}});
 assert.equal(result.response.status,200);assert.equal(result.order.customerConfirmation.status,'unavailable');assert.equal(emails,0);
 assert.equal(env.DB.rows('SELECT * FROM orders').length,1);
});

test('old orders and unavailable channels retain honest fallbacks without automatic backfill',async t=>{
 const env=fixture(t,{RESEND_API_KEY:'',TELEGRAM_WEBHOOK_SECRET:''});
 const email=await order(env);assert.deepEqual(email.order.customerConfirmation,{channel:'email',status:'unavailable'});
 await env.DB.batch([env.DB.prepare('DELETE FROM customer_confirmations WHERE reference=?').bind(email.order.reference)]);
 assert.deepEqual(await publicCustomerConfirmation(env,row(env,email.order.reference),102),{channel:'email',status:'unavailable'});
 const instagram=await order(env,{input:payload({contactMethod:'instagram',contact:'@example'})});
 assert.deepEqual(instagram.order.customerConfirmation,{channel:'instagram',status:'manual'});
 const telegram=await order(env,{input:payload({contactMethod:'telegram',contact:'@example'})});
 assert.deepEqual(telegram.order.customerConfirmation,{channel:'telegram',status:'unavailable'});
});

test('one email per original hold bounds changed UUIDs and recipient edits without blocking requests',async t=>{
 const env=fixture(t),first=await order(env),second=await order(env,{input:payload({contact:'other@example.com'})});
 assert.equal(first.order.customerConfirmation.status,'accepted');assert.equal(second.order.customerConfirmation.status,'limited');
 assert.equal(second.response.status,200);assert.equal(env.DB.rows('SELECT * FROM orders').length,2);
 assert.equal(env.DB.rows('SELECT * FROM customer_confirmation_attempts').length,1);
});

test('durable recipient and trusted-IP limits apply across distinct holds',async t=>{
 for(const mode of ['recipient','ip'])await t.test(mode,async t=>{
  const env=fixture(t),limit=mode==='recipient'?3:5;
  for(let i=0;i<=limit;i++){
   const hash=`shopper-${i}`;
   const result=await order(env,{hash,input:payload({contact:mode==='recipient'?'same@example.com':`person${i}@example.com`}),context:mode==='ip'?{trustedIp:'203.0.113.1'}:{}});
   assert.equal(result.order.customerConfirmation.status,i<limit?'accepted':'limited');
   await setQuantity(env.DB,hash,'S',0,102);
  }
  assert.equal(env.DB.rows('SELECT * FROM orders').length,limit+1);
 });
});

test('global twenty-per-hour limit is atomic across competing confirmations',async t=>{
 const env=fixture(t);
 for(let i=0;i<19;i++){
  const hash=`shopper-${i}`;await order(env,{hash,input:payload({contact:`person${i}@example.com`})});await setQuantity(env.DB,hash,'S',0,102);
 }
 const results=await Promise.all([19,20].map(i=>order(env,{hash:`shopper-${i}`,input:payload({contact:`person${i}@example.com`})})));
 assert.deepEqual(results.map(result=>result.order.customerConfirmation.status).sort(),['accepted','limited']);
 assert.equal(env.DB.rows('SELECT * FROM customer_confirmation_attempts').length,20);
 assert.equal(env.DB.rows('SELECT * FROM orders').length,21);
});

test('Telegram link is stable on retry, private, time bounded and one use',async t=>{
 const env=fixture(t),result=await order(env,{input:payload({contactMethod:'telegram',contact:'@arbitrary_username'})});
 const publicReceipt=result.order.customerConfirmation;
 assert.equal(publicReceipt.status,'waiting_start');assert.equal(publicReceipt.expiresAt,(101+86400)*1000);
 const payloadToken=tokenFrom(publicReceipt.telegramUrl);assert.match(payloadToken,/^r_[A-Za-z0-9_-]{43}$/);
 const stored=receipt(env,result.order.reference);
 assert.notEqual(stored.link_token_hash,payloadToken.slice(2));assert.equal(stored.telegram_chat_id,null);
 const retry=await submitOrder(env,result.hash,result.input,102,noSend);
 assert.deepEqual(retry.body.order.customerConfirmation,publicReceipt);
 let calls=0,outgoing;
 const send=async(url,options)=>{calls++;outgoing=JSON.parse(options.body);return sent();};
 assert.equal((await telegramReceiptWebhook(webhookRequest(env,update(payloadToken)),env,103,send)).status,200);
 assert.equal(outgoing.chat_id,'12345');assert.equal(outgoing.parse_mode,undefined);assert.match(outgoing.text,/Request SP-/);
 await telegramReceiptWebhook(webhookRequest(env,update(payloadToken)),env,104,noSend);
 await telegramReceiptWebhook(webhookRequest(env,update(payloadToken,{update_id:2,message:{chat:{id:777,type:'private'},from:{id:777,is_bot:false},text:`/start ${payloadToken}`}})),env,104,noSend);
 assert.equal(calls,1);assert.equal(receipt(env,result.order.reference).telegram_chat_id,'12345');
 assert.deepEqual(await publicCustomerConfirmation(env,row(env,result.order.reference),105),{channel:'telegram',status:'sent'});
});

test('two private chats racing for the same link bind one recipient and send once',async t=>{
 const env=fixture(t),result=await order(env,{input:payload({contactMethod:'telegram',contact:'@test'})});const token=tokenFrom(result.order.customerConfirmation.telegramUrl);let sends=0;
 await Promise.all([123,456].map(id=>telegramReceiptWebhook(webhookRequest(env,{update_id:id,message:{chat:{id,type:'private'},from:{id,is_bot:false},text:`/start ${token}`}}),env,105,async()=>{sends++;return sent();})));
 assert.equal(sends,1);assert.ok(['123','456'].includes(receipt(env,result.order.reference).telegram_chat_id));
});

test('Telegram receipt after the hold expires is explicit and never reserves or changes stock',async t=>{
 const env=fixture(t),result=await order(env,{input:payload({contactMethod:'telegram',contact:'@test'})});
 await setQuantity(env.DB,'other','M',1,2001);await setQuantity(env.DB,'other','M',0,2002);
 const before=await readBag(env.DB,result.hash,2003);assert.deepEqual(before.items,{});
 let text;
 await telegramReceiptWebhook(webhookRequest(env,update(tokenFrom(result.order.customerConfirmation.telegramUrl))),env,2003,async(url,options)=>{text=JSON.parse(options.body).text;return sent();});
 assert.match(text,/original reservation ended/);assert.match(text,/Availability needs to be checked again/);
 assert.deepEqual(await readBag(env.DB,result.hash,2003),before);
 assert.equal(row(env,result.order.reference).hold_expires_at,100+HOLD_SECONDS);
});

test('link expiry and secret rotation remove usable links and reject old tokens',async t=>{
 const env=fixture(t),result=await order(env,{input:payload({contactMethod:'telegram',contact:'@test'})});const orderRow=row(env,result.order.reference),token=tokenFrom(result.order.customerConfirmation.telegramUrl);
 const expired=await publicCustomerConfirmation(env,orderRow,101+86400);assert.equal(expired.status,'expired');assert.equal(expired.telegramUrl,undefined);
 await telegramReceiptWebhook(webhookRequest(env,update(token)),env,101+86400,noSend);
 const changed={...env,TELEGRAM_WEBHOOK_SECRET:'TEST_ONLY_ROTATED_SECRET_NOT_REAL_123456789'};
 const rotated=await publicCustomerConfirmation(changed,orderRow,102);assert.equal(rotated.status,'unavailable');assert.equal(rotated.telegramUrl,undefined);
 await telegramReceiptWebhook(webhookRequest(changed,update(token)),changed,102,noSend);
 assert.equal(receipt(env,result.order.reference).telegram_chat_id,null);
});

test('duplicate update id cannot claim a second receipt',async t=>{
 const env=fixture(t),first=await order(env,{input:payload({contactMethod:'telegram',contact:'@test'})}),second=await order(env,{input:payload({contactMethod:'telegram',contact:'@test'})});
 await telegramReceiptWebhook(webhookRequest(env,update(tokenFrom(first.order.customerConfirmation.telegramUrl))),env,102,transport);
 await telegramReceiptWebhook(webhookRequest(env,update(tokenFrom(second.order.customerConfirmation.telegramUrl))),env,103,noSend);
 assert.equal(receipt(env,second.order.reference).status,'waiting_start');
});

test('Telegram provider ambiguity and status persistence failure never cause a repeated send',async t=>{
 for(const kind of ['ambiguous','write failure'])await t.test(kind,async t=>{
  const env=fixture(t),result=await order(env,{input:payload({contactMethod:'telegram',contact:'@test'})}),token=tokenFrom(result.order.customerConfirmation.telegramUrl);
  const batch=env.DB.batch.bind(env.DB);let attempts=0;
  if(kind==='write failure')env.DB.batch=async statements=>{
   if(statements.some(statement=>statement.query.startsWith('UPDATE customer_confirmations SET status=?,provider_id=?')))throw new Error('Synthetic write failure');return batch(statements);
  };
  const response=await telegramReceiptWebhook(webhookRequest(env,update(token)),env,102,async()=>{attempts++;if(kind==='ambiguous')throw new TypeError('Synthetic ambiguous send');return sent();});
  assert.equal(response.status,kind==='ambiguous'?200:503);env.DB.batch=batch;
  await telegramReceiptWebhook(webhookRequest(env,update(token)),env,103,noSend);
  assert.equal(attempts,1);
  assert.equal((await publicCustomerConfirmation(env,row(env,result.order.reference),140)).status,'uncertain');
 });
});

test('webhook rejects bad auth, method, format and bounded body without claims or outbound calls',async t=>{
 const env=fixture(t),result=await order(env,{input:payload({contactMethod:'telegram',contact:'@test'})}),token=tokenFrom(result.order.customerConfirmation.telegramUrl);
 const body=update(token);
 const cases=[
  [webhookRequest(env,body,{method:'GET'}),405],
  [webhookRequest(env,body,{headers:{'X-Telegram-Bot-Api-Secret-Token':'wrong'}}),403],
  [webhookRequest(env,body,{headers:{'Content-Type':'text/plain'}}),415],
  [webhookRequest(env,'{'),400],
  [webhookRequest(env,'x'.repeat(16385)),413],
  [webhookRequest(env,'{}',{headers:{'Content-Length':'20000'}}),413]
 ];
 for(const [request,status] of cases)assert.equal((await telegramReceiptWebhook(request,env,102,noSend)).status,status);
 for(const altered of [
  {...body,message:{...body.message,chat:{id:12345,type:'group'}}},
  {...body,message:{...body.message,from:{id:444,is_bot:false}}},
  {...body,message:{...body.message,from:{id:12345,is_bot:true}}},
  {update_id:1,edited_message:body.message},
  {...body,message:{...body.message,text:'/start@other_bot '+token}},
  {...body,message:{...body.message,text:'/start r_'+'x'.repeat(43)}}
 ])assert.equal((await telegramReceiptWebhook(webhookRequest(env,altered),env,102,noSend)).status,200);
 assert.equal(receipt(env,result.order.reference).status,'waiting_start');
 assert.equal(env.DB.rows('SELECT * FROM telegram_receipt_updates').length,0);
});

test('worker exposes only capability flags and accepts authenticated Telegram without browser cookies or Origin',async t=>{
 const env=fixture(t),result=await order(env,{now:Math.floor(Date.now()/1000),input:payload({contactMethod:'telegram',contact:'@test'})});
 const config=await (await worker.fetch(new Request('https://spectre.example/api/checkout'),env)).json();
 assert.deepEqual(config,{enabled:true,confirmations:{email:true,telegram:true}});
 t.mock.method(globalThis,'fetch',transport);
 assert.equal((await worker.fetch(webhookRequest(env,update(tokenFrom(result.order.customerConfirmation.telegramUrl))),env)).status,200);
 assert.equal(receipt(env,result.order.reference).status,'sent');
});

test('untrusted forwarded IP header is ignored while runtime-injected CF address is hashed',async t=>{
 const env=fixture(t);t.mock.method(globalThis,'fetch',transport);
 for(const trusted of [false,true]){
  const token=(trusted?'b':'a').repeat(64),hash=await hashToken(token),now=Math.floor(Date.now()/1000);
  await setQuantity(env.DB,hash,'S',1,now);
  const request=new Request('https://spectre.example/api/orders',{method:'POST',headers:{Origin:'https://spectre.example','Content-Type':'application/json',Cookie:`spectre_hold=${token}`,'CF-Connecting-IP':'203.0.113.1'},body:JSON.stringify(payload({contact:`person-${trusted}@example.com`}))});
  if(trusted)Object.defineProperty(request,'cf',{value:{}});
  const data=await (await worker.fetch(request,env)).json();
  const attempt=env.DB.rows('SELECT * FROM customer_confirmation_attempts WHERE reference=?',data.order.reference)[0];
  assert.equal(attempt.ip_hash,trusted?await hashToken('email-ip/203.0.113.1'):null);
 }
});

test('transport timeout remains bounded even if fetch ignores AbortSignal',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});
 const attempt=boundedSend(async()=>new Promise(()=>{}),'https://synthetic.invalid',{});
 const assertion=assert.rejects(attempt,/DELIVERY_TIMEOUT/);
 t.mock.timers.tick(8000);await assertion;
});

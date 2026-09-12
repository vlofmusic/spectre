import {hashToken} from './reservations.js';

const LINK_SECONDS=24*60*60;
const SEND_TIMEOUT=8000;
const encoder=new TextEncoder();
const EMAIL=/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+$/;
const validEmail=value=>typeof value==='string'&&value.length<=254&&EMAIL.test(value);
const validBot=env=>/^\d+:[A-Za-z0-9_-]{20,}$/.test(env.TELEGRAM_BOT_TOKEN||'');
const validSecret=env=>/^[A-Za-z0-9_-]{32,256}$/.test(env.TELEGRAM_WEBHOOK_SECRET||'');
export function validResendFrom(value){
 if(typeof value!=='string'||value.length>320||/[\r\n\u0000-\u001f\u007f]/.test(value))return false;
 if(validEmail(value))return true;
 const match=/^[A-Za-z0-9 ._-]{1,60} <([^<>]+)>$/.exec(value);
 return Boolean(match&&validEmail(match[1]));
}
export function confirmationCapabilities(env){
 return {
  email:Boolean(env.DB&&/^re_[A-Za-z0-9_-]{8,}$/.test(env.RESEND_API_KEY||'')&&validResendFrom(env.RESEND_FROM)),
  telegram:Boolean(env.DB&&validBot(env)&&validSecret(env)&&/^[A-Za-z0-9_]{5,32}$/.test(env.TELEGRAM_BOT_USERNAME||''))
 };
}
const fallback=row=>({channel:row.contact_method,status:row.contact_method==='instagram'?'manual':'unavailable'});
const json=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const equal=(a,b)=>{
 if(typeof a!=='string'||typeof b!=='string'||a.length!==b.length)return false;
 let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0;
};
async function linkToken(env,row){
 const key=await crypto.subtle.importKey('raw',encoder.encode(env.TELEGRAM_WEBHOOK_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const signature=await crypto.subtle.sign('HMAC',key,encoder.encode(`spectre/customer-receipt/v1\n${row.reference}\n${row.token_hash}`));
 return btoa(String.fromCharCode(...new Uint8Array(signature))).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
}
async function confirmationRow(db,reference){
 const [result]=await db.batch([db.prepare('SELECT * FROM customer_confirmations WHERE reference=?').bind(reference)]);
 return result.results[0];
}
export async function publicCustomerConfirmation(env,row,now){
 try{
  const receipt=await confirmationRow(env.DB,row.reference);
  if(!receipt)return fallback(row);
  const inProgress=['pending','sending'].includes(receipt.status);
  const result={channel:receipt.channel,status:inProgress?((receipt.attempted_at??receipt.created_at)<=now-30?'uncertain':'pending'):receipt.status};
  if(receipt.channel==='telegram'&&receipt.status==='waiting_start'){
   result.expiresAt=receipt.link_expires_at*1000;
   if(receipt.link_expires_at<=now){result.status='expired';return result;}
   if(!confirmationCapabilities(env).telegram){result.status='unavailable';return result;}
   const token=await linkToken(env,row);
   // A rotated webhook secret invalidates old links; do not hand out a broken replacement.
   if(!equal(await hashToken(token),receipt.link_token_hash)){result.status='unavailable';return result;}
   result.telegramUrl=`https://t.me/${env.TELEGRAM_BOT_USERNAME}?start=r_${token}`;
  }
  return result;
 }catch{return fallback(row);}
}

export function customerReceiptText(row,now){
 const items=JSON.parse(row.items),quantity=Object.values(items).reduce((a,b)=>a+b,0);
 const deadline=new Date(row.hold_expires_at*1000).toISOString();
 const reserve=now>=row.hold_expires_at
  ?`The original reservation ended at ${deadline}. Availability needs to be checked again.`
  :`Original reservation deadline: ${deadline}. This receipt does not extend it or confirm that your selection is still held; your bag may have changed.`;
 return `Thank you for your Spectre hoodie request.\n\nRequest ${row.reference}\nBlack Spectre Hoodie\n${Object.entries(items).map(([size,count])=>`${size} × ${count}`).join('\n')}\nSubtotal: ${row.currency} ${quantity*row.unit_price} (delivery additional)\nDrawstrings requested: ${row.drawstrings?'Yes':'No'}\n\n${reserve}\n\nThis is a request, not a confirmed order. No payment has been taken. Spectre will follow up to confirm availability, delivery and the next step.`;
}

export async function boundedSend(send,url,options){
 const controller=new AbortController();
 let timer;
 // Also bound transports that ignore AbortSignal and slow/unreadable response bodies.
 const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new Error('DELIVERY_TIMEOUT'));},SEND_TIMEOUT);});
 try{return await Promise.race([(async()=>{
  const response=await send(url,{...options,signal:controller.signal});
  return {response,data:await response.json()};
 })(),timeout]);}finally{clearTimeout(timer);}
}

async function sendEmail(env,row,now,send,trustedIp){
 if(!confirmationCapabilities(env).email||!validEmail(row.contact))return;
 const recipientHash=await hashToken(row.contact.toLowerCase());
 const holdKey=await hashToken(`email-hold/${row.token_hash}/${row.hold_expires_at}`);
 const ipHash=trustedIp?await hashToken(`email-ip/${trustedIp}`):null;
 const hour=now-3600;
 // A single D1 transaction admits an attempt against every quota and claims the receipt.
 const results=await env.DB.batch([
  env.DB.prepare('DELETE FROM customer_confirmation_attempts WHERE created_at<?').bind(now-7*86400),
  env.DB.prepare(`INSERT INTO customer_confirmation_attempts(reference,hold_key,recipient_hash,ip_hash,created_at)
   SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM customer_confirmations WHERE reference=? AND status='pending')
    AND (SELECT COUNT(*) FROM customer_confirmation_attempts WHERE hold_key=?)<1
    AND (SELECT COUNT(*) FROM customer_confirmation_attempts WHERE recipient_hash=? AND created_at>?)<3
    AND (? IS NULL OR (SELECT COUNT(*) FROM customer_confirmation_attempts WHERE ip_hash=? AND created_at>?)<5)
    AND (SELECT COUNT(*) FROM customer_confirmation_attempts WHERE created_at>?)<20
   ON CONFLICT(reference) DO NOTHING`).bind(row.reference,holdKey,recipientHash,ipHash,now,row.reference,holdKey,recipientHash,hour,ipHash,ipHash,hour,hour),
  env.DB.prepare(`UPDATE customer_confirmations SET status='sending',attempted_at=? WHERE reference=? AND status='pending'
   AND EXISTS(SELECT 1 FROM customer_confirmation_attempts WHERE reference=?)`).bind(now,row.reference,row.reference),
  env.DB.prepare(`UPDATE customer_confirmations SET status='limited' WHERE reference=? AND status='pending'
   AND NOT EXISTS(SELECT 1 FROM customer_confirmation_attempts WHERE reference=?)`).bind(row.reference,row.reference)
 ]);
 if(!results[2].meta.changes)return;
 let status='uncertain',providerId=null;
 try{
  const {response,data}=await boundedSend(send,'https://api.resend.com/emails',{
   method:'POST',headers:{Authorization:`Bearer ${env.RESEND_API_KEY}`,'Content-Type':'application/json','Idempotency-Key':`customer-receipt/${row.reference}`},
   body:JSON.stringify({from:env.RESEND_FROM,to:[row.contact],subject:`Spectre hoodie request ${row.reference}`,text:customerReceiptText(row,now)})
  });
  if(response.ok&&typeof data.id==='string'&&data.id.length>0&&data.id.length<=200){status='accepted';providerId=data.id;}
  else if(!response.ok&&response.status>=400&&response.status<500&&data&&typeof data==='object')status='failed';
 }catch{/* The provider may already have accepted the receipt. Do not resend blindly. */}
 await env.DB.batch([env.DB.prepare("UPDATE customer_confirmations SET status=?,provider_id=? WHERE reference=? AND status='sending'").bind(status,providerId,row.reference)]);
}

export async function createCustomerConfirmation(env,row,now,send=fetch,trustedIp=null){
 const capabilities=confirmationCapabilities(env);
 const channel=row.contact_method;
 let status=channel==='instagram'?'manual':'unavailable',tokenHash=null,expires=null;
 if(channel==='email'&&capabilities.email&&validEmail(row.contact))status='pending';
 if(channel==='telegram'&&capabilities.telegram){
  status='waiting_start';expires=row.created_at+LINK_SECONDS;
  tokenHash=await hashToken(await linkToken(env,row));
 }
 await env.DB.batch([env.DB.prepare(`INSERT INTO customer_confirmations(reference,channel,status,created_at,link_token_hash,link_expires_at)
  VALUES(?,?,?,?,?,?) ON CONFLICT(reference) DO NOTHING`).bind(row.reference,channel,status,now,tokenHash,expires)]);
 if(channel==='email'&&status==='pending')await sendEmail(env,row,now,send,trustedIp);
}

async function readWebhookBody(request){
 const limit=16384;
 if(Number(request.headers.get('Content-Length')||0)>limit)return {error:413};
 const reader=request.body?.getReader();
 if(!reader)return {error:400};
 let length=0;const chunks=[];
 try{
  while(true){
   const {done,value}=await reader.read();if(done)break;
   length+=value.byteLength;
   if(length>limit){await reader.cancel();return {error:413};}
   chunks.push(value);
  }
  const bytes=new Uint8Array(length);let offset=0;
  for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
  return {body:JSON.parse(new TextDecoder().decode(bytes))};
 }catch{return {error:400};}
}

export async function telegramReceiptWebhook(request,env,now,send=fetch){
 if(!confirmationCapabilities(env).telegram)return json({error:'Not found'},404);
 if(request.method!=='POST')return json({error:'Method not allowed'},405);
 if(!equal(request.headers.get('X-Telegram-Bot-Api-Secret-Token'),env.TELEGRAM_WEBHOOK_SECRET))return json({error:'Forbidden'},403);
 if(!request.headers.get('Content-Type')?.startsWith('application/json'))return json({error:'Expected JSON'},415);
 const parsed=await readWebhookBody(request);
 if(parsed.error)return json({error:'Invalid webhook request'},parsed.error);
 const update=parsed.body,message=update?.message;
 // Usernames are not authentication; only Telegram's verified private-chat update binds a receipt.
 if(!Number.isSafeInteger(update?.update_id)||update.update_id<0||!message||message.chat?.type!=='private'
  ||!Number.isSafeInteger(message.chat.id)||message.chat.id<=0||message.from?.id!==message.chat.id||message.from?.is_bot!==false
  ||typeof message.text!=='string')return json({ok:true});
 const match=/^\/start(?:@([A-Za-z0-9_]{5,32}))? r_([A-Za-z0-9_-]{43})$/.exec(message.text);
 if(!match||(match[1]&&match[1].toLowerCase()!==env.TELEGRAM_BOT_USERNAME.toLowerCase()))return json({ok:true});
 try{
  const tokenHash=await hashToken(match[2]);
  const [found]=await env.DB.batch([env.DB.prepare(`SELECT o.*,c.status AS customer_status,c.link_expires_at,c.telegram_chat_id
   FROM customer_confirmations c JOIN orders o ON o.reference=c.reference WHERE c.link_token_hash=? AND c.channel='telegram'`).bind(tokenHash)]);
  const row=found.results[0];
  if(!row||row.customer_status!=='waiting_start'||row.link_expires_at<=now||!equal(await linkToken(env,row),match[2]))return json({ok:true});
  const chat=String(message.chat.id);
  const claim=await env.DB.batch([
   env.DB.prepare('DELETE FROM telegram_receipt_updates WHERE created_at<?').bind(now-7*86400),
   env.DB.prepare(`UPDATE customer_confirmations SET status='sending',telegram_chat_id=?,claimed_at=?,attempted_at=?
    WHERE reference=? AND status='waiting_start' AND link_expires_at>? AND telegram_chat_id IS NULL
     AND NOT EXISTS(SELECT 1 FROM telegram_receipt_updates WHERE update_id=?)`).bind(chat,now,now,row.reference,now,update.update_id),
   env.DB.prepare('INSERT INTO telegram_receipt_updates(update_id,created_at) VALUES(?,?) ON CONFLICT(update_id) DO NOTHING').bind(update.update_id,now)
  ]);
  if(!claim[1].meta.changes)return json({ok:true});
  let status='uncertain',providerId=null;
  try{
   const {response,data}=await boundedSend(send,`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`,{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({chat_id:chat,text:customerReceiptText(row,now),link_preview_options:{is_disabled:true}})
   });
   if(response.ok&&data.ok===true&&Number.isSafeInteger(data.result?.message_id)){status='sent';providerId=String(data.result.message_id);}
   else if(data.ok===false)status='failed';
  }catch{/* An ambiguous Telegram attempt is durable and is never sent a second time. */}
  await env.DB.batch([env.DB.prepare("UPDATE customer_confirmations SET status=?,provider_id=? WHERE reference=? AND status='sending'").bind(status,providerId,row.reference)]);
  return json({ok:true});
 }catch{return json({error:'Receipt processing unavailable'},503);}
}

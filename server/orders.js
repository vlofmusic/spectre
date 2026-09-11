const UNIT_PRICE=50;
const clean=value=>typeof value==='string'?value.trim().replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g,''):'';
export function parseOrder(input) {
 if(!input||typeof input!=='object')return null;
 const value={name:clean(input.name),contactMethod:input.contactMethod,contact:clean(input.contact),notes:clean(input.notes),drawstrings:input.drawstrings,requestKey:input.requestKey};
 if(!value.name||value.name.length>120||!['email','telegram','instagram'].includes(value.contactMethod)||!value.contact||value.contact.length>200||value.notes.length>1000||typeof value.drawstrings!=='boolean'||typeof value.requestKey!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value.requestKey))return null;
 if(value.contactMethod==='email'?!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.contact):!/^@?[a-zA-Z0-9_.]{1,64}$/.test(value.contact))return null;
 return value;
}
export const checkoutEnabled=env=>Boolean(env.DB&&/^\d+:[A-Za-z0-9_-]{20,}$/.test(env.TELEGRAM_BOT_TOKEN||'')&&/^-?\d+$/.test(env.TELEGRAM_CHAT_ID||''));
const publicOrder=row=>({reference:row.reference,createdAt:row.created_at*1000,holdExpiresAt:row.hold_expires_at*1000,notificationStatus:row.notification_status==='sending'?'pending':row.notification_status});
async function findOrder(db,hash,key) {
 const [result]=await db.batch([db.prepare('SELECT * FROM orders WHERE token_hash=? AND request_key=?').bind(hash,key)]);
 return result.results[0];
}
export function notificationText(row) {
 const items=JSON.parse(row.items),quantity=Object.values(items).reduce((a,b)=>a+b,0);
 const lines=Object.entries(items).map(([size,count])=>`${size} × ${count}`);
 return `SPECTRE · New hoodie request ${row.reference}\n\nBlack Spectre Hoodie\n${lines.join('\n')}\nSubtotal: ${row.currency} ${quantity*row.unit_price} (delivery additional)\n\nName: ${row.name}\nReply via ${row.contact_method}: ${row.contact}\nDrawstrings requested: ${row.drawstrings?'Yes':'No'}\n${row.notes?`Notes: ${row.notes}\n`:''}\nReserved until: ${new Date(row.hold_expires_at*1000).toISOString()}\n\nRequest only. No payment taken; confirm stock, delivery and terms with the customer. The original 30-minute hold is not extended.`;
}
async function deliver(db,row,env,send) {
 const [claim]=await db.batch([db.prepare("UPDATE orders SET notification_status='sending' WHERE reference=? AND notification_status='pending'").bind(row.reference)]);
 if(!claim.meta.changes)return;
 let status='uncertain',messageId=null;
 const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),8000);
 try {
  const response=await send(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`,{
   method:'POST',headers:{'Content-Type':'application/json'},signal:controller.signal,
   body:JSON.stringify({chat_id:env.TELEGRAM_CHAT_ID,text:notificationText(row),link_preview_options:{is_disabled:true}})
  });
  const data=await response.json();
  if(response.ok&&data.ok===true&&Number.isSafeInteger(data.result?.message_id)){status='sent';messageId=data.result.message_id;}
  else if(data.ok===false)status='failed';
 }catch{/* Delivery may have occurred. Never blindly resend an ambiguous Telegram request. */}
 finally{clearTimeout(timeout);}
 await db.batch([db.prepare('UPDATE orders SET notification_status=?,message_id=? WHERE reference=?').bind(status,messageId,row.reference)]);
}
export async function submitOrder(env,hash,input,now,send=fetch) {
 if(!hash)return {status:409,body:{error:'Your reservation expired. Choose your size again.'}};
 let row=await findOrder(env.DB,hash,input.requestKey);
 // Look up the original attempt before expiry/config checks: a timed-out browser can recover it.
 if(row)return {status:200,body:{order:publicOrder(row)}};
 if(!checkoutEnabled(env))return {status:503,body:{error:'Online requests are unavailable. Please enquire by email.'}};
 const reference=`SP-${crypto.randomUUID().replaceAll('-','').slice(0,16).toUpperCase()}`;
 const results=await env.DB.batch([
  env.DB.prepare(`INSERT INTO orders(reference,token_hash,request_key,created_at,hold_expires_at,name,contact_method,contact,drawstrings,notes,items,unit_price,currency,notification_status)
   SELECT ?,h.token_hash,?,?,h.expires_at,?,?,?,?,?,
    (SELECT json_group_object(size,quantity) FROM (SELECT size,quantity FROM held_items WHERE token_hash=h.token_hash ORDER BY size)),?,?,'pending'
   FROM holds h WHERE h.token_hash=? AND h.expires_at>?
    AND EXISTS(SELECT 1 FROM held_items WHERE token_hash=h.token_hash)
   ON CONFLICT(token_hash,request_key) DO NOTHING`).bind(reference,input.requestKey,now,input.name,input.contactMethod,input.contact,Number(input.drawstrings),input.notes,UNIT_PRICE,'CHF',hash,now),
  env.DB.prepare('SELECT * FROM orders WHERE token_hash=? AND request_key=?').bind(hash,input.requestKey)
 ]);
 row=results[1].results[0];
 if(!row)return {status:409,body:{error:'Your reservation expired. Choose your size again.'}};
 // Only the transaction that inserted this request attempts delivery.
 if(results[0].meta.changes)await deliver(env.DB,row,env,send);
 row=await findOrder(env.DB,hash,input.requestKey);
 return {status:200,body:{order:publicOrder(row)}};
}

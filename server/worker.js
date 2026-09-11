import { SIZES,hashToken,readBag,setQuantity } from './reservations.js';
import { checkoutEnabled,parseOrder,submitOrder } from './orders.js';
import { initializeInventory } from './inventory-setup.js';
const json=(value,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
export default {
 async fetch(request,env) {
  const url=new URL(request.url);
  if(!url.pathname.startsWith('/api/')) {
   if(/^\/(?:server|\.openai|db|docs|drizzle)(?:\/|$)/.test(url.pathname))return new Response('Not found',{status:404});
   return env.ASSETS.fetch(request);
  }
  if(url.pathname==='/api/admin/initialize-inventory')return initializeInventory(request,env);
  if(!['/api/bag','/api/checkout','/api/orders'].includes(url.pathname))return json({error:'Not found'},404);
  if(!(url.pathname==='/api/checkout'?['GET']:url.pathname==='/api/orders'?['POST']:['GET','POST']).includes(request.method))return json({error:'Method not allowed'},405);
  if(url.pathname==='/api/checkout')return json({enabled:checkoutEnabled(env)});
  const now=Math.floor(Date.now()/1000);
  const cookie=(request.headers.get('Cookie')||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('spectre_hold='))?.slice(13);
  const token=cookie&&/^[a-f0-9]{64}$/.test(cookie)?cookie:null;
  try {
   if(!env.DB)return json({error:'Reservations are temporarily unavailable. Please enquire by email.'},503);
   if(request.method==='GET')return json(await readBag(env.DB,token?await hashToken(token):'',now));
   if(request.headers.get('Origin')!==url.origin)return json({error:'Please use the reservation controls on this website.'},403);
   if(!request.headers.get('Content-Type')?.startsWith('application/json'))return json({error:'Expected JSON'},415);
   const limit=url.pathname==='/api/orders'?8192:1024;
   if(Number(request.headers.get('Content-Length')||0)>limit)return json({error:'Request too large'},413);
   const raw=await request.text();if(new TextEncoder().encode(raw).length>limit)return json({error:'Request too large'},413);
   let input;try{input=JSON.parse(raw);}catch{return json({error:'Invalid request'},400);}
   if(url.pathname==='/api/orders'){
    const order=parseOrder(input);if(!order)return json({error:'Please check your contact details.'},400);
    const result=await submitOrder(env,token?await hashToken(token):'',order,now);
    return json(result.body,result.status);
   }
   if(!input||!SIZES.includes(input.size)||!Number.isInteger(input.quantity)||input.quantity<0||input.quantity>8)return json({error:'Choose a valid size and quantity.'},400);
   // An opaque HttpOnly cookie identifies the bag. Stock and deadlines stay on the server.
   const identity=token||[...crypto.getRandomValues(new Uint8Array(32))].map(x=>x.toString(16).padStart(2,'0')).join('');
   const result=await setQuantity(env.DB,await hashToken(identity),input.size,input.quantity,now);
   const response=json({...result.state,...(!result.ok?{error:'That quantity is no longer available. Your current selection is unchanged.'}:{})},result.ok?200:409);
   if(!token&&result.ok)response.headers.append('Set-Cookie',`spectre_hold=${identity}; Path=/api; HttpOnly; SameSite=Strict; Max-Age=86400${url.protocol==='https:'?'; Secure':''}`);
   return response;
  }catch{console.error('Spectre service request failed');return json({error:'We could not confirm this request. Please retry or enquire by email.'},url.pathname==='/api/orders'?500:503);}
 }
};

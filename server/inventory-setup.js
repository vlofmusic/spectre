// Explicit, authenticated setup for a new database. Never run this on page load.
const validSecret=value=>typeof value==='string'&&/^[a-f0-9]{64}$/i.test(value);
const json=(value,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
async function matchesSecret(actual,expected) {
 const encode=new TextEncoder();
 const [a,b]=await Promise.all([actual,expected].map(value=>crypto.subtle.digest('SHA-256',encode.encode(value))));
 const left=new Uint8Array(a),right=new Uint8Array(b);let difference=0;
 for(let i=0;i<left.length;i++)difference|=left[i]^right[i];
 return difference===0;
}
export async function initializeInventory(request,env) {
 // Missing or malformed configuration leaves this administration route unavailable.
 if(!validSecret(env.SPECTRE_SETUP_TOKEN))return json({error:'Not found'},404);
 const supplied=request.headers.get('Authorization')?.match(/^Bearer ([a-f0-9]{64})$/i)?.[1];
 if(!supplied||!await matchesSecret(supplied,env.SPECTRE_SETUP_TOKEN))return json({error:'Unauthorized'},401);
 if(request.method!=='POST')return json({error:'Method not allowed'},405);
 if(!env.DB)return json({error:'Inventory setup is unavailable.'},503);
 const attempt=crypto.randomUUID(),now=Math.floor(Date.now()/1000);
 try {
  // D1 batch is transactional. The private attempt key binds the seed to the winning
  // initialization only; later calls cannot refill sold or deliberately removed stock.
  const results=await env.DB.batch([
   env.DB.prepare(`INSERT INTO inventory_initializations(id,request_key,initialized_at)
    SELECT 'hoodie',?,? WHERE NOT EXISTS(SELECT 1 FROM inventory)
    ON CONFLICT(id) DO NOTHING`).bind(attempt,now),
   env.DB.prepare(`WITH initial(size,quantity) AS (VALUES ('XS',1),('S',2),('M',2),('L',3))
    INSERT INTO inventory(size,quantity) SELECT size,quantity FROM initial
    WHERE EXISTS(SELECT 1 FROM inventory_initializations WHERE id='hoodie' AND request_key=?)`).bind(attempt)
  ]);
  if(results[0].meta.changes!==1)return json({error:'Inventory already exists or was initialized. Nothing was changed.'},409);
  return json({initialized:true,sizes:results[1].meta.changes},201);
 }catch {
  console.error('Spectre inventory setup failed');
  return json({error:'Inventory setup could not be completed.'},503);
 }
}

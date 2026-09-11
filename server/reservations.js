export const SIZES=['XS','S','M','L'];
export const HOLD_SECONDS=30*60;
export async function hashToken(token) {
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token));
 return [...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('');
}
function snapshotStatements(db,hash,now) {
 return [
  db.prepare(`SELECT i.size, i.quantity-COALESCE((SELECT SUM(h.quantity) FROM held_items h JOIN holds r ON r.token_hash=h.token_hash WHERE h.size=i.size AND r.expires_at>?),0) AS available FROM inventory i`).bind(now),
  db.prepare(`SELECT h.size,h.quantity,r.expires_at FROM held_items h JOIN holds r ON r.token_hash=h.token_hash WHERE h.token_hash=? AND r.expires_at>?`).bind(hash,now)
 ];
}
function stateFrom(results,now) {
 const stock=results[0].results;
 if(stock.length!==SIZES.length)throw new Error('INVENTORY_NOT_INITIALISED');
 return {now:now*1000,expiresAt:(results[1].results[0]?.expires_at||0)*1000,
  available:Object.fromEntries(stock.map(row=>[row.size,Math.max(0,row.available)])),
  items:Object.fromEntries(results[1].results.map(row=>[row.size,row.quantity]))};
}
export async function readBag(db,hash,now) {return stateFrom(await db.batch(snapshotStatements(db,hash,now)),now);}
export async function setQuantity(db,hash,size,quantity,now) {
 const statements=[
  db.prepare('DELETE FROM holds WHERE expires_at<=?').bind(now),
  db.prepare('INSERT INTO holds(token_hash,expires_at) VALUES (?,?) ON CONFLICT(token_hash) DO NOTHING').bind(hash,now+HOLD_SECONDS),
  quantity===0 ? db.prepare('DELETE FROM held_items WHERE token_hash=? AND size=?').bind(hash,size) :
  db.prepare(`INSERT INTO held_items(token_hash,size,quantity)
   SELECT ?,size,? FROM inventory WHERE size=? AND quantity-COALESCE((
    SELECT SUM(h.quantity) FROM held_items h JOIN holds r ON r.token_hash=h.token_hash
    WHERE h.size=? AND h.token_hash<>? AND r.expires_at>?),0)>=?
   ON CONFLICT(token_hash,size) DO UPDATE SET quantity=excluded.quantity`).bind(hash,quantity,size,size,hash,now,quantity),
  db.prepare('DELETE FROM holds WHERE token_hash=? AND NOT EXISTS(SELECT 1 FROM held_items WHERE token_hash=?)').bind(hash,hash),
  ...snapshotStatements(db,hash,now)
 ];
 const results=await db.batch(statements);
 return {ok:quantity===0||results[2].meta.changes>0,state:stateFrom(results.slice(4),now)};
}

import { DatabaseSync } from 'node:sqlite';
import { readFileSync,readdirSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setQuantity,readBag,HOLD_SECONDS } from '../server/reservations.js';
function database(){
 const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');
 for(const file of readdirSync('drizzle').filter(x=>x.endsWith('.sql')))sql.exec(readFileSync('drizzle/'+file,'utf8'));
 sql.exec(readFileSync('db/seed-local.sql','utf8'));
 return {prepare(query){return {query,params:[],bind(...params){this.params=params;return this;}};},async batch(statements){sql.exec('BEGIN IMMEDIATE');try{const result=statements.map(({query,params})=>{const stmt=sql.prepare(query);if(query.trim().startsWith('SELECT'))return {results:stmt.all(...params),meta:{changes:0}};return {results:[],meta:{changes:Number(stmt.run(...params).changes)}};});sql.exec('COMMIT');return result;}catch(error){sql.exec('ROLLBACK');throw error;}}};
}
test('last piece can only be held by one of two concurrent shoppers',async()=>{
 const db=database();const results=await Promise.all([setQuantity(db,'shopper-a','XS',1,100),setQuantity(db,'shopper-b','XS',1,100)]);
 assert.equal(results.filter(x=>x.ok).length,1);assert.equal((await readBag(db,'',100)).available.XS,0);
 assert.equal(Object.keys((await readBag(db,'shopper-b',100)).items).length,0);
});
test('fixed 30-minute deadline survives repeat updates, expires precisely and releases stock',async()=>{
 const db=database();const first=await setQuantity(db,'a','S',1,100);assert.equal(first.state.expiresAt,(100+HOLD_SECONDS)*1000);
 const changed=await setQuantity(db,'a','S',2,300);assert.equal(changed.state.expiresAt,first.state.expiresAt);
 assert.equal((await readBag(db,'',1899)).available.S,0);const expired=await readBag(db,'a',1900);assert.deepEqual(expired.items,{});assert.equal(expired.available.S,2);
 assert.equal((await setQuantity(db,'b','S',2,1900)).ok,true);
});
test('quantity removal releases only that size, over-request preserves existing selection',async()=>{
 const db=database();await setQuantity(db,'a','S',1,100);await setQuantity(db,'a','M',1,100);
 const denied=await setQuantity(db,'a','S',3,101);assert.equal(denied.ok,false);assert.equal(denied.state.items.S,1);
 const removed=await setQuantity(db,'a','S',0,102);assert.deepEqual(removed.state.items,{M:1});assert.equal(removed.state.available.S,2);
 await setQuantity(db,'a','M',0,103);assert.equal((await readBag(db,'a',103)).expiresAt,0);
});
test('an expired bag starts a new hold only after another explicit add',async()=>{
 const db=database();await setQuantity(db,'a','L',1,100);assert.equal((await readBag(db,'a',2000)).expiresAt,0);
 const next=await setQuantity(db,'a','L',1,2001);assert.equal(next.state.expiresAt,3801000);
});

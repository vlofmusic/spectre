import { DatabaseSync } from 'node:sqlite';
import { readFileSync,readdirSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../server/worker.js';
import { readBag } from '../server/reservations.js';

// Synthetic key only. No real credentials, notifications or network are used.
const SECRET='0123456789abcdef'.repeat(4);
const request=(secret=SECRET,method='POST')=>new Request('https://spectre.example/api/admin/initialize-inventory',{
 method,headers:secret?{Authorization:`Bearer ${secret}`}:{}}
);
function fixture(t) {
 const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');
 for(const file of readdirSync('drizzle').filter(x=>x.endsWith('.sql')).sort())sql.exec(readFileSync('drizzle/'+file,'utf8'));
 t.after(()=>sql.close());
 const db={
  rows(query,...values){return sql.prepare(query).all(...values);},
  run(query,...values){return sql.prepare(query).run(...values);},
  failSeed:false,
  prepare(query){return {query,params:[],bind(...params){this.params=params;return this;}};},
  async batch(statements){
   sql.exec('BEGIN IMMEDIATE');
   try {
    const results=statements.map(({query,params})=>{
     if(db.failSeed&&query.startsWith('WITH initial'))throw new Error('Synthetic seed failure');
     const statement=sql.prepare(query);
     return query.trim().startsWith('SELECT')?{results:statement.all(...params),meta:{changes:0}}:{results:[],meta:{changes:Number(statement.run(...params).changes)}};
    });
    sql.exec('COMMIT');return results;
   }catch(error){sql.exec('ROLLBACK');throw error;}
  }
 };
 return {DB:db,SPECTRE_SETUP_TOKEN:SECRET};
}
test('setup stays unavailable without a valid configured secret and rejects unauthorized requests',async t=>{
 const env=fixture(t);
 for(const config of [{DB:env.DB},{...env,SPECTRE_SETUP_TOKEN:'short'}])assert.equal((await worker.fetch(request(),config)).status,404);
 for(const key of ['', 'f'.repeat(64), 'bad-format'])assert.equal((await worker.fetch(request(key),env)).status,401);
 assert.equal((await worker.fetch(request(SECRET,'GET'),env)).status,405);
 assert.equal(env.DB.rows('SELECT * FROM inventory').length,0);
 assert.equal(env.DB.rows('SELECT * FROM inventory_initializations').length,0);
});
test('first explicit initialization installs the owner-confirmed quantities in a new database',async t=>{
 const env=fixture(t),response=await worker.fetch(request(),env);
 assert.equal(response.status,201);
 assert.deepEqual(await response.json(),{initialized:true,sizes:4});
 assert.deepEqual((await readBag(env.DB,'',100)).available,{XS:1,S:2,M:2,L:3});
 assert.equal(env.DB.rows('SELECT * FROM inventory_initializations').length,1);
});
test('concurrent initialization attempts seed once without doubling stock',async t=>{
 const env=fixture(t);
 const responses=await Promise.all(Array.from({length:5},()=>worker.fetch(request(),env)));
 assert.equal(responses.filter(response=>response.status===201).length,1);
 assert.equal(responses.filter(response=>response.status===409).length,4);
 assert.deepEqual((await readBag(env.DB,'',100)).available,{XS:1,S:2,M:2,L:3});
 assert.equal(env.DB.rows('SELECT * FROM inventory_initializations').length,1);
});
test('any existing inventory prevents setup, including partial inventory and zero stock',async t=>{
 const env=fixture(t);env.DB.run("INSERT INTO inventory(size,quantity) VALUES ('XS',0)");
 assert.equal((await worker.fetch(request(),env)).status,409);
 assert.deepEqual(env.DB.rows('SELECT size,quantity FROM inventory').map(row=>({...row})),[{size:'XS',quantity:0}]);
 assert.equal(env.DB.rows('SELECT * FROM inventory_initializations').length,0);
});
test('setup never refills sold or deleted stock, even if all inventory rows are later removed',async t=>{
 const env=fixture(t);await worker.fetch(request(),env);
 env.DB.run("UPDATE inventory SET quantity=0 WHERE size='XS'");
 env.DB.run("DELETE FROM inventory WHERE size='S'");
 assert.equal((await worker.fetch(request(),env)).status,409);
 assert.equal(env.DB.rows("SELECT quantity FROM inventory WHERE size='XS'")[0].quantity,0);
 assert.equal(env.DB.rows("SELECT * FROM inventory WHERE size='S'").length,0);
 env.DB.run('DELETE FROM inventory');
 assert.equal((await worker.fetch(request(),env)).status,409);
 assert.equal(env.DB.rows('SELECT * FROM inventory').length,0);
});
test('failed seed transaction rolls back its marker so a later explicit retry can succeed',async t=>{
 const env=fixture(t);env.DB.failSeed=true;
 t.mock.method(console,'error',()=>{});
 assert.equal((await worker.fetch(request(),env)).status,503);
 assert.equal(env.DB.rows('SELECT * FROM inventory').length,0);
 assert.equal(env.DB.rows('SELECT * FROM inventory_initializations').length,0);
 env.DB.failSeed=false;
 assert.equal((await worker.fetch(request(),env)).status,201);
});

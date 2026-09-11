import assert from 'node:assert/strict';
const base='http://127.0.0.1:8000';
const send=(data,cookie='')=>fetch(base+'/api/bag',{method:'POST',headers:{Origin:base,'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify(data)});
const initial=await (await fetch(base+'/api/bag')).json();
assert.equal(initial.available.XS,1,'Run this check only with the local XS stock free.');
const responses=await Promise.all([send({size:'XS',quantity:1}),send({size:'XS',quantity:1})]);
const winner=responses.find(x=>x.status===200);assert.ok(winner);assert.equal(responses.filter(x=>x.status===409).length,1);
const cookie=winner.headers.get('set-cookie').split(';')[0];
try{
 const first=await winner.json();assert.equal(first.expiresAt-first.now,1800000);
 const stock=await (await fetch(base+'/api/bag')).json();assert.equal(stock.available.XS,0);assert.deepEqual(stock.items,{});
 const again=await (await send({size:'XS',quantity:1},cookie)).json();assert.equal(again.expiresAt,first.expiresAt);
 assert.equal((await send({size:'XXL',quantity:1})).status,400);
 assert.equal((await send({size:'L',quantity:-1})).status,400);
 assert.equal((await fetch(base+'/api/bag',{method:'POST',headers:{Origin:'https://example.invalid','Content-Type':'application/json'},body:'{}'})).status,403);
 console.log('PASS: real local D1 race, fixed deadline, shared availability, cookie isolation, input and origin validation.');
}finally{assert.equal((await send({size:'XS',quantity:0},cookie)).status,200);}

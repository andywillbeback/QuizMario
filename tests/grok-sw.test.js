const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const source=fs.readFileSync(__dirname+'/../grok/sw.js','utf8');
async function harness(fetcher,hit) {
 const events={},timers=new Map(),deleted=[];let id=0,puts=0;
 const cache={add:async()=>{},put:async()=>{puts++},match:async()=>hit};
 const ctx={URL,Response,AbortController,Promise,Error,
  setTimeout(fn){timers.set(++id,fn);return id},clearTimeout(n){timers.delete(n)},fetch:fetcher,
  caches:{open:async()=>cache,keys:async()=>['juguang-shell-v1','juguang-shell-20261104-auth','juguang-shell-20261108-sync3','juguang-shell-20261109-ielts1','juguang-shell-20261109-login1','another-app-cache'],delete:async n=>deleted.push(n)},
  self:{location:{origin:'https://example.test'},addEventListener:(name,fn)=>events[name]=fn,skipWaiting:async()=>{},clients:{claim:async()=>{}}}};
 vm.runInNewContext(source,ctx);
 return {events,timers,deleted,get puts(){return puts},fetch(url='https://example.test/QuizMario/grok/login.html?v=x'){
  let result;events.fetch({request:{url,method:'GET'},respondWith(p){result=p}});return result;
 }};
}
test('a hanging network returns cached shell at its deadline',async()=>{
 const h=await harness(()=>new Promise(()=>{}),new Response('cached'));
 const p=h.fetch();for(const fn of h.timers.values())fn();
 assert.equal(await (await p).text(),'cached');
});
test('normal network responses remain fresh',async()=>{
 const r=new Response('fresh');Object.defineProperty(r,'type',{value:'basic'});
 const h=await harness(async()=>r,new Response('cached'));
 assert.equal(await (await h.fetch()).text(),'fresh');
 assert.equal(h.timers.size,0);
});
test('offline without cache returns an actionable 503 page',async()=>{
 const h=await harness(async()=>{throw Error('offline')});const r=await h.fetch();
 assert.equal(r.status,503);assert.match(await r.text(),/恢复网络/);
});
test('activation preserves unrelated app caches',async()=>{
 const h=await harness(async()=>new Response('ok'));let p;
 h.events.activate({waitUntil(x){p=x}});await p;
 assert.deepEqual(h.deleted,['juguang-shell-v1','juguang-shell-20261104-auth','juguang-shell-20261108-sync3','juguang-shell-20261109-ielts1']);
});
test('the service worker never intercepts auth requests',async()=>{
 const h=await harness(async()=>{throw Error('must not fetch')});
 assert.equal(h.fetch('https://project.supabase.co/auth/v1/health'),undefined);
});

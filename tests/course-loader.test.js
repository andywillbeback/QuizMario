'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {webcrypto}=require('node:crypto'),test=require('node:test');
const create=require('../grok/course-loader.js'),root=path.join(__dirname,'../grok');
const original={window:{}};
for(const file of ['words.js','tracks.js','exam-tracks.js'])vm.runInNewContext(fs.readFileSync(path.join(root,file),'utf8'),original);
const publicMeta={window:{}};vm.runInNewContext(fs.readFileSync(path.join(root,'course-catalog.js'),'utf8'),publicMeta);
const metadata=JSON.parse(JSON.stringify(publicMeta.window.QM_COURSE_CATALOG));
function setup(fetcher){
  const requests=[],events=[];
  const host={QM_COURSE_CATALOG:metadata,crypto:webcrypto,TextEncoder,AbortController,setTimeout,clearTimeout,
    CustomEvent:class{constructor(type,args){this.type=type;this.detail=args.detail}},dispatchEvent:e=>events.push(e),
    fetch:async(url,opts)=>{requests.push(url);return fetcher?fetcher(url,opts):{ok:true,text:async()=>fs.readFileSync(path.join(root,url),'utf8')}}};
  return{host,requests,events,api:create(host)};
}
test('all repackaged public cards and case-sensitive identities exactly match the source banks',async()=>{
  const h=setup();assert.equal(h.requests.length,0,'entry must not fetch a full word bank');
  for(const meta of metadata){
    const track=await h.api.ensure(meta.id);
    const source=original.window.VOCAB_TRACKS.find(t=>t.id===meta.id);
    const sets=meta.id==='core'?original.window.VOCAB_LEVELS:source.sets;
    assert.deepEqual(JSON.parse(JSON.stringify(track.sets)),JSON.parse(JSON.stringify(sets)));
    assert.deepEqual(track.sets.map(set=>set.map(card=>card.word)),meta.card_index);
  }
});
test('only the chosen course downloads, concurrent requests coalesce and subsequent opens reuse it',async()=>{
  const h=setup();const a=h.api.ensure('gaokao'),b=h.api.ensure('gaokao');assert.equal(a,b);
  await a;await h.api.ensure('gaokao');assert.equal(h.requests.length,1);
  assert(h.host.VOCAB_TRACKS.find(t=>t.id==='gaokao').loaded);
  assert(h.host.VOCAB_TRACKS.filter(t=>t.id!=='gaokao').every(t=>!t.loaded));
  assert.equal(h.events[0].detail.id,'gaokao');
});
test('tampered content fails closed and a fresh request can recover',async()=>{
  let bad=true;const h=setup(async url=>({ok:true,text:async()=>bad?'{}':fs.readFileSync(path.join(root,url),'utf8')}));
  await assert.rejects(h.api.ensure('zhongkao'),/校验失败/);
  assert.equal(h.host.VOCAB_TRACKS.find(t=>t.id==='zhongkao').loaded,false);
  bad=false;await h.api.ensure('zhongkao');assert.equal(h.requests.length,2);
});
test('missing or broken content is retryable and does not fall back to another course',async()=>{
  const h=setup(async()=>({ok:false}));await assert.rejects(h.api.ensure('core'),/无法读取/);
  await assert.rejects(h.api.ensure('missing'),/未找到/);assert(h.host.VOCAB_TRACKS.every(t=>!t.loaded));
  assert.equal(h.host.VOCAB_LEVELS.length,0);
});
test('initial vocabulary dependency bytes fall by at least 90 percent without removing source banks',()=>{
  const before=['words.js','tracks.js','exam-tracks.js'].reduce((n,f)=>n+fs.statSync(path.join(root,f)).size,0);
  const after=['course-catalog.js','course-loader.js'].reduce((n,f)=>n+fs.statSync(path.join(root,f)).size,0);
  assert(after<before*.1);
  const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
  assert(!/src="(?:words|tracks|exam-tracks)\.js"/.test(html));
  console.log(JSON.stringify({metric:'initial uncompressed vocabulary dependencies, not end-to-end latency',before_bytes:before,after_bytes:after,reduction_percent:+((1-after/before)*100).toFixed(2)}));
});

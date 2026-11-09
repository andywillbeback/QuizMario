'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
const bank=require('../grok/data/ielts-v1/bank.json');
const coverage=require('../grok/data/ielts-v1/coverage.json');
const lists=require('../grok/data/ielts-v1/headwords.json');
const create=require('../grok/ielts-loader');
const cloze=require('../grok/cloze'),sense=require('../grok/sense-id'),related=require('../grok/related-links');
const poly=require('../grok/polysemy'),metrics=require('../grok/study-metrics'),core=require('../grok/sync-core');
const cards=bank.sets.flat(),byWord=new Map(cards.map(c=>[c.word,c]));
const token=w=>/^(May|March|Miss|China|WHO|US)$/.test(w)?w:w.toLowerCase();
assert.equal(cards.length,bank.entry_count);
assert.equal(new Set(cards.map(c=>token(c.word))).size,cards.length,'every released entry has a unique sense-safe surface');
assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'grok/data/ielts-v1/bank.json'))).digest('hex'),coverage.bank_sha256);
assert.equal(bank.word_count,7972);assert.equal(bank.phrase_count,3076);
assert.equal(bank.sets.length,224);assert.equal(bank.titles.length,224);
const frozenIds=bank.sets.flatMap((group,i)=>group.map(c=>i+'::'+c.word));
assert.equal(crypto.createHash('sha256').update(frozenIds.join('\n')).digest('hex'),'fbd8dc74f72a9f955b87e45ed25a4a79e4e7f23894a05ec3a8128062b1431b2a',
  'v1 unit/word identifiers are frozen; changes need an explicit append or migration policy');
for(const group of bank.sets)assert.ok(group.length>0&&group.length<=50);
for(const [name,list] of Object.entries(lists)){
  if(!Array.isArray(list))continue;
  const published=new Set(cards.map(c=>token(c.word)));
  for(const w of list)assert.ok(published.has(token(lists.source_aliases[w]||w)),name+': '+w);
}
const index=related.indexTrack(bank.sets);let linked=0,polyCount=0;
for(const c of cards){
  for(const field of ['word','pos','meaning_zh','example_en','example_zh','source'])assert.ok(typeof c[field]==='string'&&c[field].trim(),c.word+': '+field);
  assert.ok(cloze.containsToken(c.example_en,c.word),'example must contain a complete answer span: '+c.word);
  assert.ok(cloze.blankExample(c.example_en,c.word).includes('___'),'answer can be concealed: '+c.word);
  assert.ok(!cloze.isPlaceholderExample(c.example_en),c.word);
  assert.ok(!/[<>]/.test(c.word+c.meaning_zh),c.word);
  if(c.pos!=='phr.')assert.ok(c.ipa,'word pronunciation shown: '+c.word);
  if(c.related)for(const w of c.related)assert.ok(related.lookup(index,w),'related entry exists: '+c.word+' -> '+w);
  if(c.pos!=='phr.'&&related.primaryCollocation(c,index))linked++;
  if(c.polysemy){
    const item=poly.optionSet(c);assert.ok(item,c.word+' valid anchored polysemy');
    assert.equal(new Set(item.options).size,4);assert.equal(item.correct,c.meaning_zh);polyCount++;
  }
}
assert.ok(linked>1800,'collocations actually participate in the shared gate');
assert.ok(polyCount>=18,'reviewed starter polysemy items are usable');
assert.ok(poly.isPolysemyTrack('ielts'));
assert.notEqual(sense.cardKeyFor('ielts',0,'May'),sense.cardKeyFor('ielts',0,'may'));
assert.notEqual(sense.cardKeyFor('ielts',0,'bank'),sense.cardKeyFor('gaokao',0,'bank'));
assert.deepEqual(byWord.get('cheque').accepted_spellings,['check']);
assert.ok(byWord.get('analyse').accepted_spellings.includes('analyze'));
assert.equal(byWord.get('volume').meaning_zh,'体积；总量');
assert.ok(byWord.get('volume').example_en.includes('water'));

// Real report calculations/export retain IELTS evidence and student ownership.
const now=new Date('2026-11-09T08:00:00Z');
function progress(id,track,wrong){return{user_id:id,updated_at:now.toISOString(),save:{track:'zhongkao',profile:{name:id,cls:'虚构验收班'},cards:{[track+'|0::bank']:{state:'learning',correct:1,wrong,reps:1,mastery:.5}},wrongBook:{[track+'::bank']:{active:true,lemma:'bank',track,gloss_zh:id==='ielts-fixture'?'银行':'本人的不同释义'}}}};}
const a=progress('ielts-fixture','ielts',2),b=progress('school-fixture','gaokao',9);
const board=metrics.buildBoard([a,b],[],[],now),reversed=metrics.buildBoard([b,a],[],[],now);
const student=board.students.find(s=>s.id==='ielts-fixture');
assert.equal(student.trackLabel,'雅思','stale saved 中考 selection cannot relabel IELTS work');
assert.deepEqual(student.weak,reversed.students.find(s=>s.id===student.id).weak);
assert.equal(student.weak[0].score,2);assert.equal(student.weak[0].gloss,'银行');
const html=metrics.studentReportHtml(student,'2026-11-09');
assert.ok(html.includes(student.summary)&&html.includes('雅思'));
assert.ok(!html.includes('正在使用中考'));
const reconciled=core.reconcile({cards:{}},a.save,b.save);
assert.ok(reconciled.cards['ielts|0::bank']&&reconciled.cards['gaokao|0::bank'],'track keys survive reconciliation');

(async()=>{
  let calls=0,reply,fail=false;
  const host={VOCAB_TRACKS:[{id:'zhongkao'},{id:'gaokao'},{id:'core'}],setTimeout,clearTimeout,
    fetch:()=>{calls++;return new Promise(r=>{reply=()=>r({ok:!fail,json:async()=>bank});});}};
  const loader=create(host);
  assert.equal(calls,0,'school entry does not download IELTS');
  assert.deepEqual(host.VOCAB_TRACKS.map(t=>t.id),['zhongkao','gaokao','ielts','core']);
  const one=loader.ensure(),two=loader.ensure();assert.equal(one,two,'one in-flight bank download');
  await Promise.resolve();assert.equal(calls,1);reply();await one;
  assert.equal(loader.track.sets.length,224);await loader.ensure();assert.equal(calls,1,'reuse the immutable loaded content');
  const retry=create({VOCAB_TRACKS:[],setTimeout,clearTimeout,fetch:async()=>({ok:!fail,json:async()=>bank})});
  fail=true;await assert.rejects(retry.ensure(),/无法读取/);assert.equal(retry.track.loaded,false);assert.equal(retry.track.sets.length,0);
  fail=false;await retry.ensure();assert.equal(retry.track.loaded,true,'failed downloads can be retried');
  const invalid={...bank,entry_count:bank.entry_count+1};assert.throws(()=>loader.validate(invalid),/数量/);
  console.log('ielts-bank ok: '+bank.word_count+' headwords, '+bank.phrase_count+' phrases, '+linked+' linked heads, '+polyCount+' polysemy items');
})().catch(e=>{console.error(e);process.exitCode=1;});

/* Current universe contract: exact units, evidence, completion and live updates. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const related=require('../grok/related-links'),sense=require('../grok/sense-id');
const progress=require('../grok/universe-progress'),srs=require('../grok/srs-rules'),practice=require('../grok/practice');
const u=require('../grok/word-universe');
const tracks=[{id:'gaokao',name:'高考',sets:[
 [{word:'advantage',meaning_zh:'优势',pos:'n.',related:['take advantage of']},{word:'life',meaning_zh:'生活',pos:'n.'}],
 [{word:'take advantage of',meaning_zh:'利用',pos:'verb_phrase',related:['take','advantage']}],
 [{word:'May',meaning_zh:'五月',pos:'n.'},{word:'may',meaning_zh:'可能',pos:'modal'}]
]}];
const now=Date.parse('2026-11-04T10:00:00Z');
const graph=(save,set=1,extra={})=>u.buildGraph({tracks,trackId:'gaokao',set,save,cap:1,...extra});
const adv=save=>graph(save).lemmas.find(n=>n.word==='advantage');
let count=0;function check(name,f){f();count++;console.log('ok',name)}
check('registration is persistent, per-track, idempotent, and never awards mastery',()=>{
 const save={cards:{}};for(const [t,n]of [['gaokao',1],['gaokao',1],['gaokao',2],['zhongkao',3]])progress.recordCompleted(save,t,n,now);
 assert.deepEqual(progress.completedSets(save,'gaokao'),[1,2]);assert.deepEqual(progress.completedSets(save,'zhongkao'),[3]);
 assert.ok(graph(save,null,{cap:52}).lemmas.every(n=>!n.scored));
 assert.deepEqual(progress.completedSets(JSON.parse(JSON.stringify(save)),'gaokao'),[1,2]);
 assert.deepEqual(progress.completedSets({track:'gaokao',levelStars:{2:1},trackStars:{gaokao:{1:2}}},'gaokao'),[1,2]);
});
check('exact unit is not truncated; phrase-only units never borrow example words',()=>{
 assert.deepEqual(graph({cards:{}}).lemmas.map(n=>n.word).sort(),['advantage','life']);
 assert.deepEqual(graph({cards:{}},2).lemmas.map(n=>n.word),['take advantage of']);assert.equal(graph({cards:{}},99).lemmas.length,0);
});
check('unknown differs from observed zero',()=>{
 const p=srs.defaultCardProg(),save={cards:{'gaokao|0::advantage':p}};assert.equal(adv(save).scored,false);
 srs.schedule(p,0,now,{outcome:'wrong'});assert.equal(adv(save).scored,true);assert.equal(adv(save).mastery,0);
 assert.notEqual(u.visualOf(u.themeOf('life'),null,false).hex,adv(save).visual.hex);
});
check('current unit wins; overview uses latest same-track evidence, never highest',()=>{
 const save={cards:{'gaokao|0::life':{state:'learning',wrong:1,mastery:0,scheduledAt:now},'gaokao|9::life':{state:'review',mastery:3,reps:4,scheduledAt:now-1},'zhongkao|0::life':{state:'review',mastery:3,reps:4,scheduledAt:now+1}}};
 assert.equal(graph(save).lemmas.find(n=>n.word==='life').mastery,0);assert.equal(progress.itemState(save,'gaokao','life',null).score,0);
});
check('May and may preserve distinct identities and categories',()=>{
 const g=graph({cards:{'gaokao|2::may:month':{state:'review',mastery:3,reps:4}}},3);
 assert.equal(g.lemmas.length,2);assert.equal(g.lemmas.find(n=>n.word==='May').themeId,'time');
 assert.equal(g.lemmas.find(n=>n.word==='may').themeId,'function');assert.equal(g.lemmas.find(n=>n.word==='may').scored,false);
});
check('missing or weak collocation blocks mastered; assisted retry never erases a miss',()=>{
 const save={cards:{'gaokao|0::advantage':{state:'review',mastery:3,reps:4,scheduledAt:now}}};
 assert.equal(adv(save).evidence.collocationPending,true);assert.ok(adv(save).mastery<3);
 const note=(outcome,t,extra={})=>progress.recordCollocation(save,{track:'gaokao',levelIdx:1,word:'take advantage of',outcome,now:t,...extra});
 note('wrong',now+1);assert.equal(adv(save).mastery,0);
 note('correct',now+2,{firstTry:false,hintSeen:true});assert.equal(adv(save).mastery,0);
 note('correct',now+100,{firstTry:true});note('correct',now+86400000,{firstTry:true});assert.equal(adv(save).mastery,3);
 note('wrong',now+86400001);assert.ok(adv(save).mastery<3);
});
check('spelling and polysemy change colour without changing SRS; spelling alone is not overall mastery',()=>{
 const p={state:'review',mastery:3,reps:4,due:123,scheduledAt:now};practice.noteSpelling(p,'wrong',now+1,{mode:'typed'});
 assert.equal(p.mastery,3);assert.equal(p.due,123);assert.equal(graph({cards:{'gaokao|0::life':p}}).lemmas.find(n=>n.word==='life').mastery,0);
 const q={state:'review',mastery:3,reps:4,scheduledAt:now};practice.notePolysemy(q,'wrong',now+2);
 assert.equal(graph({cards:{'gaokao|0::life':q}}).lemmas.find(n=>n.word==='life').mastery,0);
 const only={spelling:{typed:{correct:2,streak:2,lastAt:now},lastAt:now}};
 assert.ok(graph({cards:{'gaokao|0::life':only}}).lemmas.find(n=>n.word==='life').mastery<3);
});
check('overview pagination retains every completed-unit entry',()=>{
 const save={cards:{}};progress.recordCompleted(save,'gaokao',1,now);progress.recordCompleted(save,'gaokao',2,now);
 const first=graph(save,null,{cap:1}),words=[];for(let page=0;page<first.stats.pages;page++)words.push(...graph(save,null,{cap:1,page}).lemmas.map(n=>n.word));
 assert.deepEqual(words.sort(),['advantage','life','take advantage of']);
});
check('all 372 units are complete and classified, including 22 phrase-only exam units',()=>{
 const ctx={window:{}};vm.createContext(ctx);
 for(const p of ['words','tracks','exam-tracks'])vm.runInContext(read('grok/'+p+'.js'),ctx);
 const all=ctx.window.VOCAB_TRACKS.map(t=>t.id==='core'?{...t,sets:ctx.window.VOCAB_LEVELS}:t);
 let units=0,phrases=0;
 for(const track of all)for(let i=0;i<track.sets.length;i++){
  const expected=[...new Set(track.sets[i].map(c=>sense.senseId(c.word)))].sort();
  const g=u.buildGraph({tracks:all,trackId:track.id,set:i+1,save:{cards:{}},cap:1});
  assert.deepEqual(g.lemmas.map(n=>n.key).sort(),expected,track.id+'/'+(i+1));assert.equal(g.themes.reduce((n,t)=>n+t.count,0),expected.length);
  assert.ok(g.lemmas.every(n=>n.category&&g.themes.some(t=>t.id===n.themeId)));
  if(['zhongkao','gaokao'].includes(track.id)&&track.sets[i].every(c=>u.isPhrase(c.word)))phrases++;units++;
 }assert.equal(units,372);assert.equal(phrases,22);
});
check('gate failures persist and emit phrase-specific events before retry',()=>{
 const source=read('grok/game.js'),gate=related.createCollocGate(),card={...tracks[0].sets[0][0],key:'gaokao|0::advantage'};
 gate.onLemmaCorrect(card,related.indexTrack(tracks[0].sets),'meaning');const events=[],save={cards:{[card.key]:{state:'review',mastery:3,reps:4}}};let writes=0;
 const ctx={UniverseProgress:progress,save,currentTrack:'gaokao',currentCard:card,collocFlow:gate,collocGateRetries:0,awaiting:false,pendingRate:false,Practice:practice,sessionKind:'level',sessionDirection:'meaning',showCollocRetry(){},
 learnerEvents(){return{TYPES:{WRONG:'vocab.answer_wrong',CORRECT:'vocab.answer_correct'},record(x){events.push(x)}}},persist(){writes++}};vm.createContext(ctx);
 const grade=source.slice(source.indexOf('  function grade(correct,'),source.indexOf('  function confirmCorrect('));
 const record=source.slice(source.indexOf('  function recordCollocationAnswer('),source.indexOf('  function bindCollocFlow('));
 ctx.rememberMiss=()=>{};vm.runInContext(record+grade+'\ngrade(false,false,"wrong","wrong");grade(false,false,"wrong","wrong");',ctx);
 assert.equal(events.length,2);assert.equal(events[0].headword,'take advantage of');assert.equal(save.cards['gaokao|1::take advantage of'].collocationEvidence.wrong,2);
 assert.equal(save.cards[card.key].mastery,3);assert.equal(writes,2);assert.equal(adv(save).mastery,0);
});
function runtime(storage){
 class El{constructor(){this.attrs={};this.listeners={};this.style={};this.textContent='';this.innerHTML='';this.value=''}getAttribute(k){return this.attrs[k]||null}setAttribute(k,v){this.attrs[k]=v}addEventListener(k,f){(this.listeners[k]||=[]).push(f)}dispatch(e){for(const f of this.listeners[e.type]||[])f(e)}}
 const ids={};for(const id of ['universe-root','universe-status','universe-title','universe-detail','universe-legend','universe-set','universe-track','universe-prev','universe-next','universe-page','universe-view'])ids[id]=new El;
 const document=new El;document.getElementById=id=>ids[id]||null;document.visibilityState='visible';const ctx=new El,timers=[];
 Object.assign(ctx,{document,URL,VOCAB_EXAM_TRACKS:tracks,location:{search:'?track=gaokao&set=1',href:'https://example.test/grok/word-universe.html?track=gaokao&set=1',assign(){}},localStorage:{getItem(k){return storage[k]||null}},setInterval(f){timers.push(f);return timers.length},clearInterval(){}});
 ctx.QuizMarioAccountStore={get:k=>storage[k]||null};ctx.window=ctx;vm.createContext(ctx);for(const file of ['sense-id.js','related-links.js','universe-progress.js','word-universe.js'])vm.runInContext(read('grok/'+file),ctx,{filename:file});return{ctx,ids,timers};
}
check('no-WebGL list is complete and live on storage, same-page polling and page restore',()=>{
 const storage={};const set=n=>storage.vocabSpotlight_v1=JSON.stringify({cards:{'gaokao|0::life':{state:'learning',mastery:n,reps:1,scheduledAt:now+n}}});set(.5);
 const {ctx,ids,timers}=runtime(storage),get=()=>ctx.QuizMarioWordUniverse.currentGraph().lemmas.find(n=>n.word==='life');
 assert.equal(get().mastery,.5);assert.ok(ids['universe-root'].innerHTML.includes('advantage'));
 const markup=ids['universe-root'].innerHTML,graph=ctx.QuizMarioWordUniverse.currentGraph();
 assert.equal((markup.match(/class="word-record"/g)||[]).length,graph.lemmas.length,'each exact-unit word remains an expandable row');
 const counts=[...markup.matchAll(/class="count-(?:mastered|learning|collocation|unseen)"><b>(\d+)/g)].map(m=>Number(m[1]));
 assert.equal(counts.length,4);assert.equal(counts.reduce((a,b)=>a+b,0),graph.lemmas.length,'overview statuses are disjoint and exhaustive');
 assert.equal((markup.match(/data-category-jump=/g)||[]).length,graph.themes.length,'every populated category has a jump control');
 set(1);ctx.dispatch({type:'storage',key:'vocabSpotlight_v1:account:test-user'});assert.equal(get().mastery,1);
 set(0);timers[0]();assert.equal(get().mastery,0);set(2);ctx.dispatch({type:'pageshow'});assert.equal(get().mastery,2);
});
check('backup round-trip preserves completed-unit registry and completion saves it before opening',()=>{
 const source=read('grok/game.js'),extend=source.slice(source.indexOf('  function extendSave('),source.indexOf('  function defaultCardProg('));
 const snapshot=source.slice(source.indexOf('  function snapshotToSave('),source.indexOf('  function applySaveObject('));
 const payload={track:'gaokao',cards:{},universeCompletedSets:{gaokao:{1:'2026-11-04T10:00:00Z'}}};
 const ctx={UniverseProgress:progress,Sense:sense,normalizeMustPractice:x=>x||{},catalogGroups:()=>[],migrateCard:x=>x,payload};vm.createContext(ctx);vm.runInContext(extend+snapshot+'\nresult=snapshotToSave(payload);',ctx);
 assert.deepEqual(JSON.parse(JSON.stringify(ctx.result.universeCompletedSets)),payload.universeCompletedSets);
 const clear=source.slice(source.indexOf('  function onLevelClear('),source.indexOf('  function clearedSetUniverseHref('));
 assert.ok(clear.indexOf('UniverseProgress.recordCompleted')>=0);assert.ok(clear.indexOf('UniverseProgress.recordCompleted')<clear.indexOf('persist();'));
});
console.log('word-universe ok:',count,'scenario groups, all 372 units checked');

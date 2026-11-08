'use strict';
const assert=require('assert'),fs=require('fs'),vm=require('vm'),crypto=require('crypto');
const createStore=require('../grok/account-store');
const core=require('../grok/sync-core');
const clone=v=>v===undefined?undefined:JSON.parse(JSON.stringify(v));
function storage(){const m=new Map();return{getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k),key:i=>Array.from(m.keys())[i]||null,get length(){return m.size;},_m:m};}
function save(n=0,name='甲同学'){return{profile:{name,cls:'测试班'},track:'gaokao',points:n,updatedAt:'2026-11-08T00:00:00Z',cards:{'gaokao|0::apple':{state:'learning',correct:n,wrong:0,unknown:0,reps:n,mastery:1}},daily:{'2026-11-08':{c:n,w:0,unk:0}},studyDaily:{'2026-11-08':n*1000}};}
function deferred(){let resolve;return{promise:new Promise(r=>{resolve=r;}),resolve:v=>resolve(v)};}
async function settle(){for(let i=0;i<60;i++)await Promise.resolve();}
function browser({id='A',disk=storage(),db={},now=Date.parse('2026-11-08T01:00:00Z'),events=false}={}){
  let current=id,revision=0,tick=now,nextTimer=1,authHandler=null,redirect='',state=save(),beforeUpdate=null,failUpdates=0,loseAck=0,holdUpdate=null;
  const timers=new Map(),calls=[],eventDB=new Map(),elements={};
  const listeners={},docListeners={},classes=new Set();
  disk.setItem('quizmario-auth',JSON.stringify({user:{id:current}}));
  function q(table){const f={table,op:'read',filters:[],body:null};const out={
    select(){return out;},eq(k,v){f.filters.push([k,v]);return out;},order(){return out;},limit(){return out;},
    maybeSingle(){return out;},abortSignal(){return out;},insert(v){f.op='insert';f.body=clone(v);return out;},
    update(v){f.op='update';f.body=clone(v);return out;},upsert(v){f.op='upsert';f.body=clone(v);return out;},
    then(a,b){return run().then(a,b);},
  };async function run(){
    const sentAs=current;calls.push({table,op:f.op,as:sentAs,body:clone(f.body),filters:clone(f.filters)});
    if(table==='learner_events'){
      if(f.op==='read')return{data:Array.from(eventDB.values()).filter(e=>e.learner_id===sentAs)};
      for(const e of f.body){if(e.learner_id!==sentAs || e.user_id!==sentAs)return{error:{code:'42501',message:'RLS'}};if(!eventDB.has(e.event_id))eventDB.set(e.event_id,clone(e));}return{data:null};
    }
    const owner=f.body&&f.body.user_id || (f.filters.find(x=>x[0]==='user_id')||[])[1];
    if(owner!==sentAs)return{error:{code:'42501',message:'RLS'}};
    if(f.op==='read')return{data:clone(db[owner]||null)};
    if(beforeUpdate){const cb=beforeUpdate;beforeUpdate=null;cb(db,owner);}
    if(failUpdates){failUpdates--;return{error:{message:'offline failure'}};}
    if(holdUpdate){const h=holdUpdate;holdUpdate=null;await h.promise;}
    const expected=(f.filters.find(x=>x[0]==='updated_at')||[])[1];
    if(f.op==='insert'&&db[owner])return{error:{code:'23505'}};
    if(f.op==='update'&&(!db[owner]||db[owner].updated_at!==expected))return{data:null};
    db[owner]={save:clone(f.body.save),updated_at:new Date(tick+(++revision)).toISOString()};
    if(loseAck){loseAck--;return{error:{message:'response lost after commit'}};}
    return{data:clone(db[owner])};
  }return out;}
  const client={from:q,auth:{getSession:async()=>({data:{session:current?{user:{id:current,email:current+'@example.test'}}:null}}),signOut:async()=>{current=null;},onAuthStateChange:fn=>{authHandler=fn;}}};
  function getElementById(id){if(id==='auth-hold')return elements[id]||(elements[id]={textContent:''});if(['sync-status','login-link','login-cta','btn-logout','wipe-label'].includes(id))return elements[id]||(elements[id]={textContent:'',hidden:false,classList:{toggle(){}},addEventListener(){}});return null;}
  class ClockDate extends Date{constructor(...args){super(...(args.length?args:[tick]));}static now(){return tick;}}
  const context={console:{warn(){}},Date:ClockDate,crypto,AbortController,URL,Blob,Promise,Math,JSON,Set,Number,Array,Object,Intl,
    localStorage:disk,navigator:{onLine:true},location:{search:'',hash:'',replace:v=>{redirect=v;}},
    setTimeout:(fn,ms=0)=>{const key=nextTimer++;timers.set(key,{fn,at:tick+ms});return key;},clearTimeout:key=>timers.delete(key),
    setInterval:(fn,ms)=>{const key=nextTimer++;timers.set(key,{fn,at:tick+ms,repeat:ms});return key;},clearInterval:key=>timers.delete(key),
    CustomEvent:function(type){this.type=type;},addEventListener:(type,fn)=>(listeners[type]||(listeners[type]=[])).push(fn),
    dispatchEvent:e=>{for(const fn of listeners[e.type]||[])fn(e);},
    document:{visibilityState:'visible',getElementById,documentElement:{classList:{add:k=>classes.add(k),remove:k=>classes.delete(k),contains:k=>classes.has(k)}},addEventListener:(type,fn)=>(docListeners[type]||(docListeners[type]=[])).push(fn)},
    QuizMarioCloudClient:{client:()=>client,isConfigured:()=>true},
    __QM:{getSave:()=>state,applyCloudSave:v=>{state=clone(v);},applySyncedSave:v=>{state=clone(v);},onSessionReady(){},setProfile(){}},
  };
  context.window=context;vm.createContext(context);
  for(const file of ['account-store.js','sync-core.js',...(events?['learner-events.js']:[]),'sync.js'])vm.runInContext(fs.readFileSync(require('path').join(__dirname,'../grok',file),'utf8'),context,{filename:file});
  return{ctx:context,db,disk,calls,eventDB,timers,classes,elements,
    get state(){return state;},get redirect(){return redirect;},
    edit(fn){fn(state);state.updatedAt=new Date(++tick).toISOString();context.QuizMarioCloud.onLocalSave(state);},
    fail(n){failUpdates=n;},lostAck(){loseAck=1;},hold(d){holdUpdate=d;},conflict(fn){beforeUpdate=fn;},
    async advance(ms){const end=tick+ms;for(let i=0;i<10000;i++){let entry=[...timers].filter(([,v])=>v.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!entry)break;tick=entry[1].at;timers.delete(entry[0]);if(entry[1].repeat)timers.set(entry[0],{...entry[1],at:tick+entry[1].repeat});entry[1].fn();await settle();}tick=end;await settle();},
    async switchTo(next){current=next;disk.setItem('quizmario-auth',JSON.stringify({user:{id:next}}));if(authHandler)authHandler('SIGNED_IN',{user:{id:next}});await settle();},
    async online(v){context.navigator.onLine=v;context.dispatchEvent({type:v?'online':'offline'});await settle();},
  };
}
(async()=>{
  const disk=storage();disk.setItem('vocabSpotlight_v1',JSON.stringify(save(99,'另一个账号')));
  const owned=createStore(disk);owned.activate('A');assert.strictEqual(owned.get('vocabSpotlight_v1'),null,'unowned legacy save cannot be adopted');owned.set('vocabSpotlight_v1','A');owned.activate('B');assert.strictEqual(owned.get('vocabSpotlight_v1'),null);owned.set('vocabSpotlight_v1','B');owned.activate('A');assert.strictEqual(owned.get('vocabSpotlight_v1'),'A');
  const blank={cards:{a:{state:'new',correct:0,wrong:0,unknown:0,mastery:0},b:{state:'new',collocationEvidence:{wrong:1}}}};
  assert.deepStrictEqual(Object.keys(core.compact(blank).cards),['b'],'only exact default cards are omitted');
  const base=save(10),left=save(11),right=save(12);assert.strictEqual(core.reconcile(base,left,right).daily['2026-11-08'].c,13,'independent concurrent increments survive');
  const b=browser({disk,db:{A:{save:save(2),updated_at:'v0'},B:{save:save(7,'乙同学'),updated_at:'v0'}}});await settle();assert.strictEqual(b.state.points,2);assert.ok(b.classes.has('session-ok'));
  b.edit(s=>{s.points++;s.cards['gaokao|0::apple'].correct++;s.daily['2026-11-08'].c++;});await b.advance(1300);assert.strictEqual(b.db.A.save.points,3);assert.strictEqual(b.ctx.QuizMarioCloud.syncState().pending,false);
  b.fail(1);b.edit(s=>{s.points++;});await b.advance(1300);assert.strictEqual(b.db.A.save.points,3);assert.ok(b.ctx.QuizMarioCloud.syncState().pending);await b.advance(2100);assert.strictEqual(b.db.A.save.points,4,'failed upload retries without a new answer');
  b.lostAck();b.edit(s=>{s.points++;});await b.advance(1300);assert.strictEqual(b.db.A.save.points,5);await b.advance(2100);assert.strictEqual(b.db.A.save.points,5,'uncertain acknowledgement cannot count an increment twice');assert.strictEqual(b.ctx.QuizMarioCloud.syncState().pending,false);
  b.conflict((db,id)=>{db[id].save.points+=10;db[id].updated_at='external-version';});b.edit(s=>{s.points++;});await b.advance(1300);assert.strictEqual(b.db.A.save.points,16,'stale pages rebase instead of overwriting server changes');
  const d=deferred();b.hold(d);b.edit(s=>{s.points++;});await b.advance(1300);b.edit(s=>{s.points++;});d.resolve();await settle();await b.advance(1300);assert.strictEqual(b.db.A.save.points,18,'edits made during an upload remain queued');
  const d2=deferred();b.hold(d2);b.edit(s=>{s.points++;});await b.advance(1300);await b.switchTo('B');d2.resolve();await settle();assert.strictEqual(b.db.B.save.points,7,'an old A request cannot write A data to B');assert.ok(!b.classes.has('session-ok'));assert.ok(b.calls.filter(x=>x.op==='update').every(x=>x.filters.find(v=>v[0]==='user_id')[1]==='A'));
  const second=browser({id:'B',disk,db:b.db});await settle();assert.strictEqual(second.state.profile.name,'乙同学');assert.strictEqual(second.state.points,7);assert.strictEqual(JSON.parse(disk.getItem('vocabSpotlight_v1')).profile.name,'另一个账号','legacy backup remains intact');
  const offline=browser({id:'C',db:{C:{save:save(0),updated_at:'c0'}},events:true});await settle();await offline.online(false);
  for(let i=0;i<805;i++)offline.ctx.QuizMarioLearnerEvents.record({event_type:'vocab.answer_correct',headword:'apple',track:'gaokao'});
  assert.strictEqual(offline.ctx.QuizMarioLearnerEvents.syncState().pending,805,'offline queue is never truncated at 800');
  offline.edit(s=>{s.points++;});await offline.advance(2000);assert.strictEqual(offline.db.C.save.points,0);await offline.online(true);await settle();await offline.advance(1300);assert.strictEqual(offline.db.C.save.points,1);assert.strictEqual(offline.eventDB.size,805,'online event triggers automatic full catch-up');assert.strictEqual(offline.ctx.QuizMarioLearnerEvents.syncState().pending,0);
  const legacy=storage();legacy.setItem('quizmario_learner_events_v1',JSON.stringify({events:[{event_id:'old-A',learner_id:'A',user_id:'A',event_type:'vocab.answer_wrong'},{event_id:'unowned',event_type:'vocab.answer_wrong'}],uploaded:{}}));
  const eb=browser({id:'B',disk:legacy,db:{B:{save:save(0,'乙同学'),updated_at:'v1'}},events:true});await settle();assert.strictEqual(eb.eventDB.size,0,'B cannot claim A or unowned legacy events');eb.ctx.QuizMarioLearnerEvents.record({event_type:'vocab.answer_correct',learner_id:'A',user_id:'A'});await eb.advance(1000);assert.strictEqual(eb.eventDB.size,0,'explicit foreign event ownership is rejected');
  const hung=deferred();const h=browser({db:{A:{save:save(1),updated_at:'v1'}}});await settle();h.hold(hung);h.edit(s=>{s.points++;});await h.advance(22000);assert.ok(h.ctx.QuizMarioCloud.syncState().pending);await h.advance(3500);assert.strictEqual(h.db.A.save.points,2,'a hung request cannot permanently block later retries');hung.resolve();await settle();assert.strictEqual(h.db.A.save.points,2,'late response cannot overwrite a newer confirmed save');
  const restart=browser({db:{A:{save:save(1),updated_at:'restart0'}}});await settle();await restart.online(false);restart.edit(s=>{s.points++;});restart.ctx.dispatchEvent({type:'pagehide'});restart.timers.clear();
  const reopened=browser({disk:restart.disk,db:restart.db,now:Date.parse('2026-11-08T01:00:01Z')});await settle();assert.strictEqual(reopened.db.A.save.points,2,'a closed page leaves a durable journal that the next page automatically completes');assert.strictEqual(reopened.state.points,2,'recovered progress is immediately reflected in the student page');
  console.log('grok-sync-reliability ok: ownership, auto retry, offline backlog, lost acknowledgement, CAS conflict, in-flight edits and session switch');
})().catch(e=>{console.error(e);process.exitCode=1;});

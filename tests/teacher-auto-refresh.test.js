'use strict';
const assert=require('assert'),vm=require('vm'),fs=require('fs');
const metrics=require('../grok/study-metrics'),core=require('../grok/sync-core');
async function settle(){for(let i=0;i<60;i++)await Promise.resolve();}
(async()=>{
 let now=0,seq=0,calls=0,fail=false,authCallback,user={id:'teacher',app_metadata:{role:'teacher'}};
 const timers=new Map(),els={},winListeners={},docListeners={};let key=0;
 function el(id){if(['btn-parse','codes','login-form'].includes(id))return null;return els[id]||(els[id]={hidden:false,textContent:'',innerHTML:'',value:'',classList:{toggle(){},add(){},remove(){}},addEventListener(){},style:{}});}
 const client={auth:{getSession:async()=>({data:{session:user?{user}:null}}),onAuthStateChange:fn=>{authCallback=fn;}},rpc:async()=>{
  calls++;if(fail)throw Error('network failed');seq++;
  return{data:{snapshot_version:'teacher-board-v2',generated_at:new Date(Date.parse('2026-11-08T00:00:00Z')+now).toISOString(),event_since:'2026-10-25T00:00:00Z',
   progress:[{user_id:'student',updated_at:'2026-11-08T00:00:00Z',source_card_count:1,save:{track:'gaokao',profile:{name:'测试学员',cls:'测试'},cards:{'gaokao|0::apple':{correct:seq,wrong:0,reps:seq,state:'learning',mastery:1}}}}],events:[],directory:[]}};
 }};
 const context={QMTeacherCore:metrics,QuizMarioSyncCore:core,QuizMarioCloudClient:{client:()=>client,isConfigured:()=>true},
  console,Date,Promise,navigator:{onLine:true},document:{visibilityState:'visible',getElementById:el,body:{classList:{toggle(){}}},addEventListener:(type,fn)=>(docListeners[type]||(docListeners[type]=[])).push(fn)},
  addEventListener:(type,fn)=>(winListeners[type]||(winListeners[type]=[])).push(fn),
  setTimeout:(fn,ms)=>{const id=++key;timers.set(id,{fn,at:now+ms});return id;},clearTimeout:id=>timers.delete(id),
 };context.window=context;vm.createContext(context);vm.runInContext(fs.readFileSync(require('path').join(__dirname,'../grok/teacher.js'),'utf8'),context);await settle();
 async function advance(ms){const end=now+ms;for(let n=0;n<100;n++){const next=[...timers].filter(([,t])=>t.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;now=next[1].at;timers.delete(next[0]);next[1].fn();await settle();}now=end;await settle();}
 assert.strictEqual(calls,1);const first=els['cloud-status'].textContent;assert.ok(first.includes('每20秒自动更新'));
 await advance(20000);assert.strictEqual(calls,2,'visible teacher board refreshes without a click');assert.notStrictEqual(els['cloud-status'].textContent,first);
 context.document.visibilityState='hidden';await advance(40000);assert.strictEqual(calls,2,'background does not keep downloading full class data');
 context.document.visibilityState='visible';for(const fn of docListeners.visibilitychange)fn();await settle();assert.strictEqual(calls,3,'returning to the board refreshes immediately');
 const validStatus=els['cloud-status'].textContent;fail=true;await advance(20000);assert.ok(els['cloud-status'].textContent.includes('上次读取'));assert.ok(els['cloud-status'].textContent.includes('2026-11-08T00:01:00'),'failure exposes the previous source timestamp');
 fail=false;for(const fn of winListeners.online)fn();await settle();assert.ok(els['cloud-status'].textContent.includes('校验通过'),'network recovery refreshes without a click');
 user={id:'student',app_metadata:{}};authCallback('SIGNED_IN',{user});await advance(0);const after=calls;await advance(60000);assert.strictEqual(calls,after,'teacher auto refresh stops when another account signs in');assert.strictEqual(els.board.hidden,true);
 console.log('teacher-auto-refresh ok: polling, visibility, network recovery, stale timestamp and account change');
})().catch(e=>{console.error(e);process.exitCode=1;});

const assert = require('assert');
const audit = require('../tools/teacher-data-audit.js');
const metrics = require('../grok/study-metrics.js');
const at = '2026-11-08T04:00:00.000Z';
const progress = Array.from({length:7},(_,i)=>({user_id:'test-'+i,updated_at:at,save:{
  track:'gaokao',profile:{name:'测试学员'+i,cls:'测试',password:'excluded'},
  access_token:'must-not-be-exported',
  cards:{['gaokao|0::word'+i]:{state:'review',interval:2,reps:2,correct:2,wrong:i,mastery:2}},
  daily:{},
}}));
const events = Array.from({length:504},(_,i)=>({event_id:'event-'+String(i).padStart(5,'0'),
  learner_id:'test-'+i%7,user_id:'test-'+i%7,created_at:at,event_type:'vocab.answer_correct',
  headword:'word'+i%7,item_id:'gaokao|0::word'+i%7,payload:{track:'gaokao',task_direction:'recognition'}}));
function fakeClient(role='teacher', corrupt=false) {
  const calls=[];
  const client={calls,auth:{getUser:async()=>({data:{user:{app_metadata:{role},access_token:'never-serialize-auth'}}})},
    rpc:async()=>({data:{generated_at:at,progress:JSON.parse(JSON.stringify(progress)).map(r=>({...r,save:audit.safeSave(r.save)})),
      events:events.map(e=>corrupt?{...e,payload:{},item_id:null}:e),directory:[]}}),
    from(table){
      calls.push(table);
      const base=table==='user_progress'?progress:events;
      let columns='',opts={},filters=[],orders=[];
      const q={
        select(c,o){columns=c;opts=o||{};return q;},
        gte(k,v){filters.push(r=>r[k]>=v);return q;},lte(k,v){filters.push(r=>r[k]<=v);return q;},
        order(k){orders.push(k);return q;},
        range(lo,hi){const rows=apply();return Promise.resolve({data:rows.slice(lo,hi+1)});},
        then(resolve,reject){return Promise.resolve({data:null,count:apply().length}).then(resolve,reject);},
      };
      function apply(){let rows=base.filter(r=>filters.every(f=>f(r))).slice();
        rows.sort((a,b)=>{for(const k of orders){if(a[k]<b[k])return -1;if(a[k]>b[k])return 1;}return 0;});
        return columns==='user_id,updated_at'?rows.map(({user_id,updated_at})=>({user_id,updated_at})):rows;
      }
      return q;
    },
  };return client;
}
(async()=>{
  const student=fakeClient('student');
  await assert.rejects(()=>audit.collect(student,{now:at}),/教师/);
  assert.strictEqual(student.calls.length,0,'no class reads for a nonteacher');
  const client=fakeClient();
  const capture=await audit.collect(client,{now:at,timezone:'Asia/Shanghai',metrics});
  assert.strictEqual(capture.raw.progress.length,7,'reads beyond one 5-save page');
  assert.strictEqual(capture.raw.events.length,504,'reads beyond one 500-event page');
  assert.strictEqual(capture.consistency.stable,true);
  assert.ok(!JSON.stringify(capture).includes('must-not-be-exported'));
  assert.ok(!JSON.stringify(capture).includes('never-serialize-auth'));
  assert.ok(!JSON.stringify(capture).includes('excluded'));
  assert.ok(audit.dataIssues([{user_id:'bad',save:{daily:{bad:null}}}],[]).bad.length>0);
  assert.ok(audit.dataIssues([{user_id:'bad',save:'not-json'}],[]).bad.length>0);
  const result=audit.compare(capture,metrics);
  assert.strictEqual(result.total,7);
  assert.strictEqual(result.verified,7);
  assert.ok(result.students.every(s=>s.sourceDifferences.length===0 && s.htmlDifferences.length===0));
  const invalid=JSON.parse(JSON.stringify(capture));
  invalid.raw.progress[0].save.cards['gaokao|0::word0'].correct=-1;
  assert.ok(audit.compare(invalid,metrics).students.find(s=>s.id==='test-0').dataIssues.length>0,
    'matching display cannot validate an invalid negative source counter');
  capture.consistency.stable=false;
  assert.strictEqual(audit.compare(capture,metrics).verified,0,'never certify a changing capture');
  const broken=await audit.collect(fakeClient('teacher',true),{now:at,metrics});
  assert.ok(audit.compare(broken,metrics).students.some(s=>s.sourceDifferences.includes('summary')),
    'detects dropped attribution even when the visible track label happens to agree');
  const fs=require('fs');
  const source=fs.readFileSync(require('path').join(__dirname,'../tools/teacher-data-audit.js'),'utf8');
  assert.ok(!/\.(insert|upsert|update|delete|signInWithPassword|signOut)\s*\(/.test(source),'capture contains no cloud mutation');
  console.log('teacher-data-audit ok');
})().catch(e=>{console.error(e);process.exitCode=1;});

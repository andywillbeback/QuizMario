import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
const token='1'.repeat(64), digest=crypto.createHash('sha256').update(token).digest('hex');
const text=fs.readFileSync(new URL('../grok/supabase/functions/als-learning-return-v1/index.ts',import.meta.url),'utf8').replace('__RETURN_SHA256__',digest);
let serve,inserted=[],anchorOwner,anchorTrack='gaokao';
const deno={serve:f=>{serve=f},env:{get:k=>({SUPABASE_URL:'https://local.invalid',SUPABASE_SECRET_KEYS:'{"default":"fixture"}'})[k]}};
const owner=crypto.randomUUID(),anchor=crypto.randomUUID(),id=crypto.randomUUID();
const item={learner_id:owner,anchor,event_id:id,attempt_id:id,created_at:new Date().toISOString(),submitted_at:new Date().toISOString(),
  stage:'Repair',track:'gaokao',status:'needs_review',passed:null,revision:0};
const transport=async (url,opts)=>{
  if(/als_training_anchors_v[23]$/.test(url) && JSON.parse(opts.body).anchor_ids.includes(anchor))return Response.json([{event_id:anchor,learner_id:anchorOwner,user_id:anchorOwner,source:'quizmario',event_type:'vocab.answer_wrong',headword:'test',track:anchorTrack,gloss_zh:'参加',sense_id:'test'}]);
  if(opts.method==='POST') {
    for(const r of JSON.parse(opts.body)) if(!inserted.some(e=>e.event_id===r.event_id))inserted.push(r);
    return Response.json({});
  }
  return Response.json(inserted);
};
new Function('Deno','fetch',stripTypeScriptTypes(text))(deno,transport);
const request=async(key,row)=>serve(new Request('http://localhost/',{method:'POST',headers:{Authorization:'Bearer '+key},body:JSON.stringify([row])}));
assert.equal((await request('invalid',item)).status,401);
anchorOwner=crypto.randomUUID();
assert.equal((await request(token,item)).status,422);assert.equal(inserted.length,0);
anchorOwner=owner;
for(let i=0;i<2;i++)assert.deepEqual(await (await request(token,item)).json(),{acknowledged:[id]});
assert.equal(inserted.length,1);assert.equal(inserted[0].event_type,'als.training_result');
assert.equal((await request(token,{...item,stage:'Vary'})).status,409);
console.log('Edge authentication, ownership, persistence, replay and collision checks passed.');

anchorTrack='ielts';
const nomination = {...item,event_id:crypto.randomUUID(),stage:'Rebuild',track:'ielts',
  status:'verified',passed:false,lexical_review:true};
assert.equal((await request(token,{...nomination,status:'needs_review',passed:null})).status,400);
assert.equal((await request(token,{...nomination,stage:'Repair'})).status,400);
for (let i=0;i<2;i++) assert.equal((await request(token,nomination)).status,200);
const suggestion = inserted.find(row=>row.event_id===nomination.event_id).payload;
assert.equal(suggestion.lexical_review,true);
assert.equal(suggestion.review_gloss_zh,'参加');
const corrected = {...nomination,event_id:crypto.randomUUID(),revision:1,passed:true,lexical_review:false};
assert.equal((await request(token,corrected)).status,200);
assert.equal(inserted.find(row=>row.event_id===corrected.event_id).payload.lexical_review,false);
console.log('Verified lexical nominations, corrections, and repeated deliveries passed.');

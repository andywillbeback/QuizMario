'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const queues=require('../grok/review-queues.js'),events=require('../grok/learner-events.js');
test('a just-correct wrong-book task waits for its own SRS due without losing the notebook entry',()=>{
  const row={active:true,streak:1,lastMissAt:100},p={lastOutcome:'correct',lastAttemptAt:200,lastAttemptDirection:'form',due:1000};
  const before=JSON.stringify({row,p});
  assert.equal(queues.wrongBookNeedsPractice(row,p,300,'form'),false);
  assert.equal(JSON.stringify({row,p}),before,'queue inspection never alters evidence or the SRS clock');
  assert.equal(queues.wrongBookNeedsPractice(row,p,1000,'form'),true);
});
test('recognition success cannot suppress production practice and a new miss revokes the deferral',()=>{
  const row={active:true,lastMissAt:100},p={lastOutcome:'correct',lastAttemptAt:200,lastAttemptDirection:'meaning',due:1000};
  assert(queues.wrongBookNeedsPractice(row,p,300,'form'));
  p.lastAttemptDirection='form';row.lastMissAt=250;assert(queues.wrongBookNeedsPractice(row,p,300,'form'));
  p.lastOutcome='wrong';assert(queues.wrongBookNeedsPractice(row,p,300,'form'));
});
test('help, first-try and content provenance survive the real event export as one original answer',()=>{
  const event=events.buildEvent({event_type:'vocab.answer_correct',headword:'evidence',user_id:'fictional-account',
    hint_exposed:true,answer_exposed:true,first_try:false,grade_status:'verified',task_direction:'meaning',
    content_version:'fictional-bank-v1',pos:'n.'},'2026-11-14T00:00:00Z');
  assert.equal(event.payload.hint_exposed,true);assert.equal(event.payload.answer_exposed,true);
  assert.equal(event.payload.first_try,false);assert.equal(event.payload.content_version,'fictional-bank-v1');
  assert(!event.independent,'multiple choice is never upgraded to independent production');
});

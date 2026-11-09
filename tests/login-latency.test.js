'use strict';
const assert=require('node:assert/strict');
const {browser,storage,save,deferred,settle}=require('./grok-sync-reliability.test');
const cacheKey=id=>'vocabSpotlight_v1:account:'+id;

(async()=>{
  // A slow server read must not hold a verified returning learner at the gate.
  const disk=storage(),waiting=deferred();
  disk.setItem(cacheKey('A'),JSON.stringify(save(5)));
  const returning=browser({disk,db:{A:{save:save(7),updated_at:'remote7'}},holdRead:waiting});
  await settle();
  assert.ok(returning.classes.has('session-ok'),'verified own cache opens before a slow progress GET finishes');
  assert.equal(returning.state.points,5);
  assert.ok(!returning.elements['sync-status'].textContent.includes('已自动同步'),'unverified remote state is never labelled synced');
  assert.equal(returning.ctx.QuizMarioCloud.syncState().checking,true);
  returning.edit(s=>{s.points++;});
  assert.ok(returning.ctx.QuizMarioCloud.syncState().pending,'new practice is durable while the baseline loads');
  assert.equal(returning.db.A.save.points,7,'baseline must be known before an upload');
  waiting.resolve();await settle();await returning.advance(1300);
  assert.equal(returning.db.A.save.points,8,'one new local answer rebases over the newer server baseline');
  assert.equal(returning.state.points,8);
  assert.equal(returning.ctx.QuizMarioCloud.syncState().checking,false);

  // Foreign and unowned caches cannot provide this fast path.
  const otherDisk=storage(),firstRead=deferred();
  otherDisk.setItem(cacheKey('B'),JSON.stringify(save(99,'乙测试同学')));
  otherDisk.setItem('vocabSpotlight_v1',JSON.stringify(save(88,'未归属测试同学')));
  const first=browser({id:'A',disk:otherDisk,db:{A:{save:save(2),updated_at:'a2'}},holdRead:firstRead});
  await settle();
  assert.ok(!first.classes.has('session-ok'),'first device still waits for its own server record');
  assert.ok(!JSON.stringify(first.state).includes('乙测试同学'));
  firstRead.resolve();await settle();assert.ok(first.classes.has('session-ok'));assert.equal(first.state.points,2);

  // Auth is still a prerequisite, regardless of any cached user id.
  const authWait=deferred(),readWait=deferred(),authDisk=storage();
  authDisk.setItem(cacheKey('A'),JSON.stringify(save(4)));
  const authPending=browser({disk:authDisk,sessionGate:authWait,holdRead:readWait,db:{A:{save:save(4),updated_at:'a4'}}});
  await settle();assert.ok(!authPending.classes.has('session-ok'),'stored auth hints cannot grant access before getSession');
  authWait.resolve();await settle();assert.ok(authPending.classes.has('session-ok'));
  await authPending.switchTo('B');readWait.resolve();await settle();
  assert.ok(!authPending.classes.has('session-ok'),'a late A read cannot reveal A after an account switch');
  assert.equal(authPending.db.B,undefined,'no A progress is created under B');

  // Switching identities while getSession itself waits also fails closed.
  const lateAuth=deferred(),lateDisk=storage();lateDisk.setItem(cacheKey('A'),JSON.stringify(save(6)));
  const changing=browser({disk:lateDisk,sessionGate:lateAuth,db:{A:{save:save(6),updated_at:'a6'}}});
  await settle();await changing.switchTo('B');lateAuth.resolve();await settle();
  assert.ok(!changing.classes.has('session-ok'),'a late A session result cannot open A after storage changes to B');

  // Durable records from a closed page survive both fast entry and new work.
  const previous=browser({db:{A:{save:save(1),updated_at:'old1'}}});await settle();await previous.online(false);
  previous.edit(s=>{s.points++;});previous.ctx.dispatchEvent({type:'pagehide'});previous.timers.clear();
  const recovery=deferred();
  const reopened=browser({disk:previous.disk,db:previous.db,holdRead:recovery,now:Date.parse('2026-11-08T01:00:01Z')});
  await settle();assert.ok(reopened.classes.has('session-ok'));assert.equal(reopened.state.points,2);
  reopened.edit(s=>{s.points++;});recovery.resolve();await settle();await reopened.advance(1300);
  assert.equal(reopened.db.A.save.points,3,'the old pending answer and the new answer each arrive exactly once');
  assert.equal(reopened.ctx.QuizMarioCloud.syncState().pending,false);
  console.log('login-latency ok: fast owned-cache entry, truthful sync status, first-device gate, durable rebasing and account-switch races');
})().catch(e=>{console.error(e);process.exitCode=1;});

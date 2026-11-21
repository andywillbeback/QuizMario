'use strict';
const assert = require('node:assert/strict');
const merge = require('../grok/sync-merge');
const core = require('../grok/sync-core');
const createStore = require('../grok/account-store');
const { browser, storage, settle } = require('./grok-sync-reliability.test');

const CARD = 'gaokao|0::ship';
const OWNER = '11111111-1111-4111-8111-111111111111';
const OTHER_OWNER = '22222222-2222-4222-8222-222222222222';
function attempt(id, extra) {
  return Object.assign({
    id, at: '2026-11-20T00:00:00.000Z', durationMs: 1800,
    mimeType: 'audio/webm', assisted: true, referencePlayed: false,
    audioCheck: 'signal_detected', status: 'recorded',
  }, extra || {});
}
function save(attempts, time = '2026-11-20T00:00:00.000Z') {
  return {
    points: 0, streak: 0, bestStreak: 0, unlockedLevel: 1,
    updatedAt: time, profile: {}, track: 'gaokao', daily: {}, studyDaily: {},
    cards: {
      [CARD]: {
        ef: 2.5, interval: 0, reps: 0, lapses: 0, due: 0,
        correct: 0, wrong: 0, unknown: 0, mastery: 0, state: 'new', mastered: false,
        oralOutput: { version: 1, attempts: Object.assign({}, attempts) },
      },
    },
  };
}
function ids(value) {
  return Object.keys(value.cards[CARD].oralOutput.attempts).sort();
}
function assessment(id, recording, extra) {
  return Object.assign({
    id, attemptId: recording.id, owner: OWNER, cardKey: CARD, word: 'ship',
    provider: 'xfyun-ise', at: '2026-11-20T00:00:01.000Z', scale: 100,
    accuracyScore: 84, totalScore: 82, status: 'assessed', modelVersion: 'xfyun-ise-en-v1',
  }, extra || {});
}
function assessedSave(attempts, assessments, time) {
  const value = save(attempts, time);
  value.cards[CARD].oralOutput.assessments = core.clone(assessments);
  return value;
}
function assessmentIds(value) {
  return Object.keys(value.cards[CARD].oralOutput.assessments).sort();
}
function noManufacturedLearning(value) {
  assert.equal(merge.studiedCount(value), 0, 'an assessment does not manufacture tested word knowledge');
  for (const field of ['points', 'streak', 'bestStreak']) assert.equal(value[field] || 0, 0);
  for (const field of ['reps', 'correct', 'wrong', 'unknown', 'mastery']) assert.equal(value.cards[CARD][field] || 0, 0);
  assert.notEqual(value.cards[CARD].mastered, true);
}

async function verifyAssessmentSync() {
  const a = attempt('fictional-assessed-attempt-a');
  const b = attempt('fictional-assessed-attempt-b');
  const c = attempt('fictional-assessed-attempt-c');
  const scoreA = assessment('ise_fictional_a', a);
  const scoreB = assessment('ise_fictional_b', b, { accuracyScore: 0, totalScore: 0 });
  const scoreC = assessment('ise_fictional_c', c, { accuracyScore: null, totalScore: 74 });
  const base = assessedSave({ [a.id]: a }, { [scoreA.id]: scoreA });
  const left = assessedSave({ [a.id]: a, [b.id]: b }, { [scoreA.id]: scoreA, [scoreB.id]: scoreB }, '2026-11-20T00:01:00.000Z');
  const right = assessedSave({ [a.id]: a, [c.id]: c }, { [scoreA.id]: scoreA, [scoreC.id]: scoreC }, '2026-11-20T00:02:00.000Z');
  const snapshot = JSON.stringify([base, left, right]);
  const combined = core.reconcile(base, left, right);
  assert.deepEqual(assessmentIds(combined), [scoreA.id, scoreB.id, scoreC.id]);
  assert.deepEqual(ids(combined), [a.id, b.id, c.id]);
  for (const row of [scoreA, scoreB, scoreC]) assert.deepEqual(combined.cards[CARD].oralOutput.assessments[row.id], row);
  assert.equal(JSON.stringify([base, left, right]), snapshot, 'assessment reconciliation does not mutate inputs');
  noManufacturedLearning(combined);
  assert.deepEqual(core.compact(combined), combined, 'compaction preserves complete assessments and their recordings');
  assert.deepEqual(merge.normalizeCloudSave({ save: JSON.stringify(combined) }), combined, 'cloud round trips retain explicit zero and unknown accuracy');
  assert.deepEqual(core.reconcile(combined, combined, combined), combined, 'retrying the same assessment cannot duplicate or recompute it');

  const scoreOnly = assessedSave({}, { [scoreA.id]: scoreA });
  delete scoreOnly.cards[CARD].oralOutput.attempts;
  assert.equal(merge.isBlank(scoreOnly), false, 'an existing assessment must survive even if another writer omitted recordings');
  assert.equal(merge.planSync(scoreOnly, null).upload, true, 'assessment-only evidence enters the durable journal');
  assert.equal(merge.planSync(save({}), scoreOnly).source, 'cloud');
  noManufacturedLearning(scoreOnly);
  assert.deepEqual(core.compact(scoreOnly), scoreOnly);

  const legacy = core.clone(left);
  delete legacy.cards[CARD].oralOutput.assessments;
  const legacyMerged = core.reconcile(base, legacy, right);
  assert.deepEqual(assessmentIds(legacyMerged), [scoreA.id, scoreC.id], 'a recording-only client preserves baseline and newly committed assessments');
  assert.deepEqual(ids(legacyMerged), [a.id, b.id, c.id]);
  const missingOral = save({});
  delete missingOral.cards[CARD].oralOutput;
  assert.deepEqual(assessmentIds(core.reconcile(base, base, missingOral)), [scoreA.id], 'unchanged-local shortcut cannot discard assessments');
  for (const erased of [null, {}]) {
    const writer = core.clone(base);
    writer.cards[CARD].oralOutput.assessments = erased;
    assert.deepEqual(assessmentIds(core.reconcile(base, writer, writer)), [scoreA.id], 'a missing collection is not evidence deletion');
  }
  const shellRemoved = core.reconcile(base, { cards: {} }, { cards: {} });
  assert.deepEqual(assessmentIds(shellRemoved), [scoreA.id]);
  assert.deepEqual(ids(shellRemoved), [a.id]);
  noManufacturedLearning(shellRemoved);
  const scoreOnlyRestored = core.reconcile(scoreOnly, { cards: {} }, { cards: {} });
  assert.deepEqual(assessmentIds(scoreOnlyRestored), [scoreA.id], 'an orphaned original result is retained for later recovery');
  assert.equal(scoreOnlyRestored.cards[CARD].oralOutput.attempts, undefined, 'sync never invents a missing recording');

  const conflictingLocal = core.clone(left), conflictingRemote = core.clone(right);
  conflictingLocal.cards[CARD].oralOutput.assessments[scoreA.id] = assessment(scoreA.id, b, {
    owner: OTHER_OWNER, accuracyScore: 100, totalScore: null, provider: 'fictional-other-provider',
  });
  conflictingRemote.cards[CARD].oralOutput.assessments[scoreA.id] = assessment(scoreA.id, c, {
    cardKey: 'gaokao|0::boat', word: 'boat', totalScore: 100, at: '2026-11-20T00:03:00.000Z',
  });
  const conflict = core.reconcile(base, conflictingLocal, conflictingRemote);
  assert.deepEqual(conflict.cards[CARD].oralOutput.assessments[scoreA.id], scoreA,
    'baseline identity and complete score row win; collisions never splice two owners, words or scores');
  const noBaseline = core.reconcile(save({}), conflictingLocal, base);
  assert.deepEqual(noBaseline.cards[CARD].oralOutput.assessments[scoreA.id], scoreA,
    'without a baseline, already committed remote assessment wins over a conflicting new local row');
  noManufacturedLearning(conflict);

  const historicalBase = assessedSave({}, {}), historicalLocal = assessedSave({}, {}), historicalRemote = assessedSave({}, {});
  for (let index = 0; index < 1205; index++) {
    const recording = attempt('fictional-history-attempt-' + index);
    const row = assessment('ise_fictional_history_' + index, recording);
    const destination = index < 5 ? historicalBase : index < 605 ? historicalLocal : historicalRemote;
    destination.cards[CARD].oralOutput.attempts[recording.id] = recording;
    destination.cards[CARD].oralOutput.assessments[row.id] = row;
  }
  const history = core.reconcile(historicalBase, historicalLocal, historicalRemote);
  assert.equal(ids(history).length, 1205, 'recording history is not truncated by a UI or queue cap');
  assert.equal(assessmentIds(history).length, 1205, 'assessment history is not truncated at 800 or 1000 rows');
  assert.deepEqual(history.cards[CARD].oralOutput.assessments.ise_fictional_history_0,
    historicalBase.cards[CARD].oralOutput.assessments.ise_fictional_history_0, 'the oldest original score remains intact');
  noManufacturedLearning(history);

  const disk = storage(), store = createStore(disk);
  store.activate(OWNER); store.set('vocabSpotlight_v1', JSON.stringify(combined));
  store.activate(OTHER_OWNER);
  assert.equal(store.get('vocabSpotlight_v1'), null, 'another account cannot inherit assessment records');
  store.activate(OWNER);
  assert.deepEqual(assessmentIds(JSON.parse(store.get('vocabSpotlight_v1'))), [scoreA.id, scoreB.id, scoreC.id]);

  const runtime = browser({ id: OWNER, db: {
    [OWNER]: { save: save({ [a.id]: a, [b.id]: b }), updated_at: 'assessment-baseline' },
  } });
  await settle();
  runtime.ctx.QuizMarioMerge = merge;
  runtime.fail(1);
  runtime.edit(state => { state.cards[CARD].oralOutput.assessments = { [scoreA.id]: core.clone(scoreA) }; });
  assert.ok(runtime.ctx.QuizMarioCloud.syncState().pending, 'a score-only edit creates a journal without awarding learning progress');
  await runtime.advance(1300);
  assert.ok(runtime.ctx.QuizMarioCloud.syncState().pending, 'failed score delivery remains pending');
  await runtime.advance(2200);
  assert.deepEqual(assessmentIds(runtime.db[OWNER].save), [scoreA.id]);
  runtime.lostAck();
  runtime.edit(state => { state.cards[CARD].oralOutput.assessments[scoreB.id] = core.clone(scoreB); });
  await runtime.advance(1300);
  await runtime.advance(2200);
  assert.deepEqual(assessmentIds(runtime.db[OWNER].save), [scoreA.id, scoreB.id], 'lost acknowledgement does not duplicate an assessment');
  assert.equal(runtime.ctx.QuizMarioCloud.syncState().pending, false);

  await runtime.online(false);
  runtime.edit(state => {
    state.cards[CARD].oralOutput.attempts[c.id] = core.clone(c);
    state.cards[CARD].oralOutput.assessments[scoreC.id] = core.clone(scoreC);
  });
  runtime.ctx.dispatchEvent({ type: 'pagehide' }); runtime.timers.clear();
  const reopened = browser({ id: OWNER, disk: runtime.disk, db: runtime.db, now: Date.parse('2026-11-20T00:03:00.000Z') });
  await settle();
  assert.deepEqual(assessmentIds(reopened.db[OWNER].save), [scoreA.id, scoreB.id, scoreC.id], 'offline assessment journal survives closing and reopening the page');
  reopened.edit(state => {
    delete state.cards[CARD].oralOutput.assessments;
    state.profile.note = 'fictional legacy writer';
  });
  await reopened.advance(1300);
  assert.deepEqual(assessmentIds(reopened.db[OWNER].save), [scoreA.id, scoreB.id, scoreC.id], 'a later legacy-shaped save cannot erase committed assessments');
  noManufacturedLearning(reopened.db[OWNER].save);
}

async function main() {
  const a = attempt('fictional-attempt-a');
  const b = attempt('fictional-attempt-b', { referencePlayed: true });
  const c = attempt('fictional-attempt-c');
  const empty = save({});
  const recorded = save({ [a.id]: a });

  assert.equal(merge.isBlank(empty), true, 'an empty oral panel is not a completed practice');
  assert.equal(merge.isBlank(recorded), false, 'an oral-only save must enter the durable upload journal');
  assert.equal(merge.studiedCount(recorded), 0, 'recording does not manufacture tested word knowledge');
  assert.equal(merge.planSync(recorded, null).upload, true);
  assert.equal(merge.planSync(recorded, empty).source, 'local');
  assert.equal(merge.planSync(empty, recorded).source, 'cloud');

  const roundTrip = merge.normalizeCloudSave({ save: JSON.stringify(recorded), updated_at: recorded.updatedAt });
  assert.deepEqual(roundTrip.cards[CARD].oralOutput, recorded.cards[CARD].oralOutput);
  assert.deepEqual(core.compact(recorded), recorded, 'compaction keeps immutable recording metadata');
  assert.equal(core.unusedDefault(recorded.cards[CARD]), false);
  assert.deepEqual(core.compact({ cards: { unused: { correct: 0, state: 'new' } } }).cards, {});

  const base = recorded;
  const left = save({ [a.id]: a, [b.id]: b }, '2026-11-20T00:01:00.000Z');
  const right = save({ [a.id]: a, [c.id]: c }, '2026-11-20T00:02:00.000Z');
  const snapshot = JSON.stringify([base, left, right]);
  const combined = core.reconcile(base, left, right);
  assert.deepEqual(ids(combined), [a.id, b.id, c.id]);
  assert.deepEqual(combined.cards[CARD].oralOutput.attempts[a.id], a);
  assert.deepEqual(combined.cards[CARD].oralOutput.attempts[b.id], b);
  assert.equal(JSON.stringify([base, left, right]), snapshot, 'reconciliation never edits its inputs');
  for (const field of ['points', 'streak', 'bestStreak']) assert.equal(combined[field], 0);
  for (const field of ['reps', 'correct', 'wrong', 'unknown', 'mastery']) assert.equal(combined.cards[CARD][field], 0);
  assert.equal(combined.cards[CARD].mastered, false);

  const retried = core.reconcile(combined, combined, combined);
  assert.deepEqual(ids(retried), [a.id, b.id, c.id], 'replaying a save cannot duplicate a recording');
  const legacyRemote = core.clone(empty);
  delete legacyRemote.cards[CARD].oralOutput;
  assert.deepEqual(ids(core.reconcile(base, left, legacyRemote)), [a.id, b.id], 'a stale writer omitting the field cannot erase baseline recordings');
  assert.deepEqual(ids(core.reconcile(base, base, legacyRemote)), [a.id], 'the unchanged-local shortcut must also keep baseline recordings');
  assert.deepEqual(ids(core.reconcile(base, { cards: {} }, { cards: {} })), [a.id], 'recording evidence is append-only even when another writer drops the card shell');

  const conflicting = save({ [a.id]: attempt(a.id, { durationMs: 9999, status: 'passed' }) });
  assert.deepEqual(core.reconcile(base, conflicting, right).cards[CARD].oralOutput.attempts[a.id], a,
    'an ID collision cannot rewrite an original recording or manufacture a passed assessment');
  const noBaseline = core.reconcile(empty, conflicting, recorded);
  assert.deepEqual(noBaseline.cards[CARD].oralOutput.attempts[a.id], a,
    'an already committed remote recording wins a collision with a new local row');

  const mixed = core.clone(left);
  mixed.cards[CARD].spelling = { typed: { correct: 1, wrong: 2, unknown: 0 } };
  mixed.cards[CARD].polysemy = { correct: 2, wrong: 1 };
  mixed.cards[CARD].collocationEvidence = { correct: 1, wrong: 1, verified: false };
  mixed.studyDaily = { '2026-11-20': 5000 };
  mixed.questionNotebook = { fictionalQuestion: { answer: 'boat', active: true } };
  const mixedSynced = core.reconcile(base, mixed, right);
  for (const field of ['spelling', 'polysemy', 'collocationEvidence']) {
    assert.deepEqual(mixedSynced.cards[CARD][field], mixed.cards[CARD][field]);
  }
  assert.deepEqual(mixedSynced.studyDaily, mixed.studyDaily);
  assert.deepEqual(mixedSynced.questionNotebook, mixed.questionNotebook);
  assert.deepEqual(ids(mixedSynced), [a.id, b.id, c.id]);

  const disk = storage();
  const store = createStore(disk);
  disk.setItem('vocabSpotlight_v1', JSON.stringify(recorded));
  store.activate('fictional-learner-one');
  assert.equal(store.get('vocabSpotlight_v1'), null, 'unowned legacy data is not adopted');
  store.set('vocabSpotlight_v1', JSON.stringify(recorded));
  store.activate('fictional-learner-two');
  assert.equal(store.get('vocabSpotlight_v1'), null, 'the next account cannot see the first account recording');
  store.activate('fictional-learner-one');
  assert.deepEqual(ids(JSON.parse(store.get('vocabSpotlight_v1'))), [a.id]);
  assert.equal(disk.getItem('vocabSpotlight_v1'), JSON.stringify(recorded), 'legacy records remain intact');

  const runtime = browser({ id: 'fictional-learner-one', db: {
    'fictional-learner-one': { save: empty, updated_at: 'oral-baseline' },
  } });
  await settle();
  runtime.ctx.QuizMarioMerge = merge;
  runtime.fail(1);
  runtime.edit(state => { state.cards[CARD].oralOutput.attempts[a.id] = core.clone(a); });
  assert.ok(runtime.ctx.QuizMarioCloud.syncState().pending, 'an oral-only edit creates a durable journal without a profile or academic score');
  await runtime.advance(1300);
  assert.ok(runtime.ctx.QuizMarioCloud.syncState().pending, 'a failed upload retains the recording journal');
  await runtime.advance(2200);
  assert.deepEqual(ids(runtime.db['fictional-learner-one'].save), [a.id]);
  assert.equal(runtime.ctx.QuizMarioCloud.syncState().pending, false);
  runtime.lostAck();
  runtime.edit(state => { state.cards[CARD].oralOutput.attempts[b.id] = core.clone(b); });
  await runtime.advance(1300);
  await runtime.advance(2200);
  assert.deepEqual(ids(runtime.db['fictional-learner-one'].save), [a.id, b.id], 'lost acknowledgement retries do not duplicate recording evidence');
  assert.equal(runtime.db['fictional-learner-one'].save.points, 0);
  assert.equal(runtime.db['fictional-learner-one'].save.cards[CARD].mastered, false);
  await verifyAssessmentSync();
  console.log('oral-output-sync ok: immutable recordings and assessments, complete-row collision precedence, legacy writers, unbounded history, ownership, durable retry and no manufactured mastery');
}

main().catch(error => { console.error(error); process.exitCode = 1; });

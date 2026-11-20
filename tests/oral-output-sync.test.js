'use strict';
const assert = require('node:assert/strict');
const merge = require('../grok/sync-merge');
const core = require('../grok/sync-core');
const createStore = require('../grok/account-store');
const { browser, storage, settle } = require('./grok-sync-reliability.test');

const CARD = 'gaokao|0::ship';
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
  console.log('oral-output-sync ok: independent evidence, append-only union, account ownership, durable retry and no manufactured mastery');
}

main().catch(error => { console.error(error); process.exitCode = 1; });

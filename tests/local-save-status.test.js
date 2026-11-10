'use strict';
const assert = require('assert');
const core = require('../grok/sync-core');
const { browser, settle, save } = require('./grok-sync-reliability.test');

function quotaError() {
  const error = new Error('The quota has been exceeded.');
  error.name = 'QuotaExceededError';
  return error;
}

function disk(allow) {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => {
      const key = String(k);
      const value = String(v);
      if (!allow(key, value)) throw quotaError();
      m.set(key, value);
    },
    removeItem: (k) => m.delete(k),
    key: (i) => Array.from(m.keys())[i] || null,
    get length() { return m.size; },
    _m: m,
  };
}

function untouched(extra) {
  return Object.assign({
    ef: 2.5, interval: 0, reps: 0, lapses: 0, due: 0, correct: 0, wrong: 0,
    unknown: 0, mastery: 0, state: 'new', mastered: false, scheduledAt: 0,
  }, extra || {});
}

async function main() {
  const historical = untouched();
  delete historical.lastOutcome;
  const practiced = untouched({ correct: 2, reps: 1, state: 'learning', lastOutcome: 'correct' });
  const pruned = core.prune({ cards: { blank: historical, empty: {}, kept: practiced, evidence: { collocationEvidence: { correct: 1 } } } });
  assert.deepStrictEqual(Object.keys(pruned.cards).sort(), ['evidence', 'kept'], 'exact unused cards, including the pre-compact shape with no lastOutcome, are removed');
  assert.strictEqual(pruned.cards.kept.correct, 2);
  assert.strictEqual(pruned.cards.evidence.collocationEvidence.correct, 1);

  const eventsOnly = disk((key) => !key.includes('learner_events') || key.includes('quizmario-event-pending'));
  const eventBrowser = browser({
    disk: eventsOnly,
    db: { A: { save: save(1), updated_at: 'v0' }, B: { save: save(7, '乙同学'), updated_at: 'b0' } },
    events: true,
  });
  await settle();
  eventBrowser.ctx.QuizMarioLearnerEvents.record({ event_type: 'vocab.answer_correct', headword: 'apple', track: 'gaokao' });
  eventBrowser.edit((s) => { s.points += 1; });
  await eventBrowser.advance(1500);
  assert.strictEqual(eventBrowser.db.A.save.points, 2, 'a learner-event quota failure cannot block the progress upload');
  assert.strictEqual(eventBrowser.db.B.save.points, 7);
  const eventStatus = eventBrowser.elements['sync-status'].textContent;
  assert.ok(!eventStatus.includes('本机保存失败'), eventStatus);
  assert.ok(eventStatus.includes('已自动同步'), eventStatus);

  const blocked = disk((key) => key === 'quizmario-auth');
  const full = browser({
    disk: blocked,
    db: { A: { save: save(1), updated_at: 'full0' }, B: { save: save(4, '乙同学'), updated_at: 'b0' } },
    events: true,
  });
  await settle();
  full.ctx.QuizMarioLearnerEvents.record({ event_type: 'vocab.answer_wrong', headword: 'stone', track: 'gaokao' });
  full.edit((s) => { s.points += 3; });
  await full.advance(1500);
  assert.strictEqual(full.db.A.save.points, 4, 'new practice still reaches the cloud when every local write throws');
  assert.strictEqual(full.db.B.save.points, 4);
  const fullStatus = full.elements['sync-status'].textContent;
  assert.ok(!fullStatus.includes('本机保存失败'), fullStatus);
  assert.ok(fullStatus.includes('已自动同步'), fullStatus);
  assert.ok(full.calls.filter((call) => call.op !== 'read').every((call) => {
    const owner = (call.filters.find((pair) => pair[0] === 'user_id') || [])[1] || (call.body && call.body.user_id);
    return !owner || owner === 'A';
  }), 'a full local disk cannot retarget A writes');

  full.fail(1);
  full.edit((s) => { s.points += 1; });
  await full.advance(1400);
  const holding = full.elements['sync-status'].textContent;
  assert.ok(!holding.includes('本机保存失败'), holding);
  assert.ok(holding.includes('进度已保留'), holding);
  assert.strictEqual(full.db.A.save.points, 4, 'the failed upload is not acknowledged');
  await full.advance(2500);
  assert.strictEqual(full.db.A.save.points, 5, 'the in-memory journal retries after local storage stays unavailable');

  const beforeSwitch = full.db.B.save.points;
  await full.switchTo('B');
  await settle();
  assert.strictEqual(full.db.B.save.points, beforeSwitch, 'switching accounts does not apply A practice to B');
  assert.ok(!full.classes.has('session-ok'));

  const healthy = browser({ db: { A: { save: save(2), updated_at: 'ok0' } } });
  await settle();
  healthy.edit((s) => { s.points += 1; });
  await healthy.advance(1500);
  const okStatus = healthy.elements['sync-status'].textContent;
  assert.ok(okStatus.includes('已自动同步') && !okStatus.includes('本机未再写入') && !okStatus.includes('本机保存失败'), okStatus);

  console.log('local-save-status ok: quota does not mask a successful cloud sync, retries stay in memory, and untouched cards are pruned');
}

if (require.main === module) main().catch((error) => { console.error(error); process.exitCode = 1; });

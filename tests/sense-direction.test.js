"use strict";

const assert = require("assert");
const practice = require("../practice");
const Sense = require("../sense-id");
const le = require("../learner-events");
const loop = require("../home-loop");

/* Q2: three directions record separately on one card. */
{
  const prog = {};
  const now = 1_700_000_000_000;
  practice.noteDirection(prog, "meaning", "correct", now);
  practice.noteDirection(prog, "form", "wrong", now + 1);
  practice.noteDirection(prog, "spelling", "correct", now + 2);
  practice.noteDirection(prog, "spelling", "correct", now + 3);

  assert.strictEqual(practice.normalizeDirectionKey("meaning"), "en_zh");
  assert.strictEqual(practice.normalizeDirectionKey("zh-en"), "zh_en");
  assert.strictEqual(practice.normalizeDirectionKey("typed_spelling"), "spelling");

  assert.strictEqual(prog.directions.en_zh.correct, 1);
  assert.strictEqual(prog.directions.en_zh.wrong, 0);
  assert.strictEqual(prog.directions.zh_en.wrong, 1);
  assert.strictEqual(prog.directions.zh_en.correct, 0);
  assert.strictEqual(prog.spelling.correct, 2);
  assert.strictEqual(practice.directionSignal(prog, "en_zh"), "在练");
  assert.strictEqual(practice.directionSignal(prog, "zh_en"), "不稳");
  assert.strictEqual(practice.directionSignal(prog, "spelling"), "稳定");

  // Cross-direction isolation: zh_en miss does not touch en_zh or spelling.
  assert.strictEqual(prog.directions.en_zh.wrong, 0);
  assert.strictEqual(prog.spelling.wrong, 0);
}

{
  const session = practice.ensureSessionPractice({ meaning: { n: 3, good: 2 } });
  assert.strictEqual(session.meaning.n, 3);
  assert.strictEqual(session.form.n, 0);
  assert.strictEqual(session.spelling.n, 0);
  assert.strictEqual(practice.sessionPracticeBucket("form"), "form");
  assert.strictEqual(practice.sessionPracticeBucket("meaning"), "meaning");
  assert.strictEqual(practice.sessionPracticeBucket("spelling"), "spelling");
}

/* Spelling is first-class on learner events — not production. */
{
  const UID = "11111111-1111-4111-8111-111111111111";
  const NOW = "2026-10-23T00:00:00.000Z";
  const spelled = le.buildEvent({
    event_type: le.TYPES.CORRECT,
    learner_id: UID,
    headword: "adult",
    pos: "n.",
    gloss_zh: "成年人",
    task_direction: "spelling",
    created_at: NOW,
  }, NOW);
  assert.strictEqual(spelled.task_direction, "spelling");
  assert.strictEqual(spelled.task_direction_detail, "spelling");

  const typed = le.buildEvent({
    event_type: le.TYPES.CORRECT,
    learner_id: UID,
    headword: "adult",
    task_direction: "typed",
    created_at: NOW,
  }, NOW);
  assert.strictEqual(typed.task_direction, "spelling");
  assert.strictEqual(typed.task_direction_detail, "typed");

  const form = le.buildEvent({
    event_type: le.TYPES.WRONG,
    learner_id: UID,
    headword: "adult",
    gloss_zh: "成年人",
    task_direction: "form",
    created_at: NOW,
  }, NOW);
  assert.strictEqual(form.task_direction, "production");
  assert.strictEqual(form.task_direction_detail, "zh_en");

  const meaning = le.buildEvent({
    event_type: le.TYPES.WRONG,
    learner_id: UID,
    headword: "communicate",
    pos: "v.",
    gloss_zh: "交流",
    task_direction: "meaning",
    created_at: NOW,
  }, NOW);
  assert.strictEqual(meaning.task_direction, "recognition");
  assert.strictEqual(meaning.task_direction_detail, "en_zh");
  assert.strictEqual(meaning.sense_id, "communicate.v.交流");
}

/* Unified sense_id contract both ends. */
{
  assert.strictEqual(Sense.provisionalSenseId("Communicate", "v.", "交流"), "communicate.v.交流");
  assert.strictEqual(le.provisionalSenseId("Communicate", "v.", "交流"), Sense.provisionalSenseId("Communicate", "v.", "交流"));
  assert.strictEqual(loop.provisionalSenseId("Communicate", "v.", "交流"), Sense.provisionalSenseId("Communicate", "v.", "交流"));

  const bank = Sense.resolveSenseKey({ sense_id: "communicate:social", lemma: "communicate", pos: "v.", gloss_zh: "交流" });
  assert.strictEqual(bank.sense_id, "communicate:social");
  assert.strictEqual(bank.sense_id_kind, "bank");

  const prov = Sense.resolveSenseKey({ lemma: "communicate", pos: "v.", gloss_zh: "交流" });
  assert.strictEqual(prov.sense_id, "communicate.v.交流");
  assert.strictEqual(prov.sense_id_kind, "provisional");

  assert.ok(Sense.sameSenseId("communicate.v.交流", "communicate.v.交流"));
  assert.ok(!Sense.sameSenseId("communicate.v.交流", "communicate:social"));
  assert.ok(!Sense.sameSenseId("", "communicate.v.交流"));
}

console.log("sense-direction ok");

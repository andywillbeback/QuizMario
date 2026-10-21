"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const cloze = require("../cloze");
const srs = require("../srs-rules");
const merge = require("../sync-merge");
const queues = require("../review-queues");
const events = require("../learner-events");

function noon(year, month, day) {
  return new Date(year, month - 1, day, 12, 0, 0, 0).getTime();
}

const day1 = noon(2026, 10, 21);
const day2 = noon(2026, 10, 22);
const day3 = noon(2026, 10, 23);

function fresh() {
  return srs.defaultCardProg();
}

function clean(now) {
  return { now: now, correct: true, outcome: "correct", firstTry: true, hintSeen: false };
}

/* P0-1. Naive substring replace turned "a" into blanks inside at/cat/gate. */
{
  const sentence = "A cat sat at the gate.";
  assert.strictEqual(cloze.blankExample(sentence, "a"), "___ cat sat at the gate.");
  assert.strictEqual(cloze.blankExample(sentence, "at"), "A cat sat ___ the gate.");
  assert.strictEqual(cloze.blankExample(sentence, "gate"), "A cat sat at the ___.");
  assert.strictEqual(cloze.blankExample(sentence, "cat"), "A ___ sat at the gate.");
  assert.ok(!cloze.blankExample(sentence, "a").includes("g___te"), "blanking a must not damage gate");
  assert.ok(!cloze.blankExample(sentence, "at").includes("g___e"), "blanking at must not damage gate");
  assert.strictEqual(
    cloze.blankExample("I bought a book at the school shop.", "a"),
    "I bought ___ book at the school shop."
  );
  assert.strictEqual(
    cloze.blankExample("I bought a book at the school shop.", "at"),
    "I bought a book ___ the school shop."
  );
  assert.strictEqual(cloze.blankExample("The gate near the gate.", "gate"), "The ___ near the ___.");
  assert.strictEqual(cloze.blankExample("Look at the gate.", "gate"), "Look at the ___.");
  assert.strictEqual(cloze.blankExample("Look at the gate.", "at"), "Look ___ the gate.");
  assert.strictEqual(cloze.blankExample("Stop at the gate!", "gate"), "Stop at the ___!");
  assert.strictEqual(cloze.blankExample("We waited at the gate at noon.", "at"), "We waited ___ the gate ___ noon.");
  assert.strictEqual(cloze.blankExample("the gates", "gate"), "the gates");
  assert.strictEqual(cloze.blankExample("don't open the gate", "do"), "don't open the gate");
}

/* P0-2. Same-day repair makes the card solid (通关 credit) and not 已学会. */
{
  const card = fresh();
  srs.schedule(card, 0, day1);
  srs.schedule(card, 1, day1 + 1000);
  srs.schedule(card, 1, day1 + 2000);
  assert.strictEqual(srs.isSolidCard(card), true, "two corrects still count toward 通关");
  assert.strictEqual(srs.isMasteredCard(card), false, "same-day correction must not mark 已学会");
  assert.strictEqual(card.state, "review");
  assert.ok(card.interval >= 1);
  assert.strictEqual(card.due, day1 + 2000 + srs.DAY_MS, "the repair still schedules a cross-day review");
  const day = {};
  srs.applyDailyAnswer(day, card, clean(day1 + 3000));
  assert.strictEqual(day.c, 1);
  assert.strictEqual(day.rc || 0, 0, "same-day review does not inflate 保持率");
  assert.strictEqual(day.rw || 0, 0);
}

/* Three Easy taps the same day used to fill the star bar to mastered. */
{
  const card = fresh();
  srs.schedule(card, 2, day1);
  srs.schedule(card, 2, day1 + 1000);
  srs.schedule(card, 2, day1 + 2000);
  assert.strictEqual(srs.isSolidCard(card), true);
  assert.strictEqual(srs.isMasteredCard(card), false);
  assert.ok(card.mastery < 3);
  assert.strictEqual(srs.retentionVerdict(card, clean(day1 + 3000)), null);
  assert.ok(card.due > day1, "the card is still scheduled");
  assert.strictEqual(srs.isNewCard(card), false);
}

/* P0-3. A later day's first unaided answer is 已学会 and stays in SRS. */
{
  const card = fresh();
  srs.schedule(card, 1, day1);
  srs.schedule(card, 1, day1 + 1000);
  const day = {};
  const logged = srs.applyDailyAnswer(day, card, clean(day2));
  assert.strictEqual(logged.verdict, "hit");
  assert.strictEqual(day.rc, 1);
  assert.strictEqual(day.c, 1);
  assert.strictEqual(day.rw || 0, 0);
  srs.schedule(card, 1, day2, clean(day2));
  assert.strictEqual(srs.isMasteredCard(card), true);
  assert.strictEqual(card.state, "review");
  assert.ok(card.interval >= 1);
  assert.ok(card.due > day2, "已学会 does not delete the next review");
  assert.strictEqual(srs.isNewCard(card), false);
  assert.strictEqual(srs.isDue(card, card.due), true);
  assert.strictEqual(srs.isDue(card, day2), false);
}

/* A revealed answer on that cross-day review is a 保持率 miss, not 已学会. */
{
  const card = fresh();
  srs.schedule(card, 1, day1);
  srs.schedule(card, 1, day1 + 1000);
  const seen = { now: day2, correct: true, outcome: "correct", firstTry: true, hintSeen: true };
  assert.strictEqual(srs.retentionVerdict(card, seen), "miss");
  const day = {};
  srs.applyDailyAnswer(day, card, seen);
  assert.strictEqual(day.rc || 0, 0);
  assert.strictEqual(day.rw, 1);
  assert.strictEqual(day.c, 1, "the pick can still be correct");
  srs.schedule(card, 1, day2, seen);
  assert.strictEqual(srs.isMasteredCard(card), false);
  assert.strictEqual(card.state, "review");
  assert.ok(card.due > day2);
}

/* First answer wrong is 保持率 miss. The same-day repair does not master it. */
{
  const card = fresh();
  srs.schedule(card, 1, day1);
  srs.schedule(card, 1, day1 + 1000);
  const day = {};
  srs.applyDailyAnswer(day, card, { now: day2, correct: false, outcome: "wrong", firstTry: true, hintSeen: false });
  assert.strictEqual(day.w, 1);
  assert.strictEqual(day.unk || 0, 0);
  assert.strictEqual(day.rw, 1);
  assert.strictEqual(day.rc || 0, 0);
  const wrongBefore = card.wrong;
  srs.schedule(card, 0, day2, { outcome: "wrong", firstTry: true, correct: false });
  assert.strictEqual(card.wrong, wrongBefore + 1);
  assert.strictEqual(card.unknown || 0, 0);
  assert.strictEqual(card.lastOutcome, "wrong");
  assert.strictEqual(srs.isMasteredCard(card), false);
  const repair = { firstTry: false, hintSeen: true, outcome: "correct", correct: true };
  srs.schedule(card, 1, day2 + 1000, repair);
  srs.schedule(card, 1, day2 + 2000, repair);
  assert.strictEqual(srs.isSolidCard(card), true);
  assert.strictEqual(srs.isMasteredCard(card), false);
  assert.ok(card.due >= day2 + 2000 + srs.DAY_MS);
  assert.strictEqual(card.state, "review");
}

/* A first「不会」on a new card lapses into learning. It must not bounce back to new. */
{
  const card = fresh();
  srs.schedule(card, 0, day1, { outcome: "unknown", correct: false, firstTry: true });
  assert.strictEqual(card.state, "learning");
  assert.strictEqual(card.wrong, 0);
  assert.strictEqual(card.unknown, 1);
  assert.strictEqual(card.lastOutcome, "unknown");
  assert.strictEqual(srs.isNewCard(card), false);
  assert.strictEqual(srs.isLearning(card), true);
  assert.ok(card.due === day1 + srs.LEARN_MS);
  const day = {};
  srs.applyDailyAnswer(day, fresh(), { now: day1, correct: false, outcome: "unknown", firstTry: true });
  assert.strictEqual(day.unk, 1);
  assert.strictEqual(day.w || 0, 0);
  assert.strictEqual(day.n, 1);
  assert.strictEqual(day.rc || 0, 0);
  assert.strictEqual(day.rw || 0, 0);
}

/* P0-4. 「不会」is not a wrong pick, and the card is not dropped from review. */
{
  const card = fresh();
  srs.schedule(card, 1, day1);
  srs.schedule(card, 1, day1 + 1000);
  const wrongBefore = card.wrong;
  const day = {};
  srs.applyDailyAnswer(day, card, { now: day2, correct: false, outcome: "unknown", firstTry: true, hintSeen: false });
  assert.strictEqual(day.unk, 1);
  assert.strictEqual(day.w || 0, 0);
  assert.strictEqual(day.c || 0, 0);
  assert.strictEqual(day.rw, 1, "failing to recall still lowers 保持率");
  assert.strictEqual(day.rc || 0, 0);
  srs.schedule(card, 0, day2, { outcome: "unknown", firstTry: true, correct: false });
  assert.strictEqual(card.unknown, 1);
  assert.strictEqual(card.wrong, wrongBefore);
  assert.strictEqual(card.lastOutcome, "unknown");
  assert.strictEqual(card.mastered, false);
  assert.strictEqual(card.state, "learning");
  assert.strictEqual(srs.isNewCard(card), false, "不会 must not classify the card as new");
  assert.ok(card.due > day2);
  const repair = { firstTry: false, hintSeen: true, outcome: "correct", correct: true };
  srs.schedule(card, 1, day2 + 1000, repair);
  srs.schedule(card, 1, day2 + 2000, repair);
  assert.strictEqual(srs.isSolidCard(card), true, "same-day repair after 不会 still schedules the cross-day review");
  assert.strictEqual(srs.isMasteredCard(card), false);
  assert.ok(card.due >= day2 + srs.DAY_MS);
  srs.schedule(card, 1, day3, clean(day3));
  assert.strictEqual(srs.isMasteredCard(card), true);
  assert.strictEqual(card.state, "review");
  assert.ok(card.interval >= 1);
  assert.ok(card.due > day3);
}

/* 通关 (80% solid) does not require any 已学会 card. */
{
  const cards = Array.from({ length: 10 }, () => fresh());
  for (let i = 0; i < 8; i++) {
    srs.schedule(cards[i], 1, day1);
    srs.schedule(cards[i], 1, day1 + 1000);
    assert.strictEqual(srs.isMasteredCard(cards[i]), false);
  }
  const stats = srs.summarizeSet(cards, day1 + 5000);
  assert.strictEqual(stats.solid, 8);
  assert.strictEqual(stats.need, 8);
  assert.strictEqual(stats.ready, true);
}

/* Old saves: review + a full star bar can stay 已学会. Review alone cannot. */
{
  const onlyReview = {
    state: "review", interval: 1, mastery: 1, due: day2, reps: 2, correct: 2, wrong: 0, ef: 2.5,
  };
  srs.noteLegacyMastery(onlyReview);
  assert.strictEqual(onlyReview.mastered, false);
  assert.strictEqual(onlyReview.scheduledAt, day2 - srs.DAY_MS);
  const starred = {
    state: "review", interval: 4, mastery: 3, due: day2, reps: 5, correct: 5, wrong: 0, ef: 2.5,
  };
  srs.noteLegacyMastery(starred);
  assert.strictEqual(starred.mastered, true);
  assert.strictEqual(srs.isMasteredCard(starred), true);
  const stamp = starred.scheduledAt;
  srs.noteLegacyMastery(starred);
  assert.strictEqual(starred.mastered, true);
  assert.strictEqual(starred.scheduledAt, stamp);
}

/* Leaving 错词本 does not remove the SM-2 card. */
{
  const card = fresh();
  srs.schedule(card, 1, day1);
  srs.schedule(card, 1, day1 + 1000);
  const book = {};
  const entry = { lemmaKey: "core::gate", lemma: "gate", track: "core", levelIdx: 0, cardKey: "0::gate", now: day1 };
  queues.touchWrongBook(book, entry, card, "miss");
  queues.noteWrongBookCorrect(book, entry.lemmaKey, card.wrong || 0);
  const done = queues.noteWrongBookCorrect(book, entry.lemmaKey, card.wrong || 0);
  assert.strictEqual(done.graduated, true);
  assert.strictEqual(book[entry.lemmaKey].active, false);
  assert.strictEqual(card.state, "review");
  assert.ok(card.due > day1);
  assert.strictEqual(srs.isNewCard(card), false);
}

{
  const save = { points: 0, unlockedLevel: 1, cards: { k: { reps: 0, correct: 0, wrong: 0, unknown: 1, mastery: 0 } } };
  assert.strictEqual(merge.studiedCount(save), 1, "不会 progress is not a blank save");
  assert.strictEqual(merge.isBlank(save), false);
}

{
  const unknown = events.buildEvent({
    event_type: events.TYPES.UNKNOWN,
    headword: "Gate",
    outcome: "unknown",
    answer: "should-not-stick",
    track: "zhongkao",
    gloss_zh: "大门",
  }, "2026-10-22T04:00:00.000Z");
  assert.strictEqual(unknown.event_type, "vocab.answer_unknown");
  assert.strictEqual(unknown.headword, "gate");
  assert.strictEqual(unknown.payload.outcome, "unknown");
  assert.ok(!unknown.payload.answer, "不会 does not record a picked option");
  const wrong = events.buildEvent({
    event_type: events.TYPES.WRONG,
    headword: "gate",
    outcome: "wrong",
    answer: "gait",
  }, "2026-10-22T04:00:00.000Z");
  assert.strictEqual(wrong.event_type, "vocab.answer_wrong");
  assert.strictEqual(wrong.payload.outcome, "wrong");
  assert.strictEqual(wrong.payload.answer, "gait");
}

{
  const root = path.join(__dirname, "..");
  const game = fs.readFileSync(path.join(root, "game.js"), "utf8");
  const index = fs.readFileSync(path.join(root, "index.html"), "utf8");
  assert.ok(index.includes('src="cloze.js"'), "the page loads the word-boundary blanker");
  assert.ok(game.includes("QuizMarioCloze") && game.includes("blankExample"));
  assert.ok(!/new RegExp\(\s*word\.replace/.test(game), "softenHint must not substring-replace");
  assert.ok(!game.includes("setTimeout(nextCard, 2600)"), "wrong-answer feedback must not auto-advance");
  assert.ok(game.includes('id="btn-feedback-continue"') || game.includes("btn-feedback-continue"));
  assert.ok(game.includes("不会 · 先看答案"));
  assert.ok(index.includes('id="btn-unknown"') && index.includes(">不会</button>"));
  assert.ok(game.includes("SRS.isMasteredCard"));
  assert.ok(!/state === "review"\) learned\+\+/.test(game), "已学会 must not count every review card");
  assert.ok(game.includes("已学会") && game.includes("通关") && game.includes("保持率"));
  assert.ok(game.includes("applyDailyAnswer"));
  assert.ok(game.includes('title.textContent = challengeWon ? "挑战成功" : "通关"'));
}

console.log("p0 ok");

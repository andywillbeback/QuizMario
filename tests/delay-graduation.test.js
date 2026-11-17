"use strict";

/**
 * Grok版本 / 聚光单词（grok） Q3
 * 修正延迟保持与错词毕业: same-session streak ≠ long-term leave;
 * graduation needs an actual cross-day interval check.
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const srs = require("../srs-rules");
const rq = require("../review-queues");

const T0 = 1700000000000;
const DAY = rq.DAY_MS;

function miss(book, lemma, now) {
  const entry = {
    lemmaKey: rq.lemmaKey("zhongkao", lemma),
    lemma,
    track: "zhongkao",
    levelIdx: 0,
    cardKey: "zhongkao|0::" + lemma.toLowerCase(),
    now,
  };
  rq.touchWrongBook(book, entry, { wrong: 1 }, "miss");
  return entry;
}

{
  const book = {};
  const entry = miss(book, "delay", T0);
  const a = rq.noteWrongBookCorrect(book, entry.lemmaKey, 1, { now: T0 + 10 });
  const b = rq.noteWrongBookCorrect(book, entry.lemmaKey, 1, { now: T0 + 20 });
  const c = rq.noteWrongBookCorrect(book, entry.lemmaKey, 1, { now: T0 + 30 });
  assert.strictEqual(a.graduated, false);
  assert.strictEqual(b.graduated, false);
  assert.strictEqual(c.graduated, false, "more same-day corrects still do not graduate");
  assert.strictEqual(book[entry.lemmaKey].active, true);
  assert.strictEqual(book[entry.lemmaKey].sessionCleared, true);
}

{
  const book = {};
  const entry = miss(book, "keep", T0);
  rq.noteWrongBookCorrect(book, entry.lemmaKey, 1, { now: T0 + 10 });
  const grad = rq.noteWrongBookCorrect(book, entry.lemmaKey, 1, { now: T0 + DAY });
  assert.strictEqual(grad.graduated, true, "one prior + next calendar day graduates");
  assert.strictEqual(book[entry.lemmaKey].active, false);
}

{
  // Calendar day, not a raw 24h timer. Local 23:30 → 00:10 is under a day
  // and still graduates. 01:00 → 23:30 the same local date does not.
  const morning = new Date(2026, 9, 22, 1, 0, 0, 0).getTime();
  const evening = new Date(2026, 9, 22, 23, 30, 0, 0).getTime();
  const nextDawn = new Date(2026, 9, 23, 0, 10, 0, 0).getTime();
  assert.strictEqual(rq.calendarDay(morning), rq.calendarDay(evening));
  assert.notStrictEqual(rq.calendarDay(evening), rq.calendarDay(nextDawn));
  assert.ok(nextDawn - evening < DAY, "overnight keep-check is shorter than 24h");

  const book = {};
  const entry = miss(book, "boundary", morning);
  const early = rq.noteWrongBookCorrect(book, entry.lemmaKey, 1, { now: morning + 1000 });
  const late = rq.noteWrongBookCorrect(book, entry.lemmaKey, 1, { now: evening });
  assert.strictEqual(early.graduated, false);
  assert.strictEqual(late.graduated, false, "same local calendar day must not graduate");
  assert.strictEqual(late.sessionCleared, true);
  assert.strictEqual(book[entry.lemmaKey].active, true);
  const grad = rq.noteWrongBookCorrect(book, entry.lemmaKey, 1, { now: nextDawn });
  assert.strictEqual(grad.graduated, true, "next local calendar day graduates even under 24h");
  assert.strictEqual(book[entry.lemmaKey].active, false);
}

{
  const book = {};
  const entry = miss(book, "reset", T0);
  rq.noteWrongBookCorrect(book, entry.lemmaKey, 1, { now: T0 + 10 });
  rq.noteWrongBookCorrect(book, entry.lemmaKey, 1, { now: T0 + 20 });
  assert.strictEqual(book[entry.lemmaKey].sessionCleared, true);
  rq.touchWrongBook(book, { ...entry, now: T0 + 40 }, { wrong: 2 }, "miss");
  assert.strictEqual(book[entry.lemmaKey].sessionCleared, false);
  assert.strictEqual(book[entry.lemmaKey].lastCorrectAt, 0);
  assert.strictEqual(book[entry.lemmaKey].streak, 0);
  const again = rq.noteWrongBookCorrect(book, entry.lemmaKey, 2, { now: T0 + DAY });
  assert.strictEqual(again.graduated, false, "after miss, first delayed-looking tick has no prior correct");
  assert.strictEqual(again.streak, 1);
}

{
  // SRS 已学会 already requires cross-day; keep the invariant wired.
  const card = srs.defaultCardProg();
  srs.schedule(card, 1, T0);
  srs.schedule(card, 1, T0 + 1000);
  assert.strictEqual(srs.isSolidCard(card), true);
  assert.strictEqual(srs.isMasteredCard(card), false, "same-day solid ≠ 已学会");
  srs.schedule(card, 1, T0 + DAY, { correct: true, firstTry: true, hintSeen: false });
  assert.strictEqual(srs.isMasteredCard(card), true);
}

const root = path.join(__dirname, "..");
const queuesSrc = fs.readFileSync(path.join(root, "review-queues.js"), "utf8");
assert.ok(queuesSrc.includes("sessionCleared"), "row tracks session_clear");
assert.ok(queuesSrc.includes("calendarDay"), "graduation uses calendar-day interval");
assert.ok(!/row\.streak >= WRONG_BOOK_GRADUATE[\s\S]{0,80}row\.active = false/.test(queuesSrc),
  "streak threshold must not directly deactivate the row");

console.log("delay-graduation ok");

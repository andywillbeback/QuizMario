"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const srs = require("../srs-rules");
const rq = require("../review-queues");

const T0 = 1700000000000;

function word(text) {
  return { word: text, meaning_zh: text + "义" };
}

function keyOf(levelIdx, text) {
  return "zhongkao|" + levelIdx + "::" + String(text).toLowerCase();
}

function groups() {
  return [
    { levelIdx: 0, words: [word("alpha"), word("beta"), word("gamma")] },
    { levelIdx: 1, words: [word("delta"), word("epsilon")] },
    { levelIdx: 2, words: [word("zeta")] },
  ];
}

function due(cards, now) {
  return rq.collectDue({
    groups: groups(),
    unlockedLevel: 2,
    cards: cards,
    now: now,
    cardKey: keyOf,
    isNewCard: srs.isNewCard,
    isDue: srs.isDue,
  });
}

assert.strictEqual(rq.continueTarget(0), "latest");
assert.strictEqual(rq.continueTarget(1), "latest");
assert.strictEqual(rq.continueTarget(8), "latest");
assert.strictEqual(rq.isOpenedGroup(0, 1), true);
assert.strictEqual(rq.isOpenedGroup(1, 1), false);
assert.strictEqual(rq.isOpenedGroup(1, 2), true);
assert.strictEqual(rq.WRONG_BOOK_GRADUATE, 2);

{
  const cards = {};
  const alpha = srs.defaultCardProg();
  srs.schedule(alpha, 1, T0);
  srs.schedule(alpha, 1, T0 + 1000);
  alpha.due = T0 - 5000;
  cards[keyOf(0, "alpha")] = alpha;

  const delta = srs.defaultCardProg();
  srs.schedule(delta, 1, T0);
  srs.schedule(delta, 1, T0 + 1000);
  delta.due = T0 - 1000;
  cards[keyOf(1, "delta")] = delta;

  const beta = srs.defaultCardProg();
  cards[keyOf(0, "beta")] = beta;

  const gamma = srs.defaultCardProg();
  srs.schedule(gamma, 1, T0);
  srs.schedule(gamma, 1, T0 + 1000);
  gamma.due = T0 + srs.DAY_MS;
  cards[keyOf(0, "gamma")] = gamma;

  const zeta = srs.defaultCardProg();
  srs.schedule(zeta, 1, T0);
  srs.schedule(zeta, 1, T0 + 1000);
  zeta.due = T0 - 9000;
  cards[keyOf(2, "zeta")] = zeta;

  const learning = srs.defaultCardProg();
  srs.schedule(learning, 0, T0 - srs.LEARN_MS);
  cards[keyOf(1, "epsilon")] = learning;

  const rows = due(cards, T0);
  assert.deepStrictEqual(rows.map((row) => row.word.word), ["alpha", "delta", "epsilon"]);
  assert.ok(rows.every((row) => row.levelIdx < 2), "locked group stays out of 今日到期");
  assert.ok(!rows.some((row) => row.word.word === "beta"), "pure new cards stay out");
  assert.ok(!rows.some((row) => row.word.word === "gamma"), "future reviews stay out");
  assert.ok(rows.some((row) => row.levelIdx === 0) && rows.some((row) => row.levelIdx === 1),
    "due cards from different opened groups share one queue");
}

{
  const book = {};
  const entry = {
    lemmaKey: rq.lemmaKey("zhongkao", "Alpha"),
    lemma: "Alpha",
    track: "zhongkao",
    levelIdx: 0,
    cardKey: keyOf(0, "alpha"),
    now: T0,
  };
  const first = rq.touchWrongBook(book, entry, { wrong: 1 }, "miss");
  assert.strictEqual(first.entered, true);
  assert.strictEqual(book[entry.lemmaKey].active, true);
  assert.strictEqual(book[entry.lemmaKey].streak, 0);
  assert.strictEqual(rq.lemmaKey("zhongkao", " alpha "), entry.lemmaKey);

  let step = rq.noteWrongBookCorrect(book, entry.lemmaKey, 1);
  assert.strictEqual(step.graduated, false);
  assert.strictEqual(step.streak, 1);
  step = rq.noteWrongBookCorrect(book, entry.lemmaKey, 1);
  assert.strictEqual(step.graduated, true);
  assert.strictEqual(book[entry.lemmaKey].active, false);
  assert.strictEqual(book[entry.lemmaKey].wrongAtGrad, 1);
  assert.strictEqual(rq.activeWrongEntries(book, "zhongkao").length, 0);

  assert.strictEqual(rq.scanCumulative(book, [{ ...entry, prog: { wrong: 1 } }]), 0);
  assert.strictEqual(book[entry.lemmaKey].active, false, "same wrong count must not undo graduation");

  const again = rq.touchWrongBook(book, { ...entry, now: T0 + 50 }, { wrong: 2 }, "miss");
  assert.strictEqual(again.entered, true);
  assert.strictEqual(book[entry.lemmaKey].active, true);
  assert.strictEqual(book[entry.lemmaKey].streak, 0);
}

{
  const book = {};
  const once = {
    lemmaKey: "zhongkao::once",
    lemma: "once",
    track: "zhongkao",
    levelIdx: 0,
    cardKey: "zhongkao|0::once",
    prog: { wrong: 1 },
  };
  const twice = {
    lemmaKey: "zhongkao::twice",
    lemma: "twice",
    track: "zhongkao",
    levelIdx: 1,
    cardKey: "zhongkao|1::twice",
    prog: { wrong: 2 },
  };
  assert.strictEqual(rq.scanCumulative(book, [once, twice]), 1);
  assert.ok(!book[once.lemmaKey], "one miss is not enough for the cumulative rule");
  assert.strictEqual(book[twice.lemmaKey].active, true);
  assert.strictEqual(rq.activeWrongEntries(book, "gaokao").length, 0, "错词本 practice stays on the current track");
  const listed = rq.activeWrongEntries(book, "zhongkao");
  assert.strictEqual(listed.length, 1);
  assert.strictEqual(listed[0].lemma, "twice");
}

{
  const due = [
    { key: "a", word: "alpha", dueAt: 1 },
    { key: "b", word: "beta", dueAt: 2 },
  ];
  const wrong = [
    { key: "b", word: "beta", priority: 9 },
    { key: "c", word: "gamma", priority: 2 },
    { cardKey: "c", word: "gamma-again" },
  ];
  const merged = rq.mergePracticeQueue(due, wrong);
  assert.deepStrictEqual(merged.map((row) => row.key || row.cardKey), ["a", "b", "c"]);
  assert.strictEqual(merged[0].fromDue, true);
  assert.strictEqual(merged[0].fromWrong, false);
  assert.strictEqual(merged[1].fromDue, true);
  assert.strictEqual(merged[1].fromWrong, true, "a card in both lists stays once, in the due slot");
  assert.strictEqual(merged[1].word, "beta");
  assert.strictEqual(merged[2].fromDue, false);
  assert.strictEqual(merged[2].fromWrong, true);
  assert.strictEqual(due[1].fromWrong, undefined, "merge does not tag the caller's due row");
  assert.strictEqual(rq.combinedCount(due, wrong), 3);
  assert.strictEqual(rq.combinedCount([{ key: "a" }], [{ key: "a" }]), 1);
  assert.deepStrictEqual(rq.mergePracticeQueue([], [{ key: "only" }]).map((row) => row.key), ["only"]);
  assert.deepStrictEqual(rq.mergePracticeQueue(null, null), []);
}

{
  const day = "2026-10-21";
  const next = "2026-10-22";
  assert.strictEqual(rq.shouldShowSoftGate({ signedIn: true, count: 3, day: day, record: null }), true);
  assert.strictEqual(rq.shouldShowSoftGate({ signedIn: false, count: 3, day: day, record: null }), false);
  assert.strictEqual(rq.shouldShowSoftGate({ signedIn: true, count: 0, day: day, record: null }), false);
  assert.strictEqual(rq.homePrimacy({ count: 0, day: day, record: null }), "hidden");
  assert.strictEqual(rq.homePrimacy({ count: 3, day: day, record: null }), "primary");

  const yesterday = { day: "2026-10-20", started: true, dismissed: true };
  assert.strictEqual(rq.shouldShowSoftGate({ signedIn: true, count: 2, day: day, record: yesterday }), true,
    "a previous day does not suppress today's gate");
  assert.strictEqual(rq.homePrimacy({ count: 2, day: day, record: yesterday }), "primary");

  const dismissed = rq.markDailyGate(null, day, "dismiss");
  assert.deepStrictEqual(dismissed, { day: day, started: false, dismissed: true });
  assert.strictEqual(rq.shouldShowSoftGate({ signedIn: true, count: 5, day: day, record: dismissed }), false,
    "稍后 suppresses the gate for the rest of the day");
  assert.strictEqual(rq.homePrimacy({ count: 5, day: day, record: dismissed }), "primary",
    "稍后 does not demote 今日必练");
  assert.strictEqual(yesterday.started, true, "marking today does not rewrite yesterday");

  const started = rq.markDailyGate(dismissed, day, "start");
  assert.strictEqual(started.started, true);
  assert.strictEqual(started.dismissed, true);
  assert.strictEqual(rq.shouldShowSoftGate({ signedIn: true, count: 5, day: day, record: started }), false);
  assert.strictEqual(rq.homePrimacy({ count: 5, day: day, record: started }), "secondary");
  assert.strictEqual(rq.shouldShowSoftGate({ signedIn: true, count: 5, day: next, record: started }), true,
    "the next calendar day asks again");
  assert.strictEqual(rq.homePrimacy({ count: 5, day: next, record: started }), "primary");
  assert.strictEqual(rq.homePrimacy({ count: 0, day: next, record: started }), "hidden");
}

const root = path.join(__dirname, "..");
const game = fs.readFileSync(path.join(root, "game.js"), "utf8");
const index = fs.readFileSync(path.join(root, "index.html"), "utf8");
assert.ok(index.includes('id="btn-must-practice"'));
assert.ok(index.includes("今日必练"));
assert.ok(index.includes('id="must-gate"'));
assert.ok(index.includes('id="btn-must-start"') && index.includes(">开始</button>"));
assert.ok(index.includes('id="btn-must-later"') && index.includes(">稍后</button>"));
assert.ok(!index.includes('id="btn-due-today"'));
assert.ok(!index.includes('id="btn-wrong-book"'));
assert.ok(index.includes('src="review-queues.js"'));
assert.ok(game.includes("rememberMiss"));
assert.ok(game.includes("noteWrongBookCorrect"));
assert.ok(game.includes("mergePracticeQueue"));
assert.ok(game.includes("shouldShowSoftGate"));
assert.ok(game.includes("homePrimacy"));
assert.ok(game.includes('startQueueSession("must"'));
assert.ok(!game.includes("继续闯关会先练今日到期"));
assert.ok(!game.includes("btn-rate-again"));
assert.ok(game.includes("今天没有到期或错词"));
assert.ok(game.includes("错词本毕业"));

console.log("review-queues ok");

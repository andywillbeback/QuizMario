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
assert.strictEqual(rq.continueTarget(1), "due");
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

const root = path.join(__dirname, "..");
const game = fs.readFileSync(path.join(root, "game.js"), "utf8");
const index = fs.readFileSync(path.join(root, "index.html"), "utf8");
assert.ok(index.includes('id="btn-due-today"'));
assert.ok(index.includes('id="btn-wrong-book"'));
assert.ok(index.includes('src="review-queues.js"'));
assert.ok(game.includes("rememberMiss"));
assert.ok(game.includes("noteWrongBookCorrect"));
assert.ok(game.includes('continueTarget'));
assert.ok(!game.includes("btn-rate-again"));
assert.ok(game.includes("今天没有到期的单词"));
assert.ok(game.includes("错词本还是空的"));

console.log("review-queues ok");

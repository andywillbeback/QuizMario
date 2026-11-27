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

  // Q3: same-day consecutive corrects → session_clear only, not graduate.
  let step = rq.noteWrongBookCorrect(book, entry.lemmaKey, 1, { now: T0 + 1000 });
  assert.strictEqual(step.graduated, false);
  assert.strictEqual(step.sessionCleared, false);
  assert.strictEqual(step.streak, 1);
  step = rq.noteWrongBookCorrect(book, entry.lemmaKey, 1, { now: T0 + 2000 });
  assert.strictEqual(step.graduated, false, "same-session streak must not graduate");
  assert.strictEqual(step.sessionCleared, true);
  assert.strictEqual(book[entry.lemmaKey].active, true, "session_clear keeps the lemma in the book");
  assert.strictEqual(book[entry.lemmaKey].sessionCleared, true);
  assert.strictEqual(rq.activeWrongEntries(book, "zhongkao").length, 1);

  // Delayed correct on a later calendar day → graduate.
  const day2 = T0 + rq.DAY_MS;
  step = rq.noteWrongBookCorrect(book, entry.lemmaKey, 1, { now: day2 });
  assert.strictEqual(step.graduated, true);
  assert.strictEqual(book[entry.lemmaKey].active, false);
  assert.strictEqual(book[entry.lemmaKey].wrongAtGrad, 1);
  assert.strictEqual(rq.activeWrongEntries(book, "zhongkao").length, 0);

  assert.strictEqual(rq.scanCumulative(book, [{ ...entry, prog: { wrong: 1 } }]), 0);
  assert.strictEqual(book[entry.lemmaKey].active, false, "same wrong count must not undo graduation");

  const again = rq.touchWrongBook(book, { ...entry, now: day2 + 50 }, { wrong: 2 }, "miss");
  assert.strictEqual(again.entered, true);
  assert.strictEqual(book[entry.lemmaKey].active, true);
  assert.strictEqual(book[entry.lemmaKey].streak, 0);
  assert.strictEqual(book[entry.lemmaKey].sessionCleared, false);
  assert.strictEqual(book[entry.lemmaKey].lastCorrectAt, 0);
}

{
  // One correct today + one correct tomorrow also graduates (actual interval).
  const book = {};
  const entry = {
    lemmaKey: rq.lemmaKey("zhongkao", "Beta"),
    lemma: "Beta",
    track: "zhongkao",
    levelIdx: 0,
    cardKey: keyOf(0, "beta"),
    now: T0,
  };
  rq.touchWrongBook(book, entry, { wrong: 1 }, "miss");
  const once = rq.noteWrongBookCorrect(book, entry.lemmaKey, 1, { now: T0 + 500 });
  assert.strictEqual(once.graduated, false);
  assert.strictEqual(once.sessionCleared, false);
  const later = rq.noteWrongBookCorrect(book, entry.lemmaKey, 1, { now: T0 + rq.DAY_MS });
  assert.strictEqual(later.graduated, true, "cross-day correct after one prior correct graduates");
  assert.strictEqual(book[entry.lemmaKey].active, false);
}

{
  const book = {};
  const entry = {
    lemmaKey: rq.lemmaKey("zhongkao", "ability"),
    lemma: "ability",
    track: "zhongkao",
    levelIdx: 0,
    cardKey: "zhongkao|0::ability",
    sense_id: "ability.n.能力",
    gloss_zh: "能力",
    pos: "n.",
    now: T0,
  };
  const first = rq.touchWrongBook(book, entry, { wrong: 1 }, "miss");
  assert.strictEqual(first.entered, true);
  assert.strictEqual(book[entry.lemmaKey].sense_id, "ability.n.能力");
  assert.strictEqual(book[entry.lemmaKey].gloss_zh, "能力");
  assert.strictEqual(book[entry.lemmaKey].pos, "n.");
  assert.strictEqual(book[entry.lemmaKey].alsDeepDone, false, "entering 错词本 opens deep-train debt");
  rq.noteWrongBookCorrect(book, entry.lemmaKey, 1, { now: T0 + 100 });
  rq.noteWrongBookCorrect(book, entry.lemmaKey, 1, { now: T0 + 200 });
  assert.strictEqual(book[entry.lemmaKey].active, true, "same-day clear is not graduation");
  assert.strictEqual(book[entry.lemmaKey].sessionCleared, true);
  const graduated = rq.noteWrongBookCorrect(book, entry.lemmaKey, 1, { now: T0 + rq.DAY_MS });
  assert.strictEqual(graduated.graduated, true);
  assert.strictEqual(book[entry.lemmaKey].alsDeepDone, false, "recognition graduation is not an ALS deep pass");
  book[entry.lemmaKey].alsDeepDone = true;
  const back = rq.touchWrongBook(book, { ...entry, now: T0 + 80 }, { wrong: 3 }, "miss");
  assert.strictEqual(back.entered, true);
  assert.strictEqual(book[entry.lemmaKey].alsDeepDone, false, "a new miss owes deep practice again");
  book[entry.lemmaKey].alsDeepDone = true;
  assert.strictEqual(rq.scanCumulative(book, [{ ...entry, prog: { wrong: 4 } }]), 0);
  assert.strictEqual(book[entry.lemmaKey].alsDeepDone, true, "an already-active row keeps a finished deep train");
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
  assert.strictEqual(rq.shouldShowSoftGate({ signedIn: true, onHome: true, count: 3, day: day, record: null }), true);
  assert.strictEqual(rq.shouldShowSoftGate({ signedIn: true, onHome: false, count: 3, day: day, record: null }), false,
    "the exam picker is not the student home");
  assert.strictEqual(rq.shouldShowSoftGate({ signedIn: true, count: 3, day: day, record: null }), false,
    "omitting onHome must not cover 中考/高考");
  assert.strictEqual(rq.shouldShowSoftGate({ signedIn: false, onHome: true, count: 3, day: day, record: null }), false);
  assert.strictEqual(rq.shouldShowSoftGate({ signedIn: true, onHome: true, count: 0, day: day, record: null }), false);
  assert.strictEqual(rq.homePrimacy({ count: 0, day: day, record: null }), "hidden");
  assert.strictEqual(rq.homePrimacy({ count: 3, day: day, record: null }), "primary");

  const yesterday = { day: "2026-10-20", started: true, dismissed: true };
  assert.strictEqual(rq.shouldShowSoftGate({ signedIn: true, onHome: true, count: 2, day: day, record: yesterday }), true,
    "a previous day does not suppress today's gate");
  assert.strictEqual(rq.homePrimacy({ count: 2, day: day, record: yesterday }), "primary");

  const dismissed = rq.markDailyGate(null, day, "dismiss");
  assert.deepStrictEqual(dismissed, { day: day, started: false, dismissed: true });
  assert.strictEqual(rq.shouldShowSoftGate({ signedIn: true, onHome: true, count: 5, day: day, record: dismissed }), false,
    "稍后 suppresses the gate for the rest of the day");
  assert.strictEqual(rq.homePrimacy({ count: 5, day: day, record: dismissed }), "primary",
    "稍后 does not demote 今日必练");
  assert.strictEqual(yesterday.started, true, "marking today does not rewrite yesterday");

  const started = rq.markDailyGate(dismissed, day, "start");
  assert.strictEqual(started.started, true);
  assert.strictEqual(started.dismissed, true);
  assert.strictEqual(rq.shouldShowSoftGate({ signedIn: true, onHome: true, count: 5, day: day, record: started }), false);
  assert.strictEqual(rq.homePrimacy({ count: 5, day: day, record: started }), "secondary");
  assert.strictEqual(rq.shouldShowSoftGate({ signedIn: true, onHome: true, count: 5, day: next, record: started }), true,
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
assert.ok(game.includes("onHome: studentHomeActive()"), "soft gate is tied to the student home");
assert.ok(game.includes("homePrimacy"));
assert.ok(game.includes('startQueueSession("must"'));
assert.ok(!game.includes("继续闯关会先练今日到期"));
assert.ok(!game.includes("btn-rate-again"));
assert.ok(game.includes("今天没有到期或错词"));
assert.ok(game.includes("错词本毕业"));
assert.ok(game.includes("同轮连对≠长期掌握") || game.includes("同轮连对只算当轮清掉"),
  "Q3 copy must say same-session streak is not long-term mastery");
assert.ok(game.includes("隔天"), "Q3 copy must mention delayed / next-day check");

console.log("review-queues ok");

// ALS nominations fill remaining slots and never duplicate a due or wrong card.
{
  const rq = require('../grok/review-queues');
  const queue = rq.mergePracticeQueue([{ key: 'due' }], [{ key: 'wrong' }, { key: 'due' }], [
    { key: 'due', alsReviewAt: 10 }, { key: 'lexical', alsReviewAt: 20 }, { key: 'lexical', alsReviewAt: 30 },
  ]);
  assert.deepStrictEqual(queue.map(item => item.key), ['due', 'wrong', 'lexical']);
  assert.ok(queue[0].fromDue && queue[0].fromWrong && queue[0].fromAls);
  assert.strictEqual(queue[2].alsReviewAt, 30);
  const at = '2026-11-25T00:00:00Z';
  const original = { user_id: 'owner', learner_id: 'owner', created_at: at, headword: 'take part in',
    payload: { attempt_id: 'one', revision: 0, lexical_review: true, status: 'verified', passed: false,
      stage: 'Rebuild', track: 'gaokao', review_gloss_zh: '参加', sense_id: 'take part in' } };
  const correction = { ...original, payload: { ...original.payload, revision: 1, lexical_review: false } };
  assert.deepStrictEqual(rq.alsReviewNominations([original, correction], 'owner'), []);
  assert.deepStrictEqual(rq.alsReviewNominations([original], 'other'), []);
  assert.deepStrictEqual(rq.alsReviewNominations([original], 'owner'), [original]);
  const card = { track: 'gaokao', key: 'gaokao|0::take part in', word: 'take part in',
    sense: 'take part in', meaning_zh: '参加' };
  assert.ok(rq.alsReviewMatches(original, card));
  assert.ok(!rq.alsReviewMatches(original, { ...card, track: 'ielts' }));
  assert.ok(!rq.alsReviewMatches(original, { ...card, meaning_zh: '分担' }));
  assert.ok(!rq.alsReviewMatches(original, { ...card, word: 'take' }));
}

{
  const rq = require("../grok/review-queues");
  const notebook = require("../grok/word-notebook");
  assert.strictEqual(rq.WRONG_BOOK_GRADUATE, 3);
  assert.strictEqual(rq.missTone(0), "");
  assert.strictEqual(rq.missTone(1), notebook.missBand(1).tone);
  assert.strictEqual(rq.missTone(2), notebook.missBand(2).tone);
  assert.strictEqual(rq.missTone(3), notebook.missBand(3).tone);
  assert.strictEqual(rq.missTone(9), notebook.missBand(9).tone);

  const book = {};
  const entry = {
    lemmaKey: "zhongkao::alpha",
    lemma: "alpha",
    track: "zhongkao",
    levelIdx: 0,
    cardKey: "zhongkao|0::alpha",
    gloss_zh: "阿尔法",
    note: "保留",
    now: T0,
  };
  const entered = rq.touchWrongBook(book, entry, { wrong: 4 }, "miss");
  assert.strictEqual(entered.entered, true);
  book[entry.lemmaKey].gloss_zh = "阿尔法";
  book[entry.lemmaKey].note = "保留";
  const day = "2026-11-27";
  let step = rq.noteWrongBookCorrect(book, entry.lemmaKey, 4, { day: day });
  assert.strictEqual(step.graduated, false);
  assert.strictEqual(step.streak, 1);
  step = rq.noteWrongBookCorrect(book, entry.lemmaKey, 4, { day: day });
  assert.strictEqual(step.graduated, false);
  assert.strictEqual(step.streak, 2);
  assert.strictEqual(book[entry.lemmaKey].active, true);
  step = rq.noteWrongBookCorrect(book, entry.lemmaKey, 4, { day: day });
  assert.strictEqual(step.graduated, true);
  assert.strictEqual(step.watching, true);
  assert.strictEqual(book[entry.lemmaKey].active, false);
  assert.strictEqual(book[entry.lemmaKey].watching, true);
  assert.strictEqual(book[entry.lemmaKey].watchedDay, day);
  assert.strictEqual(book[entry.lemmaKey].lemma, "alpha");
  assert.strictEqual(book[entry.lemmaKey].gloss_zh, "阿尔法");
  assert.strictEqual(book[entry.lemmaKey].note, "保留", "three correct answers keep the notebook row");
  assert.strictEqual(rq.activeWrongEntries(book, "zhongkao").length, 0);

  const due = [{ key: "zhongkao|0::alpha", word: "alpha", dueAt: T0 }];
  const today = rq.buildMustQueue(due, [book[entry.lemmaKey]], [], {
    day: day,
    book: book,
    missCount: function () { return 4; },
  });
  assert.deepStrictEqual(today, [], "待观察 stays out of 今日必练 the same day, even when SM-2 is due");
  const tomorrow = rq.buildMustQueue(due, [book[entry.lemmaKey]], [], {
    day: "2026-11-28",
    book: book,
    missCount: function () { return 4; },
  });
  assert.strictEqual(tomorrow.length, 1, "a later day can take the normal due card");
  assert.strictEqual(tomorrow[0].fromDue, true);
  assert.strictEqual(tomorrow[0].fromWrong, false, "the kept row is not wrong-book intake while inactive");

  const again = rq.touchWrongBook(book, Object.assign({}, entry, { now: T0 + 100 }), { wrong: 5 }, "miss");
  assert.strictEqual(again.entered, true);
  assert.strictEqual(book[entry.lemmaKey].active, true);
  assert.strictEqual(book[entry.lemmaKey].watching, false);
  assert.strictEqual(book[entry.lemmaKey].streak, 0);
  assert.strictEqual(book[entry.lemmaKey].note, "保留");
  const back = rq.buildMustQueue([], [book[entry.lemmaKey]], [], {
    day: day,
    book: book,
    missCount: function () { return 5; },
  });
  assert.strictEqual(back.length, 1);
  assert.strictEqual(back[0].fromWrong, true, "a later miss re-enters 今日必练");

  const green = { lemmaKey: "g", cardKey: "g", active: true, lemma: "green" };
  const yellow = { lemmaKey: "y", cardKey: "y", active: true, lemma: "yellow" };
  const red = { lemmaKey: "r", cardKey: "r", active: true, lemma: "be close to" };
  const plain = { lemmaKey: "n", cardKey: "n", active: true, lemma: "plain" };
  const intakeBook = { g: green, y: yellow, r: red, n: plain };
  function intakeCount(item) {
    const id = item.key || item.cardKey;
    if (id === "g" || id === "als-green" || id === "green-due") return 1;
    if (id === "y") return 2;
    if (id === "r") return 4;
    return 0;
  }
  const queued = rq.buildMustQueue(
    [{ key: "due0", word: "plain-due" }, { key: "green-due", word: "once" }],
    [green, yellow, red, plain],
    [{ key: "als-green", alsReviewAt: 1 }, { key: "als-ok", alsReviewAt: 2 }],
    { day: day, book: intakeBook, missCount: intakeCount }
  );
  assert.deepStrictEqual(queued.map(function (item) { return item.key || item.cardKey; }), ["due0", "y", "r", "als-ok"]);
  assert.strictEqual(queued[0].fromDue, true);
  assert.strictEqual(queued[0].fromWrong, false, "an uncolored due card stays on the due path");
  assert.ok(!queued.some(function (item) { return (item.key || item.cardKey) === "g"; }), "green is not added from the wrong book");
  assert.ok(!queued.some(function (item) { return item.key === "green-due"; }), "a green due card does not enter 今日必练");
  assert.ok(queued.some(function (item) { return item.cardKey === "r" && item.lemma === "be close to"; }));

  const srsBefore = { reps: 1, due: T0, wrong: 0, interval: 0 };
  const srsCard = Object.assign({}, srsBefore);
  let hold = {};
  let stepHold = rq.noteMustDayCorrect(hold, "zhongkao|0::plain", day);
  hold = stepHold.hold;
  assert.strictEqual(stepHold.held, false);
  assert.strictEqual(stepHold.streak, 1);
  stepHold = rq.noteMustDayCorrect(hold, "zhongkao|0::plain", day);
  hold = stepHold.hold;
  assert.strictEqual(stepHold.streak, 2);
  const reset = rq.noteMustDayMiss(hold, "zhongkao|0::plain", day);
  assert.strictEqual(reset.held, false);
  assert.strictEqual(reset.streak, 0);
  hold = {};
  for (let n = 0; n < 3; n++) {
    stepHold = rq.noteMustDayCorrect(hold, "zhongkao|0::plain", day);
    hold = stepHold.hold;
  }
  assert.strictEqual(stepHold.held, true);
  assert.strictEqual(stepHold.streak, 3);
  assert.deepStrictEqual(srsCard, srsBefore, "the day hold does not rewrite SRS history");
  assert.strictEqual(Object.keys(book).indexOf("zhongkao|0::plain"), -1, "a due-only hold is not a 错词本 row");
  const dueOnly = [{ key: "zhongkao|0::plain", word: "plain", dueAt: T0 }];
  const heldToday = rq.buildMustQueue(dueOnly, [], [], { day: day, hold: hold, missCount: function () { return 0; } });
  assert.deepStrictEqual(heldToday, [], "three corrects keep a due-only card out for the rest of the day");
  const stillHeld = rq.noteMustDayMiss(hold, "zhongkao|0::plain", day);
  assert.strictEqual(stillHeld.held, true);
  const afterMiss = rq.buildMustQueue(dueOnly, [], [], { day: day, hold: stillHeld.hold, missCount: function () { return 0; } });
  assert.deepStrictEqual(afterMiss, [], "a same-day miss does not bring a held due-only card back");
  const reloaded = rq.normalizeMustDayHold(JSON.parse(JSON.stringify(stillHeld.hold)));
  const afterReload = rq.buildMustQueue(dueOnly, [], [], { day: day, hold: reloaded, missCount: function () { return 0; } });
  assert.deepStrictEqual(afterReload, [], "reloading the same day keeps the hold");
  const later = rq.buildMustQueue(dueOnly, [], [], { day: "2026-11-28", hold: reloaded, missCount: function () { return 0; } });
  assert.strictEqual(later.length, 1);
  assert.strictEqual(later[0].fromDue, true, "the next day can take the normal due card");
  const grokGame = fs.readFileSync(path.join(root, "grok/game.js"), "utf8");
  assert.ok(grokGame.includes("normalizeMustDayHold(data.mustDayHold)"));
  assert.ok(grokGame.includes("noteMustDayCorrect(save.mustDayHold"));
  assert.ok(grokGame.includes("noteMustDayMiss(save.mustDayHold"));
  assert.ok(grokGame.includes("hold: save.mustDayHold"));
  assert.ok(grokGame.includes("continuing: continuingMustItems(day)"));
  assert.ok(grokGame.includes("mustProgressHtml()"));
}

{
  const rq = require("../grok/review-queues");
  const srs = require("../grok/srs-rules");
  const day = "2026-11-27";
  const advice = "zhongkao|0::advice";
  const prog = srs.defaultCardProg();
  srs.schedule(prog, 1, T0);
  assert.strictEqual(prog.due, T0 + srs.LEARN_MS, "first Good still uses the 10-minute step");
  let hold = rq.noteMustDayCorrect({}, advice, day).hold;
  assert.strictEqual(hold[advice].streak, 1);
  assert.strictEqual(hold[advice].held, false);
  const beforeTen = rq.buildMustQueue([], [], [], {
    day: day,
    hold: hold,
    continuing: [{ key: advice, word: "advice" }],
    missCount: function () { return 0; },
  });
  assert.strictEqual(beforeTen.length, 1, "streak 1 stays in 今日必练 before the 10-minute due");
  assert.strictEqual(beforeTen[0].fromContinuing, true);

  srs.schedule(prog, 1, T0 + 1000);
  assert.ok(prog.due >= T0 + 1000 + srs.DAY_MS - 1, "second Good moves SM-2 due out by a day");
  hold = rq.noteMustDayCorrect(hold, advice, day).hold;
  assert.strictEqual(hold[advice].streak, 2);
  assert.strictEqual(hold[advice].held, false);
  const afterDay = rq.buildMustQueue([], [], [], {
    day: day,
    hold: hold,
    continuing: [{ key: advice, word: "advice" }],
    missCount: function () { return 0; },
  });
  assert.strictEqual(afterDay.length, 1, "streak 2 stays even though the card is not due today");
  assert.strictEqual(afterDay[0].key, advice);
  const once = rq.buildMustQueue(
    [{ key: advice, word: "advice", dueAt: prog.due }],
    [],
    [],
    {
      day: day,
      hold: hold,
      continuing: [{ key: advice, word: "advice" }],
      missCount: function () { return 0; },
    }
  );
  assert.strictEqual(once.length, 1, "a still-due streak card is not listed twice");

  const veteran = srs.defaultCardProg();
  srs.schedule(veteran, 1, T0);
  srs.schedule(veteran, 1, T0 + 1);
  const veteranDue = veteran.due;
  srs.schedule(veteran, 1, veteranDue);
  assert.ok(veteran.reps >= 2);
  assert.ok(veteran.due >= veteranDue + srs.DAY_MS, "a card that already had two Goods jumps at least a day");
  const adult = "zhongkao|0::adult";
  const vetHold = rq.noteMustDayCorrect({}, adult, day).hold;
  const vetQueue = rq.buildMustQueue([], [], [], {
    day: day,
    hold: vetHold,
    continuing: [{ key: adult, word: "adult" }],
    missCount: function () { return 0; },
  });
  assert.strictEqual(vetQueue.length, 1, "one Good on an already-solid card still stays until 3");
  assert.strictEqual(vetHold[adult].streak, 1);

  hold = rq.noteMustDayCorrect(hold, advice, day).hold;
  assert.strictEqual(hold[advice].held, true);
  assert.strictEqual(hold[advice].streak, 3);
  const left = rq.buildMustQueue([], [], [], {
    day: day,
    hold: hold,
    continuing: [{ key: advice, word: "advice" }],
    missCount: function () { return 0; },
  });
  assert.deepStrictEqual(left, [], "the third correct removes it as 待观察");
  assert.deepStrictEqual(prog.wrong, 0, "the hold does not rewrite the miss count");

  let partial = rq.noteMustDayCorrect({}, "zhongkao|0::add", day).hold;
  partial = rq.noteMustDayCorrect(partial, "zhongkao|0::add", day).hold;
  partial = rq.noteMustDayMiss(partial, "zhongkao|0::add", day).hold;
  const missed = rq.buildMustQueue([], [], [], {
    day: day,
    hold: partial,
    continuing: [{ key: "zhongkao|0::add", word: "add" }],
    missCount: function () { return 0; },
  });
  assert.deepStrictEqual(missed, [], "a miss before the third correct drops the unheld streak");

  const greenHold = rq.noteMustDayCorrect({}, "green-due", day).hold;
  const greenStay = rq.buildMustQueue([], [], [], {
    day: day,
    hold: greenHold,
    continuing: [{ key: "green-due", word: "once" }],
    missCount: function () { return 1; },
  });
  assert.deepStrictEqual(greenStay, [], "green stays out even with an unheld streak");
}

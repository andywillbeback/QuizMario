"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const loop = require("../home-loop.js");

const quizmarioWrong = { source: "quizmario", event_type: "vocab.answer_wrong", headword: "ability" };
const quizmarioBook = { source: "quizmario", event_type: "vocab.wrong_book_add", headword: "ability" };
const alsUnknown = { source: "als", event_type: "als.session_end" };

assert.strictEqual(loop.alsReturnCounts(null), null);
assert.strictEqual(loop.alsReturnCounts([]), null);
assert.strictEqual(loop.alsReturnCounts([quizmarioWrong, quizmarioBook]), null,
  "wrong-book and due signals are not ALS 补了 / 回流词");
assert.strictEqual(loop.alsReturnCounts([alsUnknown]), null,
  "an unmapped source=als row is not counted");

{
  const hidden = loop.homeLoopStrip({ signedIn: false, onHome: true, mustCount: 4 });
  assert.strictEqual(hidden.visible, false);
  assert.strictEqual(hidden.mode, "hidden");
  assert.strictEqual(hidden.text, "");
}

{
  const exam = loop.homeLoopStrip({ signedIn: true, onHome: false, mustCount: 4 });
  assert.strictEqual(exam.visible, false, "the strip stays off the exam picker");
}

{
  const weak = loop.homeLoopStrip({
    signedIn: true,
    onHome: true,
    mustCount: 3,
    als: loop.alsReturnCounts([quizmarioWrong]),
  });
  assert.strictEqual(weak.visible, true);
  assert.strictEqual(weak.mode, "weak");
  assert.strictEqual(weak.text, "薄弱点 → 今日必练");
  assert.strictEqual(weak.detail, "今日必练 3 道");
  assert.strictEqual(weak.action, "must");
  assert.ok(!/ALS 补了|回流词/.test(weak.text + weak.detail));
}

{
  const empty = loop.homeLoopStrip({ signedIn: true, onHome: true, mustCount: 0, als: null });
  assert.strictEqual(empty.visible, true);
  assert.strictEqual(empty.mode, "weak");
  assert.strictEqual(empty.text, "薄弱点 → 今日必练");
  assert.strictEqual(empty.detail, "今日必练 0 道，继续闯关");
  assert.strictEqual(empty.action, "continue");
}

{
  const als = loop.homeLoopStrip({
    signedIn: true,
    onHome: true,
    mustCount: 2,
    als: { filled: 4, returned: 1 },
  });
  assert.strictEqual(als.mode, "als");
  assert.strictEqual(als.text, "ALS 补了 4 / 回流词 1");
  assert.strictEqual(als.detail, "今日必练 2 道");
  assert.strictEqual(als.action, "must");
}

assert.strictEqual(loop.homeLoopStrip({ signedIn: true, onHome: true, mustCount: 1, als: { filled: 1 } }).mode, "weak",
  "a partial ALS count is not shown");

assert.strictEqual(loop.frontierGroup(4, 20), 4);
assert.strictEqual(loop.frontierGroup(0, 20), 1);
assert.strictEqual(loop.frontierGroup(99, 3), 3);

{
  const plan = loop.clearNextActions({ kind: "must", unlockedLevel: 4, levelCount: 20, left: 0 });
  assert.strictEqual(plan.showFrontier, true);
  assert.strictEqual(plan.showAls, true);
  assert.strictEqual(plan.alsRelevant, true);
  assert.strictEqual(plan.frontier, 4);
  assert.strictEqual(plan.primaryLabel, "继续闯关第 4 组");
  assert.strictEqual(plan.alsLabel, "去 ALS 修语法");
  assert.strictEqual(plan.title, "今日必练清空了");
  assert.strictEqual(plan.nextLine, "练完了，然后继续闯关第 4 组。");
  assert.ok(plan.message.indexOf(plan.nextLine) === 0, plan.message);
  assert.ok(plan.message.indexOf("这批到期的词都见过了") !== -1, plan.message);
  assert.strictEqual(plan.alsHref, "http://127.0.0.1:8501/");
  assert.strictEqual(loop.ALS_GRAMMAR_HREF, "http://127.0.0.1:8501/");
}

{
  const pending = loop.clearNextActions({ kind: "must", unlockedLevel: 4, levelCount: 20, left: 1 });
  assert.strictEqual(pending.left, 1);
  assert.strictEqual(pending.showFrontier, true, "the frontier button stays while cards remain");
  assert.strictEqual(pending.title, "这轮先到这里");
  assert.ok(pending.nextLine.indexOf("这轮做完了") !== -1, pending.nextLine);
  assert.ok(pending.nextLine.indexOf("今天还剩 1 道") !== -1, pending.nextLine);
  assert.ok(pending.message.indexOf("今天还剩 1 道") !== -1, pending.message);
  const said = pending.title + pending.nextLine + pending.message;
  assert.ok(said.indexOf("练完了") === -1, said);
  assert.ok(said.indexOf("清空") === -1, said);
  assert.ok(pending.primaryLabel.indexOf("继续闯关第 4 组") !== -1);
  assert.strictEqual(pending.alsHref, "http://127.0.0.1:8501/");
}

{
  const level = loop.clearNextActions({ kind: "level", unlockedLevel: 4, levelCount: 20 });
  assert.strictEqual(level.showFrontier, false);
  assert.strictEqual(level.showAls, false, "ALS grammar is not the next step after a normal 通关");
  assert.strictEqual(level.showDeep, false);
  const spelling = loop.clearNextActions({ kind: "spelling", unlockedLevel: 2, levelCount: 10 });
  assert.strictEqual(spelling.showAls, false);
  assert.strictEqual(spelling.showDeep, false);
}

const openBook = [
  { active: true, lemma: "ability", gloss_zh: "能力", pos: "n.", track: "zhongkao" },
  { active: true, lemma: "accept", gloss_zh: "接受", pos: "v.", track: "zhongkao", sense_id: "accept.v.接受" },
];
const mixedBook = openBook.concat([
  { active: false, lemma: "gone", gloss_zh: "离开", pos: "v.", track: "zhongkao" },
  { active: true, lemma: "done", gloss_zh: "完成", pos: "v.", track: "zhongkao", sense_id: "done.v.完成", alsDeepDone: true },
]);

{
  const debt = loop.deepTrainDebt(mixedBook);
  assert.strictEqual(debt.length, 2, "inactive and already-qualified senses are not debt");
  assert.deepStrictEqual(debt.map((row) => row.headword), ["ability", "accept"]);
  assert.strictEqual(debt[0].sense_id, "ability.n.能力");
  assert.strictEqual(loop.provisionalSenseId("ability", "n.", "能力"), "ability.n.能力");
}

{
  const still = loop.deepTrainDebt(openBook, [
    { source: "quizmario", event_type: "vocab.wrong_book_add", sense_id: "ability.n.能力" },
    { source: "als", event_type: "als.session_end", sense_id: "ability.n.能力" },
  ]);
  assert.strictEqual(still.length, 2, "quizmario rows and unmapped ALS rows do not clear deep-train debt");
  assert.strictEqual(loop.alsReturnCounts([
    { source: "als", event_type: "sense_return", sense_id: "accept.v.接受" },
  ]), null, "a sense_return is not ALS 补了 / 回流词");
  const left = loop.deepTrainDebt(openBook, [
    { source: "als", event_type: "sense_return", sense_id: "accept.v.接受" },
  ]);
  assert.deepStrictEqual(left.map((row) => row.headword), ["ability"]);
  assert.deepStrictEqual(loop.alsDeepQualifiedIds([
    { source: "als", event_type: "vocab.sense_return", payload: { sense_id: "ability.n.能力" } },
    { source: "als", event_type: "als.session_end", sense_id: "accept.v.接受" },
  ]), ["ability.n.能力"]);
}

{
  const home = loop.homeDeepTrain({
    signedIn: true,
    onHome: true,
    mustCount: 5,
    items: mixedBook,
  });
  assert.strictEqual(home.visible, true, "deep-train CTA stays up while 今日必练 is non-empty");
  assert.strictEqual(home.count, 2);
  assert.strictEqual(home.mustCount, 5);
  assert.strictEqual(home.text, "2 个错词待 ALS 深练");
  assert.ok(home.detail.indexOf("今日必练还没做完") !== -1, home.detail);
  assert.strictEqual(home.primaryLabel, "去 ALS 深练这 2 个错词");
  assert.ok(home.href.indexOf("http://127.0.0.1:8501/") === 0, home.href);
  assert.ok(home.href.indexOf("qm_deep=1") !== -1, home.href);
  assert.ok(home.href.indexOf("deep_train=1") !== -1, home.href);
  assert.ok(home.href.indexOf("sense_ids=") !== -1, home.href);
  {
    const q = home.href.split("?")[1] || "";
    const raw = q.split("&").find((part) => part.indexOf("sense_ids=") === 0);
    assert.ok(raw, home.href);
    assert.strictEqual(decodeURIComponent(raw.slice("sense_ids=".length)), "ability.n.能力,accept.v.接受");
  }
  assert.ok(home.href.indexOf("sense_id=" + encodeURIComponent("ability.n.能力")) !== -1, home.href);
  assert.ok(home.href.indexOf("sense_id=" + encodeURIComponent("accept.v.接受")) !== -1, home.href);
  assert.ok(home.href.indexOf("headword=ability") !== -1, home.href);
  assert.ok(home.href.indexOf("gloss_zh=" + encodeURIComponent("能力")) !== -1, home.href);
  assert.ok(home.href.indexOf("track=zhongkao") !== -1, home.href);
  assert.ok(!/JSONL|ingest|learner_events|schema_version/.test(home.text + home.detail + home.primaryLabel + home.saveLabel),
    "student copy stays human");
  const file = home.handoff;
  assert.strictEqual(file.count, 2);
  assert.ok(file.filename.endsWith(".jsonl"));
  const lines = file.jsonl.trim().split("\n").map((line) => JSON.parse(line));
  assert.strictEqual(lines.length, 2);
  assert.ok(lines.every((row) => row.source === "quizmario" && row.event_type === "vocab.wrong_book_add"));
  assert.ok(lines.every((row) => row.schema_version === 2 && row.run_purpose === "als_deep_train"));
  assert.deepStrictEqual(lines.map((row) => row.headword), ["ability", "accept"]);
  assert.ok(lines.every((row) => row.payload && row.payload.gloss_zh && row.payload.track && row.payload.sense_id));
  assert.ok(!lines.some((row) => row.headword === "done" || row.headword === "gone"));
}

{
  const idle = loop.homeDeepTrain({ signedIn: true, onHome: true, mustCount: 5, items: [] });
  assert.strictEqual(idle.visible, false, "a non-empty 今日必练 queue alone does not show the deep CTA");
  assert.strictEqual(idle.href, "http://127.0.0.1:8501/");
  const loggedOut = loop.homeDeepTrain({ signedIn: false, onHome: true, mustCount: 0, items: openBook });
  assert.strictEqual(loggedOut.visible, false);
  const exam = loop.homeDeepTrain({ signedIn: true, onHome: false, mustCount: 3, items: openBook });
  assert.strictEqual(exam.visible, false, "the exam picker does not show the deep CTA");
  const clearBook = loop.homeDeepTrain({ signedIn: true, onHome: true, mustCount: 0, items: openBook });
  assert.strictEqual(clearBook.visible, true);
  assert.strictEqual(clearBook.text, "2 个错词待 ALS 深练");
  assert.ok(clearBook.detail.indexOf("今日必练还没做完") === -1, clearBook.detail);
}

{
  const both = loop.clearNextActions({
    kind: "must",
    unlockedLevel: 4,
    levelCount: 20,
    left: 3,
    deepItems: mixedBook,
  });
  assert.strictEqual(both.showAls, true, "the grammar side door stays after 今日必练");
  assert.strictEqual(both.alsLabel, "去 ALS 修语法");
  assert.strictEqual(both.alsHref, "http://127.0.0.1:8501/");
  assert.strictEqual(both.showDeep, true, "deep train is offered even though 今日必练 still has 3");
  assert.strictEqual(both.deepText, "2 个错词待 ALS 深练");
  assert.ok(both.deepHref.indexOf("http://127.0.0.1:8501/") === 0, both.deepHref);
  assert.ok(both.deepHref.indexOf("qm_deep=1") !== -1, both.deepHref);
  assert.ok(both.deepHref.indexOf("deep_train=1") !== -1, both.deepHref);
  assert.ok(both.deepHref.indexOf("sense_ids=") !== -1, both.deepHref);
  assert.ok(both.message.indexOf("还有 2 个错词待 ALS 深练") !== -1, both.message);
  assert.ok(both.primaryLabel.indexOf("继续闯关") !== -1);
}

{
  const le = require("../learner-events");
  const rq = require("../review-queues");
  const ability = le.publicEvent(le.fromRemote({
    event_id: "50000000-0000-4000-8000-000000000001",
    learner_id: "11111111-1111-4111-8111-111111111111",
    user_id: "11111111-1111-4111-8111-111111111111",
    source: "als",
    event_type: "sense_return",
    payload: { sense_id: "ability.n.能力" },
    created_at: "2026-10-22T00:00:00.000Z",
  }));
  assert.strictEqual(ability.source, "als");
  const before = loop.homeDeepTrain({ signedIn: true, onHome: true, mustCount: 5, items: openBook });
  assert.strictEqual(before.count, 2);
  const after = loop.homeDeepTrain({
    signedIn: true,
    onHome: true,
    mustCount: 5,
    items: openBook,
    events: [ability],
  });
  assert.strictEqual(after.visible, true);
  assert.strictEqual(after.count, 1, "one matching sense_return drops the deep CTA count");
  assert.strictEqual(after.text, "1 个错词待 ALS 深练");
  assert.deepStrictEqual(after.items.map((row) => row.headword), ["accept"]);
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
    now: 1700000000000,
  };
  rq.touchWrongBook(book, entry, { wrong: 1 }, "miss");
  assert.strictEqual(loop.markDeepQualified(book, [ability]), true);
  assert.strictEqual(book[entry.lemmaKey].alsDeepDone, true);
  rq.touchWrongBook(book, { ...entry, now: 1700000005000 }, { wrong: 2 }, "miss");
  assert.strictEqual(book[entry.lemmaKey].alsDeepDone, false, "a new miss clears alsDeepDone again");
  const accept = le.publicEvent(le.fromRemote({
    event_id: "50000000-0000-4000-8000-000000000002",
    learner_id: "11111111-1111-4111-8111-111111111111",
    user_id: "11111111-1111-4111-8111-111111111111",
    source: "als",
    event_type: "als.sense_return",
    payload: { sense_id: "accept.v.接受" },
    created_at: "2026-10-22T01:00:00.000Z",
  }));
  const both = loop.homeDeepTrain({
    signedIn: true,
    onHome: true,
    mustCount: 5,
    items: openBook,
    events: [
      ability,
      accept,
      { source: "als", event_type: "vocab.sense_return", payload: { sense_id: "ability.n.能力" } },
    ],
  });
  assert.strictEqual(both.visible, false, "empty debt hides the deep CTA");
  assert.strictEqual(both.count, 0);
  assert.strictEqual(loop.alsReturnCounts([ability, accept]), null);
}

{
  const le = require("../learner-events");
  const rq = require("../review-queues");
  const missBefore = Date.parse("2026-10-22T01:00:00.000Z");
  const missAfter = Date.parse("2026-10-22T03:00:00.000Z");
  const returned = le.publicEvent(le.fromRemote({
    event_id: "50000000-0000-4000-8000-000000000011",
    learner_id: "11111111-1111-4111-8111-111111111111",
    user_id: "11111111-1111-4111-8111-111111111111",
    source: "als",
    event_type: "sense_return",
    payload: { sense_id: "ability.n.能力" },
    created_at: "2026-10-22T02:00:00.000Z",
  }));
  const entry = {
    lemmaKey: rq.lemmaKey("zhongkao", "ability"),
    lemma: "ability",
    track: "zhongkao",
    levelIdx: 0,
    cardKey: "zhongkao|0::ability",
    sense_id: "ability.n.能力",
    gloss_zh: "能力",
    pos: "n.",
    now: missBefore,
  };
  const book = {};
  rq.touchWrongBook(book, entry, { wrong: 1 }, "miss");
  function paint(events) {
    loop.markDeepQualified(book, events);
    return loop.homeDeepTrain({
      signedIn: true,
      onHome: true,
      mustCount: 1,
      items: [book[entry.lemmaKey]],
      events: events,
    });
  }
  const cleared = paint([returned]);
  assert.strictEqual(book[entry.lemmaKey].alsDeepDone, true, "a return newer than the miss sets alsDeepDone");
  assert.strictEqual(cleared.visible, false, "pull + apply still hides the deep CTA");
  rq.touchWrongBook(book, { ...entry, now: missAfter }, { wrong: 2 }, "miss");
  assert.strictEqual(book[entry.lemmaKey].alsDeepDone, false, "a new miss clears alsDeepDone");
  const owed = loop.deepTrainDebt([book[entry.lemmaKey]], [returned]);
  assert.strictEqual(owed.length, 1, "a return older than the miss is not live debt clearance");
  assert.strictEqual(owed[0].headword, "ability");
  const plan = loop.clearNextActions({
    kind: "must",
    unlockedLevel: 2,
    levelCount: 10,
    left: 0,
    deepItems: [book[entry.lemmaKey]],
    events: [returned],
  });
  assert.strictEqual(plan.showDeep, true, "今日必练 clear still offers deep train after the new miss");
  const reopened = paint([returned]);
  assert.strictEqual(book[entry.lemmaKey].alsDeepDone, false, "home repaint does not reapply the old sense_return");
  assert.strictEqual(reopened.visible, true, "the deep CTA comes back after the new miss");
  assert.strictEqual(reopened.count, 1);
  assert.deepStrictEqual(reopened.items.map((row) => row.headword), ["ability"]);
  const again = le.publicEvent(le.fromRemote({
    event_id: "50000000-0000-4000-8000-000000000012",
    learner_id: "11111111-1111-4111-8111-111111111111",
    user_id: "11111111-1111-4111-8111-111111111111",
    source: "als",
    event_type: "vocab.sense_return",
    payload: { sense_id: "ability.n.能力" },
    created_at: "2026-10-22T04:00:00.000Z",
  }));
  const closed = paint([returned, again]);
  assert.strictEqual(book[entry.lemmaKey].alsDeepDone, true, "a return newer than the latest miss qualifies again");
  assert.strictEqual(closed.visible, false, "the new qualification hides the deep CTA");
}

const root = path.join(__dirname, "..");
const index = fs.readFileSync(path.join(root, "index.html"), "utf8");
const game = fs.readFileSync(path.join(root, "game.js"), "utf8");
assert.ok(index.includes('id="home-loop"'));
assert.ok(index.includes("薄弱点 → 今日必练"));
assert.ok(index.includes("ALS ↔ QuizMario"));
assert.ok(index.includes('id="btn-clear-continue"'));
assert.ok(index.includes('id="btn-clear-als"'));
assert.ok(index.includes("去 ALS 修语法"));
assert.ok(index.includes('id="als-deep"') && index.includes('id="btn-als-deep"'), "home deep-train CTA");
assert.ok(index.includes('id="btn-must-gate-als"'), "soft gate keeps a deep-train path");
assert.ok(index.includes('id="btn-clear-deep"'), "must-clear can open deep train too");
assert.ok(!index.includes("下载 JSONL") && !index.includes("复制 JSONL"), "home HTML does not dump JSONL");
assert.ok(index.includes(loop.ALS_GRAMMAR_HREF));
const alsAt = index.indexOf('id="btn-clear-als"');
const alsTag = index.slice(alsAt, index.indexOf("</a>", alsAt));
assert.ok(alsTag.includes('href="http://127.0.0.1:8501/"'), alsTag);
assert.ok(alsTag.includes('target="_blank"'), alsTag);
assert.ok(alsTag.includes('rel="noopener noreferrer"'), alsTag);
assert.ok(!alsTag.includes("als-placeholder"));
assert.ok(!index.includes("als-placeholder"));
assert.ok(!index.includes("andywillbeback.github.io/#als"));
assert.ok(!game.includes("als-placeholder"));
assert.ok(index.includes('src="home-loop.js"'));
assert.ok(game.includes("alsReturnCounts"));
assert.ok(game.includes("homeDeepTrain"));
assert.ok(game.includes("renderAlsDeep"));
assert.ok(game.includes("markDeepQualified"), "home applies pulled sense_return onto alsDeepDone");
assert.ok(
  /function deepTrainSourceRows[\s\S]*lastMissAt:\s*row\.lastMissAt/.test(game),
  "home paint carries lastMissAt so an older return cannot requalify"
);
assert.ok(game.includes("clearNextActions"));
assert.ok(game.includes("plan.title"));
assert.ok(game.includes("plan.message"));
assert.ok(!game.includes("这轮今日必练练完了"), "a round with cards left must not say the day is finished");
assert.ok(game.includes("startFrontierLevel"));
assert.ok(!/ALS 补了 \d/.test(game), "game.js must not hardcode an ALS filled count");

console.log("home-loop ok");

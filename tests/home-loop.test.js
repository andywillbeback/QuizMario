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
  assert.strictEqual(plan.nextLine, "练完了，然后继续闯关第 4 组。");
  assert.strictEqual(plan.alsHref, "https://andywillbeback.github.io/#als-placeholder");
  assert.strictEqual(plan.alsPlaceholder, true);
}

{
  const level = loop.clearNextActions({ kind: "level", unlockedLevel: 4, levelCount: 20 });
  assert.strictEqual(level.showFrontier, false);
  assert.strictEqual(level.showAls, false, "ALS grammar is not the next step after a normal 通关");
  const spelling = loop.clearNextActions({ kind: "spelling", unlockedLevel: 2, levelCount: 10 });
  assert.strictEqual(spelling.showAls, false);
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
assert.ok(index.includes(loop.ALS_GRAMMAR_HREF));
assert.ok(index.includes('data-als-placeholder="true"'));
assert.ok(index.includes('src="home-loop.js"'));
assert.ok(game.includes("alsReturnCounts"));
assert.ok(game.includes("clearNextActions"));
assert.ok(game.includes("startFrontierLevel"));
assert.ok(!/ALS 补了 \d/.test(game), "game.js must not hardcode an ALS filled count");

console.log("home-loop ok");

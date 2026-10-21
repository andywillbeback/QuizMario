"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const story = require("../progress-narrative.js");

const root = path.join(__dirname, "..");

function linesOf(opts) {
  return story.todayNarrative(opts).lines;
}

{
  const hidden = story.todayNarrative({ signedIn: false, onHome: true, mustCount: 4, frontier: 3 });
  assert.strictEqual(hidden.visible, false);
  assert.deepStrictEqual(hidden.lines, []);
}

{
  const gate = story.todayNarrative({ signedIn: true, onHome: false, mustCount: 4, frontier: 3, topMiss: "form" });
  assert.strictEqual(gate.visible, false, "the story stays off the exam picker");
  assert.deepStrictEqual(gate.lines, []);
}

{
  const fresh = story.todayNarrative({ signedIn: true, onHome: true, mustCount: 0, mustStarted: false, frontier: 1 });
  assert.strictEqual(fresh.visible, true);
  assert.deepStrictEqual(fresh.lines, ["今天没有必练。"]);
}

{
  const left = story.todayNarrative({ signedIn: true, onHome: true, mustCount: 3, frontier: 1 });
  assert.deepStrictEqual(left.lines, ["今日必练还剩 3 道。"]);
}

{
  const cleared = story.todayNarrative({
    signedIn: true,
    onHome: true,
    mustCount: 0,
    mustStarted: true,
    frontier: 2,
    setsCleared: 1,
  });
  assert.deepStrictEqual(cleared.lines, [
    "今日必练已经清完。",
    "已经通关 1 组，现在在第 2 组。",
  ]);
}

{
  const placed = story.todayNarrative({
    signedIn: true,
    onHome: true,
    mustCount: 0,
    frontier: 1,
    placement: { done: true, set: 1, correct: 0, total: 10 },
  });
  assert.deepStrictEqual(placed.lines, [
    "今天没有必练。",
    "摸底做完了，从第 1 组开始。",
  ]);
  assert.ok(!placed.lines.some((line) => line.indexOf("现在在第 1 组") !== -1), "placement already names that set");
}

{
  const planted = story.todayNarrative({
    signedIn: true,
    onHome: true,
    mustCount: 1,
    mustStarted: false,
    frontier: 4,
    setsCleared: 0,
    topMiss: "form",
  });
  assert.deepStrictEqual(planted.lines, [
    "今日必练还剩 1 道。",
    "现在在第 4 组。",
    "最近错过的，主要是形近。",
  ]);
}

{
  const full = story.todayNarrative({
    signedIn: true,
    onHome: true,
    mustCount: 2.8,
    mustStarted: true,
    frontier: 5,
    setsCleared: 2,
    placement: { done: true, set: 2 },
    topMiss: "sense",
  });
  assert.strictEqual(full.lines.length, story.MAX_LINES);
  assert.deepStrictEqual(full.lines, [
    "今日必练还剩 2 道。",
    "已经通关 2 组，现在在第 5 组。",
    "摸底做完了，从第 2 组开始。",
  ]);
  assert.ok(full.lines.join("").indexOf("义近") === -1, "a fourth fact stays off the story");
}

{
  const sense = linesOf({ signedIn: true, onHome: true, mustCount: 0, frontier: 1, topMiss: "sense" }).join("");
  assert.ok(sense.indexOf("最近错过的，主要是义近。") !== -1);
  const pos = linesOf({ signedIn: true, onHome: true, mustCount: 0, frontier: 1, topMiss: "pos" }).join("");
  assert.ok(pos.indexOf("最近错过的，主要是词性。") !== -1);
  const other = linesOf({ signedIn: true, onHome: true, mustCount: 0, frontier: 1, topMiss: "other" }).join("");
  assert.ok(other.indexOf("还没归进形近、义近或词性") !== -1, other);
}

{
  const skipped = story.todayNarrative({
    signedIn: true,
    onHome: true,
    mustCount: 0,
    frontier: 4,
    placement: { done: false, set: 4 },
    topMiss: "nope",
  });
  assert.deepStrictEqual(skipped.lines, [
    "今天没有必练。",
    "现在在第 4 组。",
  ]);
}

{
  const moved = story.todayNarrative({
    signedIn: true,
    onHome: true,
    mustCount: 0,
    frontier: 4,
    placement: { done: true, set: 2 },
    topMiss: "pos",
  });
  assert.deepStrictEqual(moved.lines, [
    "今天没有必练。",
    "现在在第 4 组。",
    "摸底做完了，从第 2 组开始。",
  ]);
}

{
  const text = linesOf({
    signedIn: true,
    onHome: true,
    mustCount: 1,
    frontier: 3,
    setsCleared: 2,
    placement: { done: true, set: 1 },
    topMiss: "form",
  }).join("");
  assert.ok(!/太棒了|加油|连击|挑战成功|传奇|Godlike|Unstoppable/.test(text), text);
}

const index = fs.readFileSync(path.join(root, "index.html"), "utf8");
const game = fs.readFileSync(path.join(root, "game.js"), "utf8");
assert.ok(index.includes('id="today-narrative"'));
assert.ok(index.includes('id="today-narrative-lines"'));
assert.ok(index.includes('src="progress-narrative.js"'));
assert.ok(index.indexOf('src="progress-narrative.js"') < index.indexOf('src="game.js"'));
assert.ok(index.indexOf('id="home-loop"') < index.indexOf('id="today-narrative"'));
assert.ok(index.indexOf('id="miss-reasons"') < index.indexOf('id="today-narrative"'));
assert.ok(game.includes("renderTodayNarrative"));
assert.ok(game.includes("todayNarrative"));
assert.ok(game.includes("onHome: studentHomeActive()"));

console.log("progress-narrative ok");

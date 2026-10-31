/* 固定搭配 sets stay playable ahead of unlockedLevel.
 * Ordinary vocab sets still open one frontier step at a time.
 * Run: node tests/colloc-unlock.test.js
 */
"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const game = fs.readFileSync(path.join(root, "grok/game.js"), "utf8");
const rq = require("../grok/review-queues");

function loadTracks() {
  const ctx = { window: {} };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(root, "grok/exam-tracks.js"), "utf8"), ctx);
  return ctx.window.VOCAB_EXAM_TRACKS;
}

function loadRules() {
  const start = game.indexOf("function titleAlwaysUnlocked");
  const end = game.indexOf("function isAlwaysUnlockedSet");
  assert.ok(start !== -1 && end > start, "pure unlock helpers stay extractable");
  const src = game.slice(start, end);
  assert.ok(!src.includes("save."), "title lock must not read the save");
  assert.ok(!src.includes("setTitle"), "the pure helpers take a title, game.js wraps setTitle");
  return new Function(src + "\nreturn { titleAlwaysUnlocked, setIsLocked, frontierAfterClear };")();
}

const rules = loadRules();
const tracks = loadTracks();
const zk = tracks.find((t) => t.id === "zhongkao");
const gk = tracks.find((t) => t.id === "gaokao");

const ZK_COLLOC = [
  "中考·固定搭配 1", "中考·固定搭配 2", "中考·固定搭配 3", "中考·固定搭配 4",
  "中考·固定搭配 5", "中考·固定搭配 6", "中考·固定搭配 7", "中考·固定搭配 8",
  "中考·固定搭配 9", "中考·固定搭配 10", "中考·固定搭配 11",
];
const GK_COLLOC = [
  "高考·固定搭配 1", "高考·固定搭配 2", "高考·固定搭配 3", "高考·固定搭配 4",
  "高考·固定搭配 5", "高考·固定搭配 6", "高考·固定搭配 7", "高考·固定搭配 8",
  "高考·固定搭配 9", "高考·固定搭配 10", "高考·固定搭配 11",
];

assert.deepStrictEqual(Array.from(zk.titles.slice(58)), ZK_COLLOC);
assert.deepStrictEqual(Array.from(gk.titles.slice(86)), GK_COLLOC);
assert.strictEqual(zk.titles.length, 69);
assert.strictEqual(gk.titles.length, 97);

function collocLevels(titles) {
  const levels = [];
  titles.forEach((title, i) => {
    if (rules.titleAlwaysUnlocked(title)) levels.push(i + 1);
  });
  return levels;
}

assert.deepStrictEqual(collocLevels(zk.titles), [59, 60, 61, 62, 63, 64, 65, 66, 67, 68, 69]);
assert.deepStrictEqual(collocLevels(gk.titles), [87, 88, 89, 90, 91, 92, 93, 94, 95, 96, 97]);

for (const track of tracks) {
  track.titles.forEach((title, i) => {
    const level = i + 1;
    const colloc = rules.titleAlwaysUnlocked(title);
    assert.strictEqual(rules.setIsLocked(level, 1, title), colloc ? false : level > 1, track.id + " " + title);
    if (!colloc) {
      assert.strictEqual(rules.setIsLocked(level, level, title), false, title);
      assert.strictEqual(rules.setIsLocked(level, level - 1, title), level > 1, title);
    }
  });
}

{
  assert.strictEqual(rules.frontierAfterClear(59, 1, 69), 1, "clearing 中考·固定搭配 1 must not open vocab 2–58");
  assert.strictEqual(rules.frontierAfterClear(97, 1, 97), 1, "clearing the last 高考 colloc set must not open the track");
  assert.strictEqual(rules.frontierAfterClear(1, 1, 69), 2, "clearing the frontier still opens the next vocab set");
  assert.strictEqual(rules.frontierAfterClear(58, 58, 69), 59, "the frontier may walk into the first colloc set");
  assert.strictEqual(rules.frontierAfterClear(59, 59, 69), 60, "a colloc set that is the frontier still opens the next one");
  assert.strictEqual(rules.frontierAfterClear(69, 69, 69), 69, "the last set does not grow unlockedLevel");
  assert.strictEqual(rules.frontierAfterClear(4, 10, 69), 10, "replaying an earlier set does not move the frontier");
  assert.strictEqual(rules.setIsLocked(2, rules.frontierAfterClear(59, 1, 69), zk.titles[1]), true);
  assert.strictEqual(rules.setIsLocked(58, 1, zk.titles[57]), true, "last vocab set stays locked at unlock 1");
  assert.strictEqual(rules.setIsLocked(59, 1, zk.titles[58]), false);
  assert.strictEqual(rules.setIsLocked(69, 1, zk.titles[68]), false);
  assert.strictEqual(rules.setIsLocked(86, 1, gk.titles[85]), true, "last 高考 vocab set stays locked");
  assert.strictEqual(rules.setIsLocked(87, 1, gk.titles[86]), false);
  assert.strictEqual(rules.titleAlwaysUnlocked(""), false);
  assert.strictEqual(rules.titleAlwaysUnlocked("中考 · 第1组"), false);
}

function openedIdxs(titles, unlockedLevel) {
  const limit = Math.min(titles.length, Math.max(1, Math.floor(Number(unlockedLevel) || 1)));
  const idxs = [];
  for (let li = 0; li < titles.length; li++) {
    if (li < limit || rules.titleAlwaysUnlocked(titles[li])) idxs.push(li);
  }
  return idxs;
}

{
  assert.deepStrictEqual(openedIdxs(zk.titles, 1), [0, 58, 59, 60, 61, 62, 63, 64, 65, 66, 67, 68]);
  assert.deepStrictEqual(openedIdxs(gk.titles, 1).slice(0, 2), [0, 86]);
  assert.strictEqual(openedIdxs(gk.titles, 1).length, 12);
  const mid = openedIdxs(zk.titles, 10);
  assert.deepStrictEqual(mid.slice(0, 10), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.ok(!mid.includes(10), "vocab set 11 stays closed");
  assert.ok(mid.includes(58) && mid.includes(68));
}

{
  const now = 1700000000000;
  const idxs = openedIdxs(zk.titles, 1);
  const groups = idxs.map((li) => ({ levelIdx: li, words: [{ word: "w" + li }] }));
  let openedThrough = 1;
  for (const li of idxs) openedThrough = Math.max(openedThrough, li + 1);
  const dueProg = { state: "review", due: now - 1000 };
  const cards = {};
  cards["k0"] = dueProg;
  cards["k1"] = dueProg;
  cards["k58"] = dueProg;
  const rows = rq.collectDue({
    groups: groups,
    unlockedLevel: openedThrough,
    cards: cards,
    now: now,
    cardKey: function (levelIdx) { return "k" + levelIdx; },
    isNewCard: function (prog) { return !prog || prog.state === "new"; },
    isDue: function (prog, at) { return !!(prog && prog.due <= at); },
  });
  assert.deepStrictEqual(rows.map((row) => row.levelIdx), [0, 58]);
  assert.ok(!groups.some((group) => group.levelIdx === 1), "locked vocab is not even offered to collectDue");
}

{
  const render = game.slice(game.indexOf("function renderLevels"), game.indexOf("function schedule"));
  assert.ok(render.includes("const locked = isSetLocked(i)"));
  assert.ok(render.includes('startLevel(i, { mode: "challenge" })'));
  assert.ok(!render.includes("i > save.unlockedLevel"));

  const start = game.slice(game.indexOf("function startLevel"), game.indexOf("function injectRequeues"));
  assert.ok(start.indexOf("isSetPlayable") < start.indexOf("collocFlow.abandon()"));
  assert.ok(start.includes("collocFlow.abandon()"));

  const confirm = game.slice(game.indexOf("function confirmCorrect"), game.indexOf("function bindCollocFlow"));
  assert.ok(confirm.includes("if (isLevelClear(currentLevel)) advanceFrontier(currentLevel)"));
  assert.ok(!confirm.includes("currentLevel >= save.unlockedLevel"));
  assert.ok(confirm.includes("schedule("));

  const clearFn = game.slice(game.indexOf("function onLevelClear"), game.indexOf("function setBackupStatus"));
  assert.ok(clearFn.includes("advanceFrontier(currentLevel)"));
  assert.ok(!clearFn.includes("currentLevel >= save.unlockedLevel"));

  const nextAt = game.indexOf("$(\"btn-next-level\").addEventListener");
  assert.ok(nextAt !== -1, "next-set handler stays on btn-next-level");
  const next = game.slice(nextAt, nextAt + 700);
  assert.ok(next.includes("advanceFrontier(currentLevel)"));
  assert.ok(next.includes("isSetPlayable(next)"));
  assert.ok(next.includes("startLevel(next)"));
  assert.ok(!next.includes("save.unlockedLevel = next"));

  const due = game.slice(game.indexOf("function dueQueueItems"), game.indexOf("function wrongBookQueueItems"));
  assert.ok(due.includes("openedLevelIdxs()"));
  assert.ok(!due.includes("save.trackUnlock"), "due review must not rewrite the frontier");
  const scan = game.slice(game.indexOf("function scanWrongBook"), game.indexOf("function dueQueueItems"));
  assert.ok(scan.includes("openedLevelIdxs()"));

  const home = game.slice(game.indexOf("$(\"btn-continue\")"), game.indexOf("$(\"btn-levels\")"));
  assert.ok(home.includes("save.unlockedLevel"));
  assert.ok(!home.includes("isAlwaysUnlockedSet"), "home continue and challenge stay on the vocab frontier");
}

console.log("colloc-unlock ok", {
  zhongkao: collocLevels(zk.titles),
  gaokao: collocLevels(gk.titles),
});

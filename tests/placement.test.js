"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const PL = require("../placement.js");
const merge = require("../sync-merge.js");

function read(name) {
  return fs.readFileSync(path.join(root, name), "utf8");
}

function loadExamTracks() {
  const ctx = { window: {} };
  vm.createContext(ctx);
  vm.runInContext(read("exam-tracks.js"), ctx);
  return ctx.window.VOCAB_EXAM_TRACKS;
}

const empty = { signedIn: true, trackId: "zhongkao", cards: {}, unlockedLevel: 1, placement: {} };

assert.strictEqual(PL.needsPlacement(empty), true, "a signed-in exam with no progress places");
assert.strictEqual(PL.needsPlacement(Object.assign({}, empty, { trackId: "gaokao" })), true);
assert.strictEqual(PL.needsPlacement(Object.assign({}, empty, { signedIn: false })), false, "unsigned students are not placed");
assert.strictEqual(PL.needsPlacement(Object.assign({}, empty, { trackId: "ket" })), false, "only 中考/高考");
assert.strictEqual(PL.needsPlacement(Object.assign({}, empty, { trackId: "core" })), false);
assert.strictEqual(PL.needsPlacement(Object.assign({}, empty, { unlockedLevel: 2 })), false, "a moved frontier is progress");
assert.strictEqual(PL.needsPlacement(Object.assign({}, empty, {
  placement: { zhongkao: { done: true, correct: 4, total: 10, set: 2 } },
})), false, "a finished placement is not asked again");
assert.strictEqual(PL.needsPlacement(Object.assign({}, empty, {
  cards: { "zhongkao|0::apple": { reps: 1, correct: 1, wrong: 0, mastery: 1, state: "learning" } },
})), false, "an answered card on this exam skips placement");
assert.strictEqual(PL.needsPlacement(Object.assign({}, empty, {
  cards: { "zhongkao|0::apple": { reps: 0, correct: 0, wrong: 0, mastery: 0, state: "new" } },
})), true, "an untouched stub is not progress");
assert.strictEqual(PL.needsPlacement(Object.assign({}, empty, {
  cards: { "gaokao|0::apple": { reps: 2, correct: 2, wrong: 0, mastery: 1 } },
})), true, "the other exam's cards do not skip 中考");
assert.strictEqual(PL.needsPlacement(Object.assign({}, empty, {
  cards: { "zhongkao|3::spell": { reps: 0, correct: 0, wrong: 0, mastery: 0, spelling: { correct: 1, wrong: 0, unknown: 0 } } },
})), false, "spelling practice on this exam is progress");

assert.strictEqual(PL.startingSet(0, 10, 58), 1);
assert.strictEqual(PL.startingSet(3, 10, 58), 1, "under 40% stays on set 1");
assert.strictEqual(PL.startingSet(4, 10, 58), 2);
assert.strictEqual(PL.startingSet(6, 10, 58), 2);
assert.strictEqual(PL.startingSet(7, 10, 58), 3, "70% is mid-early");
assert.strictEqual(PL.startingSet(8, 10, 58), 3);
assert.strictEqual(PL.startingSet(9, 10, 58), 4);
assert.strictEqual(PL.startingSet(10, 10, 58), 4, "a perfect probe still stays early");
assert.strictEqual(PL.startingSet(10, 10, 2), 2, "clamp to the track");
assert.strictEqual(PL.startingSet(10, 10, 3), 3);
assert.strictEqual(PL.startingSet(0, 0, 58), 1);

{
  const tracks = loadExamTracks();
  for (const id of ["zhongkao", "gaokao"]) {
    const track = tracks.find((t) => t.id === id);
    assert.ok(track && track.sets.length > 4, id);
    const first = PL.probeItems(track.sets, PL.ITEM_COUNT);
    const second = PL.probeItems(track.sets, PL.ITEM_COUNT);
    assert.strictEqual(first.length, 10, id + " deals 10");
    assert.deepStrictEqual(first, second, id + " probe is stable");
    const words = {};
    const glosses = {};
    for (const item of first) {
      assert.ok(item.levelIdx >= 0 && item.levelIdx < PL.EARLY_SETS, id + " stays in the early window");
      assert.ok(item.word && item.meaning_zh);
      assert.ok(!words[item.word.toLowerCase()], "duplicate word " + item.word);
      assert.ok(!glosses[item.meaning_zh], "duplicate gloss " + item.meaning_zh);
      words[item.word.toLowerCase()] = true;
      glosses[item.meaning_zh] = true;
      const set = track.sets[item.levelIdx];
      assert.ok(set.some((card) => card.word === item.word), item.word + " is in set " + (item.levelIdx + 1));
    }
  }
}

{
  const tiny = [[{ word: "a", meaning_zh: "一" }, { word: "b", meaning_zh: "二" }]];
  const few = PL.probeItems(tiny, 10);
  assert.strictEqual(few.length, 2, "a short set does not invent items");
  assert.deepStrictEqual(few.map((item) => item.word), ["a", "b"]);
}

assert.strictEqual(PL.itemLabel(1, 10), "摸底 1/10");
assert.ok(PL.itemNote(10).includes("10") && PL.itemNote(10).includes("看英文选中文"));
{
  const msg = PL.resultMessage({ correct: 7, total: 10, setTitle: "中考 · 第3组", set: 3 });
  assert.ok(msg.includes("摸底 7/10"), msg);
  assert.ok(msg.includes("这是你的起始组：中考 · 第3组"), msg);
  assert.strictEqual(PL.RESULT_TITLE, "起始组");
  assert.strictEqual(PL.ENTER_LABEL, "进入起始组");
  assert.ok(PL.starterNote("中考 · 第3组").includes("这是你的起始组：中考 · 第3组"));
}

{
  const saved = PL.normalizePlacement({
    zhongkao: { done: true, correct: 9, total: 10, set: 4, at: "2026-10-21T00:00:00.000Z" },
    ket: { done: true, set: 2 },
    gaokao: { done: false, set: 3 },
    junk: { done: true },
  });
  assert.deepStrictEqual(Object.keys(saved), ["zhongkao"]);
  assert.strictEqual(saved.zhongkao.set, 4);
  assert.strictEqual(PL.needsPlacement({
    signedIn: true,
    trackId: "gaokao",
    cards: {},
    unlockedLevel: 1,
    placement: saved,
  }), true, "a 中考 placement does not finish 高考");
}

assert.strictEqual(merge.isBlank({
  points: 0,
  unlockedLevel: 1,
  cards: {},
  placement: { zhongkao: { done: true, correct: 2, total: 10, set: 1 } },
}), false, "a finished placement must sync, even when the start set is 1");
assert.strictEqual(merge.isBlank({ points: 0, unlockedLevel: 1, cards: {}, placement: {} }), true);

const index = read("index.html");
const game = read("game.js");
assert.ok(index.includes('src="placement.js"'), "placement.js loads");
assert.ok(index.indexOf('src="placement.js"') < index.indexOf('src="game.js"'), "placement.js loads before game.js");
assert.ok(index.includes('id="placement-note"'));
assert.ok(index.includes('id="btn-placement-enter"') && index.includes("进入起始组"));
assert.ok(index.includes('id="btn-must-practice"') && index.includes("今日必练"), "今日必练 stays on home");
assert.ok(index.includes('id="must-gate"') && index.includes('id="home-loop"'), "soft gate and home loop stay");
assert.ok(game.includes("needsPlacement"));
assert.ok(game.includes('sessionKind === "placement"') || game.includes('sessionKind = "placement"'));
assert.ok(game.includes("debugFinishPlacement"));
assert.ok(game.includes("starter: true") || game.includes("starter:true") || game.includes("opts.starter"));
assert.ok(game.includes("normalizePlacement"));

{
  const start = game.indexOf("function gradePlacement");
  const end = game.indexOf("\n  function grade(", start);
  assert.ok(start > 0 && end > start, "gradePlacement is its own path");
  const body = game.slice(start, end);
  assert.ok(!body.includes("schedule("), "placement does not schedule SRS");
  assert.ok(!body.includes("getProg("), "placement does not create card stubs");
  assert.ok(!body.includes("emitLearnerAnswer"), "placement is not an ALS answer");
  assert.ok(!body.includes("rememberMiss"), "placement does not open the wrong book");
}

assert.ok(game.includes("onHome: studentHomeActive()"), "soft gate is still tied to the student home");
assert.ok(!game.includes("继续闯关会先练今日到期"));

console.log("placement ok");

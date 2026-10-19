"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");

function load(file, name) {
  const ctx = { window: {} };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), ctx);
  return ctx.window[name];
}

function find(cards, word) {
  return cards.filter((c) => c && c.word === word);
}

const levels = load("words.js", "VOCAB_LEVELS");
const core = levels.flat();
const communicate = find(core, "communicate");
assert.strictEqual(communicate.length, 1);
const card = communicate[0];
assert.strictEqual(card.meaning_zh, "沟通；交流");
assert.strictEqual(card.explain_zh, "中考/CEFR 常用词：沟通；交流");
assert.strictEqual(card.example_en, "We communicate with our friends online.");
assert.strictEqual(card.example_zh, "我们在线上与朋友沟通。");
assert.ok(!card.meaning_zh.includes("显露"));
assert.ok(!card.explain_zh.includes("显露"));

const tracks = load("exam-tracks.js", "VOCAB_EXAM_TRACKS");
for (const track of tracks) {
  const hits = [];
  for (const set of track.sets) hits.push(...find(set, "communicate"));
  assert.ok(hits.length >= 1, track.id + " is missing communicate");
  for (const hit of hits) {
    assert.strictEqual(hit.meaning_zh, "沟通；交流", track.id);
    assert.strictEqual(hit.example_en, "We communicate with our friends online.");
    assert.strictEqual(hit.example_zh, "我们在线上与朋友沟通。");
    assert.ok(!String(hit.meaning_zh).includes("显露"));
  }
}

const rawCore = fs.readFileSync(path.join(root, "words.js"), "utf8");
const rawExam = fs.readFileSync(path.join(root, "exam-tracks.js"), "utf8");
assert.ok(!rawCore.includes('meaning_zh: "显露"'), "core bank still glosses something as 显露");
assert.ok(!rawExam.includes('meaning_zh":"显露"'), "exam tracks still gloss something as 显露");

console.log("gloss-communicate ok");

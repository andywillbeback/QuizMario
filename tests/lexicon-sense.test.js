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

function cardsOf(tracks, word) {
  const hits = [];
  for (const track of tracks) {
    for (const set of track.sets) {
      for (const card of set) {
        if (card.word === word) hits.push(Object.assign({ track: track.id }, card));
      }
    }
  }
  return hits;
}

const core = load("words.js", "VOCAB_LEVELS").flat();
const tracks = load("exam-tracks.js", "VOCAB_EXAM_TRACKS");

function coreOne(word) {
  const hits = core.filter((c) => c.word === word);
  assert.strictEqual(hits.length, 1, word);
  return hits[0];
}

const claim = coreOne("claim");
assert.strictEqual(claim.meaning_zh, "认领");
assert.strictEqual(claim.explain_zh, "中考/CEFR 常用词：认领");
assert.ok(claim.example_zh.includes("认领"));

const boom = coreOne("boom");
assert.strictEqual(boom.meaning_zh, "轰鸣");
assert.strictEqual(boom.explain_zh, "中考/CEFR 常用词：轰鸣");
assert.ok(boom.example_zh.includes("轰鸣"));
assert.strictEqual(coreOne("story").meaning_zh, "故事");
assert.strictEqual(coreOne("storey").meaning_zh, "楼层");
assert.strictEqual(coreOne("attraction").meaning_zh, "引力");
assert.strictEqual(coreOne("rail").meaning_zh, "铁轨");
assert.strictEqual(coreOne("mummy").meaning_zh, "妈妈");
assert.strictEqual(coreOne("communicate").meaning_zh, "沟通；交流");

const expect = {
  story: "故事",
  attraction: "引力",
  boom: "轰鸣",
  claim: "认领",
  rail: "铁轨",
  mummy: "妈妈",
  communicate: "沟通；交流",
};
for (const word of Object.keys(expect)) {
  const hits = cardsOf(tracks, word);
  assert.ok(hits.length >= 1, word);
  for (const hit of hits) {
    assert.strictEqual(hit.meaning_zh, expect[word], hit.track + " " + word);
  }
}
assert.strictEqual(cardsOf(tracks, "mummy").length, 1, "only the gaokao mummy card");

const repairMeaning = {
  "slice-2.json": ["attraction", "引力"],
  "slice-3.json": ["boom", "轰鸣"],
  "slice-6.json": ["mummy", "妈妈"],
  "slice-7.json": ["rail", "铁轨"],
  "slice-8.json": ["story", "故事"],
  "slice-10.json": ["claim", "认领"],
};
for (const file of Object.keys(repairMeaning)) {
  const data = JSON.parse(fs.readFileSync(path.join(root, "data/repairs", file), "utf8"));
  const [word, meaning] = repairMeaning[file];
  assert.strictEqual(data[word].meaning_zh, meaning, file);
}

console.log("lexicon-sense ok");

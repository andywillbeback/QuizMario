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
assert.strictEqual(coreOne("story").meaning_zh, "故事（记叙）");
assert.strictEqual(coreOne("storey").meaning_zh, "楼层");
assert.strictEqual(coreOne("attraction").meaning_zh, "引力");
assert.strictEqual(coreOne("rail").meaning_zh, "铁轨");
assert.strictEqual(coreOne("mummy").meaning_zh, "妈妈");
assert.strictEqual(coreOne("communicate").meaning_zh, "沟通；交流");

assert.strictEqual(coreOne("get").meaning_zh, "得到；变得");
assert.strictEqual(coreOne("get").example_en, "You get one point for each correct answer.");
assert.ok(coreOne("get").example_zh.includes("得到"));
assert.ok(!/get up/i.test(coreOne("get").example_en));
assert.strictEqual(coreOne("dress").meaning_zh, "连衣裙");
assert.ok(coreOne("dress").example_zh.includes("连衣裙"));
assert.strictEqual(coreOne("trouble").meaning_zh, "麻烦；困境");
assert.ok(coreOne("trouble").example_zh.includes("麻烦"));
assert.strictEqual(coreOne("decent").meaning_zh, "得体的");
assert.ok(/得体/.test(coreOne("decent").example_zh));
assert.strictEqual(coreOne("chat").meaning_zh, "聊天");
assert.strictEqual(coreOne("pair").meaning_zh, "一双");

// Exam tracks use the curriculum-frequency gloss from the same-set disambiguation.
// The core bank assertions above keep 引力 / 认领.
const expect = {
  story: "故事",
  attraction: "景点；吸引力",
  boom: "轰鸣",
  claim: "声称；宣称",
  rail: "铁轨",
  mummy: "妈妈",
  communicate: "沟通；交流",
  get: "得到；变得",
  dress: "连衣裙",
  trouble: "麻烦；困境",
  decent: "得体的",
  chat: "聊天",
  pair: "一双",
};
for (const word of Object.keys(expect)) {
  const hits = cardsOf(tracks, word);
  assert.ok(hits.length >= 1, word);
  for (const hit of hits) {
    assert.strictEqual(hit.meaning_zh, expect[word], hit.track + " " + word);
  }
}
assert.strictEqual(cardsOf(tracks, "mummy").length, 1, "only the gaokao mummy card");
for (const hit of cardsOf(tracks, "attraction")) {
  assert.strictEqual(hit.example_en, "The Great Wall is a famous attraction for visitors.", hit.track);
  assert.strictEqual(hit.example_zh, "长城对游客来说是著名的景点。", hit.track);
}
for (const hit of cardsOf(tracks, "claim")) {
  assert.strictEqual(hit.example_en, "Some students claim that the test was too hard.", hit.track);
  assert.strictEqual(hit.example_zh, "有些学生声称这次考试太难了。", hit.track);
}
for (const hit of cardsOf(tracks, "get")) {
  assert.strictEqual(hit.example_en, "You get one point for each correct answer.", hit.track);
  assert.strictEqual(hit.example_zh, "每答对一题，你就得到一分。", hit.track);
  assert.ok(!/get up|起床/.test(hit.example_en + hit.example_zh), hit.track);
}
for (const hit of cardsOf(tracks, "dress")) {
  assert.ok(hit.example_zh.includes("连衣裙"), hit.track);
}
for (const hit of cardsOf(tracks, "trouble")) {
  assert.ok(/in trouble/i.test(hit.example_en) && hit.example_zh.includes("麻烦"), hit.track);
}
assert.strictEqual(cardsOf(tracks, "decent").length, 1, "decent is a gaokao-only headword");

const repairMeaning = [
  ["slice-2.json", "attraction", "景点；吸引力"],
  ["slice-3.json", "boom", "轰鸣"],
  ["slice-6.json", "mummy", "妈妈"],
  ["slice-6.json", "pair", "一双"],
  ["slice-7.json", "rail", "铁轨"],
  ["slice-8.json", "story", "故事"],
  ["slice-10.json", "claim", "声称；宣称"],
  ["slice-10.json", "chat", "聊天"],
  ["slice-0.json", "decent", "得体的"],
  ["slice-4.json", "dress", "连衣裙"],
  ["slice-9.json", "trouble", "麻烦；困境"],
];
for (const [file, word, meaning] of repairMeaning) {
  const data = JSON.parse(fs.readFileSync(path.join(root, "data/repairs", file), "utf8"));
  assert.strictEqual(data[word].meaning_zh, meaning, file + " " + word);
}
const getRepair = JSON.parse(fs.readFileSync(path.join(root, "data/repairs/gloss-only.json"), "utf8")).get;
assert.strictEqual(getRepair.meaning_zh, "得到；变得");
assert.strictEqual(getRepair.example_en, "You get one point for each correct answer.");
assert.ok(!/get up/i.test(getRepair.example_en));

console.log("lexicon-sense ok");

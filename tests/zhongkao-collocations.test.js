"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { normToken, relatedLemmas, indexSingleWordBank } = require("../tools/zhongkao-collocation-related");
const { exampleCoversLemma } = require("../tools/zhongkao-collocation-examples");
const { isTemplateExample } = require("../tools/example-templates");

const root = path.join(__dirname, "..");

function load(file, name) {
  const ctx = { window: {} };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), ctx);
  return ctx.window[name];
}

const grok = load("grok/exam-tracks.js", "VOCAB_EXAM_TRACKS");
const rootTracks = load("exam-tracks.js", "VOCAB_EXAM_TRACKS");
const zk = grok.find((t) => t.id === "zhongkao");
const rzk = rootTracks.find((t) => t.id === "zhongkao");
const gk = grok.find((t) => t.id === "gaokao");
const rgk = rootTracks.find((t) => t.id === "gaokao");

assert.strictEqual(zk.sets.length, 69);
assert.strictEqual(zk.titles.length, 69);
assert.strictEqual(JSON.stringify(zk.sets.slice(0, 58)), JSON.stringify(rzk.sets));
assert.strictEqual(JSON.stringify(zk.titles.slice(0, 58)), JSON.stringify(rzk.titles));
assert.strictEqual(zk.desc, rzk.desc);
assert.strictEqual(JSON.stringify(gk), JSON.stringify(rgk));
assert.strictEqual(rzk.sets.flat().length, 2821);
assert.strictEqual(zk.sets.slice(0, 58).flat().length, 2821);
assert.strictEqual(gk.sets.flat().length, rgk.sets.flat().length);

const fresh = zk.sets.slice(58);
const cards = fresh.flat();
assert.strictEqual(cards.length, 515);
assert.strictEqual(JSON.stringify(fresh.map((set) => set.length)), JSON.stringify([47, 47, 47, 47, 47, 47, 47, 47, 47, 47, 45]));
assert.strictEqual(JSON.stringify(zk.titles.slice(58)), JSON.stringify([
  "中考·固定搭配 1", "中考·固定搭配 2", "中考·固定搭配 3", "中考·固定搭配 4",
  "中考·固定搭配 5", "中考·固定搭配 6", "中考·固定搭配 7", "中考·固定搭配 8",
  "中考·固定搭配 9", "中考·固定搭配 10", "中考·固定搭配 11",
]));

const list = fs.readFileSync(path.join(root, "data/zhongkao-fixed-collocations-lemmas.csv"), "utf8")
  .trim().split(/\r?\n/).slice(1).map((line) => line.slice(0, line.indexOf(",")));
assert.strictEqual(JSON.stringify(cards.map((c) => c.word)), JSON.stringify(list));
assert.ok(!cards.some((c) => normToken(c.word) === "according to"));
assert.strictEqual(zk.sets.flat().filter((c) => normToken(c.word) === "according to").length, 1);

const oldNorm = new Set(zk.sets.slice(0, 58).flat().map((c) => normToken(c.word)));
const bank = indexSingleWordBank(zk.sets.slice(0, 58).flat().map((c) => c.word));
const glosses = new Set();
for (const card of cards) {
  assert.ok(oldNorm.has(normToken(card.word)) === false, "overlaps old lemma " + card.word);
  assert.strictEqual(card.scene, "中考");
  assert.ok(card.pos && card.root_group === card.pos, card.word);
  assert.ok(card.meaning_zh && card.example_en && card.example_zh, card.word);
  assert.ok(!isTemplateExample(card.example_en), card.word);
  assert.ok(exampleCoversLemma(card.word, card.example_en), card.word + " / " + card.example_en);
  assert.ok(!glosses.has(card.meaning_zh), "dup gloss " + card.meaning_zh);
  glosses.add(card.meaning_zh);
  assert.ok(Array.isArray(card.related) && card.related.length, card.word);
  assert.strictEqual(JSON.stringify(card.related), JSON.stringify(relatedLemmas(card.word, bank)));
  const seen = new Set();
  for (const item of card.related) {
    assert.strictEqual(typeof item, "string");
    assert.ok(item && !/\s/.test(item) && item !== "one's" && item !== ".", item);
    assert.ok(!seen.has(normToken(item)));
    seen.add(normToken(item));
  }
}
assert.ok(zk.sets.slice(0, 58).flat().every((c) => !Object.prototype.hasOwnProperty.call(c, "related")));

assert.strictEqual(JSON.stringify(cards.find((c) => c.word === "take part in").related), JSON.stringify(["take", "part"]));
assert.strictEqual(JSON.stringify(cards.find((c) => c.word === "look forward to").related), JSON.stringify(["look", "forward"]));
assert.strictEqual(JSON.stringify(cards.find((c) => c.word === "be able to").related), JSON.stringify(["be", "able"]));
assert.strictEqual(JSON.stringify(cards.find((c) => c.word === "at christmas").related), JSON.stringify(["Christmas"]));

const game = fs.readFileSync(path.join(root, "grok/game.js"), "utf8");
assert.ok(!game.includes("relatedLemmas"));
assert.ok(!/中考·固定搭配/.test(fs.readFileSync(path.join(root, "grok/index.html"), "utf8")));

console.log("zhongkao-collocations ok", {
  sets: fresh.length,
  cards: cards.length,
  base: 2821,
});

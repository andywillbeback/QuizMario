"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { normToken, relatedLemmas, indexSingleWordBank } = require("../tools/zhongkao-collocation-related");
const { exampleCoversLemma } = require("../tools/zhongkao-collocation-examples");
const { isTemplateExample } = require("../tools/example-templates");
const cloze = require("../grok/cloze.js");

const root = path.join(__dirname, "..");

function load(file, name) {
  const ctx = { window: {} };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), ctx);
  return ctx.window[name];
}

const grok = load("grok/exam-tracks.js", "VOCAB_EXAM_TRACKS");
const rootTracks = load("exam-tracks.js", "VOCAB_EXAM_TRACKS");
const gk = grok.find((t) => t.id === "gaokao");
const rgk = rootTracks.find((t) => t.id === "gaokao");
const zk = grok.find((t) => t.id === "zhongkao");
const rzk = rootTracks.find((t) => t.id === "zhongkao");

assert.strictEqual(gk.sets.length, 97);
assert.strictEqual(gk.titles.length, 97);
assert.strictEqual(gk.desc, rgk.desc);
assert.strictEqual(gk.name, rgk.name);
assert.strictEqual(JSON.stringify(gk.sets.slice(0, 86)), JSON.stringify(rgk.sets));
assert.strictEqual(JSON.stringify(gk.titles.slice(0, 86)), JSON.stringify(rgk.titles));
assert.strictEqual(rgk.sets.flat().length, 4243);
assert.strictEqual(gk.sets.slice(0, 86).flat().length, 4243);
assert.strictEqual(zk.sets.length, 69);
assert.strictEqual(JSON.stringify(zk.sets.slice(0, 58)), JSON.stringify(rzk.sets));

const fresh = gk.sets.slice(86);
const cards = fresh.flat();
assert.strictEqual(cards.length, 517);
assert.strictEqual(JSON.stringify(fresh.map((set) => set.length)), JSON.stringify([47, 47, 47, 47, 47, 47, 47, 47, 47, 47, 47]));
assert.strictEqual(JSON.stringify(gk.titles.slice(86)), JSON.stringify([
  "高考·固定搭配 1", "高考·固定搭配 2", "高考·固定搭配 3", "高考·固定搭配 4",
  "高考·固定搭配 5", "高考·固定搭配 6", "高考·固定搭配 7", "高考·固定搭配 8",
  "高考·固定搭配 9", "高考·固定搭配 10", "高考·固定搭配 11",
]));

const list = fs.readFileSync(path.join(root, "data/gaokao-fixed-collocations-lemmas.csv"), "utf8")
  .trim().split(/\r?\n/).slice(1).map((line) => line.slice(0, line.indexOf(",")));
assert.strictEqual(JSON.stringify(cards.map((c) => c.word)), JSON.stringify(list));
assert.ok(!cards.some((c) => normToken(c.word) === "according to" || normToken(c.word) === "due to"));
assert.strictEqual(gk.sets.slice(0, 86).flat().filter((c) => normToken(c.word) === "according to").length, 1);
assert.strictEqual(gk.sets.slice(0, 86).flat().filter((c) => normToken(c.word) === "due to").length, 1);

const oldNorm = new Set(gk.sets.slice(0, 86).flat().map((c) => normToken(c.word)));
const bank = indexSingleWordBank(gk.sets.slice(0, 86).flat().map((c) => c.word));
const glosses = new Set();
let relatedCards = 0;
for (const card of cards) {
  assert.ok(oldNorm.has(normToken(card.word)) === false, "overlaps old lemma " + card.word);
  assert.strictEqual(card.scene, "高考");
  assert.ok(card.pos && card.root_group === card.pos, card.word);
  assert.ok(card.meaning_zh && card.example_en && card.example_zh, card.word);
  assert.ok(!isTemplateExample(card.example_en), card.word);
  assert.ok(!cloze.isPlaceholderExample(card.example_en), card.word);
  assert.ok(exampleCoversLemma(card.word, card.example_en), card.word + " / " + card.example_en);
  assert.ok(!glosses.has(card.meaning_zh), "dup gloss " + card.meaning_zh);
  glosses.add(card.meaning_zh);
  assert.ok(Array.isArray(card.related) && card.related.length, card.word);
  relatedCards += 1;
  assert.strictEqual(JSON.stringify(card.related), JSON.stringify(relatedLemmas(card.word, bank)));
  const seen = new Set();
  for (const item of card.related) {
    assert.strictEqual(typeof item, "string");
    assert.ok(item && !/\s/.test(item) && item !== "one's" && item !== ".", item);
    assert.ok(!seen.has(normToken(item)));
    seen.add(normToken(item));
  }
  const plan = cloze.cardSpeechPlan(card, "meaning");
  assert.strictEqual(plan.autoSpeakWord, true, card.word);
  assert.strictEqual(plan.showWord, true, card.word);
  assert.strictEqual(plan.exampleSay, card.example_en, card.word);
  assert.ok(!/\bblank\b/i.test(plan.exampleSay), card.word);
  assert.ok(!/_{3,}/.test(plan.exampleSay), card.word);
  const revealed = cloze.cardSpeechPlan(card, "spelling", { revealed: true });
  assert.strictEqual(revealed.exampleSay, card.example_en, card.word);
  assert.strictEqual(revealed.autoSpeakWord, false, card.word);
}
assert.strictEqual(relatedCards, 517);
assert.ok(gk.sets.slice(0, 86).flat().every((c) => !Object.prototype.hasOwnProperty.call(c, "related")));

assert.strictEqual(JSON.stringify(cards.find((c) => c.word === "take part in").related), JSON.stringify(["take", "part"]));
assert.strictEqual(JSON.stringify(cards.find((c) => c.word === "look forward to").related), JSON.stringify(["look", "forward"]));
assert.strictEqual(JSON.stringify(cards.find((c) => c.word === "be able to").related), JSON.stringify(["be", "able"]));
assert.strictEqual(JSON.stringify(cards.find((c) => c.word === "be excited about/for").related), JSON.stringify(["be", "excited", "about", "for"]));

const game = fs.readFileSync(path.join(root, "grok/game.js"), "utf8");
const streak = fs.readFileSync(path.join(root, "grok/kill-streak.js"), "utf8");
assert.ok(!game.includes("relatedLemmas"));
assert.ok(!/高考·固定搭配/.test(fs.readFileSync(path.join(root, "grok/index.html"), "utf8")));
assert.ok(!/高考·固定搭配/.test(streak));

console.log("gaokao-collocations ok", {
  sets: fresh.length,
  cards: cards.length,
  related: relatedCards,
  base: 4243,
});

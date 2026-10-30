/* Ordinary lemma → 固定搭配 reverse soft-links.
 * Run: node tests/reverse-colloc-links.test.js
 */
"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { applyReverseCollocLinks, normToken, relatedLemmas, indexSingleWordBank } = require("../tools/zhongkao-collocation-related");
const related = require("../grok/related-links.js");

const root = path.join(__dirname, "..");

function load(file, name) {
  const ctx = { window: {} };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), ctx);
  return ctx.window[name];
}

function isPhraseShaped(text) {
  return /\s/.test(text) || text.includes("...");
}

// Cards loaded through vm use that realm's Array. Copy before deep-equal.
function list(value) {
  return value == null ? value : [...value];
}

{
  const track = {
    titles: ["中考 · 第1组", "中考·固定搭配 1"],
    sets: [
      [{ word: "afraid" }, { word: "amazed" }, { word: "ice cream" }, { word: "be" }],
      [
        { word: "be afraid of", related: ["be", "afraid"] },
        { word: "be able to", related: ["be", "able"] },
        { word: "be born in", related: ["be", "born"] },
        { word: "be about to", related: ["be", "about"] },
        { word: "be aware of", related: ["be", "aware"] },
        { word: "be angry with", related: ["be", "angry"] },
      ],
    ],
  };
  const map = {
    afraid: ["be afraid of", "not a real phrase"],
    amazed: ["be amazed at"],
    "ice cream": ["be afraid of"],
    missing: ["be afraid of"],
    be: ["be angry with", "be aware of", "be about to", "be afraid of", "be born in", "be able to"],
  };
  const stats = applyReverseCollocLinks(track, map);
  assert.deepStrictEqual(track.sets[0][0].related, ["be afraid of"]);
  assert.strictEqual(Object.prototype.hasOwnProperty.call(track.sets[0][1], "related"), false);
  assert.strictEqual(Object.prototype.hasOwnProperty.call(track.sets[0][2], "related"), false);
  assert.deepStrictEqual(track.sets[0][3].related, [
    "be able to",
    "be born in",
    "be about to",
    "be aware of",
    "be afraid of",
  ]);
  assert.deepStrictEqual(track.sets[1][0].related, ["be", "afraid"]);
  assert.deepStrictEqual(stats, { lemmas: 2, chips: 6 });
  const again = applyReverseCollocLinks(track, map);
  assert.deepStrictEqual(again, { lemmas: 2, chips: 6 });
  assert.deepStrictEqual(track.sets[0][3].related, [
    "be able to",
    "be born in",
    "be about to",
    "be aware of",
    "be afraid of",
  ]);
}

const grok = load("grok/exam-tracks.js", "VOCAB_EXAM_TRACKS");
const maps = {
  zhongkao: JSON.parse(fs.readFileSync(path.join(root, "data/zhongkao-lemma-to-colloc.json"), "utf8")),
  gaokao: JSON.parse(fs.readFileSync(path.join(root, "data/gaokao-lemma-to-colloc.json"), "utf8")),
};

const spots = {
  zhongkao: {
    afraid: { title: "中考 · 第1组", phrases: ["be afraid of"] },
    decision: { title: "中考拓展 · 第5组", phrases: ["make a decision"] },
    careful: { title: "中考 · 第5组", phrases: ["be careful of", "be careful about"] },
    difference: { title: "中考 · 第8组", phrases: ["make a difference"] },
    promise: { title: "中考 · 第23组", phrases: null },
  },
  gaokao: {
    afraid: { title: "高考 · 第1组", phrases: ["be afraid of"] },
    decision: { title: "高考 · 第44组", phrases: ["make a decision"] },
    careful: { title: "高考 · 第5组", phrases: ["be careful with", "be careful about"] },
    difference: { title: "高考 · 第8组", phrases: ["make a difference"] },
    promise: { title: "高考 · 第23组", phrases: ["keep a promise", "make a promise"] },
  },
};

const expectedCounts = {
  zhongkao: { lemmas: 332, chips: 569 },
  gaokao: { lemmas: 330, chips: 544 },
};

for (const trackId of ["zhongkao", "gaokao"]) {
  const track = grok.find((t) => t.id === trackId);
  const map = maps[trackId];
  const index = related.indexTrack(track.sets);
  const ordinaryByNorm = new Map();
  let linkedLemmas = 0;
  let chips = 0;
  for (let i = 0; i < track.sets.length; i++) {
    const title = track.titles[i] || "";
    const colloc = title.includes("·固定搭配");
    for (const card of track.sets[i]) {
      if (colloc) {
        assert.ok(Array.isArray(card.related) && card.related.length, card.word);
        for (const item of card.related) assert.ok(!/\s/.test(item) && !item.includes("..."), card.word + " -> " + item);
        continue;
      }
      if (/\s/.test(card.word)) {
        assert.strictEqual(Object.prototype.hasOwnProperty.call(card, "related"), false, card.word);
        continue;
      }
      const key = normToken(card.word);
      if (!ordinaryByNorm.has(key)) ordinaryByNorm.set(key, []);
      ordinaryByNorm.get(key).push({ card, title, levelIdx: i });
      if (!Object.prototype.hasOwnProperty.call(card, "related")) continue;
      linkedLemmas += 1;
      assert.ok(Array.isArray(card.related) && card.related.length >= 1 && card.related.length <= 5, card.word);
      chips += card.related.length;
      assert.deepStrictEqual(list(card.related), list(map[key]), card.word);
      for (const phrase of card.related) {
        assert.ok(isPhraseShaped(phrase), card.word + " -> " + phrase);
        const hit = related.lookup(index, phrase);
        assert.ok(hit, trackId + " " + card.word + " -> " + phrase);
        assert.ok(track.titles[hit.levelIdx].includes("·固定搭配"), track.titles[hit.levelIdx] + " / " + phrase);
        assert.strictEqual(related.norm(hit.word.word), related.norm(phrase));
      }
    }
  }
  assert.strictEqual(linkedLemmas, expectedCounts[trackId].lemmas, trackId);
  assert.strictEqual(chips, expectedCounts[trackId].chips, trackId);
  assert.strictEqual(linkedLemmas, Object.keys(map).length, trackId);
  for (const lemma of Object.keys(map)) {
    const founds = ordinaryByNorm.get(normToken(lemma));
    assert.ok(founds && founds.length === 1, trackId + " " + lemma);
    assert.deepStrictEqual(list(founds[0].card.related), list(map[lemma]), lemma);
  }

  const baseWords = [];
  for (let i = 0; i < track.sets.length; i++) {
    if (String(track.titles[i] || "").includes("·固定搭配")) continue;
    for (const card of track.sets[i]) baseWords.push(card.word);
  }
  const bank = indexSingleWordBank(baseWords);
  const afraidPhrase = track.sets.flat().find((c) => c.word === "be afraid of");
  assert.deepStrictEqual(list(afraidPhrase.related), ["be", "afraid"]);
  assert.deepStrictEqual(list(afraidPhrase.related), relatedLemmas(afraidPhrase.word, bank));
  const takePart = track.sets.flat().find((c) => c.word === "take part in");
  assert.deepStrictEqual(list(takePart.related), ["take", "part"]);

  for (const [lemma, spec] of Object.entries(spots[trackId])) {
    const founds = ordinaryByNorm.get(lemma);
    assert.ok(founds && founds.length === 1, lemma);
    const found = founds[0];
    assert.strictEqual(found.title, spec.title, trackId + " " + lemma);
    if (spec.phrases == null) {
      assert.strictEqual(Object.prototype.hasOwnProperty.call(found.card, "related"), false, lemma);
    } else {
      assert.deepStrictEqual(list(found.card.related), spec.phrases, trackId + " " + lemma);
      const hit = related.lookup(index, spec.phrases[0]);
      assert.ok(hit && track.titles[hit.levelIdx].includes("·固定搭配"));
    }
  }
}

const zkAfraid = grok.find((t) => t.id === "zhongkao").sets.flat().find((c) => c.word === "afraid");
const gkCareful = grok.find((t) => t.id === "gaokao").sets.flat().find((c) => c.word === "careful");
assert.deepStrictEqual(list(zkAfraid.related), ["be afraid of"]);
assert.deepStrictEqual(list(gkCareful.related), ["be careful with", "be careful about"]);
assert.ok(!gkCareful.related.includes("be careful of"));

console.log("reverse-colloc-links ok", expectedCounts);

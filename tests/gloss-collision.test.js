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

function sameSetGlossDupes(track) {
  const dupes = [];
  track.sets.forEach((set, si) => {
    const by = new Map();
    for (const card of set) {
      if (!by.has(card.meaning_zh)) by.set(card.meaning_zh, []);
      by.get(card.meaning_zh).push(card.word);
    }
    for (const [meaning, words] of by) {
      if (words.length > 1) dupes.push({ set: si, meaning, words });
    }
  });
  return dupes;
}

function cards(tracks, word) {
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

const tracks = load("exam-tracks.js", "VOCAB_EXAM_TRACKS");
const byId = Object.fromEntries(tracks.map((t) => [t.id, t]));
assert.ok(byId.zhongkao && byId.gaokao, "both exam tracks");

for (const id of ["zhongkao", "gaokao"]) {
  const dupes = sameSetGlossDupes(byId[id]);
  assert.deepStrictEqual(dupes, [], id + " same-set meaning_zh duplicates: " + JSON.stringify(dupes.slice(0, 5)));
}

function gloss(word) {
  const hits = cards(tracks, word);
  assert.ok(hits.length >= 1, word);
  const meanings = new Set(hits.map((h) => h.meaning_zh));
  assert.strictEqual(meanings.size, 1, word + " gloss drifted across tracks");
  return hits[0].meaning_zh;
}

assert.strictEqual(gloss("exit"), "出口（离开的门）");
assert.strictEqual(gloss("export"), "出口（对外贸易）");
assert.strictEqual(gloss("anybody"), "任何人（口语，多用于疑问/否定）");
assert.strictEqual(gloss("anyone"), "任何人（较正式，也可用在肯定句）");
assert.strictEqual(gloss("their"), "他们的（后接名词）");
assert.strictEqual(gloss("theirs"), "他们的（单独使用，不加名词）");
assert.strictEqual(gloss("advice"), "建议（名词，不可数）");
assert.strictEqual(gloss("advise"), "劝告；建议（动词）");
assert.strictEqual(gloss("attraction"), "景点；吸引力");
assert.strictEqual(gloss("claim"), "声称；宣称");
assert.strictEqual(gloss("army"), "军队");
assert.strictEqual(gloss("badminton"), "羽毛球");

assert.strictEqual(gloss("communicate"), "沟通；交流");
assert.strictEqual(cards(tracks, "communicate")[0].example_en, "We communicate with our friends online.");
assert.strictEqual(gloss("chip"), "薯片；芯片");
assert.strictEqual(cards(tracks, "chip")[0].example_en, "He ate a bag of chips at lunch.");
assert.strictEqual(gloss("eighteenth"), "第十八");
assert.strictEqual(cards(tracks, "eighteenth")[0].example_en, "Her birthday is on the eighteenth of June.");

console.log("gloss-collision ok", {
  zhongkaoSets: byId.zhongkao.sets.length,
  gaokaoSets: byId.gaokao.sets.length,
});

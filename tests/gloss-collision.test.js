"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { loadRepairs } = require("../tools/apply-example-repairs");

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

const coreLevels = load("words.js", "VOCAB_LEVELS");
const coreDupes = sameSetGlossDupes({ sets: coreLevels });
assert.deepStrictEqual(coreDupes, [], "core same-set meaning_zh duplicates: " + JSON.stringify(coreDupes.slice(0, 5)));

const practiceTracks = load("tracks.js", "VOCAB_TRACKS");
const practiceById = Object.fromEntries(practiceTracks.filter((t) => t.sets).map((t) => [t.id, t]));
for (const id of ["ket", "pet", "cet4"]) {
  assert.ok(practiceById[id], id);
  const dupes = sameSetGlossDupes(practiceById[id]);
  assert.deepStrictEqual(dupes, [], id + " same-set meaning_zh duplicates: " + JSON.stringify(dupes.slice(0, 5)));
}

function trackGloss(id, word) {
  const hits = practiceById[id].sets.flat().filter((card) => card.word === word);
  assert.strictEqual(hits.length, 1, id + " " + word);
  return hits[0].meaning_zh;
}

assert.strictEqual(trackGloss("pet", "landscape"), "风景（大地风光）");
assert.strictEqual(trackGloss("pet", "scenery"), "风景（自然景色）");
assert.notStrictEqual(trackGloss("pet", "landscape"), trackGloss("pet", "scenery"));
assert.strictEqual(trackGloss("cet4", "apparent"), "明显的（看得出来）");
assert.strictEqual(trackGloss("cet4", "evident"), "明显的（毫无疑问）");
assert.notStrictEqual(trackGloss("cet4", "apparent"), trackGloss("cet4", "evident"));

function coreGloss(word) {
  const hits = coreLevels.flat().filter((card) => card.word === word);
  assert.strictEqual(hits.length, 1, "core card " + word);
  return hits[0].meaning_zh;
}

const coreNotes = {
  anybody: "任何人（口语，多用于疑问/否定）",
  anyone: "任何人（较正式，也可用在肯定句）",
  everybody: "每个人（口语）",
  everyone: "每个人（较正式）",
  mine: "我的（单独使用，不加名词）",
  my: "我的（后接名词）",
  somebody: "某人（口语）",
  someone: "某人（较正式）",
  them: "他们（宾格）",
  they: "他们（主格）",
  till: "直到（口语）",
  until: "直到（较正式）",
  while: "当……时；而（通用）",
  whilst: "当……时；而（英式书面）",
  shop: "商店（英式，店铺）",
  store: "商店（美式说法）",
  perform: "表演；表现（动词）",
  performance: "表演；表现（名词）",
  amusement: "娱乐（游乐）",
  entertainment: "娱乐（文娱活动）",
  story: "故事（记叙）",
  tale: "故事（讲述）",
  advertisement: "广告（一则）",
  ad: "广告（缩写）",
  occupation: "职业（工作，可泛指）",
  profession: "职业（专业工作）",
  bicycle: "自行车（全称）",
  bike: "自行车（口语）",
  protect: "保护（动词）",
  protection: "保护（名词）",
  completely: "完全地（彻底）",
  entirely: "完全地（全部）",
  generally: "通常（一般说来）",
  normally: "通常（正常情况下）",
  fine: "好的（天气或身体）",
  good: "好的（泛指）",
};
for (const [word, meaning] of Object.entries(coreNotes)) {
  assert.strictEqual(coreGloss(word), meaning, "core " + word);
  assert.strictEqual(coreLevels.flat().find((card) => card.word === word).explain_zh, "中考/CEFR 常用词：" + meaning, "core explain " + word);
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

const repairs = loadRepairs();
for (const [word, meaning] of Object.entries(coreNotes)) {
  const fix = repairs.get(word);
  assert.ok(fix && fix.meaning_zh === meaning, "repair gloss for core pair " + word + " " + (fix && fix.meaning_zh));
}
for (const word of ["exit", "export", "anybody", "anyone", "their", "theirs", "advice", "advise", "attraction", "claim", "army", "badminton", "get", "dress", "trouble", "decent", "chat", "pair"]) {
  const fix = repairs.get(word);
  assert.ok(fix, "repair missing for " + word);
  assert.strictEqual(fix.meaning_zh, gloss(word), "repair gloss drifted for " + word);
}
assert.strictEqual(repairs.get("get").example_en, "You get one point for each correct answer.");
assert.ok(!/get up/i.test(repairs.get("get").example_en));
const communicateRepair = repairs.get("communicate");
assert.ok(!communicateRepair || communicateRepair.meaning_zh === "沟通；交流", "communicate repair");
for (const word of ["chip", "eighteenth"]) {
  const fix = repairs.get(word);
  if (fix && fix.meaning_zh) assert.strictEqual(fix.meaning_zh, gloss(word), word);
}

console.log("gloss-collision ok", {
  zhongkaoSets: byId.zhongkao.sets.length,
  gaokaoSets: byId.gaokao.sets.length,
});

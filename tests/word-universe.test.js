/* Word-universe beta: first paint is lemmas, click data is existing colloc only.
 * Run: node tests/word-universe.test.js
 */
"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
function read(name) {
  return fs.readFileSync(path.join(root, name), "utf8");
}

require(path.join(root, "grok/related-links.js"));
require(path.join(root, "grok/study-metrics.js"));
const uni = require(path.join(root, "grok/word-universe.js"));

assert.strictEqual(uni.LEGEND, "颜色越深 = 越不熟练");
assert.ok(uni.UNSCORED_NOTE.indexOf("不记成 0") > 0);

assert.strictEqual(uni.themeOf("life", "生活").id, "life");
assert.strictEqual(uni.themeOf("lifestyle", "").id, "life");
assert.strictEqual(uni.themeOf("computer", "电脑").id, "technology");
assert.strictEqual(uni.themeOf("Internet", "互联网").id, "technology");
assert.strictEqual(uni.themeOf("telephone", "").id, "technology");
assert.strictEqual(uni.themeOf("advantage", "优势").id, "society");
assert.strictEqual(uni.themeOf("school", "学校").id, "school");
assert.strictEqual(uni.themeOf("nature", "自然").id, "nature");
assert.strictEqual(uni.themeOf("zzzz-not-a-word", "无可归类").id, "other");
assert.strictEqual(uni.isPhrase("take advantage of"), true);
assert.strictEqual(uni.isPhrase("advantage"), false);

const life = uni.themeOf("life", "");
const dark = uni.visualOf(life, 0, true);
const mid = uni.visualOf(life, 1.5, true);
const bright = uni.visualOf(life, 3, true);
const gray = uni.visualOf(life, null, false);
assert.ok(dark.light < mid.light && mid.light < bright.light, "weaker mastery is darker");
assert.ok(dark.light < gray.light, "unscored gray is not painted as mastery 0");
assert.ok(gray.sat < dark.sat);
assert.strictEqual(gray.unscored, true);
assert.strictEqual(dark.unscored, false);

const fixture = [{
  id: "gaokao",
  name: "高考",
  sets: [[
    { word: "life", pos: "n.", meaning_zh: "生活", related: ["way of life"] },
    { word: "way of life", meaning_zh: "生活方式", related: ["life", "way"] },
    { word: "way", meaning_zh: "方式" },
    { word: "technology", meaning_zh: "技术" },
    { word: "advantage", meaning_zh: "优势", related: ["advantage over", "take advantage of"] },
    { word: "take advantage of", meaning_zh: "利用", related: ["take", "advantage"] },
    { word: "advantage over", meaning_zh: "胜过", related: ["advantage", "over"] },
    { word: "take", meaning_zh: "拿" },
    { word: "over", meaning_zh: "在……上方" },
    { word: "ghost", meaning_zh: "幽灵" },
  ]],
}];

const save = {
  cards: {
    "gaokao|0::advantage": { state: "learning", reps: 2, wrong: 2, correct: 0, mastery: 0, interval: 0 },
    "gaokao|0::life": { state: "review", interval: 3, reps: 4, correct: 4, wrong: 0, mastery: 3 },
    "gaokao|1::ghost": { state: "learning", reps: 1, wrong: 1, mastery: 0.5, interval: 0 },
  },
  wrongBook: {},
};
const graph = uni.buildGraph({
  tracks: fixture,
  trackId: "gaokao",
  save: save,
  events: [],
  cap: 12,
  seedPer: 2,
  neighborPer: 1,
});
assert.ok(graph.lemmas.every(function (node) { return !uni.isPhrase(node.word); }), "first paint has no phrases");
assert.ok(graph.spokes.every(function (edge) {
  return edge.from.indexOf("theme:") === 0 && edge.to.indexOf("lemma:") === 0;
}));
assert.strictEqual(graph.spokes.length, graph.lemmas.length);
assert.ok(graph.themes.some(function (t) { return t.id === "life"; }));
assert.ok(graph.themes.some(function (t) { return t.id === "technology"; }));
const advantage = graph.lemmas.find(function (n) { return n.word === "advantage"; });
const lifeNode = graph.lemmas.find(function (n) { return n.word === "life"; });
assert.ok(advantage, "a touched weak lemma is kept");
assert.ok(lifeNode);
assert.strictEqual(advantage.scored, true);
assert.strictEqual(advantage.mastery, 0);
assert.strictEqual(lifeNode.mastery, 3);
assert.ok(advantage.visual.light < lifeNode.visual.light);
assert.deepStrictEqual(advantage.phrases.map(function (p) { return p.word; }), ["take advantage of", "advantage over"]);
assert.strictEqual(advantage.phrases[0].primary, true);
assert.ok(advantage.phrases.every(function (p) { return p.word !== "have an advantage" && p.word !== "to one's advantage"; }));
assert.ok(advantage.coLemmas.indexOf("take") >= 0);
assert.ok(advantage.coLemmas.indexOf("over") >= 0);
assert.ok(graph.lemmas.some(function (n) { return n.word === "take" || n.word === "over"; }), "a co-lemma neighbor can join under the cap");

const empty = uni.buildGraph({
  tracks: fixture,
  trackId: "gaokao",
  save: { cards: {} },
  events: [],
  cap: 20,
  seedPer: 2,
  neighborPer: 0,
});
assert.ok(empty.lemmas.every(function (n) { return n.themeId === "life" || n.themeId === "technology"; }));
assert.ok(empty.lemmas.every(function (n) { return n.scored === false; }));
assert.ok(empty.stats.shown <= 20);

function loadTracks() {
  const ctx = { window: {} };
  vm.createContext(ctx);
  vm.runInContext(read("grok/exam-tracks.js"), ctx);
  return ctx.window.VOCAB_EXAM_TRACKS;
}

const tracks = loadTracks();
const zk = uni.buildGraph({ tracks: tracks, trackId: "zhongkao", save: { cards: {} }, events: [], cap: 32, seedPer: 6 });
assert.ok(zk.lemmas.some(function (n) { return n.word.toLowerCase() === "life"; }));
assert.ok(zk.lemmas.some(function (n) { return n.word.toLowerCase() === "technology"; }));
assert.ok(zk.lemmas.every(function (n) { return !uni.isPhrase(n.word); }));
assert.ok(zk.stats.shown <= 32);

const gkSave = {
  cards: {
    "gaokao|0::advantage": { state: "learning", reps: 1, wrong: 1, mastery: 0, interval: 0, correct: 0 },
  },
};
const gk = uni.buildGraph({ tracks: tracks, trackId: "gaokao", save: gkSave, events: [], cap: 40, seedPer: 4, neighborPer: 1 });
const gkAdv = gk.lemmas.find(function (n) { return n.word === "advantage"; });
assert.ok(gkAdv, "gaokao advantage is on the graph when it is the weak card");
assert.deepStrictEqual(gkAdv.phrases.map(function (p) { return p.word; }), ["take advantage of", "advantage over"]);
assert.strictEqual(gkAdv.phrases[0].primary, true);
const dumped = JSON.stringify(gkAdv.phrases);
assert.ok(dumped.indexOf("have an advantage") === -1);
assert.ok(dumped.indexOf("to one's advantage") === -1);

const index = read("grok/index.html");
const own = read("grok/own-study.js");
const panelAt = index.indexOf('id="stats-panel"');
const levelsAt = index.indexOf('id="screen-levels"');
const panel = index.slice(panelAt, levelsAt);
assert.ok(panel.indexOf('href="word-universe.html"') > 0, "entry sits in 我的学习数据");
assert.ok(own.indexOf("word-universe.html") > 0, "entry sits in 我的学情");
assert.ok(index.indexOf('src="study-metrics.js"') < index.indexOf('src="own-study.js"'));
assert.ok(index.indexOf('src="own-study.js"') < index.indexOf('src="game.js"'));
assert.ok(!index.includes('src="word-universe.js"'), "the game page does not boot the 3D view");
assert.ok(!read("grok/login.html").includes("word-universe"));
assert.ok(!read("grok/kill-streak.js").includes("word-universe"));
assert.ok(!read("grok/kill-streak.js").includes("universe"));
const configUrl = read("grok/config.js").match(/SUPABASE_URL:\s*"([^"]+)"/)[1];
assert.ok(/\.supabase\.co\/?$/.test(configUrl), configUrl);
assert.ok(read("grok/word-universe.html").includes("vendor/three.r128.min.js"));
assert.ok(!read("grok/word-universe.html").includes("config.js"));
assert.ok(!read("grok/word-universe.html").includes("supabase"));

const capped = uni.buildGraph({ tracks: tracks, trackId: "gaokao", save: gkSave, events: [], cap: 18, seedPer: 3, neighborPer: 0 });
assert.ok(capped.lemmas.length <= 18);

const stopTracks = [{
  id: "zhongkao",
  name: "中考",
  sets: [[
    { word: "life", meaning_zh: "生活" },
    { word: "technology", meaning_zh: "技术" },
    { word: "phone", meaning_zh: "电话", related: ["on the phone"] },
    { word: "on the phone", meaning_zh: "在打电话", related: ["on", "phone"] },
    { word: "on", meaning_zh: "在……上" },
  ]],
}];
const stopGraph = uni.buildGraph({
  tracks: stopTracks,
  trackId: "zhongkao",
  save: { cards: { "zhongkao|0::phone": { state: "learning", reps: 1, wrong: 1, mastery: 0, interval: 0, correct: 0 } } },
  events: [],
  cap: 20,
  seedPer: 1,
  neighborPer: 1,
});
assert.ok(stopGraph.lemmas.every(function (n) { return !uni.isPhrase(n.word); }));
assert.ok(!stopGraph.lemmas.some(function (n) { return n.word === "on"; }), "function-word co-lemmas do not take an orbit");
const phone = stopGraph.lemmas.find(function (n) { return n.word === "phone"; });
assert.ok(phone && phone.phrases.some(function (p) { return p.word === "on the phone" && p.primary; }));
assert.ok(phone.coLemmas.indexOf("on") >= 0);

console.log("word-universe ok");

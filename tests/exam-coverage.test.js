"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");

function loadTracks() {
  const ctx = { window: {} };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(root, "words.js"), "utf8"), ctx);
  vm.runInContext(fs.readFileSync(path.join(root, "tracks.js"), "utf8"), ctx);
  vm.runInContext(fs.readFileSync(path.join(root, "exam-tracks.js"), "utf8"), ctx);
  return ctx.window.VOCAB_TRACKS;
}

function norm(w) {
  return String(w).trim().toLowerCase().replace(/[’‘]/g, "'").replace(/\s+/g, " ");
}

const ALIAS = new Map();
for (const [a, b] of [
  ["colour", "color"], ["favourite", "favorite"], ["centre", "center"],
  ["towards", "toward"], ["per cent", "percent"], ["ice-cream", "ice cream"],
  ["programme", "program"], ["practise", "practice"], ["humour", "humor"],
  ["organise", "organize"], ["kilometre", "kilometer"], ["maths", "math"],
]) {
  const key = norm(a);
  ALIAS.set(norm(a), key);
  ALIAS.set(norm(b), key);
}

function senseKey(surface) {
  const n = norm(surface);
  if (n === "china") return surface === "china" ? "china:ware" : "china:country";
  if (n === "us") return surface === "US" ? "us:abbr" : "us:pron";
  if (n === "miss") return surface === "Miss" ? "miss:title" : "miss:verb";
  if (n === "march" || n === "may") return n + ":month";
  return ALIAS.get(n) || n;
}

function expand(entry) {
  const w = String(entry).replace(/\*/g, "").trim();
  if (w.includes("/")) return w.split("/").map((s) => s.trim()).filter(Boolean);
  return [w];
}

const tracks = loadTracks();
const zk = tracks.find((t) => t.id === "zhongkao");
const gk = tracks.find((t) => t.id === "gaokao");
assert.ok(zk && gk, "zhongkao and gaokao tracks exist");
assert.strictEqual(tracks.map((t) => t.id).join(","), "zhongkao,gaokao,core,ket,pet,cet4");

const zkCards = zk.sets.flat();
const gkCards = gk.sets.flat();
const zkKeys = new Set(zkCards.map((c) => senseKey(c.word)));
const gkKeys = new Set(gkCards.map((c) => senseKey(c.word)));

for (const card of zkCards.concat(gkCards)) {
  assert.ok(card.meaning_zh && card.example_en, "gloss+example " + card.word);
  assert.ok(card.pos, "pos " + card.word);
}

for (const tr of [zk, gk]) {
  for (const set of tr.sets) {
    assert.ok(set.length > 0 && set.length <= 50, tr.id + " set size " + set.length);
    const seen = new Set();
    for (const card of set) {
      const n = norm(card.word);
      assert.ok(!seen.has(n), "duplicate " + card.word);
      seen.add(n);
    }
  }
}

for (const card of zkCards) {
  assert.ok(gkKeys.has(senseKey(card.word)), "高考 missing 中考 lemma " + card.word);
}

const kebiao = JSON.parse(fs.readFileSync(path.join(root, "data/kebiao-lemmas.json"), "utf8"));
const missingJunior = [];
for (const entry of kebiao.juniorEntries) {
  for (const part of expand(entry)) {
    if (!zkKeys.has(senseKey(part))) missingJunior.push(part);
  }
}
const missingSenior = [];
for (const entry of kebiao.seniorEntries) {
  for (const part of expand(entry)) {
    if (!gkKeys.has(senseKey(part))) missingSenior.push(part);
  }
}
assert.deepStrictEqual(missingJunior, [], "中考 gaps: " + missingJunior.slice(0, 12).join(", "));
assert.deepStrictEqual(missingSenior, [], "高考 gaps: " + missingSenior.slice(0, 12).join(", "));

const summary = JSON.parse(fs.readFileSync(path.join(root, "data/coverage-summary.json"), "utf8"));
assert.strictEqual(summary.zhongkaoCards, zkCards.length);
assert.strictEqual(summary.gaokaoCards, gkCards.length);
assert.strictEqual(summary.subset, true);
assert.strictEqual(summary.juniorEntries, 1600);
assert.strictEqual(summary.seniorEntries, 2999);
assert.ok(summary.newGlosses > 700);

const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
assert.ok(html.includes('id="screen-gate" class="screen active"'), "gate is the landing screen");
assert.ok(html.includes('id="btn-gate-zhongkao"'), "中考 button");
assert.ok(html.includes('id="btn-gate-gaokao"'), "高考 button");
assert.ok(!html.includes('id="screen-home" class="screen active"'), "old home is not the landing screen");
const gate = html.split('id="screen-gate"')[1].split('id="screen-home"')[0];
assert.ok(!/报告码|备份|学习数据|KET|PET|四级/.test(gate), "gate has no extra panels or tracks");

console.log("exam-coverage ok", {
  zhongkao: zkCards.length,
  gaokao: gkCards.length,
  sets: [zk.sets.length, gk.sets.length],
  newGlosses: summary.newGlosses,
});

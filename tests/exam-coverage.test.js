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
  ["theatre", "theater"], ["grey", "gray"], ["metre", "meter"],
  ["litre", "liter"], ["honour", "honor"], ["labour", "labor"],
  ["neighbour", "neighbor"], ["defence", "defense"], ["offence", "offense"],
  ["licence", "license"], ["dialogue", "dialog"], ["programme", "program"],
  ["organise", "organize"], ["realise", "realize"], ["analyse", "analyze"],
  ["behaviour", "behavior"], ["towards", "toward"], ["mum", "mom"],
  ["maths", "math"], ["aeroplane", "airplane"], ["aluminium", "aluminum"],
  ["catalogue", "catalog"], ["humour", "humor"], ["flavour", "flavor"],
  ["favour", "favor"], ["rumour", "rumor"], ["odour", "odor"],
  ["harbour", "harbor"], ["armour", "armor"], ["endeavour", "endeavor"],
  ["judgement", "judgment"], ["skilful", "skillful"], ["fulfil", "fulfill"],
  ["enquiry", "inquiry"], ["moustache", "mustache"], ["pyjamas", "pajamas"],
  ["plough", "plow"], ["sceptical", "skeptical"], ["speciality", "specialty"],
  ["ageing", "aging"], ["per cent", "percent"], ["ice-cream", "ice cream"],
  ["e-mail", "email"], ["okay", "ok"], ["wi-fi", "wifi"],
  ["practise", "practice"], ["kilometre", "kilometer"],
  ["centimetre", "centimeter"], ["millimetre", "millimeter"],
  ["gramme", "gram"], ["apologise", "apologize"], ["recognise", "recognize"],
  ["yoghurt", "yogurt"], ["woollen", "woolen"], ["jewellery", "jewelry"],
  ["tyre", "tire"], ["storey", "story"], ["goodbye", "good-bye"],
  ["cooperation", "co-operation"], ["café", "cafe"],
  ["organisation", "organization"], ["fibre", "fiber"], ["cosy", "cozy"],
  ["checkout", "check-out"], ["mum", "mommy"],
]) {
  const key = norm(a);
  ALIAS.set(norm(a), key);
  ALIAS.set(norm(b), key);
}

function senseKey(surface) {
  const raw = String(surface || "").trim();
  const n = norm(raw);
  if (n === "china") return raw === "china" ? "china:ware" : "china:country";
  if (n === "us" || n === "u.s." || n === "usa" || n === "u.s.a.") {
    if (raw === "us") return "us:pron";
    return "us:abbr";
  }
  if (n === "uk" || n === "u.k.") return "uk";
  if (n === "who") return raw === "WHO" ? "who:abbr" : "who";
  if (n === "miss") return raw === "Miss" ? "miss:title" : "miss:verb";
  if (n === "march") return raw === "March" ? "march:month" : "march";
  if (n === "may") return raw === "May" ? "may:month" : "may";
  const folded = n.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return ALIAS.get(n) || ALIAS.get(folded) || n;
}

function listForms(item) {
  const forms = [item];
  if (item.includes("(") && item.endsWith(")")) {
    forms.push(item.slice(0, item.lastIndexOf("(")).trim());
    forms.push(item.slice(item.lastIndexOf("(") + 1, -1).trim());
  }
  return forms;
}

function coveredBy(item, keys) {
  for (const form of listForms(item)) {
    if (keys.has(senseKey(form))) return true;
    const bare = form.replace(/^the\s+/i, "");
    if (bare !== form && keys.has(senseKey(bare))) return true;
  }
  return false;
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
  assert.ok(card.meaning_zh && card.example_en && card.example_zh, "gloss+example+translation " + card.word);
  assert.ok(card.pos, "pos " + card.word);
}

for (const tr of [zk, gk]) {
  const seen = new Set();
  for (const card of tr.sets.flat()) {
    const key = senseKey(card.word);
    assert.ok(!seen.has(key), tr.id + " duplicate lemma " + card.word);
    seen.add(key);
  }
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

function readAudit(name) {
  return fs.readFileSync(path.join(root, "data/audit", name), "utf8")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));
}

const separateMissing = readAudit("kebiao2022_separate_lists.txt").filter((item) => !coveredBy(item, zkKeys));
assert.deepStrictEqual(separateMissing, [], "附录3 gaps: " + separateMissing.slice(0, 8).join(" | "));
const countryMissing = readAudit("missing_HScountry_vs_QMgaokao.txt").filter((item) => !coveredBy(item, gkKeys));
assert.deepStrictEqual(countryMissing, [], "country gaps: " + countryMissing.slice(0, 8).join(", "));

const whoCard = zkCards.find((c) => c.word === "WHO");
const whoPronoun = zkCards.find((c) => c.word === "who");
assert.ok(whoCard && whoCard.meaning_zh.includes("世界卫生组织"), "WHO is the organisation");
assert.ok(whoPronoun, "pronoun who remains");
assert.notStrictEqual(senseKey("WHO"), senseKey("who"));

const mayCard = zkCards.find((c) => c.word === "may");
const mayMonth = zkCards.find((c) => c.word === "May");
assert.ok(mayCard && /可以|也许/.test(mayCard.meaning_zh), "may stays the modal");
assert.ok(mayMonth && mayMonth.meaning_zh.includes("五月"), "May the month is its own card");

function titlesAreOfficialThenExt(track, extLabel) {
  const titles = track.titles || [];
  assert.strictEqual(titles.length, track.sets.length, track.id + " titles");
  let seenExt = false;
  for (const title of titles) {
    const isExt = title.includes("拓展");
    if (isExt) {
      seenExt = true;
      assert.ok(title.startsWith(extLabel), title);
    } else if (seenExt) {
      assert.fail(track.id + " official title after 拓展: " + title);
    }
  }
  assert.ok(seenExt, track.id + " has 拓展 sets");
}
titlesAreOfficialThenExt(zk, "中考拓展");
titlesAreOfficialThenExt(gk, "高考拓展");

const drops = JSON.parse(fs.readFileSync(path.join(root, "data/extension-drops.json"), "utf8"));
const dropped = new Set(drops.map((d) => norm(d.word)));
for (const file of [
  "missing_SZlist_vs_QMzhongkao_core.txt",
  "missing_MVzhongkao_vs_QMzhongkao_core.txt",
  "missing_GD2015A_vs_QMzhongkao_core.txt",
]) {
  for (const word of readAudit(file)) {
    const ok = zkKeys.has(senseKey(word)) || dropped.has(norm(word));
    assert.ok(ok, "中考 list item neither kept nor dropped: " + word);
  }
}
for (const word of readAudit("missing_Gaokao3500_vs_QMgaokao_core.txt")) {
  const ok = gkKeys.has(senseKey(word)) || dropped.has(norm(word));
  assert.ok(ok, "3500 item neither kept nor dropped: " + word);
}
for (const junk of ["varous", "buttom", "caf", "curd", "top-right"]) {
  assert.ok(!zkKeys.has(senseKey(junk)) && !gkKeys.has(senseKey(junk)), "junk leaked: " + junk);
}

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

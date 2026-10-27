/* Append independent 中考·固定搭配 sets onto grok/exam-tracks.js.
 * Does not rebuild 高考, does not rewrite the existing 58 中考 sets.
 * Run: node tools/append-zhongkao-collocations.js
 */
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { relatedLemmas, indexSingleWordBank, normToken } = require("./zhongkao-collocation-related");
const { exampleCoversLemma } = require("./zhongkao-collocation-examples");
const { isTemplateExample } = require("./example-templates");

const root = path.join(__dirname, "..");
const examPath = path.join(root, "grok", "exam-tracks.js");
const SET_SIZE = 47;
const TITLE_PREFIX = "中考·固定搭配 ";

const POS_BY_TYPE = {
  be_adj_prep: "adj.",
  connector_pattern: "conj.",
  other_set: "n.",
  phrasal_verb_or_vp: "v.",
  prep_phrase: "prep.",
  quantifier_set: "det.",
};

const TYPE_ORDER = Object.keys(POS_BY_TYPE);

function loadTracks(file) {
  const ctx = { window: {} };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(file, "utf8"), ctx);
  return ctx.window.VOCAB_EXAM_TRACKS;
}

function loadRows() {
  const dir = path.join(root, "data", "zhongkao-collocations");
  const files = fs.readdirSync(dir).filter((name) => name.endsWith(".js")).sort();
  const rows = [];
  for (const name of files) {
    const part = require(path.join(dir, name));
    for (const row of part) rows.push(row);
  }
  return rows;
}

function loadLemmaList() {
  const csv = fs.readFileSync(
    path.join(root, "data", "zhongkao-fixed-collocations-lemmas.csv"),
    "utf8"
  );
  return csv.trim().split(/\r?\n/).slice(1).map((line) => {
    const comma = line.indexOf(",");
    return { lemma: line.slice(0, comma), type: line.split(",")[1] };
  });
}

function pack(cards, size) {
  const sets = [];
  let cur = [];
  for (const card of cards) {
    if (cur.length >= size) {
      sets.push(cur);
      cur = [];
    }
    cur.push(card);
  }
  if (cur.length) sets.push(cur);
  return sets;
}

function buildCards(baseWords) {
  const authored = new Map();
  for (const row of loadRows()) {
    const [lemma, meaning_zh, example_en, example_zh] = row;
    if (authored.has(lemma)) throw new Error("Duplicate authored lemma: " + lemma);
    authored.set(lemma, { meaning_zh, example_en, example_zh });
  }
  const expected = loadLemmaList();
  if (expected.length !== authored.size) {
    throw new Error("Authored " + authored.size + " lemmas, list has " + expected.length);
  }
  const bank = indexSingleWordBank(baseWords);
  const seenNorm = new Set(baseWords.map(normToken));
  const cards = [];
  const glosses = new Map();
  const problems = [];
  for (const item of expected) {
    const row = authored.get(item.lemma);
    if (!row) {
      problems.push("Missing gloss for " + item.lemma);
      continue;
    }
    if (!POS_BY_TYPE[item.type]) problems.push("Unknown type " + item.type + " / " + item.lemma);
    const key = normToken(item.lemma);
    if (key === "according to") problems.push("according to must stay out of the new sets");
    if (seenNorm.has(key)) problems.push("Lemma already in 中考 bank: " + item.lemma);
    seenNorm.add(key);
    if (!row.meaning_zh || !row.example_en || !row.example_zh) {
      problems.push("Incomplete card: " + item.lemma);
    }
    if (isTemplateExample(row.example_en)) {
      problems.push("Template example: " + item.lemma + " / " + row.example_en);
    }
    if (!exampleCoversLemma(item.lemma, row.example_en)) {
      problems.push("Example does not use lemma: " + item.lemma + " / " + row.example_en);
    }
    if (glosses.has(row.meaning_zh)) {
      problems.push("Duplicate gloss 「" + row.meaning_zh + "」 on " + item.lemma + " and " + glosses.get(row.meaning_zh));
    }
    glosses.set(row.meaning_zh, item.lemma);
    const pos = POS_BY_TYPE[item.type];
    const related = relatedLemmas(item.lemma, bank);
    if (!related.length) problems.push("Empty related list: " + item.lemma);
    cards.push({
      word: item.lemma,
      pos,
      meaning_zh: row.meaning_zh,
      example_en: row.example_en,
      example_zh: row.example_zh,
      scene: "中考",
      root_group: pos,
      related,
    });
  }
  if (problems.length) {
    throw new Error(problems.length + " problems\n" + problems.join("\n"));
  }
  return cards;
}

function main() {
  const raw = fs.readFileSync(examPath, "utf8");
  const tracks = loadTracks(examPath);
  const zk = tracks.find((t) => t.id === "zhongkao");
  const gk = tracks.find((t) => t.id === "gaokao");
  if (!zk || !gk) throw new Error("zhongkao / gaokao track missing");

  while (zk.titles.length && String(zk.titles[zk.titles.length - 1]).startsWith(TITLE_PREFIX)) {
    zk.titles.pop();
    zk.sets.pop();
  }
  if (zk.sets.length !== 58) throw new Error("Expected 58 base 中考 sets, got " + zk.sets.length);
  const baseCards = zk.sets.flat();
  if (baseCards.length !== 2821) throw new Error("Expected 2821 base cards, got " + baseCards.length);
  const baseSets = JSON.stringify(zk.sets);
  const baseTitles = JSON.stringify(zk.titles);
  const gaokaoJson = JSON.stringify(gk);
  const header = raw.slice(0, raw.indexOf("window.VOCAB_EXAM_TRACKS"));

  const cards = buildCards(baseCards.map((c) => c.word));
  const sets = pack(cards, SET_SIZE);
  if (sets.length < 11 || sets.some((set) => set.length < 40 || set.length > 50)) {
    throw new Error("Set sizes out of range: " + sets.map((s) => s.length).join(","));
  }
  zk.sets = zk.sets.concat(sets);
  for (let i = 1; i <= sets.length; i++) zk.titles.push(TITLE_PREFIX + i);

  if (JSON.stringify(zk.sets.slice(0, 58)) !== baseSets) throw new Error("Base sets changed");
  if (JSON.stringify(zk.titles.slice(0, 58)) !== baseTitles) throw new Error("Base titles changed");
  if (JSON.stringify(gk) !== gaokaoJson) throw new Error("高考 track changed");

  const body = "window.VOCAB_EXAM_TRACKS = " + JSON.stringify(tracks) + ";\n" +
    "(function () {\n" +
    "  var extra = window.VOCAB_EXAM_TRACKS || [];\n" +
    "  var base = (window.VOCAB_TRACKS || []).filter(function (t) { return t.id !== \"zhongkao\" && t.id !== \"gaokao\"; });\n" +
    "  window.VOCAB_TRACKS = extra.concat(base);\n" +
    "})();\n";
  fs.writeFileSync(examPath, header + body);
  console.log(JSON.stringify({
    sets: sets.length,
    cards: cards.length,
    sizes: sets.map((s) => s.length),
    titles: zk.titles.slice(58),
    zhongkaoSets: zk.sets.length,
    zhongkaoCards: zk.sets.flat().length,
    gaokaoCards: gk.sets.flat().length,
  }, null, 2));
}

if (require.main === module) {
  try {
    main();
  } catch (err) {
    console.error(err.message || err);
    process.exit(1);
  }
}

module.exports = { buildCards, pack, main };

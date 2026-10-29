/* Append independent 高考·固定搭配 sets onto grok/exam-tracks.js.
 * Does not rebuild 中考, does not rewrite the existing 86 高考 sets.
 * Run: node tools/append-gaokao-collocations.js
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
const TITLE_PREFIX = "高考·固定搭配 ";
const BASE_SETS = 86;
const BASE_CARDS = 4243;

const POS_BY_TYPE = {
  be_adj_prep: "adj.",
  phrasal_verb_or_vp: "v.",
  prep_phrase: "prep.",
  connector_other: "n.",
};

/* Discourse items in connector_other are not noun+prep patterns. */
const POS_OVERRIDE = {
  "as a matter of fact": "adv.",
  "as far as": "conj.",
  "as for": "prep.",
  "as to": "prep.",
  "as well as": "conj.",
  "because of": "prep.",
  "even so": "adv.",
  "focus on": "v.",
  "glance at": "v.",
  "in addition to": "prep.",
  "in case of": "prep.",
  "in conclusion": "adv.",
  "in general": "adv.",
  "in spite of": "prep.",
  "in terms of": "prep.",
  "in view of": "prep.",
  "instead of": "prep.",
  "needless to say": "adv.",
  "on condition that": "conj.",
  "owing to": "prep.",
  "regardless of": "prep.",
  "thanks to": "prep.",
};

function loadTracks(file) {
  const ctx = { window: {} };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(file, "utf8"), ctx);
  return ctx.window.VOCAB_EXAM_TRACKS;
}

function loadRows() {
  const dir = path.join(root, "data", "gaokao-collocations");
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
    path.join(root, "data", "gaokao-fixed-collocations-lemmas.csv"),
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

function posFor(item) {
  if (Object.prototype.hasOwnProperty.call(POS_OVERRIDE, item.lemma) && POS_OVERRIDE[item.lemma]) {
    return POS_OVERRIDE[item.lemma];
  }
  return POS_BY_TYPE[item.type];
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
    if (!posFor(item)) problems.push("Unknown type " + item.type + " / " + item.lemma);
    const key = normToken(item.lemma);
    if (key === "according to" || key === "due to") {
      problems.push(item.lemma + " is already on the 高考 track and must stay out of the new sets");
    }
    if (seenNorm.has(key)) problems.push("Lemma already in 高考 bank: " + item.lemma);
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
    const pos = posFor(item);
    const related = relatedLemmas(item.lemma, bank);
    if (!related.length) problems.push("Empty related list: " + item.lemma);
    cards.push({
      word: item.lemma,
      pos,
      meaning_zh: row.meaning_zh,
      example_en: row.example_en,
      example_zh: row.example_zh,
      scene: "高考",
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

  while (gk.titles.length && String(gk.titles[gk.titles.length - 1]).startsWith(TITLE_PREFIX)) {
    gk.titles.pop();
    gk.sets.pop();
  }
  if (gk.sets.length !== BASE_SETS) throw new Error("Expected " + BASE_SETS + " base 高考 sets, got " + gk.sets.length);
  const baseCards = gk.sets.flat();
  if (baseCards.length !== BASE_CARDS) throw new Error("Expected " + BASE_CARDS + " base cards, got " + baseCards.length);
  const baseSets = JSON.stringify(gk.sets);
  const baseTitles = JSON.stringify(gk.titles);
  const zhongkaoJson = JSON.stringify(zk);
  const header = raw.slice(0, raw.indexOf("window.VOCAB_EXAM_TRACKS"));

  const cards = buildCards(baseCards.map((c) => c.word));
  const sets = pack(cards, SET_SIZE);
  if (sets.length !== 11 || sets.some((set) => set.length !== SET_SIZE)) {
    throw new Error("Set sizes out of range: " + sets.map((s) => s.length).join(","));
  }
  gk.sets = gk.sets.concat(sets);
  for (let i = 1; i <= sets.length; i++) gk.titles.push(TITLE_PREFIX + i);

  if (JSON.stringify(gk.sets.slice(0, BASE_SETS)) !== baseSets) throw new Error("Base sets changed");
  if (JSON.stringify(gk.titles.slice(0, BASE_SETS)) !== baseTitles) throw new Error("Base titles changed");
  if (JSON.stringify(zk) !== zhongkaoJson) throw new Error("中考 track changed");

  const kept = gk.sets.slice(0, BASE_SETS).flat();
  const added = gk.sets.slice(BASE_SETS).flat();
  if (kept.filter((c) => normToken(c.word) === "according to").length !== 1) {
    throw new Error("according to should remain once on the old 高考 bank");
  }
  if (kept.filter((c) => normToken(c.word) === "due to").length !== 1) {
    throw new Error("due to should remain once on the old 高考 bank");
  }
  if (added.some((c) => normToken(c.word) === "according to" || normToken(c.word) === "due to")) {
    throw new Error("according to / due to leaked into the new sets");
  }

  const body = "window.VOCAB_EXAM_TRACKS = " + JSON.stringify(tracks) + ";\n" +
    "(function () {\n" +
    "  var extra = window.VOCAB_EXAM_TRACKS || [];\n" +
    "  var base = (window.VOCAB_TRACKS || []).filter(function (t) { return t.id !== \"zhongkao\" && t.id !== \"gaokao\"; });\n" +
    "  window.VOCAB_TRACKS = extra.concat(base);\n" +
    "})();\n";
  fs.writeFileSync(examPath, header + body);
  const relatedCards = added.filter((c) => Array.isArray(c.related) && c.related.length).length;
  console.log(JSON.stringify({
    sets: sets.length,
    cards: cards.length,
    sizes: sets.map((s) => s.length),
    titles: gk.titles.slice(BASE_SETS),
    gaokaoSets: gk.sets.length,
    gaokaoCards: gk.sets.flat().length,
    relatedCards,
    zhongkaoCards: zk.sets.flat().length,
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

module.exports = { buildCards, pack, main, posFor };

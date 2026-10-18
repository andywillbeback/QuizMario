/* Build 中考 / 高考 tracks from the national curriculum headword lists.
 * Reuses bank glosses and examples when a lemma is already present.
 * Gap lemmas come from tools/lexicon_*.py (original sentences).
 * Run: node tools/build-exam-tracks.js
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const root = path.join(__dirname, "..");

function readJsAssign(file, globalName) {
  const sandbox = { window: {} };
  const code = fs.readFileSync(path.join(root, file), "utf8");
  const fn = new Function("window", code + "\nreturn window." + globalName + ";");
  return fn(sandbox.window);
}

const ALIAS_PAIRS = [
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
  ["gramme", "gram"],
];

const ALIAS = new Map();
for (const [a, b] of ALIAS_PAIRS) {
  const key = norm(a);
  ALIAS.set(norm(a), key);
  ALIAS.set(norm(b), key);
}

function norm(w) {
  return String(w || "")
    .trim()
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/\s+/g, " ");
}

/** Sense key so China/china, US/us and Miss/miss stay distinct. */
function senseKey(surface) {
  const n = norm(surface);
  if (n === "china") return surface === "china" ? "china:ware" : "china:country";
  if (n === "us") return surface === "US" ? "us:abbr" : "us:pron";
  if (n === "miss") return surface === "Miss" ? "miss:title" : "miss:verb";
  if (n === "march" || n === "may") return n + ":month";
  return ALIAS.get(n) || n;
}

function expandEntry(entry) {
  const w = String(entry).replace(/\*/g, "").trim();
  if (w.includes("/")) return w.split("/").map((s) => s.trim()).filter(Boolean);
  return [w];
}

function loadLexicon() {
  const py = [
    "import importlib.util, json",
    "def load(p):",
    "    spec = importlib.util.spec_from_file_location('m', p)",
    "    m = importlib.util.module_from_spec(spec)",
    "    spec.loader.exec_module(m)",
    "    return m",
    "A=load('tools/lexicon_a.py').A",
    "B=load('tools/lexicon_b.py').B",
    "C=load('tools/lexicon_c.py').C",
    "D=load('tools/lexicon_d.py').D",
    "out={}",
    "for d in (A,B,C,D):",
    "    for k,v in d.items():",
    "        out[k]={'pos':v[0],'meaning_zh':v[1],'example_en':v[2],'example_zh':v[3]}",
    "print(json.dumps(out, ensure_ascii=False))",
  ].join("\n");
  const raw = execFileSync("python3", ["-c", py], { cwd: root, encoding: "utf8", maxBuffer: 20 * 1024 * 1024 });
  return JSON.parse(raw);
}

function indexEntries(lists) {
  const map = new Map();
  for (const list of lists) {
    if (!list) continue;
    for (const entry of list) {
      if (!entry || !entry.word) continue;
      const key = senseKey(entry.word);
      if (!map.has(key)) map.set(key, entry);
    }
  }
  return map;
}

function flattenSets(track) {
  if (!track || !track.sets) return [];
  const out = [];
  for (const set of track.sets) out.push(...set);
  return out;
}

function cardFromBank(entry, surface, scene) {
  const word = surface;
  let example = entry.example_en || "";
  const bankNorm = norm(entry.word);
  const surfaceNorm = norm(surface);
  if (bankNorm !== surfaceNorm && example) {
    const re = new RegExp("\\b" + bankNorm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "gi");
    example = example.replace(re, surface);
  }
  return {
    word,
    pos: entry.pos || "",
    meaning_zh: entry.meaning_zh || "",
    example_en: example,
    example_zh: entry.example_zh || "",
    scene,
    root_group: entry.pos || entry.root_group || "",
  };
}

function cardFromLex(surface, lex, scene) {
  const item = lex[surface];
  if (!item) return null;
  return {
    word: surface,
    pos: item.pos,
    meaning_zh: item.meaning_zh,
    example_en: item.example_en,
    example_zh: item.example_zh,
    scene,
    root_group: item.pos,
  };
}

function makeCard(surface, bank, lex, scene, gaps) {
  const key = senseKey(surface);
  if (bank.has(key)) return cardFromBank(bank.get(key), surface, scene);
  const created = cardFromLex(surface, lex, scene);
  if (created) {
    gaps.push(surface);
    return created;
  }
  throw new Error("No gloss for lemma: " + surface + " (" + key + ")");
}

function dedupeSurfaces(surfaces) {
  const seen = new Set();
  const out = [];
  for (const surface of surfaces) {
    const key = senseKey(surface);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(surface);
  }
  return out;
}

function pack(cards, size) {
  const sets = [];
  let cur = [];
  let seen = new Set();
  const flush = () => {
    if (!cur.length) return;
    sets.push(cur);
    cur = [];
    seen = new Set();
  };
  for (const card of cards) {
    const n = norm(card.word);
    if (seen.has(n) || cur.length >= size) flush();
    cur.push(card);
    seen.add(n);
  }
  flush();
  return sets;
}

function titlesFor(label, n) {
  const titles = [];
  for (let i = 1; i <= n; i++) titles.push(label + " · 第" + i + "组");
  return titles;
}

function trackObject(id, name, desc, cards, sceneLabel) {
  const sets = pack(cards, 50);
  return {
    id,
    name,
    sets,
    titles: titlesFor(sceneLabel, sets.length),
    desc,
  };
}

function main() {
  const kebiao = JSON.parse(fs.readFileSync(path.join(root, "data/kebiao-lemmas.json"), "utf8"));
  const lex = loadLexicon();
  const levels = readJsAssign("words.js", "VOCAB_LEVELS");
  const tracks = readJsAssign("tracks.js", "VOCAB_TRACKS");
  let previousExam = [];
  const examPath = path.join(root, "exam-tracks.js");
  if (fs.existsSync(examPath)) {
    try { previousExam = readJsAssign("exam-tracks.js", "VOCAB_EXAM_TRACKS") || []; } catch (_) { previousExam = []; }
  }

  const coreList = [];
  for (const set of levels) coreList.push(...set);
  const byId = {};
  for (const t of tracks) byId[t.id] = flattenSets(t);
  for (const t of previousExam) byId[t.id] = (byId[t.id] || []).concat(flattenSets(t));

  const bank = indexEntries([
    coreList,
    byId.zhongkao,
    byId.ket,
    byId.pet,
    byId.cet4,
    byId.gaokao,
  ]);

  const juniorSurfaces = dedupeSurfaces(kebiao.juniorEntries.flatMap(expandEntry));
  const seniorSurfaces = dedupeSurfaces(kebiao.seniorEntries.flatMap(expandEntry));

  const appendix = [
    "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday",
    "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December",
    "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
    "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen", "twenty",
    "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety", "hundred", "thousand", "million",
    "first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth",
  ];
  const juniorKeys = new Set(juniorSurfaces.map(senseKey));
  const appendixAdded = [];
  for (const w of appendix) {
    if (!juniorKeys.has(senseKey(w))) {
      juniorSurfaces.push(w);
      juniorKeys.add(senseKey(w));
      appendixAdded.push(w);
    }
  }

  const gaps = [];
  const zhongkaoCards = juniorSurfaces.map((s) => makeCard(s, bank, lex, "中考", gaps));
  const zhongkaoKeySet = new Set(zhongkaoCards.map((c) => senseKey(c.word)));

  const gaokaoExtraSurfaces = [];
  for (const s of seniorSurfaces) {
    if (!zhongkaoKeySet.has(senseKey(s))) gaokaoExtraSurfaces.push(s);
  }
  const gaokaoExtraCards = gaokaoExtraSurfaces.map((s) => makeCard(s, bank, lex, "高考", gaps));
  const gaokaoCards = zhongkaoCards.map((c) => Object.assign({}, c, { scene: "高考" })).concat(gaokaoExtraCards);

  const zhongkao = trackObject(
    "zhongkao",
    "中考",
    "广东初中学业水平考试英语：义务教育英语课程标准（2022年版）三级词汇全覆盖，并含课标单独列出的月份、星期和基础数词",
    zhongkaoCards,
    "中考"
  );
  const gaokao = trackObject(
    "gaokao",
    "高考",
    "广东新高考英语：中考词全包含，并覆盖普通高中英语课程标准（2017年版2020年修订）词汇表",
    gaokaoCards,
    "高考"
  );

  // Old 中考核心 extras (not on the 2022 三级 list).
  const oldZk = (tracks.find((t) => t.id === "zhongkao") || { sets: [] });
  const oldWords = flattenSets(oldZk).map((c) => c.word);
  const extraOnly = oldWords.filter((w) => !zhongkaoKeySet.has(senseKey(w)));

  const juniorOnly = juniorSurfaces.filter((s) => !new Set(seniorSurfaces.map(senseKey)).has(senseKey(s)));

  const summary = {
    juniorSource: kebiao.juniorSource,
    seniorSource: kebiao.seniorSource,
    juniorEntries: kebiao.juniorEntries.length,
    juniorLemmas: juniorSurfaces.length - appendixAdded.length,
    appendixAdded,
    zhongkaoCards: zhongkaoCards.length,
    zhongkaoSets: zhongkao.sets.length,
    seniorEntries: kebiao.seniorEntries.length,
    seniorLemmas: seniorSurfaces.length,
    gaokaoExtraLemmas: gaokaoExtraCards.length,
    gaokaoCards: gaokaoCards.length,
    gaokaoSets: gaokao.sets.length,
    newGlosses: gaps.length,
    reusedFromBank: zhongkaoCards.length + gaokaoExtraCards.length - gaps.length,
    extraOnlyOldZhongkao: extraOnly,
    juniorLemmasOutsideSeniorList: juniorOnly,
    subset: zhongkaoCards.every((c) => gaokaoCards.some((g) => norm(g.word) === norm(c.word) && g.meaning_zh === c.meaning_zh)),
  };

  const header = "/* QuizMario 中考 / 高考 tracks. Generated by tools/build-exam-tracks.js. Original examples; curriculum headwords only. */\n";
  const body = "window.VOCAB_EXAM_TRACKS = " + JSON.stringify([zhongkao, gaokao]) + ";\n" +
    "(function () {\n" +
    "  var extra = window.VOCAB_EXAM_TRACKS || [];\n" +
    "  var base = (window.VOCAB_TRACKS || []).filter(function (t) { return t.id !== \"zhongkao\" && t.id !== \"gaokao\"; });\n" +
    "  window.VOCAB_TRACKS = extra.concat(base);\n" +
    "})();\n";
  fs.writeFileSync(path.join(root, "exam-tracks.js"), header + body);

  const kept = tracks.filter((t) => t.id !== "zhongkao" && t.id !== "gaokao");
  const tracksHeader = "/* QuizMario exam-aligned tracks. 中考/高考 live in exam-tracks.js. */\n";
  fs.writeFileSync(path.join(root, "tracks.js"), tracksHeader + "window.VOCAB_TRACKS = " + JSON.stringify(kept) + ";\n");

  fs.writeFileSync(path.join(root, "data/coverage-summary.json"), JSON.stringify(summary, null, 2) + "\n");
  console.log(JSON.stringify(summary, null, 2));
}

main();

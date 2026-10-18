/* Build 中考 / 高考 tracks from the national curriculum headword lists.
 * Official gaps (2022 附录3, senior country table) stay in the main sets.
 * Circulating textbook / 3500 words are appended afterwards as 拓展 sets.
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
  ["gramme", "gram"], ["apologise", "apologize"], ["recognise", "recognize"],
  ["yoghurt", "yogurt"], ["woollen", "woolen"], ["jewellery", "jewelry"],
  ["tyre", "tire"], ["storey", "story"], ["goodbye", "good-bye"],
  ["cooperation", "co-operation"], ["café", "cafe"],
  ["organisation", "organization"], ["fibre", "fiber"], ["cosy", "cozy"],
  ["checkout", "check-out"], ["mum", "mommy"],
];

const ALIAS = new Map();
for (const [a, b] of ALIAS_PAIRS) {
  const key = norm(a);
  ALIAS.set(norm(a), key);
  ALIAS.set(norm(b), key);
  ALIAS.set(fold(a), key);
  ALIAS.set(fold(b), key);
}

function norm(w) {
  return String(w || "")
    .trim()
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/\s+/g, " ");
}

function fold(w) {
  return norm(w).normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/** Sense key so China/china, US/us, WHO/who, May/may and Miss/miss stay distinct. */
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
  return ALIAS.get(n) || ALIAS.get(fold(raw)) || n;
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
    "O=load('tools/official_lexicon.py').OFFICIAL",
    "base={}; overlay={}",
    "for d in (A,B,C,D):",
    "    for k,v in d.items():",
    "        base[k]={'pos':v[0],'meaning_zh':v[1],'example_en':v[2],'example_zh':v[3]}",
    "for k,v in O.items():",
    "    overlay[k]={'pos':v[0],'meaning_zh':v[1],'example_en':v[2],'example_zh':v[3]}",
    "print(json.dumps({'base':base,'overlay':overlay}, ensure_ascii=False))",
  ].join("\n");
  const raw = execFileSync("python3", ["-c", py], { cwd: root, encoding: "utf8", maxBuffer: 20 * 1024 * 1024 });
  const parsed = JSON.parse(raw);
  const overlay = parsed.overlay;
  const dir = path.join(root, "tools", "lex");
  for (const name of fs.readdirSync(dir).filter((f) => f.endsWith(".json")).sort()) {
    const extra = JSON.parse(fs.readFileSync(path.join(dir, name), "utf8"));
    for (const [k, v] of Object.entries(extra)) overlay[k] = v;
  }
  return { base: parsed.base, overlay };
}

function loadExtensionPlan() {
  const raw = execFileSync("python3", ["tools/clean-extension.py"], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
  });
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

function makeCard(surface, bank, lex, scene, gaps, zhPatch) {
  // Authored overlay wins so new official and 拓展 cards keep their own sentences.
  if (lex.overlay[surface]) {
    gaps.push(surface);
    const card = cardFromLex(surface, lex.overlay, scene);
    if (!card.example_zh || !card.example_en || !card.meaning_zh || !card.pos) {
      throw new Error("Incomplete lexicon card: " + surface);
    }
    return card;
  }
  const key = senseKey(surface);
  if (bank.has(key)) {
    const card = cardFromBank(bank.get(key), surface, scene);
    if (!card.example_zh) {
      card.example_zh = zhPatch[card.word] || zhPatch[surface] || zhPatch[norm(surface)] || zhPatch[norm(card.word)] || "";
    }
    if (!card.example_zh || !card.example_en || !card.meaning_zh || !card.pos) {
      throw new Error("Incomplete card: " + surface);
    }
    return card;
  }
  const created = cardFromLex(surface, lex.base, scene);
  if (created) {
    gaps.push(surface);
    if (!created.example_zh || !created.example_en || !created.meaning_zh || !created.pos) {
      throw new Error("Incomplete base lexicon card: " + surface);
    }
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

function assemble(id, name, desc, officialCards, extCards, offLabel, extLabel) {
  const offSets = pack(officialCards, 50);
  const extSets = pack(extCards, 50);
  return {
    id,
    name,
    sets: offSets.concat(extSets),
    titles: titlesFor(offLabel, offSets.length).concat(titlesFor(extLabel, extSets.length)),
    desc,
    officialSets: offSets.length,
    extensionSets: extSets.length,
  };
}

function readList(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));
}

const SURFACE_OVERRIDE = {
  "the United Kingdom (UK)": "UK",
  "the United States of America (USA)": "USA",
  "Beijing opera (Peking opera)": "Beijing opera",
  "the Changjiang River (the Yangtze River)": "the Changjiang River",
  "Traditional Chinese Medicine (TCM)": "Traditional Chinese Medicine",
};

function main() {
  const kebiao = JSON.parse(fs.readFileSync(path.join(root, "data/kebiao-lemmas.json"), "utf8"));
  const lex = loadLexicon();
  const zhPatch = JSON.parse(fs.readFileSync(path.join(root, "data/example-zh-patch.json"), "utf8"));
  const plan = loadExtensionPlan();
  const levels = readJsAssign("words.js", "VOCAB_LEVELS");
  const tracks = readJsAssign("tracks.js", "VOCAB_TRACKS");
  let previousExam = [];
  const examPath = path.join(root, "exam-tracks.js");
  if (fs.existsSync(examPath)) {
    try { previousExam = readJsAssign("exam-tracks.js", "VOCAB_EXAM_TRACKS") || []; } catch (_) { previousExam = []; }
  }

  // Size of the tracks before the 2022 appendix-3 and 拓展 addition.
  const before = {
    zhongkao: { cards: 1667, sets: 34, officialSets: 34, extensionSets: 0, officialCards: 1667, extensionCards: 0 },
    gaokao: { cards: 3058, sets: 62, officialSets: 62, extensionSets: 0, officialCards: 3058, extensionCards: 0 },
  };

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
  const seniorSurfaces = dedupeSurfaces(
    kebiao.seniorEntries.flatMap(expandEntry).concat(readList("data/audit/missing_HScountry_vs_QMgaokao.txt"))
  );

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

  const separateAdded = [];
  for (const item of readList("data/audit/kebiao2022_separate_lists.txt")) {
    const surface = SURFACE_OVERRIDE[item] || item;
    if (!juniorKeys.has(senseKey(surface))) {
      juniorSurfaces.push(surface);
      juniorKeys.add(senseKey(surface));
      separateAdded.push(surface);
    }
  }

  const gaps = [];
  const zhongkaoOfficial = juniorSurfaces.map((s) => makeCard(s, bank, lex, "中考", gaps, zhPatch));
  const zhongkaoOfficialKeys = new Set(zhongkaoOfficial.map((c) => senseKey(c.word)));
  const zhongkaoExt = plan.zhongkao.map((s) => makeCard(s, bank, lex, "中考", gaps, zhPatch));

  const gaokaoExtraSurfaces = [];
  for (const s of seniorSurfaces) {
    if (!zhongkaoOfficialKeys.has(senseKey(s))) gaokaoExtraSurfaces.push(s);
  }
  const gaokaoOfficialExtra = gaokaoExtraSurfaces.map((s) => makeCard(s, bank, lex, "高考", gaps, zhPatch));
  const gaokaoOfficialKeys = new Set(
    zhongkaoOfficial.map((c) => senseKey(c.word)).concat(gaokaoOfficialExtra.map((c) => senseKey(c.word)))
  );
  const gaokaoExtFromJunior = zhongkaoExt
    .filter((c) => !gaokaoOfficialKeys.has(senseKey(c.word)))
    .map((c) => Object.assign({}, c, { scene: "高考" }));
  const gaokaoExtOwn = plan.gaokaoExtra.map((s) => makeCard(s, bank, lex, "高考", gaps, zhPatch));
  const gaokaoExt = gaokaoExtFromJunior.concat(gaokaoExtOwn);

  const gaokaoOfficial = zhongkaoOfficial.map((c) => Object.assign({}, c, { scene: "高考" })).concat(gaokaoOfficialExtra);

  const zhongkao = assemble(
    "zhongkao",
    "中考",
    "广东初中学业水平考试英语：义务教育英语课程标准（2022年版）三级词汇，含附录单独列出的序数词、地名国籍、节日与文化词。教辅常见词收在后面的「中考拓展」组，不混进课标组。",
    zhongkaoOfficial,
    zhongkaoExt,
    "中考",
    "中考拓展"
  );
  const gaokao = assemble(
    "gaokao",
    "高考",
    "广东新高考英语：中考课标词全包含，并覆盖普通高中英语课程标准（2017年版2020年修订）词汇表和国家名称表。中考拓展里尚未进入课标的词，以及流通高考3500词，收在后面的「高考拓展」组。",
    gaokaoOfficial,
    gaokaoExt,
    "高考",
    "高考拓展"
  );

  const oldZk = (tracks.find((t) => t.id === "zhongkao") || { sets: [] });
  const oldWords = flattenSets(oldZk).map((c) => c.word);
  const extraOnly = oldWords.filter((w) => !zhongkaoOfficialKeys.has(senseKey(w)) && !zhongkaoExt.some((c) => senseKey(c.word) === senseKey(w)));
  const juniorOnly = juniorSurfaces.filter((s) => !new Set(seniorSurfaces.map(senseKey)).has(senseKey(s)));

  const summary = {
    juniorSource: kebiao.juniorSource,
    seniorSource: kebiao.seniorSource,
    juniorEntries: kebiao.juniorEntries.length,
    juniorLemmas: juniorSurfaces.length - appendixAdded.length - separateAdded.length,
    appendixAdded,
    separateAdded,
    zhongkaoOfficial: zhongkaoOfficial.length,
    zhongkaoExt: zhongkaoExt.length,
    zhongkaoCards: zhongkaoOfficial.length + zhongkaoExt.length,
    zhongkaoOfficialSets: zhongkao.officialSets,
    zhongkaoExtSets: zhongkao.extensionSets,
    zhongkaoSets: zhongkao.sets.length,
    seniorEntries: kebiao.seniorEntries.length,
    seniorLemmas: kebiao.seniorEntries.flatMap(expandEntry).length,
    gaokaoOfficial: gaokaoOfficial.length,
    gaokaoExt: gaokaoExt.length,
    gaokaoExtraLemmas: gaokaoOfficialExtra.length,
    gaokaoCards: gaokaoOfficial.length + gaokaoExt.length,
    gaokaoOfficialSets: gaokao.officialSets,
    gaokaoExtSets: gaokao.extensionSets,
    gaokaoSets: gaokao.sets.length,
    newGlosses: gaps.length,
    reusedFromBank: zhongkaoOfficial.length + zhongkaoExt.length + gaokaoOfficialExtra.length + gaokaoExtOwn.length - gaps.length,
    before,
    extensionDrops: plan.drops.length,
    hskebiaoArtifacts: {
      curd: "fragment of the headword bean curd; not added",
      caf: "truncated café, already on the senior list",
      due: "the token is a column fragment of due to; the real adjective due is kept only because the 3500 list teaches it, in 高考拓展",
      "ice-cream": "spelling of ice cream, already covered",
      "kilo (kilogramme, kilogram)": "two-column PDF collision with joke; kilo and joke are already headwords",
      ought: "fragment of ought to on the senior list; bare ought is kept in 中考拓展 because textbook lists teach it",
      percent: "spelling of per cent, already covered",
    },
    extraOnlyOldZhongkao: extraOnly,
    juniorLemmasOutsideSeniorList: juniorOnly,
    subset: zhongkaoOfficial.concat(zhongkaoExt).every((c) =>
      gaokaoOfficial.concat(gaokaoExt).some((g) => senseKey(g.word) === senseKey(c.word))
    ),
  };

  function publish(track) {
    return { id: track.id, name: track.name, sets: track.sets, titles: track.titles, desc: track.desc };
  }

  const header = "/* QuizMario 中考 / 高考 tracks. Generated by tools/build-exam-tracks.js. Official sets first; 拓展 sets follow. */\n";
  const body = "window.VOCAB_EXAM_TRACKS = " + JSON.stringify([publish(zhongkao), publish(gaokao)]) + ";\n" +
    "(function () {\n" +
    "  var extra = window.VOCAB_EXAM_TRACKS || [];\n" +
    "  var base = (window.VOCAB_TRACKS || []).filter(function (t) { return t.id !== \"zhongkao\" && t.id !== \"gaokao\"; });\n" +
    "  window.VOCAB_TRACKS = extra.concat(base);\n" +
    "})();\n";
  fs.writeFileSync(examPath, header + body);
  fs.writeFileSync(path.join(root, "data/extension-drops.json"), JSON.stringify(plan.drops, null, 2) + "\n");
  fs.writeFileSync(path.join(root, "data/coverage-summary.json"), JSON.stringify(summary, null, 2) + "\n");
  console.log(JSON.stringify({
    before,
    zhongkaoOfficial: summary.zhongkaoOfficial,
    zhongkaoExt: summary.zhongkaoExt,
    zhongkaoCards: summary.zhongkaoCards,
    zhongkaoSets: [summary.zhongkaoOfficialSets, summary.zhongkaoExtSets],
    gaokaoOfficial: summary.gaokaoOfficial,
    gaokaoExt: summary.gaokaoExt,
    gaokaoCards: summary.gaokaoCards,
    gaokaoSets: [summary.gaokaoOfficialSets, summary.gaokaoExtSets],
    separateAdded: separateAdded.length,
    newGlosses: summary.newGlosses,
    drops: summary.extensionDrops,
    subset: summary.subset,
  }, null, 2));
}

main();

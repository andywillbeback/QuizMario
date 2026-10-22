"use strict";

/*
 * ZH→EN multiple choice grades an exact lemma. A hard distractor that
 * repeats the target's meaning_zh is a synonym the student can pick and
 * still be marked wrong. pickHardDistractors must drop that card on every
 * track, including one that sits in another set of the same track.
 *
 * A bare gloss and the same Chinese plus a （…） note are the same trap:
 * 谁 vs 谁（宾格） does not tell the student who and whom apart. Both cards
 * already carrying different notes stay legal near-misses.
 *
 * Run: node tests/hard-distractors.test.js
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");

function el() {
  return {
    hidden: false,
    textContent: "",
    innerHTML: "",
    value: "",
    className: "",
    id: "",
    dataset: {},
    style: {},
    classList: {
      add() {},
      remove() {},
      toggle() {},
      contains() { return false; },
    },
    addEventListener() {},
    removeEventListener() {},
    setAttribute() {},
    getAttribute() { return ""; },
    appendChild() {},
    removeChild() {},
    focus() {},
    click() {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
  };
}

function boot() {
  const storage = new Map();
  const document = {
    body: el(),
    documentElement: el(),
    addEventListener() {},
    removeEventListener() {},
    createElement() { return el(); },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    getElementById(id) {
      const required = {
        "btn-continue": true,
        "btn-levels": true,
        "btn-back-home": true,
        "btn-reset": true,
        "btn-quit": true,
        "btn-clear-home": true,
        "btn-next-level": true,
      };
      return required[id] ? el() : null;
    },
  };
  const sandbox = {
    console,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    document,
    localStorage: {
      getItem(k) { return storage.has(k) ? storage.get(k) : null; },
      setItem(k, v) { storage.set(k, String(v)); },
      removeItem(k) { storage.delete(k); },
    },
    navigator: {},
    scrollTo() {},
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  const files = [
    "words.js",
    "tracks.js",
    "sense-id.js",
    "sense-cue.js",
    "srs-rules.js",
    "review-queues.js",
    "home-loop.js",
    "placement.js",
    "cloze.js",
    "sense-examples.js",
    "practice.js",
    "feedback.js",
    "error-types.js",
    "progress-narrative.js",
    "practice-reminder.js",
    "game.js",
  ];
  for (const file of files) {
    vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), sandbox, { filename: file });
  }
  assert.ok(sandbox.__QM && typeof sandbox.__QM.debugHardDistractors === "function");
  return sandbox.__QM;
}

function card(word, meaning, pos) {
  return {
    word,
    meaning_zh: meaning,
    pos,
    scene: "t",
    roots: word.slice(0, 3),
    root_group: pos,
  };
}

function hostList(picks) {
  return Array.prototype.map.call(picks, (p) => String(p));
}

const qm = boot();
const levelCount = qm.levels.length;
assert.ok(levelCount > 1, "core track loaded");

/* The old core trap: anybody / anyone, identical gloss, anyone in another set.
   anything stays a legal near-miss and must still be offered. */
const trap = [
  [
    card("anybody", "任何人", "pron."),
    card("anything", "任何事物", "pron."),
    card("someone", "某人", "pron."),
    card("everyone", "每个人", "pron."),
  ],
  [
    card("anyone", "任何人", "pron."),
  ],
];
for (let i = 0; i < 25; i++) {
  const picks = hostList(qm.debugHardDistractors("anybody", 3, trap));
  assert.ok(!picks.includes("anyone"), "same-gloss anyone was offered: " + picks.join(","));
  assert.ok(!picks.includes("anybody"), "target leaked into distractors");
  assert.ok(picks.includes("anything"), "a different gloss should still be a hard distractor");
  assert.strictEqual(picks.length, 3, picks.join(","));
}

/* Fallback fill used to copy the same gloss in when the ranked pool ran short.
   Trimmed whitespace still counts as the same gloss. */
const short = [[
  card("till", "直到", "prep."),
  card("until", " 直到 ", "prep."),
  card("after", "在……之后", "prep."),
]];
const shortPicks = hostList(qm.debugHardDistractors("till", 3, short));
assert.deepStrictEqual(shortPicks, ["after"]);

/* Parenthetical notes are different glosses, so the near synonym may be shown.
   The prompt then tells the two cards apart and an exact-lemma miss is fair. */
const noted = [[
  card("anybody", "任何人（口语，多用于疑问/否定）", "pron."),
  card("anyone", "任何人（较正式，也可用在肯定句）", "pron."),
  card("anything", "任何事物", "pron."),
  card("someone", "某人", "pron."),
  card("everyone", "每个人", "pron."),
]];
for (let i = 0; i < 15; i++) {
  const picks = hostList(qm.debugHardDistractors("anybody", 3, noted));
  assert.ok(picks.includes("anyone"), "disambiguated anyone should remain a distractor: " + picks.join(","));
  assert.ok(!picks.includes("anybody"));
}

/* Bare gloss vs the same base plus a note. The bare prompt is the whole
   choice, so the noted synonym must not be offered in either direction.
   ASCII parentheses count the same as （…）. */
const bareNoted = [
  ["who", "谁", "whom", "谁（宾格）", "which", "哪一个"],
  ["we", "我们", "us", "我们(宾格)", "which", "哪一个"],
  ["your", "你的", "yours", "你的（名词性）", "you", "你"],
];
for (const [bareWord, bareGloss, notedWord, notedGloss, otherWord, otherGloss] of bareNoted) {
  const level = [[
    card(bareWord, bareGloss, "pron."),
    card(notedWord, notedGloss, "pron."),
    card(otherWord, otherGloss, "pron."),
    card("what", "什么", "pron."),
  ]];
  for (let i = 0; i < 20; i++) {
    const fromBare = hostList(qm.debugHardDistractors(bareWord, 3, level));
    assert.ok(!fromBare.includes(notedWord), bareWord + " offered " + notedWord + ": " + fromBare.join(","));
    assert.ok(fromBare.includes(otherWord), bareWord + " dropped a different gloss: " + fromBare.join(","));
    const fromNoted = hostList(qm.debugHardDistractors(notedWord, 3, level));
    assert.ok(!fromNoted.includes(bareWord), notedWord + " offered " + bareWord + ": " + fromNoted.join(","));
    assert.ok(fromNoted.includes(otherWord), notedWord + " dropped a different gloss: " + fromNoted.join(","));
  }
}

function loadWindow(file, name) {
  const ctx = { window: {} };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), ctx);
  return ctx.window[name];
}

/* Live banks named in the fairness hunt: zhongkao who/whom, plus the
   same bare/noted pairs on 高考 and the core sets. */
const examTracks = loadWindow("exam-tracks.js", "VOCAB_EXAM_TRACKS");
const coreLevels = loadWindow("words.js", "VOCAB_LEVELS");
const livePairs = [
  ["zhongkao", examTracks.find((t) => t.id === "zhongkao").sets, "who", "whom"],
  ["zhongkao", examTracks.find((t) => t.id === "zhongkao").sets, "your", "yours"],
  ["zhongkao", examTracks.find((t) => t.id === "zhongkao").sets, "we", "us"],
  ["gaokao", examTracks.find((t) => t.id === "gaokao").sets, "who", "whom"],
  ["gaokao", examTracks.find((t) => t.id === "gaokao").sets, "your", "yours"],
  ["gaokao", examTracks.find((t) => t.id === "gaokao").sets, "we", "us"],
  ["core", coreLevels, "who", "whom"],
  ["core", coreLevels, "your", "yours"],
  ["core", coreLevels, "we", "us"],
];
for (const [trackId, levels, left, right] of livePairs) {
  for (let i = 0; i < 15; i++) {
    const lr = hostList(qm.debugHardDistractors(left, 3, levels));
    assert.ok(!lr.includes(right), trackId + " " + left + " offered " + right + ": " + lr.join(","));
    assert.strictEqual(lr.length, 3, trackId + " " + left + " short list: " + lr.join(","));
    const rl = hostList(qm.debugHardDistractors(right, 3, levels));
    assert.ok(!rl.includes(left), trackId + " " + right + " offered " + left + ": " + rl.join(","));
    assert.strictEqual(rl.length, 3, trackId + " " + right + " short list: " + rl.join(","));
  }
}

assert.strictEqual(qm.levels.length, levelCount, "debug hook restored the live track");

const game = fs.readFileSync(path.join(root, "game.js"), "utf8");
assert.ok(
  /sessionDirection === "meaning"[\s\S]*pickMeaningDistractors\(currentCard, 3\)[\s\S]*pickHardDistractors\(currentCard, 3\)/.test(game),
  "ZH→EN choices still come from pickHardDistractors"
);

console.log("hard-distractors ok");

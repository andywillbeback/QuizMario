"use strict";

/*
 * ZH→EN multiple choice grades an exact lemma. A hard distractor that
 * repeats the target's meaning_zh is a synonym the student can pick and
 * still be marked wrong. pickHardDistractors must drop that card on every
 * track, including one that sits in another set of the same track.
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

assert.strictEqual(qm.levels.length, levelCount, "debug hook restored the live track");

const game = fs.readFileSync(path.join(root, "game.js"), "utf8");
assert.ok(
  /sessionDirection === "meaning"[\s\S]*pickMeaningDistractors\(currentCard, 3\)[\s\S]*pickHardDistractors\(currentCard, 3\)/.test(game),
  "ZH→EN choices still come from pickHardDistractors"
);

console.log("hard-distractors ok");

/* Miss-count colors and headword-only autoplay.
 * Run: node tests/miss-color.test.js
 *
 * The color uses QuizMarioNotebook.errors (the existing miss total).
 * It does not write cards, and it does not speak example sentences.
 */
"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const notebook = require(path.join(root, "grok/word-notebook.js"));

assert.deepStrictEqual(notebook.missBand(1), { count: 1, tone: "green", label: "几乎快掌握" });
assert.deepStrictEqual(notebook.missBand(2), { count: 2, tone: "yellow", label: "待定" });
assert.deepStrictEqual(notebook.missBand(3), { count: 3, tone: "red", label: "连续出错" });
assert.deepStrictEqual(notebook.missBand(9), { count: 9, tone: "red", label: "连续出错" });
assert.strictEqual(notebook.missBand(0), null, "no recorded miss is not painted as almost mastered");
assert.strictEqual(notebook.missBand(null), null);
assert.strictEqual(notebook.missBand(undefined), null);
assert.strictEqual(notebook.missBand(Number.NaN), null);
assert.deepStrictEqual(notebook.missBand(2.8), { count: 2, tone: "yellow", label: "待定" });

const once = notebook.errors({ wrong: 1, unknown: 40 });
assert.strictEqual(once, 1, "不会 / unknown is not a miss");
assert.strictEqual(notebook.missBand(once).tone, "green");
const twice = notebook.errors({ spelling: { typed: { wrong: 1 }, mc: { wrong: 1 } } });
assert.strictEqual(twice, 2);
assert.strictEqual(notebook.missBand(twice).tone, "yellow");
const repeated = notebook.errors({
  wrong: 1,
  spelling: { wrong: 1, typed: { wrong: 1 } },
  polysemy: { wrong: 1 },
  collocationEvidence: { wrong: 1 },
});
assert.strictEqual(repeated, 4, "spelling.wrong is counted once, not also its typed bucket");
assert.strictEqual(notebook.missBand(repeated).tone, "red");

const game = fs.readFileSync(path.join(root, "grok/game.js"), "utf8");
const css = fs.readFileSync(path.join(root, "grok/mobile-ui.css"), "utf8");
const speech = fs.readFileSync(path.join(root, "grok/pronunciation.js"), "utf8");
assert.ok(css.includes(".miss-word.miss-green") && css.includes(".miss-word.miss-yellow") && css.includes(".miss-word.miss-red"));
assert.ok(game.includes("missWordHtml") && game.includes("paintHeadword"));

const auto = game.slice(game.indexOf("function maybeSpeakPrompt"), game.indexOf("function bumpPractice"));
assert.ok(auto.includes("speakTeaching(currentCard.word, { example: false })"));
assert.ok(!auto.includes("gesture"), "card autoplay stays on the cancel-safe path");
assert.ok(!auto.includes("exampleSay"), "card autoplay does not read an example");
assert.ok(!auto.includes("example: true"));

const gate = game.slice(game.indexOf("function renderCollocGate"), game.indexOf("function scoreDistractor"));
assert.ok(gate.includes("speakTeaching(phrase.lemma, { example: false })"), "a shown collocation headword autoplays");
assert.ok(gate.includes('data-say-kind="word"'));
assert.ok(!gate.includes("读例句"), "the collocation card does not autoplay or offer example speech");
assert.ok(!gate.includes("example: true"));
assert.ok(gate.includes("peekProg"), "coloring a phrase does not create a card");

const enter = game.slice(game.indexOf("const doEnter"), game.indexOf("if (firstCardOfSession)"));
assert.ok(enter.includes("maybeSpeakPrompt()"));
assert.ok(enter.indexOf("stopTeachingSpeech()") < enter.indexOf("maybeSpeakPrompt()"));
assert.ok(game.includes("navigator.userActivation"), "a click can speak the next headword before the animation timer");
assert.ok(game.includes("wordSpeech.nudge(headwordOnScreen())"), "a blocked headword retries on the next touch");
assert.ok(speech.includes("if (!req.gesture && !req.example)"), "only a non-example autoplay is eligible to retry");
assert.ok(game.includes("if (!voiceOn || !text) return"), "连杀语音 stays behind its own switch");
assert.ok(game.includes("announceKillStreak"));

{
  const elements = {};
  function el(id) {
    if (!elements[id]) {
      elements[id] = {
        id: id,
        listeners: {},
        value: id === "notebook-scope" ? "all" : "",
        checked: true,
        hidden: false,
        open: false,
        readOnly: false,
        textContent: "",
        innerHTML: "",
        addEventListener(kind, fn) { this.listeners[kind] = fn; },
        showModal() { this.open = true; },
        close() { this.open = false; },
        setAttribute() {},
        removeAttribute() { this.open = false; },
        reset() {},
        focus() {},
      };
    }
    return elements[id];
  }
  const cards = {
    "synthetic|0::once": { wrong: 1, unknown: 9 },
    "synthetic|0::twice": { spelling: { typed: { wrong: 1 }, mc: { wrong: 1 } } },
    "synthetic|0::often": { wrong: 1, polysemy: { wrong: 2 } },
    "synthetic|0::none": { wrong: 0, unknown: 3 },
  };
  const frozen = JSON.stringify(cards);
  const save = {
    cards: cards,
    wrongBook: {
      "synthetic::once": { lemma: "once", track: "synthetic", cardKey: "synthetic|0::once", active: true, source: "auto", gloss_zh: "一次" },
      "synthetic::twice": { lemma: "twice", track: "synthetic", cardKey: "synthetic|0::twice", active: true, source: "auto", gloss_zh: "两次" },
      "synthetic::often": { lemma: "often", track: "synthetic", cardKey: "synthetic|0::often", active: true, source: "auto", gloss_zh: "多次" },
      "synthetic::none": { lemma: "none", track: "synthetic", cardKey: "synthetic|0::none", active: true, source: "self_report", gloss_zh: "不会" },
      "synthetic::manual": { lemma: "manual", track: "synthetic", active: true, source: "manual", gloss_zh: "笔记" },
    },
  };
  const ctx = {
    console: console,
    JSON: JSON,
    Date: Date,
    Error: Error,
    Math: Math,
    document: { getElementById: el },
    addEventListener() {},
    __QM: {
      track: "synthetic",
      getSave: () => save,
      notebookWord(word) {
        if (word === "manual") return null;
        return { levelIdx: 0, cardKey: "synthetic|0::" + word, gloss: word };
      },
      updateNotebook(fn) { fn(save.wrongBook); },
    },
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(root, "grok/word-notebook.js"), "utf8"), ctx);
  el("btn-notebook").listeners.click();
  const html = el("notebook-list").innerHTML;
  assert.ok(html.includes('class="miss-word miss-green">once</strong>'), html);
  assert.ok(html.includes("几乎快掌握"));
  assert.ok(html.includes('class="miss-word miss-yellow">twice</strong>'));
  assert.ok(html.includes("待定"));
  assert.ok(html.includes('class="miss-word miss-red">often</strong>'));
  assert.ok(html.includes("连续出错"));
  assert.ok(!html.includes("miss-word miss-green\">none"), "unknown-only is not a miss color");
  assert.ok(html.includes("<strong>none</strong>"));
  assert.ok(html.includes("<strong>manual</strong>"), "a manual note with no card is not assigned a miss color");
  assert.ok(!html.includes(">0<") && !html.includes(">1<") && !html.includes(">2<") && !html.includes(">3<"), "the list does not print a bare 0–3 mark");
  assert.strictEqual(JSON.stringify(cards), frozen, "painting the book does not write student records");
}

{
  const bookApi = require(path.join(root, "grok/question-notebook.js"));
  const elements = {};
  const listeners = {};
  function el(id) {
    if (!elements[id]) {
      elements[id] = {
        listeners: {},
        value: id === "question-notebook-scope" ? "all" : "",
        checked: true,
        open: false,
        textContent: "",
        innerHTML: "",
        disabled: false,
        attrs: {},
        addEventListener(kind, fn) { this.listeners[kind] = fn; },
        setAttribute(k, v) { this.attrs[k] = v; },
        showModal() { this.open = true; },
        close() { this.open = false; },
        removeAttribute() { this.open = false; },
        replaceChildren() { this.innerHTML = ""; },
      };
    }
    return elements[id];
  }
  const question = {
    track: "synthetic",
    item_id: "synthetic|0::often",
    mode: "meaning",
    label: "英文 → 中文意思",
    prompt: "often",
    hint: "",
    choices: ["常常"],
    answer: "常常",
    outcome: "wrong",
    feedback: "",
  };
  const save = {
    cards: { "synthetic|0::often": { wrong: 3 } },
    questionNotebook: {},
  };
  const ctx = {
    console: console,
    JSON: JSON,
    Date: Date,
    Error: Error,
    Math: Math,
    crypto: { randomUUID: () => "fixture-question" },
    QuizMarioNotebook: notebook,
    QuizMarioAccountStore: { owner: () => "synthetic-A" },
    document: { getElementById: el, documentElement: { classList: { contains: () => true } } },
    MutationObserver: class { constructor() {} observe() {} },
    addEventListener(kind, fn) { listeners[kind] = fn; },
    __QM: {
      track: "synthetic",
      getSave: () => save,
      questionSnapshot: () => question,
      updateQuestionNotebook(change) { change(save.questionNotebook); },
    },
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(root, "grok/question-notebook.js"), "utf8"), ctx);
  bookApi.put(save.questionNotebook, question, { manual: true, now: 1 });
  el("btn-question-notebook").listeners.click();
  const html = el("question-notebook-list").innerHTML;
  assert.ok(html.includes('class="miss-word miss-red">often</strong>'), html);
  assert.ok(html.includes("连续出错"));
  assert.ok(html.includes('question-notebook-prompt miss-word miss-red'));
  assert.ok(!html.includes("读例句"));
}

console.log("miss-color ok");

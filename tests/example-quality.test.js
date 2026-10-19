"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { isTemplateExample, FAMILIES } = require("../tools/example-templates");

const root = path.join(__dirname, "..");

function load(file, name) {
  const ctx = { window: {} };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), ctx);
  return ctx.window[name];
}

function flat(sets) {
  return (sets || []).flat();
}

const levels = load("words.js", "VOCAB_LEVELS");
const exam = load("exam-tracks.js", "VOCAB_EXAM_TRACKS");
const core = flat(levels);
const practice = [];
for (const track of exam) practice.push(...flat(track.sets));

function templatesIn(cards) {
  return cards.filter((c) => isTemplateExample(c.example_en));
}

const coreBad = templatesIn(core);
const practiceBad = templatesIn(practice);
assert.strictEqual(coreBad.length, 0, "words.js still has template examples: " + coreBad.slice(0, 8).map((c) => c.word + " / " + c.example_en).join(" | "));
assert.strictEqual(practiceBad.length, 0, "exam tracks still have template examples: " + practiceBad.slice(0, 8).map((c) => c.word + " / " + c.example_en).join(" | "));

const aim = practice.find((c) => c.word === "aim");
const able = practice.find((c) => c.word === "able");
assert.ok(aim, "aim card");
assert.ok(able, "able card");
assert.strictEqual(aim.meaning_zh, "瞄准；旨在");
assert.ok(!/标的|学了标/.test(aim.meaning_zh + aim.example_zh), "aim still uses the broken gloss 标的");
assert.ok(/\baims?\b/i.test(aim.example_en), "aim example uses the verb");
assert.strictEqual(able.meaning_zh, "能够；有能力的");
assert.ok(/\bable\b/i.test(able.example_en));
assert.ok(!/day at school/i.test(able.example_en));
assert.ok(/能够/.test(able.example_zh));

const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const game = fs.readFileSync(path.join(root, "game.js"), "utf8");
assert.ok(html.includes('id="play-chrome"'), "compact play chrome");
assert.ok(html.includes("连击"), "streak sits on the play bar");
assert.ok(!html.includes("到期优先 SRS"), "play chrome no longer explains the sort in SRS jargon");
assert.ok(html.includes("grid-template-columns: 1fr 1fr"), "mobile choices are a 2x2 grid");
assert.ok(game.includes("记住了"), "Good button has a Chinese label");
assert.ok(game.includes("太简单"), "Easy button has a Chinese label");
assert.ok(game.includes('id="btn-rate-good"') || game.includes("btn-rate-good"), "Good shortcut target remains");
assert.ok(game.includes("btn-rate-easy"), "Easy shortcut target remains");
assert.ok(FAMILIES.length >= 20, "template families are listed");

console.log("example-quality ok", {
  core: core.length,
  practice: practice.length,
  families: FAMILIES.length,
  aim: aim.example_en,
  able: able.example_en,
});

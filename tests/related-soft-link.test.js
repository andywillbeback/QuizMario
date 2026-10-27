/* Soft-link chips for card.related[]. Pure helper plus grok/ source checks.
 * Run: node tests/related-soft-link.test.js
 */
"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const related = require(path.join(root, "grok/related-links.js"));

function read(name) {
  return fs.readFileSync(path.join(root, name), "utf8");
}

function load(file, name) {
  const ctx = { window: {} };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), ctx);
  return ctx.window[name];
}

{
  assert.deepStrictEqual(related.lemmas(null), []);
  assert.deepStrictEqual(related.lemmas({}), []);
  assert.deepStrictEqual(related.lemmas({ related: "take" }), []);
  assert.deepStrictEqual(related.lemmas({ related: [] }), []);
  assert.deepStrictEqual(related.lemmas({ related: [1, "", "  ", null, "on"] }), ["on"]);
  assert.deepStrictEqual(related.lemmas({ related: ["take", "part", "take", " Take "] }), ["take", "part"]);
  assert.deepStrictEqual(related.lemmas({ related: ["used"] }), ["used"]);
  assert.strictEqual(related.visible({ related: ["take"] }, "meaning", false), true);
  assert.strictEqual(related.visible({ related: ["take"] }, "form", false), false);
  assert.strictEqual(related.visible({ related: ["take"] }, "spelling", false), false);
  assert.strictEqual(related.visible({ related: ["take"] }, "form", true), true);
  assert.strictEqual(related.visible({ related: ["take"] }, "spelling", true), true);
  assert.strictEqual(related.visible({}, "meaning", true), false);
  assert.strictEqual(related.visible({ related: [] }, "meaning", true), false);
}

{
  const grok = load("grok/exam-tracks.js", "VOCAB_EXAM_TRACKS");
  const zk = grok.find((t) => t.id === "zhongkao");
  const index = related.indexTrack(zk.sets);
  const take = related.lookup(index, "take");
  const part = related.lookup(index, "PART");
  const xmas = related.lookup(index, "christmas");
  const missing = related.lookup(index, "interested");
  assert.ok(take && take.word.word === "take" && take.word.meaning_zh && take.levelIdx < 58);
  assert.ok(part && part.word.word === "part" && part.word.meaning_zh);
  assert.ok(xmas && xmas.word.word === "Christmas");
  assert.strictEqual(missing, null);
  const phrase = zk.sets.flat().find((c) => c.word === "take part in");
  assert.deepStrictEqual(related.lemmas(phrase), ["take", "part"]);
  assert.strictEqual(related.visible(phrase, "meaning", false), true);
  assert.strictEqual(related.visible(phrase, "form", false), false);
  const plain = zk.sets[0][0];
  assert.strictEqual(related.visible(plain, "meaning", true), false);
}

{
  const game = read("grok/game.js");
  const index = read("grok/index.html");
  const rootGame = read("game.js");
  const rootIndex = read("index.html");

  assert.ok(index.includes('id="card-related"'), "the practice card has a related row");
  assert.ok(index.includes('id="related-peek"'), "tapping a chip opens a peek");
  assert.ok(index.includes("相关词"));
  assert.ok(index.includes('src="related-links.js"'));
  assert.ok(index.indexOf('src="related-links.js"') < index.indexOf('src="game.js"'));
  assert.ok(!index.includes("复制文案"));
  assert.ok(!rootIndex.includes("related-links.js"));
  assert.ok(!rootIndex.includes('id="card-related"'));
  assert.ok(!rootGame.includes("renderRelated"));
  assert.ok(!game.includes("relatedLemmas"), "the player reads related[]; it does not recompute lemmas");

  const enrich = game.slice(game.indexOf("function enrichItem"), game.indexOf("function countSeenCards"));
  assert.ok(enrich.includes("w.related"), "practice cards keep the existing related array");
  const fill = game.slice(game.indexOf("function fillCardContent"), game.indexOf("function stopChallenge"));
  assert.ok(fill.includes("renderRelated(false)"), "chips paint with the prompt");
  const spell = game.slice(game.indexOf("function gradeSpelling"), game.indexOf("function grade("));
  assert.ok(spell.includes("renderRelated(true)"));
  const grade = game.slice(game.indexOf("function grade("), game.indexOf("function confirmCorrect"));
  assert.strictEqual((grade.match(/renderRelated\(true\)/g) || []).length, 2);
  const render = game.slice(game.indexOf("function renderRelated"), game.indexOf("function relatedPeekEl"));
  assert.ok(render.includes("textContent") && render.includes("createElement"));
  assert.ok(!render.includes("innerHTML"));
  const peek = game.slice(game.indexOf("function openRelatedPeek"), game.indexOf("function copyRelatedLemma"));
  assert.ok(peek.includes("lookup"));
  assert.ok(!peek.includes("schedule(") && !peek.includes("persist(") && !peek.includes("startLevel"));
  const show = game.slice(game.indexOf("function showScreen"), game.indexOf("function levelStars"));
  assert.ok(show.includes("closeRelatedPeek()"));
}

console.log("related-soft-link ok");

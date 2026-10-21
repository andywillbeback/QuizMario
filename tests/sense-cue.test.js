"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const cue = require("../sense-cue");

function load(file, name) {
  const ctx = { window: {} };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), ctx);
  return ctx.window[name];
}

function flat(levels) {
  const out = [];
  for (const set of levels || []) {
    for (const card of set || []) out.push(card);
  }
  return out;
}

function parts(gloss) {
  return String(gloss || "")
    .split(/[；;，,、/／]/)
    .map((part) => part.replace(/[（）()]/g, "").trim())
    .filter(Boolean);
}

function assertNoLeak(text, card, where) {
  if (!text) return;
  const shown = text.replace(/^这一义：/, "");
  for (const part of parts(card.meaning_zh)) {
    assert.ok(shown.indexOf(part) === -1, where + " cue contains gloss 「" + part + "」: " + text);
    assert.ok(part.indexOf(shown) === -1, where + " gloss contains the cue 「" + shown + "」: " + card.meaning_zh);
  }
  const word = String(card.word || "").toLowerCase();
  assert.ok(text.toLowerCase().indexOf(word) === -1, where + " cue contains the headword: " + text);
}

const core = flat(load("words.js", "VOCAB_LEVELS"));
const tracks = load("exam-tracks.js", "VOCAB_EXAM_TRACKS");
const banks = { core: core };
for (const track of tracks) banks[track.id] = flat(track.sets);

/* A single plain sense stays quiet. A qualified id, or a second sense, speaks. */
{
  const ability = core.find((c) => c.word === "ability");
  assert.ok(ability);
  assert.strictEqual(cue.senseCue(ability, { senseCount: 1, direction: "meaning" }), "");
  assert.strictEqual(cue.qualified("ability"), false);
  assert.strictEqual(cue.qualified("May"), true);
  assert.strictEqual(cue.qualified("may"), false);

  const mayCard = { word: "may", meaning_zh: "可以；也许", pos: "modal v." };
  assert.strictEqual(cue.senseCue(mayCard, { senseCount: 1, direction: "meaning" }), "", "may alone is one sense");
  assert.strictEqual(cue.senseCue(mayCard, { senseCount: 2, direction: "meaning" }), "这一义：情态动词");
  assert.strictEqual(cue.senseCue(mayCard, { senseCount: 2, direction: "form" }), "这一义：情态动词");

  const month = { word: "May", meaning_zh: "五月", pos: "n." };
  assert.strictEqual(cue.senseCue(month, { senseCount: 1, direction: "meaning" }), "这一义：月份");
  assert.strictEqual(cue.senseCue(month, { senseCount: 2, direction: "form" }), "这一义：月份");
  assert.ok(!cue.senseCue(month, { senseCount: 1 }).includes("五月"));
  assert.ok(!cue.senseCue(month, { senseCount: 1 }).toLowerCase().includes("may"));
}

/* The cue prefers the sense id, then POS, and drops a label that is the answer. */
{
  assert.strictEqual(cue.posLabel("modal v."), "情态动词");
  assert.strictEqual(cue.posLabel("v."), "动词");
  assert.strictEqual(cue.posLabel("abbr."), "缩写");
  assert.strictEqual(cue.posLabel(""), "");

  const leaked = cue.senseCue(
    { word: "May", meaning_zh: "月份", pos: "n." },
    { senseCount: 1, direction: "meaning", production: true }
  );
  assert.strictEqual(leaked, "这一义：名词", "a gloss-shaped label falls through to POS");
  assert.ok(!leaked.includes("月份"));

  const both = cue.senseCue(
    { word: "May", meaning_zh: "月份；名词", pos: "n." },
    { senseCount: 1, direction: "meaning", production: true }
  );
  assert.strictEqual(both, "", "no cue when every label is the answer");
  assert.strictEqual(cue.leaksAnswer("五月", { word: "May", meaning_zh: "五月" }), true);
  assert.strictEqual(cue.leaksAnswer("May", { word: "May", meaning_zh: "五月" }), true);
  assert.strictEqual(cue.senseCue(null, { senseCount: 2 }), "");
}

/* Real bank rows: multi-sense families get distinct cues, and none spell the answer. */
{
  const expect = {
    may: "这一义：情态动词",
    May: "这一义：月份",
    miss: "这一义：动词",
    Miss: "这一义：称呼",
    march: "这一义：动词",
    March: "这一义：月份",
    who: "这一义：代词",
    WHO: "这一义：缩写",
    china: "这一义：器物",
    China: "这一义：国名",
  };
  for (const name of Object.keys(banks)) {
    const cards = banks[name];
    const index = cue.indexCards(cards);
    for (const card of cards) {
      const count = cue.countIn(index, card.word);
      const text = cue.senseCue(card, { senseCount: count, direction: "meaning", production: true });
      const form = cue.senseCue(card, { senseCount: count, direction: "form", production: true });
      assert.strictEqual(form, text, name + " " + card.word + " direction changed the cue");
      assertNoLeak(text, card, name + " " + card.word);
      const show = !!expect[card.word] && (count > 1 || cue.qualified(card.word));
      if (show) assert.strictEqual(text, expect[card.word], name + " " + card.word);
      else assert.strictEqual(text, "", name + " should stay quiet: " + card.word + " ×" + count);
    }
  }

  const zk = cue.indexCards(banks.zhongkao);
  assert.strictEqual(cue.countIn(zk, "may"), 2);
  assert.strictEqual(cue.countIn(zk, "May"), 2);
  assert.strictEqual(cue.countIn(zk, "who"), 2);
  assert.strictEqual(cue.countIn(zk, "China"), 1, "中考 has the country sense only");
  assert.strictEqual(cue.senseCue(banks.zhongkao.find((c) => c.word === "China"), { senseCount: 1 }), "这一义：国名");
  assert.strictEqual(cue.countIn(zk, "ability"), 1);
  assert.ok(!banks.zhongkao.some((c) => c.word === "china"), "ware is not a 中考 card");

  const gk = banks.gaokao;
  const gkIndex = cue.indexCards(gk);
  assert.strictEqual(cue.countIn(gkIndex, "china"), 2);
  assert.strictEqual(cue.countIn(gkIndex, "march"), 2);
  const ware = gk.find((c) => c.word === "china");
  const country = gk.find((c) => c.word === "China");
  assert.notStrictEqual(
    cue.senseCue(ware, { senseCount: 2 }),
    cue.senseCue(country, { senseCount: 2 })
  );
  assert.ok(cue.senseCue(ware, { cards: gk }).includes("器物"));
  assert.ok(!cue.senseCue(ware, { cards: gk }).includes(ware.meaning_zh));
}

console.log("sense-cue ok");

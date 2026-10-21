"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const et = require("../error-types");

assert.strictEqual(et.countsAsMiss("wrong"), true);
assert.strictEqual(et.countsAsMiss("unknown"), false, "不会 is not a wrong pick");
assert.strictEqual(et.countsAsMiss("correct"), false);
assert.strictEqual(et.countsAsMiss(""), false);

{
  const form = et.classifyMiss({
    direction: "form",
    target: { word: "accept", meaning_zh: "接受", pos: "v.", roots: "accept" },
    chosen: { word: "except", meaning_zh: "除了", pos: "prep.", roots: "except" },
  });
  assert.strictEqual(form.bucket, "form", "look-alike wins over a POS mismatch");
  assert.strictEqual(form.label, "形近");
  assert.strictEqual(et.feedbackLine(form, "except"), "错因：形近 · 和「except」长得像");
}

{
  const near = et.classifyMiss({
    direction: "form",
    target: { word: "communicate", meaning_zh: "交流", pos: "v.", roots: "communicate" },
    chosen: "community",
  });
  assert.strictEqual(near.bucket, "form", "a spelling-near distractor string is 形近 without a bank row");
}

assert.strictEqual(et.classifyMiss({
  direction: "form",
  target: { word: "to", meaning_zh: "到", pos: "prep." },
  chosen: { word: "too", meaning_zh: "也", pos: "adv." },
}).bucket, "form");

{
  const sense = et.classifyMiss({
    direction: "form",
    target: { word: "big", meaning_zh: "大的", pos: "adj.", roots: "big" },
    chosen: { word: "large", meaning_zh: "大的；巨大的", pos: "adj.", roots: "large" },
  });
  assert.strictEqual(sense.bucket, "sense");
  assert.strictEqual(sense.label, "义近");
  assert.strictEqual(et.feedbackLine(sense, "large"), "错因：义近 · 和「large」意思接近");
}

{
  const family = et.classifyMiss({
    direction: "form",
    target: { word: "telephone", meaning_zh: "电话", pos: "n.", roots: "phone" },
    chosen: { word: "microphone", meaning_zh: "麦克风", pos: "n.", roots: "phone" },
  });
  assert.strictEqual(family.bucket, "sense", "same root with distant spellings is 义近");
}

{
  const gloss = et.classifyMiss({
    direction: "meaning",
    target: { word: "big", meaning_zh: "大的", pos: "adj." },
    chosen: "巨大的",
  });
  assert.strictEqual(gloss.bucket, "sense", "EN→ZH compares the picked gloss");
}

{
  const pos = et.classifyMiss({
    direction: "form",
    target: { word: "run", meaning_zh: "跑", pos: "v.", roots: "run" },
    chosen: { word: "runner", meaning_zh: "跑步的人", pos: "n.", roots: "run" },
  });
  assert.strictEqual(pos.bucket, "pos");
  assert.strictEqual(pos.label, "词性");
  assert.strictEqual(et.feedbackLine(pos, "runner"), "错因：词性 · 和「runner」词性不同");
}

{
  const other = et.classifyMiss({
    direction: "form",
    target: { word: "apple", meaning_zh: "苹果", pos: "n.", roots: "apple" },
    chosen: { word: "banana", meaning_zh: "香蕉", pos: "n.", roots: "banana" },
  });
  assert.strictEqual(other.bucket, "other");
  assert.strictEqual(other.label, "其他");
  assert.strictEqual(et.feedbackLine(other, "banana"), "错因：其他 · 还没归进形近、义近或词性");
}

assert.strictEqual(et.classifyMiss({
  direction: "meaning",
  target: { word: "big", meaning_zh: "大的", pos: "adj." },
  chosen: "（其他义项 2）",
}).bucket, "other", "a filler choice stays 未归类");

assert.strictEqual(et.classifyMiss({
  direction: "form",
  target: { word: "apple", meaning_zh: "苹果", pos: "n." },
  chosen: "",
}).bucket, "other");

{
  const empty = et.present(null);
  assert.strictEqual(empty.visible, false);
  assert.strictEqual(empty.total, 0);
  assert.strictEqual(empty.countsLine, "");
  assert.strictEqual(empty.taxonomy, "形近 · 义近 · 词性 · 其他/未归类");
}

{
  let log = et.normalizeLog(null);
  log = et.noteMiss(log, { bucket: "nope", lemma: "x" });
  assert.strictEqual(log.recent.length, 0, "unknown buckets are dropped");
  log = et.noteMiss(log, { bucket: "sense", lemma: "big", chosenLemma: "large", at: 1 });
  log = et.noteMiss(log, { bucket: "form", lemma: "accept", chosenLemma: "except", at: 2 });
  log = et.noteMiss(log, { bucket: "form", lemma: "affect", chosenLemma: "effect", at: 3 });
  log = et.noteMiss(log, { bucket: "pos", lemma: "run", chosenLemma: "runner", at: 4 });
  log = et.noteMiss(log, { bucket: "other", lemma: "apple", chosenLemma: "banana", at: 5 });
  const view = et.present(log);
  assert.strictEqual(view.visible, true);
  assert.strictEqual(view.total, 5);
  assert.strictEqual(view.leadBucket, "form");
  assert.strictEqual(view.lead, "最近错过的词，主要是形近：选项和答案拼写接近。");
  assert.strictEqual(view.countsLine, "形近 2 · 义近 1 · 词性 1 · 其他 1");
  assert.deepStrictEqual(view.examples, [
    "apple → banana · 其他",
    "run → runner · 词性",
    "affect → effect · 形近",
  ]);
  assert.strictEqual(view.counts.form, 2);
}

{
  const tied = et.present({
    recent: [
      { bucket: "sense", lemma: "big", chosenLemma: "large" },
      { bucket: "form", lemma: "accept", chosenLemma: "except" },
    ],
  });
  assert.strictEqual(tied.leadBucket, "form", "a tie keeps the earlier bucket: 形近 before 义近");
}

{
  let log = { recent: [] };
  for (var i = 0; i < et.RECENT_MAX + 5; i++) {
    log = et.noteMiss(log, { bucket: "pos", lemma: "w" + i, at: i });
  }
  assert.strictEqual(log.recent.length, et.RECENT_MAX);
  assert.strictEqual(log.recent[0].lemma, "w5", "the oldest rows fall off the window");
  assert.strictEqual(log.recent[log.recent.length - 1].lemma, "w" + (et.RECENT_MAX + 4));
}

const root = path.join(__dirname, "..");
const index = fs.readFileSync(path.join(root, "index.html"), "utf8");
const game = fs.readFileSync(path.join(root, "game.js"), "utf8");
assert.ok(index.includes('src="error-types.js"'));
assert.ok(index.indexOf('src="error-types.js"') < index.indexOf('src="game.js"'));
assert.ok(index.includes('id="miss-reasons"'));
assert.ok(index.includes('id="clear-reasons"'));
assert.ok(index.includes("形近 · 义近 · 词性 · 其他/未归类"));
assert.ok(game.includes("recordMissReason"));
assert.ok(game.includes('sessionKind === "placement"') && game.includes('sessionKind === "spelling"'),
  "placement and spelling stay out of the tally");
assert.ok(game.includes("renderMissReasons"));
assert.ok(game.includes("renderClearReasons"));
assert.ok(game.includes("classifyMiss"));
assert.ok(!game.includes("openai") && !/fetch\([^)]*chat/i.test(game), "the classifier does not call a model");

console.log("error-types ok");

/* Q1 Grok版本 / 聚光单词（grok）: typed spelling; MC scores are not independent. */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const practice = require(path.join(root, "practice.js"));
const srs = require(path.join(root, "srs-rules.js"));
const feedback = require(path.join(root, "feedback.js"));

function read(name) {
  return fs.readFileSync(path.join(root, name), "utf8");
}

{
  const now = Date.UTC(2026, 9, 23, 3, 0, 0);
  const card = srs.defaultCardProg();
  const a = practice.noteSpelling(card, "correct", now, { mode: "typed" });
  assert.strictEqual(a.mode, "typed");
  assert.strictEqual(a.independent, false);
  assert.strictEqual(a.signal, "在练");
  practice.noteSpelling(card, "correct", now + 1, { mode: "typed" });
  assert.strictEqual(practice.spellingSignal(card.spelling), "稳定");
  assert.strictEqual(practice.isIndependentSpelling(card.spelling), true);
  assert.strictEqual(card.spelling.correct, 2, "top-level mirrors typed");
  assert.strictEqual(card.spelling.typed.correct, 2);
}

{
  const now = Date.UTC(2026, 9, 23, 3, 0, 0);
  const card = srs.defaultCardProg();
  for (let i = 0; i < 4; i++) practice.noteSpelling(card, "correct", now + i, { mode: "mc" });
  assert.strictEqual(practice.spellingSignal(card.spelling), "未练");
  assert.strictEqual(practice.isIndependentSpelling(card.spelling), false);
  assert.strictEqual(practice.mcSpellingSignal(card.spelling), "稳定");
  assert.strictEqual(card.spelling.correct || 0, 0, "MC must not inflate typed top-level");
  assert.strictEqual(card.spelling.mc.correct, 4);
}

{
  const legacy = {
    correct: 3, wrong: 1, unknown: 0, streak: 2, best: 2, lastAt: 1,
  };
  assert.strictEqual(practice.spellingSignal(legacy), "未练");
  assert.strictEqual(practice.isIndependentSpelling(legacy), false);
  assert.ok(legacy.mc && legacy.mc.correct === 3);
  assert.strictEqual(legacy.correct, 0);
  assert.strictEqual(practice.hasSpellingPractice(legacy), true);
}

{
  const view = feedback.describeAttempt({
    word: "apple",
    meaning: "苹果",
    direction: "spelling",
    outcome: "wrong",
    picked: "appl",
    spellingSignal: "在练",
  });
  const text = view.lines.join("\n");
  assert.ok(text.includes("键入"), text);
  assert.ok(text.includes("输入了「appl」"), text);
  assert.ok(text.includes("旧选择不算独立"), text);
  assert.ok(!text.includes("选了「appl」"), text);
}

{
  const index = read("index.html");
  const game = read("game.js");
  const prac = read("practice.js");
  assert.ok(index.includes('id="answer-input"') && index.includes('id="type-row"'));
  assert.ok(index.includes('id="btn-check-spelling"'));
  assert.ok(!index.includes('id="btn-mc-toggle"'));
  assert.ok(game.includes("function renderTypedSpelling"));
  assert.ok(game.includes("submitTypedSpelling"));
  assert.ok(game.includes('evidence_kind = "typed_spelling"'));
  assert.ok(game.includes('mode: "typed"'));
  assert.ok(prac.includes("isIndependentSpelling") && prac.includes('_legacyMcMigrated'));
  // spelling path must not paint MC choices
  const renderIdx = game.indexOf("function renderChoices");
  const renderSlice = game.slice(renderIdx, renderIdx + 700);
  assert.ok(renderSlice.includes("renderTypedSpelling"));
  assert.ok(renderSlice.includes('sessionDirection === "spelling"') || renderSlice.includes('sessionKind === "spelling"'));
}

console.log("spelling-typed ok");

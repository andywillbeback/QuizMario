/* Grok版本 / 聚光单词（grok）: typed spelling. MC scores are not independent.
 * Root index.html / game.js stay multiple-choice; these asserts read grok/.
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const practice = require(path.join(root, "grok/practice.js"));
const srs = require(path.join(root, "grok/srs-rules.js"));
const feedback = require(path.join(root, "grok/feedback.js"));

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
  const index = read("grok/index.html");
  const game = read("grok/game.js");
  const prac = read("grok/practice.js");
  const rootIndex = read("index.html");
  const rootGame = read("game.js");
  assert.ok(index.includes('id="answer-input"') && index.includes('id="type-row"'));
  assert.ok(index.includes('id="btn-check-spelling"'));
  assert.ok(index.includes('id="card-speak"'));
  assert.ok(!index.includes('id="btn-mc-toggle"'));
  assert.ok(game.includes("function renderTypedSpelling"));
  assert.ok(game.includes("submitTypedSpelling"));
  assert.ok(prac.includes('evidence_kind: "typed_spelling"'));
  assert.ok(game.includes("input.evidence_kind = mode.evidence_kind"));
  assert.ok(game.includes('mode: "typed"'));
  assert.ok(prac.includes("isIndependentSpelling") && prac.includes("_legacyMcMigrated"));
  const renderIdx = game.indexOf("function renderChoices");
  const renderSlice = game.slice(renderIdx, renderIdx + 1400);
  assert.ok(renderSlice.includes("renderTypedSpelling"));
  assert.ok(renderSlice.includes("sessionAnswerMode") && renderSlice.includes("mode.typed"));
  assert.ok(renderSlice.includes("paintChoices"), "meaning / form still paint MC choices");
  const gradeIdx = game.indexOf("function grade(");
  const gradeSlice = game.slice(gradeIdx, gradeIdx + 900);
  assert.ok(gradeSlice.includes("sessionAnswerMode") && gradeSlice.includes("gradeSpelling"));
  const emitIdx = game.indexOf("function emitLearnerAnswer");
  const emitSlice = game.slice(emitIdx, emitIdx + 1600);
  assert.ok(emitSlice.includes("sessionAnswerMode"));
  assert.ok(emitSlice.includes("evidence_kind"));
  assert.ok(emitSlice.includes("independent"));
  const keyIdx = game.indexOf("Number keys:");
  const keySlice = game.slice(keyIdx, keyIdx + 1600);
  assert.ok(keySlice.includes("submitTypedSpelling"), "Enter submits typed spelling");
  assert.ok(keySlice.includes("if (typing) return"), "keys 1–4 do not pick MC choices while typing");
  const spellGrade = game.slice(game.indexOf("function gradeSpelling"), game.indexOf("function grade("));
  assert.ok(spellGrade.includes("speakButtons(currentCard)"), "spelling feedback can read the word and example");
  assert.ok(!rootIndex.includes('id="answer-input"'), "root student app keeps MC spelling");
  assert.ok(!rootGame.includes("renderTypedSpelling"), "root game.js is not switched to typed spelling");
  assert.ok(!rootIndex.includes('id="report-panel"'), "root student app has no report panel");
}

{
  assert.deepStrictEqual(practice.sessionAnswerMode("spelling", "spelling"), {
    typed: true,
    evidence_kind: "typed_spelling",
  });
  assert.deepStrictEqual(practice.sessionAnswerMode("level", "meaning"), {
    typed: false,
    evidence_kind: "mc_recognition",
  });
  assert.deepStrictEqual(practice.sessionAnswerMode("level", "meaning").typed, false);
  assert.deepStrictEqual(practice.sessionAnswerMode("must", "form"), {
    typed: false,
    evidence_kind: "mc_production",
  });
  assert.deepStrictEqual(practice.sessionAnswerMode("must", "meaning"), {
    typed: false,
    evidence_kind: "mc_recognition",
  });
  assert.strictEqual(practice.sessionAnswerMode("due", "form").evidence_kind, "mc_production");
  assert.strictEqual(practice.sessionAnswerMode("wrongbook", "form").typed, false);
  assert.strictEqual(practice.sessionAnswerMode("challenge", "meaning").typed, false);
}

{
  const le = require(path.join(root, "grok/learner-events.js"));
  const UID = "11111111-1111-4111-8111-111111111111";
  const NOW = "2026-10-23T03:00:00.000Z";
  const typed = le.buildEvent({
    event_type: le.TYPES.WRONG,
    learner_id: UID,
    headword: "apple",
    gloss_zh: "苹果",
    task_direction: "spelling",
    evidence_kind: "typed_spelling",
    independent: false,
    outcome: "wrong",
    answer: "appl",
    created_at: NOW,
  }, NOW);
  assert.strictEqual(typed.evidence_kind, "typed_spelling");
  assert.strictEqual(typed.payload.evidence_kind, "typed_spelling");
  assert.strictEqual(typed.independent, false, "false is a real stability flag");
  assert.strictEqual(typed.payload.independent, false);
  assert.strictEqual(typed.task_direction, "spelling");
  const round = le.publicEvent(le.fromRemote(le.publicEvent(typed)));
  assert.strictEqual(round.evidence_kind, "typed_spelling");
  assert.strictEqual(round.payload.evidence_kind, "typed_spelling");
  assert.strictEqual(round.payload.independent, false);
  assert.strictEqual(round.independent, false);

  const meaning = le.buildEvent({
    event_type: le.TYPES.CORRECT,
    learner_id: UID,
    headword: "apple",
    task_direction: "meaning",
    evidence_kind: "mc_recognition",
    created_at: NOW,
  }, NOW);
  assert.strictEqual(meaning.evidence_kind, "mc_recognition");
  assert.notStrictEqual(meaning.evidence_kind, "typed_spelling");
  assert.ok(!Object.prototype.hasOwnProperty.call(meaning, "independent"));

  const form = le.buildEvent({
    event_type: le.TYPES.WRONG,
    learner_id: UID,
    headword: "apple",
    task_direction: "form",
    evidence_kind: "mc_production",
    created_at: NOW,
  }, NOW);
  assert.strictEqual(form.evidence_kind, "mc_production");
  assert.strictEqual(form.payload.evidence_kind, "mc_production");
}

{
  const merge = require(path.join(root, "grok/sync-merge.js"));
  const legacyCard = {
    reps: 0, correct: 0, wrong: 0, mastery: 0, state: "new",
    spelling: { correct: 4, wrong: 1, unknown: 0, streak: 2, best: 2, lastAt: 1 },
  };
  practice.ensureSpellingShape(legacyCard.spelling);
  assert.strictEqual(practice.isIndependentSpelling(legacyCard.spelling), false);
  assert.strictEqual(legacyCard.spelling.correct, 0);
  assert.ok(legacyCard.spelling.mc.correct >= 4);
  const local = {
    points: 0,
    unlockedLevel: 1,
    updatedAt: "2026-10-23T00:00:00.000Z",
    cards: { "core|apple": legacyCard },
  };
  assert.strictEqual(merge.studiedCount(local), 1, "migrated MC spelling is still progress");
  assert.strictEqual(merge.isBlank(local), false, "MC-only spelling must not look like an empty save");
  const cloud = {
    points: 1,
    unlockedLevel: 1,
    updatedAt: "2026-01-01T00:00:00.000Z",
    cards: { w0: { reps: 1, correct: 1, wrong: 0, mastery: 1 } },
  };
  assert.deepStrictEqual(merge.planSync(local, cloud), {
    source: "local",
    reason: "local-newer",
    upload: true,
  });
  const typedOnly = {
    points: 0,
    unlockedLevel: 1,
    cards: {
      a: {
        reps: 0, correct: 0, wrong: 0, mastery: 0,
        spelling: {
          correct: 0, wrong: 0, unknown: 0,
          _legacyMcMigrated: true,
          typed: { correct: 2, wrong: 0, unknown: 0, streak: 2, best: 2, lastAt: 1 },
          mc: { correct: 0, wrong: 0, unknown: 0, streak: 0, best: 0, lastAt: 0 },
        },
      },
    },
  };
  assert.strictEqual(merge.studiedCount(typedOnly), 1, "typed bucket counts even if top-level was not mirrored");
  assert.strictEqual(practice.isIndependentSpelling(typedOnly.cards.a.spelling), true);
}

{
  const cards = {
    typed: {
      spelling: {
        correct: 2, wrong: 1, unknown: 0, streak: 2, best: 2, lastAt: 1,
        typed: { correct: 2, wrong: 1, unknown: 0, streak: 2, best: 2, lastAt: 1 },
        mc: { correct: 9, wrong: 0, unknown: 0, streak: 9, best: 9, lastAt: 1 },
        _legacyMcMigrated: true,
      },
    },
    mc: {
      spelling: { correct: 5, wrong: 0, unknown: 0, streak: 5, best: 5, lastAt: 1 },
    },
  };
  const sum = practice.summarizeSpelling(cards);
  assert.strictEqual(sum.typedCards, 1, "old MC cards are not typed words");
  assert.strictEqual(sum.correct, 2);
  assert.strictEqual(sum.wrong, 1);
  assert.strictEqual(sum.mcOnly, 1);
  assert.strictEqual(practice.isIndependentSpelling(cards.mc.spelling), false);
}

{
  const index = read("grok/index.html");
  const game = read("grok/game.js");
  const teacher = read("grok/teacher.html");
  const login = read("grok/login.html");
  for (const needle of [
    'id="report-panel"',
    'id="profile-name"',
    'id="profile-cls"',
    'id="btn-report"',
    'id="report-code"',
    'id="report-status"',
    "复制学习报告码",
    "学习报告码",
    "发给老师",
    "QMR1",
    'href="teacher.html"',
    "教师看板",
  ]) {
    assert.ok(!index.includes(needle), "student home still shows " + needle);
    assert.ok(!login.includes(needle), "login still shows " + needle);
  }
  assert.ok(!index.includes("ALS 学习信号") && !index.includes("下载 JSONL") && !index.includes("复制 JSONL"),
    "student home does not show the ALS signal panel");
  assert.ok(!index.includes('id="learner-events-panel"') && !index.includes('id="btn-export-learner-events"') && !index.includes('id="btn-copy-learner-events"'),
    "JSONL dump controls are gone from the student home");
  assert.ok(index.includes('src="learner-events.js"'), "learner events still load for cloud sync");
  assert.ok(!login.includes("ALS 学习信号") && !login.includes("下载 JSONL") && !login.includes("复制 JSONL"),
    "login stays free of the ALS signal panel");
  assert.ok(!game.includes("$(\"btn-report\")") && !game.includes("reportCode(") && !game.includes("buildReport("),
    "student game no longer builds a report code");
  assert.ok(!game.includes("学习报告码") && !game.includes("请先填写姓名和班级码") && !game.includes('"QMR1."'),
    "student game has no QMR1 copy-to-teacher flow");
  assert.ok(teacher.includes("<h2>教师看板"), "teacher.html still serves the board");
  assert.ok(teacher.includes("导入报告码"), "teacher paste flow stays");
  assert.ok(teacher.includes("QMR1"), "teacher still expects QMR1 lines");
  assert.ok(!teacher.includes("ALS 学习信号"), "teacher board is not an ALS signal dump");
}

console.log("spelling-typed ok");

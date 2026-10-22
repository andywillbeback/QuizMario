"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const sense = require("../sense-id");
const practice = require("../practice");
const feedback = require("../feedback");
const examples = require("../sense-examples");
const srs = require("../srs-rules");
const queues = require("../review-queues");

function read(name) {
  return fs.readFileSync(path.join(root, name), "utf8");
}

function load(file, name) {
  const ctx = { window: {} };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), ctx);
  return ctx.window[name];
}

function hasToken(text, word) {
  const body = String(word).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp("(^|[^A-Za-z])" + body + "([^A-Za-z]|$)").test(String(text || ""));
}

function findCard(tracks, id, word) {
  const track = tracks.find((t) => t.id === id);
  assert.ok(track, id);
  for (const set of track.sets) {
    for (const card of set) {
      if (card.word === word) return card;
    }
  }
  assert.fail(id + " missing " + word);
}

/* P1-5. Meaning practice can 通关. Spelling misses do not. */
{
  const cards = Array.from({ length: 10 }, () => srs.defaultCardProg());
  const now = Date.UTC(2026, 9, 21, 4, 0, 0);
  for (let i = 0; i < 8; i++) {
    srs.schedule(cards[i], 1, now + i);
    srs.schedule(cards[i], 1, now + 1000 + i);
  }
  for (const card of cards) {
    const before = {
      state: card.state,
      interval: card.interval,
      reps: card.reps,
      wrong: card.wrong || 0,
      due: card.due,
      mastery: card.mastery,
      mastered: card.mastered,
    };
    practice.noteSpelling(card, "wrong", now);
    practice.noteSpelling(card, "wrong", now + 1);
    practice.noteSpelling(card, "unknown", now + 2);
    assert.strictEqual(card.state, before.state);
    assert.strictEqual(card.interval, before.interval);
    assert.strictEqual(card.reps, before.reps);
    assert.strictEqual(card.wrong || 0, before.wrong);
    assert.strictEqual(card.due, before.due);
    assert.strictEqual(card.mastery, before.mastery);
    assert.strictEqual(card.mastered, before.mastered);
    assert.strictEqual(practice.spellingSignal(card.spelling), "不稳");
    assert.strictEqual(card.spelling.unknown, 1, "不会 is not a spelling miss");
  }
  const stats = srs.summarizeSet(cards, now + 5000);
  assert.strictEqual(stats.solid, 8);
  assert.strictEqual(stats.ready, true, "a set 通关 with no correct spelling");
  assert.strictEqual(practice.affectsClearance("spelling"), false);
  assert.strictEqual(practice.affectsClearance("level"), true);
  assert.strictEqual(practice.affectsClearance("due"), true);
  assert.strictEqual(practice.spellingSignal(null), "未练");
  const fresh = srs.defaultCardProg();
  practice.noteSpelling(fresh, "correct", now);
  practice.noteSpelling(fresh, "correct", now + 1);
  assert.strictEqual(practice.spellingSignal(fresh.spelling), "稳定");
  assert.strictEqual(srs.isSolidCard(fresh), false, "spelling success is not 通关 credit");
}

/* P1-7. Study is not the clock. Beginners get a small batch. Heavy dues shrink new words. */
{
  assert.strictEqual(practice.usesChallengeClock("study"), false);
  assert.strictEqual(practice.usesChallengeClock("challenge"), true);
  assert.strictEqual(practice.usesChallengeClock("spelling"), false);
  assert.strictEqual(srs.CHALLENGE_MS, 12 * 60 * 1000);
  assert.strictEqual(practice.isBeginner(0), true);
  assert.strictEqual(practice.isBeginner(19), true);
  assert.strictEqual(practice.isBeginner(20), false);
  assert.strictEqual(practice.newWordBudget({ beginner: true, dueCount: 0 }), 4);
  assert.strictEqual(practice.newWordBudget({ beginner: false, dueCount: 0 }), 12);
  assert.ok(practice.newWordBudget({ beginner: true, dueCount: 0 }) < practice.newWordBudget({ beginner: false, dueCount: 0 }));
  const heavy = practice.newWordBudget({ beginner: false, dueCount: 10 });
  const heavier = practice.newWordBudget({ beginner: false, dueCount: 16 });
  assert.ok(heavy < 12, "heavy dues introduce fewer new words");
  assert.strictEqual(heavy, 1);
  assert.strictEqual(heavier, 0);
  assert.strictEqual(practice.newWordBudget({ beginner: true, dueCount: 4 }), 2);
  assert.strictEqual(practice.newWordBudget({ beginner: false, dueCount: 6 }), 3);
  assert.strictEqual(practice.newWordBudget({ mode: "spelling", beginner: false, dueCount: 0 }), 4);
}

/* P1-6. may and May are different items. Old keys migrate only when the surface is unique. */
{
  assert.strictEqual(sense.senseId("may"), "may");
  assert.strictEqual(sense.senseId("May"), "may:month");
  assert.strictEqual(sense.senseId("miss"), "miss:verb");
  assert.strictEqual(sense.senseId("Miss"), "miss:title");
  assert.strictEqual(sense.senseId("march"), "march");
  assert.strictEqual(sense.senseId("March"), "march:month");
  assert.strictEqual(sense.senseId("who"), "who");
  assert.strictEqual(sense.senseId("WHO"), "who:abbr");
  assert.strictEqual(sense.senseId("china"), "china:ware");
  assert.strictEqual(sense.senseId("China"), "china:country");
  assert.strictEqual(sense.senseId("color"), "color", "aliases stay out of the runtime id");
  assert.strictEqual(sense.senseId("colour"), "colour");
  assert.notStrictEqual(sense.cardKeyFor("zhongkao", 0, "may"), sense.cardKeyFor("zhongkao", 0, "May"));
  assert.notStrictEqual(queues.lemmaKey("zhongkao", "may"), queues.lemmaKey("zhongkao", "May"));
  assert.strictEqual(queues.lemmaKey("zhongkao", " Alpha "), queues.lemmaKey("zhongkao", "alpha"));

  const saved = {
    "zhongkao|16::may": { state: "learning", reps: 1, interval: 0 },
    "zhongkao|32::may": { state: "review", reps: 4, interval: 3 },
    "zhongkao|0::ability": { state: "new", reps: 0, interval: 0 },
  };
  const migrated = sense.migrateCards(saved, [
    { track: "zhongkao", levelIdx: 16, word: "may" },
    { track: "zhongkao", levelIdx: 32, word: "May" },
    { track: "zhongkao", levelIdx: 0, word: "ability" },
  ]);
  assert.strictEqual(migrated["zhongkao|16::may"].state, "learning");
  assert.strictEqual(migrated["zhongkao|32::may:month"].state, "review");
  assert.ok(!migrated["zhongkao|32::may"], "May no longer shares the lowercased key");
  assert.strictEqual(migrated["zhongkao|0::ability"].state, "new");

  const monthBook = sense.migrateWrongBook({
    "zhongkao::may": { lemma: "May", track: "zhongkao", active: true, lemmaKey: "zhongkao::may" },
  });
  assert.ok(monthBook["zhongkao::may:month"].active);
  assert.strictEqual(monthBook["zhongkao::may:month"].lemmaKey, "zhongkao::may:month");
  assert.ok(!monthBook["zhongkao::may"]);
  const modalBook = sense.migrateWrongBook({
    "zhongkao::may": { lemma: "may", track: "zhongkao", active: true },
  });
  assert.ok(modalBook["zhongkao::may"].active);

  const ambiguous = sense.migrateCards({
    "zhongkao|1::may": { state: "review", interval: 2 },
  }, [
    { track: "zhongkao", levelIdx: 1, word: "may" },
    { track: "zhongkao", levelIdx: 1, word: "May" },
  ]);
  assert.ok(ambiguous["zhongkao|1::may"], "two senses in one set do not guess which row to move");
  assert.ok(!ambiguous["zhongkao|1::may:month"]);
}

/* Extra examples are few, sense-checked, and do not replace the bank sentence. */
{
  const tracks = load("exam-tracks.js", "VOCAB_EXAM_TRACKS");
  const core = load("words.js", "VOCAB_LEVELS").flat();
  const communicate = core.find((c) => c.word === "communicate");
  assert.strictEqual(communicate.meaning_zh, "沟通；交流");
  assert.ok(communicate.example_zh.includes("交流") || communicate.example_en.length > 0);

  const bank = {
    may: findCard(tracks, "zhongkao", "may"),
    May: findCard(tracks, "zhongkao", "May"),
    miss: findCard(tracks, "zhongkao", "miss"),
    Miss: findCard(tracks, "zhongkao", "Miss"),
    march: findCard(tracks, "gaokao", "march"),
    china: findCard(tracks, "gaokao", "china"),
  };
  assert.strictEqual(bank.may.meaning_zh, "可以；也许");
  assert.strictEqual(bank.may.example_en, "You may leave when the listening test is over.");
  assert.strictEqual(bank.May.meaning_zh, "五月");
  assert.strictEqual(bank.May.example_en, "Exams finish in May, and then the sports meeting begins.");
  assert.strictEqual(bank.Miss.example_en, "Miss Chen is our English teacher.");
  assert.strictEqual(bank.china.example_en, "The plate is made of fine china.");

  const expect = {
    may: { en: "may", zh: "也许", notZh: ["五月"] },
    "may:month": { en: "May", zh: "五月", notZh: ["可以", "也许"] },
    "miss:verb": { en: "miss", zh: "错过", notZh: ["小姐", "五月"] },
    "miss:title": { en: "Miss", zh: "小姐", notZh: ["想念", "错过"] },
    march: { en: "march", zh: "游行", notZh: ["三月"] },
    "china:ware": { en: "china", zh: "瓷", notZh: ["中国"] },
  };
  const ids = Object.keys(examples.EXTRAS);
  assert.deepStrictEqual(ids.sort(), Object.keys(expect).sort());
  assert.ok(ids.length <= 8, "quality over quantity");
  for (const id of ids) {
    const rows = examples.extrasById(id);
    assert.strictEqual(rows.length, 1, id);
    const row = rows[0];
    const rule = expect[id];
    assert.ok(hasToken(row.example_en, rule.en), id + " english " + row.example_en);
    assert.ok(row.example_zh.includes(rule.zh), id + " " + row.example_zh);
    for (const banned of rule.notZh) {
      assert.ok(!row.example_zh.includes(banned), id + " leaked " + banned);
    }
  }
  assert.notStrictEqual(examples.extrasById("may")[0].example_en, bank.may.example_en);
  assert.notStrictEqual(examples.extrasById("may:month")[0].example_en, bank.May.example_en);
  assert.notStrictEqual(examples.extrasById("miss:verb")[0].example_en, bank.miss.example_en);
  assert.notStrictEqual(examples.extrasById("march")[0].example_en, bank.march.example_en);
  assert.notStrictEqual(examples.extrasById("china:ware")[0].example_en, bank.china.example_en);
  assert.deepStrictEqual(examples.extrasFor("who"), []);
  assert.deepStrictEqual(examples.extrasFor("WHO"), []);
  assert.deepStrictEqual(examples.extrasFor("China"), []);
  assert.deepStrictEqual(examples.extrasFor("ability"), []);
}

/* P1-8. Concrete feedback ships even when the radar does not. */
{
  const wrong = feedback.describeAttempt({
    word: "may",
    meaning: "可以；也许",
    direction: "meaning",
    outcome: "wrong",
    picked: "五月",
    hintSeen: false,
    dueLabel: "约 10 分钟后",
    recentWrongs: ["may"],
  });
  const text = wrong.lines.join("\n");
  assert.ok(text.includes("错词：may"));
  assert.ok(text.includes("错向：看英文选中文"));
  assert.ok(text.includes("选了「五月」"));
  assert.ok(text.includes("应是「可以；也许」"));
  assert.ok(text.includes("提示：没有依赖提示"));
  assert.ok(text.includes("下次复习：约 10 分钟后"));
  assert.ok(text.includes("本轮错词：may"));
  assert.strictEqual(wrong.spellingBlocksClearance, false);

  const hinted = feedback.describeAttempt({
    word: "May",
    meaning: "五月",
    direction: "form",
    outcome: "wrong",
    picked: "march",
    hintSeen: true,
    dueLabel: "约 10 分钟后",
  });
  assert.ok(hinted.lines.some((line) => line.includes("错向：看中文选英文") && line.includes("应是「May」")));
  assert.ok(hinted.lines.some((line) => line.includes("依赖提示")));

  const unknown = feedback.describeAttempt({
    word: "miss",
    meaning: "想念；错过",
    direction: "meaning",
    outcome: "unknown",
    dueLabel: "约 10 分钟后",
  });
  assert.ok(unknown.lines.some((line) => line.includes("不会")));
  assert.ok(unknown.lines.some((line) => line.includes("依赖提示")));
  assert.ok(unknown.lines.some((line) => line.includes("下次复习：")));

  const spelled = feedback.describeAttempt({
    word: "May",
    meaning: "五月",
    direction: "spelling",
    outcome: "wrong",
    picked: "may",
    spellingSignal: "不稳",
  });
  const spelledText = spelled.lines.join("\n");
  assert.ok(spelledText.includes("不计入通关"));
  assert.ok(spelledText.includes("词义进度未改"));
  assert.ok(spelledText.includes("错词：May"));

  assert.strictEqual(feedback.radarFromEvidence({
    meaning: { n: 8, good: 6 },
    spelling: { n: 7, good: 2 },
    retention: { n: 8, good: 5 },
    hint: { n: 8, good: 4 },
  }), null, "one thin axis omits the radar");
  assert.strictEqual(feedback.radarFromEvidence({}), null);
  const axes = feedback.radarFromEvidence({
    meaning: { n: 8, good: 6 },
    spelling: { n: 8, good: 4 },
    retention: { n: 10, good: 7 },
    hint: { n: 8, good: 5 },
  });
  assert.ok(axes && axes.length === 4);
  assert.deepStrictEqual(axes.map((a) => a.label), ["词义", "拼写", "保持率", "独立回忆"]);
  assert.ok(feedback.radarSvg(null) === "");
  assert.ok(feedback.radarSvg(axes).includes("练习雷达"));
  assert.ok(text.includes("错词："), "feedback does not wait for a radar");
}

/* Wiring stays in the static app. */
{
  const game = read("game.js");
  const index = read("index.html");
  assert.ok(index.includes('id="btn-challenge"') && index.includes("12分钟挑战"));
  assert.ok(index.includes('id="btn-spelling"') && index.includes(">拼写</button>"));
  assert.ok(index.includes('src="sense-id.js"'));
  assert.ok(index.includes('src="practice.js"') && index.includes('src="feedback.js"'));
  assert.ok(game.includes("Practice.newWordBudget"));
  assert.ok(game.includes('sessionKind === "spelling"'));
  assert.ok(game.includes("return SRS.schedule(prog, quality, nowMs, opts);"));
  assert.ok(game.includes('title.textContent = challengeWon ? "挑战成功" : "通关"'));
  assert.ok(game.includes("不计入通关"));
  assert.ok(!game.includes("mcMode"));
  assert.ok(index.includes('id="answer-input"'), "Q1 typed spelling input");
  assert.ok(index.includes('id="type-row"') && index.includes('id="btn-check-spelling"'));
  assert.ok(game.includes("renderTypedSpelling") && game.includes('mode: "typed"'));
  assert.ok(game.includes("input.evidence_kind = mode.evidence_kind"));
  assert.ok(read("practice.js").includes('evidence_kind: "typed_spelling"'));
  assert.ok(!index.includes('id="btn-mc-toggle"'), "no typed/MC toggle — spelling is always typed");
}

/* Q1. Typed spelling can reach 稳定; legacy MC scores cannot. */
{
  const now = Date.UTC(2026, 9, 23, 2, 0, 0);
  const mcOnly = srs.defaultCardProg();
  practice.noteSpelling(mcOnly, "correct", now, { mode: "mc" });
  practice.noteSpelling(mcOnly, "correct", now + 1, { mode: "mc" });
  practice.noteSpelling(mcOnly, "correct", now + 2, { mode: "mc" });
  assert.strictEqual(practice.spellingSignal(mcOnly.spelling), "未练", "MC streak is not independent");
  assert.strictEqual(practice.isIndependentSpelling(mcOnly.spelling), false);
  assert.strictEqual(practice.mcSpellingSignal(mcOnly.spelling), "稳定");
  assert.ok((mcOnly.spelling.mc.correct || 0) >= 3);
  assert.strictEqual(mcOnly.spelling.typed.correct || 0, 0);

  const legacy = srs.defaultCardProg();
  legacy.spelling = { correct: 5, wrong: 0, unknown: 0, streak: 5, best: 5, lastAt: now };
  assert.strictEqual(practice.spellingSignal(legacy.spelling), "未练", "pre-Q1 MC top-level migrates out of typed");
  assert.strictEqual(practice.isIndependentSpelling(legacy.spelling), false);
  assert.ok((legacy.spelling.mc.correct || 0) >= 5);
  assert.strictEqual(practice.hasSpellingPractice(legacy.spelling), true);

  const typed = srs.defaultCardProg();
  practice.noteSpelling(typed, "correct", now);
  practice.noteSpelling(typed, "correct", now + 1);
  assert.strictEqual(practice.spellingSignal(typed.spelling), "稳定");
  assert.strictEqual(practice.isIndependentSpelling(typed.spelling), true);
  assert.ok((typed.spelling.typed.correct || 0) >= 2);
}

console.log("p1 ok");

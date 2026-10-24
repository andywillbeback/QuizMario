"use strict";

/*
 * 聚光单词 set-complete share card and「我要打十个」check-in.
 * Run: node tests/share-card.test.js
 *
 * The achievement has one display name: 我要打十个.
 * A day counts only when a set completes, on the Asia/Shanghai calendar.
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const share = require(path.join(root, "grok/share-card.js"));
const learnerEvents = require(path.join(root, "grok/learner-events.js"));

function read(name) {
  return fs.readFileSync(path.join(root, name), "utf8");
}

function memoryStorage() {
  const data = {};
  return {
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null;
    },
    setItem(key, value) {
      data[key] = String(value);
    },
    removeItem(key) {
      delete data[key];
    },
  };
}

/** 12:00 Asia/Shanghai is 04:00 UTC. Shanghai has no daylight saving. */
function shanghaiNoon(day) {
  return Date.parse(day + "T04:00:00.000Z");
}

function mockCtx() {
  const texts = [];
  return new Proxy({}, {
    get(_target, prop) {
      if (prop === "texts") return texts;
      if (prop === "canvas") return { width: 1080, height: 1350 };
      if (prop === "createLinearGradient" || prop === "createRadialGradient") {
        return function () {
          return { addColorStop() {} };
        };
      }
      if (prop === "measureText") return function () { return { width: 120 }; };
      if (prop === "fillText") {
        return function (text) { texts.push(String(text)); };
      }
      if (typeof prop === "symbol") return undefined;
      return function () {};
    },
    set() { return true; },
  });
}

assert.strictEqual(share.ACHIEVEMENT_TITLE, "我要打十个");
assert.strictEqual(share.STREAK_GOAL, 10);
assert.strictEqual(share.BRAND, "聚光单词 · 1st edition");

{
  assert.strictEqual(share.shanghaiDayKey(Date.parse("2026-10-24T15:59:59.000Z")), "2026-10-24");
  assert.strictEqual(share.shanghaiDayKey(Date.parse("2026-10-24T16:00:00.000Z")), "2026-10-25");
  assert.strictEqual(share.shanghaiDayKey(Date.parse("2026-10-24T16:30:00.000Z")), "2026-10-25");
  assert.strictEqual(share.shiftDay("2026-10-31", 1), "2026-11-01");
  assert.strictEqual(share.shiftDay("2024-02-28", 1), "2024-02-29");
  assert.strictEqual(share.formatDay("2026-10-24"), "2026年10月24日");
  assert.strictEqual(share.shanghaiDayKey("not-a-date"), "");
}

{
  const store = memoryStorage();
  const first = share.commitSetComplete(store, shanghaiNoon("2026-10-01"), { kind: "level", label: "第1组 · Part A" });
  assert.strictEqual(first.streak, 1);
  assert.strictEqual(first.unlocked, false);
  assert.strictEqual(first.showAchievement, false);
  assert.strictEqual(first.title, "完成一组");
  assert.strictEqual(first.subtitle, "连续 1/10 天");
  assert.strictEqual(first.copy, "聚光单词 · 完成一组｜连续 1/10 天");
  assert.strictEqual(first.label, "第1组 · Part A");
  assert.ok(!first.copy.includes("我要打十个"), "a first-day card does not claim the achievement");
  assert.strictEqual(first.learner, "学员", "a card with no saved name and no email says 学员");

  const again = share.commitSetComplete(store, shanghaiNoon("2026-10-01"), { kind: "session" });
  assert.strictEqual(again.streak, 1, "a second set on the same Shanghai day does not add a day");
  assert.strictEqual(share.readState(store).days.length, 1);
  assert.strictEqual(again.title, "今日打卡");
  assert.strictEqual(again.copy, "聚光单词 · 今日打卡｜连续 1/10 天");
}

{
  const store = memoryStorage();
  let last = null;
  for (let i = 1; i <= 9; i++) {
    const day = "2026-10-" + String(i).padStart(2, "0");
    last = share.commitSetComplete(store, shanghaiNoon(day), { kind: "session" });
  }
  assert.strictEqual(last.streak, 9);
  assert.strictEqual(last.unlocked, false);
  assert.strictEqual(last.showAchievement, false);
  assert.strictEqual(last.title, "今日打卡");
  assert.strictEqual(last.subtitle, "连续 9/10 天");
  assert.ok(!last.title.includes("我要打十个"));

  const unlocked = share.commitSetComplete(store, shanghaiNoon("2026-10-10"), { kind: "level" });
  assert.strictEqual(unlocked.streak, 10);
  assert.strictEqual(unlocked.unlocked, true);
  assert.strictEqual(unlocked.justUnlocked, true);
  assert.strictEqual(unlocked.showAchievement, true);
  assert.strictEqual(unlocked.title, "我要打十个");
  assert.strictEqual(unlocked.subtitle, "已连续打卡10天");
  assert.strictEqual(unlocked.copy, "聚光单词 · 我要打十个｜已连续打卡10天");
  assert.strictEqual(share.readState(store).unlocked[share.ACHIEVEMENT_ID], "2026-10-10");

  const held = share.commitSetComplete(store, shanghaiNoon("2026-10-11"), { kind: "level" });
  assert.strictEqual(held.streak, 11);
  assert.strictEqual(held.justUnlocked, false, "the name stays unlocked without firing again");
  assert.strictEqual(held.title, "我要打十个");
  assert.strictEqual(held.copy, "聚光单词 · 我要打十个｜已连续打卡11天");
}

{
  const store = memoryStorage();
  share.commitSetComplete(store, shanghaiNoon("2026-10-01"), { kind: "session" });
  share.commitSetComplete(store, shanghaiNoon("2026-10-02"), { kind: "session" });
  const broken = share.commitSetComplete(store, shanghaiNoon("2026-10-04"), { kind: "session" });
  assert.strictEqual(broken.streak, 1);
  assert.strictEqual(broken.unlocked, false);
  assert.strictEqual(broken.title, "今日打卡");
}

{
  const store = memoryStorage();
  for (let i = 1; i <= 10; i++) {
    share.commitSetComplete(store, shanghaiNoon("2026-10-" + String(i).padStart(2, "0")), { kind: "level" });
  }
  const later = share.commitSetComplete(store, shanghaiNoon("2026-11-01"), { kind: "level" });
  assert.strictEqual(later.unlocked, true, "a broken streak does not revoke the unlock");
  assert.strictEqual(later.streak, 1);
  assert.strictEqual(later.showAchievement, false);
  assert.strictEqual(later.title, "完成一组");
  assert.ok(!later.copy.includes("我要打十个"));
}

{
  const month = share.recordSetComplete({ v: 1, days: ["2026-10-31"], unlocked: {} }, Date.parse("2026-10-31T16:00:00.000Z"));
  assert.strictEqual(month.day, "2026-11-01");
  assert.strictEqual(month.streak, 2);
  assert.strictEqual(share.recordSetComplete(null, "nope"), null);
  const dirty = share.normalizeState({
    days: ["2026-10-02", "bad", "2026-10-02", "2026-10-01"],
    unlocked: { wo_yao_da_shi_ge: "2026-10-02", other: "no" },
  });
  assert.deepStrictEqual(dirty.days, ["2026-10-01", "2026-10-02"]);
  assert.deepStrictEqual(dirty.unlocked, { wo_yao_da_shi_ge: "2026-10-02" });
  assert.strictEqual(share.activeStreak(["2026-10-08", "2026-10-09"], "2026-10-10"), 2);
  assert.strictEqual(share.activeStreak(["2026-10-08"], "2026-10-10"), 0);
}

{
  const ctx = mockCtx();
  const model = share.cardModel({
    day: "2026-10-10",
    streak: 10,
    unlocked: true,
    justUnlocked: true,
  }, { kind: "level", label: "第3组 · Part B", name: "林晓", email: "secret@example.com" });
  assert.strictEqual(model.learner, "林晓");
  assert.strictEqual(model.title, "我要打十个");
  assert.strictEqual(share.paintCard(ctx, model, { width: 1080, height: 1350 }), true);
  assert.ok(ctx.texts.includes("我要打十个"));
  assert.ok(ctx.texts.includes("林晓"));
  assert.ok(!ctx.texts.some((text) => text.indexOf("secret") !== -1 || text.indexOf("@") !== -1));
  assert.ok(ctx.texts.includes("聚光单词 · 1st edition"));
  assert.ok(ctx.texts.includes("已连续打卡10天"));
  assert.ok(ctx.texts.includes("2026年10月10日"));
  assert.strictEqual(share.paintCard(null, model), false);
  assert.strictEqual(share.paintCard(ctx, null), false);
}

{
  const store = memoryStorage();
  share.commitSetComplete(store, shanghaiNoon("2026-10-03"), { kind: "session" });
  share.clearLocal(store);
  assert.strictEqual(store.getItem(share.STORAGE_KEY), null);
  assert.deepStrictEqual(share.readState(store).days, []);
}

{
  assert.strictEqual(share.learnerDisplayName({ name: "  小明  ", email: "andy@example.com" }), "小明");
  assert.strictEqual(share.learnerDisplayName({ name: "   ", email: "andy.will@example.com" }), "an***");
  assert.strictEqual(share.learnerDisplayName({ email: "a@example.com" }), "a***");
  assert.strictEqual(share.learnerDisplayName({ email: "an***@school.edu" }), "an***");
  assert.strictEqual(share.learnerDisplayName({ email: "***@school.edu" }), "学员");
  assert.strictEqual(share.learnerDisplayName({ email: "not-an-email" }), "学员");
  assert.strictEqual(share.learnerDisplayName({}), "学员");
  assert.ok(!share.learnerDisplayName({ email: "andy.will@example.com" }).includes("@"));
  const longName = "一二三四五六七八九十一二三四五六七八九十";
  const longCard = share.cardModel({ day: "2026-10-01", streak: 1 }, { name: longName });
  assert.strictEqual(longCard.learner, longName, "the saved name is kept in full");
  const longCtx = mockCtx();
  assert.strictEqual(share.paintCard(longCtx, longCard), true);
  assert.ok(longCtx.texts.some((text) => text !== longName && text.indexOf("…") !== -1), "a long name is clipped on the card");
}

{
  const src = read("grok/share-card.js");
  assert.strictEqual(share.ACHIEVEMENT_TITLE, "我要打十个");
  assert.ok(src.includes('ACHIEVEMENT_TITLE = "我要打十个"'));
  assert.ok(src.includes("current.justUnlocked ? ACHIEVEMENT_TITLE"), "unlock toast is the achievement name");
  assert.ok(!src.includes("今日打卡王"));
  assert.ok(!src.includes("我要打十个！"));
  assert.ok(!src.includes("成就已解锁"));
  assert.ok(!/from\("learner_events"\)|DB_COLUMNS|event_type/.test(src), "check-in stays out of the learner_events flush");
}

{
  const index = read("grok/index.html");
  const login = read("grok/login.html");
  const game = read("grok/game.js");
  const sw = read("grok/sw.js");
  const head = index.slice(0, index.indexOf("</head>"));

  assert.ok(head.includes('location.replace("login.html")'), "unsigned index still goes to login");
  assert.ok(index.includes('id="btn-gate-zhongkao"') && index.includes('id="btn-gate-gaokao"'));
  assert.ok(index.includes('id="answer-input"') && index.includes('id="btn-check-spelling"'));
  assert.ok(index.includes('id="card-speak"'));
  assert.ok(index.includes('id="btn-next-level"') && index.includes('id="btn-clear-home"'));
  assert.ok(/id="share-achievement"[^>]*hidden/.test(index), "share stays hidden until a set completes");
  assert.ok(index.includes('id="btn-share-achievement"') && index.includes("分享成就"));
  assert.ok(index.includes("保存图片") && index.includes("复制文案"));
  const sheetAt = index.indexOf('id="share-sheet"');
  const learnerAt = index.indexOf('id="share-card-learner"');
  const copyAt = index.indexOf('id="share-card-copy"');
  assert.ok(sheetAt > 0 && learnerAt > sheetAt && copyAt > learnerAt, "learner line stays inside the share sheet");
  assert.ok(index.indexOf('src="share-card.js"') < index.indexOf('src="game.js"'));
  assert.ok(index.indexOf('src="practice.js"') < index.indexOf('src="share-card.js"'));

  const banned = ["学习报告码", "QMR1", "教师看板", "ALS 学习信号", 'href="teacher.html"', "今日打卡王"];
  for (const needle of banned) {
    assert.ok(!index.includes(needle), "student index still shows " + needle);
    assert.ok(!login.includes(needle), "login still shows " + needle);
  }

  assert.ok(game.includes("function submitTypedSpelling"));
  assert.ok(game.includes("function renderTypedSpelling"));
  assert.ok(game.includes("function onLevelClear"));
  assert.ok(game.includes("function finishQueueSession"));
  assert.ok(game.includes("function startLevel"));
  const clearFn = game.slice(game.indexOf("function onLevelClear"), game.indexOf("function setBackupStatus"));
  const showAt = clearFn.lastIndexOf('showScreen("clear")');
  const offerAt = clearFn.lastIndexOf("offerSetShare(");
  assert.ok(showAt > 0 && offerAt > showAt, "level clear still shows before the share hook");
  const queueFn = game.slice(game.indexOf("function finishQueueSession"), game.indexOf("function enterExam"));
  assert.ok(queueFn.lastIndexOf("offerSetShare(") > queueFn.lastIndexOf('showScreen("clear")'));
  const offerFn = game.slice(game.indexOf("function offerSetShare"), game.indexOf("function finishQueueSession"));
  assert.ok(offerFn.includes("try {"));
  assert.ok(offerFn.includes("catch"));
  assert.ok(offerFn.includes("QuizMarioShare"));
  assert.ok(offerFn.includes("onSetComplete"));
  assert.ok(offerFn.includes("save.profile") && offerFn.includes("quizmario-auth"), "the card reads a saved name or the session email");
  assert.ok(!read("grok/auth-page.js").includes("share-card"), "login identity UI is not part of the share card");
  assert.ok(game.includes("btn-next-level") && game.includes("startLevel(next)"));

  assert.ok(!sw.includes("words.js"));
  assert.ok(!sw.includes("share-card.js"));
  assert.ok(!sw.includes("exam-tracks.js"));
  assert.deepStrictEqual(learnerEvents.DB_COLUMNS, [
    "event_id", "learner_id", "user_id", "source", "event_type",
    "payload", "created_at", "item_id", "headword", "frame_id",
    "cefr_level", "run_purpose",
    "evidence_kind", "independent", "task_direction",
  ]);
}

console.log("share-card ok");

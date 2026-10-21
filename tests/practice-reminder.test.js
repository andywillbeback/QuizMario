"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const tip = require("../practice-reminder.js");

const day = "2026-10-21";
const next = "2026-10-22";

function show(extra) {
  return tip.shouldShowPracticeReminder(Object.assign({
    signedIn: true,
    onHome: true,
    enteringHome: true,
    count: 3,
    day: day,
    dismissed: true,
    softGateVisible: false,
    reminder: null,
  }, extra || {}));
}

assert.strictEqual(show(), true, "a later home entry after 稍后 shows the tip");
assert.strictEqual(show({ signedIn: false }), false);
assert.strictEqual(show({ onHome: false }), false, "the exam picker is not the student home");
assert.strictEqual(show({ enteringHome: false }), false, "the 稍后 paint is not a new home entry");
assert.strictEqual(show({ enteringHome: undefined }), false, "omitting enteringHome stays hidden");
assert.strictEqual(show({ count: 0 }), false);
assert.strictEqual(show({ count: -2 }), false);
assert.strictEqual(show({ softGateVisible: true }), false, "the soft gate wins while it is up");
assert.strictEqual(show({ dismissed: false }), false, "开始 without 稍后 does not raise the tip");

const yesterday = { day: "2026-10-20", shown: true };
assert.strictEqual(show({ reminder: yesterday }), true, "a previous day does not use up today's tip");
assert.deepStrictEqual(tip.freshPracticeReminder(yesterday, day), { day: day, shown: false });
assert.strictEqual(yesterday.shown, true, "reading today does not rewrite yesterday");

const marked = tip.markPracticeReminder(null, day);
assert.deepStrictEqual(marked, { day: day, shown: true });
assert.strictEqual(show({ reminder: marked }), false, "once shown, the rest of the day stays quiet");
assert.strictEqual(show({ reminder: marked, day: next, dismissed: true }), true, "the next calendar day can remind again");
assert.strictEqual(marked.day, day, "marking the next day does not rewrite today");

const prior = { day: day, shown: false, extra: true };
const stamped = tip.markPracticeReminder(prior, day);
assert.strictEqual(prior.shown, false, "mark returns a new row");
assert.strictEqual(stamped.shown, true);
assert.strictEqual(stamped.extra, undefined);

assert.strictEqual(tip.practiceReminderLine(3), "今天还有 3 道今日必练");
assert.strictEqual(tip.practiceReminderLine(1), "今天还有 1 道今日必练");
assert.strictEqual(tip.practiceReminderLine(0), "今天还有 0 道今日必练");
assert.strictEqual(tip.practiceReminderLine(-4), "今天还有 0 道今日必练");
assert.strictEqual(tip.STORAGE_KEY, "vocabSpotlight_mustRemind_v1");

const root = path.join(__dirname, "..");
const index = fs.readFileSync(path.join(root, "index.html"), "utf8");
const game = fs.readFileSync(path.join(root, "game.js"), "utf8");
const self = fs.readFileSync(path.join(root, "practice-reminder.js"), "utf8");
assert.ok(index.includes('id="must-reminder"'));
assert.ok(index.includes('id="must-reminder-copy"'));
assert.ok(index.includes('id="btn-must-remind"') && index.includes("开始今日必练"));
assert.ok(index.includes("今天还有"));
assert.ok(index.indexOf('id="home-loop"') < index.indexOf('id="must-reminder"'));
assert.ok(index.indexOf('id="today-narrative"') < index.indexOf('id="must-reminder"'));
assert.ok(index.includes('src="practice-reminder.js"'));
assert.ok(index.indexOf('src="practice-reminder.js"') < index.indexOf('src="game.js"'));
const rule = index.slice(index.indexOf(".must-reminder {"), index.indexOf("button.is-hero"));
assert.ok(rule.includes("display: flex"));
assert.ok(!/position:\s*fixed/.test(rule), "the tip stays in the page flow");
assert.ok(game.includes("shouldShowPracticeReminder"));
assert.ok(game.includes("renderPracticeReminder"));
assert.ok(game.includes("practiceReminderArmed = true"));
assert.ok(game.includes("practiceReminderArmed = false"));
assert.ok(game.includes("btn-must-remind"));
assert.ok(game.includes("startMustPractice"));
assert.ok(!/PushManager|requestPermission|serviceWorker|twilio/i.test(self));

console.log("practice-reminder ok");

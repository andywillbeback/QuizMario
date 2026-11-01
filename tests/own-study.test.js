"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
function read(name) {
  return fs.readFileSync(path.join(root, name), "utf8");
}

const api = require("../grok/teacher.js");
const metrics = require("../grok/study-metrics.js");
assert.strictEqual(api.buildPersonal, metrics.buildPersonal);
assert.strictEqual(api.practiceInventory, metrics.practiceInventory);
assert.strictEqual(api.inventoryListsHtml, metrics.inventoryListsHtml);
assert.strictEqual(api.personalChartsHtml, metrics.personalChartsHtml);

const index = read("grok/index.html");
const own = read("grok/own-study.js");
const game = read("grok/game.js");
const login = read("grok/login.html");

assert.ok(index.includes('id="stats-panel"') && index.includes("我的学习数据"));
assert.ok(index.indexOf('src="study-metrics.js"') < index.indexOf('src="own-study.js"'));
assert.ok(index.indexOf('src="own-study.js"') < index.indexOf('src="game.js"'));
assert.ok(!index.includes('src="teacher.js"'), "student home does not load the teacher board");
assert.ok(!index.includes('href="teacher.html"'));
assert.ok(!login.includes('src="study-metrics.js"') && !login.includes('src="own-study.js"'), "login stays unchanged");
for (const banned of ["teacher_directory", "classZip", "user_progress", "一键下载", "教师看板"]) {
  assert.ok(!index.includes(banned), "index shows " + banned);
  assert.ok(!own.includes(banned), "own-study shows " + banned);
}
assert.ok(!own.includes("teacher.js"));
assert.ok(!own.includes(".from("));
assert.ok(game.includes("QuizMarioOwnStudy.render"));
assert.ok(game.includes("ownStudy ? \"\" :"), "the old practice radar is omitted once 学情 charts render");
const killAt = game.indexOf("function announceKillStreak");
const shutAt = game.indexOf("function announceShutDown");
assert.ok(killAt > 0 && shutAt > killAt);
const kill = game.slice(killAt, shutAt);
assert.ok(!kill.includes("QMStudy") && !kill.includes("own-study") && !kill.includes("studyDaily"));

const now = new Date(2026, 9, 24, 12, 0, 0);

const empty = api.buildPersonal({}, [], now);
assert.strictEqual(empty.inventory.practiced.length, 0);
assert.strictEqual(empty.inventory.learned.length, 0);
assert.strictEqual(empty.inventory.weak.length, 0);
assert.strictEqual(empty.email, "");
const emptyHtml = api.personalChartsHtml(empty) + api.inventoryListsHtml(empty.inventory);
for (const label of ["学情雷达", "题型占比", "近7日正确率", "近7日学习分钟", "遗忘节点", "掌握度", "认词", "搭配", "产出", "巩固"]) {
  assert.ok(emptyHtml.indexOf(label) > 0, label);
}
assert.ok(emptyHtml.indexOf("还没有练过的词") > 0);
assert.ok(emptyHtml.indexOf("不画成 0") > 0 || emptyHtml.indexOf("不画成0") > 0);
for (const leak of ["teacher_directory", "一键下载", "学员数", "班级云进度", "<script"]) {
  assert.ok(emptyHtml.indexOf(leak) === -1, leak);
}

const cards = {};
for (let i = 0; i < 45; i++) {
  const name = "w" + String(i).padStart(2, "0");
  cards["core|0::" + name] = { state: "learning", interval: 0, mastery: i, reps: 1, correct: 1, wrong: 0 };
}
cards["core|1::w44"] = { state: "review", interval: 2, mastery: 1, mastered: true, reps: 3, correct: 3, wrong: 0 };
const capped = api.buildPersonal({ cards: cards, daily: {}, practice: {} }, [], now);
assert.strictEqual(capped.inventory.practiced.length, 45, "duplicate headwords collapse");
assert.strictEqual(capped.inventory.practiced[0].word, "w44");
assert.strictEqual(capped.inventory.practiced[0].score, 44, "higher mastery wins when the same word was saved twice");
assert.deepStrictEqual(capped.inventory.learned.map(function (row) { return row.word; }), ["w44"]);
assert.strictEqual(capped.inventory.learned[0].score, 3);
const cappedHtml = api.inventoryListsHtml(capped.inventory);
assert.ok(cappedHtml.indexOf("已练习（45）") > 0);
assert.ok(cappedHtml.indexOf("查看更多") > 0);
assert.ok(cappedHtml.indexOf(">w44<") > 0);
assert.ok(cappedHtml.indexOf("own-more") > 0);
assert.ok(cappedHtml.indexOf(">w36<") > 0, "the ninth row is in the page, hidden until 查看更多");
assert.ok(cappedHtml.indexOf(">w05<") > 0);
assert.ok(cappedHtml.indexOf(">w04<") === -1, "rows past the cap stay out of the page");
assert.ok(cappedHtml.indexOf("还有 5 个未列出") > 0);
const opened = api.inventoryListsHtml(capped.inventory, { open: { practiced: true } });
assert.ok(opened.indexOf("own-more") === -1);
assert.ok(opened.indexOf("查看更多") === -1);

const learnedSave = {
  cards: {
    "0::solid": { state: "review", interval: 1, mastery: 3, reps: 4, correct: 4, wrong: 0 },
    "0::thin": { state: "review", interval: 1, mastery: 1, reps: 2, correct: 2, wrong: 1 },
    "0::fresh": { state: "new", reps: 0, correct: 0, wrong: 0, mastery: 0 },
  },
  wrongBook: {
    "0::missed": { active: true, lemma: "missed", gloss_zh: "错过" },
  },
};
const split = api.buildPersonal(learnedSave, [
  { learner_id: "me", event_type: "vocab.answer_wrong", headword: "thin", payload: { gloss_zh: "薄" }, created_at: now.toISOString() },
  { learner_id: "other", event_type: "vocab.answer_wrong", headword: "secret", payload: { gloss_zh: "别人的词" }, created_at: now.toISOString() },
], now, { learnerId: "me", glosses: { solid: "扎实<script>" } });
assert.deepStrictEqual(split.inventory.learned.map(function (row) { return row.word; }), ["solid"]);
assert.ok(split.inventory.practiced.some(function (row) { return row.word === "thin"; }));
assert.ok(split.inventory.practiced.some(function (row) { return row.word === "missed"; }));
assert.ok(!split.inventory.practiced.some(function (row) { return row.word === "fresh" || row.word === "secret"; }));
assert.ok(split.inventory.weak.some(function (row) { return row.word === "thin"; }));
assert.ok(!split.inventory.weak.some(function (row) { return row.word === "secret"; }));
const safeHtml = api.inventoryListsHtml(split.inventory);
assert.ok(safeHtml.indexOf("扎实&lt;script&gt;") > 0);
assert.ok(safeHtml.indexOf("<script") === -1);
assert.ok(safeHtml.indexOf("别人的词") === -1);
assert.ok(safeHtml.indexOf("错过") > 0);

const guest = api.personalChartsHtml(api.buildPersonal(null, null, now));
assert.ok(guest.indexOf("学情雷达") > 0);

function bootMetrics(hasBoard) {
  const sandbox = {
    console: console,
    window: {
      document: {
        getElementById: function (id) { return hasBoard && id === "board" ? { id: "board" } : null; },
      },
    },
  };
  sandbox.window.window = sandbox.window;
  vm.createContext(sandbox);
  vm.runInContext(read("grok/study-metrics.js"), sandbox, { filename: "study-metrics.js" });
  return sandbox.window;
}

const studentWindow = bootMetrics(false);
assert.ok(studentWindow.QMStudy && typeof studentWindow.QMStudy.buildPersonal === "function");
assert.strictEqual(studentWindow.QMStudy.classZip, undefined);
assert.strictEqual(studentWindow.QMStudy.buildBoard, undefined);
assert.strictEqual(studentWindow.QMStudy.isTeacher, undefined);
assert.strictEqual(studentWindow.QMTeacherCore, undefined);
assert.strictEqual(studentWindow.QMTeacher, undefined);

const teacherWindow = bootMetrics(true);
assert.ok(typeof teacherWindow.QMTeacherCore.classZip === "function");
assert.strictEqual(teacherWindow.QMStudy.classZip, undefined, "the student-facing handle still omits the packer");

const ownSandbox = { console: console, window: { document: { getElementById: function () { return null; } } } };
ownSandbox.window.window = ownSandbox.window;
ownSandbox.module = { exports: {} };
vm.createContext(ownSandbox);
vm.runInContext(read("grok/own-study.js"), ownSandbox, { filename: "own-study.js" });
assert.strictEqual(ownSandbox.window.QuizMarioOwnStudy.render({ save: { cards: {} }, events: [] }), "");

console.log("own-study ok");

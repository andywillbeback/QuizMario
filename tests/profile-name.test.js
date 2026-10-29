"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const profile = require("../grok/profile-name");

const root = path.join(__dirname, "..");
function read(name) {
  return fs.readFileSync(path.join(root, name), "utf8");
}

assert.deepStrictEqual(profile.validateDisplayName("  "), { ok: false, error: "请填写姓名。" });
assert.deepStrictEqual(profile.validateDisplayName("李"), { ok: false, error: "姓名需要 2–12 个字。" });
assert.deepStrictEqual(profile.validateDisplayName("李雷"), { ok: true, name: "李雷" });
assert.strictEqual(profile.validateDisplayName("一二三四五六七八九十一二").ok, true);
assert.strictEqual(profile.validateDisplayName("一二三四五六七八九十一二三").ok, false);
assert.deepStrictEqual(profile.validateClassName(""), { ok: false, error: "请填写班级名。" });
assert.deepStrictEqual(profile.validateClassName("  初三1班 "), { ok: true, cls: "初三1班" });
assert.strictEqual(profile.validateClassName("班".repeat(21)).ok, false);

const pair = profile.validatePair(" 小王 ", "高一3班");
assert.deepStrictEqual(pair, { ok: true, name: "小王", cls: "高一3班" });
assert.strictEqual(profile.validatePair("小王", "").ok, false);
assert.deepStrictEqual(profile.signupData("小王", "高一3班"), {
  display_name: "小王",
  class_name: "高一3班",
});

const picked = profile.pickProfile(
  { profile: { name: "本地", cls: "" } },
  { profile: { name: "云端", cls: "云班" } },
  { user_metadata: { display_name: "元数据", class_name: "元班" } }
);
assert.deepStrictEqual(picked, { name: "本地", cls: "云班" });
assert.deepStrictEqual(profile.pickProfile({}, null, {
  user_metadata: { display_name: "小王", class_name: "1班" },
}), { name: "小王", cls: "1班" });
assert.strictEqual(profile.complete({ name: "小王", cls: "" }), false);
assert.strictEqual(profile.complete({ name: "小王", cls: "1班" }), true);

const mem = {
  raw: "",
  getItem() { return this.raw; },
  setItem(key, value) { this.raw = String(value); },
};
mem.raw = JSON.stringify({ points: 3, cards: { a: 1 }, profile: { name: "", cls: "" } });
const seeded = profile.seedLocalProfile("小王", "1班", mem);
assert.strictEqual(seeded.points, 3);
assert.deepStrictEqual(seeded.cards, { a: 1 });
assert.deepStrictEqual(seeded.profile, { name: "小王", cls: "1班" });
profile.seedLocalProfile("别人", "别班", mem);
assert.strictEqual(JSON.parse(mem.raw).profile.name, "小王");
assert.strictEqual(JSON.parse(mem.raw).profile.cls, "1班");
const edited = profile.writeProfile("小王", "初三2班", mem);
assert.strictEqual(edited.profile.name, "小王");
assert.strictEqual(edited.profile.cls, "初三2班");
assert.strictEqual(edited.points, 3);
assert.ok(edited.updatedAt);

const login = read("grok/login.html");
const auth = read("grok/auth-page.js");
const index = read("grok/index.html");
const sync = read("grok/sync.js");
const helper = read("grok/profile-name.js");
assert.ok(login.includes('id="display-name"') && login.includes('id="class-name"'));
assert.ok(login.includes("姓名（2–12 字）") && login.includes("班级名"));
assert.ok(login.includes('src="profile-name.js"'));
assert.ok(auth.includes("display_name") && auth.includes("class_name"));
assert.ok(auth.includes("seedLocalProfile"));
assert.ok(auth.includes('options:') && auth.includes("data: signupData"));
assert.ok(index.indexOf('src="game.js"') < index.indexOf('src="profile-name.js"'));
assert.ok(index.indexOf('src="profile-name.js"') < index.indexOf('src="sync.js"'));
assert.ok(sync.includes("stampIdentity"));
assert.ok(helper.includes("writeProfile"));
assert.ok(helper.includes("btn-edit-profile"));
assert.ok(helper.includes("修改姓名和班级"));
assert.ok(helper.includes('host = $("stats-panel")') || helper.includes("stats-panel"));
const game = read("grok/game.js");
const setAt = game.indexOf("setProfile(name, cls)");
assert.ok(setAt > 0);
assert.ok(game.indexOf("save.profile.cls = nextCls", setAt) > setAt);
assert.ok(game.indexOf("persist()", setAt) > setAt && game.indexOf("persist()", setAt) < setAt + 800);
assert.ok(!/QMR1|教师看板|ALS 学习信号|学习报告码/.test(login + auth + helper));

console.log("profile-name ok");

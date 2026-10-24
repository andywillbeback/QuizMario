const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
function read(name) {
  return fs.readFileSync(path.join(root, name), "utf8");
}

const api = require("../grok/teacher.js");
const html = read("grok/teacher.html");
const js = read("grok/teacher.js");
const sql = read("grok/supabase/teacher_read.sql");
const index = read("grok/index.html");
const login = read("grok/login.html");
const config = read("grok/config.js");

assert.strictEqual(
  api.DENIED_MESSAGE,
  "这个账号不是教师，不能打开班级看板。授权只认 app_metadata 里的 role=teacher，不认 user_metadata。"
);
assert.ok(html.includes(api.DENIED_MESSAGE), "teacher page carries the role gate");
assert.ok(html.includes("app_metadata"), "teacher page names app_metadata");
assert.ok(html.includes('id="kpi-strip"') && html.includes("学员数") && html.includes("近7日活跃"));
assert.ok(html.includes("平均掌握%") && html.includes("薄弱词数"));
assert.ok(html.includes('id="chart-mastery"'), "mastery chart");
assert.ok(html.includes('id="chart-activity"'), "activity chart");
assert.ok(html.includes('id="chart-modes"'), "mode donut");
assert.ok(html.includes('id="chart-weak"'), "weak-word chart");
assert.ok(html.includes('id="students"') && html.includes('id="empty-state"') && html.includes('id="detail"'));
assert.ok(html.includes('id="chart-student"'), "personal line");
assert.ok(html.includes("chart.js"), "Chart.js CDN");
assert.ok(html.includes("<h2>教师看板"), "board heading");
assert.ok(html.includes("导入报告码") && html.includes("QMR1"), "legacy paste stays available");

const legacyAt = html.indexOf('id="legacy-report"');
for (const id of ["kpi-strip", "chart-mastery", "chart-activity", "chart-modes", "chart-weak", "empty-state", "students"]) {
  const at = html.indexOf('id="' + id + '"');
  assert.ok(at > 0 && at < legacyAt, id + " is part of the cloud board, above the legacy paste");
}
assert.ok(!/id="legacy-report"[^>]*\sopen\b/.test(html), "legacy report paste is collapsed");

assert.strictEqual(api.isTeacher({ app_metadata: { role: "teacher" } }), true);
assert.strictEqual(api.isTeacher({ user_metadata: { role: "teacher" } }), false);
assert.strictEqual(api.isTeacher({
  app_metadata: { role: "student" },
  user_metadata: { role: "teacher" },
}), false);
assert.strictEqual(api.isTeacher({ app_metadata: { provider: "email" } }), false);
assert.ok(api.isTeacher.toString().includes("app_metadata"));
assert.ok(!api.isTeacher.toString().includes("user_metadata"));

const gateAt = js.indexOf("if (!api.isTeacher(user))");
const queryAt = js.indexOf('"user_progress"', gateAt);
assert.ok(gateAt > 0 && queryAt > gateAt, "class query stays behind the teacher gate");
assert.ok(!js.includes("user.user_metadata") && !/user_metadata\.role\s*===/.test(js), "board does not authorize from user_metadata");

for (const file of ["grok/teacher.html", "grok/teacher.js", "grok/config.js", "grok/supabase/teacher_read.sql"]) {
  const src = read(file);
  assert.ok(!/service_role\s*[:=]\s*['"][^'"]+['"]/.test(src), file + " must not embed a service_role secret");
  assert.ok(!/eyJ[A-Za-z0-9_-]{10,}\./.test(src), file + " must not embed a JWT");
  assert.ok(!/sb_secret_/.test(src), file);
}
assert.ok(!/service_role["']?\s*[:=]/i.test(config));

assert.ok(sql.includes("auth.jwt() -> 'app_metadata' ->> 'role'"));
assert.ok(!/auth\.jwt\(\)\s*->\s*'user_metadata'/.test(sql), "policies must not read user_metadata");
assert.ok(!/'user_metadata'/.test(sql) && !/raw_user_meta_data\s*=/.test(sql), "SQL must not authorize from user metadata");
assert.ok(sql.includes("user_progress_select_teacher"));
assert.ok(sql.includes("learner_events_select_teacher"));
assert.ok(sql.includes("public.is_teacher()"));
assert.ok(!sql.includes("drop policy if exists user_progress_select_own"));
assert.ok(!sql.includes("drop policy if exists learner_events_select_own"));
assert.ok(!/create policy[\s\S]*?for (insert|update|delete)[\s\S]*?is_teacher\(\)/i.test(sql));
assert.ok(sql.includes("raw_app_meta_data"));
assert.ok(sql.includes("private.teacher_directory"));

assert.ok(!index.includes('href="teacher.html"'), "students do not get a teacher-board link");
assert.ok(!login.includes('href="teacher.html"') && !login.includes("教师看板"), "login has no teacher board");

assert.strictEqual(api.maskEmail("anchor@school.com"), "an***@school.com");
assert.strictEqual(api.maskEmail("a@school.com"), "a***@school.com");
assert.strictEqual(api.maskEmail("an***@school.com"), "an***@school.com");
assert.strictEqual(api.maskEmail(""), "—");

assert.strictEqual(api.cardTouched({ state: "new", reps: 0, correct: 0, wrong: 0, mastery: 0 }), false);
assert.strictEqual(api.cardCredit({ state: "review", interval: 1, mastery: 1, reps: 2 }), 1);
assert.strictEqual(api.cardCredit({ state: "learning", interval: 0.01, mastery: 0.5, reps: 1 }), 0.5);
assert.strictEqual(api.isLearned({ state: "review", interval: 1, mastery: 3, mastered: true }), true);
assert.strictEqual(api.isLearned({ state: "review", interval: 1, mastery: 1, mastered: null }), false);
assert.strictEqual(api.isLearned({ state: "review", interval: 1, mastery: 3 }), true);
assert.strictEqual(api.modeLabel({
  event_type: "vocab.answer_correct",
  payload: { task_direction: "recognition", task_direction_detail: "meaning" },
}), "看英选义");
assert.strictEqual(api.modeLabel({ event_type: "vocab.due_review", payload: {} }), "到期信号");

const now = new Date(2026, 9, 24, 12, 0, 0);
const ago = new Date(now);
ago.setDate(ago.getDate() - 3);
ago.setHours(12, 0, 0, 0);
const todayKey = api.dayKey(now);

const progress = [
  {
    user_id: "student-a",
    updated_at: now.toISOString(),
    save: {
      track: "zhongkao",
      points: 10,
      streak: 2,
      bestStreak: 4,
      profile: { name: "小王", cls: "1" },
      cards: {
        "zhongkao|0::advice": { state: "review", interval: 1, mastery: 3, mastered: true, correct: 4, wrong: 2, reps: 4 },
        "zhongkao|0::add": { state: "learning", interval: 0.01, mastery: 0.5, correct: 1, wrong: 0, reps: 1 },
        "zhongkao|0::a": { state: "new", interval: 0, mastery: 0, correct: 0, wrong: 0, reps: 0 },
      },
      wrongBook: {
        "zhongkao::adult": { active: true, lemma: "adult", gloss_zh: "成年人" },
        "zhongkao::gone": { active: false, lemma: "gone" },
      },
      daily: {},
    },
  },
  {
    user_id: "student-b",
    updated_at: now.toISOString(),
    save: {
      track: "core",
      cards: {
        "0::quiet": { state: "new", mastery: 0, reps: 0, correct: 0, wrong: 0 },
      },
      daily: {},
    },
  },
];
progress[0].save.daily[todayKey] = { c: 3, w: 1, unk: 0, n: 1 };

const events = [
  { learner_id: "student-a", event_type: "vocab.answer_wrong", headword: "Advice", payload: { gloss_zh: "建议" }, created_at: now.toISOString() },
  { learner_id: "student-a", event_type: "vocab.answer_correct", headword: "add", payload: { task_direction: "recognition", task_direction_detail: "meaning" }, created_at: new Date(now.getTime() + 1000).toISOString() },
  { learner_id: "student-a", event_type: "vocab.due_review", headword: "add", payload: { track: "zhongkao" }, created_at: now.toISOString() },
  { learner_id: "student-a", event_type: "vocab.wrong_book_add", headword: "adult", payload: {}, created_at: ago.toISOString() },
];

const board = api.buildBoard(progress, events, [
  { user_id: "student-a", masked_email: "anchor@school.com" },
], now);

assert.strictEqual(board.empty, false);
assert.strictEqual(board.kpis.students, 2);
assert.strictEqual(board.kpis.active7, 1);
assert.strictEqual(board.kpis.mastery, 75);
assert.strictEqual(board.kpis.weak, 2);
assert.deepStrictEqual(board.mastery.labels, ["0", "0.5", "1", "2", "3"]);
assert.strictEqual(board.mastery.counts[1], 1, "0.5-star touched card");
assert.strictEqual(board.mastery.counts[4], 1, "3-star touched card");
assert.strictEqual(board.mastery.counts.reduce(function (a, b) { return a + b; }, 0), 2, "untouched new cards stay out of the histogram");
assert.strictEqual(board.activity.counts.length, 7);
const todaySlot = board.activity.labels.indexOf(todayKey.slice(5));
assert.strictEqual(board.activity.counts[todaySlot], 2, "due_review is not practice");
assert.strictEqual(board.activity.counts.reduce(function (a, b) { return a + b; }, 0), 3);
assert.ok(board.modes.labels.indexOf("看英选义") >= 0);
assert.ok(board.modes.labels.indexOf("到期信号") >= 0);
assert.ok(board.modes.labels.indexOf("答对") === -1, "recognition payload replaces the generic correct slice");
assert.strictEqual(board.weak[0].word, "advice");
assert.strictEqual(board.weak[0].score, 3);
assert.strictEqual(board.weak[1].word, "adult");
assert.strictEqual(board.weak[1].score, 1);
assert.ok(!board.weak.some(function (row) { return row.word === "gone"; }));

const student = board.students[0];
assert.strictEqual(student.email, "an***@school.com");
assert.strictEqual(student.name, "小王");
assert.strictEqual(student.touched, 2);
assert.strictEqual(student.learned, 1);
assert.strictEqual(student.mastery, 75);
assert.strictEqual(student.lineSource, "daily");
assert.strictEqual(student.line[student.line.length - 1], 4);
assert.strictEqual(student.timeline[0].word, "add");
assert.ok(student.timeline.some(function (row) { return row.word === "advice" && row.label === "答错"; }));

const quiet = board.students[1];
assert.strictEqual(quiet.mastery, null);
assert.strictEqual(quiet.touched, 0);
assert.ok(quiet.email.indexOf("@") === -1, "missing directory entry does not invent an email");

const empty = api.buildBoard([], [], [], now);
assert.strictEqual(empty.empty, true);
assert.strictEqual(empty.kpis.students, 0);
assert.strictEqual(empty.kpis.active7, 0);
assert.strictEqual(empty.kpis.mastery, null);
assert.strictEqual(empty.kpis.weak, 0);
assert.deepStrictEqual(empty.activity.counts, [0, 0, 0, 0, 0, 0, 0]);

const report = api.decodeReport("QMR1." + Buffer.from(JSON.stringify({
  v: 1, n: "a", k: "c", at: "2026-01-01", tr: { core: [1, 10, [1]] }, wk: [["cat", "猫", 2]],
}), "utf8").toString("base64"));
assert.strictEqual(report.n, "a");
assert.strictEqual(api.totals(report).learned, 1);

console.log("teacher-dashboard ok");

"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
function read(name) {
  return fs.readFileSync(path.join(root, name), "utf8");
}

const session = require("../grok/session-duration");
const teacher = require("../grok/teacher");
const events = require("../grok/learner-events");
const merge = require("../grok/sync-merge");

const UID = "11111111-1111-4111-8111-111111111111";
const NOW = "2026-10-31T06:00:00.000Z";

assert.strictEqual(session.msToMinutes(0), 0);
assert.strictEqual(session.msToMinutes(30000), 0.5);
assert.strictEqual(session.msToMinutes(120000), 2);
assert.strictEqual(teacher.msToMinutes(30000), 0.5);
assert.strictEqual(teacher.msToMinutes(120000), 2);

{
  const save = { daily: {}, studyDaily: {} };
  const end = new Date(2026, 9, 31, 0, 0, 10).getTime();
  assert.strictEqual(session.addStudyMs(save, end, 20000), 20000);
  const previous = session.dayKey(end - 20000);
  const today = session.dayKey(end - 1);
  assert.notStrictEqual(previous, today);
  assert.strictEqual(save.studyDaily[previous], 10000);
  assert.strictEqual(save.studyDaily[today], 10000);
  assert.deepStrictEqual(save.daily, {}, "minutes do not invent a streak day");
  save.daily[today] = { c: 1, w: 0, rc: 0, rw: 0, n: 0, unk: 0 };
  session.addStudyMs(save, end, 5000);
  assert.strictEqual(save.studyDaily[today], 15000);
  assert.strictEqual(save.daily[today].studyMs, 15000);
  assert.strictEqual(save.daily[today].c, 1);
  assert.ok(!Object.prototype.hasOwnProperty.call(save.daily, previous));
}

{
  const t0 = Date.parse("2026-10-31T02:00:00.000Z");
  const clock = session.createClock({ idleMs: 1000, heartbeatMs: 5000, visible: true });
  let step = clock.activity(t0);
  assert.strictEqual(step.events.length, 1);
  assert.strictEqual(step.events[0].event_type, "session.start");
  assert.strictEqual(step.pendingMs, 0);
  step = clock.tick(t0 + 400);
  assert.strictEqual(step.pendingMs, 0);
  assert.strictEqual(step.events.length, 0);
  step = clock.setVisible(false, t0 + 400);
  assert.strictEqual(step.pendingMs, 400);
  assert.strictEqual(step.events.length, 1);
  assert.strictEqual(step.events[0].event_type, "session.end");
  assert.strictEqual(step.events[0].duration_ms, 400);
  assert.strictEqual(step.events[0].end_reason, "hidden");
  const again = clock.setVisible(true, t0 + 50000);
  assert.strictEqual(again.pendingMs, 0);
  assert.strictEqual(again.events.length, 0, "showing the tab does not resume the clock");
  const resume = clock.activity(t0 + 50000);
  assert.strictEqual(resume.events[0].event_type, "session.start");
  assert.strictEqual(resume.pendingMs, 0);
  const done = clock.end(t0 + 50600, "pagehide");
  assert.strictEqual(done.pendingMs, 600, "the hidden gap is not study");
  assert.strictEqual(done.events[0].duration_ms, 600);
}

{
  const t0 = Date.parse("2026-10-31T03:00:00.000Z");
  const idle = session.createClock({ idleMs: 1000, heartbeatMs: 60000, visible: true });
  idle.activity(t0);
  const late = idle.tick(t0 + 5000);
  assert.strictEqual(late.pendingMs, 1000);
  assert.strictEqual(late.events[0].event_type, "session.end");
  assert.strictEqual(late.events[0].duration_ms, 1000);
  assert.strictEqual(late.events[0].end_reason, "idle");
  const gap = session.createClock({ idleMs: 1000, heartbeatMs: 100000, visible: true });
  gap.activity(t0);
  const next = gap.activity(t0 + 4000);
  assert.strictEqual(next.pendingMs, 1000);
  assert.strictEqual(next.events[0].duration_ms, 1000);
  assert.strictEqual(next.events[1].event_type, "session.start");
}

{
  const t0 = Date.parse("2026-10-31T04:00:00.000Z");
  const beat = session.createClock({ idleMs: 100000, heartbeatMs: 1000, visible: true });
  beat.activity(t0);
  const mid = beat.tick(t0 + 1500);
  assert.strictEqual(mid.events.length, 0, "a heartbeat folds minutes without a second end event");
  assert.strictEqual(mid.pendingMs, 1500);
  const fin = beat.end(t0 + 1800, "pagehide");
  assert.strictEqual(fin.pendingMs, 300);
  assert.strictEqual(fin.events[0].duration_ms, 1800, "session.end reports the whole slice");
  const quiet = session.createClock({ visible: false, idleMs: 10000, heartbeatMs: 1000 });
  assert.strictEqual(quiet.activity(t0).events.length, 0);
}

{
  const ended = events.buildEvent({
    event_type: events.TYPES.SESSION_END,
    learner_id: UID,
    duration_ms: 90000,
    started_at: "2026-10-31T05:00:00.000Z",
    ended_at: NOW,
    end_reason: "hidden",
    created_at: NOW,
  }, NOW);
  assert.strictEqual(ended.event_type, "session.end");
  assert.strictEqual(ended.payload.duration_ms, 90000);
  assert.strictEqual(ended.payload.duration_sec, 90);
  assert.strictEqual(ended.payload.end_reason, "hidden");
  assert.ok(!ended.headword);
  const pub = events.publicEvent(ended);
  assert.strictEqual(pub.payload.duration_ms, 90000);
  assert.ok(!Object.prototype.hasOwnProperty.call(pub, "duration_ms"));
  const fromSec = events.buildEvent({
    event_type: events.TYPES.SESSION_END,
    learner_id: UID,
    duration_sec: 90,
    created_at: NOW,
  }, NOW);
  assert.strictEqual(fromSec.payload.duration_ms, 90000);
  const wrong = events.buildEvent({
    event_type: events.TYPES.WRONG,
    learner_id: UID,
    headword: "apple",
    outcome: "wrong",
    duration_ms: 5000,
    created_at: NOW,
  }, NOW);
  assert.strictEqual(wrong.payload.outcome, "wrong");
  assert.ok(!Object.prototype.hasOwnProperty.call(wrong.payload, "duration_ms"));
}

{
  assert.strictEqual(merge.isBlank({
    points: 0,
    unlockedLevel: 1,
    cards: {},
    studyDaily: { "2026-10-31": 1000 },
  }), false);
  assert.strictEqual(merge.isBlank({
    points: 0,
    unlockedLevel: 1,
    cards: {},
    studyDaily: {},
  }), true);
}

{
  const now = new Date(2026, 9, 31, 15, 0, 0);
  const start = new Date(2026, 9, 31, 0, 0, 0).getTime();
  const cards = {
    overdue: { state: "review", interval: 3, reps: 4, correct: 4, due: start - 1000, lapses: 2 },
    due: { state: "review", interval: 2, reps: 3, correct: 3, due: new Date(2026, 9, 31, 9, 0, 0).getTime(), lapses: 0 },
    laterSolid: { state: "review", interval: 5, reps: 5, correct: 5, due: new Date(2026, 10, 2, 9, 0, 0).getTime(), lapses: 0 },
    learning: { state: "learning", interval: 0, reps: 1, correct: 1, due: new Date(2026, 9, 31, 18, 0, 0).getTime(), lapses: 0 },
    fresh: { state: "new", reps: 0, correct: 0, wrong: 0, due: 0 },
    lapsedLearning: { state: "learning", interval: 0, reps: 1, correct: 0, wrong: 1, due: start - 5000, lapses: 1 },
  };
  assert.strictEqual(teacher.forgetBucket(cards.overdue, now), "overdue");
  assert.strictEqual(teacher.forgetBucket(cards.due, now), "due");
  assert.strictEqual(teacher.forgetBucket(cards.laterSolid, now), "solid");
  assert.strictEqual(teacher.forgetBucket(cards.learning, now), "learning");
  assert.strictEqual(teacher.forgetBucket(cards.fresh, now), "");
  assert.strictEqual(teacher.forgetBucket(cards.lapsedLearning, now), "overdue");
  assert.strictEqual(teacher.forgetBucket({
    state: "learning", interval: 0, reps: 1, correct: 1, due: 0,
  }, now), "due");
  const counts = teacher.forgetCounts(cards, now);
  assert.strictEqual(counts.due, 1);
  assert.strictEqual(counts.overdue, 2);
  assert.strictEqual(counts.learning, 1);
  assert.strictEqual(counts.solid, 1);
  assert.strictEqual(counts.lapsed, 2);
}

{
  const now = new Date(2026, 9, 31, 15, 0, 0);
  const day = teacher.dayKey(now);
  const start = new Date(2026, 9, 31, 0, 0, 0).getTime();
  const baseEvents = [
    { learner_id: "s", event_type: "vocab.answer_correct", created_at: now.toISOString(), payload: { task_direction: "recognition" } },
    { learner_id: "s", event_type: "vocab.due_review", created_at: now.toISOString(), payload: {} },
  ];
  const withSession = baseEvents.concat([
    {
      learner_id: "s",
      event_type: "session.end",
      created_at: now.toISOString(),
      payload: { duration_ms: 120000 },
    },
    {
      learner_id: "s",
      event_type: "session.start",
      created_at: now.toISOString(),
      payload: { started_at: now.toISOString() },
    },
  ]);
  const plain = teacher.buildBoard([{
    user_id: "s",
    save: { cards: {}, daily: { [day]: { c: 1, w: 0, unk: 0 } }, profile: { name: "小周" } },
  }], baseEvents, [], now);
  const mixed = teacher.buildBoard([{
    user_id: "s",
    save: {
      cards: {
        late: { state: "review", interval: 4, reps: 4, correct: 4, due: start - 1000, lapses: 1 },
        soon: { state: "learning", interval: 0, reps: 1, correct: 1, due: now.getTime() + 60000 },
        held: { state: "review", interval: 6, reps: 6, correct: 6, due: now.getTime() + 3 * 86400000 },
        brand: { state: "new", reps: 0, correct: 0, wrong: 0 },
      },
      daily: { [day]: { c: 1, w: 0, unk: 0 } },
      studyDaily: { [day]: 120000 },
      profile: { name: "小周", cls: "2" },
    },
  }], withSession, [], now);
  assert.strictEqual(
    mixed.activity.counts.reduce(function (a, b) { return a + b; }, 0),
    plain.activity.counts.reduce(function (a, b) { return a + b; }, 0),
    "session rows are not practice counts"
  );
  assert.ok(mixed.modes.labels.indexOf("session.end") === -1);
  assert.ok(mixed.modes.labels.indexOf("学习结束") === -1);
  assert.ok(mixed.modes.labels.indexOf("到期信号") >= 0, "due_review still has its own slice");
  const student = mixed.students[0];
  assert.strictEqual(student.minutes7, 2, "studyDaily is not added to session.end");
  assert.strictEqual(student.minutes[student.minutes.length - 1], 2);
  assert.deepStrictEqual(student.abilities.map(function (axis) { return axis.id; }), [
    "recognition", "collocation", "production", "retention",
  ]);
  assert.strictEqual(student.forget.overdue, 1);
  assert.strictEqual(student.forget.learning, 1);
  assert.strictEqual(student.forget.solid, 1);
  assert.strictEqual(student.forget.due, 0);
  assert.strictEqual(student.forget.lapsed, 1);
  assert.strictEqual(mixed.duration.counts[mixed.duration.counts.length - 1], 2);
  assert.strictEqual(mixed.forget.overdue, 1);
  const specs = teacher.studentChartSpecs(student);
  assert.strictEqual(specs.radar.labels.length, 4);
  assert.strictEqual(specs.duration.type, "line");
  assert.strictEqual(specs.duration.data[specs.duration.data.length - 1], 2);
  assert.deepStrictEqual(specs.forget.labels, ["今日到期", "逾期", "学习中", "已巩固"]);
  assert.deepStrictEqual(specs.forget.data, [0, 1, 1, 1]);

  const fallback = teacher.studyMinuteSeries({ daily: {}, cards: {} }, withSession, now);
  assert.strictEqual(fallback.total, 2, "session.end fills a day the save does not name");
  const doubled = teacher.studyMinuteSeries({
    studyDaily: { [day]: 120000 },
    daily: {},
  }, withSession, now);
  assert.strictEqual(doubled.total, 2);

  const csv = teacher.classCsv(mixed);
  assert.ok(csv.indexOf("近7日学习分钟") > 0);
  assert.ok(csv.indexOf("逾期词数") > 0);
  assert.ok(csv.indexOf("小周") > 0);
  const cells = csv.split("\n")[1].split(",");
  const headers = csv.split("\n")[0].split(",");
  assert.strictEqual(cells[headers.indexOf("近7日学习分钟")], "2");
  assert.strictEqual(cells[headers.indexOf("逾期词数")], "1");
  assert.strictEqual(cells[headers.indexOf("学习中")], "1");
  assert.strictEqual(cells[headers.indexOf("已巩固")], "1");

  const page = teacher.studentReportHtml(student, "2026-10-31");
  assert.ok((page.match(/<svg/g) || []).length >= 7);
  assert.ok(page.indexOf("近7日学习分钟") > 0);
  assert.ok(page.indexOf("遗忘节点") > 0);
  assert.ok(page.indexOf('data-chart="duration"') > 0);
  assert.ok(page.indexOf('data-chart="forget"') > 0);
  assert.ok(page.indexOf("第五轴") > 0);
  const radar = svgByLabel(page, "学情雷达");
  assert.ok(radar.indexOf("认词") > 0);
  assert.ok(radar.indexOf("逾期") === -1);
  const forget = svgByLabel(page, "遗忘节点");
  assert.ok(forget.indexOf("逾期") > 0);
  assert.ok(forget.indexOf("#c45b7a") > 0);
  const zip = Buffer.from(teacher.classZip(mixed, now));
  const text = zip.toString("utf8");
  assert.ok(text.indexOf("请先打开学员报告.html") > 0);
  assert.ok(text.indexOf("附表/班级汇总.csv") > 0);
  assert.ok(text.indexOf("学员/小周.html") > 0);
  assert.ok(text.indexOf("近7日学习分钟") > 0);
  assert.ok(text.indexOf("逾期词数") > 0);
  assert.ok(text.indexOf("遗忘节点") > 0);
}

{
  const index = read("grok/index.html");
  const login = read("grok/login.html");
  const game = read("grok/game.js");
  assert.ok(index.indexOf('src="learner-events.js"') < index.indexOf('src="session-duration.js"'));
  assert.ok(index.indexOf('src="session-duration.js"') < index.indexOf('src="game.js"'));
  assert.ok(!login.includes("session-duration.js"), "login does not load the study clock");
  assert.ok(game.includes("function bindStudyDuration"));
  assert.ok(game.includes("QuizMarioSession"));
  assert.ok(game.includes("studyDaily"));
  assert.ok(game.includes('clock.end(Date.now(), "pagehide")'));
  assert.ok(game.indexOf("function announceKillStreak") > 0);
  const kill = game.slice(game.indexOf("function announceKillStreak"), game.indexOf("function announceShutDown"));
  assert.ok(!kill.includes("studyDaily"), "kill-streak voice is untouched");
  assert.ok(!kill.includes("session-duration"));
}

function svgByLabel(html, label) {
  const key = 'aria-label="' + label + '"';
  const at = html.indexOf(key);
  assert.ok(at > 0, label);
  const start = html.lastIndexOf("<svg", at);
  const end = html.indexOf("</svg>", at);
  return html.slice(start, end + 6);
}

console.log("session-duration ok");

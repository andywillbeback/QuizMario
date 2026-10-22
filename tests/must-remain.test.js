"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const rq = require("../review-queues");
const tip = require("../practice-reminder");
const loop = require("../home-loop");
const story = require("../progress-narrative");

/**
 * The old in-session chrome counted the waiting pile, and 「剩」 counted
 * that pile plus the open card. After a miss the open card was also
 * pushed into the requeue, so 「剩」 became 4 while the badge lagged.
 * Both numbers are the merged due + wrong-book queue.
 */
{
  const open = { key: "account" };
  const waiting = [{ key: "beta" }, { key: "gamma" }];
  const before = rq.mustRemainingCount([open].concat(waiting), []);
  const read = rq.mustRemainReadout(before);
  assert.strictEqual(before, 3);
  assert.strictEqual(read.count, 3);
  assert.strictEqual(read.badge, "3");
  assert.strictEqual(read.leftLabel, "剩 3");
  assert.strictEqual(read.badge, read.leftLabel.replace("剩 ", ""));

  const legacyBadge = waiting.length;
  const legacyLeft = waiting.length + (1);
  assert.notStrictEqual(read.badge, String(legacyBadge), "the badge includes the open card");
  assert.strictEqual(read.leftLabel, "剩 " + legacyLeft);

  const afterMiss = rq.mustRemainingCount(waiting, [{ key: "account" }]);
  const lagged = rq.mustRemainReadout(afterMiss);
  const legacyAfterMiss = waiting.length + 1 + 1;
  assert.strictEqual(afterMiss, 3, "a rescheduled miss stays one queue row");
  assert.strictEqual(lagged.badge, "3");
  assert.strictEqual(lagged.leftLabel, "剩 3");
  assert.notStrictEqual(afterMiss, legacyAfterMiss, "the miss must not inflate 「剩」 to 4");
  assert.strictEqual(rq.combinedCount(waiting, [{ key: "account" }]), afterMiss);
}

{
  const n = rq.mustRemainReadout(rq.mustRemainingCount(
    [{ key: "a" }, { key: "b" }, { key: "c" }],
    []
  )).count;
  assert.strictEqual(n, 3);
  assert.strictEqual(rq.softGateLine(n), "今天有 3 道到期/错词，先清掉？");
  assert.strictEqual(tip.practiceReminderLine(n), "今天还有 3 道今日必练");
  assert.strictEqual(
    loop.homeLoopStrip({ signedIn: true, onHome: true, mustCount: n }).detail,
    "今日必练 3 道"
  );
  assert.strictEqual(
    story.todayNarrative({ signedIn: true, onHome: true, mustCount: n, frontier: 1 }).lines[0],
    "今日必练还剩 3 道。"
  );
}

{
  const root = path.join(__dirname, "..");
  const game = fs.readFileSync(path.join(root, "game.js"), "utf8");
  const refresh = game.slice(game.indexOf("function refreshHomeQueues"), game.indexOf("function loadPracticeReminder"));
  assert.strictEqual((refresh.match(/mustRemainingCount/g) || []).length, 1);
  assert.ok(refresh.includes('setCountBadge("must-badge", count)'));
  assert.ok(refresh.includes("renderHomeLoop(count)"));
  assert.ok(refresh.includes("renderTodayNarrative(count)"));
  assert.ok(refresh.includes("maybeShowMustGate(count)"));
  assert.ok(refresh.includes("renderPracticeReminder(count)"));
  assert.ok(refresh.includes("今日必练还剩 \" + count"));
  assert.ok(!refresh.includes("merged.length"));

  const progress = game.slice(game.indexOf("function updateProgress"), game.indexOf("function normalizeAnswer"));
  assert.ok(progress.indexOf('sessionKind === "must"') < progress.indexOf("requeueSoon.length"));
  assert.ok(progress.includes("paintMustRemaining(mustRemainingCount())"));
  assert.ok(game.includes("RQ.mustRemainReadout"));
  assert.ok(game.includes("RQ.softGateLine"));

  const fill = game.slice(game.indexOf("function fillCardContent"), game.indexOf("function stopChallenge"));
  assert.ok(fill.includes('sessionKind !== "must"'));
}

console.log("must-remain ok");

"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const srs = require("../srs-rules");

const T0 = 1700000000000;

function freshSet(n) {
  return Array.from({ length: n }, () => srs.defaultCardProg());
}

function miss(card, now) {
  srs.schedule(card, 0, now);
}

function good(card, now) {
  srs.schedule(card, 1, now);
}

function graduate(card, now) {
  good(card, now);
  good(card, now + 1000);
}

assert.strictEqual(srs.CHALLENGE_MS, 12 * 60 * 1000, "challenge default is exactly 12 minutes");
assert.strictEqual(srs.formatChallengeClock(srs.CHALLENGE_MS), "12:00");
assert.strictEqual(srs.formatChallengeClock(1000), "0:01");
assert.strictEqual(srs.formatChallengeClock(0), "0:00");
assert.strictEqual(srs.CHALLENGE_VO.success, "audio/13_challenge_cheer.m4a");
assert.strictEqual(srs.CHALLENGE_VO.fail, "audio/14_challenge_regret.m4a");
assert.strictEqual(srs.CHALLENGE_SFX.success, "audio/15_applause.wav");
assert.strictEqual(srs.CHALLENGE_SFX.fail, "audio/16_crows.wav");
assert.deepStrictEqual(srs.CHALLENGE_LINES.success, ["就你叫生词啊？", "我要打十个！", "力微，饭否？"]);
assert.deepStrictEqual(srs.CHALLENGE_LINES.fail, ["就这？", "单词：来打我呀。", "这把给了。"]);
assert.strictEqual(srs.pickChallengeLine("success", 0), "就你叫生词啊？");
assert.strictEqual(srs.pickChallengeLine("success", 0.34), "我要打十个！");
assert.strictEqual(srs.pickChallengeLine("success", 0.67), "力微，饭否？");
assert.strictEqual(srs.pickChallengeLine("fail", 0), "就这？");
assert.strictEqual(srs.pickChallengeLine("fail", 0.34), "单词：来打我呀。");
assert.strictEqual(srs.pickChallengeLine("fail", 0.999), "这把给了。");
{
  const counts = {};
  for (let i = 0; i < 6000; i++) {
    const line = srs.pickChallengeLine("success");
    counts[line] = (counts[line] || 0) + 1;
  }
  for (const line of srs.CHALLENGE_LINES.success) {
    assert.ok(counts[line] > 1500, "success line not fair: " + line + " " + counts[line]);
  }
  const failCounts = {};
  for (let i = 0; i < 6000; i++) {
    const line = srs.pickChallengeLine("fail");
    failCounts[line] = (failCounts[line] || 0) + 1;
  }
  for (const line of srs.CHALLENGE_LINES.fail) {
    assert.ok(failCounts[line] > 1500, "fail line not fair: " + line + " " + failCounts[line]);
  }
}

/* Early misses used to freeze a 50-card exam set: 40 graduated, 10 still learning. */
{
  const cards = freshSet(50);
  cards.forEach((card, i) => {
    miss(card, T0 + i);
    miss(card, T0 + 1000 + i);
  });
  let stats = srs.summarizeSet(cards, T0 + 5000);
  assert.strictEqual(stats.solid, 0);
  assert.strictEqual(stats.credit, 0, "a string of early misses does not fake progress");
  assert.strictEqual(stats.ready, false);
  assert.strictEqual(srs.legacyReady(stats), false);

  for (let i = 0; i < 40; i++) graduate(cards[i], T0 + 10000 + i * 10);
  stats = srs.summarizeSet(cards, T0 + 20000);
  assert.strictEqual(stats.solid, 40);
  assert.strictEqual(stats.need, 40);
  assert.ok(stats.learning >= 10, "the missed tail is still in learning");
  assert.strictEqual(stats.ready, true, "80% graduated clears the set");
  assert.strictEqual(srs.legacyReady(stats), false, "the old purity rule would still be stuck");
  assert.ok(stats.credit >= 40 && stats.credit < 50);

  assert.strictEqual(srs.shouldEndSet({
    ready: true,
    startedClear: false,
    queueEmpty: false,
    requeueEmpty: false,
  }), true, "stragglers still in the queue do not block the end");

  /* The same missed cards can still graduate later. Wrongs were not free. */
  for (let i = 40; i < 50; i++) {
    assert.strictEqual(srs.isSolidCard(cards[i]), false);
    good(cards[i], T0 + 30000);
    assert.strictEqual(srs.cardCredit(cards[i]), 0.5, "first correct after misses moves the bar");
    assert.strictEqual(srs.isSolidCard(cards[i]), false, "one correct does not graduate");
    good(cards[i], T0 + 31000);
    assert.strictEqual(srs.isSolidCard(cards[i]), true);
  }
  stats = srs.summarizeSet(cards, T0 + 40000);
  assert.strictEqual(stats.solid, 50);
  assert.strictEqual(stats.ready, true);
}

/* Dropping back under 80% by missing a graduated card still blocks. */
{
  const cards = freshSet(10);
  for (let i = 0; i < 8; i++) graduate(cards[i], T0);
  let stats = srs.summarizeSet(cards, T0 + 5000);
  assert.strictEqual(stats.need, 8);
  assert.strictEqual(stats.ready, true);
  miss(cards[0], T0 + 6000);
  stats = srs.summarizeSet(cards, T0 + 7000);
  assert.strictEqual(stats.solid, 7);
  assert.strictEqual(stats.ready, false, "a miss that falls through 80% must be repaired");
  graduate(cards[0], T0 + 8000);
  stats = srs.summarizeSet(cards, T0 + 9000);
  assert.strictEqual(stats.ready, true);
}

/* Next-day reviews are due, but a set that already reached 80% stays clear. */
{
  const cards = freshSet(10);
  cards.forEach((card) => {
    graduate(card, T0);
    card.due = T0;
  });
  const stats = srs.summarizeSet(cards, T0 + 2 * srs.DAY_MS);
  assert.ok(stats.due >= 10);
  assert.strictEqual(stats.solid, 10);
  assert.strictEqual(stats.ready, true);
  assert.strictEqual(srs.legacyReady(stats), false, "old due===0 rule re-closed a finished set");
}

/* Already-clear review slice still plays out; a fresh climb ends immediately. */
assert.strictEqual(srs.shouldEndSet({
  ready: true, startedClear: true, queueEmpty: false, requeueEmpty: true,
}), false);
assert.strictEqual(srs.shouldEndSet({
  ready: true, startedClear: true, queueEmpty: true, requeueEmpty: true,
}), true);
assert.strictEqual(srs.shouldEndSet({
  ready: false, startedClear: false, queueEmpty: true, requeueEmpty: true,
}), false);

/* Clock outcomes. */
const deadline = T0 + srs.CHALLENGE_MS;
assert.strictEqual(srs.evaluateChallenge({
  active: true, startedClear: false, deadline: deadline, cleared: false,
}, deadline - 1), "running");
assert.strictEqual(srs.evaluateChallenge({
  active: true, startedClear: false, deadline: deadline, cleared: true,
}, deadline - 1), "success");
assert.strictEqual(srs.evaluateChallenge({
  active: true, startedClear: false, deadline: deadline, cleared: false,
}, deadline), "fail");
assert.strictEqual(srs.evaluateChallenge({
  active: true, startedClear: false, deadline: deadline, cleared: true,
}, deadline + 500), "success", "a late tick after the clear is still a win");
assert.strictEqual(srs.evaluateChallenge({
  active: true, startedClear: true, deadline: deadline, cleared: true,
}, T0), "idle");

/* Source still shows the hint line, and the voice paths are the documented ones. */
const root = path.join(__dirname, "..");
const game = fs.readFileSync(path.join(root, "game.js"), "utf8");
const index = fs.readFileSync(path.join(root, "index.html"), "utf8");
assert.ok(game.includes('hint: '), "training card still renders the hint");
assert.ok(game.includes("例："), "training card still renders the example");
assert.ok(index.includes('src="srs-rules.js"'));
assert.ok(index.includes('id="challenge-timer"'));
assert.ok(index.includes("遗憾失败"));
assert.ok(index.includes('id="screen-fail"'));
assert.ok(index.includes('id="clear-achievement"'));
assert.ok(index.includes('id="fail-banner"'));
assert.ok(index.includes('id="crow-pass"'));
assert.ok(game.includes("pickChallengeLine"));
assert.ok(game.includes('kind === "applause"') && game.includes('kind === "crow"'));
assert.ok(!/function playChallengeCue[\s\S]*?function showCrowPass/.test(game) || !/function playChallengeCue[\s\S]*?function showCrowPass/.exec(game)[0].includes("speakZh"),
  "default challenge cue must not speak a human line");
for (const rel of ["audio/15_applause.wav", "audio/16_crows.wav"]) {
  const buf = fs.readFileSync(path.join(root, rel));
  assert.strictEqual(buf.toString("ascii", 0, 4), "RIFF", rel);
  assert.strictEqual(buf.toString("ascii", 8, 12), "WAVE", rel);
  const rate = buf.readUInt32LE(24);
  const dataBytes = buf.readUInt32LE(40);
  const samples = dataBytes / 2;
  const seconds = samples / rate;
  assert.ok(seconds > 0.8 && seconds < 3, rel + " duration " + seconds);
  let sum = 0;
  let peak = 0;
  for (let i = 0; i < samples; i += 20) {
    const v = buf.readInt16LE(44 + i * 2) / 32768;
    sum += v * v;
    peak = Math.max(peak, Math.abs(v));
  }
  const rms = Math.sqrt(sum / Math.ceil(samples / 20));
  assert.ok(rms > 0.02 && peak > 0.2, rel + " rms " + rms + " peak " + peak);
}

console.log("srs-clearance ok");

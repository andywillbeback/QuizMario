/* Legendary VO is sparse: 8, then every +4. Intervening counts are banner-only.
 * Run: node tests/kill-streak.test.js
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const streak = require(path.join(root, "grok/kill-streak.js"));

const game = fs.readFileSync(path.join(root, "grok/game.js"), "utf8");
const index = fs.readFileSync(path.join(root, "grok/index.html"), "utf8");

function loadLines() {
  const start = game.indexOf("const KILL_LINES");
  const end = game.indexOf("const $ =");
  assert.ok(start !== -1 && end > start, "KILL_LINES / SPREE_LINES stay in game.js");
  const src = game.slice(start, end)
    .replace("const KILL_LINES", "var KILL_LINES")
    .replace("const SPREE_LINES", "var SPREE_LINES");
  return new Function(src + "\nreturn { KILL_LINES, SPREE_LINES };")();
}

const lines = loadLines();
const EARLY = {
  1: "First blood",
  2: "Double kill",
  3: "Triple kill. Killing spree",
  4: "Quadra kill. Rampage",
  5: "Penta kill. Unstoppable",
  6: "Dominating",
  7: "Godlike",
  8: "Legendary",
};

{
  for (let n = 0; n <= 40; n++) {
    const onBeat = n >= 8 && (n - 8) % 4 === 0;
    assert.strictEqual(streak.shouldSpeakLegendary(n), onBeat, "shouldSpeakLegendary " + n);
    const announce = (n >= 1 && n <= 8) || onBeat;
    assert.strictEqual(streak.shouldAnnounceSpree(n), announce, "shouldAnnounceSpree " + n);
  }
  assert.strictEqual(streak.shouldSpeakLegendary(4), false, "4 is divisible by the step but before 8");
  assert.strictEqual(streak.shouldSpeakLegendary("8"), false);
  assert.strictEqual(streak.shouldAnnounceSpree(9), false);
  assert.strictEqual(streak.shouldAnnounceSpree(12), true);
}

{
  for (const n of Object.keys(EARLY)) {
    const plan = streak.killStreakPlan(Number(n), lines.KILL_LINES, lines.SPREE_LINES);
    assert.strictEqual(plan.text, EARLY[n], "early ladder " + n);
    assert.strictEqual(plan.speak, true, "early ladder still speaks " + n);
    assert.strictEqual(plan.sting, Number(n) === 8, "sting only joins Legendary at 8 in the ladder");
  }
}

{
  for (let n = 9; n <= 40; n++) {
    const plan = streak.killStreakPlan(n, lines.KILL_LINES, lines.SPREE_LINES);
    const onBeat = (n - 8) % 4 === 0;
    if (onBeat) {
      assert.strictEqual(plan.text, "Legendary", "VO line " + n);
      assert.strictEqual(plan.speak, true, "speak " + n);
      assert.strictEqual(plan.sting, true, "sting " + n);
    } else {
      assert.strictEqual(plan.text, "LEGENDARY", "banner " + n);
      assert.strictEqual(plan.speak, false, "no VO " + n);
      assert.strictEqual(plan.sting, false, "no sting " + n);
    }
  }
  const quiet = streak.killStreakPlan(0, lines.KILL_LINES, lines.SPREE_LINES);
  assert.strictEqual(quiet.text, "");
  assert.strictEqual(quiet.speak, false);
  assert.strictEqual(quiet.sting, false);
}

{
  assert.ok(index.indexOf('src="kill-streak.js"') < index.indexOf('src="game.js"'), "schedule loads before the game");
  const fn = game.slice(game.indexOf("function announceKillStreak"), game.indexOf("function announceShutDown"));
  assert.ok(fn.includes("StreakVoice.killStreakPlan(n, KILL_LINES, SPREE_LINES)"));
  assert.ok(fn.includes("StreakVoice.shouldSpeakLegendary(n)"));
  assert.ok(fn.includes("StreakVoice.shouldAnnounceSpree(n)"));
  assert.ok(fn.includes('if (legendary && plan.sting) playSting("legendary")'));
  assert.ok(fn.includes("if (speak) speakLine(plan.text)"));
  assert.ok(!fn.includes("n >= 8"), "every post-8 streak must not become a spoken Legendary");
  assert.ok(!fn.includes("force"), "streak audio still respects voiceOn");
  const shut = game.slice(game.indexOf("function announceShutDown"), game.indexOf("function fillCardContent"));
  assert.ok(shut.includes('playSting("shutdown")') && shut.includes('speakLine("Shut down")'));
}

console.log("kill-streak ok");

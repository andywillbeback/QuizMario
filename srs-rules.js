/* QuizMario spaced-repetition and set-clear rules.
 * Loaded before game.js. Also require()-able from node tests.
 *
 * OLD clearance (kept here only as legacyReady, for tests and the PR note):
 *   new === 0 AND due === 0 AND learning === 0 AND solid >= 80%.
 *   "learning" counted every card that was not yet review with interval >= 1 day,
 *   so learning === 0 already meant 100% solid. One early miss reset that card
 *   (reps = 0, ~10 min learning step) and blocked the whole set until it graduated.
 *
 * NEW clearance:
 *   solid >= ceil(80% of the set). Solid is unchanged: state "review" and
 *   interval >= 1 day, which still takes two correct answers after the last miss.
 *   Leftover new / learning / due cards stay in SRS and are re-asked, but they
 *   do not veto the set. A miss is not free: that card drops out of solid.
 *
 * Challenge clock: CHALLENGE_MS is exactly 12 minutes. Change this constant
 * to retune (10 or 15 minutes).
 * Optional spoken overrides (drop a file to replace the default SFX):
 *   audio/13_challenge_cheer.m4a    spoken win line
 *   audio/14_challenge_regret.m4a   spoken fail line
 * Default SFX when those files are absent (original, replaceable):
 *   audio/15_applause.wav           applause / cheers, no spoken line
 *   audio/16_crows.wav              crow caws
 * Regenerate the defaults with node tools/gen-challenge-sfx.js.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.QuizMarioSRS = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  var MIN_MS = 60 * 1000;
  var DAY_MS = 24 * 60 * 60 * 1000;
  var LEARN_MS = 10 * MIN_MS;
  var CLEAR_SOLID_PCT = 0.8;
  var CLEAR_MIN_INTERVAL_DAYS = 1;
  /** Andy confirmed: default challenge length is exactly 12 minutes. */
  var CHALLENGE_MS = 12 * 60 * 1000;
  var CHALLENGE_VO = {
    success: "audio/13_challenge_cheer.m4a",
    fail: "audio/14_challenge_regret.m4a",
  };
  var CHALLENGE_SFX = {
    success: "audio/15_applause.wav",
    fail: "audio/16_crows.wav",
  };
  var CHALLENGE_LINES = {
    success: ["就你叫生词啊？", "我要打十个！", "力微，饭否？"],
    fail: ["就这？", "单词：来打我呀。", "这把给了。"],
  };

  /** Fair pick. Pass roll in [0, 1) to force a line in tests. */
  function pickChallengeLine(kind, roll) {
    var pool = CHALLENGE_LINES[kind];
    if (!pool || !pool.length) return "";
    var r = typeof roll === "number" && isFinite(roll) ? roll : Math.random();
    if (r < 0) r = 0;
    if (r >= 1) r = 0.999999;
    return pool[Math.floor(r * pool.length)];
  }

  function defaultCardProg() {
    return {
      ef: 2.5,
      interval: 0,
      reps: 0,
      lapses: 0,
      due: 0,
      correct: 0,
      wrong: 0,
      mastery: 0,
      state: "new",
    };
  }

  function isNewCard(p) {
    return p.state === "new" || ((p.reps || 0) === 0 && (p.correct || 0) === 0 && (p.wrong || 0) === 0);
  }

  function isLearning(p) {
    return p.state === "learning" || (!isNewCard(p) && (p.interval || 0) < 1 && (p.reps || 0) > 0);
  }

  function isDue(p, now) {
    if (isNewCard(p)) return false;
    return !p.due || p.due <= now;
  }

  /**
   * Anki-lite / SM-2. quality: 0 Again, 1 Good, 2 Easy.
   * interval is in days; due is an absolute timestamp in ms.
   * A miss resets reps. Two Goods after that miss graduate the card to 1 day.
   */
  function schedule(prog, quality, nowMs) {
    var now = nowMs || Date.now();
    if (quality === 0) {
      prog.wrong = (prog.wrong || 0) + 1;
      prog.lapses = (prog.lapses || 0) + 1;
      prog.reps = 0;
      prog.interval = 0;
      prog.state = "learning";
      prog.due = now + LEARN_MS;
      prog.ef = Math.max(1.3, (prog.ef || 2.5) - 0.2);
      prog.mastery = Math.max(0, (prog.mastery || 0) - 1);
      return prog;
    }
    prog.correct = (prog.correct || 0) + 1;
    prog.reps = (prog.reps || 0) + 1;
    var ef = prog.ef || 2.5;

    if (prog.reps === 1) {
      prog.interval = LEARN_MS / DAY_MS;
      prog.state = "learning";
      prog.due = now + LEARN_MS;
    } else if (prog.reps === 2) {
      prog.interval = 1;
      prog.state = "review";
      prog.due = now + 1 * DAY_MS;
    } else if (prog.reps === 3) {
      prog.interval = quality === 2 ? 4 : 3;
      prog.state = "review";
      prog.due = now + prog.interval * DAY_MS;
    } else {
      var next = Math.max(1, Math.round((prog.interval || 1) * ef));
      if (quality === 2) next = Math.max(next + 1, Math.round(next * 1.3));
      prog.interval = next;
      prog.state = "review";
      prog.due = now + prog.interval * DAY_MS;
    }

    if (quality === 2) prog.ef = Math.min(2.8, ef + 0.15);
    else prog.ef = Math.min(2.8, ef + 0.05);

    prog.mastery = Math.min(3, (prog.mastery || 0) + (quality === 2 ? 1 : 0.5));
    if (prog.mastery > 2.9) prog.mastery = 3;
    else if (prog.mastery > 1.9) prog.mastery = Math.max(prog.mastery, 2);
    return prog;
  }

  /** 0 unseen or just missed, 0.5 recalled once since the miss, 1 graduated. */
  function cardCredit(p) {
    if (!p || isNewCard(p)) return 0;
    if (p.state === "review" && (p.interval || 0) >= CLEAR_MIN_INTERVAL_DAYS) return 1;
    if ((p.reps || 0) >= 1) return 0.5;
    return 0;
  }

  function isSolidCard(p) {
    return !!(p && p.state === "review" && (p.interval || 0) >= CLEAR_MIN_INTERVAL_DAYS);
  }

  /** The pre-fix gate. learning === 0 made the 80% bar unreachable whenever any card had been missed. */
  function legacyReady(stats) {
    return !!(stats && stats.total > 0 && stats.neu === 0 && stats.due === 0 && stats.learning === 0 && stats.solid >= stats.need);
  }

  function summarizeSet(progs, now) {
    var list = progs || [];
    var total = list.length;
    var neu = 0;
    var due = 0;
    var learning = 0;
    var solid = 0;
    var credit = 0;
    for (var i = 0; i < list.length; i++) {
      var p = list[i];
      if (!p || isNewCard(p)) {
        neu++;
        continue;
      }
      credit += cardCredit(p);
      if (isDue(p, now)) due++;
      if (isSolidCard(p)) solid++;
      else learning++;
    }
    var need = Math.ceil(total * CLEAR_SOLID_PCT);
    return {
      total: total,
      neu: neu,
      due: due,
      learning: learning,
      solid: solid,
      need: need,
      credit: credit,
      ready: total > 0 && solid >= need,
    };
  }

  /**
   * A set that was not clear at the start ends as soon as the 80% bar is met,
   * even if stragglers are still queued. An already-clear set plays out its
   * short review slice, then ends when that queue is empty.
   */
  function shouldEndSet(state) {
    if (!state || !state.ready) return false;
    if (!state.startedClear) return true;
    return !!(state.queueEmpty && state.requeueEmpty);
  }

  /**
   * active challenge: success if the set is clear (the clock was still running
   * when it flipped), fail once the deadline passes without a clear.
   * A late timer tick after a clear is still a win.
   */
  function evaluateChallenge(state, now) {
    if (!state || !state.active || state.startedClear) return "idle";
    if (state.cleared) return "success";
    if (now >= state.deadline) return "fail";
    return "running";
  }

  function formatChallengeClock(msLeft) {
    var ms = Math.max(0, Number(msLeft) || 0);
    var totalSec = Math.ceil(ms / 1000);
    var m = Math.floor(totalSec / 60);
    var s = totalSec % 60;
    return m + ":" + (s < 10 ? "0" : "") + s;
  }

  return {
    MIN_MS: MIN_MS,
    DAY_MS: DAY_MS,
    LEARN_MS: LEARN_MS,
    CLEAR_SOLID_PCT: CLEAR_SOLID_PCT,
    CLEAR_MIN_INTERVAL_DAYS: CLEAR_MIN_INTERVAL_DAYS,
    CHALLENGE_MS: CHALLENGE_MS,
    CHALLENGE_VO: CHALLENGE_VO,
    CHALLENGE_SFX: CHALLENGE_SFX,
    CHALLENGE_LINES: CHALLENGE_LINES,
    pickChallengeLine: pickChallengeLine,
    defaultCardProg: defaultCardProg,
    isNewCard: isNewCard,
    isLearning: isLearning,
    isDue: isDue,
    schedule: schedule,
    cardCredit: cardCredit,
    isSolidCard: isSolidCard,
    legacyReady: legacyReady,
    summarizeSet: summarizeSet,
    shouldEndSet: shouldEndSet,
    evaluateChallenge: evaluateChallenge,
    formatChallengeClock: formatChallengeClock,
  };
});

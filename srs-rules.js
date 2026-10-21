/* QuizMario spaced-repetition and set-clear rules.
 * Loaded before game.js. Also require()-able from node tests.
 *
 * OLD clearance (kept here only as legacyReady, for tests and the PR note):
 *   new === 0 AND due === 0 AND learning === 0 AND solid >= 80%.
 *   "learning" counted every card that was not yet review with interval >= 1 day,
 *   so learning === 0 already meant 100% solid. One early miss reset that card
 *   (reps = 0, ~10 min learning step) and blocked the whole set until it graduated.
 *
 * NEW clearance (通关):
 *   solid >= ceil(80% of the set). Solid is unchanged: state "review" and
 *   interval >= 1 day, which still takes two correct answers after the last miss.
 *   Leftover new / learning / due cards stay in SRS and are re-asked, but they
 *   do not veto the set. A miss is not free: that card drops out of solid.
 *
 * 已学会 is not 通关. Mastery is one clean recognition on a later calendar day:
 * the card was already scheduled with interval >= 1 day, this is the first
 * answer of that review, the answer is correct, and the answer was not revealed
 * beforehand. Two same-day corrects (including a same-day repair) make the card
 * solid and schedule the next review about a day out. They do not set mastered.
 * 保持率 counts only those cross-day reviews. A mastered card stays in SM-2:
 * the next due moves forward, the card is not removed from review.
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
      unknown: 0,
      mastery: 0,
      mastered: false,
      scheduledAt: 0,
      lastOutcome: "",
      state: "new",
    };
  }

  function isNewCard(p) {
    if (!p) return true;
    // Trust an explicit learning/review state. A「不会」lap resets reps and
    // does not increment wrong, so the old "all counters are zero" fallback
    // would have treated that card as new and dropped it from review.
    if (p.state === "learning" || p.state === "review") return false;
    if (p.state === "new") return true;
    return (p.reps || 0) === 0 && (p.correct || 0) === 0 && (p.wrong || 0) === 0 && !(p.unknown > 0);
  }

  /** Local calendar day, same clock the daily log uses. */
  function calendarDay(ms) {
    var d = new Date(ms);
    if (isNaN(d.getTime())) return "";
    var m = d.getMonth() + 1;
    var day = d.getDate();
    return d.getFullYear() + "-" + (m < 10 ? "0" : "") + m + "-" + (day < 10 ? "0" : "") + day;
  }

  function attemptOutcome(opts, correct) {
    if (opts && opts.outcome) return String(opts.outcome);
    return correct ? "correct" : "wrong";
  }

  /**
   * Cross-day review result, or null when this answer is not a retention event.
   * hit: first answer, correct, hint/answer not already revealed, and the
   * scheduled interval (>= 1 day) was set on an earlier calendar day.
   * miss: that same review was wrong,「不会」, hinted, or not the first answer.
   */
  function retentionVerdict(prog, opts) {
    opts = opts || {};
    var now = opts.now || Date.now();
    if (!prog || isNewCard(prog)) return null;
    if (prog.state !== "review" || (prog.interval || 0) < CLEAR_MIN_INTERVAL_DAYS) return null;
    var scheduled = prog.scheduledAt || 0;
    if (!scheduled || calendarDay(scheduled) === calendarDay(now)) return null;
    var outcome = attemptOutcome(opts, !!opts.correct);
    var clean = outcome === "correct" && opts.correct !== false && opts.firstTry !== false && !opts.hintSeen;
    return clean ? "hit" : "miss";
  }

  /** Fold one answer into a daily bucket.「不会」increments unk, not w. */
  function applyDailyAnswer(day, prog, opts) {
    opts = opts || {};
    if (!day || typeof day !== "object") day = {};
    if (day.c == null) day.c = 0;
    if (day.w == null) day.w = 0;
    if (day.rc == null) day.rc = 0;
    if (day.rw == null) day.rw = 0;
    if (day.n == null) day.n = 0;
    if (day.unk == null) day.unk = 0;
    var outcome = attemptOutcome(opts, !!opts.correct);
    if (outcome === "unknown") day.unk += 1;
    else if (outcome === "correct") day.c += 1;
    else day.w += 1;
    if (prog && isNewCard(prog)) day.n += 1;
    var verdict = retentionVerdict(prog, opts);
    if (verdict === "hit") day.rc += 1;
    else if (verdict === "miss") day.rw += 1;
    return { day: day, verdict: verdict, outcome: outcome };
  }

  /**
   * Old saves have no mastered flag. A full star bar on a real review interval
   * stays 已学会. Merely being in review (two same-day corrects) does not.
   * scheduledAt is reconstructed from due so a same-day reload cannot pretend
   * the interval already elapsed.
   */
  function noteLegacyMastery(prog) {
    if (!prog || typeof prog !== "object") return prog;
    if (prog.unknown == null) prog.unknown = 0;
    var hasMastered = Object.prototype.hasOwnProperty.call(prog, "mastered") && prog.mastered != null;
    if (!hasMastered) {
      prog.mastered = !!(prog.state === "review" && (prog.interval || 0) >= CLEAR_MIN_INTERVAL_DAYS && (prog.mastery || 0) >= 3);
    }
    if (!prog.scheduledAt && prog.due && prog.state === "review" && (prog.interval || 0) >= CLEAR_MIN_INTERVAL_DAYS) {
      prog.scheduledAt = prog.due - (prog.interval * DAY_MS);
    }
    if (prog.scheduledAt == null) prog.scheduledAt = 0;
    return prog;
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
   * A miss resets reps. Two Goods after that miss make the card solid
   * (interval 1 day) and schedule the cross-day review. That is 通关 credit,
   * not 已学会. opts.outcome "unknown" is「不会」: it lapses like Again but
   * does not increment wrong. opts.hintSeen / opts.firstTry gate mastery.
   */
  function schedule(prog, quality, nowMs, opts) {
    opts = opts || {};
    var now = nowMs || Date.now();
    if (prog.mastered == null) prog.mastered = false;
    if (prog.unknown == null) prog.unknown = 0;
    if (prog.scheduledAt == null) prog.scheduledAt = 0;
    var outcome = attemptOutcome(opts, quality > 0);
    var verdict = retentionVerdict(prog, Object.assign({}, opts, {
      now: now,
      correct: quality > 0,
      outcome: outcome,
    }));
    prog.lastOutcome = outcome;
    if (quality === 0) {
      if (outcome === "unknown") prog.unknown = (prog.unknown || 0) + 1;
      else prog.wrong = (prog.wrong || 0) + 1;
      prog.lapses = (prog.lapses || 0) + 1;
      prog.reps = 0;
      prog.interval = 0;
      prog.state = "learning";
      prog.due = now + LEARN_MS;
      prog.ef = Math.max(1.3, (prog.ef || 2.5) - 0.2);
      prog.mastery = Math.max(0, (prog.mastery || 0) - 1);
      prog.mastered = false;
      prog.scheduledAt = now;
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
    if (verdict === "hit") {
      prog.mastered = true;
      prog.mastery = 3;
    } else if (verdict === "miss") {
      prog.mastered = false;
      if (prog.mastery > 2) prog.mastery = 2;
    } else if (!prog.mastered && prog.mastery > 2) {
      prog.mastery = 2;
    }
    prog.scheduledAt = now;
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

  /** 已学会. Cross-day recognition only. Solid / 通关 credit is isSolidCard. */
  function isMasteredCard(p) {
    return !!(p && p.mastered && isSolidCard(p));
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
    calendarDay: calendarDay,
    retentionVerdict: retentionVerdict,
    applyDailyAnswer: applyDailyAnswer,
    noteLegacyMastery: noteLegacyMastery,
    schedule: schedule,
    cardCredit: cardCredit,
    isSolidCard: isSolidCard,
    isMasteredCard: isMasteredCard,
    legacyReady: legacyReady,
    summarizeSet: summarizeSet,
    shouldEndSet: shouldEndSet,
    evaluateChallenge: evaluateChallenge,
    formatChallengeClock: formatChallengeClock,
  };
});

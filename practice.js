/* Study vs challenge, meaning vs spelling, and how many new words to introduce.
 * Loaded before game.js. Also require()-able from node tests.
 *
 * 通关 still comes from srs-rules.js (solid = review and interval >= 1 day).
 * Only meaning practice (看英文选中文) and 今日必练 (到期 + 错词本, 看中文选英文)
 * call schedule(). 拼写 is a separate record and cannot block a set.
 *
 * Q1 / Grok版本: 拼写 is typed input. Old multiple-choice spelling scores
 * live under spelling.mc and never count as independent spelling mastery.
 *
 * Regular study has no clock. 12分钟挑战 is the only mode that starts one.
 * Beginners get a small new-word batch. A heavy due pile shrinks that batch.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.QuizMarioPractice = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  var STUDY_NEW = 12;
  var BEGINNER_NEW = 4;
  var BEGINNER_SEEN_LIMIT = 20;

  function isBeginner(seen) {
    return (Number(seen) || 0) < BEGINNER_SEEN_LIMIT;
  }

  /**
   * How many new cards to add after the due pile.
   * dueCount is the number of due reviews already in this session's set.
   * mode "spelling" is always a small batch.
   */
  function newWordBudget(opts) {
    opts = opts || {};
    var due = Math.max(0, Number(opts.dueCount) || 0);
    var beginner = !!opts.beginner;
    var cap = beginner ? BEGINNER_NEW : STUDY_NEW;
    if (opts.mode === "spelling") cap = Math.min(cap, BEGINNER_NEW);
    var budget = cap;
    if (due >= 16) budget = 0;
    else if (due >= 10) budget = Math.min(budget, 1);
    else if (due >= 6) budget = Math.min(budget, 3);
    if (beginner && due >= 3) budget = Math.min(budget, 2);
    if (opts.newAvailable != null) budget = Math.min(budget, Math.max(0, Number(opts.newAvailable) || 0));
    return budget;
  }

  function usesChallengeClock(mode) {
    return mode === "challenge";
  }

  /** 拼写 does not move the SM-2 card that 通关 reads. */
  function affectsClearance(sessionKind) {
    return sessionKind !== "spelling";
  }

  function blankBucket() {
    return { correct: 0, wrong: 0, unknown: 0, streak: 0, best: 0, lastAt: 0 };
  }

  function blankSpelling() {
    return {
      correct: 0,
      wrong: 0,
      unknown: 0,
      streak: 0,
      best: 0,
      lastAt: 0,
      typed: blankBucket(),
      mc: blankBucket(),
      _legacyMcMigrated: true,
      lastMode: null,
    };
  }

  function bucketTotals(b) {
    if (!b || typeof b !== "object") return 0;
    return (b.correct || 0) + (b.wrong || 0) + (b.unknown || 0);
  }

  /**
   * Shape spelling progress. Pre-Q1 top-level correct/wrong/unknown came from
   * MC spelling and must move into .mc so they never read as independent typed mastery.
   */
  function ensureSpellingShape(s) {
    if (!s || typeof s !== "object") return blankSpelling();
    if (!s.typed || typeof s.typed !== "object") s.typed = blankBucket();
    if (!s.mc || typeof s.mc !== "object") s.mc = blankBucket();
    if (!s._legacyMcMigrated) {
      var topHas = (s.correct || 0) + (s.wrong || 0) + (s.unknown || 0) > 0;
      var typedHas = bucketTotals(s.typed) > 0;
      var mcHas = bucketTotals(s.mc) > 0;
      if (topHas && !typedHas && !mcHas) {
        s.mc.correct = s.correct || 0;
        s.mc.wrong = s.wrong || 0;
        s.mc.unknown = s.unknown || 0;
        s.mc.streak = s.streak || 0;
        s.mc.best = s.best || 0;
        s.mc.lastAt = s.lastAt || 0;
        s.correct = 0;
        s.wrong = 0;
        s.unknown = 0;
        s.streak = 0;
        s.best = 0;
      }
      s._legacyMcMigrated = true;
    }
    if (s.unknown == null) s.unknown = 0;
    if (s.typed.unknown == null) s.typed.unknown = 0;
    if (s.mc.unknown == null) s.mc.unknown = 0;
    return s;
  }

  function signalFromBucket(b) {
    if (!b) return "未练";
    var correct = b.correct || 0;
    var wrong = b.wrong || 0;
    if (correct + wrong === 0) return "未练";
    if ((b.streak || 0) >= 2 && correct > wrong) return "稳定";
    if (wrong > correct) return "不稳";
    return "在练";
  }

  /** Independent spelling signal — typed only. MC history never yields 稳定. */
  function spellingSignal(s) {
    if (!s) return "未练";
    var shaped = ensureSpellingShape(s);
    return signalFromBucket(shaped.typed);
  }

  function mcSpellingSignal(s) {
    if (!s) return "未练";
    var shaped = ensureSpellingShape(s);
    return signalFromBucket(shaped.mc);
  }

  function isIndependentSpelling(s) {
    return spellingSignal(s) === "稳定";
  }

  function applyOutcome(bucket, outcome, now) {
    if (outcome === "correct") {
      bucket.correct = (bucket.correct || 0) + 1;
      bucket.streak = (bucket.streak || 0) + 1;
      if (bucket.streak > (bucket.best || 0)) bucket.best = bucket.streak;
    } else if (outcome === "unknown") {
      bucket.unknown = (bucket.unknown || 0) + 1;
      bucket.streak = 0;
    } else {
      bucket.wrong = (bucket.wrong || 0) + 1;
      bucket.streak = 0;
    }
    bucket.lastAt = now || Date.now();
  }

  function syncTopFromTyped(s) {
    var t = s.typed;
    s.correct = t.correct || 0;
    s.wrong = t.wrong || 0;
    s.unknown = t.unknown || 0;
    s.streak = t.streak || 0;
    s.best = t.best || 0;
    s.lastAt = t.lastAt || 0;
  }

  /**
   * Record one spelling attempt on the card. Does not read or write
   * state, interval, reps, wrong, mastery, or due.
   * outcome: "correct" | "wrong" | "unknown" (不会).
   * opts.mode: "typed" (default, Q1) | "mc" (legacy / never independent).
   */
  function noteSpelling(prog, outcome, now, opts) {
    if (!prog || typeof prog !== "object") return { spelling: null, signal: "未练", mode: null, independent: false };
    opts = opts || {};
    var mode = opts.mode === "mc" ? "mc" : "typed";
    if (!prog.spelling || typeof prog.spelling !== "object") prog.spelling = blankSpelling();
    var s = ensureSpellingShape(prog.spelling);
    prog.spelling = s;
    var bucket = mode === "mc" ? s.mc : s.typed;
    applyOutcome(bucket, outcome, now);
    s.lastMode = mode;
    s.lastAt = now || Date.now();
    if (mode === "typed") syncTopFromTyped(s);
    var signal = spellingSignal(s);
    return {
      spelling: s,
      signal: signal,
      mode: mode,
      independent: signal === "稳定",
      mcSignal: mcSpellingSignal(s),
    };
  }

  /** Any spelling practice (typed or legacy MC) — used for "has seen this card". */
  function hasSpellingPractice(s) {
    if (!s) return false;
    var shaped = ensureSpellingShape(s);
    return bucketTotals(shaped.typed) > 0 || bucketTotals(shaped.mc) > 0 ||
      (shaped.correct || 0) + (shaped.wrong || 0) + (shaped.unknown || 0) > 0;
  }

  return {
    STUDY_NEW: STUDY_NEW,
    BEGINNER_NEW: BEGINNER_NEW,
    BEGINNER_SEEN_LIMIT: BEGINNER_SEEN_LIMIT,
    isBeginner: isBeginner,
    newWordBudget: newWordBudget,
    usesChallengeClock: usesChallengeClock,
    affectsClearance: affectsClearance,
    blankSpelling: blankSpelling,
    blankBucket: blankBucket,
    ensureSpellingShape: ensureSpellingShape,
    spellingSignal: spellingSignal,
    mcSpellingSignal: mcSpellingSignal,
    isIndependentSpelling: isIndependentSpelling,
    noteSpelling: noteSpelling,
    hasSpellingPractice: hasSpellingPractice,
  };
});

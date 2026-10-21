/* Study vs challenge, meaning vs spelling, and how many new words to introduce.
 * Loaded before game.js. Also require()-able from node tests.
 *
 * 通关 still comes from srs-rules.js (solid = review and interval >= 1 day).
 * Only meaning practice (看英文选中文) and the existing 今日到期 / 错词本
 * reviews call schedule(). 拼写 is a separate record and cannot block a set.
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

  function blankSpelling() {
    return { correct: 0, wrong: 0, unknown: 0, streak: 0, best: 0, lastAt: 0 };
  }

  function spellingSignal(s) {
    if (!s) return "未练";
    var correct = s.correct || 0;
    var wrong = s.wrong || 0;
    if (correct + wrong === 0) return "未练";
    if ((s.streak || 0) >= 2 && correct > wrong) return "稳定";
    if (wrong > correct) return "不稳";
    return "在练";
  }

  /**
   * Record one spelling attempt on the card. Does not read or write
   * state, interval, reps, wrong, mastery, or due.
   * outcome: "correct" | "wrong" | "unknown" (不会).
   */
  function noteSpelling(prog, outcome, now) {
    if (!prog || typeof prog !== "object") return { spelling: null, signal: "未练" };
    if (!prog.spelling || typeof prog.spelling !== "object") prog.spelling = blankSpelling();
    var s = prog.spelling;
    if (s.unknown == null) s.unknown = 0;
    if (outcome === "correct") {
      s.correct = (s.correct || 0) + 1;
      s.streak = (s.streak || 0) + 1;
      if (s.streak > (s.best || 0)) s.best = s.streak;
    } else if (outcome === "unknown") {
      s.unknown = (s.unknown || 0) + 1;
      s.streak = 0;
    } else {
      s.wrong = (s.wrong || 0) + 1;
      s.streak = 0;
    }
    s.lastAt = now || Date.now();
    return { spelling: s, signal: spellingSignal(s) };
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
    spellingSignal: spellingSignal,
    noteSpelling: noteSpelling,
  };
});

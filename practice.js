/* Study vs challenge, meaning vs form vs spelling, and how many new words to introduce.
 * Loaded before game.js. Also require()-able from node tests.
 *
 * 通关 still comes from srs-rules.js (solid = review and interval >= 1 day).
 * Only meaning practice (看英文选中文) and 今日必练 (到期 + 错词本, 看中文选英文)
 * call schedule(). 拼写 is a separate record and cannot block a set.
 *
 * Q2 / Grok版本 / 聚光单词（grok）: 义项与练习方向分开。
 *   en_zh  — 英文→词义 (recognition)
 *   zh_en  — 中文→英文识别 (form MC)
 *   spelling — 独立拼写 (never merged into recognition / form tallies)
 * Per-card directions live on prog.directions; session tallies on save.practice.
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

  /** Canonical direction keys (Q2). */
  var DIR_EN_ZH = "en_zh";
  var DIR_ZH_EN = "zh_en";
  var DIR_SPELLING = "spelling";

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
    return blankBucket();
  }

  function blankDirections() {
    return {
      en_zh: blankBucket(),
      zh_en: blankBucket(),
    };
  }

  /**
   * Map session / event direction aliases → canonical Q2 keys.
   * meaning / en-zh / recognition → en_zh
   * form / zh-en → zh_en
   * spelling / typed → spelling
   */
  function normalizeDirectionKey(raw) {
    if (raw == null) return "";
    var v = String(raw).trim().toLowerCase();
    if (v === "en_zh" || v === "en-zh" || v === "meaning" || v === "recognition") return DIR_EN_ZH;
    if (v === "zh_en" || v === "zh-en" || v === "form" || v === "form_recognition") return DIR_ZH_EN;
    if (v === "spelling" || v === "typed" || v === "typed_spelling") return DIR_SPELLING;
    return "";
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

  function spellingSignal(s) {
    if (!s) return "未练";
    return signalFromBucket(s);
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

  function ensureDirections(prog) {
    if (!prog || typeof prog !== "object") return blankDirections();
    if (!prog.directions || typeof prog.directions !== "object") prog.directions = blankDirections();
    if (!prog.directions.en_zh || typeof prog.directions.en_zh !== "object") {
      prog.directions.en_zh = blankBucket();
    }
    if (!prog.directions.zh_en || typeof prog.directions.zh_en !== "object") {
      prog.directions.zh_en = blankBucket();
    }
    if (prog.directions.en_zh.unknown == null) prog.directions.en_zh.unknown = 0;
    if (prog.directions.zh_en.unknown == null) prog.directions.zh_en.unknown = 0;
    return prog.directions;
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
    applyOutcome(s, outcome, now);
    return { spelling: s, signal: spellingSignal(s) };
  }

  /**
   * Record one attempt on a practice direction for this sense/card.
   * Spelling still writes prog.spelling (clearance-safe); recognition
   * directions write prog.directions.en_zh / .zh_en and never touch each other.
   */
  function noteDirection(prog, direction, outcome, now) {
    var key = normalizeDirectionKey(direction);
    if (!prog || typeof prog !== "object" || !key) {
      return { key: null, directions: null, spelling: null, signal: "未练" };
    }
    if (key === DIR_SPELLING) {
      var spelled = noteSpelling(prog, outcome, now);
      return {
        key: key,
        directions: ensureDirections(prog),
        spelling: spelled.spelling,
        signal: spelled.signal,
      };
    }
    var dirs = ensureDirections(prog);
    var bucket = dirs[key];
    applyOutcome(bucket, outcome, now);
    return {
      key: key,
      directions: dirs,
      spelling: prog.spelling || null,
      signal: signalFromBucket(bucket),
    };
  }

  function directionSignal(prog, direction) {
    var key = normalizeDirectionKey(direction);
    if (!key) return "未练";
    if (key === DIR_SPELLING) {
      return spellingSignal(prog && prog.spelling);
    }
    if (!prog || !prog.directions) return "未练";
    var dirs = ensureDirections(prog);
    return signalFromBucket(dirs[key]);
  }

  /** Session practice bucket name for save.practice (radar / home stats). */
  function sessionPracticeBucket(direction) {
    var key = normalizeDirectionKey(direction);
    if (key === DIR_EN_ZH) return "meaning";
    if (key === DIR_ZH_EN) return "form";
    if (key === DIR_SPELLING) return "spelling";
    return "";
  }

  function blankSessionPractice() {
    return {
      meaning: { n: 0, good: 0 },
      form: { n: 0, good: 0 },
      spelling: { n: 0, good: 0 },
      hint: { n: 0, good: 0 },
    };
  }

  /** Normalize save.practice so form exists alongside meaning / spelling. */
  function ensureSessionPractice(practice) {
    var src = practice && typeof practice === "object" ? practice : {};
    return {
      meaning: Object.assign({ n: 0, good: 0 }, src.meaning || {}),
      form: Object.assign({ n: 0, good: 0 }, src.form || {}),
      spelling: Object.assign({ n: 0, good: 0 }, src.spelling || {}),
      hint: Object.assign({ n: 0, good: 0 }, src.hint || {}),
    };
  }

  return {
    STUDY_NEW: STUDY_NEW,
    BEGINNER_NEW: BEGINNER_NEW,
    BEGINNER_SEEN_LIMIT: BEGINNER_SEEN_LIMIT,
    DIR_EN_ZH: DIR_EN_ZH,
    DIR_ZH_EN: DIR_ZH_EN,
    DIR_SPELLING: DIR_SPELLING,
    isBeginner: isBeginner,
    newWordBudget: newWordBudget,
    usesChallengeClock: usesChallengeClock,
    affectsClearance: affectsClearance,
    blankSpelling: blankSpelling,
    blankBucket: blankBucket,
    blankDirections: blankDirections,
    blankSessionPractice: blankSessionPractice,
    ensureSessionPractice: ensureSessionPractice,
    ensureDirections: ensureDirections,
    normalizeDirectionKey: normalizeDirectionKey,
    sessionPracticeBucket: sessionPracticeBucket,
    spellingSignal: spellingSignal,
    directionSignal: directionSignal,
    noteSpelling: noteSpelling,
    noteDirection: noteDirection,
  };
});

/* Once-per-day in-app tip for 今日必练.
 * Loaded before game.js. Also require()-able from node tests.
 *
 * Not a push notification or a second modal. The soft gate in review-queues.js
 * still asks first. This tip is the later, compact reminder:
 *   signed in, student home just opened, combined count >= 1,
 *   today's gate row was already dismissed (稍后), and the soft gate
 *   is not on screen. A later visit the same day still qualifies until
 *   this device has shown the tip.
 * The local flag is { day, shown }, the same calendar-day shape as the
 * soft gate's { day, started, dismissed }. A new day clears shown.
 * Starting 今日必练 from the gate (开始) does not raise the tip.
 * Omitting enteringHome stays hidden, so a refresh that is not a home
 * entry cannot cover the exam picker.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.QuizMarioPracticeReminder = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  var STORAGE_KEY = "vocabSpotlight_mustRemind_v1";

  function freshPracticeReminder(record, day) {
    var row = record && typeof record === "object" ? record : {};
    var today = String(day || "");
    if (row.day !== today) return { day: today, shown: false };
    return { day: today, shown: !!row.shown };
  }

  function markPracticeReminder(record, day) {
    var next = freshPracticeReminder(record, day);
    next.shown = true;
    return next;
  }

  /**
   * opts.signedIn / opts.onHome / opts.enteringHome gate the tip.
   * enteringHome is true only when the student home is being opened,
   * not on the 稍后 paint itself.
   * opts.dismissed is today's soft-gate row (freshDailyGate), not a
   * previous day.
   * opts.softGateVisible skips the tip while the gate is up.
   * opts.reminder is the local { day, shown } flag.
   */
  function shouldShowPracticeReminder(opts) {
    opts = opts || {};
    if (!opts.signedIn) return false;
    if (!opts.onHome) return false;
    if (!opts.enteringHome) return false;
    if ((Number(opts.count) || 0) < 1) return false;
    if (opts.softGateVisible) return false;
    if (!opts.dismissed) return false;
    var flag = freshPracticeReminder(opts.reminder, opts.day);
    if (flag.shown) return false;
    return true;
  }

  function practiceReminderLine(count) {
    var n = Math.floor(Number(count));
    if (!isFinite(n) || n < 0) n = 0;
    return "今天还有 " + n + " 道今日必练";
  }

  return {
    STORAGE_KEY: STORAGE_KEY,
    freshPracticeReminder: freshPracticeReminder,
    markPracticeReminder: markPracticeReminder,
    shouldShowPracticeReminder: shouldShowPracticeReminder,
    practiceReminderLine: practiceReminderLine,
  };
});

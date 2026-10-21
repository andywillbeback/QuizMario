/* Signed-in home progress story (进度叙事).
 * Loaded before game.js. Also require()-able from node tests.
 *
 * One to three calm sentences from state the app already keeps:
 *   今日必练 remaining / cleared  — review-queues count + today's gate
 *   sets advanced / where they are — 通关 count and the frontier group
 *   placement done                 — save.placement for this track
 *   top miss                       — error-types lead bucket, if any
 * No new store and no new backend. Hidden off the student home and
 * when the student is not signed in, so the exam picker stays clear.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.QuizMarioProgressNarrative = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  var MISS_LINE = {
    form: "最近错过的，主要是形近。",
    sense: "最近错过的，主要是义近。",
    pos: "最近错过的，主要是词性。",
    other: "最近错过的，还没归进形近、义近或词性。",
  };
  var MAX_LINES = 3;

  function whole(value, fallback) {
    var n = Math.floor(Number(value));
    if (!isFinite(n)) return fallback;
    return n;
  }

  /**
   * opts.signedIn / opts.onHome gate the block.
   * opts.mustCount is how many 今日必练 cards are left.
   * opts.mustStarted is today's gate row (开始), not 稍后.
   * opts.frontier is the 1-based set 继续闯关 would open.
   * opts.setsCleared is how many sets on this track already 通关.
   * opts.placement is the current track's placement row, or null.
   * opts.topMiss is form / sense / pos / other, or empty.
   */
  function todayNarrative(opts) {
    opts = opts || {};
    var hidden = { visible: false, lines: [] };
    if (!opts.signedIn || !opts.onHome) return hidden;

    var lines = [];
    var left = whole(opts.mustCount, 0);
    if (left < 0) left = 0;
    if (left > 0) lines.push("今日必练还剩 " + left + " 道。");
    else if (opts.mustStarted) lines.push("今日必练已经清完。");
    else lines.push("今天没有必练。");

    var frontier = whole(opts.frontier, 1);
    if (frontier < 1) frontier = 1;
    var cleared = whole(opts.setsCleared, 0);
    if (cleared < 0) cleared = 0;
    var placement = opts.placement && opts.placement.done ? opts.placement : null;
    var placementSet = 0;
    if (placement) {
      placementSet = whole(placement.set, 1);
      if (placementSet < 1) placementSet = 1;
    }

    var extras = [];
    if (cleared > 0) {
      extras.push("已经通关 " + cleared + " 组，现在在第 " + frontier + " 组。");
    } else if (frontier > 1 && frontier !== placementSet) {
      extras.push("现在在第 " + frontier + " 组。");
    }
    if (placement) extras.push("摸底做完了，从第 " + placementSet + " 组开始。");
    var miss = MISS_LINE[opts.topMiss] || "";
    if (miss) extras.push(miss);
    for (var i = 0; i < extras.length && lines.length < MAX_LINES; i++) lines.push(extras[i]);

    return { visible: lines.length > 0, lines: lines };
  }

  return {
    MAX_LINES: MAX_LINES,
    todayNarrative: todayNarrative,
  };
});

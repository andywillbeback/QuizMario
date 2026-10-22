/* Signed-in home loop strip and the 今日必练 clear-screen next step.
 * Loaded before game.js. Also require()-able from node tests.
 *
 * ALS 补了 X / 回流词 Y is not computable here. learner-events.js only
 * keeps source=quizmario rows (the Supabase pull filters on that source),
 * and those rows are QuizMario signals, not ALS outcomes. Do not substitute
 * the wrong book, the due queue, or the 今日必练 count for X/Y.
 *
 * TODO: when source=als rows are readable on the client and their
 * event_type mapping is known, alsReturnCounts() should return
 * { filled, returned } and homeLoopStrip will switch to
 * 「ALS 补了 X / 回流词 Y」. Until then it stays null and the strip
 * says 「薄弱点 → 今日必练」.
 *
 * There is still no public ALS site. ALS_GRAMMAR_HREF opens the
 * Mac-local Streamlit practice app at http://127.0.0.1:8501/.
 * The link only works when ALS is already running on the student's Mac.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.QuizMarioHomeLoop = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  var ALS_GRAMMAR_HREF = "http://127.0.0.1:8501/";

  /** Always null until real ALS rows can be mapped. See the file comment. */
  function alsReturnCounts(events) {
    var list = events || [];
    for (var i = 0; i < list.length; i++) {
      var ev = list[i];
      if (ev && ev.source === "als") {
        // Present, but the event_type → (filled, returned) map is not defined.
        // Counting them would invent X/Y.
        return null;
      }
    }
    return null;
  }

  function readyAlsCounts(als) {
    if (!als || typeof als !== "object") return null;
    if (typeof als.filled !== "number" || !isFinite(als.filled)) return null;
    if (typeof als.returned !== "number" || !isFinite(als.returned)) return null;
    return {
      filled: Math.max(0, Math.floor(als.filled)),
      returned: Math.max(0, Math.floor(als.returned)),
    };
  }

  /**
   * Visible only on the signed-in student home.
   * action "must" opens 今日必练; "continue" opens the frontier set.
   */
  function homeLoopStrip(opts) {
    opts = opts || {};
    var count = Math.max(0, Math.floor(Number(opts.mustCount) || 0));
    var visible = !!(opts.signedIn && opts.onHome);
    var action = count > 0 ? "must" : "continue";
    if (!visible) {
      return {
        visible: false,
        mode: "hidden",
        text: "",
        detail: "",
        action: action,
        count: count,
      };
    }
    var als = readyAlsCounts(opts.als);
    var detail = count > 0
      ? ("今日必练 " + count + " 道")
      : "今日必练 0 道，继续闯关";
    if (als) {
      return {
        visible: true,
        mode: "als",
        text: "ALS 补了 " + als.filled + " / 回流词 " + als.returned,
        detail: detail,
        action: action,
        count: count,
      };
    }
    return {
      visible: true,
      mode: "weak",
      text: "薄弱点 → 今日必练",
      detail: detail,
      action: action,
      count: count,
    };
  }

  /** 1-based frontier group: the set 继续闯关 opens for this track. */
  function frontierGroup(unlockedLevel, levelCount) {
    var n = Math.max(1, Math.floor(Number(unlockedLevel) || 1));
    var total = Math.floor(Number(levelCount) || 0);
    if (total >= 1 && n > total) n = total;
    return n;
  }

  function wholeCount(value) {
    var n = Math.floor(Number(value));
    if (!isFinite(n) || n < 0) return 0;
    return n;
  }

  /**
   * Next step after a finished queue. The frontier CTA and the ALS
   * grammar link are relevant only when sessionKind is "must"
   * (今日必练 clear). Other clears keep their own buttons.
   * opts.left is today's must queue (due + wrong book), not how many
   * cards this sitting still had on screen. 「练完了」 is only for an
   * empty queue. A round can end while a card is still due later today
   * (rescheduled about 10 minutes out, or still in 错词本).
   */
  function clearNextActions(opts) {
    opts = opts || {};
    var empty = {
      showFrontier: false,
      showAls: false,
      alsRelevant: false,
      frontier: 0,
      left: 0,
      title: "",
      primaryLabel: "",
      alsLabel: "",
      alsHref: "",
      nextLine: "",
      detail: "",
      message: "",
    };
    if (opts.kind !== "must") return empty;
    var n = frontierGroup(opts.unlockedLevel, opts.levelCount);
    var left = wholeCount(opts.left);
    var cleared = left === 0;
    var nextLine = cleared
      ? ("练完了，然后继续闯关第 " + n + " 组。")
      : ("这轮做完了，今天还剩 " + left + " 道，稍后还会再出现。");
    var detail = cleared
      ? "这批到期的词都见过了。错词本里连续答对两次的已经离开。"
      : "到期的按记忆曲线再出现，错词本里的要连续答对两次才离开。";
    return {
      showFrontier: true,
      showAls: true,
      alsRelevant: true,
      frontier: n,
      left: left,
      title: cleared ? "今日必练清空了" : "这轮先到这里",
      primaryLabel: "继续闯关第 " + n + " 组",
      alsLabel: "去 ALS 修语法",
      alsHref: ALS_GRAMMAR_HREF,
      nextLine: nextLine,
      detail: detail,
      message: nextLine + detail,
    };
  }

  return {
    ALS_GRAMMAR_HREF: ALS_GRAMMAR_HREF,
    alsReturnCounts: alsReturnCounts,
    homeLoopStrip: homeLoopStrip,
    frontierGroup: frontierGroup,
    clearNextActions: clearNextActions,
  };
});

/* Kill-streak voice schedule for 聚光单词.
 * Loaded before game.js. Also require()-able from node tests.
 *
 * Legendary VO and the legendary sting fire at streak 8, then every +4
 * (8, 12, 16, 20, …). Counts in between (9–11, 13–15, …) are a banner only.
 * Streaks 1–8 keep the early ladder the caller passes in.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.QuizMarioStreak = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  var LEGENDARY_AT = 8;
  var LEGENDARY_EVERY = 4;

  function shouldSpeakLegendary(n) {
    return typeof n === "number" && n >= LEGENDARY_AT && ((n - LEGENDARY_AT) % LEGENDARY_EVERY) === 0;
  }

  /** Spoken callout. 1–8 stay on today's ladder; later only the legendary cadence. */
  function shouldAnnounceSpree(n) {
    return (typeof n === "number" && n >= 1 && n <= LEGENDARY_AT) || shouldSpeakLegendary(n);
  }

  function spreeAt(spreeLines, n) {
    if (!spreeLines) return null;
    for (var i = 0; i < spreeLines.length; i++) {
      if (spreeLines[i] && spreeLines[i].at === n) return spreeLines[i];
    }
    return null;
  }

  /**
   * What announceKillStreak should show and play.
   * speak/sting false with text set is the quiet legendary banner.
   */
  function killStreakPlan(n, killLines, spreeLines) {
    var say = "";
    if (killLines && killLines[n]) say = killLines[n];
    var legendary = shouldSpeakLegendary(n);
    var spree = spreeAt(spreeLines, n);
    if (!spree && legendary) spree = { text: "Legendary" };
    if (spree && spree.text !== say) {
      say = say ? say + ". " + spree.text : spree.text;
    }
    if (!say && legendary) say = "Legendary";
    if (say && shouldAnnounceSpree(n)) {
      return { text: say, speak: true, sting: legendary };
    }
    if (typeof n === "number" && n > LEGENDARY_AT) {
      return { text: "LEGENDARY", speak: false, sting: false };
    }
    return { text: "", speak: false, sting: false };
  }

  return {
    shouldSpeakLegendary: shouldSpeakLegendary,
    shouldAnnounceSpree: shouldAnnounceSpree,
    killStreakPlan: killStreakPlan,
  };
});

/* Concrete post-answer feedback, plus a radar only when every axis has evidence.
 * Loaded before game.js. Also require()-able from node tests.
 *
 * Each answer can name the word, the direction of the error, whether the
 * student depended on a revealed answer, and when the next review is due.
 * The radar needs real counts on 词义, 拼写, 保持率, and 独立回忆. If any
 * axis is still thin, radarFromEvidence returns null and the page omits it.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.QuizMarioFeedback = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  var RADAR_MIN = 8;

  function directionLabel(direction) {
    if (direction === "meaning") return "看英文选中文";
    if (direction === "spelling") return "看中文键入英文";
    return "看中文选英文";
  }

  function hintLine(outcome, hintSeen) {
    if (outcome === "unknown" || hintSeen) return "提示：依赖提示（已经看过答案，不算独立回忆）";
    return "提示：没有依赖提示";
  }

  /**
   * attempt:
   *   word, meaning, direction ("meaning" | "spelling" | "form"),
   *   outcome ("correct" | "wrong" | "unknown"), picked, hintSeen,
   *   dueLabel, spellingSignal, recentWrongs (array of headwords)
   */
  function describeAttempt(attempt) {
    var a = attempt || {};
    var direction = a.direction === "meaning" ? "meaning" : (a.direction === "spelling" ? "spelling" : "form");
    var outcome = a.outcome || "wrong";
    var word = a.word || "";
    var meaning = a.meaning || "";
    var picked = a.picked || "";
    var dirLabel = directionLabel(direction);
    var lines = [];
    if (outcome === "wrong" || outcome === "unknown") lines.push("错词：" + word);
    else lines.push("词：" + word);

    if (outcome === "unknown") {
      lines.push("错向：" + dirLabel + " · 点了「不会」，没有选");
    } else if (outcome === "wrong") {
      if (direction === "meaning") {
        lines.push("错向：" + dirLabel + " · 选了「" + (picked || "（空）") + "」，应是「" + meaning + "」");
      } else if (direction === "spelling") {
        lines.push("错向：" + dirLabel + " · 输入了「" + (picked || "（空）") + "」，应是「" + word + "」");
      } else {
        lines.push("错向：" + dirLabel + " · 选了「" + (picked || "（空）") + "」，应是「" + word + "」");
      }
    } else {
      lines.push("方向：" + dirLabel);
    }

    lines.push(hintLine(outcome, !!a.hintSeen));

    if (direction === "spelling") {
      lines.push("拼写(键入)：" + (a.spellingSignal || "在练") + " · 不计入通关 · 旧选择不算独立");
      lines.push("下次复习：词义进度未改");
    } else {
      lines.push("下次复习：" + (a.dueLabel || "待定"));
    }

    var recent = Array.isArray(a.recentWrongs) ? a.recentWrongs.filter(Boolean) : [];
    if (recent.length) lines.push("本轮错词：" + recent.join("、"));

    return {
      word: word,
      direction: direction,
      outcome: outcome,
      lines: lines,
      spellingBlocksClearance: false,
    };
  }

  function bucket(raw) {
    var n = raw && raw.n ? Number(raw.n) : 0;
    var good = raw && raw.good ? Number(raw.good) : 0;
    if (!isFinite(n) || n < 0) n = 0;
    if (!isFinite(good) || good < 0) good = 0;
    return { n: n, good: good, value: n ? good / n : 0 };
  }

  /**
   * evidence: { meaning, spelling, retention, hint } each { n, good }.
   * Returns null unless every axis has at least RADAR_MIN real attempts.
   */
  function radarFromEvidence(evidence) {
    var ev = evidence || {};
    var axes = [
      Object.assign({ id: "meaning", label: "词义" }, bucket(ev.meaning)),
      Object.assign({ id: "spelling", label: "拼写" }, bucket(ev.spelling)),
      Object.assign({ id: "retention", label: "保持率" }, bucket(ev.retention)),
      Object.assign({ id: "hint", label: "独立回忆" }, bucket(ev.hint)),
    ];
    for (var i = 0; i < axes.length; i++) {
      if (axes[i].n < RADAR_MIN) return null;
    }
    return axes;
  }

  function radarSvg(axes) {
    if (!axes || !axes.length) return "";
    var cx = 80;
    var cy = 86;
    var radius = 52;
    var n = axes.length;
    function pt(i, scale) {
      var ang = -Math.PI / 2 + (i * 2 * Math.PI / n);
      return [cx + Math.cos(ang) * radius * scale, cy + Math.sin(ang) * radius * scale];
    }
    var grid = "";
    for (var g = 1; g <= 3; g++) {
      var ring = [];
      for (var i = 0; i < n; i++) {
        var rp = pt(i, g / 3);
        ring.push(rp[0].toFixed(1) + "," + rp[1].toFixed(1));
      }
      grid += '<polygon points="' + ring.join(" ") + '" fill="none" stroke="rgba(255,255,255,.28)" stroke-width="1"/>';
    }
    var poly = [];
    var labels = "";
    for (var j = 0; j < n; j++) {
      var scale = Math.max(0.08, Math.min(1, axes[j].value || 0));
      var p = pt(j, scale);
      poly.push(p[0].toFixed(1) + "," + p[1].toFixed(1));
      var lp = pt(j, 1.28);
      labels += '<text x="' + lp[0].toFixed(1) + '" y="' + lp[1].toFixed(1) + '" font-size="11" text-anchor="middle" fill="#d7e6ff">' + axes[j].label + "</text>";
    }
    return '<svg class="stats-radar" viewBox="0 0 160 172" role="img" aria-label="练习雷达">' +
      grid +
      '<polygon points="' + poly.join(" ") + '" fill="rgba(61,231,255,.35)" stroke="#3de7ff" stroke-width="2"/>' +
      labels +
      "</svg>";
  }

  return {
    RADAR_MIN: RADAR_MIN,
    describeAttempt: describeAttempt,
    radarFromEvidence: radarFromEvidence,
    radarSvg: radarSvg,
  };
});

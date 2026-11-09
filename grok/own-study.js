/* Student 学情 on the home stats panel.
 * Uses QMStudy on this learner's save and local events only.
 * Does not open the class board, read a roster, or download a class pack.
 */
(function (root) {
  "use strict";

  var openBuckets = Object.create(null);
  var glossCache = null;

  function putGloss(into, word, gloss) {
    var key = String(word || "").trim().toLowerCase();
    if (!key || !gloss || into[key]) return;
    into[key] = String(gloss);
  }

  function walk(into, node) {
    if (!node) return;
    if (Array.isArray(node)) {
      for (var i = 0; i < node.length; i++) walk(into, node[i]);
      return;
    }
    if (typeof node === "object") {
      if (node.word) putGloss(into, node.word, node.meaning_zh || node.gloss || "");
      if (Array.isArray(node.sets)) walk(into, node.sets);
    }
  }

  function glosses() {
    if (glossCache) return glossCache;
    var into = Object.create(null);
    try {
      walk(into, root.VOCAB_LEVELS);
      walk(into, root.VOCAB_TRACKS);
      walk(into, root.VOCAB_EXAM_TRACKS);
    } catch (e) {}
    glossCache = into;
    return into;
  }

  function learnerId() {
    var bus = root.QuizMarioLearnerEvents;
    if (!bus || typeof bus._load !== "function") return "";
    try {
      var store = bus._load();
      return store && store.learner_id ? String(store.learner_id) : "";
    } catch (e) {
      return "";
    }
  }

  function render(input) {
    var study = root.QMStudy;
    if (!study || typeof study.buildPersonal !== "function") return "";
    var save = input && input.save;
    if (!save || typeof save !== "object") return "";
    var model;
    try {
      model = study.buildPersonal(save, (input && input.events) || [], new Date(), {
        glosses: glosses(),
        learnerId: learnerId(),
      });
    } catch (e) {
      return "";
    }
    if (!model) return "";
    var charts = "";
    var lists = "";
    try {
      charts = study.personalChartsHtml(model) || "";
      lists = study.inventoryListsHtml(model.inventory, { open: openBuckets }) || "";
    } catch (e2) {
      return "";
    }
    var sample = study.MIN_SAMPLE || 5;
    return "<section class=\"own-study\" aria-label=\"我的学情\">" +
      "<h4>我的学情</h4>" +
      "<p class=\"own-hint\">只根据你自己的存档和学习记录。学情雷达是认词、搭配、产出、巩固。样本少于 " +
      sample + " 次先不打分，不记成 0 分。</p>" +
      "<p class=\"own-hint\">雅思已接触 " + (Number(model.ieltsTouched) || 0) +
      " 张词条卡，雅思待复习 " + (Number(model.ieltsDue) || 0) +
      " 个。近7日答题仍是全部词库累计。</p>" +
      charts + lists + "</section>";
  }

  function onMore(ev) {
    var btn = ev.target && ev.target.closest ? ev.target.closest("[data-own-more]") : null;
    if (!btn || !btn.closest || !btn.closest("#stats-panel")) return;
    var section = btn.closest(".own-bucket");
    if (!section) return;
    var id = section.getAttribute("data-bucket");
    if (id) openBuckets[id] = true;
    section.classList.add("is-open");
    btn.hidden = true;
  }

  function install() {
    var host = root.document && root.document.getElementById("stats-panel");
    if (!host || host.getAttribute("data-own-study") === "1") return;
    host.setAttribute("data-own-study", "1");
    host.addEventListener("click", onMore);
  }

  var api = { render: render, install: install };
  root.QuizMarioOwnStudy = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root.document) install();
})(typeof window !== "undefined" ? window : globalThis);

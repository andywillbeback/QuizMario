/* Soft links for card.related[], plus the one hard collocation gate.
 * Loaded before game.js. Also require()-able from node tests.
 *
 * Reads the existing string array. Does not build, stem, or rewrite lemmas.
 * Meaning mode can show the chips immediately, because the English headword
 * is already the prompt. Other directions wait until the answer is revealed,
 * same rule as card speech: do not show the answer word before the guess.
 *
 * Primary gate (EN→ZH only): the first related[] entry that is collocation-
 * shaped (whitespace or "...") and resolves to a same-track card with a
 * non-empty meaning_zh. Single-word reverse links stay chips. A missing card
 * or blank gloss is skipped so a later entry can be the primary. No usable
 * entry means there is no gate.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.QuizMarioRelated = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function norm(s) {
    return String(s == null ? "" : s)
      .trim()
      .toLowerCase()
      .replace(/[’‘]/g, "'")
      .replace(/\s+/g, " ");
  }

  function lemmas(card) {
    var raw = card && card.related;
    if (!Array.isArray(raw)) return [];
    var out = [];
    var seen = Object.create(null);
    for (var i = 0; i < raw.length; i++) {
      var item = raw[i];
      if (typeof item !== "string") continue;
      var text = item.trim();
      if (!text) continue;
      var key = norm(text);
      if (!key || seen[key]) continue;
      seen[key] = true;
      out.push(text);
    }
    return out;
  }

  function visible(card, direction, revealed) {
    if (!lemmas(card).length) return false;
    if (direction === "meaning") return true;
    return !!revealed;
  }

  function isCollocationHead(text) {
    var s = String(text || "");
    return /\s/.test(s) || s.indexOf("...") !== -1;
  }

  /**
   * First quiz-able collocation in card.related[].
   * Returns null when the session should advance with no gate.
   * rest[] is every other related string, still optional chips.
   */
  function primaryCollocation(card, index) {
    var items = lemmas(card);
    if (!items.length || !index || typeof index.get !== "function") return null;
    var self = norm(card && card.word);
    for (var i = 0; i < items.length; i++) {
      var text = items[i];
      if (!isCollocationHead(text)) continue;
      if (self && norm(text) === self) continue;
      var hit = lookup(index, text);
      if (!hit || !hit.word) continue;
      var gloss = String(hit.word.meaning_zh || "").trim();
      if (!gloss) continue;
      var surface = String(hit.word.word || text);
      var chosen = norm(surface);
      var rest = [];
      for (var j = 0; j < items.length; j++) {
        if (norm(items[j]) === chosen) continue;
        rest.push(items[j]);
      }
      return {
        lemma: surface,
        gloss: gloss,
        levelIdx: hit.levelIdx,
        card: hit.word,
        rest: rest,
      };
    }
    return null;
  }

  function hostKey(card) {
    if (!card) return "";
    if (card.key) return String(card.key);
    return norm(card.word || "");
  }

  /**
   * EN→ZH gate. schedule() is not this object's job.
   * onLemmaCorrect → "open" (hold the lemma) or "complete" (grade it now).
   * onCollocAnswer(false) → "stay". onCollocAnswer(true) → "complete".
   * The caller must not call onLemmaCorrect again after a colloc "complete",
   * or the same lemma would open a second gate.
   */
  function createCollocGate() {
    var phase = "idle";
    var gate = null;
    return {
      phase: function () { return phase; },
      gate: function () { return gate; },
      onLemmaCorrect: function (card, index, direction) {
        if (phase === "gate") return "stay";
        if (direction !== "meaning") return "complete";
        var primary = primaryCollocation(card, index);
        if (!primary) return "complete";
        phase = "gate";
        gate = {
          hostKey: hostKey(card),
          hostWord: card && card.word ? String(card.word) : "",
          primary: primary,
        };
        return "open";
      },
      onCollocAnswer: function (correct) {
        if (phase !== "gate" || !gate) return "ignore";
        if (!correct) return "stay";
        phase = "idle";
        gate = null;
        return "complete";
      },
      abandon: function () {
        phase = "idle";
        gate = null;
      },
    };
  }

  function indexTrack(levels) {
    var map = new Map();
    if (!levels || !levels.length) return map;
    for (var li = 0; li < levels.length; li++) {
      var words = levels[li] || [];
      for (var wi = 0; wi < words.length; wi++) {
        var w = words[wi];
        if (!w || typeof w.word !== "string") continue;
        var key = norm(w.word);
        if (!key || map.has(key)) continue;
        map.set(key, { levelIdx: li, word: w });
      }
    }
    return map;
  }

  function lookup(index, lemma) {
    if (!index || typeof index.get !== "function") return null;
    var key = norm(lemma);
    if (!key) return null;
    return index.get(key) || null;
  }

  return {
    norm: norm,
    lemmas: lemmas,
    visible: visible,
    indexTrack: indexTrack,
    lookup: lookup,
    primaryCollocation: primaryCollocation,
    createCollocGate: createCollocGate,
  };
});

/* Soft links for card.related[].
 * Loaded before game.js. Also require()-able from node tests.
 *
 * Reads the existing string array. Does not build, stem, or rewrite lemmas.
 * Meaning mode can show the chips immediately, because the English headword
 * is already the prompt. Other directions wait until the answer is revealed,
 * same rule as card speech: do not show the answer word before the guess.
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
  };
});

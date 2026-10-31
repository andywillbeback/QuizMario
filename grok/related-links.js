/* Soft links for card.related[], plus the one hard collocation gate.
 * Loaded before game.js. Also require()-able from node tests.
 *
 * Reads the existing string array. Does not build, stem, or rewrite lemmas.
 * Meaning mode can show the chips immediately, because the English headword
 * is already the prompt. Other directions wait until the answer is revealed,
 * same rule as card speech: do not show the answer word before the guess.
 *
 * Primary gate (EN→ZH only), one phrase:
 * 1. Prefer a same-track phrase whose gloss is non-empty, which contains the
 *    lemma as a whole token, and which is a fixed verb phrase: it starts with
 *    a light verb (be/take/make/have/get/look/put/come/go/give/keep/set/turn/
 *    bring/run/pay/catch/break/cut/hold/leave/let/fall/stand/sit/lie/grow/
 *    become) or contains an ellipsis pattern ("..." / "…"), as in
 *    "be able to" or "take advantage of".
 * 2. Otherwise the first phrase-shaped related entry with a card and gloss.
 * Single-word reverse links stay chips. A missing card or blank gloss is
 * skipped. No usable entry means there is no gate.
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
    return /\s/.test(s) || s.indexOf("...") !== -1 || s.indexOf("…") !== -1;
  }

  /** Light verbs that head a fixed collocation rather than a near-synonym. */
  var LIGHT_VERBS = {
    be: 1, take: 1, make: 1, have: 1, get: 1, look: 1, put: 1,
    come: 1, go: 1, give: 1, keep: 1, set: 1, turn: 1, bring: 1,
    run: 1, pay: 1, catch: 1, break: 1, cut: 1, hold: 1, leave: 1,
    let: 1, fall: 1, stand: 1, sit: 1, lie: 1, grow: 1, become: 1,
  };

  function tokensOf(text) {
    return norm(text).split(/[^a-z0-9']+/).filter(Boolean);
  }

  function containsLemmaToken(phrase, lemma) {
    var needle = tokensOf(lemma);
    if (!needle.length) return false;
    var hay = tokensOf(phrase);
    for (var i = 0; i + needle.length <= hay.length; i++) {
      var ok = true;
      for (var j = 0; j < needle.length; j++) {
        if (hay[i + j] !== needle[j]) {
          ok = false;
          break;
        }
      }
      if (ok) return true;
    }
    return false;
  }

  function isFixedVerbPhrase(phrase) {
    var raw = String(phrase || "");
    if (raw.indexOf("...") !== -1 || raw.indexOf("…") !== -1) return true;
    var tok = tokensOf(raw);
    return !!(tok.length && LIGHT_VERBS[tok[0]]);
  }

  /**
   * One quiz-able collocation from card.related[].
   * Prefers a fixed verb phrase that uses the lemma; otherwise the first
   * phrase with a card and gloss. Returns null when there is no gate.
   * rest[] is every other related string, still optional chips.
   */
  function primaryCollocation(card, index) {
    var items = lemmas(card);
    if (!items.length || !index || typeof index.get !== "function") return null;
    var self = norm(card && card.word);
    var usable = [];
    for (var i = 0; i < items.length; i++) {
      var text = items[i];
      if (!isCollocationHead(text)) continue;
      if (self && norm(text) === self) continue;
      var hit = lookup(index, text);
      if (!hit || !hit.word) continue;
      var gloss = String(hit.word.meaning_zh || "").trim();
      if (!gloss) continue;
      usable.push({
        surface: String(hit.word.word || text),
        gloss: gloss,
        hit: hit,
      });
    }
    if (!usable.length) return null;
    var lemma = card && card.word ? card.word : "";
    var chosen = null;
    for (var p = 0; p < usable.length; p++) {
      if (containsLemmaToken(usable[p].surface, lemma) && isFixedVerbPhrase(usable[p].surface)) {
        chosen = usable[p];
        break;
      }
    }
    if (!chosen) chosen = usable[0];
    var skip = norm(chosen.surface);
    var rest = [];
    for (var j = 0; j < items.length; j++) {
      if (norm(items[j]) === skip) continue;
      rest.push(items[j]);
    }
    return {
      lemma: chosen.surface,
      gloss: chosen.gloss,
      levelIdx: chosen.hit.levelIdx,
      card: chosen.hit.word,
      rest: rest,
    };
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

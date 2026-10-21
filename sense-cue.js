/* Short Chinese sense cue for study cards.
 * Loaded after sense-id.js and before game.js. Also require()-able from node tests.
 *
 * The bank already distinguishes a few homographs (may/May, miss/Miss, and the
 * other case splits in sense-id.js). When a card is one of those senses, or
 * the current track has more than one sense id for the same spelling, the
 * card can show a category such as 月份 or 情态动词. The line is a cue, not
 * the answer: it never repeats the gloss or the headword, so EN→ZH and ZH→EN
 * can both show it before the student answers.
 *
 * A plain word with one sense stays empty. The existing hint line is enough.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.QuizMarioSenseCue = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  /* Categories, not glosses. 五月 must not be labeled 五月. */
  var ID_LABEL = {
    "may": "情态动词",
    "may:month": "月份",
    "march": "动词",
    "march:month": "月份",
    "miss:verb": "动词",
    "miss:title": "称呼",
    "who": "代词",
    "who:abbr": "缩写",
    "china:ware": "器物",
    "china:country": "国名",
  };

  function senseApi() {
    if (typeof module !== "undefined" && module.exports) {
      try { return require("./sense-id"); } catch (_) {}
    }
    return typeof globalThis !== "undefined" ? globalThis.QuizMarioSense : null;
  }

  function senseId(word) {
    var api = senseApi();
    if (api && typeof api.senseId === "function") return api.senseId(word);
    return String(word || "").trim().toLowerCase();
  }

  function lower(word) {
    return String(word || "").trim().toLowerCase();
  }

  function qualified(word) {
    var raw = String(word || "").trim();
    if (!raw) return false;
    return senseId(raw) !== raw.toLowerCase();
  }

  function posLabel(pos) {
    var p = String(pos || "").trim().toLowerCase();
    if (!p) return "";
    if (p.indexOf("modal") !== -1) return "情态动词";
    if (p.indexOf("abbr") === 0) return "缩写";
    if (p === "v." || p === "verb") return "动词";
    if (p === "n." || p === "noun") return "名词";
    if (p.indexOf("pron") === 0) return "代词";
    if (p === "adj.") return "形容词";
    if (p === "adv.") return "副词";
    if (p === "prep.") return "介词";
    if (p === "conj.") return "连词";
    if (p === "det.") return "限定词";
    return "";
  }

  function glossParts(gloss) {
    return String(gloss || "")
      .split(/[；;，,、/／]/)
      .map(function (part) {
        return part.replace(/[（）()]/g, "").trim();
      })
      .filter(Boolean);
  }

  /** True when the cue text is the gloss, or a piece of it. */
  function leaksGloss(label, gloss) {
    var text = String(label || "").trim();
    if (!text) return false;
    var parts = glossParts(gloss);
    var whole = String(gloss || "").trim();
    if (whole && parts.indexOf(whole) === -1) parts = parts.concat([whole]);
    for (var i = 0; i < parts.length; i++) {
      var part = parts[i];
      if (!part) continue;
      if (text.indexOf(part) !== -1) return true;
      if (part.indexOf(text) !== -1) return true;
    }
    return false;
  }

  /** True when the cue text contains the English headword. */
  function leaksWord(label, word) {
    var text = String(label || "").trim().toLowerCase();
    var w = lower(word);
    if (!text || !w) return false;
    return text.indexOf(w) !== -1;
  }

  function leaksAnswer(label, card) {
    var row = card || {};
    return leaksGloss(label, row.meaning_zh) || leaksWord(label, row.word);
  }

  function indexCards(cards) {
    var by = {};
    var list = cards || [];
    for (var i = 0; i < list.length; i++) {
      var w = list[i] && list[i].word;
      if (!w) continue;
      var n = lower(w);
      var id = senseId(w);
      if (!by[n]) by[n] = {};
      by[n][id] = true;
    }
    return by;
  }

  function countIn(index, word) {
    var row = index && index[lower(word)];
    if (!row) return 0;
    return Object.keys(row).length;
  }

  function familyCount(word, opts) {
    var o = opts || {};
    if (typeof o.senseCount === "number") return o.senseCount;
    if (o.cards) return countIn(indexCards(o.cards), word);
    return 1;
  }

  function candidates(word, pos) {
    var id = senseId(word);
    var out = [];
    if (ID_LABEL[id]) out.push(ID_LABEL[id]);
    var fromPos = posLabel(pos);
    if (fromPos && out.indexOf(fromPos) === -1) out.push(fromPos);
    return out;
  }

  /**
   * Pre-answer cue. Empty when the card has a single plain sense, or when
   * every candidate would give away meaning_zh / the headword.
   * direction is accepted so EN→ZH and ZH→EN share one rule.
   */
  function senseCue(card, opts) {
    var row = card || {};
    var word = row.word;
    if (!word) return "";
    var count = familyCount(word, opts);
    if (!qualified(word) && count < 2) return "";
    var options = candidates(word, row.pos);
    for (var i = 0; i < options.length; i++) {
      if (!leaksAnswer(options[i], row)) return "这一义：" + options[i];
    }
    return "";
  }

  return {
    ID_LABEL: ID_LABEL,
    senseId: senseId,
    qualified: qualified,
    posLabel: posLabel,
    leaksAnswer: leaksAnswer,
    indexCards: indexCards,
    countIn: countIn,
    senseCue: senseCue,
  };
});

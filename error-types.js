/* Coarse miss reasons for 聚光单词.
 * Loaded before game.js. Also require()-able from node tests.
 *
 * A wrong multiple-choice pick lands in one bucket, using only fields
 * already on the card and the distractor (lemma, gloss, POS, roots).
 * No model call. 「不会」 is not a wrong pick and is not counted.
 *
 * Priority, first match wins:
 *   形近  spelling-near lemmas (edit distance, a long shared prefix,
 *         or a clear same-length opening such as account / actress)
 *   义近  gloss overlap, or the same non-trivial root
 *   词性  both sides have a POS and the coarse tags differ
 *   其他  none of those — 未归类
 * A look-alike with a different POS stays 形近: the pattern to drill
 * is the spelling. A shared gloss with a different POS stays 义近.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.QuizMarioErrorTypes = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  var BUCKETS = ["form", "sense", "pos", "other"];
  var LABELS = {
    form: "形近",
    sense: "义近",
    pos: "词性",
    other: "其他",
  };
  var LEADS = {
    form: "最近错过的词，主要是形近：选项和答案拼写接近。",
    sense: "最近错过的词，主要是义近：中文意思容易混。",
    pos: "最近错过的词，主要是词性：选成了不一样的词性。",
    other: "这几题还没归进形近、义近或词性。",
  };
  var TAXONOMY = "形近 · 义近 · 词性 · 其他/未归类";
  var RECENT_MAX = 40;
  var GLOSS_STOP = {
    "一个": true,
    "一种": true,
    "一些": true,
    "这个": true,
    "那个": true,
    "什么": true,
  };
  var ROOT_STOP = { base: true, root: true, word: true };
  var POS_MAP = {
    n: "n", noun: "n",
    v: "v", verb: "v", vt: "v", vi: "v",
    adj: "adj", adjective: "adj",
    adv: "adv", adverb: "adv",
    prep: "prep", preposition: "prep",
    det: "det", art: "det", article: "det",
    conj: "conj", conjunction: "conj",
    pron: "pron", pronoun: "pron",
    num: "num", numeral: "num",
    modal: "modal", modal_phrase: "modal",
    phrasal: "v", verb_phrase: "v",
    prep_phrase: "prep",
    adv_phrase: "adv",
    idiom: "idiom",
  };

  function countsAsMiss(outcome) {
    return outcome === "wrong";
  }

  function letters(value) {
    return String(value || "").toLowerCase().replace(/[^a-z]/g, "");
  }

  function levenshtein(a, b) {
    if (a === b) return 0;
    var al = a.length;
    var bl = b.length;
    if (!al) return bl;
    if (!bl) return al;
    if (Math.abs(al - bl) > 3) return 4;
    var prev = new Array(bl + 1);
    var cur = new Array(bl + 1);
    var j;
    for (j = 0; j <= bl; j++) prev[j] = j;
    for (var i = 1; i <= al; i++) {
      cur[0] = i;
      var ca = a.charCodeAt(i - 1);
      for (var k = 1; k <= bl; k++) {
        var cost = ca === b.charCodeAt(k - 1) ? 0 : 1;
        var del = prev[k] + 1;
        var ins = cur[k - 1] + 1;
        var sub = prev[k - 1] + cost;
        var best = del < ins ? del : ins;
        cur[k] = best < sub ? best : sub;
      }
      var swap = prev;
      prev = cur;
      cur = swap;
    }
    return prev[bl];
  }

  /**
   * Spelling-near: small edit distance, one lemma continues the other,
   * or a clear shared opening.
   * account → actress is edit distance 5, so the distance caps miss it,
   * and so do account → academy (also 5) and account → accident (3,
   * one letter longer). Those three still open the same way and are
   * the near-misses a 看中文选英文 card actually offers. A 2-letter
   * opening only counts when the words are the same length; ability →
   * abroad (one letter off) stays out of 形近.
   */
  function formNear(left, right) {
    var a = letters(left);
    var b = letters(right);
    if (!a || !b || a === b) return false;
    if (a.length > 40) a = a.slice(0, 40);
    if (b.length > 40) b = b.slice(0, 40);
    var shorter = a.length < b.length ? a.length : b.length;
    var longer = a.length > b.length ? a.length : b.length;
    var dist = levenshtein(a, b);
    if (shorter >= 2 && shorter <= 4 && dist === 1 && longer <= shorter + 2) return true;
    if (shorter >= 3 && dist <= 1) return true;
    if (shorter >= 5 && dist <= 2) return true;
    if (shorter >= 8 && dist <= 3) return true;
    var prefix = 0;
    var m = a.length < b.length ? a.length : b.length;
    while (prefix < m && a.charAt(prefix) === b.charAt(prefix)) prefix++;
    var prefixOf = a.indexOf(b) === 0 || b.indexOf(a) === 0;
    var extra = longer - prefix;
    var gap = Math.abs(a.length - b.length);
    if (prefixOf && prefix >= 4 && extra >= 1 && extra <= 4) return true;
    if (prefix >= 5 && shorter >= 6 && gap <= 4) return true;
    if (shorter >= 6 && prefix >= 3 && gap <= 1) return true;
    if (shorter >= 6 && prefix >= 2 && gap === 0 && dist <= 5) return true;
    return false;
  }

  function glossPieces(gloss) {
    var parts = String(gloss || "").split(/[;；,，、/|·\s]+/);
    var out = [];
    for (var i = 0; i < parts.length; i++) {
      var s = parts[i].replace(/[（）()。.!！？?""「」『』]/g, "").trim();
      if (s.length >= 2 && !GLOSS_STOP[s]) out.push(s);
    }
    return out;
  }

  function glossNear(a, b) {
    var pa = glossPieces(a);
    var pb = glossPieces(b);
    for (var i = 0; i < pa.length; i++) {
      for (var j = 0; j < pb.length; j++) {
        var x = pa[i];
        var y = pb[j];
        if (x === y) return true;
        var short = x.length <= y.length ? x : y;
        var long = x.length <= y.length ? y : x;
        if (short.length >= 2 && long.indexOf(short) !== -1 && short.length * 3 >= long.length * 2) return true;
      }
    }
    return false;
  }

  function rootToken(value) {
    var s = letters(value);
    if (!s || s.length < 4 || ROOT_STOP[s]) return "";
    return s;
  }

  function senseNear(target, chosen) {
    if (glossNear(target && target.meaning_zh, chosen && chosen.meaning_zh)) return true;
    var ra = rootToken(target && target.roots);
    var rb = rootToken(chosen && chosen.roots);
    return !!(ra && rb && ra === rb);
  }

  function coarsePos(pos) {
    var raw = String(pos || "").toLowerCase().replace(/\./g, "").replace(/\s+/g, "");
    if (!raw) return "";
    return POS_MAP[raw] || raw;
  }

  function posMismatch(a, b) {
    var pa = coarsePos(a);
    var pb = coarsePos(b);
    if (!pa || !pb) return false;
    return pa !== pb;
  }

  function classifyMiss(input) {
    input = input || {};
    var target = input.target && typeof input.target === "object" ? input.target : {};
    var direction = input.direction === "meaning" ? "meaning" : "form";
    var chosenEntry = input.chosen && typeof input.chosen === "object" ? input.chosen : null;
    var chosenText = chosenEntry
      ? String(direction === "meaning" ? (chosenEntry.meaning_zh || chosenEntry.word || "") : (chosenEntry.word || "")).trim()
      : String(input.chosen || "").trim();
    if (!chosenText && !(chosenEntry && chosenEntry.word)) {
      return { bucket: "other", label: LABELS.other };
    }
    var chosenWord = chosenEntry ? String(chosenEntry.word || "") : (direction === "form" ? chosenText : "");
    var form = chosenWord ? formNear(target.word, chosenWord) : false;
    var sense = false;
    if (chosenEntry) sense = senseNear(target, chosenEntry);
    else if (direction === "meaning") sense = glossNear(target.meaning_zh, chosenText);
    var pos = chosenEntry ? posMismatch(target.pos, chosenEntry.pos) : false;
    var bucket = "other";
    if (form) bucket = "form";
    else if (sense) bucket = "sense";
    else if (pos) bucket = "pos";
    return { bucket: bucket, label: LABELS[bucket] };
  }

  function feedbackLine(result, otherLabel) {
    var bucket = result && BUCKETS.indexOf(result.bucket) !== -1 ? result.bucket : "other";
    var name = String(otherLabel || "").trim();
    if (bucket === "form") return name ? ("错因：形近 · 和「" + name + "」长得像") : "错因：形近";
    if (bucket === "sense") return name ? ("错因：义近 · 和「" + name + "」意思接近") : "错因：义近";
    if (bucket === "pos") return name ? ("错因：词性 · 和「" + name + "」词性不同") : "错因：词性";
    return "错因：其他 · 还没归进形近、义近或词性";
  }

  function cleanRow(row) {
    if (!row || BUCKETS.indexOf(row.bucket) === -1) return null;
    return {
      bucket: row.bucket,
      lemma: String(row.lemma || "").trim(),
      gloss: String(row.gloss || "").trim(),
      chosen: String(row.chosen || "").trim(),
      chosenLemma: String(row.chosenLemma || "").trim(),
      track: String(row.track || "").trim(),
      at: Number(row.at) || 0,
    };
  }

  function normalizeLog(raw) {
    var recent = [];
    var list = raw && Array.isArray(raw.recent) ? raw.recent : [];
    for (var i = 0; i < list.length; i++) {
      var row = cleanRow(list[i]);
      if (row) recent.push(row);
    }
    if (recent.length > RECENT_MAX) recent = recent.slice(recent.length - RECENT_MAX);
    return { recent: recent };
  }

  function noteMiss(log, entry) {
    var next = normalizeLog(log);
    var row = cleanRow(entry);
    if (!row) return next;
    next.recent.push(row);
    if (next.recent.length > RECENT_MAX) next.recent = next.recent.slice(next.recent.length - RECENT_MAX);
    return next;
  }

  function countsOf(log) {
    var counts = { form: 0, sense: 0, pos: 0, other: 0 };
    var recent = log && Array.isArray(log.recent) ? log.recent : [];
    for (var i = 0; i < recent.length; i++) {
      var bucket = recent[i] && recent[i].bucket;
      if (counts[bucket] != null) counts[bucket]++;
    }
    return counts;
  }

  function leadBucket(counts) {
    var best = "";
    var bestN = 0;
    for (var i = 0; i < BUCKETS.length; i++) {
      var n = counts[BUCKETS[i]] || 0;
      if (n > bestN) {
        bestN = n;
        best = BUCKETS[i];
      }
    }
    return best;
  }

  function countsLine(counts) {
    var parts = [];
    for (var i = 0; i < BUCKETS.length; i++) {
      var bucket = BUCKETS[i];
      var n = counts[bucket] || 0;
      if (!n) continue;
      parts.push(LABELS[bucket] + " " + n);
    }
    return parts.join(" · ");
  }

  function exampleLine(row) {
    var label = LABELS[row.bucket] || LABELS.other;
    var left = row.lemma || "";
    var right = row.chosenLemma || row.chosen || "";
    if (left && right) return left + " → " + right + " · " + label;
    return (left || right) + " · " + label;
  }

  function present(log) {
    var clean = normalizeLog(log);
    var counts = countsOf(clean);
    var total = counts.form + counts.sense + counts.pos + counts.other;
    var empty = {
      visible: false,
      total: 0,
      leadBucket: "",
      lead: "",
      countsLine: "",
      taxonomy: TAXONOMY,
      examples: [],
      counts: counts,
    };
    if (!total) return empty;
    var bucket = leadBucket(counts);
    var examples = [];
    for (var i = clean.recent.length - 1; i >= 0 && examples.length < 3; i--) {
      var line = exampleLine(clean.recent[i]);
      if (line) examples.push(line);
    }
    return {
      visible: true,
      total: total,
      leadBucket: bucket,
      lead: LEADS[bucket] || "",
      countsLine: countsLine(counts),
      taxonomy: TAXONOMY,
      examples: examples,
      counts: counts,
    };
  }

  return {
    BUCKETS: BUCKETS,
    LABELS: LABELS,
    TAXONOMY: TAXONOMY,
    RECENT_MAX: RECENT_MAX,
    countsAsMiss: countsAsMiss,
    classifyMiss: classifyMiss,
    feedbackLine: feedbackLine,
    normalizeLog: normalizeLog,
    noteMiss: noteMiss,
    countsOf: countsOf,
    present: present,
  };
});

/* Item ids for surfaces that share a lowercase form.
 * Loaded before review-queues.js and game.js. Also require()-able from node tests.
 *
 * These ids match tools/build-exam-tracks.js senseKey for the case splits that
 * actually occur in the exam banks (may/May, miss/Miss, march/March, who/WHO,
 * china/China). Other headwords stay on the lowercased surface, so old card
 * keys and 错词本 rows keep working. Aliases such as color/colour are not folded
 * here; that map belongs to the exam-track builder only.
 *
 * Q2 / Grok版本 / 聚光单词（grok）: shared sense_id contract for QuizMario ↔ ALS.
 * Bank sense_id wins when present. Otherwise provisional lemma.pos.gloss_zh
 * (POS trailing dot stripped). See docs/GROK版本_sense_id_contract_Q2.md.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.QuizMarioSense = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function rawOf(surface) {
    return String(surface || "").trim();
  }

  function senseId(surface) {
    var raw = rawOf(surface);
    var n = raw.toLowerCase();
    if (n === "may") return raw === "May" ? "may:month" : "may";
    if (n === "march") return raw === "March" ? "march:month" : "march";
    if (n === "miss") return raw === "Miss" ? "miss:title" : "miss:verb";
    if (n === "who") return raw === "WHO" ? "who:abbr" : "who";
    if (n === "china") return raw === "china" ? "china:ware" : "china:country";
    return n;
  }

  /** Storage token. Plain lowercase when the sense id would not change the old key. */
  function itemToken(surface) {
    var id = senseId(surface);
    var lower = rawOf(surface).toLowerCase();
    return id === lower ? lower : id;
  }

  function trackPrefix(track) {
    return !track || track === "core" ? "" : String(track) + "|";
  }

  function legacyCardKey(track, levelIdx, word) {
    return trackPrefix(track) + levelIdx + "::" + rawOf(word).toLowerCase();
  }

  function cardKeyFor(track, levelIdx, word) {
    return trackPrefix(track) + levelIdx + "::" + itemToken(word);
  }

  function lemmaKey(track, word) {
    return String(track || "core") + "::" + senseId(word);
  }

  /**
   * Move a saved card off the lowercased key when this level has exactly one
   * card for that surface. may in set 16 stays `16::may`. May in set 32 moves
   * `32::may` → `32::may:month`. Two senses in one set are left untouched.
   */
  function migrateCards(cards, groups) {
    var src = cards && typeof cards === "object" ? cards : {};
    var byLegacy = {};
    var list = groups || [];
    for (var i = 0; i < list.length; i++) {
      var g = list[i];
      if (!g || g.word == null || g.levelIdx == null) continue;
      var legacy = legacyCardKey(g.track, g.levelIdx, g.word);
      if (!byLegacy[legacy]) byLegacy[legacy] = [];
      byLegacy[legacy].push(g);
    }
    var next = {};
    var keys = Object.keys(src);
    for (var k = 0; k < keys.length; k++) next[keys[k]] = src[keys[k]];
    var legacies = Object.keys(byLegacy);
    for (var j = 0; j < legacies.length; j++) {
      var legacyKey = legacies[j];
      var group = byLegacy[legacyKey];
      if (group.length !== 1) continue;
      var id = cardKeyFor(group[0].track, group[0].levelIdx, group[0].word);
      if (legacyKey !== id && next[legacyKey] && !next[id]) {
        next[id] = next[legacyKey];
        delete next[legacyKey];
      }
    }
    return next;
  }

  /** Re-key 错词本 rows from the stored surface, so may and May do not share one row. */
  function migrateWrongBook(book) {
    if (!book || typeof book !== "object") return {};
    var next = {};
    var keys = Object.keys(book);
    for (var i = 0; i < keys.length; i++) {
      var row = book[keys[i]];
      if (!row || typeof row !== "object") continue;
      var track = row.track || String(keys[i]).split("::")[0] || "core";
      var id = row.lemma ? lemmaKey(track, row.lemma) : keys[i];
      if (next[id]) continue;
      row.lemmaKey = id;
      next[id] = row;
    }
    return next;
  }

  /** Bank POS tags look like "v." / "adj.". The sense key stores them without the trailing dot. */
  function posToken(pos) {
    var p = String(pos || "").trim().toLowerCase();
    if (p.charAt(p.length - 1) === ".") p = p.slice(0, -1);
    return p;
  }

  function headwordOf(lemma) {
    return String(lemma || "").trim().toLowerCase();
  }

  /**
   * Provisional sense key when the card has no bank sense_id.
   * lemma.pos.gloss_zh, POS trailing dot stripped.
   * Missing POS keeps the empty slot: lemma..gloss_zh.
   * Shared by QuizMario learner-events, home-loop, and ALS ingest (Q2 contract).
   */
  function provisionalSenseId(lemma, pos, gloss) {
    var l = headwordOf(lemma);
    var p = posToken(pos);
    var g = String(gloss || "").trim().replace(/\s+/g, " ");
    if (!l) return "";
    if (p && g) return l + "." + p + "." + g;
    if (!p && g) return l + ".." + g;
    if (p && !g) return l + "." + p;
    return l;
  }

  /**
   * Resolve the sense id both ends should use for one attempt / handoff row.
   * Bank sense_id wins. Else provisional lemma.pos.gloss.
   * Returns { sense_id, sense_id_kind } or null.
   */
  function resolveSenseKey(input) {
    input = input || {};
    var explicit = input.sense_id != null ? String(input.sense_id).trim() : "";
    if (explicit) {
      return {
        sense_id: explicit,
        sense_id_kind: input.sense_id_kind ? String(input.sense_id_kind) : "bank",
      };
    }
    var lemma = input.lemma != null ? input.lemma : input.headword;
    var gloss = input.gloss_zh != null ? input.gloss_zh : input.gloss;
    if (!lemma && !gloss) return null;
    var id = provisionalSenseId(lemma, input.pos, gloss);
    if (!id) return null;
    var kind = "provisional";
    if (!gloss) kind = input.pos ? "lemma_pos" : "lemma_only";
    return { sense_id: id, sense_id_kind: kind };
  }

  /** Normalize for equality (trim only; ids are already lowercased lemmas). */
  function normalizeSenseId(id) {
    return String(id || "").trim();
  }

  /** True when both ends name the same sense (bank or provisional). */
  function sameSenseId(a, b) {
    var left = normalizeSenseId(a);
    var right = normalizeSenseId(b);
    if (!left || !right) return false;
    return left === right;
  }

  return {
    senseId: senseId,
    itemToken: itemToken,
    legacyCardKey: legacyCardKey,
    cardKeyFor: cardKeyFor,
    lemmaKey: lemmaKey,
    migrateCards: migrateCards,
    migrateWrongBook: migrateWrongBook,
    posToken: posToken,
    provisionalSenseId: provisionalSenseId,
    resolveSenseKey: resolveSenseKey,
    normalizeSenseId: normalizeSenseId,
    sameSenseId: sameSenseId,
  };
});

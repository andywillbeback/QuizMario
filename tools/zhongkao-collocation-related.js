/* Related headwords for 中考 fixed-collocation cards.
 * Additive field `related`: string[] of single-word lemmas.
 * Prefer the surface already in the 中考 bank. If the token is not a bank
 * lemma, keep the token itself (no stemming: used stays used, had stays had).
 *
 * Standalone glue words are dropped when another headword remains:
 * articles, one's / sb / sth, and pattern prepositions
 * (to, of, in, at, for, with, from, by, into, onto, upon, than, as).
 * Particles such as on, up, off and out stay. and / or stay.
 * A slash alternative is kept even if that word is glue.
 * If every token is glue (as...as), those tokens are kept.
 */
"use strict";

const GLUE = new Set([
  "a", "an", "the",
  "to", "of", "in", "at", "for", "with", "from", "by",
  "into", "onto", "upon", "than", "as",
  "one's", "sb", "sth",
]);

function normToken(w) {
  return String(w || "")
    .trim()
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/\s+/g, " ");
}

function rawTokens(lemma) {
  const text = String(lemma || "").replace(/[’‘]/g, "'").replace(/\.\.\./g, " ");
  const out = [];
  for (const piece of text.split(/\s+/)) {
    if (!piece) continue;
    const slash = piece.includes("/");
    const alts = piece.split("/").map((s) => s.trim()).filter(Boolean);
    for (const alt of alts) {
      if (alt === "." || alt === "..." || alt === "one's") continue;
      out.push({ token: alt, slash });
    }
  }
  return out;
}

function bankSurface(token, bank) {
  if (!bank) return null;
  const n = normToken(token);
  const hits = bank.get(n);
  if (!hits || !hits.length) return null;
  const exact = hits.find((h) => h === token);
  if (exact) return exact;
  if (token === token.toLowerCase()) {
    const lower = hits.find((h) => h === h.toLowerCase());
    if (lower) return lower;
  }
  if (hits.length === 1) return hits[0];
  const lower = hits.find((h) => h === h.toLowerCase());
  return lower || hits[0];
}

function surfaceOf(token, bank) {
  return bankSurface(token, bank) || normToken(token);
}

function relatedLemmas(lemma, bank) {
  const tokens = rawTokens(lemma);
  const kept = [];
  const seen = new Set();
  const push = (token) => {
    const surface = surfaceOf(token, bank);
    const key = normToken(surface);
    if (!key || seen.has(key)) return;
    seen.add(key);
    kept.push(surface);
  };
  const content = tokens.filter((t) => t.slash || !GLUE.has(normToken(t.token)));
  const use = content.length ? content : tokens;
  for (const t of use) push(t.token);
  return kept;
}

function indexSingleWordBank(words) {
  const bank = new Map();
  for (const word of words) {
    if (!word || /\s/.test(word)) continue;
    const n = normToken(word);
    if (!bank.has(n)) bank.set(n, []);
    const list = bank.get(n);
    if (!list.includes(word)) list.push(word);
  }
  return bank;
}

/* Ordinary single-word cards point at 固定搭配 phrases.
 * The map is { lemma: [phrase, ...] } already capped at 5
 * (shorter length, then code-point order). Missing phrases are skipped.
 * No stemming. Phrase cards and their lemma-shaped related[] are left alone.
 */
const REVERSE_CAP = 5;
const COLLOC_TITLE = "·固定搭配";

function byLengthThenAlpha(a, b) {
  if (a.length !== b.length) return a.length - b.length;
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

function enforceReverseCap(list) {
  if (list.length <= REVERSE_CAP) return list.slice();
  return list.slice().sort(byLengthThenAlpha).slice(0, REVERSE_CAP);
}

function indexCollocPhrases(track) {
  const phrases = new Map();
  const titles = track && track.titles || [];
  const sets = track && track.sets || [];
  for (let i = 0; i < sets.length; i++) {
    if (!String(titles[i] || "").includes(COLLOC_TITLE)) continue;
    for (const card of sets[i] || []) {
      if (!card || typeof card.word !== "string") continue;
      const key = normToken(card.word);
      if (key && !phrases.has(key)) phrases.set(key, card.word);
    }
  }
  return phrases;
}

function applyReverseCollocLinks(track, map) {
  const phrases = indexCollocPhrases(track);
  const byLemma = new Map();
  for (const [lemma, list] of Object.entries(map || {})) {
    const key = normToken(lemma);
    if (key) byLemma.set(key, Array.isArray(list) ? list : []);
  }
  const titles = track.titles || [];
  let lemmas = 0;
  let chips = 0;
  const seenLemma = new Set();
  for (let i = 0; i < track.sets.length; i++) {
    if (String(titles[i] || "").includes(COLLOC_TITLE)) continue;
    for (const card of track.sets[i] || []) {
      if (!card || typeof card.word !== "string" || /\s/.test(card.word)) continue;
      const key = normToken(card.word);
      if (!byLemma.has(key)) continue;
      const kept = [];
      const seen = new Set();
      for (const phrase of byLemma.get(key)) {
        if (typeof phrase !== "string") continue;
        const surface = phrases.get(normToken(phrase));
        if (!surface) continue;
        const phraseKey = normToken(surface);
        if (!phraseKey || seen.has(phraseKey)) continue;
        seen.add(phraseKey);
        kept.push(surface);
      }
      const capped = enforceReverseCap(kept);
      if (!capped.length) continue;
      card.related = capped;
      chips += capped.length;
      if (!seenLemma.has(key)) {
        seenLemma.add(key);
        lemmas += 1;
      }
    }
  }
  return { lemmas, chips };
}

module.exports = {
  GLUE,
  normToken,
  relatedLemmas,
  indexSingleWordBank,
  REVERSE_CAP,
  applyReverseCollocLinks,
};

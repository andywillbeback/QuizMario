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

module.exports = {
  GLUE,
  normToken,
  relatedLemmas,
  indexSingleWordBank,
};

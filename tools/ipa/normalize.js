/* Turn espeak-ng --ipa (en-gb-x-rp) into broad BrE for exam cards.
 *
 * espeak prints a narrow string with the stress mark on the vowel
 * (ɐbˈɪlətɪ, ɹˈɛkɔːd). Learner dictionaries put the stress mark at the
 * start of the syllable (/əˈbɪləti/, /ˈrekɔːd/) and use r, ə, e.
 *
 * Returns the inner transcription, without surrounding slashes.
 */
"use strict";

const VOWEL_CHARS = new Set(["a", "ɑ", "ɒ", "ɔ", "ə", "e", "ɪ", "i", "ʊ", "u", "ʌ", "æ", "ɜ"]);
const DIPHTHONGS = ["aɪə", "aʊə", "eɪ", "aɪ", "ɔɪ", "aʊ", "əʊ", "ɪə", "iə", "eə", "ʊə"];
const STRESS = new Set(["ˈ", "ˌ"]);
const CONSONANTS = new Set("bdfhjklmnŋprsʃtθðvwzʒɡ".split(""));

/* Longest English onsets we are willing to pull a stress mark across.
 * Single consonants are handled separately. ɡz and dv are intentionally absent. */
const ONSETS = new Set([
  "spl", "spr", "str", "skr", "skw", "spj", "stj", "skj",
  "pl", "pr", "bl", "br", "tr", "dr", "kl", "kr", "ɡl", "ɡr", "fl", "fr",
  "θr", "ʃr", "sl", "sw", "sp", "st", "sk", "sm", "sn", "sf",
  "tw", "dw", "kw", "ɡw",
  "pj", "bj", "tj", "dj", "kj", "ɡj", "fj", "vj", "mj", "nj", "lj", "sj", "hj", "θj", "ʃj",
]);

function mapSymbols(raw) {
  return String(raw || "")
    .replace(/ɹ/g, "r")
    .replace(/ɐ/g, "ə")
    .replace(/ɛ/g, "e")
    .replace(/g/g, "ɡ");
}

function isVowelTok(tok) {
  return !!tok && VOWEL_CHARS.has(tok[0]);
}

function isConsonantTok(tok) {
  return !!tok && !STRESS.has(tok) && !isVowelTok(tok);
}

function tokenize(mapped) {
  const out = [];
  const s = mapped;
  for (let i = 0; i < s.length;) {
    const c = s[i];
    if (c === " " || c === "\t") {
      i += 1;
      continue;
    }
    if (STRESS.has(c)) {
      out.push(c);
      i += 1;
      continue;
    }
    if (c === "ː") {
      if (out.length && isVowelTok(out[out.length - 1])) out[out.length - 1] += "ː";
      else throw new Error("length mark without a vowel in " + mapped);
      i += 1;
      continue;
    }
    if (c === "t" && s[i + 1] === "ʃ") {
      out.push("tʃ");
      i += 2;
      continue;
    }
    if (c === "d" && s[i + 1] === "ʒ") {
      out.push("dʒ");
      i += 2;
      continue;
    }
    let diph = "";
    for (const cand of DIPHTHONGS) {
      if (s.startsWith(cand, i)) {
        diph = cand;
        break;
      }
    }
    if (diph) {
      // espeak writes NEAR as iə; learner BrE writes ɪə (here, tear).
      out.push(diph === "iə" ? "ɪə" : diph);
      i += diph.length;
      continue;
    }
    if (VOWEL_CHARS.has(c)) {
      out.push(c);
      i += 1;
      continue;
    }
    if (CONSONANTS.has(c)) {
      out.push(c);
      i += 1;
      continue;
    }
    throw new Error("unknown IPA symbol " + JSON.stringify(c) + " in " + mapped);
  }
  return out;
}

function onsetLength(cons) {
  for (let n = cons.length; n >= 1; n -= 1) {
    const slice = cons.slice(cons.length - n);
    if (n === 1) return slice[0] === "ŋ" ? 0 : 1;
    if (ONSETS.has(slice.join(""))) return n;
  }
  return 0;
}

function shiftStress(tokens) {
  const result = [];
  for (let i = 0; i < tokens.length; i += 1) {
    const tok = tokens[i];
    if (STRESS.has(tok) && isVowelTok(tokens[i + 1])) {
      const cons = [];
      while (result.length && isConsonantTok(result[result.length - 1])) cons.push(result.pop());
      cons.reverse();
      const n = onsetLength(cons);
      result.push(...cons.slice(0, cons.length - n), tok, ...cons.slice(cons.length - n));
      continue;
    }
    result.push(tok);
  }
  return result;
}

function demoteExtraPrimary(tokens) {
  let seen = false;
  for (let i = 0; i < tokens.length; i += 1) {
    if (tokens[i] !== "ˈ") continue;
    if (seen) tokens[i] = "ˌ";
    seen = true;
  }
  return tokens;
}

function vowelCount(tokens) {
  let n = 0;
  for (const tok of tokens) if (isVowelTok(tok)) n += 1;
  return n;
}

/* city /ˈsɪti/, ability /əˈbɪləti/. Stressed ɪ (bit, live) stays ɪ. */
function happyTensing(tokens) {
  if (vowelCount(tokens) < 2) return tokens;
  let lastVowel = -1;
  let stressOnLast = null;
  let pending = null;
  for (let i = 0; i < tokens.length; i += 1) {
    const tok = tokens[i];
    if (STRESS.has(tok)) {
      pending = tok;
      continue;
    }
    if (isVowelTok(tok)) {
      lastVowel = i;
      stressOnLast = pending;
      pending = null;
    }
  }
  // happy, city, coffee. Not minute or English, where ɪ is followed by a consonant.
  if (lastVowel === tokens.length - 1 && tokens[lastVowel] === "ɪ" && stressOnLast !== "ˈ") {
    tokens[lastVowel] = "i";
  }
  return tokens;
}

function destressMonosyllable(tokens) {
  if (vowelCount(tokens) !== 1) return tokens;
  return tokens.filter((tok) => !STRESS.has(tok));
}

function normalizeWord(raw) {
  const mapped = mapSymbols(raw);
  if (!mapped) throw new Error("empty IPA");
  let tokens = tokenize(mapped);
  tokens = shiftStress(tokens);
  tokens = demoteExtraPrimary(tokens);
  tokens = happyTensing(tokens);
  tokens = destressMonosyllable(tokens);
  if (!vowelCount(tokens)) throw new Error("no vowel in " + raw);
  return tokens.join("");
}

function normalizeEspeak(raw) {
  const text = String(raw || "").replace(/\s+/g, " ").trim();
  if (!text) throw new Error("empty espeak IPA");
  return text.split(" ").map(normalizeWord).join(" ");
}

module.exports = {
  normalizeEspeak,
  normalizeWord,
};

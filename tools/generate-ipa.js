/* Build data/ipa-bre.json for 中考 / 高考 ordinary words and 固定搭配.
 *
 * Source: espeak-ng 1.51 voice en-gb-x-rp (`espeak-ng -v en-gb-x-rp -q --ipa`),
 * which is a rule-based BrE G2P, not a learner dictionary. tools/ipa/normalize.js
 * then rewrites that into broad exam IPA:
 *   stress mark at the start of the syllable, ɹ→r, ɐ→ə, ɛ→e,
 *   unstressed word-final ɪ→i, no stress mark on a one-syllable word.
 * tools/ipa/overrides.json replaces the G2P where the isolated spelling
 * picks the other homograph (live v., use v., present v., increase v.),
 * where "used to" is /juːst/, and for the article weak forms.
 * Initialisms (WHO, UK, a.m.) are letter names, not the espeak word.
 * A slash lemma is expanded (arrive at/in a place → both phrases) and
 * stored as /…/ / /…/ with a "slash" flag. "..." and a lone "." become ….
 *
 * Phrases are composed from citation forms of each word so "at a" does not
 * collapse into one espeak token. Re-run:
 *   node tools/generate-ipa.js
 *   node tools/stamp-ipa.js
 *
 * Requires espeak-ng on PATH (apt package espeak-ng). The committed map is
 * what stamp and the collocation append scripts read, so stamping does not
 * need espeak.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { spawnSync } = require("child_process");
const { normalizeEspeak } = require("./ipa/normalize");

const root = path.join(__dirname, "..");
const examPath = path.join(root, "grok", "exam-tracks.js");
const outPath = path.join(root, "data", "ipa-bre.json");
const overrides = JSON.parse(fs.readFileSync(path.join(__dirname, "ipa", "overrides.json"), "utf8"));

const LETTER = {
  a: "eɪ", b: "biː", c: "siː", d: "diː", e: "iː", f: "ef", g: "dʒiː", h: "eɪtʃ",
  i: "aɪ", j: "dʒeɪ", k: "keɪ", l: "el", m: "em", n: "en", o: "əʊ", p: "piː",
  q: "kjuː", r: "ɑː", s: "es", t: "tiː", u: "juː", v: "viː", w: "dʌbljuː",
  x: "eks", y: "waɪ", z: "zed",
};

const INITIALISMS = new Set([
  "AI", "PE", "TV", "UK", "USA", "CPC", "PLA", "PRC", "UN", "WHO", "WTO",
  "BC", "DPRK", "ROK",
]);

const IPA_RE = /^\/[^\s/][^/]*\/(?: \/ \/[^\s/][^/]*\/)*$/;

function loadTracks() {
  const ctx = { window: {} };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(examPath, "utf8"), ctx);
  return ctx.window.VOCAB_EXAM_TRACKS;
}

function surfacesOf(tracks) {
  const list = [];
  const seen = new Set();
  for (const track of tracks) {
    if (!track || (track.id !== "zhongkao" && track.id !== "gaokao")) continue;
    for (const set of track.sets || []) {
      for (const card of set || []) {
        if (!card || !card.word) continue;
        const key = card.word + "|" + (card.pos || "");
        if (seen.has(key)) continue;
        seen.add(key);
        list.push({ word: card.word, pos: card.pos || "" });
      }
    }
  }
  return list;
}

function normApos(text) {
  return String(text || "").replace(/[’‘]/g, "'");
}

function expandSlash(surface) {
  let opts = [[]];
  for (const part of normApos(surface).split(/\s+/).filter(Boolean)) {
    const alts = part.split("/");
    const next = [];
    for (const base of opts) {
      for (const alt of alts) next.push(base.concat(alt));
    }
    opts = next;
  }
  return opts.map((parts) => parts.join(" "));
}

function tokenizePhrase(phrase) {
  const tokens = [];
  for (const raw of phrase.split(/\s+/).filter(Boolean)) {
    if (raw === "." || raw === "...") {
      tokens.push({ kind: "break" });
      continue;
    }
    if (raw.includes("...")) {
      const bits = raw.split("...");
      bits.forEach((bit, i) => {
        if (i) tokens.push({ kind: "break" });
        if (bit) tokens.push({ kind: "word", text: bit });
      });
      continue;
    }
    tokens.push({ kind: "word", text: raw });
  }
  return tokens;
}

function initialismLetters(token) {
  if (/^[A-Za-z]\.[A-Za-z]\.$/.test(token)) return token.replace(/\./g, "").split("");
  if (INITIALISMS.has(token)) return token.split("");
  return null;
}

function spellLetters(letters) {
  const names = letters.map((ch) => {
    const name = LETTER[ch.toLowerCase()];
    if (!name) throw new Error("no letter name for " + ch);
    return name;
  });
  if (names.length === 1) return names[0];
  return names.map((name, i) => (i === names.length - 1 ? "ˈ" : "ˌ") + name).join(" ");
}

function espeakAll(tokens) {
  if (!tokens.length) return new Map();
  const input = tokens.join("\n") + "\n";
  const res = spawnSync("espeak-ng", ["-v", "en-gb-x-rp", "-q", "--ipa"], {
    input,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (res.error) throw res.error;
  if (res.status !== 0) throw new Error(res.stderr || "espeak-ng failed");
  const lines = res.stdout.split("\n");
  if (lines.length && lines[lines.length - 1] === "") lines.pop();
  if (lines.length !== tokens.length) {
    throw new Error("espeak-ng returned " + lines.length + " lines for " + tokens.length + " tokens");
  }
  const map = new Map();
  for (let i = 0; i < tokens.length; i += 1) {
    map.set(tokens[i], normalizeEspeak(lines[i]));
  }
  return map;
}

function composePhrase(phrase, spoken) {
  const bits = [];
  for (const tok of tokenizePhrase(phrase)) {
    if (tok.kind === "break") {
      bits.push("…");
      continue;
    }
    const letters = initialismLetters(tok.text);
    if (letters) {
      bits.push(spellLetters(letters));
      continue;
    }
    const lower = tok.text.toLowerCase();
    if (overrides.tokens && overrides.tokens[lower]) {
      bits.push(overrides.tokens[lower]);
      continue;
    }
    if (!spoken.has(tok.text)) throw new Error("no G2P for token " + JSON.stringify(tok.text));
    bits.push(spoken.get(tok.text));
  }
  return bits.join(" ").replace(/\s+/g, " ").trim();
}

function flagsFor(surface) {
  const flags = [];
  if (surface.includes("/")) flags.push("slash");
  if (surface.includes("...")) flags.push("ellipsis");
  if (/(^|\s)\.(?=\s|$)/.test(surface)) flags.push("slot");
  return flags;
}

function main() {
  const version = spawnSync("espeak-ng", ["--version"], { encoding: "utf8" });
  if (version.status !== 0) throw new Error("espeak-ng is not available");
  const tracks = loadTracks();
  const cards = surfacesOf(tracks);
  const tokenSet = new Set();
  for (const card of cards) {
    const key = card.word + "|" + card.pos;
    if (overrides.surfaces && overrides.surfaces[key]) continue;
    for (const phrase of expandSlash(card.word)) {
      for (const tok of tokenizePhrase(phrase)) {
        if (tok.kind !== "word") continue;
        if (initialismLetters(tok.text)) continue;
    const lower = tok.text.toLowerCase();
    if (overrides.tokens && overrides.tokens[lower]) continue;
        tokenSet.add(normApos(tok.text));
      }
    }
  }
  const tokens = [...tokenSet].sort();
  const spoken = espeakAll(tokens);
  const entries = {};
  const flags = {};
  const problems = [];
  for (const card of cards) {
    const key = card.word + "|" + card.pos;
    let ipa = "";
    const flag = flagsFor(card.word);
    if (overrides.surfaces && overrides.surfaces[key]) {
      ipa = overrides.surfaces[key];
      flag.push("override");
    } else {
      const alts = expandSlash(card.word).map((phrase) => composePhrase(phrase, spoken));
      ipa = alts.map((body) => "/" + body + "/").join(" / ");
    }
    if (!IPA_RE.test(ipa)) problems.push(key + " → " + ipa);
    entries[key] = ipa;
    if (flag.length) flags[key] = flag;
  }
  if (problems.length) {
    throw new Error(problems.length + " IPA failed the slash check\n" + problems.slice(0, 20).join("\n"));
  }
  const ordered = {};
  for (const key of Object.keys(entries).sort()) ordered[key] = entries[key];
  const orderedFlags = {};
  for (const key of Object.keys(flags).sort()) orderedFlags[key] = flags[key];
  const payload = {
    meta: {
      voice: String(version.stdout || version.stderr || "").trim().split("\n")[0],
      g2p: "espeak-ng -v en-gb-x-rp -q --ipa, then tools/ipa/normalize.js",
      overrides: "tools/ipa/overrides.json",
      style: "Broad BrE inside /slashes/. Stress on the syllable onset. Monosyllables unmarked.",
      tracks: ["zhongkao", "gaokao"],
      cards: "ordinary words and 固定搭配",
      rerun: "node tools/generate-ipa.js && node tools/stamp-ipa.js",
    },
    entries: ordered,
    flags: orderedFlags,
  };
  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2) + "\n");
  const flagCounts = {};
  for (const list of Object.values(orderedFlags)) {
    for (const name of list) flagCounts[name] = (flagCounts[name] || 0) + 1;
  }
  console.log(JSON.stringify({
    entries: Object.keys(ordered).length,
    cards: cards.length,
    tokens: tokens.length,
    flags: flagCounts,
    out: path.relative(root, outPath),
  }, null, 2));
}

if (require.main === module) {
  try {
    main();
  } catch (err) {
    console.error(err && err.stack ? err.stack : err);
    process.exit(1);
  }
}

module.exports = { expandSlash, composePhrase, spellLetters, initialismLetters };

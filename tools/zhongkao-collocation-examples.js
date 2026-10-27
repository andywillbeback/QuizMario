/* Check that an original example actually uses the collocation. */
"use strict";

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function tokenPattern(word) {
  const w = String(word || "").replace(/[’‘]/g, "'");
  if (w === "one's") return "\\S+";
  if (w === "oneself") return "(?:oneself|myself|yourself|himself|herself|ourselves|themselves)";
  if (w === ".") return "\\S+";
  if (w === "be") return "(?:be|am|is|are|was|were)";
  if (w.includes("/")) {
    return "(?:" + w.split("/").map((part) => escapeRegExp(part)).join("|") + ")";
  }
  return escapeRegExp(w);
}

function bounded(pattern) {
  return "(?<![A-Za-z])(?:" + pattern + ")(?![A-Za-z])";
}

function lemmaRegExp(lemma) {
  const raw = String(lemma || "").replace(/[’‘]/g, "'").trim();
  const chunks = raw.split("...");
  const chunkRes = chunks.map((chunk) => {
    const words = chunk.trim().split(/\s+/).filter(Boolean);
    return words.map((word, i) => {
      const piece = bounded(tokenPattern(word));
      if (i === 0) return piece;
      return "(?:\\s+\\S+){0,3}\\s+" + piece;
    }).join("");
  });
  return new RegExp(chunkRes.join("[\\s\\S]{1,80}"), "i");
}

function exampleCoversLemma(lemma, example) {
  return lemmaRegExp(lemma).test(String(example || ""));
}

module.exports = { exampleCoversLemma, lemmaRegExp };

/* Copy ipa from data/ipa-bre.json onto 中考 / 高考 cards in grok/exam-tracks.js.
 *
 * Adds the optional field only. word, pos, gloss, examples, scene, root_group,
 * and related stay in place, so card keys and answer checks do not move.
 * Ordinary cards and 固定搭配 cards are both stamped. Root exam-tracks.js is
 * left alone (it has no 固定搭配 sets).
 *
 * Run after tools/generate-ipa.js:
 *   node tools/stamp-ipa.js
 *
 * tools/append-zhongkao-collocations.js and tools/append-gaokao-collocations.js
 * read the same map when they rebuild 固定搭配, so a later append keeps ipa.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { loadMap, ipaFor } = require("./ipa-lookup");

const root = path.join(__dirname, "..");
const examPath = path.join(root, "grok", "exam-tracks.js");

function loadTracks(file) {
  const ctx = { window: {} };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(file, "utf8"), ctx);
  return ctx.window.VOCAB_EXAM_TRACKS;
}

function withIpa(card, ipa) {
  const next = {};
  let placed = false;
  for (const key of Object.keys(card)) {
    if (key === "ipa") continue;
    if (key === "related") {
      next.ipa = ipa;
      placed = true;
    }
    next[key] = card[key];
  }
  if (!placed) next.ipa = ipa;
  return next;
}

function main() {
  const raw = fs.readFileSync(examPath, "utf8");
  const marker = "window.VOCAB_EXAM_TRACKS = ";
  const start = raw.indexOf(marker);
  const end = raw.indexOf(";\n(function");
  if (start < 0 || end < 0) throw new Error("Could not find VOCAB_EXAM_TRACKS assignment");
  let header = raw.slice(0, start);
  const tail = raw.slice(end);
  if (!header.includes("stamp-ipa.js")) {
    header = header.replace(
      "Official sets first; 拓展 sets follow. */",
      "Official sets first; 拓展 sets follow. Optional ipa is stamped by tools/stamp-ipa.js from data/ipa-bre.json. */"
    );
  }
  const tracks = loadTracks(examPath);
  const map = loadMap();
  const missing = [];
  const counts = {};
  for (const track of tracks) {
    if (!track || (track.id !== "zhongkao" && track.id !== "gaokao")) continue;
    let n = 0;
    for (const set of track.sets || []) {
      for (let i = 0; i < set.length; i += 1) {
        const card = set[i];
        const ipa = ipaFor(card.word, card.pos || "", map);
        if (!ipa) missing.push(track.id + " " + card.word + "|" + (card.pos || ""));
        else set[i] = withIpa(card, ipa);
        n += 1;
      }
    }
    counts[track.id] = n;
  }
  if (missing.length) {
    throw new Error(missing.length + " cards have no ipa\n" + missing.slice(0, 20).join("\n"));
  }
  fs.writeFileSync(examPath, header + marker + JSON.stringify(tracks) + tail);
  console.log(JSON.stringify({ stamped: counts, file: "grok/exam-tracks.js" }, null, 2));
}

if (require.main === module) {
  try {
    main();
  } catch (err) {
    console.error(err.message || err);
    process.exit(1);
  }
}

module.exports = { withIpa };

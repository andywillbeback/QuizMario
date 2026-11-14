/* Split the live 中考 / 高考 / 原版核心 / 雅思 banks into one JSON file per set.
 * The generated files are what grok/index.html loads. words.js, exam-tracks.js
 * and data/ielts-v1/bank.json stay the source for tests and the word universe.
 *
 * Run: node tools/split-live-banks.js
 */
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const VERSION = "20261113-set1";
const root = path.join(__dirname, "..");
const outDir = path.join(root, "grok", "data", "banks", VERSION);

function loadWindow(file) {
  const context = { window: {} };
  context.window.window = context.window;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), context, { filename: file });
  return context.window;
}

function norm(value) {
  return String(value == null ? "" : value)
    .trim()
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/\s+/g, " ");
}

function isCollocationHead(text) {
  const raw = String(text || "");
  return /\s/.test(raw) || raw.indexOf("...") !== -1 || raw.indexOf("…") !== -1;
}

function coreTitle(part, index) {
  const setNum = Math.floor(index / 2) + 1;
  const partLetter = index % 2 === 0 ? "A" : "B";
  const scene = part && part[0] && part[0].scene ? part[0].scene : "复习 · Review";
  return scene + " · 第" + setNum + "组 · Part " + partLetter;
}

function pad(index) {
  return String(index).padStart(3, "0");
}

function writeSet(trackId, index, cards, links) {
  const dir = path.join(outDir, trackId);
  fs.mkdirSync(dir, { recursive: true });
  const body = links.length ? { cards: cards, links: links } : { cards: cards };
  const file = path.join(dir, pad(index) + ".json");
  fs.writeFileSync(file, JSON.stringify(body));
  return fs.statSync(file).size;
}

function publish(trackId, name, desc, sets, titles) {
  const first = new Map();
  sets.forEach((cards, levelIdx) => {
    for (const card of cards) {
      const key = norm(card && card.word);
      if (!key || first.has(key)) continue;
      first.set(key, { levelIdx: levelIdx, word: card });
    }
  });
  let bytes = 0;
  let largest = 0;
  let linkCount = 0;
  sets.forEach((cards, index) => {
    const links = [];
    const seen = new Set();
    for (const card of cards) {
      const related = card && Array.isArray(card.related) ? card.related : [];
      for (const item of related) {
        if (typeof item !== "string" || !isCollocationHead(item)) continue;
        const hit = first.get(norm(item));
        if (!hit || hit.levelIdx === index) continue;
        const key = hit.levelIdx + "\n" + norm(hit.word.word);
        if (seen.has(key)) continue;
        seen.add(key);
        links.push({ levelIdx: hit.levelIdx, word: hit.word });
      }
    }
    linkCount += links.length;
    const size = writeSet(trackId, index, cards, links);
    bytes += size;
    if (size > largest) largest = size;
  });
  const entries = sets.reduce((sum, cards) => sum + cards.length, 0);
  console.log(JSON.stringify({
    track: trackId,
    sets: sets.length,
    entries: entries,
    links: linkCount,
    jsonKB: Math.round(bytes / 1024),
    largestKB: Math.round(largest / 1024),
  }));
  return {
    id: trackId,
    name: name,
    desc: desc,
    titles: titles,
    entryCount: entries,
    setCount: sets.length,
  };
}

function main() {
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  const exam = loadWindow("grok/exam-tracks.js");
  const words = loadWindow("grok/words.js");
  const ielts = JSON.parse(fs.readFileSync(path.join(root, "grok/data/ielts-v1/bank.json"), "utf8"));
  const tracks = {};
  for (const track of exam.VOCAB_EXAM_TRACKS) {
    tracks[track.id] = publish(track.id, track.name, track.desc, track.sets, track.titles);
  }
  const levels = words.VOCAB_LEVELS;
  tracks.core = publish(
    "core",
    "原版核心",
    "核心词库 3000 词，100 组 × Part A/B（每部分 15 词）",
    levels,
    levels.map(coreTitle)
  );
  tracks.ielts = publish(ielts.id, ielts.name || "雅思", ielts.desc, ielts.sets, ielts.titles);
  const manifest = { version: VERSION, tracks: tracks };
  const js = "window.QUIZMARIO_BANK_MANIFEST=" + JSON.stringify(manifest) + ";\n";
  fs.writeFileSync(path.join(outDir, "manifest.js"), js);
  console.log(JSON.stringify({
    manifestKB: Math.round(Buffer.byteLength(js) / 1024),
    version: VERSION,
  }));
}

main();

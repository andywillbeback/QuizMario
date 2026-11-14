"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const version = "20261113-set1";
const bankRoot = path.join(root, "grok", "data", "banks", version);

function loadWindow(file) {
  const context = { window: {} };
  context.window.window = context.window;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), context, { filename: file });
  return context.window;
}

function norm(value) {
  return String(value || "").trim().toLowerCase().replace(/[’‘]/g, "'").replace(/\s+/g, " ");
}

function readSet(id, index) {
  const file = path.join(bankRoot, id, String(index).padStart(3, "0") + ".json");
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function sameCard(actual, expected, label) {
  assert.equal(JSON.stringify(actual), JSON.stringify(expected), label);
}

const exam = loadWindow("grok/exam-tracks.js").VOCAB_EXAM_TRACKS;
const core = loadWindow("grok/words.js").VOCAB_LEVELS;
const ielts = JSON.parse(fs.readFileSync(path.join(root, "grok/data/ielts-v1/bank.json"), "utf8"));
const manifest = loadWindow("grok/data/banks/" + version + "/manifest.js").QUIZMARIO_BANK_MANIFEST;
const sources = {
  zhongkao: exam.find((track) => track.id === "zhongkao"),
  gaokao: exam.find((track) => track.id === "gaokao"),
  core: { id: "core", sets: core, titles: manifest.tracks.core.titles, desc: manifest.tracks.core.desc, entryCount: core.reduce((sum, set) => sum + set.length, 0) },
  ielts: ielts,
};

assert.equal(manifest.version, version);
for (const id of Object.keys(sources)) {
  const source = sources[id];
  const meta = manifest.tracks[id];
  assert.equal(meta.setCount, source.sets.length, id);
  assert.equal(meta.titles.length, source.sets.length, id);
  assert.equal(meta.entryCount, source.sets.reduce((sum, set) => sum + set.length, 0), id);
  source.sets.forEach((cards, index) => {
    const payload = readSet(id, index);
    sameCard(payload.cards, cards, id + " set " + index);
    for (const link of payload.links || []) {
      const canonical = source.sets[link.levelIdx].find((card) => norm(card.word) === norm(link.word.word));
      assert.ok(canonical, id + " link target " + link.word.word);
      assert.equal(JSON.stringify(link.word), JSON.stringify(canonical), id + " link card " + link.word.word);
    }
  });
}

const index = fs.readFileSync(path.join(root, "grok/index.html"), "utf8");
assert.equal(/src="words\.js"/.test(index), false);
assert.equal(/src="exam-tracks\.js"/.test(index), false);
assert.ok(index.indexOf("manifest.js") < index.indexOf('src="bank-loader.js'));
assert.ok(index.indexOf('src="bank-loader.js') < index.indexOf('src="sync.js'));
console.log("live banks ok: set files match the source banks and startup no longer lists them");

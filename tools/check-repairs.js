/* Validate data/repairs/slice-*.json against the inbox TSV slices.
 * Run: node tools/check-repairs.js
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { isTemplateExample } = require("./example-templates");

const root = path.join(__dirname, "..");
const dir = path.join(root, "data/repairs");
const inbox = path.join(dir, "inbox");

function rowsOf(file) {
  return fs.readFileSync(file, "utf8").split("\n").map((l) => l.trim()).filter(Boolean);
}

function skeleton(example, word) {
  const re = new RegExp("\\b" + String(word).replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "ig");
  return example.replace(re, "WORD").replace(/\s+/g, " ").trim().toLowerCase();
}

function containsWord(example, word) {
  const re = new RegExp("\\b" + String(word).replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "i");
  return re.test(example);
}

const problems = [];
let total = 0;
const skel = new Map();

for (let i = 0; i < 12; i++) {
  const tsv = path.join(inbox, "slice-" + i + ".tsv");
  const jsonPath = path.join(dir, "slice-" + i + ".json");
  if (!fs.existsSync(tsv)) continue;
  const rows = rowsOf(tsv).map((line) => {
    const [pos, word, meaning] = line.split("\t");
    return { pos, word, meaning };
  });
  if (!fs.existsSync(jsonPath)) {
    problems.push("missing " + path.basename(jsonPath) + " (" + rows.length + " words)");
    continue;
  }
  let data;
  try {
    data = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
  } catch (e) {
    problems.push("invalid JSON " + path.basename(jsonPath) + ": " + e.message);
    continue;
  }
  const keys = new Set(Object.keys(data));
  for (const row of rows) {
    total += 1;
    if (!keys.has(row.word)) {
      problems.push("absent " + row.word);
      continue;
    }
    keys.delete(row.word);
    const fix = data[row.word];
    const en = fix.example_en || "";
    const zh = fix.example_zh || "";
    if (!containsWord(en, row.word)) problems.push("headword missing: " + row.word + " / " + en);
    if (isTemplateExample(en)) problems.push("template: " + row.word + " / " + en);
    if (!/[\u4e00-\u9fff]/.test(zh) || zh.length < 4) problems.push("weak Chinese: " + row.word + " / " + zh);
    const sk = skeleton(en, row.word);
    if (!skel.has(sk)) skel.set(sk, []);
    skel.get(sk).push(row.word);
  }
  for (const extra of keys) problems.push("extra key in slice " + i + ": " + extra);
}

const repeated = [...skel.entries()].filter(([, words]) => words.length > 2);
for (const [sk, words] of repeated) {
  problems.push("skeleton x" + words.length + " " + sk + " :: " + words.slice(0, 8).join(","));
}

console.log(JSON.stringify({
  checked: total,
  problems: problems.length,
  repeatedSkeletons: repeated.length,
  sample: problems.slice(0, 40),
}, null, 2));
process.exit(problems.length ? 1 : 0);

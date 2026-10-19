/* Patch words.js from data/repairs/*.json, then the exam-track builder
 * re-applies the same map so a later rebuild cannot copy a template sentence.
 *
 * Run: node tools/apply-example-repairs.js
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { isTemplateExample } = require("./example-templates");

const root = path.join(__dirname, "..");

function loadRepairs() {
  const dir = path.join(root, "data/repairs");
  const map = new Map();
  for (const name of fs.readdirSync(dir).filter((f) => f.endsWith(".json")).sort()) {
    const obj = JSON.parse(fs.readFileSync(path.join(dir, name), "utf8"));
    for (const [word, fix] of Object.entries(obj)) {
      if (!fix || typeof fix !== "object") throw new Error("Bad repair for " + word);
      if (fix.example_en && isTemplateExample(fix.example_en)) {
        throw new Error("Repair is still a template: " + word + " / " + fix.example_en);
      }
      map.set(word, fix);
    }
  }
  return map;
}

function replaceField(block, field, value) {
  const re = new RegExp(field + ": \"(?:\\\\.|[^\"\\\\])*\"");
  if (!re.test(block)) throw new Error("Missing " + field + " in block starting " + block.slice(0, 80));
  return block.replace(re, field + ": " + JSON.stringify(value));
}

function patchSource(src, repairs) {
  let changed = 0;
  let glosses = 0;
  const missing = [];
  for (const [word, fix] of repairs) {
    const token = "word: " + JSON.stringify(word) + ",";
    const idx = src.indexOf(token);
    if (idx < 0) {
      missing.push(word);
      continue;
    }
    const start = src.lastIndexOf("\n    {", idx);
    const endRel = src.indexOf("\n    }", idx);
    if (start < 0 || endRel < 0) throw new Error("Cannot find entry block for " + word);
    const end = endRel + "\n    }".length;
    let block = src.slice(start + 1, end);
    if (fix.meaning_zh) {
      block = replaceField(block, "meaning_zh", fix.meaning_zh);
      block = replaceField(block, "explain_zh", "中考/CEFR 常用词：" + fix.meaning_zh);
      glosses += 1;
    }
    if (fix.pos) block = replaceField(block, "pos", fix.pos);
    if (fix.example_en) block = replaceField(block, "example_en", fix.example_en);
    if (fix.example_zh) block = replaceField(block, "example_zh", fix.example_zh);
    src = src.slice(0, start + 1) + block + src.slice(end);
    changed += 1;
  }
  return { src, changed, glosses, missing };
}

function main() {
  const repairs = loadRepairs();
  const file = path.join(root, "words.js");
  const original = fs.readFileSync(file, "utf8");
  const result = patchSource(original, repairs);
  if (result.src === original) {
    console.log("words.js unchanged");
  } else {
    fs.writeFileSync(file, result.src);
  }
  console.log(JSON.stringify({
    repairs: repairs.size,
    patched: result.changed,
    glosses: result.glosses,
    notInWordsJs: result.missing,
  }, null, 2));
}

if (require.main === module) main();

module.exports = { loadRepairs };

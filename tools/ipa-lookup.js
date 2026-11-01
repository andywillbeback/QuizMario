/* Read data/ipa-bre.json. Keys are "<word>|<pos>" for the exact card surface. */
"use strict";

const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const defaultFile = path.join(root, "data", "ipa-bre.json");

function loadMap(file) {
  const data = JSON.parse(fs.readFileSync(file || defaultFile, "utf8"));
  if (!data || !data.entries || typeof data.entries !== "object") {
    throw new Error("ipa map has no entries");
  }
  return data;
}

function ipaFor(word, pos, map) {
  const entries = map && map.entries ? map.entries : map;
  if (!entries) return "";
  const key = String(word == null ? "" : word) + "|" + String(pos == null ? "" : pos);
  return entries[key] || "";
}

module.exports = { loadMap, ipaFor, defaultFile };

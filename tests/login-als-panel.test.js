"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const le = require("../learner-events");

const rootDir = path.join(__dirname, "..");

function read(name) {
  return fs.readFileSync(path.join(rootDir, name), "utf8");
}

const banned = [
  "ALS 学习信号",
  "下载 JSONL",
  "复制 JSONL",
  "已写入 Supabase learner_events",
  "ingest_learner_events",
  "learner_events_inbox",
  "learner-events-panel",
  "btn-export-learner-events",
  "btn-copy-learner-events",
];

const login = read("login.html");
const loginScripts = [];
for (const match of login.matchAll(/<script\s+[^>]*src="([^"]+)"/g)) {
  if (!/^https?:/i.test(match[1])) loginScripts.push(match[1]);
}
assert.ok(loginScripts.includes("auth-page.js"), "login still loads auth-page.js");
assert.ok(!loginScripts.includes("learner-events.js"), "login must not load the ingest script");

for (const name of ["login.html", ...loginScripts]) {
  const text = read(name);
  for (const needle of banned) {
    assert.ok(!text.includes(needle), name + " exposes ALS ingest copy to students: " + needle);
  }
}

const index = read("index.html");
for (const needle of [
  "ALS 学习信号",
  "下载 JSONL",
  "复制 JSONL",
  'id="learner-events-panel"',
  'id="btn-export-learner-events"',
  'id="btn-copy-learner-events"',
]) {
  assert.ok(!index.includes(needle), "student home HTML still exposes " + needle);
}
assert.ok(index.includes('src="learner-events.js"'), "game still emits learner events");
assert.ok(
  index.includes('id="btn-clear-als"') && index.includes('href="http://127.0.0.1:8501/"'),
  "clear-path ALS practice link stays"
);

function page(opts) {
  const nodes = {};
  function make(id) {
    const node = {
      id: id || "",
      className: "",
      hidden: false,
      textContent: "",
      children: [],
      parentNode: null,
      attrs: {},
      setAttribute(name, value) { node.attrs[name] = String(value); },
      getAttribute(name) { return node.attrs[name]; },
      addEventListener() {},
      appendChild(child) {
        child.parentNode = node;
        node.children.push(child);
        if (child.id) nodes[child.id] = child;
        return child;
      },
      removeChild(child) {
        node.children = node.children.filter((item) => item !== child);
        child.parentNode = null;
        if (child.id && nodes[child.id] === child) delete nodes[child.id];
      },
    };
    if (id) nodes[id] = node;
    return node;
  }

  const home = opts.home ? make("screen-home") : null;
  const stats = opts.home ? make("stats-panel") : null;
  if (home && stats) home.appendChild(stats);
  if (opts.panel) {
    const panel = make("learner-events-panel");
    panel.textContent = "ALS 学习信号";
    (home || make("orphan")).appendChild(panel);
  }

  const storage = {};
  return {
    location: { search: opts.search || "" },
    localStorage: {
      getItem(key) { return Object.prototype.hasOwnProperty.call(storage, key) ? storage[key] : null; },
      setItem(key, value) { storage[key] = String(value); },
      removeItem(key) { delete storage[key]; },
    },
    document: {
      getElementById(id) { return nodes[id] || null; },
      createElement() { return make(""); },
      addEventListener() {},
      visibilityState: "visible",
    },
    addEventListener() {},
  };
}

{
  const host = page({ panel: true, home: true });
  le.installBrowser(host);
  assert.strictEqual(host.document.getElementById("learner-events-panel"), null,
    "the game home strips a shipped ingest panel unless debug is on");
}

{
  const host = page({ panel: true, home: false, search: "?alsDebug=1" });
  le.installBrowser(host);
  assert.strictEqual(host.document.getElementById("learner-events-panel"), null,
    "alsDebug does not leave the ingest panel on a login document");
  assert.strictEqual(host.document.getElementById("btn-export-learner-events"), null);
}

{
  const host = page({ panel: false, home: true, search: "?alsDebug=1" });
  le.installBrowser(host);
  const panel = host.document.getElementById("learner-events-panel");
  assert.ok(panel, "alsDebug mounts the ingest panel on the game home");
  assert.strictEqual(panel.getAttribute("data-als-debug"), "1");
  assert.strictEqual(host.document.getElementById("btn-export-learner-events").textContent, "下载 JSONL");
  assert.strictEqual(host.document.getElementById("btn-copy-learner-events").textContent, "复制 JSONL");
  const title = panel.children.find((child) => child.textContent === "ALS 学习信号");
  assert.ok(title, "debug panel is labeled ALS 学习信号");
}

console.log("login als panel ok");

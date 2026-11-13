"use strict";

const assert = require("node:assert/strict");
const create = require("../grok/bank-loader");

const manifest = { version: "20261113-set1", tracks: {
  zhongkao: { id: "zhongkao", name: "中考", desc: "目录", titles: ["中考 · 第1组", "中考 · 第2组"], entryCount: 2, setCount: 2 },
  gaokao: { id: "gaokao", name: "高考", desc: "目录", titles: ["高考 · 第1组"], entryCount: 1, setCount: 1 },
  ielts: { id: "ielts", name: "雅思", desc: "目录", titles: ["雅思 · 第1组"], entryCount: 1, setCount: 1 },
  core: { id: "core", name: "原版核心", desc: "目录", titles: ["核心"], entryCount: 1, setCount: 1 },
}};

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

(async () => {
  const requests = [];
  const gate = deferred();
  const host = {
    VOCAB_TRACKS: [{ id: "core", name: "原版核心", sets: null }],
    QUIZMARIO_BANK_MANIFEST: manifest,
    fetch(url) {
      requests.push(url);
      if (String(url).endsWith("/zhongkao/000.json")) return gate.promise;
      return Promise.resolve({ ok: true, text: async () => JSON.stringify({ cards: [{ word: "later", meaning_zh: "以后" }] }) });
    },
    setTimeout, clearTimeout,
    addEventListener() {},
  };
  const banks = create(host);
  assert.deepEqual(host.VOCAB_TRACKS.map((track) => track.id), ["zhongkao", "gaokao", "ielts", "core"]);
  const track = await banks.prepare("zhongkao");
  assert.equal(track.manifestReady, true);
  assert.equal(track.sets.length, 2);
  assert.equal(requests.length, 0, "opening the directory does not download a set");
  let settled = false;
  const opening = banks.ensureSet("zhongkao", 0).then((cards) => { settled = true; return cards; });
  for (let i = 0; i < 8; i++) await Promise.resolve();
  assert.equal(settled, false);
  assert.deepEqual(requests, ["data/banks/20261113-set1/zhongkao/000.json"]);
  gate.resolve({ ok: true, text: async () => JSON.stringify({
    cards: [{ word: "able", meaning_zh: "能够", related: ["be able to"] }],
    links: [{ levelIdx: 1, word: { word: "be able to", meaning_zh: "能够" } }],
  }) });
  const cards = await opening;
  assert.equal(cards[0].word, "able");
  assert.equal(track.linkCards[0].word.word, "be able to");
  assert.equal(requests.length, 1, "a loaded set is not downloaded again");
  await banks.ensureSet("zhongkao", 0);
  assert.equal(requests.length, 1);
  console.log("bank loader ok: directory is local, one set downloads once, collocation links stay attached");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});

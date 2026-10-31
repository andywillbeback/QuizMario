/* Primary collocation hard gate on the EN→ZH practice path.
 * Run: node tests/colloc-gate.test.js
 *
 * Primary prefers a fixed verb phrase that contains the lemma as a whole
 * token (light verb, or an ellipsis pattern). Otherwise the first
 * phrase-shaped related entry with a card and a non-empty gloss.
 * Single-word reverse links are not gates. A missing card or blank gloss is
 * skipped. No usable entry means the lemma advances as it does today.
 */
"use strict";

const assert = require("assert");
const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");
const vm = require("vm");
const { spawn } = require("child_process");

if (typeof WebSocket === "undefined") {
  global.WebSocket = require("ws");
}

const root = path.join(__dirname, "..");
const related = require(path.join(root, "grok/related-links.js"));
const sense = require(path.join(root, "grok/sense-id.js"));

function read(name) {
  return fs.readFileSync(path.join(root, name), "utf8");
}

function loadTracks() {
  const ctx = { window: {} };
  vm.createContext(ctx);
  vm.runInContext(read("grok/exam-tracks.js"), ctx);
  return ctx.window.VOCAB_EXAM_TRACKS;
}

const tracks = loadTracks();
const zhongkao = tracks.find((t) => t.id === "zhongkao");
const gaokao = tracks.find((t) => t.id === "gaokao");
const zkIndex = related.indexTrack(zhongkao.sets);
const gkIndex = related.indexTrack(gaokao.sets);

function cardIn(track, word) {
  for (let i = 0; i < track.sets.length; i++) {
    const hit = track.sets[i].find((c) => c.word === word);
    if (hit) return hit;
  }
  return null;
}

{
  assert.strictEqual(related.primaryCollocation(null, zkIndex), null);
  assert.strictEqual(related.primaryCollocation({ word: "ability" }, null), null);
  assert.strictEqual(related.primaryCollocation({ word: "ability", related: [] }, zkIndex), null);
  assert.strictEqual(related.primaryCollocation({ word: "ability" }, zkIndex), null);

  const able = cardIn(zhongkao, "able");
  assert.ok(able && zhongkao.sets[0].some((c) => c.word === "able"));
  const ableGate = related.primaryCollocation(able, zkIndex);
  assert.strictEqual(ableGate.lemma, "be able to");
  assert.strictEqual(ableGate.gloss, "能够");
  assert.deepStrictEqual(ableGate.rest, []);

  const phrase = cardIn(zhongkao, "be able to");
  assert.deepStrictEqual(related.lemmas(phrase), ["be", "able"]);
  assert.strictEqual(related.primaryCollocation(phrase, zkIndex), null, "reverse lemma chips are not a gate");

  const zkAdvantage = cardIn(zhongkao, "advantage");
  assert.strictEqual(related.primaryCollocation(zkAdvantage, zkIndex), null);

  const advantage = cardIn(gaokao, "advantage");
  assert.ok(gaokao.sets[0].some((c) => c.word === "advantage"));
  assert.deepStrictEqual(related.lemmas(advantage), ["advantage over", "take advantage of"]);
  const advGate = related.primaryCollocation(advantage, gkIndex);
  assert.strictEqual(advGate.lemma, "take advantage of", "a fixed verb phrase that uses the lemma beats a near-synonym headed by it");
  assert.strictEqual(advGate.gloss, "利用（机会）");
  assert.deepStrictEqual(advGate.rest, ["advantage over"]);
  const take = cardIn(gaokao, "take advantage of");
  assert.strictEqual(take.meaning_zh, "利用（机会）");
  assert.strictEqual(related.primaryCollocation(take, gkIndex), null);
}

{
  const index = related.indexTrack([
    [{ word: "advantage", meaning_zh: "优势" }],
    [
      { word: "advantage over", meaning_zh: "胜过……的优势" },
      { word: "take advantage of", meaning_zh: "利用（机会）" },
      { word: "keep quiet", meaning_zh: "保持安静" },
      { word: "side note", meaning_zh: "附注" },
      { word: "keep alpha safe", meaning_zh: "保护甲" },
    ],
  ]);
  const both = related.primaryCollocation({
    word: "advantage",
    related: ["advantage over", "take advantage of"],
  }, index);
  assert.strictEqual(both.lemma, "take advantage of");
  assert.strictEqual(both.gloss, "利用（机会）");
  assert.deepStrictEqual(both.rest, ["advantage over"]);
  const nearOnly = related.primaryCollocation({
    word: "advantage",
    related: ["advantage over"],
  }, index);
  assert.strictEqual(nearOnly.lemma, "advantage over", "with no fixed verb phrase, the first usable phrase remains the gate");
  const lightMiss = related.primaryCollocation({
    word: "alpha",
    related: ["side note", "keep quiet"],
  }, index);
  assert.strictEqual(lightMiss.lemma, "side note", "a light verb that does not use the lemma does not jump the queue");
  const lightHit = related.primaryCollocation({
    word: "alpha",
    related: ["side note", "keep alpha safe"],
  }, index);
  assert.strictEqual(lightHit.lemma, "keep alpha safe");
  assert.deepStrictEqual(lightHit.rest, ["side note"]);
}

{
  const index = related.indexTrack([
    [{ word: "alpha", meaning_zh: "甲", related: ["gone phrase", "blank gloss", "keep going", "alpha"] }],
    [
      { word: "gone phrase", meaning_zh: "" },
      { word: "blank gloss", meaning_zh: "   " },
      { word: "keep going", meaning_zh: "继续", related: ["keep", "going"] },
    ],
  ]);
  const alpha = { word: "alpha", meaning_zh: "甲", related: ["missing phrase", "gone phrase", "blank gloss", "keep going"] };
  const primary = related.primaryCollocation(alpha, index);
  assert.strictEqual(primary.lemma, "keep going");
  assert.strictEqual(primary.gloss, "继续");
  assert.deepStrictEqual(primary.rest, ["missing phrase", "gone phrase", "blank gloss"]);
  assert.strictEqual(related.primaryCollocation({ word: "keep going", related: ["keep", "going"] }, index), null);
  assert.strictEqual(related.primaryCollocation({ word: "keep going", related: ["keep going"] }, index), null);
}

{
  const able = cardIn(zhongkao, "able");
  const flow = related.createCollocGate();
  assert.strictEqual(flow.onLemmaCorrect({ key: "zhongkao|0::ability", word: "ability" }, zkIndex, "meaning"), "complete");
  assert.strictEqual(flow.phase(), "idle");
  assert.strictEqual(flow.onLemmaCorrect(able, zkIndex, "form"), "complete", "ZH→EN does not open a meaning gate");
  assert.strictEqual(flow.onLemmaCorrect(able, zkIndex, "spelling"), "complete");

  assert.strictEqual(flow.onLemmaCorrect(able, zkIndex, "meaning"), "open");
  assert.strictEqual(flow.phase(), "gate");
  assert.strictEqual(flow.gate().primary.lemma, "be able to");
  assert.strictEqual(flow.gate().hostWord, "able");
  assert.strictEqual(flow.onLemmaCorrect(able, zkIndex, "meaning"), "stay", "a second lemma tap does not skip the open gate");
  assert.strictEqual(flow.onCollocAnswer(false), "stay");
  assert.strictEqual(flow.phase(), "gate");
  assert.strictEqual(flow.onCollocAnswer(false), "stay");
  assert.strictEqual(flow.gate().primary.gloss, "能够");
  assert.strictEqual(flow.onCollocAnswer(true), "complete");
  assert.strictEqual(flow.phase(), "idle");
  assert.strictEqual(flow.gate(), null);

  const again = related.createCollocGate();
  assert.strictEqual(again.onLemmaCorrect(able, zkIndex, "meaning"), "open");
  again.abandon();
  assert.strictEqual(again.phase(), "idle");
  assert.strictEqual(again.onLemmaCorrect(able, zkIndex, "meaning"), "open", "leaving the card does not arm a free pass");
  assert.strictEqual(again.onCollocAnswer(false), "stay");
}

{
  const game = read("grok/game.js");
  const index = read("grok/index.html");
  const rootGame = read("game.js");
  assert.ok(!rootGame.includes("renderCollocGate"), "root student app has no collocation gate");
  assert.ok(!game.includes("relatedLemmas"));
  assert.ok(index.includes("is-colloc-gate"));
  assert.ok(index.includes('src="related-links.js"'));
  assert.ok(index.indexOf('src="related-links.js"') < index.indexOf('src="game.js"'));

  const gradeIdx = game.indexOf("function grade(");
  const gradeSlice = game.slice(gradeIdx, gradeIdx + 900);
  assert.ok(gradeSlice.includes("sessionAnswerMode") && gradeSlice.includes("gradeSpelling"));

  const grade = game.slice(gradeIdx, game.indexOf("function confirmCorrect"));
  const head = grade.slice(0, grade.indexOf("awaiting = true"));
  const gateRegion = head.slice(head.indexOf('collocFlow.phase() === "gate"'));
  assert.ok(gateRegion.includes("showCollocRetry"));
  assert.ok(gateRegion.includes("renderCollocGate"));
  assert.ok(gateRegion.includes("onLemmaCorrect"));
  assert.ok(gateRegion.includes("onCollocAnswer"));
  assert.ok(!gateRegion.slice(0, gateRegion.indexOf("} else {")).includes("onLemmaCorrect"));
  assert.ok(!gateRegion.includes("schedule("));
  assert.ok(!gateRegion.includes("nextCard"));
  assert.ok(!gateRegion.includes("logAnswer"));
  assert.ok(!gateRegion.includes("pendingRate = true"));
  const body = grade.slice(grade.indexOf("awaiting = true"));
  assert.ok(body.includes("schedule(prog, 0"));
  assert.ok(body.includes("pendingRate = true"));
  assert.strictEqual((grade.match(/renderRelated\(true\)/g) || []).length, 2);

  const confirm = game.slice(game.indexOf("function confirmCorrect"), game.indexOf("function bindCollocFlow"));
  assert.ok(confirm.includes("schedule("));
  assert.ok(confirm.includes("setTimeout(nextCard"));
  const retry = game.slice(game.indexOf("function showCollocRetry"), game.indexOf("function renderCollocGate"));
  assert.ok(!retry.includes("schedule("));
  assert.ok(!retry.includes("nextCard"));
  assert.ok(!retry.includes("persist("));
  assert.ok(!retry.includes("logAnswer"));
  assert.ok(!retry.includes("getProg"));
  const paint = game.slice(game.indexOf("function renderCollocGate"), game.indexOf("function scoreDistractor"));
  assert.ok(paint.includes("paintChoices"));
  assert.ok(paint.includes("setUnknownVisible(false)"));
  assert.ok(paint.includes("data-colloc-gate"));
  const next = game.slice(game.indexOf("function nextCard"), game.indexOf("function softenHint"));
  assert.ok(next.indexOf("collocFlow.abandon()") < next.indexOf("queue.shift()"));
  assert.ok(game.slice(game.indexOf("function startLevel"), game.indexOf("function injectRequeues")).includes("collocFlow.abandon()"));
  assert.ok(game.slice(game.indexOf("function showScreen"), game.indexOf("function levelStars")).includes("collocFlow.abandon()"));
}

function plant(trackId, focusWord) {
  const track = tracks.find((t) => t.id === trackId);
  const future = Date.now() + 10 * 86400000;
  const cards = {};
  for (const w of track.sets[0]) {
    if (w.word === focusWord) continue;
    cards[sense.cardKeyFor(trackId, 0, w.word)] = {
      ef: 2.5,
      interval: 3,
      reps: 4,
      lapses: 0,
      due: future,
      correct: 4,
      wrong: 0,
      unknown: 0,
      mastery: 3,
      mastered: true,
      state: "review",
      scheduledAt: future,
    };
  }
  return {
    points: 4,
    streak: 0,
    bestStreak: 1,
    unlockedLevel: 1,
    cards: cards,
    levelStars: {},
    sortMode: "default",
    voiceOn: false,
    track: trackId,
    trackUnlock: { [trackId]: 1 },
    trackStars: { [trackId]: {} },
    daily: {},
    profile: { name: "小王", cls: "初三1班" },
    practice: {
      meaning: { n: 0, good: 0 },
      spelling: { n: 0, good: 0 },
      hint: { n: 0, good: 0 },
    },
    updatedAt: "2026-10-30T00:00:00.000Z",
  };
}

const SESSION = {
  access_token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMTExMTExMS0xMTExLTQxMTEtODExMS0xMTExMTExMTExMTEiLCJyb2xlIjoiYXV0aGVudGljYXRlZCIsImV4cCI6MTk5OTk5OTk5OX0.smoke",
  token_type: "bearer",
  expires_in: 3600,
  expires_at: 1999999999,
  refresh_token: "smoke-refresh",
  user: {
    id: "11111111-1111-4111-8111-111111111111",
    aud: "authenticated",
    role: "authenticated",
    email: "smoke.colloc.gate@example.com",
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: { display_name: "小王", class_name: "初三1班" },
    created_at: "2026-01-01T00:00:00.000Z",
    email_confirmed_at: "2026-01-01T00:00:00.000Z",
  },
};

function earlyScript(save) {
  return `(function () {
    try { localStorage.setItem("quizmario-auth", ${JSON.stringify(JSON.stringify(SESSION))}); } catch (e) {}
    try { sessionStorage.setItem("qm-phase", "signed"); } catch (e) {}
    try { localStorage.setItem("vocabSpotlight_v1", ${JSON.stringify(JSON.stringify(save))}); } catch (e) {}
    if (window.__QM_SMOKE_FETCH) return;
    window.__QM_SMOKE_FETCH = [];
    var orig = window.fetch ? window.fetch.bind(window) : null;
    function reply(status, payload) {
      return Promise.resolve(new Response(JSON.stringify(payload), {
        status: status,
        headers: { "content-type": "application/json" },
      }));
    }
    window.fetch = function (input, init) {
      var url = typeof input === "string" ? input : (input && input.url) || "";
      var method = ((init && init.method) || (input && input.method) || "GET").toUpperCase();
      if (!/supabase\\.co|quizmario-supabase-proxy\\.juguang-qm\\.workers\\.dev/i.test(url)) {
        if (!orig) return Promise.reject(new Error("no fetch"));
        return orig(input, init);
      }
      if (url.indexOf("/user_progress") !== -1) {
        if (method === "GET" || method === "HEAD") return reply(200, []);
        return reply(201, [{ user_id: ${JSON.stringify(SESSION.user.id)}, updated_at: "2026-01-01T00:00:00.000Z" }]);
      }
      if (url.indexOf("/learner_events") !== -1) return reply(200, []);
      if (url.indexOf("/auth/v1/user") !== -1) return reply(200, ${JSON.stringify(SESSION.user)});
      if (url.indexOf("/token") !== -1 || url.indexOf("/signup") !== -1) return reply(200, ${JSON.stringify(SESSION)});
      return reply(200, {});
    };
  })();`;
}

function contentType(file) {
  switch (path.extname(file)) {
    case ".html": return "text/html; charset=utf-8";
    case ".js": return "text/javascript; charset=utf-8";
    case ".svg": return "image/svg+xml";
    case ".png": return "image/png";
    case ".webmanifest": return "application/manifest+json";
    case ".m4a": return "audio/mp4";
    default: return "application/octet-stream";
  }
}

function startServer() {
  const server = http.createServer((req, res) => {
    const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
    const rel = urlPath === "/" ? "index.html" : urlPath.replace(/^\/+/, "");
    const file = path.normalize(path.join(root, rel));
    if (!file.startsWith(root)) {
      res.writeHead(403);
      res.end();
      return;
    }
    fs.readFile(file, (err, buf) => {
      if (err) {
        res.writeHead(404);
        res.end("missing");
        return;
      }
      res.writeHead(200, { "content-type": contentType(file), "cache-control": "no-store" });
      res.end(buf);
    });
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.next = 0;
    this.pending = new Map();
    ws.addEventListener("message", (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const job = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) job.reject(new Error(msg.error.message || JSON.stringify(msg.error)));
        else job.resolve(msg.result || {});
      }
    });
  }
  send(method, params, sessionId) {
    const id = ++this.next;
    const payload = { id, method, params: params || {} };
    if (sessionId) payload.sessionId = sessionId;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify(payload));
    });
  }
}

function launchChrome(userDir) {
  const chrome = spawn("google-chrome", [
    "--headless=new",
    "--no-sandbox",
    "--disable-gpu",
    "--disable-dev-shm-usage",
    "--disable-extensions",
    "--mute-audio",
    "--no-first-run",
    "--no-default-browser-check",
    "--remote-debugging-port=0",
    "--remote-allow-origins=*",
    "--user-data-dir=" + userDir,
    "about:blank",
  ], { stdio: ["ignore", "pipe", "pipe"] });
  const port = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Chrome did not open a DevTools port")), 20000);
    let buf = "";
    const onData = (chunk) => {
      buf += chunk.toString();
      const match = buf.match(/DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)\//);
      if (match) {
        clearTimeout(timer);
        resolve(Number(match[1]));
      }
    };
    chrome.stderr.on("data", onData);
    chrome.stdout.on("data", onData);
    chrome.on("exit", (code) => {
      clearTimeout(timer);
      reject(new Error("Chrome exited early (" + code + ")"));
    });
  });
  return { chrome, port };
}

const SNAP = `(() => {
  const prompt = ((document.getElementById("prompt-main") || {}).textContent || "").trim();
  const box = document.getElementById("prompt-box");
  const save = window.__QM && window.__QM.getSave ? window.__QM.getSave() : null;
  const key = (window.__QM && window.__QM.track ? window.__QM.track : "") + "|0::" + String(prompt || "").toLowerCase();
  const focusKey = window.__collocFocusKey || "";
  const prog = save && focusKey ? (save.cards[focusKey] || {}) : {};
  const meaning = save && save.practice && save.practice.meaning ? save.practice.meaning : { n: 0, good: 0 };
  return {
    href: location.href,
    prompt: prompt,
    label: ((document.getElementById("prompt-label") || {}).textContent || "").trim(),
    hint: ((document.getElementById("prompt-hint") || {}).textContent || "").trim(),
    gate: box ? (box.getAttribute("data-colloc-gate") || "") : "",
    good: !!document.getElementById("btn-rate-good"),
    unknownHidden: !document.getElementById("btn-unknown") || !!document.getElementById("btn-unknown").hidden,
    feedback: ((document.getElementById("feedback") || {}).textContent || "").trim(),
    chips: Array.from(document.querySelectorAll("#card-related .related-chip")).map((b) => b.textContent),
    choices: Array.from(document.querySelectorAll("#choices .choice")).map((b) => ({
      text: b.textContent.replace(/^\\d+\\.\\s*/, "").trim(),
      disabled: !!b.disabled,
    })),
    home: !!(document.getElementById("screen-home") && document.getElementById("screen-home").classList.contains("active")),
    play: !!(document.getElementById("screen-play") && document.getElementById("screen-play").classList.contains("active")),
    clear: !!(document.getElementById("screen-clear") && document.getElementById("screen-clear").classList.contains("active")),
    points: save ? save.points : null,
    streak: save ? save.streak : null,
    meaningN: meaning.n || 0,
    correct: prog.correct || 0,
    scheduledAt: prog.scheduledAt || 0,
    focusKey: focusKey,
  };
})()`;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function browserCheck() {
  const server = await startServer();
  const origin = "http://127.0.0.1:" + server.address().port;
  const userDir = fs.mkdtempSync(path.join(os.tmpdir(), "colloc-gate-"));
  let chrome = null;
  let sessionId = null;
  let cdp = null;
  try {
    const launched = launchChrome(userDir);
    chrome = launched.chrome;
    const port = await launched.port;
    const list = await (await fetch("http://127.0.0.1:" + port + "/json/version")).json();
    const ws = new WebSocket(list.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      ws.addEventListener("open", resolve);
      ws.addEventListener("error", () => reject(new Error("DevTools websocket failed")));
    });
    cdp = new Cdp(ws);
    const created = await cdp.send("Target.createTarget", { url: "about:blank" });
    const attached = await cdp.send("Target.attachToTarget", { targetId: created.targetId, flatten: true });
    sessionId = attached.sessionId;
    await cdp.send("Page.enable", {}, sessionId);
    await cdp.send("Runtime.enable", {}, sessionId);

    const evaluate = async (expression) => {
      const res = await cdp.send("Runtime.evaluate", {
        expression: expression,
        awaitPromise: true,
        returnByValue: true,
      }, sessionId);
      if (res.exceptionDetails) {
        const desc = res.exceptionDetails.exception && res.exceptionDetails.exception.description;
        throw new Error(res.exceptionDetails.text + (desc ? " " + desc : ""));
      }
      return res.result ? res.result.value : undefined;
    };
    const waitFor = async (fn, ms, label) => {
      const start = Date.now();
      let last = null;
      while (Date.now() - start < ms) {
        last = await fn();
        if (last) return last;
        await sleep(80);
      }
      let extra = "";
      try { extra = JSON.stringify(await snap()); } catch (err) { extra = String(err); }
      throw new Error("timed out waiting for " + label + " last=" + JSON.stringify(last) + " snap=" + extra);
    };
    const snap = () => evaluate(SNAP);
    const shot = async (name) => {
      const dir = "/opt/cursor/artifacts/screenshots";
      fs.mkdirSync(dir, { recursive: true });
      const png = await cdp.send("Page.captureScreenshot", { format: "png" }, sessionId);
      const file = path.join(dir, name + ".png");
      fs.writeFileSync(file, Buffer.from(png.data, "base64"));
      return file;
    };
    const openPractice = async (trackId, focusWord, buttonId) => {
      await cdp.send("Page.addScriptToEvaluateOnNewDocument", {
        source: earlyScript(plant(trackId, focusWord)),
      }, sessionId);
      await cdp.send("Page.navigate", { url: origin + "/grok/index.html" }, sessionId);
      await waitFor(async () => {
        const ready = await evaluate(`(() => {
          const btn = document.getElementById(${JSON.stringify(buttonId)});
          const gate = document.getElementById("screen-gate");
          if (!btn || !gate || !gate.classList.contains("active")) return null;
          if (!document.documentElement.classList.contains("session-ok")) return null;
          return true;
        })()`);
        return ready;
      }, 20000, "exam gate " + trackId);
      await evaluate(`document.getElementById(${JSON.stringify(buttonId)}).click()`);
      await waitFor(async () => {
        const home = await evaluate(`(() => {
          const prompt = document.getElementById("profile-name-gate");
          if (prompt && !prompt.hidden) {
            document.getElementById("profile-name-input").value = "小王";
            document.getElementById("profile-class-input").value = "初三1班";
            document.getElementById("profile-name-form").requestSubmit();
          }
          const screen = document.getElementById("screen-home");
          if (!screen || !screen.classList.contains("active")) return null;
          const soft = document.getElementById("must-gate");
          if (soft && !soft.hidden) {
            const later = document.getElementById("btn-must-later");
            if (later) later.click();
          }
          return true;
        })()`);
        return home;
      }, 20000, "home " + trackId);
      await evaluate(`(() => {
        window.__collocFocusKey = ${JSON.stringify(sense.cardKeyFor(trackId, 0, focusWord))};
        document.getElementById("btn-continue").click();
        return true;
      })()`);
      return waitFor(async () => {
        const s = await snap();
        if (!s || !s.play || s.choices.length !== 4 || s.good) return null;
        if (s.prompt !== focusWord) return null;
        return s;
      }, 15000, "dealt " + focusWord);
    };
    const clickGloss = async (want) => evaluate(`(() => {
      const want = ${JSON.stringify(want)};
      const buttons = Array.from(document.querySelectorAll("#choices .choice"));
      const btn = buttons.find((b) => !b.disabled && b.textContent.replace(/^\\d+\\.\\s*/, "").trim() === want);
      if (!btn) return { ok: false, labels: buttons.map((b) => b.textContent) };
      btn.click();
      return { ok: true };
    })()`);

    const dealt = await openPractice("zhongkao", "able", "btn-gate-zhongkao");
    assert.strictEqual(dealt.prompt, "able");
    assert.strictEqual(dealt.gate, "");
    assert.strictEqual(dealt.meaningN, 0);
    assert.strictEqual(dealt.correct, 0);
    assert.strictEqual(dealt.scheduledAt, 0);
    assert.ok(dealt.chips.indexOf("be able to") !== -1, "the primary is still a chip before the answer");
    await sleep(400);
    await shot("colloc-gate-lemma");

    const opened = await clickGloss("能够；有能力的");
    assert.strictEqual(opened.ok, true, JSON.stringify(opened));
    const gated = await snap();
    assert.strictEqual(gated.prompt, "be able to");
    assert.strictEqual(gated.gate, "be able to");
    assert.strictEqual(gated.good, false, "Good/Easy waits until the collocation is correct");
    assert.strictEqual(gated.unknownHidden, true, "不会 cannot skip the gate");
    assert.ok(gated.hint.indexOf("能够") === -1, gated.hint);
    assert.ok(gated.chips.indexOf("be able to") === -1, "the live question is not a peek chip");
    assert.strictEqual(gated.meaningN, 0);
    assert.strictEqual(gated.correct, 0);
    assert.strictEqual(gated.scheduledAt, 0);
    assert.strictEqual(gated.points, 4);
    assert.strictEqual(gated.streak, 0);
    await sleep(400);
    await shot("colloc-gate-open");

    const wrongText = gated.choices.find((c) => c.text !== "能够").text;
    const missed = await clickGloss(wrongText);
    assert.strictEqual(missed.ok, true, JSON.stringify(missed));
    const stayed = await snap();
    assert.strictEqual(stayed.prompt, "be able to");
    assert.strictEqual(stayed.gate, "be able to");
    assert.strictEqual(stayed.good, false);
    assert.ok(stayed.feedback.indexOf("搭配再想想") !== -1, stayed.feedback);
    assert.strictEqual(stayed.meaningN, 0, "a wrong collocation does not record the lemma");
    assert.strictEqual(stayed.correct, 0);
    assert.strictEqual(stayed.scheduledAt, 0);
    assert.strictEqual(stayed.points, 4);
    assert.strictEqual(stayed.streak, 0);
    const wrongBtn = stayed.choices.find((c) => c.text === wrongText);
    assert.ok(wrongBtn && wrongBtn.disabled, "the wrong gloss stays disabled");
    assert.ok(stayed.choices.some((c) => c.text === "能够" && !c.disabled));
    await shot("colloc-gate-wrong");

    const again = await clickGloss(wrongText);
    assert.strictEqual(again.ok, false, "a wrong gloss cannot be chosen again to skip");
    const still = await snap();
    assert.strictEqual(still.prompt, "be able to");
    assert.strictEqual(still.meaningN, 0);
    assert.strictEqual(still.correct, 0);

    const passed = await clickGloss("能够");
    assert.strictEqual(passed.ok, true, JSON.stringify(passed));
    const rated = await snap();
    assert.strictEqual(rated.prompt, "able", "the rating screen returns to the lemma");
    assert.strictEqual(rated.gate, "");
    assert.strictEqual(rated.good, true);
    assert.strictEqual(rated.meaningN, 1, "the lemma step is recorded only after the gate");
    assert.strictEqual(rated.correct, 0, "SM-2 waits for Good/Easy");
    assert.strictEqual(rated.scheduledAt, 0);
    assert.ok(rated.points > 4);
    assert.strictEqual(rated.streak, 1);
    await shot("colloc-gate-rated");

    await evaluate(`document.getElementById("btn-rate-good").click()`);
    const scheduled = await snap();
    assert.ok(scheduled.correct >= 1, "Good schedules the lemma");
    assert.ok(scheduled.scheduledAt > 0);
    const advanced = await waitFor(async () => {
      const s = await snap();
      if (!s || s.gate || s.good || s.prompt === "be able to") return null;
      if (s.clear) return s;
      if (s.play && !s.feedback && s.choices.length === 4) return s;
      return null;
    }, 8000, "advanced past the collocation gate");
    assert.ok(advanced.clear || advanced.play);
    assert.notStrictEqual(advanced.prompt, "be able to");

    const plain = await openPractice("zhongkao", "ability", "btn-gate-zhongkao");
    assert.strictEqual(plain.prompt, "ability");
    assert.strictEqual(plain.gate, "");
    assert.strictEqual(plain.meaningN, 0);
    const noGate = await clickGloss("能力");
    assert.strictEqual(noGate.ok, true, JSON.stringify(noGate));
    const direct = await snap();
    assert.strictEqual(direct.prompt, "ability");
    assert.strictEqual(direct.gate, "");
    assert.strictEqual(direct.good, true, "a lemma with no related collocation still rates immediately");
    assert.strictEqual(direct.meaningN, 1);
    assert.strictEqual(direct.correct, 0);
    assert.strictEqual(direct.scheduledAt, 0);
    await evaluate(`document.getElementById("btn-rate-good").click()`);
    const abilityDone = await snap();
    assert.ok(abilityDone.correct >= 1);
    const abilityNext = await waitFor(async () => {
      const s = await snap();
      if (!s || s.gate || s.good) return null;
      if (s.clear) return s;
      if (s.play && !s.feedback && s.choices.length === 4) return s;
      return null;
    }, 8000, "advanced after a lemma with no related");
    assert.ok(abilityNext.clear || abilityNext.play);

    const adv = await openPractice("gaokao", "advantage", "btn-gate-gaokao");
    assert.strictEqual(adv.prompt, "advantage");
    assert.deepStrictEqual(adv.chips, ["advantage over", "take advantage of"]);
    const advOpen = await clickGloss("优势");
    assert.strictEqual(advOpen.ok, true, JSON.stringify(advOpen));
    const advGate = await snap();
    assert.strictEqual(advGate.prompt, "take advantage of");
    assert.strictEqual(advGate.gate, "take advantage of");
    assert.deepStrictEqual(advGate.chips, ["advantage over"]);
    assert.strictEqual(advGate.good, false);
    await sleep(400);
    await shot("colloc-gate-advantage");
    assert.ok(advGate.hint.indexOf("胜过") === -1, advGate.hint);
    assert.ok(advGate.hint.indexOf("利用") === -1, advGate.hint);
    const advWrong = advGate.choices.find((c) => c.text !== "利用（机会）").text;
    await clickGloss(advWrong);
    const advStay = await snap();
    assert.strictEqual(advStay.prompt, "take advantage of");
    assert.strictEqual(advStay.meaningN, 0);
    assert.strictEqual(advStay.correct, 0);
    assert.strictEqual(advStay.good, false);
    await clickGloss("利用（机会）");
    const advRated = await snap();
    assert.strictEqual(advRated.good, true);
    assert.strictEqual(advRated.prompt, "advantage");
    assert.strictEqual(advRated.meaningN, 1);
    assert.strictEqual(advRated.correct, 0);
  } finally {
    if (chrome) {
      try { chrome.kill("SIGKILL"); } catch (_) {}
    }
    await new Promise((resolve) => server.close(resolve));
  }
}

browserCheck().then(() => {
  console.log("colloc-gate ok");
}).catch((err) => {
  console.error(err);
  process.exit(1);
});

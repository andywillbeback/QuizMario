/* 高考一词多义: curated foils, deck gloss stays the correct choice.
 * Run: node tests/polysemy.test.js
 *
 * 中考 spelling stays typed. Polysemy is multiple choice and does not move 通关.
 */
"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const poly = require(path.join(root, "grok/polysemy.js"));
const practice = require(path.join(root, "grok/practice.js"));
const feedback = require(path.join(root, "grok/feedback.js"));
const merge = require(path.join(root, "grok/sync-merge.js"));
const srs = require(path.join(root, "grok/srs-rules.js"));
const cloze = require(path.join(root, "grok/cloze.js"));
const le = require(path.join(root, "grok/learner-events.js"));
const metrics = require(path.join(root, "grok/study-metrics.js"));

function read(name) {
  return fs.readFileSync(path.join(root, name), "utf8");
}

function loadTracks(file) {
  const ctx = { window: {} };
  vm.createContext(ctx);
  vm.runInContext(read(file), ctx);
  return ctx.window.VOCAB_TRACKS;
}

function findCard(track, word, pos) {
  const hits = [];
  (track.sets || []).forEach((set, levelIdx) => {
    (set || []).forEach((card, index) => {
      if (card && card.word === word && card.pos === pos) hits.push({ card: card, levelIdx: levelIdx, index: index });
    });
  });
  return hits;
}

const tracks = loadTracks("grok/exam-tracks.js");
const gaokao = tracks.find((t) => t.id === "gaokao");
const zhongkao = tracks.find((t) => t.id === "zhongkao");
assert.ok(gaokao && zhongkao);

{
  assert.strictEqual(poly.isPolysemyTrack("gaokao"), true);
  assert.strictEqual(poly.isPolysemyTrack("zhongkao"), false);
  assert.strictEqual(poly.isPolysemyTrack("core"), false);
  assert.ok(poly.BANK.length >= 24, "reviewed starter bank");
  const seen = {};
  poly.BANK.forEach((entry) => {
    const id = entry.word + "|" + entry.pos;
    assert.ok(!seen[id], "duplicate bank row " + id);
    seen[id] = true;
    assert.strictEqual(entry.foils.length, 3, id);
    const hits = findCard(gaokao, entry.word, entry.pos);
    assert.strictEqual(hits.length, 1, "gaokao card " + id);
    const card = hits[0].card;
    assert.strictEqual(card.meaning_zh, entry.glossAnchor, "glossAnchor is the live deck gloss for " + id);
    const built = poly.optionSet(card);
    assert.ok(built, "option set " + id);
    assert.strictEqual(built.correct, card.meaning_zh);
    assert.strictEqual(built.options[0], card.meaning_zh, "； stacks stay one choice");
    assert.strictEqual(built.options.length, 4);
    assert.strictEqual(built.context, String(card.example_en).trim());
    assert.ok(cloze.containsToken(built.context, card.word), id + " context names the lemma");
    assert.strictEqual(built.ipa, String(card.ipa || "").trim());
    assert.ok(built.ipa, id + " gaokao card carries ipa");
    const choiceSet = {};
    built.options.forEach((opt) => {
      assert.ok(!choiceSet[opt], "duplicate choice " + id + " " + opt);
      choiceSet[opt] = true;
    });
    entry.foils.forEach((foil) => {
      assert.ok(built.options.indexOf(foil) !== -1, id + " keeps foil " + foil);
      assert.ok(!poly.conflicts(foil, card.meaning_zh), id + " foil collides with deck gloss: " + foil);
      poly.parts(card.meaning_zh).forEach((part) => {
        assert.notStrictEqual(foil, part, id + " foil is a gloss segment");
      });
    });
    const drifted = Object.assign({}, card, { meaning_zh: card.meaning_zh + "（漂移）" });
    assert.strictEqual(poly.optionSet(drifted), null, "drifted gloss is not served");
    const noIpa = Object.assign({}, card, { ipa: "" });
    assert.strictEqual(poly.optionSet(noIpa).ipa, "", "missing ipa stays empty");
  });
}

{
  const light = findCard(gaokao, "light", "n.")[0].card;
  const built = poly.optionSet(light);
  assert.strictEqual(built.correct, "光；灯");
  assert.ok(built.options.indexOf("光") === -1 && built.options.indexOf("灯") === -1);
  assert.ok(built.ipa.indexOf("laɪt") !== -1);
}

{
  assert.deepStrictEqual(practice.sessionAnswerMode("spelling", "polysemy"), {
    typed: false,
    evidence_kind: "mc_polysemy",
  });
  assert.deepStrictEqual(practice.sessionAnswerMode("spelling", "spelling"), {
    typed: true,
    evidence_kind: "typed_spelling",
  });
  assert.deepStrictEqual(practice.sessionAnswerMode("level", "meaning"), {
    typed: false,
    evidence_kind: "mc_recognition",
  });
  assert.strictEqual(practice.sessionAnswerMode("must", "form").evidence_kind, "mc_production");
  assert.strictEqual(practice.affectsClearance("spelling"), false);
  assert.strictEqual(practice.affectsClearance("spelling", "polysemy"), false);
  assert.strictEqual(practice.affectsClearance("level", "meaning"), true);
  assert.strictEqual(practice.affectsClearance("level", "polysemy"), false);
}

{
  const now = Date.UTC(2026, 10, 1, 2, 0, 0);
  const card = srs.defaultCardProg();
  const before = JSON.parse(JSON.stringify(card));
  const noted = practice.notePolysemy(card, "correct", now);
  assert.strictEqual(noted.correct, 1);
  practice.notePolysemy(card, "correct", now + 1);
  practice.notePolysemy(card, "wrong", now + 2);
  assert.strictEqual(card.polysemy.correct, 2);
  assert.strictEqual(card.polysemy.wrong, 1);
  assert.strictEqual(card.polysemy.streak, 0);
  assert.strictEqual(card.state, before.state);
  assert.strictEqual(card.interval, before.interval);
  assert.strictEqual(card.reps, before.reps);
  assert.strictEqual(card.due, before.due);
  assert.strictEqual(card.correct, before.correct);
  assert.strictEqual(card.wrong, before.wrong);
  assert.strictEqual(card.mastery, before.mastery);
  assert.strictEqual(card.mastered, before.mastered);
  assert.strictEqual(practice.spellingSignal(card.spelling), "未练");
  assert.strictEqual(practice.isIndependentSpelling(card.spelling), false);
  assert.strictEqual(srs.isSolidCard(card), false, "polysemy is not 通关 credit");
  const save = { cards: { "gaokao|15::light": card } };
  assert.strictEqual(merge.studiedCount(save), 1, "polysemy-only progress is still a save");
  assert.strictEqual(merge.isBlank(save), false);
}

{
  const view = feedback.describeAttempt({
    word: "light",
    meaning: "光；灯",
    direction: "polysemy",
    outcome: "wrong",
    picked: "轻的",
  });
  const text = view.lines.join("\n");
  assert.ok(text.includes("一词多义"));
  assert.ok(text.includes("不计入通关"));
  assert.ok(text.includes("词义进度未改"));
  assert.ok(text.includes("选了「轻的」"));
  assert.ok(text.includes("应是「光；灯」"));
  assert.ok(!text.includes("输入了"));
  const spelled = feedback.describeAttempt({
    word: "book",
    meaning: "书",
    direction: "spelling",
    outcome: "wrong",
    picked: "bok",
    spellingSignal: "在练",
  });
  assert.ok(spelled.lines.join("\n").includes("输入了「bok」"));
}

{
  const NOW = "2026-11-01T02:00:00.000Z";
  const ev = le.buildEvent({
    event_type: le.TYPES.CORRECT,
    learner_id: "11111111-1111-4111-8111-111111111111",
    headword: "light",
    gloss_zh: "光；灯",
    task_direction: "polysemy",
    evidence_kind: "mc_polysemy",
    created_at: NOW,
  }, NOW);
  assert.strictEqual(ev.evidence_kind, "mc_polysemy");
  assert.strictEqual(ev.task_direction, "polysemy");
  assert.strictEqual(ev.payload.evidence_kind, "mc_polysemy");
  const round = le.publicEvent(le.fromRemote(le.publicEvent(ev)));
  assert.strictEqual(round.evidence_kind, "mc_polysemy");
  assert.strictEqual(round.task_direction, "polysemy");
  assert.strictEqual(metrics.modeLabel(ev), "一词多义");
  assert.strictEqual(metrics.axisOf(ev), "", "polysemy does not join 看英选义 / 拼写 axes");
  assert.strictEqual(metrics.modeLabel({
    event_type: le.TYPES.WRONG,
    payload: { task_direction: "spelling", evidence_kind: "typed_spelling" },
  }), "拼写");
}

{
  const game = read("grok/game.js");
  const index = read("grok/index.html");
  const spellStart = game.slice(game.indexOf("function startSpellingSession"), game.indexOf("function startQueueSession"));
  assert.ok(spellStart.includes("isPolysemyTrack(currentTrack)"));
  assert.ok(spellStart.includes("startPolysemySession()"));
  assert.ok(spellStart.includes('startQueueSession("spelling", batch)'), "zhongkao / other tracks stay typed spelling");
  assert.ok(!spellStart.includes('direction: "polysemy"'));
  const polyStart = game.slice(game.indexOf("function startPolysemySession"), game.indexOf("function startSpellingSession"));
  assert.ok(polyStart.includes('direction: "polysemy"'));
  assert.ok(polyStart.includes("optionSet"));
  const grade = game.slice(game.indexOf("function grade("), game.indexOf("function confirmCorrect"));
  assert.ok(grade.includes("gradeSpelling"));
  assert.ok(grade.includes("announceKillStreak()"));
  assert.ok(grade.includes("notePolysemy"));
  assert.ok(grade.includes("affectsClearance"));
  assert.ok(grade.includes("btn-rate-good") && grade.includes("btn-rate-easy"));
  const spellGrade = game.slice(game.indexOf("function gradeSpelling"), game.indexOf("function grade("));
  assert.ok(!spellGrade.includes("announceKillStreak"), "typed spelling still does not speak the kill ladder");
  const confirm = game.slice(game.indexOf("function confirmCorrect"), game.indexOf("function bindCollocFlow"));
  const beforeSchedule = confirm.slice(0, confirm.indexOf("schedule("));
  assert.ok(beforeSchedule.includes("affectsClearance"));
  assert.ok(beforeSchedule.includes("不改变本组通关"));
  assert.ok(confirm.includes("schedule("));
  const fill = game.slice(game.indexOf("function fillCardContent"), game.indexOf("function stopChallenge"));
  assert.ok(fill.includes("renderPromptIpa"));
  assert.ok(fill.includes('sessionDirection === "polysemy"'));
  assert.ok(index.includes('src="polysemy.js"'));
  assert.ok(index.indexOf('src="polysemy.js"') < index.indexOf('src="game.js'));
  assert.ok(index.includes('id="btn-spelling"') && index.includes(">拼写</button>"), "default label stays 拼写 for 中考");
  assert.ok(index.includes('id="prompt-ipa"'));
  assert.ok(game.includes("syncSpellingButton"));
  assert.ok(game.includes('btn.textContent = poly ? "一词多义" : "拼写"'));
}

{
  const config = read("grok/config.js");
  const url = config.match(/SUPABASE_URL:\s*"([^"]+)"/)[1];
  assert.strictEqual(url, "https://cmainasvlfdynidabunp.supabase.co");
  assert.ok(!/\.workers\.dev\/?$/.test(url));
  assert.ok(!read("grok/kill-streak.js").includes("polysemy"));
  assert.ok(!read("grok/pronunciation.js").includes("polysemy"));
  assert.ok(!read("exam-tracks.js").includes("polysemy"));
}

const http = require("http");
const os = require("os");
const { spawn } = require("child_process");

if (typeof WebSocket === "undefined") global.WebSocket = require("ws");

function contentType(file) {
  if (file.endsWith(".html")) return "text/html; charset=utf-8";
  if (file.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (file.endsWith(".svg")) return "image/svg+xml";
  if (file.endsWith(".png")) return "image/png";
  if (file.endsWith(".css")) return "text/css; charset=utf-8";
  return "application/octet-stream";
}

function startServer() {
  return new Promise((resolve) => {
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
        res.writeHead(200, { "content-type": contentType(file) });
        res.end(buf);
      });
    });
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
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
    email: "smoke.polysemy@example.com",
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: { display_name: "小王", class_name: "高一1班" },
    created_at: "2026-01-01T00:00:00.000Z",
    email_confirmed_at: "2026-01-01T00:00:00.000Z",
  },
};

function trackSave(trackId) {
  return {
    points: 4, streak: 0, bestStreak: 1, unlockedLevel: 1, cards: {},
    levelStars: {}, sortMode: "default", voiceOn: true, track: trackId,
    trackUnlock: { [trackId]: 1 }, trackStars: { [trackId]: {} }, daily: {},
    profile: { name: "小王", cls: trackId === "gaokao" ? "高一1班" : "初三1班" },
    practice: { meaning: { n: 0, good: 0 }, spelling: { n: 0, good: 0 }, hint: { n: 0, good: 0 } },
    updatedAt: "2026-10-30T00:00:00.000Z",
  };
}

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
      if (!/supabase\\.co/i.test(url)) {
        if (!orig) return Promise.reject(new Error("no fetch"));
        return orig(input, init);
      }
      if (url.indexOf("/user_progress") !== -1) {
        if (method === "GET" || method === "HEAD") return reply(200, []);
        return reply(201, [{ user_id: ${JSON.stringify(SESSION.user.id)} }]);
      }
      if (url.indexOf("/learner_events") !== -1) return reply(200, []);
      if (url.indexOf("/auth/v1/user") !== -1) return reply(200, ${JSON.stringify(SESSION.user)});
      if (url.indexOf("/token") !== -1 || url.indexOf("/signup") !== -1) return reply(200, ${JSON.stringify(SESSION)});
      return reply(200, {});
    };
  })();`;
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
    "--headless=new", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage",
    "--mute-audio", "--no-first-run", "--remote-debugging-port=0", "--remote-allow-origins=*",
    `--user-data-dir=${userDir}`, "about:blank",
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function browserSmoke() {
  const server = await startServer();
  const origin = "http://127.0.0.1:" + server.address().port;
  const userDir = fs.mkdtempSync(path.join(os.tmpdir(), "qm-polysemy-"));
  const launched = launchChrome(userDir);
  const shots = [];
  try {
    const port = await launched.port;
    const version = await (await fetch("http://127.0.0.1:" + port + "/json/version")).json();
    const ws = new WebSocket(version.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      ws.addEventListener("open", resolve);
      ws.addEventListener("error", () => reject(new Error("DevTools websocket failed")));
    });
    const cdp = new Cdp(ws);
    const created = await cdp.send("Target.createTarget", { url: "about:blank" });
    const attached = await cdp.send("Target.attachToTarget", { targetId: created.targetId, flatten: true });
    const sessionId = attached.sessionId;
    await cdp.send("Page.enable", {}, sessionId);
    await cdp.send("Runtime.enable", {}, sessionId);
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width: 420, height: 900, deviceScaleFactor: 1, mobile: true,
    }, sessionId);
    const evaluate = async (expression) => {
      const res = await cdp.send("Runtime.evaluate", {
        expression, awaitPromise: true, returnByValue: true,
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
      throw new Error("timed out waiting for " + label + " last=" + JSON.stringify(last));
    };
    const shot = async (name) => {
      const dir = "/opt/cursor/artifacts/screenshots";
      fs.mkdirSync(dir, { recursive: true });
      const png = await cdp.send("Page.captureScreenshot", { format: "png" }, sessionId);
      const file = path.join(dir, name + ".png");
      fs.writeFileSync(file, Buffer.from(png.data, "base64"));
      shots.push(file);
      return file;
    };
    const dismissHome = async () => waitFor(async () => evaluate(`(() => {
      const prompt = document.getElementById("profile-name-gate");
      if (prompt && !prompt.hidden) {
        document.getElementById("profile-name-input").value = "小王";
        document.getElementById("profile-class-input").value = "高一1班";
        document.getElementById("profile-name-form").requestSubmit();
      }
      const soft = document.getElementById("must-gate");
      if (soft && !soft.hidden) {
        const later = document.getElementById("btn-must-later");
        if (later) later.click();
      }
      const home = document.getElementById("screen-home");
      if (!home || !home.classList.contains("active")) return null;
      if (soft && !soft.hidden) return null;
      return true;
    })()`), 20000, "home");

    async function openTrack(trackId, buttonId) {
      const added = await cdp.send("Page.addScriptToEvaluateOnNewDocument", {
        source: earlyScript(trackSave(trackId)),
      }, sessionId);
      await cdp.send("Page.navigate", { url: origin + "/grok/index.html" }, sessionId);
      await waitFor(async () => evaluate(`(() => {
        const btn = document.getElementById(${JSON.stringify(buttonId)});
        const gate = document.getElementById("screen-gate");
        if (!btn || !gate || !gate.classList.contains("active")) return null;
        if (!document.documentElement.classList.contains("session-ok")) return null;
        return true;
      })()`), 20000, "gate " + trackId);
      await evaluate(`document.getElementById(${JSON.stringify(buttonId)}).click()`);
      await dismissHome();
      await cdp.send("Page.removeScriptToEvaluateOnNewDocument", { identifier: added.identifier }, sessionId);
    }

    await openTrack("gaokao", "btn-gate-gaokao");
    const homeBtn = await evaluate(`document.getElementById("btn-spelling").textContent`);
    assert.strictEqual(homeBtn, "一词多义");
    await evaluate(`document.getElementById("btn-spelling").click()`);
    const card = await waitFor(async () => evaluate(`(() => {
      const play = document.getElementById("screen-play");
      const main = document.getElementById("prompt-main");
      const ipa = document.getElementById("prompt-ipa");
      const label = document.getElementById("prompt-label");
      const typeRow = document.getElementById("type-row");
      const choices = [...document.querySelectorAll("#choices .choice")].map((b) => b.textContent);
      if (!play || !play.classList.contains("active") || !main || !choices.length) return null;
      return {
        word: main.textContent,
        ipa: ipa && !ipa.hidden ? ipa.textContent : "",
        label: label ? label.textContent : "",
        level: (document.getElementById("play-level") || {}).textContent || "",
        hint: (document.getElementById("prompt-hint") || {}).textContent || "",
        typed: !!(typeRow && !typeRow.hidden),
        choices: choices,
        rects: [...document.querySelectorAll("#choices .choice")].map((b) => {
          const r = b.getBoundingClientRect();
          return { top: Math.round(r.top), height: Math.round(r.height), width: Math.round(r.width) };
        }),
      };
    })()`), 15000, "gaokao polysemy card");
    const entry = poly.BANK.find((row) => row.word === card.word);
    assert.ok(entry, "dealt a bank lemma " + card.word);
    const deck = findCard(gaokao, entry.word, entry.pos)[0].card;
    assert.strictEqual(card.label.indexOf("一词多义") >= 0, true);
    assert.strictEqual(card.level.indexOf("一词多义") >= 0, true);
    assert.strictEqual(card.typed, false, "gaokao does not show the typing row");
    assert.strictEqual(card.choices.length, 4);
    card.rects.forEach((rect) => {
      assert.ok(rect.height >= 24, "choice is on screen " + JSON.stringify(rect));
      assert.ok(rect.width >= 80, "choice is wide enough " + JSON.stringify(rect));
      assert.ok(rect.top >= 0 && rect.top < 820, "choice is in the first viewport " + JSON.stringify(rect));
    });
    assert.ok(card.choices.some((text) => text.indexOf(entry.glossAnchor) !== -1));
    await sleep(400);
    assert.strictEqual(card.ipa, deck.ipa);
    assert.ok(card.hint.indexOf(deck.example_en.slice(0, 12)) !== -1);
    await shot("gaokao-polysemy-prompt");
    await evaluate(`(() => {
      const gloss = ${JSON.stringify(entry.glossAnchor)};
      const hit = [...document.querySelectorAll("#choices .choice")].find((b) => b.textContent.indexOf(gloss) !== -1);
      if (!hit) return false;
      hit.click();
      return true;
    })()`);
    const rated = await waitFor(async () => evaluate(`(() => {
      const good = document.getElementById("btn-rate-good");
      const easy = document.getElementById("btn-rate-easy");
      const banner = document.getElementById("kill-banner");
      const fb = document.getElementById("feedback");
      if (!good || !easy) return null;
      return {
        good: good.textContent,
        easy: easy.textContent,
        banner: banner ? banner.textContent : "",
        feedback: fb ? fb.textContent : "",
      };
    })()`), 8000, "good/easy");
    assert.ok(rated.good.indexOf("记住了") !== -1);
    assert.ok(rated.easy.indexOf("太简单") !== -1);
    assert.ok(rated.good.indexOf("不计入通关") !== -1);
    assert.ok(rated.banner.toUpperCase().indexOf("FIRST BLOOD") !== -1, rated.banner);
    assert.ok(rated.feedback.indexOf(deck.ipa) !== -1, "feedback shows ipa");
    await shot("gaokao-polysemy-correct");
    await evaluate(`document.getElementById("btn-rate-good").click()`);
    await sleep(200);
    const saved = await evaluate(`(() => {
      const save = JSON.parse(localStorage.getItem("vocabSpotlight_v1") || "{}");
      const cards = save.cards || {};
      const hit = Object.keys(cards).map((key) => cards[key]).find((p) => p && p.polysemy && p.polysemy.correct);
      return {
        unlocked: save.unlockedLevel,
        trackUnlock: (save.trackUnlock || {}).gaokao,
        state: hit && hit.state,
        interval: hit && hit.interval,
        reps: hit && hit.reps,
        correct: hit && hit.correct,
        poly: hit && hit.polysemy && hit.polysemy.correct,
      };
    })()`);
    assert.strictEqual(saved.unlocked, 1);
    assert.strictEqual(saved.trackUnlock, 1);
    assert.strictEqual(saved.state, "new");
    assert.strictEqual(saved.interval, 0);
    assert.strictEqual(saved.reps, 0);
    assert.strictEqual(saved.correct, 0);
    assert.ok(saved.poly >= 1);

    await openTrack("zhongkao", "btn-gate-zhongkao");
    const zkBtn = await evaluate(`document.getElementById("btn-spelling").textContent`);
    assert.strictEqual(zkBtn, "拼写");
    await evaluate(`document.getElementById("btn-spelling").click()`);
    const typed = await waitFor(async () => evaluate(`(() => {
      const play = document.getElementById("screen-play");
      const typeRow = document.getElementById("type-row");
      const input = document.getElementById("answer-input");
      const choices = document.getElementById("choices");
      const label = document.getElementById("prompt-label");
      if (!play || !play.classList.contains("active") || !typeRow || typeRow.hidden) return null;
      return {
        label: label ? label.textContent : "",
        level: (document.getElementById("play-level") || {}).textContent || "",
        input: !!(input && !input.hidden),
        choicesHidden: !choices || choices.hidden || !choices.children.length,
      };
    })()`), 15000, "zhongkao typed spelling");
    assert.ok(typed.label.indexOf("拼写") !== -1);
    assert.ok(typed.level.indexOf("拼写") !== -1);
    assert.strictEqual(typed.input, true);
    assert.strictEqual(typed.choicesHidden, true);
    await shot("zhongkao-spelling-typed");
    ws.close();
    shots.forEach((file) => console.log(file));
  } finally {
    launched.chrome.kill("SIGKILL");
    server.close();
  }
}

browserSmoke().then(() => {
  console.log("polysemy ok");
}).catch((err) => {
  console.error(err);
  process.exit(1);
});

"use strict";

/*
 * Phone-sized browser check for /grok/ speech.
 * Run: node tests/speech-browser.test.js
 *
 * Drives the real page (meaning, spelling, 今日必练) and records the
 * utterance text the teaching voice asks speechSynthesis to speak.
 * Headless Chrome has no audible engine, so speechSynthesis is a stub
 * installed before page scripts. Kill-streak clips stay on Audio().
 */

if (typeof WebSocket === "undefined") {
  global.WebSocket = require("ws");
}

const assert = require("assert");
const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const root = path.join(__dirname, "..");
const cloze = require(path.join(root, "grok/cloze.js"));

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
    email: "smoke.speech.browser@example.com",
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: {},
    created_at: "2026-01-01T00:00:00.000Z",
    email_confirmed_at: "2026-01-01T00:00:00.000Z",
  },
};

function earlyScript() {
  return `(function () {
    try { localStorage.setItem("quizmario-auth", ${JSON.stringify(JSON.stringify(SESSION))}); } catch (e) {}
    try { sessionStorage.setItem("qm-phase", "signed"); } catch (e) {}
    window.__QM_SPOKEN = [];
    window.__QM_AUDIO = [];
    function noteUtterance(u) {
      window.__QM_SPOKEN.push({
        text: String(u && u.text || ""),
        rate: u && u.rate,
        lang: u && u.lang,
        ok: true,
      });
    }
    var OrigAudio = window.Audio;
    function RecAudio(src) {
      try { window.__QM_AUDIO.push(String(src || "")); } catch (e) {}
      return new OrigAudio(src);
    }
    RecAudio.prototype = OrigAudio.prototype;
    window.Audio = RecAudio;
    function Utterance(text) {
      this.text = text == null ? "" : String(text);
      this.lang = "";
      this.rate = 1;
      this.pitch = 1;
      this.volume = 1;
      this.voice = null;
      this.onstart = null;
      this.onend = null;
      this.onerror = null;
    }
    var synth = {
      speaking: false,
      pending: false,
      paused: false,
      getVoices: function () {
        return [{
          name: "Google UK English Female",
          lang: "en-GB",
          voiceURI: "Google UK English Female",
          localService: false,
          default: true,
        }];
      },
      speak: function (u) {
        noteUtterance(u);
        synth.speaking = true;
        setTimeout(function () {
          try { if (u.onstart) u.onstart(); } catch (e) {}
          setTimeout(function () {
            synth.speaking = false;
            try { if (u.onend) u.onend(); } catch (e) {}
          }, 40);
        }, 5);
      },
      cancel: function () { synth.speaking = false; synth.pending = false; },
      resume: function () { synth.paused = false; },
      pause: function () { synth.paused = true; },
      addEventListener: function () {},
      removeEventListener: function () {},
    };
    var live = window.speechSynthesis;
    if (live && typeof live.speak === "function") {
      var origSpeak = live.speak.bind(live);
      live.speak = function (u) {
        noteUtterance(u);
        try { return origSpeak(u); } catch (e) {}
      };
    } else {
      window.speechSynthesis = synth;
      window.SpeechSynthesisUtterance = Utterance;
    }
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
        return reply(201, [{ user_id: ${JSON.stringify(SESSION.user.id)}, updated_at: "2026-01-01T00:00:00.000Z" }]);
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
    `--user-data-dir=${userDir}`,
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
  function shown(el) {
    if (!el) return false;
    if (el.hidden) return false;
    if (el.closest && el.closest("[hidden]")) return false;
    const s = getComputedStyle(el);
    if (s.display === "none" || s.visibility === "hidden") return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }
  const prompt = ((document.getElementById("prompt-main") || {}).textContent || "").trim();
  const hint = ((document.getElementById("prompt-hint") || {}).textContent || "").trim();
  const label = ((document.getElementById("prompt-label") || {}).textContent || "").trim();
  const play = document.getElementById("screen-play");
  const buttons = [];
  document.querySelectorAll(".speak-btn").forEach((b) => {
    if (!shown(b)) return;
    const r = b.getBoundingClientRect();
    buttons.push({
      label: (b.textContent || "").trim(),
      say: b.getAttribute("data-say") || "",
      kind: b.getAttribute("data-say-kind") || "",
      slow: b.getAttribute("data-say-slow") || "",
      top: Math.round(r.top),
      left: Math.round(r.left),
      w: Math.round(r.width),
      h: Math.round(r.height),
    });
  });
  const tracks = window.VOCAB_EXAM_TRACKS || [];
  const zk = tracks.filter((t) => t.id === "zhongkao")[0];
  const words = [];
  ((zk && zk.sets) || []).forEach((set) => set.forEach((w) => words.push(w)));
  const api = window.QuizMarioCloze;
  function matches(w) {
    if (!w) return false;
    if (api && w.example_en) {
      const blank = api.blankExample(w.example_en, w.word);
      if (hint.indexOf(blank) !== -1 || hint.indexOf(w.example_en) !== -1) return true;
    }
    return false;
  }
  const byWord = words.filter((w) => w.word === prompt);
  const byZh = words.filter((w) => w.meaning_zh === prompt);
  const hit = byWord.filter(matches)[0] || byZh.filter(matches)[0] || byWord[0] || byZh[0] || null;
  return {
    href: location.href,
    active: !!(play && play.classList.contains("active")),
    label: label,
    prompt: prompt,
    hint: hint,
    buttons: buttons,
    unknown: shown(document.getElementById("btn-unknown")),
    cont: shown(document.getElementById("btn-feedback-continue")),
    home: !!((document.getElementById("screen-home") || {}).classList && document.getElementById("screen-home").classList.contains("active")),
    mustGate: shown(document.getElementById("must-gate")),
    mustBtn: shown(document.getElementById("btn-must-practice")),
    word: hit ? hit.word : "",
    example: hit ? hit.example_en || "" : "",
    meaning: hit ? hit.meaning_zh || "" : "",
    spoken: (window.__QM_SPOKEN || []).map((row) => ({ text: row.text, rate: row.rate, ok: !!row.ok })),
    audio: (window.__QM_AUDIO || []).slice(),
    vw: window.innerWidth,
    vh: window.innerHeight,
  };
})()`;

function oldBlankSpeech(example, word) {
  return cloze.blankExample(example, word).replace(/___+/g, "blank");
}

function hasToken(text, word) {
  return cloze.containsToken(text, word);
}

async function main() {
  const server = await startServer();
  const origin = "http://127.0.0.1:" + server.address().port;
  const userDir = fs.mkdtempSync(path.join(os.tmpdir(), "qm-grok-speech-"));
  const launched = launchChrome(userDir);
  const report = [];
  let cdp = null;
  let sessionId = null;
  let chrome = null;
  try {
    chrome = launched.chrome;
    const port = await launched.port;
    const version = await (await fetch("http://127.0.0.1:" + port + "/json/version")).json();
    const ws = new WebSocket(version.webSocketDebuggerUrl);
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
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width: 390,
      height: 844,
      deviceScaleFactor: 2,
      mobile: true,
    }, sessionId);
    await cdp.send("Page.addScriptToEvaluateOnNewDocument", { source: earlyScript() }, sessionId);

    async function evaluate(expression) {
      const res = await cdp.send("Runtime.evaluate", {
        expression,
        awaitPromise: true,
        returnByValue: true,
      }, sessionId);
      if (res.exceptionDetails) {
        const desc = res.exceptionDetails.exception && res.exceptionDetails.exception.description;
        throw new Error(res.exceptionDetails.text + (desc ? " " + desc : ""));
      }
      return res.result ? res.result.value : undefined;
    }

    async function snap() {
      return evaluate(SNAP);
    }

    async function waitFor(fn, ms, label) {
      const start = Date.now();
      let last = null;
      while (Date.now() - start < ms) {
        last = await fn();
        if (last) return last;
        await sleep(80);
      }
      throw new Error("timed out waiting for " + label + " last=" + JSON.stringify(last));
    }

    async function shot(name) {
      const dir = "/opt/cursor/artifacts/screenshots";
      fs.mkdirSync(dir, { recursive: true });
      const png = await cdp.send("Page.captureScreenshot", { format: "png" }, sessionId);
      const file = path.join(dir, name + ".png");
      fs.writeFileSync(file, Buffer.from(png.data, "base64"));
      return file;
    }

    await cdp.send("Page.navigate", { url: origin + "/grok/index.html" }, sessionId);
    await waitFor(async () => {
      const s = await snap();
      if (!s || s.href.indexOf("/grok/index.html") === -1) return null;
      if (!s.href || documentHidden(s)) return null;
      const gate = await evaluate(`(() => {
        const zk = document.getElementById("btn-gate-zhongkao");
        const home = document.getElementById("screen-gate");
        if (!zk || !home || !home.classList.contains("active")) return null;
        if (!document.documentElement.classList.contains("session-ok")) return null;
        return true;
      })()`);
      return gate ? s : null;
    }, 30000, "exam gate");

    await evaluate(`document.getElementById("btn-gate-zhongkao").click()`);
    await waitFor(async () => evaluate(`(() => {
      const prompt = document.getElementById("profile-name-gate");
      if (!prompt || prompt.hidden) return null;
      return true;
    })()`), 8000, "姓名 prompt");
    await evaluate(`(() => {
      document.getElementById("profile-name-input").value = "小王";
      document.getElementById("profile-class-input").value = "初三1班";
      document.getElementById("profile-name-form").requestSubmit();
      return true;
    })()`);
    await waitFor(async () => evaluate(`(() => {
      const prompt = document.getElementById("profile-name-gate");
      return prompt && prompt.hidden ? true : null;
    })()`), 8000, "profile saved");
    await evaluate(`document.getElementById("btn-gate-zhongkao").click()`);
    await waitFor(async () => {
      const s = await snap();
      return s && s.home ? s : null;
    }, 20000, "practice home");

    await evaluate(`document.getElementById("btn-continue").click()`);

    const samples = [];

    async function waitCard(labelIncludes) {
      return waitFor(async () => {
        const s = await snap();
        if (!s || !s.active || !s.word || !s.example) return null;
        if (labelIncludes && s.label.indexOf(labelIncludes) === -1) return null;
        if (!s.buttons.some((b) => b.kind === "example" && !b.slow)) return null;
        return s;
      }, 15000, "card " + (labelIncludes || ""));
    }

    async function waitUtterance(from, text, label) {
      try {
        return await waitFor(async () => {
          const s = await snap();
          const row = (s.spoken || []).slice(from).find((r) => r.ok && r.text === text);
          return row || null;
        }, 4000, label);
      } catch (err) {
        const s = await snap();
        throw new Error(err.message + " want=" + JSON.stringify(text) + " spoken=" + JSON.stringify(s && s.spoken) + " buttons=" + JSON.stringify(s && s.buttons) + " label=" + (s && s.label));
      }
    }

    function expectSentence(s, phase) {
      const say = (s.buttons.find((b) => b.kind === "example" && !b.slow) || {}).say || "";
      const visual = cloze.blankExample(s.example, s.word);
      const spoken = cloze.spokenExample(s.example, s.word);
      const before = oldBlankSpeech(s.example, s.word);
      assert.strictEqual(say, spoken, phase + " 读例句 data-say");
      assert.ok(hasToken(say, s.word), phase + " example speaks the headword: " + say);
      assert.ok(!/\bblank\b/i.test(say), phase + " example must not say blank: " + say);
      assert.ok(!/_{3,}/.test(say), phase + " example must not spell underscores: " + say);
      if (visual !== s.example) {
        assert.ok(s.hint.indexOf("___") !== -1, phase + " hint stays blanked: " + s.hint);
        assert.ok(before !== spoken, phase + " before/after differ");
      }
      const wordBtn = s.buttons.find((b) => b.kind === "word" && !b.slow);
      return { say, visual, spoken, before, wordBtn };
    }

    async function readAloud(s, phase, wantWordButton) {
      await evaluate(`(() => {
        const row = document.getElementById("card-speak");
        if (row) row.scrollIntoView({ block: "center" });
        return true;
      })()`);
      s = await snap();
      const info = expectSentence(s, phase);
      if (wantWordButton) {
        assert.ok(info.wordBtn, phase + " shows 读单词");
        assert.strictEqual(info.wordBtn.say, s.word);
        assert.ok(info.wordBtn.top >= 0 && info.wordBtn.top < 844, phase + " 读单词 is on the phone screen @" + info.wordBtn.top);
        assert.ok(info.wordBtn.left >= 0 && info.wordBtn.left < 390, phase + " 读单词 is inside the 390px width");
      } else {
        assert.ok(!info.wordBtn, phase + " hides 读单词 before the answer is on screen");
      }
      if (wantWordButton && phase.indexOf("meaning") === 0 && phase.indexOf("reveal") === -1) {
        await waitUtterance(0, s.word, phase + " auto headword");
        await sleep(120);
      }
      const beforeTap = (await snap()).spoken.length;
      const tapped = await evaluate(`(() => {
        const buttons = [...document.querySelectorAll(".speak-btn")];
        const b = buttons.find((el) => el.getAttribute("data-say-kind") === "word" && el.getAttribute("data-say-slow") !== "1" && !el.hidden && !(el.closest && el.closest("[hidden]")));
        if (!b) return false;
        b.scrollIntoView({ block: "center" });
        b.click();
        return true;
      })()`);
      if (wantWordButton) {
        assert.strictEqual(tapped, true, phase + " 读单词 button");
        await waitUtterance(beforeTap, s.word, phase + " 读单词 tap");
      }
      const fromEx = (await snap()).spoken.length;
      const clicked = await evaluate(`(() => {
        const buttons = [...document.querySelectorAll(".speak-btn")];
        const b = buttons.find((el) => el.getAttribute("data-say-kind") === "example" && el.getAttribute("data-say-slow") !== "1" && !el.hidden && !(el.closest && el.closest("[hidden]")));
        if (!b) return "";
        b.scrollIntoView({ block: "center" });
        b.click();
        return b.getAttribute("data-say") || "";
      })()`);
      assert.strictEqual(clicked, info.spoken, phase + " clicked example");
      const heard = await waitUtterance(fromEx, info.spoken, phase + " 读例句");
      assert.ok(hasToken(heard.text, s.word));
      samples.push({
        phase,
        word: s.word,
        visualHint: info.visual,
        beforeExampleSpeech: info.before,
        afterExampleSpeech: info.spoken,
        heardExample: heard.text,
        heardWord: wantWordButton ? s.word : "",
      });
      return info;
    }

    const meaning1 = await waitCard("英文");
    assert.strictEqual(meaning1.vw, 390);
    await readAloud(meaning1, "meaning-1", true);
    await shot("speech-meaning-1");
    await evaluate(`document.getElementById("btn-unknown").click()`);
    const meaning1Reveal = await waitFor(async () => {
      const s = await snap();
      if (!s || !s.cont) return null;
      if (!s.buttons.some((b) => b.kind === "word" && !b.slow && b.say === meaning1.word)) return null;
      return s;
    }, 8000, "meaning reveal");
    await readAloud(meaning1Reveal, "meaning-1-reveal", true);

    await evaluate(`document.getElementById("btn-feedback-continue").click()`);
    const meaning2 = await waitFor(async () => {
      const s = await waitCard("英文").catch(() => null);
      if (!s || s.word === meaning1.word) return null;
      return s;
    }, 15000, "second meaning card");
    await readAloud(meaning2, "meaning-2", true);
    await shot("speech-meaning-2");
    await evaluate(`document.getElementById("btn-unknown").click()`);
    await waitFor(async () => {
      const s = await snap();
      return s && s.cont ? s : null;
    }, 8000, "meaning 2 reveal");
    await evaluate(`document.getElementById("btn-feedback-continue").click()`);

    await evaluate(`document.getElementById("btn-quit").click()`);
    await waitFor(async () => {
      const s = await snap();
      if (!s || !s.home) return null;
      if (s.mustGate) {
        await evaluate(`document.getElementById("btn-must-later").click()`);
        return null;
      }
      return s;
    }, 10000, "home after meaning");

    await evaluate(`document.getElementById("btn-spelling").click()`);
    const spelling = [];
    for (let n = 1; n <= 2; n++) {
      const card = await waitFor(async () => {
        const s = await waitCard("拼写").catch(() => null);
        if (!s) return null;
        if (spelling.some((prev) => prev.word === s.word && prev.example === s.example)) return null;
        if (s.buttons.some((b) => b.kind === "word" && !b.slow)) return null;
        return s;
      }, 15000, "spelling card " + n);
      await readAloud(card, "spelling-" + n + "-before", false);
      await evaluate(`document.getElementById("btn-unknown").click()`);
      const revealed = await waitFor(async () => {
        const s = await snap();
        if (!s || !s.cont) return null;
        if (!s.buttons.some((b) => b.kind === "word" && !b.slow && b.say === card.word)) return null;
        if (!s.buttons.some((b) => b.kind === "example" && !b.slow && hasToken(b.say, card.word))) return null;
        return s;
      }, 8000, "spelling reveal " + n);
      await readAloud(revealed, "spelling-" + n + "-reveal", true);
      if (n === 1) await shot("speech-spelling-reveal");
      spelling.push(card);
      await evaluate(`document.getElementById("btn-feedback-continue").click()`);
    }

    await evaluate(`document.getElementById("btn-quit").click()`);
    await waitFor(async () => {
      const s = await snap();
      if (!s || !s.home) return null;
      if (s.mustGate) {
        await evaluate(`document.getElementById("btn-must-later").click()`);
        return null;
      }
      if (!s.mustBtn) return null;
      return s;
    }, 10000, "今日必练 button");
    await evaluate(`document.getElementById("btn-must-practice").click()`);
    const formSeen = [];
    for (let n = 1; n <= 2; n++) {
      const card = await waitFor(async () => {
        const s = await waitCard("中文").catch(() => null);
        if (!s) return null;
        if (s.label.indexOf("拼写") !== -1) return null;
        if (formSeen.some((prev) => prev.word === s.word)) return null;
        if (s.buttons.some((b) => b.kind === "word" && !b.slow)) return null;
        return s;
      }, 15000, "form card " + n);
      await readAloud(card, "form-" + n + "-before", false);
      await evaluate(`document.getElementById("btn-unknown").click()`);
      const revealed = await waitFor(async () => {
        const s = await snap();
        if (!s || !s.cont) return null;
        if (!s.buttons.some((b) => b.kind === "word" && !b.slow && b.say === card.word)) return null;
        return s;
      }, 8000, "form reveal " + n);
      await readAloud(revealed, "form-" + n + "-reveal", true);
      if (n === 1) await shot("speech-form-reveal");
      formSeen.push(card);
      if (n === 1) await evaluate(`document.getElementById("btn-feedback-continue").click()`);
    }

    await evaluate(`document.getElementById("btn-quit").click()`);
    await waitFor(async () => {
      const s = await snap();
      if (!s || !s.home) return null;
      if (s.mustGate) {
        await evaluate(`document.getElementById("btn-must-later").click()`);
        return null;
      }
      return s;
    }, 10000, "home before streak");
    const audioBefore = (await snap()).audio.length;
    const spokenBefore = (await snap()).spoken.length;
    await evaluate(`document.getElementById("btn-continue").click()`);
    const streakCard = await waitCard("英文");
    await waitUtterance(spokenBefore, streakCard.word, "streak-card auto headword");
    const meaning = streakCard.meaning;
    const picked = await evaluate(`((meaning) => {
      const buttons = [...document.querySelectorAll("#choices button")];
      const btn = buttons.find((b) => (b.textContent || "").replace(/^\\d+\\.\\s+/, "") === meaning);
      if (!btn) return buttons.map((b) => (b.textContent || "").trim());
      btn.click();
      return true;
    })(${JSON.stringify(meaning)})`);
    assert.strictEqual(picked, true, "correct meaning choice clicked, saw " + JSON.stringify(picked));
    const after = await waitFor(async () => {
      const s = await snap();
      const fresh = (s.audio || []).slice(audioBefore);
      if (!fresh.some((src) => src.indexOf("01_first_blood.m4a") !== -1)) return null;
      return s;
    }, 8000, "First blood clip");
    const freshAudio = after.audio.slice(audioBefore);
    const freshSpeech = after.spoken.slice(spokenBefore).map((r) => r.text);
    assert.ok(freshAudio.some((src) => src.indexOf("01_first_blood.m4a") !== -1), freshAudio.join(","));
    assert.ok(!freshSpeech.some((text) => text === "First blood" || text === "Shut down"), freshSpeech.join(" | "));
    assert.ok(freshSpeech.indexOf(streakCard.word) !== -1, "headword still spoken on the streak card");

    const outDir = "/opt/cursor/artifacts";
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, "speech-spoken.json"), JSON.stringify({
      viewport: { width: 390, height: 844 },
      samples,
      firstBlood: freshAudio,
    }, null, 2));
    console.log(JSON.stringify(samples, null, 2));
    console.log("speech-browser ok");
  } finally {
    if (chrome) chrome.kill("SIGKILL");
    server.close();
  }
}

function documentHidden() {
  return false;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

"use strict";

// Node 22+ provides global WebSocket. Node 20 needs the ws package.
if (typeof WebSocket === "undefined") {
  global.WebSocket = require("ws");
}

/*
 * Student-path smoke test.
 *
 * Run: node tests/student-path.test.js
 * Node 20: npm install ws   (Node 22+ already has global WebSocket)
 *
 * QuizMario kept breaking in a loop because two questions were answered in
 * more than one place, and no test failed when those answers diverged:
 *
 *   Which screen?  index.html opens on the 中考/高考 gate, a head script may
 *   send unsigned visitors to login.html, sync.js may send them again, and
 *   game.js always finishes boot on the gate. The 注册/登录 tab is both the
 *   HTML attributes and auth-page.js mode.
 *
 *   Deal or clear? buildQueue used to drop every new card when a saved
 *   dueOnly flag was on, nextCard treated that empty queue as a pass, and
 *   startLevel reset practice to a text box. Next set then advanced into
 *   another empty clear.
 *
 * This script locks the path those patches were each trying to hold:
 * unsigned → login on 注册 → signup reaches the gate → 中考 practice deals
 * four choices → a leftover 只练到期 flag does not clear a fresh set →
 * a real clear still opens the next set → student home has no report,
 * backup, about, or homescreen tip.
 *
 * Signup is answered by a local fetch stub. Nothing is sent to Supabase.
 */

const assert = require("assert");
const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const root = path.join(__dirname, "..");

function read(name) {
  return fs.readFileSync(path.join(root, name), "utf8");
}

function staticGuards() {
  const login = read("login.html");
  const auth = read("auth-page.js");
  const index = read("index.html");
  const game = read("game.js");
  const sync = read("sync.js");

  assert.ok(
    /id="mode-register"[^>]*aria-pressed="true"/.test(login),
    "login.html must ship with 注册 already pressed"
  );
  assert.ok(login.includes(">注册</button>"), "submit button label is 注册");
  assert.ok(auth.includes('var mode = "register"'), "auth-page default mode is register");
  assert.ok(auth.includes('setMode("register")'), "auth-page boot selects 注册");
  assert.ok(index.includes('location.replace("login.html")'), "unsigned index.html goes to login");
  assert.ok(index.includes('id="screen-gate"'), "exam gate still exists");
  assert.ok(index.includes('id="btn-gate-zhongkao"') && index.includes('id="btn-gate-gaokao"'), "中考 and 高考 buttons");
  assert.ok(index.includes("meteor.js"), "approved meteor background stays");
  assert.ok(index.includes("Doctoral product powered by Pu Jin"), "credit line stays");
  assert.ok(login.includes("Doctoral product powered by Pu Jin"), "login credit line stays");
  assert.ok(login.includes('src="orb.js"'), "login shows the Doubao orb");
  assert.ok(login.includes("logo-mark.png"), "login uses the orb logo mark");
  assert.ok(login.includes('id="orb"'), "login orb canvas is present");
  assert.ok(!login.includes("meteor.js"), "login must not load the meteor shower");
  assert.ok(!login.includes("fonts.googleapis.com"), "login must not depend on Google Fonts");
  assert.ok(!login.includes("photon-spiral"), "login must not keep the old meteor canvas");

  const banned = [
    ["id=\"report-panel\"", "student report"],
    ["id=\"backup-panel\"", "backup panel"],
    ["id=\"about-panel\"", "about panel"],
    ["id=\"homescreen-tip\"", "homescreen tip"],
    ["id=\"btn-due-only\"", "只练到期 button"],
    ["id=\"answer-input\"", "typed answer field"],
    ["id=\"btn-mc-toggle\"", "typed/MC toggle"],
    ["只练到期", "只练到期 label"],
    ["学习报告码", "report copy"],
    ["添加到手机主屏幕", "homescreen copy"],
  ];
  for (const [needle, why] of banned) {
    assert.ok(!index.includes(needle), "index.html brought back " + why);
  }
  assert.ok(!game.includes("let dueOnly") && !game.includes("if (dueOnly") && !game.includes("mcMode"),
    "game.js must not filter the queue with dueOnly or a typed-answer mode");
  assert.ok(game.includes("delete save.dueOnly"), "a leftover dueOnly flag is still stripped from the save");
  assert.ok(sync.includes("sendToLogin"), "sync.js still sends a missing session to login");
}

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
    case ".css": return "text/css";
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
    email: "smoke.student.path@example.com",
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: {},
    created_at: "2026-01-01T00:00:00.000Z",
    email_confirmed_at: "2026-01-01T00:00:00.000Z",
  },
};

function mockSource() {
  return `(function () {
    if (window.__QM_SMOKE_FETCH) return;
    window.__QM_SMOKE_FETCH = [];
    var session = ${JSON.stringify(SESSION)};
    var orig = window.fetch ? window.fetch.bind(window) : null;
    function reply(status, payload) {
      return Promise.resolve(new Response(JSON.stringify(payload), {
        status: status,
        headers: { "content-type": "application/json" }
      }));
    }
    window.fetch = function (input, init) {
      var url = typeof input === "string" ? input : (input && input.url) || "";
      var method = ((init && init.method) || (input && input.method) || "GET").toUpperCase();
      if (!/supabase\\.co/i.test(url)) {
        if (!orig) return Promise.reject(new Error("no fetch"));
        return orig(input, init);
      }
      window.__QM_SMOKE_FETCH.push(method + " " + url.split("?")[0]);
      if (url.indexOf("/user_progress") !== -1) {
        if (method === "GET" || method === "HEAD") {
          return reply(406, {
            code: "PGRST116",
            details: "The result contains 0 rows",
            message: "JSON object requested, multiple (or no) rows returned"
          });
        }
        return reply(201, [{ user_id: session.user.id, updated_at: "2026-01-01T00:00:00.000Z" }]);
      }
      if (url.indexOf("/auth/v1/settings") !== -1) {
        return reply(200, { external: { email: true }, disable_signup: false, mailer_autoconfirm: true });
      }
      if (url.indexOf("/auth/v1/user") !== -1 && method === "GET") return reply(200, session.user);
      if (url.indexOf("/signup") !== -1 || url.indexOf("/token") !== -1) return reply(200, session);
      return reply(200, {});
    };
  })();`;
}

class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.next = 0;
    this.pending = new Map();
    this.listeners = [];
    ws.addEventListener("message", (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const job = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) job.reject(new Error(msg.error.message || JSON.stringify(msg.error)));
        else job.resolve(msg.result || {});
      } else if (msg.method) {
        for (const fn of this.listeners) fn(msg);
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

async function browserVersion(port) {
  const res = await fetch("http://127.0.0.1:" + port + "/json/version");
  if (!res.ok) throw new Error("DevTools version failed");
  return res.json();
}

async function main() {
  staticGuards();
  const server = await startServer();
  const origin = "http://127.0.0.1:" + server.address().port;
  const userDir = fs.mkdtempSync(path.join(os.tmpdir(), "qm-smoke-"));
  const launched = launchChrome(userDir);
  const logs = [];
  let cdp = null;
  let sessionId = null;
  try {
    const port = await launched.port;
    const version = await browserVersion(port);
    const ws = new WebSocket(version.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      ws.addEventListener("open", resolve);
      ws.addEventListener("error", () => reject(new Error("DevTools websocket failed")));
    });
    cdp = new Cdp(ws);
    cdp.listeners.push((msg) => {
      if (msg.method === "Runtime.consoleAPICalled") {
        const text = (msg.params.args || []).map((a) => a.value || a.description || a.type).join(" ");
        logs.push(text);
      } else if (msg.method === "Runtime.exceptionThrown") {
        logs.push("EXC " + (msg.params.exceptionDetails && msg.params.exceptionDetails.text));
      }
    });

    const created = await cdp.send("Target.createTarget", { url: "about:blank" });
    const attached = await cdp.send("Target.attachToTarget", { targetId: created.targetId, flatten: true });
    sessionId = attached.sessionId;
    await cdp.send("Page.enable", {}, sessionId);
    await cdp.send("Runtime.enable", {}, sessionId);
    await cdp.send("Page.addScriptToEvaluateOnNewDocument", { source: mockSource() }, sessionId);

    const evalRetry = async (expression) => {
      try {
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
      } catch (err) {
        if (/navigated or closed|context|destroyed|Cannot find context|Execution context/i.test(String(err && err.message))) return null;
        throw err;
      }
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

    await cdp.send("Page.navigate", { url: origin + "/index.html" }, sessionId);

    const login = await waitFor(async () => {
      const snap = await evalRetry(`(() => {
        const reg = document.getElementById("mode-register");
        const form = document.getElementById("auth-form");
        if (!reg || !form || location.href.indexOf("login.html") === -1) return null;
        if (!window.supabase || !window.QuizMarioCloudClient) return null;
        const banner = document.getElementById("config-banner");
        return {
          pressed: reg.getAttribute("aria-pressed"),
          submit: (document.getElementById("btn-submit") || {}).textContent || "",
          confirmHidden: !!(document.getElementById("confirm-label") || {}).hidden,
          formHidden: !!form.hidden,
          banner: banner && !banner.hidden ? banner.textContent : "",
          credit: ((document.querySelector(".credit") || document.querySelector(".gold-footer")) || {}).textContent || ""
        };
      })()`);
      return snap;
    }, 20000, "login page");

    assert.strictEqual(login.pressed, "true", "unsigned visit opens on 注册");
    assert.strictEqual(login.submit, "注册");
    assert.strictEqual(login.confirmHidden, false, "confirm password is visible on 注册");
    assert.strictEqual(login.formHidden, false, "a stored session must not skip the form");
    assert.strictEqual(login.banner, "", login.banner);
    assert.ok(login.credit.includes("Doctoral product powered by Pu Jin"));

    const loginTab = await evalRetry(`(() => {
      document.getElementById("mode-login").click();
      const confirm = document.getElementById("confirm-label");
      return {
        loginPressed: document.getElementById("mode-login").getAttribute("aria-pressed"),
        regPressed: document.getElementById("mode-register").getAttribute("aria-pressed"),
        submit: document.getElementById("btn-submit").textContent,
        confirmHidden: !!(confirm && confirm.hidden)
      };
    })()`);
    assert.strictEqual(loginTab.loginPressed, "true");
    assert.strictEqual(loginTab.regPressed, "false");
    assert.strictEqual(loginTab.submit, "登录");
    assert.strictEqual(loginTab.confirmHidden, true);

    const back = await evalRetry(`(() => {
      document.getElementById("mode-register").click();
      return {
        pressed: document.getElementById("mode-register").getAttribute("aria-pressed"),
        submit: document.getElementById("btn-submit").textContent,
        confirmHidden: !!document.getElementById("confirm-label").hidden
      };
    })()`);
    assert.strictEqual(back.pressed, "true");
    assert.strictEqual(back.submit, "注册");
    assert.strictEqual(back.confirmHidden, false);

    const mismatch = await evalRetry(`(() => {
      document.getElementById("email").value = "smoke.student.path@example.com";
      document.getElementById("password").value = "secret12";
      document.getElementById("confirm").value = "different";
      document.getElementById("auth-form").requestSubmit();
      return {
        href: location.href,
        msg: document.getElementById("auth-msg").textContent
      };
    })()`);
    assert.ok(mismatch.href.includes("login.html"), "bad signup stays on login");
    assert.ok(mismatch.msg.includes("两次密码不一致"), mismatch.msg);

    await evalRetry(`(() => {
      document.getElementById("confirm").value = "secret12";
      document.getElementById("auth-form").requestSubmit();
      return true;
    })()`);

    await waitFor(async () => {
      const snap = await evalRetry(`(() => {
        const gate = document.getElementById("screen-gate");
        const zk = document.getElementById("btn-gate-zhongkao");
        const gk = document.getElementById("btn-gate-gaokao");
        if (!gate || !zk || !gk) return null;
        if (location.href.indexOf("login.html") !== -1) return null;
        if (!gate.classList.contains("active")) return null;
        return {
          zk: zk.textContent.trim(),
          gk: gk.textContent.trim(),
          credit: (document.querySelector(".gold-sign") || {}).textContent || "",
          meteor: !!document.getElementById("photon-spiral")
        };
      })()`);
      return snap;
    }, 30000, "exam gate after signup");

    const gate = await evalRetry(`(() => ({
      zk: document.getElementById("btn-gate-zhongkao").textContent.trim(),
      gk: document.getElementById("btn-gate-gaokao").textContent.trim(),
      credit: document.querySelector(".gold-sign").textContent,
      meteor: !!document.getElementById("photon-spiral"),
      homeActive: document.getElementById("screen-home").classList.contains("active")
    }))()`);
    assert.strictEqual(gate.zk, "中考");
    assert.strictEqual(gate.gk, "高考");
    assert.strictEqual(gate.homeActive, false, "signup lands on the exam gate");
    assert.ok(gate.credit.includes("Doctoral product powered by Pu Jin"));
    assert.strictEqual(gate.meteor, true);

    const reloadToGate = async (label) => {
      await evalRetry(`document.documentElement.setAttribute("data-qm-boot", "stale")`);
      await cdp.send("Page.reload", { ignoreCache: true }, sessionId);
      await waitFor(async () => evalRetry(`(() => {
        if (document.documentElement.getAttribute("data-qm-boot") === "stale") return null;
        const gate = document.getElementById("screen-gate");
        if (!window.__QM || !gate || !gate.classList.contains("active")) return null;
        return true;
      })()`), 30000, label);
    };

    await evalRetry(`(() => {
      localStorage.setItem("vocabSpotlight_v1", JSON.stringify({
        points: 0, streak: 0, bestStreak: 0, unlockedLevel: 1,
        cards: {}, levelStars: {}, sortMode: "default", voiceOn: false,
        dueOnly: true,
        track: "zhongkao",
        trackUnlock: { zhongkao: 1 },
        trackStars: {},
        daily: {},
        profile: { name: "", cls: "" },
        updatedAt: "2020-01-01T00:00:00.000Z"
      }));
      return true;
    })()`);
    await reloadToGate("gate after reload");

    await evalRetry(`document.getElementById("btn-gate-zhongkao").click()`);
    const home = await waitFor(async () => evalRetry(`(() => {
      const home = document.getElementById("screen-home");
      if (!home || !home.classList.contains("active")) return null;
      return { html: home.innerHTML, text: home.innerText };
    })()`), 10000, "student home");
    for (const needle of ["学习报告码", "进度备份", "关于 / 学习方法", "添加到手机主屏幕", "report-panel", "backup-panel", "about-panel", "homescreen-tip", "btn-due-only", "只练到期", "answer-input"]) {
      assert.ok(!home.html.includes(needle) && !home.text.includes(needle), "student home still shows " + needle);
    }
    assert.ok(home.text.includes("继续闯关"), "continue practice is on the student home");

    await evalRetry(`document.getElementById("btn-continue").click()`);
    const fresh = await waitFor(async () => evalRetry(`(() => {
      const play = document.getElementById("screen-play");
      const clear = document.getElementById("screen-clear");
      const n = document.querySelectorAll("#choices .choice").length;
      if (!(play && play.classList.contains("active")) && !(clear && clear.classList.contains("active"))) return null;
      if (play.classList.contains("active") && n === 0 && !(clear && clear.classList.contains("active"))) return null;
      return {
        play: play.classList.contains("active"),
        clear: !!(clear && clear.classList.contains("active")),
        n: n,
        prompt: document.getElementById("prompt-main").textContent,
        queue: Number(document.getElementById("play-queue").textContent),
        typed: !!document.getElementById("answer-input"),
        due: !!document.getElementById("btn-due-only")
      };
    })()`), 10000, "first practice card");
    assert.strictEqual(fresh.clear, false, "fresh set with a leftover dueOnly flag must not show Set cleared");
    assert.strictEqual(fresh.play, true);
    assert.strictEqual(fresh.n, 4, "practice deals four choices");
    assert.ok(fresh.prompt && fresh.prompt !== "—", "a real prompt was dealt");
    assert.ok(fresh.queue >= 1, "the queue is not empty after the first card");
    assert.strictEqual(fresh.typed, false);
    assert.strictEqual(fresh.due, false);

    await evalRetry(`(() => {
      const track = (window.VOCAB_EXAM_TRACKS || []).find((t) => t.id === "zhongkao");
      if (!track) throw new Error("missing 中考 track");
      const due = Date.now() + 10 * 86400000;
      const cards = {};
      for (const w of track.sets[0]) {
        cards["zhongkao|0::" + String(w.word).toLowerCase()] = {
          ef: 2.5, interval: 3, reps: 4, lapses: 0, due: due,
          correct: 4, wrong: 0, mastery: 3, state: "review"
        };
      }
      localStorage.setItem("vocabSpotlight_v1", JSON.stringify({
        points: 20, streak: 0, bestStreak: 1, unlockedLevel: 1,
        cards: cards, levelStars: {}, sortMode: "default", voiceOn: false,
        track: "zhongkao",
        trackUnlock: { zhongkao: 1 },
        trackStars: { zhongkao: {} },
        daily: {},
        profile: { name: "", cls: "" },
        updatedAt: "2020-01-01T00:00:00.000Z"
      }));
      return track.sets[0].length;
    })()`);
    await reloadToGate("gate before cleared set");
    await evalRetry(`document.getElementById("btn-gate-zhongkao").click()`);
    await waitFor(async () => evalRetry(`document.getElementById("screen-home").classList.contains("active") ? true : null`), 10000, "home before cleared set");
    await evalRetry(`document.getElementById("btn-continue").click()`);

    const answerOne = `(() => {
      const meaning = document.getElementById("prompt-main").textContent.trim();
      const hint = document.getElementById("prompt-hint").textContent;
      const track = (window.VOCAB_EXAM_TRACKS || []).find((t) => t.id === "zhongkao");
      let word = "";
      if (track) {
        for (const set of track.sets) {
          const hits = set.filter((w) => w.meaning_zh === meaning && w.example_zh && hint.indexOf(w.example_zh) !== -1);
          const loose = set.filter((w) => w.meaning_zh === meaning);
          const pick = hits.length ? hits : loose;
          if (pick.length === 1) { word = pick[0].word; break; }
        }
      }
      const buttons = Array.from(document.querySelectorAll("#choices .choice"));
      const btn = buttons.find((b) => b.textContent.replace(/^\\d+\\.\\s*/, "").trim().toLowerCase() === String(word).toLowerCase());
      if (!btn) return { ok: false, meaning: meaning, word: word, labels: buttons.map((b) => b.textContent) };
      btn.click();
      const good = document.getElementById("btn-rate-good");
      if (!good) return { ok: false, meaning: meaning, word: word, labels: ["no good button"] };
      good.click();
      return { ok: true, word: word, meaning: meaning };
    })()`;

    let cleared = false;
    let lastPrompt = "";
    let answeredCount = 0;
    for (let i = 0; i < 20 && !cleared; i++) {
      const state = await waitFor(async () => evalRetry(`(() => {
        const clear = document.getElementById("screen-clear");
        if (clear && clear.classList.contains("active")) return { done: true };
        const play = document.getElementById("screen-play");
        const n = document.querySelectorAll("#choices .choice").length;
        const fb = (document.getElementById("feedback").textContent || "").trim();
        const prompt = document.getElementById("prompt-main").textContent.trim();
        if (play && play.classList.contains("active") && n === 4 && !document.getElementById("btn-rate-good") && fb === "" && prompt && prompt !== "—") {
          return { done: false, prompt: prompt };
        }
        return null;
      })()`), 8000, "card or clear screen");
      if (state.done) {
        cleared = true;
        break;
      }
      // Rating hides the Good button for ~700ms before the next card. The old
      // choices stay on screen, so ignore that gap and wait for a new prompt.
      if (state.prompt === lastPrompt) {
        await sleep(250);
        continue;
      }
      const answered = await evalRetry(answerOne);
      if (!answered || !answered.ok) {
        await sleep(250);
        continue;
      }
      lastPrompt = state.prompt;
      answeredCount += 1;
      await waitFor(async () => evalRetry(`(() => {
        const clear = document.getElementById("screen-clear");
        if (clear && clear.classList.contains("active")) return true;
        const fb = document.getElementById("feedback").textContent || "";
        return fb.indexOf("下次") !== -1 ? true : null;
      })()`), 5000, "Good rating");
    }
    assert.ok(cleared, "a real clear should reach Set cleared (answered " + answeredCount + ")");

    const before = await evalRetry(`document.getElementById("play-level").textContent`);
    await evalRetry(`document.getElementById("btn-next-level").click()`);
    const next = await waitFor(async () => evalRetry(`(() => {
      const play = document.getElementById("screen-play");
      const clear = document.getElementById("screen-clear");
      const n = document.querySelectorAll("#choices .choice").length;
      if (!(play && play.classList.contains("active")) || n !== 4) return null;
      return {
        clear: clear.classList.contains("active"),
        n: n,
        prompt: document.getElementById("prompt-main").textContent,
        level: document.getElementById("play-level").textContent,
        queue: Number(document.getElementById("play-queue").textContent)
      };
    })()`), 10000, "next set after a real clear");
    assert.strictEqual(next.clear, false, "Next set must deal the following set");
    assert.strictEqual(next.n, 4);
    assert.ok(next.prompt && next.prompt !== "—");
    assert.ok(next.level.includes("第2组"), "next set title was " + next.level);
    assert.notStrictEqual(next.level, before);
    assert.ok(next.queue >= 1);

    console.log("student-path ok");
  } catch (err) {
    let page = "";
    if (cdp && sessionId) {
      try {
        const res = await cdp.send("Runtime.evaluate", {
          expression: `JSON.stringify({ href: location.href, fetches: window.__QM_SMOKE_FETCH || [], msg: (document.getElementById("auth-msg") || {}).textContent || "", text: (document.body && document.body.innerText || "").slice(0, 700) })`,
          returnByValue: true,
        }, sessionId);
        page = res.result && res.result.value;
      } catch (_) {}
    }
    if (page) console.error("PAGE " + page);
    if (logs.length) console.error(logs.slice(-20).join("\n"));
    throw err;
  } finally {
    if (launched.chrome && !launched.chrome.killed) launched.chrome.kill("SIGKILL");
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(userDir, { recursive: true, force: true });
  }
}

main().then(() => {
  process.exit(0);
}, (err) => {
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});

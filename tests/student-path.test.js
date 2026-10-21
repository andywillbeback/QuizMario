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
  assert.ok(index.includes('src="srs-rules.js"'), "clearance rules load with the game");
  assert.ok(index.includes('id="challenge-timer"'), "the 12-minute clock is on the training card");
  assert.ok(index.includes('id="screen-fail"') && index.includes("遗憾失败"), "timeout has a regret-fail screen");
  assert.ok(game.includes('hint: '), "training card still shows the hint line");
  assert.ok(!index.includes('id="btn-sort-scene"') && !index.includes('id="btn-sort-default"'), "sort toggles are gone");
  assert.ok(!index.includes(">场景<") && !index.includes(">默认<"), "sort labels are gone");
  assert.ok(!game.includes("btn-sort-scene") && !game.includes('sortMode === "scene"'), "scene sort path is gone");
  assert.ok(game.includes('return "default"'), "saved sort mode collapses to default");
  assert.ok(index.includes('id="btn-must-practice"') && index.includes("今日必练"), "今日必练 entry");
  assert.ok(index.includes('id="must-gate"') && index.includes("先清掉"), "daily soft gate copy");
  assert.ok(!index.includes('id="btn-due-today"') && !index.includes('id="btn-wrong-book"'), "separate due and wrong-book CTAs are gone");
  assert.ok(index.includes('src="review-queues.js"'), "queue rules load with the game");
  assert.ok(index.includes('src="learner-events.js"'), "learner event emitter loads with the game");
  assert.ok(index.includes('id="btn-export-learner-events"'), "JSONL export is on the home screen");
  assert.ok(game.includes("emitLearnerAnswer") && game.includes("signalDueItems") && game.includes("emitWrongBook"),
    "answers, due queue, and wrong-book entry emit learner events");
  assert.ok(!/已同步到\s*ALS/.test(index + game + sync), "no fake ALS sync banner");
  assert.ok(game.includes("今天没有到期或错词"), "empty 今日必练 copy");
  assert.ok(game.includes('sessionKind === "wrongbook"'), "wrong-book graduation still checks that session");
  assert.ok(game.includes('sessionKind === "must"'), "今日必练 is its own practice mode");
  assert.ok(game.includes("mergePracticeQueue"), "home builds the combined queue");
  assert.ok(index.includes('id="home-loop"') && index.includes("薄弱点 → 今日必练"), "home loop strip");
  assert.ok(index.includes('id="btn-clear-continue"') && index.includes("继续闯关第"), "must-clear frontier CTA");
  assert.ok(index.includes('id="btn-clear-als"') && index.includes("去 ALS 修语法"), "must-clear ALS CTA");
  assert.ok(index.includes('src="home-loop.js"'), "home loop rules load with the game");
  assert.ok(game.includes("onHome: studentHomeActive()"), "soft gate checks the student home");
  assert.ok(!game.includes("继续闯关会先练今日到期"), "继续闯关 no longer prefers the due queue");
  assert.ok(!game.includes("btn-rate-again"), "no third Again button");
  const rules = read("srs-rules.js");
  assert.ok(rules.includes("12 * 60 * 1000"), "challenge length constant is 12 minutes");
  assert.ok(rules.includes("audio/13_challenge_cheer.m4a"), "cheer voice path");
  assert.ok(rules.includes("audio/14_challenge_regret.m4a"), "regret voice path");
  assert.ok(rules.includes("audio/15_applause.wav"), "applause sfx path");
  assert.ok(rules.includes("audio/16_crows.wav"), "crow sfx path");
  assert.ok(rules.includes("就你叫生词啊？") && rules.includes("这把给了。"), "achievement lines");
  assert.ok(index.includes('id="clear-achievement"'), "success achievement banner");
  assert.ok(index.includes('id="fail-banner"'), "fail banner");
  assert.ok(index.includes('id="crow-pass"'), "crow fly overlay");
  assert.ok(!/function playChallengeCue[\s\S]*?speakZh/.test(game), "challenge cue does not speak");
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
      if (url.indexOf("/learner_events") !== -1) {
        if (method === "GET" || method === "HEAD") return reply(200, []);
        var parsed = [];
        try { parsed = JSON.parse((init && init.body) || "[]"); } catch (e) { parsed = []; }
        if (!Array.isArray(parsed)) parsed = parsed ? [parsed] : [];
        if (!window.__QM_LEARNER_EVENTS) window.__QM_LEARNER_EVENTS = [];
        for (var i = 0; i < parsed.length; i++) window.__QM_LEARNER_EVENTS.push(parsed[i]);
        return reply(201, parsed);
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
    assert.ok(home.text.includes("12分钟挑战"), "timed challenge is separate from regular study");
    assert.ok(home.text.includes("拼写"), "spelling is its own entry");
    assert.ok(home.text.includes("今日必练"), "今日必练 is explained on the student home");
    assert.ok(!home.html.includes("btn-due-today") && !home.html.includes("btn-wrong-book"), "due and wrong-book are not separate buttons");

    const emptyQueues = await waitFor(async () => evalRetry(`(() => {
      const logged = window.QuizMarioCloud && window.QuizMarioCloud.loggedIn && window.QuizMarioCloud.loggedIn();
      const must = document.getElementById("btn-must-practice");
      const gate = document.getElementById("must-gate");
      const hint = document.getElementById("continue-hint");
      const strip = document.getElementById("home-loop");
      const title = (document.getElementById("home-loop-title") || {}).textContent || "";
      if (!logged || !strip || strip.hidden || title.indexOf("薄弱点") === -1) return null;
      return {
        home: document.getElementById("screen-home").classList.contains("active"),
        play: document.getElementById("screen-play").classList.contains("active"),
        mustHidden: !must || must.hidden,
        gateHidden: !gate || gate.hidden,
        primacy: document.getElementById("screen-home").getAttribute("data-review-primacy"),
        continueSecondary: document.getElementById("btn-continue").classList.contains("secondary"),
        hint: hint ? hint.textContent : "",
        again: !!document.getElementById("btn-rate-again"),
        strip: title,
        detail: (document.getElementById("home-loop-detail") || {}).textContent || "",
        action: strip.getAttribute("data-action"),
        mode: strip.getAttribute("data-mode"),
        fakeAls: /ALS 补了|回流词/.test(document.body.innerText || "")
      };
    })()`), 15000, "signed-in home strip");
    assert.strictEqual(emptyQueues.home, true, "empty 今日必练 stays on the homepage");
    assert.strictEqual(emptyQueues.play, false);
    assert.strictEqual(emptyQueues.mustHidden, true, "a zero count hides 今日必练");
    assert.strictEqual(emptyQueues.gateHidden, true, "a zero count does not raise the soft gate");
    assert.strictEqual(emptyQueues.primacy, "hidden");
    assert.strictEqual(emptyQueues.continueSecondary, false, "继续闯关 stays the primary button when nothing is due");
    assert.ok(emptyQueues.hint.includes("没有到期或错词"), emptyQueues.hint);
    assert.strictEqual(emptyQueues.again, false);
    assert.strictEqual(emptyQueues.strip, "薄弱点 → 今日必练");
    assert.strictEqual(emptyQueues.detail, "今日必练 0 道，继续闯关");
    assert.strictEqual(emptyQueues.action, "continue", "a zero count links the strip into 继续闯关");
    assert.strictEqual(emptyQueues.mode, "weak");
    assert.strictEqual(emptyQueues.fakeAls, false, "the strip must not invent ALS 补了 / 回流词");

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
        hint: document.getElementById("prompt-hint").textContent,
        clock: (document.getElementById("challenge-timer") || {}).textContent || "",
        clockHidden: !!(document.getElementById("challenge-clock") || {}).hidden,
        label: (document.getElementById("prompt-label") || {}).textContent || "",
        choiceText: (document.querySelector("#choices .choice") || {}).textContent || "",
        sceneSort: !!document.getElementById("btn-sort-scene"),
        defaultSort: !!document.getElementById("btn-sort-default"),
        challengeMs: window.__QM && window.__QM.challengeMs,
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
    assert.strictEqual(fresh.challengeMs, 12 * 60 * 1000, "challenge length is still 12 minutes");
    assert.strictEqual(fresh.clockHidden, true, "继续闯关 is regular study and does not start the 12-minute clock");
    assert.ok(fresh.label.indexOf("中文意思") !== -1, "study prompt is English → meaning: " + fresh.label);
    assert.ok(/[\u4e00-\u9fff]/.test(fresh.choiceText), "study choices are Chinese meanings");
    assert.ok(fresh.hint.indexOf("hint:") !== -1 || fresh.hint.indexOf("例") !== -1, "hint stays on the card: " + fresh.hint);
    assert.strictEqual(fresh.sceneSort, false, "play screen has no 场景 sort button");
    assert.strictEqual(fresh.defaultSort, false, "play screen has no 默认 sort button");

    await evalRetry(`document.getElementById("btn-quit").click()`);
    await waitFor(async () => evalRetry(`document.getElementById("screen-home").classList.contains("active") ? true : null`), 8000, "home before challenge");
    await evalRetry(`document.getElementById("btn-challenge").click()`);
    const timed = await waitFor(async () => evalRetry(`(() => {
      const play = document.getElementById("screen-play");
      const clock = document.getElementById("challenge-clock");
      const n = document.querySelectorAll("#choices .choice").length;
      if (!(play && play.classList.contains("active")) || n !== 4) return null;
      if (!clock || clock.hidden) return null;
      return (document.getElementById("challenge-timer") || {}).textContent || "";
    })()`), 10000, "12-minute challenge");
    assert.ok(timed === "12:00" || timed === "11:59", "clock reads " + timed);

    const won = await evalRetry(`window.__QM.debugCelebrateChallenge()`);
    assert.strictEqual(won, true, "an active 12-minute challenge can be won");
    const cele = await waitFor(async () => evalRetry(`(() => {
      const clear = document.getElementById("screen-clear");
      if (!clear || !clear.classList.contains("active")) return null;
      const trophy = document.getElementById("clear-trophy");
      const ach = document.getElementById("clear-achievement");
      return {
        title: (document.getElementById("clear-title") || {}).textContent || "",
        trophy: !!(trophy && !trophy.hidden),
        achievement: ach && !ach.hidden ? ach.textContent : ""
      };
    })()`), 8000, "challenge success");
    assert.ok(cele.title.indexOf("挑战成功") !== -1, cele.title);
    assert.strictEqual(cele.trophy, true, "win shows the trophy");
    assert.ok(["就你叫生词啊？", "我要打十个！", "力微，饭否？"].indexOf(cele.achievement) !== -1, cele.achievement);

    await evalRetry(`document.getElementById("btn-clear-home").click()`);
    await waitFor(async () => evalRetry(`document.getElementById("screen-home").classList.contains("active") ? true : null`), 8000, "home after win");
    await evalRetry(`document.getElementById("btn-challenge").click()`);
    await waitFor(async () => evalRetry(`(() => {
      const play = document.getElementById("screen-play");
      const n = document.querySelectorAll("#choices .choice").length;
      if (!(play && play.classList.contains("active")) || n !== 4) return null;
      return true;
    })()`), 10000, "next challenge after a win");

    await evalRetry(`window.__QM.debugExpireChallenge()`);
    const failed = await waitFor(async () => evalRetry(`(() => {
      const fail = document.getElementById("screen-fail");
      if (!fail || !fail.classList.contains("active")) return null;
      const banner = document.getElementById("fail-banner");
      const crow = document.getElementById("crow-pass");
      return {
        title: (document.getElementById("fail-title") || {}).textContent || "",
        banner: banner && !banner.hidden ? banner.textContent : "",
        crow: !!(crow && !crow.hidden && crow.classList.contains("fly"))
      };
    })()`), 8000, "regret fail screen");
    assert.ok(failed.title.indexOf("遗憾失败") !== -1, failed.title);
    assert.ok(["就这？", "单词：来打我呀。", "这把给了。"].indexOf(failed.banner) !== -1, failed.banner);
    assert.strictEqual(failed.crow, true, "fail shows the crow fly");

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
      const prompt = document.getElementById("prompt-main").textContent.trim();
      const track = (window.VOCAB_EXAM_TRACKS || []).find((t) => t.id === "zhongkao");
      let card = null;
      if (track) {
        for (const set of track.sets) {
          const hit = set.find((w) => w.word === prompt || w.meaning_zh === prompt);
          if (hit) { card = hit; break; }
        }
      }
      const want = card ? (card.word === prompt ? card.meaning_zh : card.word) : "";
      const buttons = Array.from(document.querySelectorAll("#choices .choice"));
      const btn = buttons.find((b) => b.textContent.replace(/^\\d+\\.\\s*/, "").trim() === String(want));
      if (!btn) return { ok: false, prompt: prompt, want: want, labels: buttons.map((b) => b.textContent) };
      btn.click();
      const good = document.getElementById("btn-rate-good");
      if (!good) return { ok: false, prompt: prompt, want: want, labels: ["no good button"] };
      good.click();
      return { ok: true, prompt: prompt, want: want };
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

    const planted = await evalRetry(`(() => {
      const track = (window.VOCAB_EXAM_TRACKS || []).find((t) => t.id === "zhongkao");
      if (!track || !track.sets[2] || track.sets[0].length < 3 || track.sets[1].length < 2) {
        throw new Error("中考 track is too short to plant a cross-group due queue");
      }
      const now = Date.now();
      const review = (due, wrong) => ({
        ef: 2.5, interval: 3, reps: 4, lapses: wrong || 0, due: due,
        correct: 4, wrong: wrong || 0, mastery: 2, state: "review"
      });
      const fresh = { ef: 2.5, interval: 0, reps: 0, lapses: 0, due: 0, correct: 0, wrong: 0, mastery: 0, state: "new" };
      const key = (li, word) => "zhongkao|" + li + "::" + String(word).toLowerCase();
      const a = track.sets[0][0];
      const b = track.sets[1][0];
      const locked = track.sets[2][0];
      const neu = track.sets[0][1];
      const later = track.sets[1][1];
      const weak = track.sets[0][2];
      const cards = {};
      cards[key(0, a.word)] = review(now - 60000, 0);
      cards[key(1, b.word)] = review(now - 1000, 0);
      cards[key(2, locked.word)] = review(now - 60000, 0);
      cards[key(0, neu.word)] = fresh;
      cards[key(1, later.word)] = review(now + 5 * 86400000, 0);
      cards[key(0, weak.word)] = review(now + 5 * 86400000, 2);
      localStorage.setItem("vocabSpotlight_v1", JSON.stringify({
        points: 10, streak: 0, bestStreak: 1, unlockedLevel: 2,
        cards: cards, levelStars: {}, sortMode: "default", voiceOn: false,
        track: "zhongkao",
        trackUnlock: { zhongkao: 2 },
        trackStars: { zhongkao: {} },
        daily: {},
        profile: { name: "", cls: "" },
        updatedAt: "2020-01-01T00:00:00.000Z"
      }));
      return { word: a.word, meaning: a.meaning_zh, other: b.word, locked: locked.word, weak: weak.word };
    })()`);
    await reloadToGate("gate before due aggregation");
    const examOnly = await waitFor(async () => evalRetry(`(() => {
      const exam = document.getElementById("screen-gate");
      const logged = window.QuizMarioCloud && window.QuizMarioCloud.loggedIn && window.QuizMarioCloud.loggedIn();
      if (!exam || !exam.classList.contains("active") || !logged || !window.__QM) return null;
      window.__QM.applyCloudSave(window.__QM.getSave());
      const soft = document.getElementById("must-gate");
      const strip = document.getElementById("home-loop");
      return {
        exam: exam.classList.contains("active"),
        home: document.getElementById("screen-home").classList.contains("active"),
        softHidden: !soft || soft.hidden,
        stripHidden: !strip || strip.hidden,
        zk: (document.getElementById("btn-gate-zhongkao") || {}).textContent || "",
        gk: (document.getElementById("btn-gate-gaokao") || {}).textContent || ""
      };
    })()`), 15000, "exam gate without soft overlay");
    assert.strictEqual(examOnly.exam, true);
    assert.strictEqual(examOnly.home, false);
    assert.strictEqual(examOnly.softHidden, true, "cloud apply must not cover 中考/高考 with the soft gate");
    assert.strictEqual(examOnly.stripHidden, true, "the loop strip stays on the student home");
    assert.ok(examOnly.zk.indexOf("中考") !== -1 && examOnly.gk.indexOf("高考") !== -1);
    await evalRetry(`document.getElementById("btn-gate-zhongkao").click()`);
    const dueHome = await waitFor(async () => evalRetry(`(() => {
      const home = document.getElementById("screen-home");
      const badge = document.getElementById("must-badge");
      const gate = document.getElementById("must-gate");
      const hint = document.getElementById("continue-hint");
      const logged = window.QuizMarioCloud && window.QuizMarioCloud.loggedIn && window.QuizMarioCloud.loggedIn();
      if (!home || !home.classList.contains("active") || !logged) return null;
      if (!gate || gate.hidden || !badge || badge.hidden) return null;
      return {
        count: badge.textContent,
        copy: (document.getElementById("must-gate-copy") || {}).textContent || "",
        primacy: home.getAttribute("data-review-primacy"),
        mustSecondary: document.getElementById("btn-must-practice").classList.contains("secondary"),
        continueSecondary: document.getElementById("btn-continue").classList.contains("secondary"),
        play: document.getElementById("screen-play").classList.contains("active"),
        hint: hint && !hint.hidden ? hint.textContent : "",
        strip: (document.getElementById("home-loop-title") || {}).textContent || "",
        detail: (document.getElementById("home-loop-detail") || {}).textContent || "",
        stripHidden: !!(document.getElementById("home-loop") || {}).hidden,
        action: (document.getElementById("home-loop") || {}).getAttribute ? document.getElementById("home-loop").getAttribute("data-action") : ""
      };
    })()`), 15000, "soft gate");
    assert.strictEqual(dueHome.play, false, "the soft gate does not auto-open cards");
    assert.strictEqual(dueHome.count, "3", "due cards first, then the wrong-book card, with no double count");
    assert.strictEqual(dueHome.copy, "今天有 3 道到期/错词，先清掉？");
    assert.strictEqual(dueHome.primacy, "primary");
    assert.strictEqual(dueHome.mustSecondary, false);
    assert.strictEqual(dueHome.continueSecondary, true, "今日必练 is more prominent than 继续闯关");
    assert.ok(dueHome.hint.includes("今日必练"), dueHome.hint);
    assert.strictEqual(dueHome.stripHidden, false, "the loop strip is on the signed-in home");
    assert.strictEqual(dueHome.strip, "薄弱点 → 今日必练");
    assert.strictEqual(dueHome.detail, "今日必练 3 道");
    assert.strictEqual(dueHome.action, "must");

    await evalRetry(`document.getElementById("btn-must-later").click()`);
    const later = await evalRetry(`(() => {
      const gate = document.getElementById("must-gate");
      const home = document.getElementById("screen-home");
      return {
        gateHidden: !gate || gate.hidden,
        home: !!(home && home.classList.contains("active")),
        play: document.getElementById("screen-play").classList.contains("active"),
        primacy: home.getAttribute("data-review-primacy")
      };
    })()`);
    assert.strictEqual(later.gateHidden, true, "稍后 closes the gate");
    assert.strictEqual(later.home, true);
    assert.strictEqual(later.play, false, "稍后 does not enter the queue");
    assert.strictEqual(later.primacy, "primary", "稍后 leaves 今日必练 as the primary button");

    await reloadToGate("gate after 稍后");
    await evalRetry(`document.getElementById("btn-gate-zhongkao").click()`);
    const noSpam = await waitFor(async () => evalRetry(`(() => {
      const home = document.getElementById("screen-home");
      const gate = document.getElementById("must-gate");
      const badge = document.getElementById("must-badge");
      const logged = window.QuizMarioCloud && window.QuizMarioCloud.loggedIn && window.QuizMarioCloud.loggedIn();
      if (!home || !home.classList.contains("active") || !logged || !badge || badge.hidden) return null;
      if (!gate || !gate.hidden) return null;
      return badge.textContent;
    })()`), 15000, "home without a second gate");
    assert.strictEqual(noSpam, "3", "稍后 lasts the rest of the day");

    await evalRetry(`document.getElementById("btn-continue").click()`);
    const study = await waitFor(async () => evalRetry(`(() => {
      const play = document.getElementById("screen-play");
      const n = document.querySelectorAll("#choices .choice").length;
      const clock = document.getElementById("challenge-clock");
      if (!(play && play.classList.contains("active")) || n !== 4) return null;
      return {
        title: document.getElementById("play-level").textContent,
        label: (document.getElementById("prompt-label") || {}).textContent || "",
        choice: (document.querySelector("#choices .choice") || {}).textContent || "",
        clockHidden: !clock || clock.hidden
      };
    })()`), 10000, "continue stays meaning study");
    assert.notStrictEqual(study.title, "今日必练");
    assert.ok(study.label.indexOf("中文意思") !== -1, "继续闯关 is English → meaning: " + study.label);
    assert.ok(/[\u4e00-\u9fff]/.test(study.choice), "继续闯关 choices stay Chinese");
    assert.strictEqual(study.clockHidden, true, "继续闯关 still does not start the challenge clock");

    await evalRetry(`document.getElementById("btn-quit").click()`);
    await waitFor(async () => evalRetry(`(() => {
      const home = document.getElementById("screen-home");
      const gate = document.getElementById("must-gate");
      return home && home.classList.contains("active") && gate && gate.hidden ? true : null;
    })()`), 8000, "home after continue");
    await evalRetry(`document.getElementById("btn-must-practice").click()`);
    const duePlay = await waitFor(async () => evalRetry(`(() => {
      const play = document.getElementById("screen-play");
      const n = document.querySelectorAll("#choices .choice").length;
      const clock = document.getElementById("challenge-clock");
      if (!(play && play.classList.contains("active")) || n !== 4) return null;
      return {
        title: document.getElementById("play-level").textContent,
        label: (document.getElementById("prompt-label") || {}).textContent || "",
        prompt: document.getElementById("prompt-main").textContent.trim(),
        choice: (document.querySelector("#choices .choice") || {}).textContent || "",
        clockHidden: !clock || clock.hidden,
        again: !!document.getElementById("btn-rate-again"),
        unknown: (() => {
          const b = document.getElementById("btn-unknown");
          return !!(b && !b.hidden && b.textContent.indexOf("不会") !== -1);
        })()
      };
    })()`), 10000, "今日必练 queue");
    assert.strictEqual(duePlay.title, "今日必练");
    assert.ok(duePlay.label.indexOf("英文单词") !== -1, "今日必练 stays ZH → EN: " + duePlay.label);
    assert.strictEqual(duePlay.prompt, planted.meaning, "earliest due card is first");
    assert.ok(!/[\u4e00-\u9fff]/.test(duePlay.choice.replace(/^\\d+\\.\\s*/, "")), "今日必练 choices are English");
    assert.strictEqual(duePlay.clockHidden, true, "今日必练 is not a 12-minute set challenge");
    assert.strictEqual(duePlay.again, false);
    assert.strictEqual(duePlay.unknown, true, "不会 is available instead of forcing a guess");

    const missed = await evalRetry(`(() => {
      const word = ${JSON.stringify(planted && planted.word)};
      const buttons = Array.from(document.querySelectorAll("#choices .choice"));
      const bad = buttons.find((b) => b.textContent.replace(/^\\d+\\.\\s*/, "").trim().toLowerCase() !== String(word).toLowerCase());
      if (!bad) return { ok: false };
      bad.click();
      return { ok: true };
    })()`);
    assert.strictEqual(missed.ok, true, "a wrong choice was available");
    await waitFor(async () => evalRetry(`(() => {
      const fb = document.getElementById("feedback").textContent || "";
      const cont = document.getElementById("btn-feedback-continue");
      return fb.indexOf("再想想") !== -1 && cont && cont.textContent.indexOf("继续") !== -1 ? true : null;
    })()`), 5000, "wrong answer feedback");
    const heldPrompt = await evalRetry(`document.getElementById("prompt-main").textContent`);
    await sleep(2800);
    const still = await evalRetry(`(() => {
      const cont = document.getElementById("btn-feedback-continue");
      return {
        prompt: document.getElementById("prompt-main").textContent,
        continue: !!(cont && cont.textContent.indexOf("继续") !== -1)
      };
    })()`);
    assert.strictEqual(still.prompt, heldPrompt, "wrong-answer explanation stays until Continue");
    assert.strictEqual(still.continue, true, "Continue is still on screen after the old 2.6s timer");
    const booked = await evalRetry(`(() => {
      const save = window.__QM.getSave();
      const word = ${JSON.stringify(planted && planted.word)};
      const row = save.wrongBook && save.wrongBook["zhongkao::" + String(word).toLowerCase()];
      const card = save.cards["zhongkao|0::" + String(word).toLowerCase()];
      return {
        active: !!(row && row.active),
        wrong: card ? card.wrong : null
      };
    })()`);
    assert.strictEqual(booked.active, true, "a wrong answer enters 错词本");
    assert.ok(booked.wrong >= 1, "Again still increments wrong");

    const signals = await evalRetry(`(async () => {
      const LE = window.QuizMarioLearnerEvents;
      if (!LE || typeof LE.flush !== "function" || typeof LE.list !== "function") return null;
      await LE.flush();
      const word = ${JSON.stringify(planted && planted.word)}.toLowerCase();
      const events = LE.list();
      const posted = window.__QM_LEARNER_EVENTS || [];
      const due = events.filter((e) => e.event_type === "vocab.due_review");
      return {
        localWrong: events.filter((e) => e.event_type === "vocab.answer_wrong" && e.headword === word).length,
        localBook: events.filter((e) => e.event_type === "vocab.wrong_book_add" && e.headword === word).length,
        localCorrect: events.filter((e) => e.event_type === "vocab.answer_correct").length,
        localDue: due.length,
        dueAt: due.length > 0 && due.every((e) => e.payload && e.payload.due_at),
        sourceOk: events.length > 0 && events.every((e) => e.source === "quizmario"),
        learner: events[0] && events[0].learner_id,
        sameAlias: events.every((e) => e.user_id === e.learner_id),
        posted: posted.length,
        postedSource: posted.length > 0 && posted.every((e) => e.source === "quizmario"),
        postedLearner: posted[0] && posted[0].learner_id,
        fakeAls: /已同步到\\s*ALS/.test(document.body.innerText || "")
      };
    })()`);
    assert.ok(signals, "learner events api loaded");
    assert.ok(signals.localWrong >= 1, "wrong answer stored vocab.answer_wrong");
    assert.ok(signals.localBook >= 1, "wrong-book add stored vocab.wrong_book_add");
    assert.ok(signals.localDue >= 2, "due queue stored vocab.due_review");
    assert.strictEqual(signals.dueAt, true, "due signals include payload.due_at");
    assert.strictEqual(signals.sourceOk, true);
    assert.strictEqual(signals.learner, SESSION.user.id);
    assert.strictEqual(signals.sameAlias, true, "user_id aliases learner_id");
    assert.ok(signals.posted >= 1, "logged-in path posted learner_events");
    assert.strictEqual(signals.postedSource, true);
    assert.strictEqual(signals.postedLearner, SESSION.user.id);
    assert.strictEqual(signals.fakeAls, false, "the page must not claim an ALS sync");

    const exported = await evalRetry(`(() => {
      const body = window.QuizMarioLearnerEvents.toJsonl();
      document.getElementById("btn-export-learner-events").click();
      const lines = body.trim().split("\\n").filter(Boolean);
      let parsed = true;
      try { lines.forEach((line) => JSON.parse(line)); } catch (e) { parsed = false; }
      return {
        lines: lines.length,
        parsed: parsed,
        note: (document.getElementById("learner-events-note") || {}).textContent || "",
        hasDue: body.indexOf("vocab.due_review") !== -1,
        hasWrong: body.indexOf("vocab.answer_wrong") !== -1,
        hasBook: body.indexOf("vocab.wrong_book_add") !== -1
      };
    })()`);
    assert.ok(exported.lines >= 3, "JSONL export contains the due, wrong, and wrong-book signals");
    assert.strictEqual(exported.parsed, true, "each JSONL line parses");
    assert.ok(exported.hasDue && exported.hasWrong && exported.hasBook, JSON.stringify(exported));
    assert.ok(exported.note.includes("已下载 JSONL"), exported.note);
    assert.ok(!exported.note.includes("已同步到 ALS"), exported.note);

    await evalRetry(`document.getElementById("btn-quit").click()`);
    const wrongHome = await waitFor(async () => evalRetry(`(() => {
      const home = document.getElementById("screen-home");
      const badge = document.getElementById("must-badge");
      const gate = document.getElementById("must-gate");
      if (!home || !home.classList.contains("active") || !badge || badge.hidden) return null;
      if (!gate || !gate.hidden) return null;
      return {
        count: badge.textContent,
        primacy: home.getAttribute("data-review-primacy")
      };
    })()`), 8000, "home after a miss");
    assert.ok(Number(wrongHome.count) >= 3, "the miss stays in 今日必练 with the other due and wrong-book cards");
    assert.strictEqual(wrongHome.primacy, "secondary", "starting 今日必练 demotes it for the rest of the day");

    await evalRetry(`document.getElementById("btn-must-practice").click()`);
    const wrongPlay = await waitFor(async () => evalRetry(`(() => {
      const play = document.getElementById("screen-play");
      const n = document.querySelectorAll("#choices .choice").length;
      if (!(play && play.classList.contains("active")) || n !== 4) return null;
      return {
        title: document.getElementById("play-level").textContent,
        again: !!document.getElementById("btn-rate-again"),
        typed: !!document.getElementById("answer-input")
      };
    })()`), 10000, "今日必练 again");
    assert.strictEqual(wrongPlay.title, "今日必练");
    assert.strictEqual(wrongPlay.again, false);
    assert.strictEqual(wrongPlay.typed, false);

    await evalRetry(`document.getElementById("btn-quit").click()`);
    await evalRetry(`(() => {
      const track = (window.VOCAB_EXAM_TRACKS || []).find((t) => t.id === "zhongkao");
      if (!track || !track.sets[3]) throw new Error("中考 track has no frontier set");
      const word = track.sets[0][0];
      const now = Date.now();
      const cards = {};
      cards["zhongkao|0::" + String(word.word).toLowerCase()] = {
        ef: 2.5, interval: 3, reps: 4, lapses: 0, due: now - 1000,
        correct: 4, wrong: 0, mastery: 2, state: "review"
      };
      localStorage.setItem("vocabSpotlight_v1", JSON.stringify({
        points: 10, streak: 0, bestStreak: 1, unlockedLevel: 4,
        cards: cards, levelStars: {}, sortMode: "default", voiceOn: false,
        track: "zhongkao",
        trackUnlock: { zhongkao: 4 },
        trackStars: { zhongkao: {} },
        daily: {},
        profile: { name: "", cls: "" },
        updatedAt: "2020-01-01T00:00:00.000Z"
      }));
      return word.meaning_zh;
    })()`);
    await reloadToGate("gate before must clear");
    await evalRetry(`document.getElementById("btn-gate-zhongkao").click()`);
    const loopHome = await waitFor(async () => evalRetry(`(() => {
      const home = document.getElementById("screen-home");
      const strip = document.getElementById("home-loop");
      const logged = window.QuizMarioCloud && window.QuizMarioCloud.loggedIn && window.QuizMarioCloud.loggedIn();
      if (!home || !home.classList.contains("active") || !logged || !strip || strip.hidden) return null;
      if (strip.getAttribute("data-action") !== "must") return null;
      return {
        detail: (document.getElementById("home-loop-detail") || {}).textContent || ""
      };
    })()`), 15000, "strip into 今日必练");
    assert.strictEqual(loopHome.detail, "今日必练 1 道");
    await evalRetry(`(() => {
      const soft = document.getElementById("must-gate");
      if (soft && !soft.hidden) document.getElementById("btn-must-later").click();
      document.getElementById("home-loop").click();
      return true;
    })()`);
    await waitFor(async () => evalRetry(`(() => {
      const play = document.getElementById("screen-play");
      const n = document.querySelectorAll("#choices .choice").length;
      if (!(play && play.classList.contains("active")) || n !== 4) return null;
      if ((document.getElementById("play-level") || {}).textContent !== "今日必练") return null;
      return true;
    })()`), 10000, "strip opened 今日必练");
    const answeredMust = await evalRetry(`(() => {
      const prompt = document.getElementById("prompt-main").textContent.trim();
      const track = (window.VOCAB_EXAM_TRACKS || []).find((t) => t.id === "zhongkao");
      let card = null;
      if (track) {
        for (const set of track.sets) {
          const hit = set.find((w) => w.word === prompt || w.meaning_zh === prompt);
          if (hit) { card = hit; break; }
        }
      }
      const want = card ? (card.word === prompt ? card.meaning_zh : card.word) : "";
      const buttons = Array.from(document.querySelectorAll("#choices .choice"));
      const btn = buttons.find((b) => b.textContent.replace(/^\\d+\\.\\s*/, "").trim() === String(want));
      if (!btn) return { ok: false, prompt: prompt, want: want };
      btn.click();
      const good = document.getElementById("btn-rate-good");
      if (!good) return { ok: false, prompt: prompt, want: want, labels: ["no good button"] };
      good.click();
      return { ok: true };
    })()`);
    assert.strictEqual(answeredMust.ok, true, "the single 今日必练 card was rated Good");
    const mustClear = await waitFor(async () => evalRetry(`(() => {
      const clear = document.getElementById("screen-clear");
      const cont = document.getElementById("btn-clear-continue");
      const als = document.getElementById("btn-clear-als");
      const next = document.getElementById("btn-next-level");
      if (!clear || !clear.classList.contains("active") || !cont || cont.hidden) return null;
      return {
        title: (document.getElementById("clear-title") || {}).textContent || "",
        msg: (document.getElementById("clear-msg") || {}).textContent || "",
        primary: cont.textContent.trim(),
        als: als && !als.hidden ? als.textContent.trim() : "",
        alsHref: als ? als.getAttribute("href") : "",
        placeholder: als ? als.getAttribute("data-als-placeholder") : "",
        nextHidden: !next || next.hidden
      };
    })()`), 8000, "今日必练 clear next step");
    assert.ok(mustClear.msg.indexOf("练完了，然后继续闯关第 4 组。") !== -1, mustClear.msg);
    assert.strictEqual(mustClear.primary, "继续闯关第 4 组");
    assert.strictEqual(mustClear.als, "去 ALS 修语法");
    assert.strictEqual(mustClear.alsHref, "https://andywillbeback.github.io/#als-placeholder");
    assert.strictEqual(mustClear.placeholder, "true");
    assert.strictEqual(mustClear.nextHidden, true, "the vague Next set button stays hidden");

    await evalRetry(`document.getElementById("btn-clear-continue").click()`);
    const frontier = await waitFor(async () => evalRetry(`(() => {
      const play = document.getElementById("screen-play");
      const n = document.querySelectorAll("#choices .choice").length;
      if (!(play && play.classList.contains("active")) || n !== 4) return null;
      return {
        level: (document.getElementById("play-level") || {}).textContent || "",
        label: (document.getElementById("prompt-label") || {}).textContent || "",
        choice: (document.querySelector("#choices .choice") || {}).textContent || "",
        clockHidden: !!(document.getElementById("challenge-clock") || {}).hidden
      };
    })()`), 10000, "frontier set from the clear CTA");
    assert.ok(frontier.level.indexOf("第4组") !== -1, frontier.level);
    assert.ok(frontier.label.indexOf("中文意思") !== -1, "frontier set stays English → meaning: " + frontier.label);
    assert.ok(/[\u4e00-\u9fff]/.test(frontier.choice), "frontier choices stay Chinese");
    assert.strictEqual(frontier.clockHidden, true);

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

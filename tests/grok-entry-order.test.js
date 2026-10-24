"use strict";

// Node 22+ provides global WebSocket. Node 20 needs the ws package.
if (typeof WebSocket === "undefined") {
  global.WebSocket = require("ws");
}

/*
 * grok-track entry order.
 * Run: node tests/grok-entry-order.test.js
 *
 * Unsigned visitors must land on login/register. A quizmario-auth blob must
 * not paint 中考 / 高考; only getSession() with a live user reveals the gate,
 * and choosing a track then opens practice home without a login CTA.
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
  const index = read("grok/index.html");
  const login = read("grok/login.html");
  const guard = read("grok/entry-guard.js");
  const sync = read("grok/sync.js");
  const game = read("grok/game.js");
  const manifest = read("grok/manifest.webmanifest");
  const teacherHtml = read("grok/teacher.html");
  const teacherJs = read("grok/teacher.js");
  const auth = read("grok/auth-page.js");
  const head = index.slice(0, index.indexOf("</head>"));

  assert.ok(head.includes('location.replace("login.html")'), "unsigned index goes to login");
  assert.ok(!head.includes('classList.add("session-ok")'), "head script must not reveal the exam gate");
  assert.ok(head.includes("html:not(.session-ok) #screen-gate"), "exam gate stays hidden until a confirmed session");
  assert.ok(head.includes("display:none!important"), "unsigned gate cannot paint over the login redirect");
  assert.ok(index.includes('src="entry-guard.js"'), "session check loads before the word lists");
  assert.ok(index.indexOf('src="entry-guard.js"') < index.indexOf('src="words.js"'));
  assert.ok(index.includes('id="screen-gate"') && index.includes('id="btn-gate-zhongkao"') && index.includes('id="btn-gate-gaokao"'));
  assert.ok(/id="login-cta"[^>]*hidden/.test(index), "home login CTA is not the post-exam step");
  assert.ok(guard.includes("auth.getSession"), "gate waits for getSession");
  assert.ok(guard.includes("if (sessionUser(res)) showGate()"), "only a live session reveals the gate");
  assert.ok(guard.includes("goLogin()"), "a failed session check returns to login");
  assert.ok(!/__QM_EXPECT_SESSION\)\s*revealApp\(/.test(sync), "sync must not reveal the gate from a stored blob alone");
  assert.ok(sync.includes("if (user) revealApp()"), "sync reveals only after a user");
  assert.ok(sync.includes("sendToLogin"), "missing session still leaves for login");
  assert.ok(game.includes('!document.documentElement.classList.contains("session-ok")'), "exam pick requires a confirmed session");

  const edition = "聚光单词 · 1st edition";
  for (const [name, src] of [
    ["index", index],
    ["login", login],
    ["manifest", manifest],
    ["teacher", teacherHtml],
  ]) {
    assert.ok(src.includes(edition), name + " uses the 1st edition name");
    assert.ok(!src.includes("（grok）") && !src.includes("聚光单词 grok"), name + " still shows a grok product label");
  }
  assert.ok(manifest.includes('"short_name": "聚光单词 1st edition"'));
  assert.ok(!teacherJs.includes("（grok）"));
  assert.ok(!auth.includes("返回游戏"), "login copy must not send people back to the exam gate");
  assert.ok(login.includes('id="mode-register"') && login.includes('id="mode-login"'));

  const banned = ["学习报告码", "QMR1", "教师看板", "ALS 学习信号", 'href="teacher.html"'];
  for (const needle of banned) {
    assert.ok(!index.includes(needle), "student index still shows " + needle);
    assert.ok(!login.includes(needle), "login still shows " + needle);
  }
  for (const file of ["grok/index.html", "grok/login.html", "grok/game.js", "grok/sync.js", "grok/entry-guard.js", "grok/config.js", "grok/auth-page.js"]) {
    const src = read(file);
    assert.ok(!/service_role\s*[:=]\s*['"][^'"]+['"]/.test(src), file + " must not embed a service_role secret");
    assert.ok(!/sb_secret_/.test(src), file);
  }
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
    email: "smoke.entry.order@example.com",
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: {},
    created_at: "2026-01-01T00:00:00.000Z",
    email_confirmed_at: "2026-01-01T00:00:00.000Z",
  },
};

function earlyScript() {
  return `(function () {
    var phase = "";
    try { phase = sessionStorage.getItem("qm-phase") || ""; } catch (e) { phase = ""; }
    var session = ${JSON.stringify(SESSION)};
    try {
      if (phase === "signed") localStorage.setItem("quizmario-auth", JSON.stringify(session));
      else if (phase === "expired") {
        var stale = JSON.parse(JSON.stringify(session));
        stale.expires_at = 1;
        stale.expires_in = 0;
        localStorage.setItem("quizmario-auth", JSON.stringify(stale));
      } else localStorage.removeItem("quizmario-auth");
    } catch (e) {}
    function markGate() {
      var btn = document.getElementById("btn-gate-zhongkao");
      var gate = document.getElementById("screen-gate");
      if (!btn || !gate) return;
      var gs = getComputedStyle(gate);
      var bs = getComputedStyle(btn);
      var visible = gs.display !== "none" && gs.visibility !== "hidden"
        && bs.display !== "none" && bs.visibility !== "hidden"
        && btn.getClientRects().length > 0;
      if (visible) {
        try { sessionStorage.setItem("qm-gate-seen", "1"); } catch (e) {}
      }
    }
    function watch() {
      markGate();
      requestAnimationFrame(watch);
    }
    requestAnimationFrame(watch);
    if (window.__QM_SMOKE_FETCH) return;
    window.__QM_SMOKE_FETCH = [];
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
      var expired = false;
      try { expired = sessionStorage.getItem("qm-phase") === "expired"; } catch (e) {}
      if (expired) return reply(400, { error: "invalid_grant", error_description: "expired" });
      if (url.indexOf("/user_progress") !== -1) {
        if (method === "GET" || method === "HEAD") {
          return reply(200, []);
        }
        return reply(201, [{ user_id: session.user.id, updated_at: "2026-01-01T00:00:00.000Z" }]);
      }
      if (url.indexOf("/learner_events") !== -1) return reply(200, []);
      if (url.indexOf("/auth/v1/user") !== -1) return reply(200, session.user);
      if (url.indexOf("/token") !== -1 || url.indexOf("/signup") !== -1) return reply(200, session);
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

async function browserVersion(port) {
  const res = await fetch("http://127.0.0.1:" + port + "/json/version");
  if (!res.ok) throw new Error("DevTools version failed");
  return res.json();
}

async function main() {
  staticGuards();
  const server = await startServer();
  const origin = "http://127.0.0.1:" + server.address().port;
  const userDir = fs.mkdtempSync(path.join(os.tmpdir(), "qm-grok-entry-"));
  const launched = launchChrome(userDir);
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
    const created = await cdp.send("Target.createTarget", { url: "about:blank" });
    const attached = await cdp.send("Target.attachToTarget", { targetId: created.targetId, flatten: true });
    sessionId = attached.sessionId;
    await cdp.send("Page.enable", {}, sessionId);
    await cdp.send("Runtime.enable", {}, sessionId);
    await cdp.send("Page.addScriptToEvaluateOnNewDocument", { source: earlyScript() }, sessionId);

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

    async function openIndex() {
      await cdp.send("Page.navigate", { url: origin + "/grok/index.html" }, sessionId);
    }

    await openIndex();
    const login = await waitFor(async () => {
      const snap = await evalRetry(`(() => {
        const reg = document.getElementById("mode-register");
        const form = document.getElementById("auth-form");
        if (!reg || !form || location.href.indexOf("/grok/login.html") === -1) return null;
        const gate = document.getElementById("btn-gate-zhongkao");
        return {
          pressed: reg.getAttribute("aria-pressed"),
          submit: (document.getElementById("btn-submit") || {}).textContent || "",
          topbar: (document.querySelector(".topbar") || {}).textContent || "",
          title: document.title,
          gateSeen: sessionStorage.getItem("qm-gate-seen") || "",
          gateInDom: !!gate,
          grokLabel: /（grok）|聚光单词 grok/i.test(document.body.innerText || "")
        };
      })()`);
      return snap;
    }, 20000, "unsigned login page");

    assert.strictEqual(login.pressed, "true", "unsigned visit opens on 注册");
    assert.strictEqual(login.submit, "注册");
    assert.ok(login.topbar.includes("聚光单词 · 1st edition"), login.topbar);
    assert.ok(login.title.includes("聚光单词 · 1st edition"));
    assert.strictEqual(login.gateSeen, "", "unsigned visit painted 中考/高考");
    assert.strictEqual(login.gateInDom, false);
    assert.strictEqual(login.grokLabel, false, "login still shows a grok product label");

    await evalRetry(`sessionStorage.setItem("qm-phase", "expired"); sessionStorage.removeItem("qm-gate-seen");`);
    await openIndex();
    const expired = await waitFor(async () => {
      const snap = await evalRetry(`(() => {
        if (location.href.indexOf("/grok/login.html") === -1) return null;
        if (!document.getElementById("auth-form")) return null;
        return { gateSeen: sessionStorage.getItem("qm-gate-seen") || "" };
      })()`);
      return snap;
    }, 20000, "expired session returns to login");
    assert.strictEqual(expired.gateSeen, "", "an expired stored session painted 中考/高考");

    await evalRetry(`sessionStorage.setItem("qm-phase", "signed"); sessionStorage.removeItem("qm-gate-seen");`);
    await openIndex();
    const gate = await waitFor(async () => {
      const snap = await evalRetry(`(() => {
        const gate = document.getElementById("screen-gate");
        const zk = document.getElementById("btn-gate-zhongkao");
        const gk = document.getElementById("btn-gate-gaokao");
        if (!gate || !zk || !gk) return null;
        if (location.href.indexOf("/grok/login.html") !== -1) return null;
        if (!document.documentElement.classList.contains("session-ok")) return null;
        if (!gate.classList.contains("active")) return null;
        const gs = getComputedStyle(gate);
        const bs = getComputedStyle(zk);
        if (gs.display === "none" || bs.display === "none" || bs.visibility === "hidden") return null;
        return {
          zk: zk.textContent.trim(),
          gk: gk.textContent.trim(),
          mark: (document.querySelector(".gate-mark") || {}).textContent || "",
          homeActive: !!(document.getElementById("screen-home") || {}).classList && document.getElementById("screen-home").classList.contains("active"),
          grokLabel: /（grok）|聚光单词 grok/i.test(document.body.innerText || "")
        };
      })()`);
      return snap;
    }, 30000, "exam gate after a live session");

    assert.strictEqual(gate.zk, "中考");
    assert.strictEqual(gate.gk, "高考");
    assert.strictEqual(gate.homeActive, false, "a live session lands on the exam gate, not practice home");
    assert.ok(String(gate.mark).includes("聚光单词 · 1st edition"), gate.mark);
    assert.strictEqual(gate.grokLabel, false, "the gate still shows a grok product label");

    await evalRetry(`document.getElementById("btn-gate-zhongkao").click()`);
    const home = await waitFor(async () => {
      const snap = await evalRetry(`(() => {
        const home = document.getElementById("screen-home");
        const gate = document.getElementById("screen-gate");
        if (!home || !home.classList.contains("active")) return null;
        if (gate && gate.classList.contains("active")) return null;
        const cta = document.getElementById("login-cta");
        const link = document.getElementById("login-link");
        const ctaVisible = !!(cta && !cta.hidden && getComputedStyle(cta).display !== "none");
        const linkVisible = !!(link && !link.hidden && getComputedStyle(link).display !== "none");
        return {
          ctaVisible,
          linkVisible,
          continue: !!document.getElementById("btn-continue"),
          banned: /学习报告码|QMR1|教师看板|ALS 学习信号/.test(document.body.innerText || "")
        };
      })()`);
      return snap;
    }, 20000, "practice home after 中考");

    assert.strictEqual(home.ctaVisible, false, "登录 / 注册 is not the step after choosing an exam");
    assert.strictEqual(home.linkVisible, false, "the account-bar login link is not the step after choosing an exam");
    assert.strictEqual(home.continue, true);
    assert.strictEqual(home.banned, false, "student home shows report, teacher, or ALS copy");
  } finally {
    try { if (launched.chrome) launched.chrome.kill("SIGKILL"); } catch (_) {}
    server.close();
    try { fs.rmSync(userDir, { recursive: true, force: true }); } catch (_) {}
  }
  console.log("grok entry order ok");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

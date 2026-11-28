"use strict";

// Node 22+ provides global WebSocket. Node 20 needs the ws package.
if (typeof WebSocket === "undefined") {
  global.WebSocket = require("ws");
}

/*
 * Public root doors redirect to the 1st edition. The redirect preserves
 * the query and hash and does not touch quizmario-auth. grok login,
 * SITE_URL, and SUPABASE_URL stay on the current 1st edition.
 *
 * Run: node tests/root-doors.test.js
 */

const assert = require("assert");
const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const door = require("../root-door");

const root = path.join(__dirname, "..");
const LIVE_URL = "https://cmainasvlfdynidabunp.supabase.co";
const GROK_SITE = "https://andywillbeback.github.io/QuizMario/grok/";
const ROOT_SITE = "https://andywillbeback.github.io/QuizMario/";

function read(name) {
  return fs.readFileSync(path.join(root, name), "utf8");
}

function assertPath(pathname, search, hash, expected) {
  assert.strictEqual(door.targetPath(pathname, search, hash), expected, pathname + (search || "") + (hash || ""));
}

assertPath("/QuizMario/", "", "", "/QuizMario/grok/");
assertPath("/QuizMario", "", "", "/QuizMario/grok/");
assertPath("/QuizMario/index.html", "", "", "/QuizMario/grok/");
assertPath("/QuizMario/login.html", "", "", "/QuizMario/grok/login.html");
assertPath("/QuizMario/teacher.html", "", "", "/QuizMario/grok/teacher.html");
assertPath("/", "", "", "/grok/");
assertPath("/index.html", "?from=root&book=1", "#section-2", "/grok/?from=root&book=1#section-2");
assertPath("/login.html", "?code=pkce-fixture", "#type=recovery", "/grok/login.html?code=pkce-fixture#type=recovery");
assertPath("/teacher.html", "?tab=1", "#row", "/grok/teacher.html?tab=1#row");
assertPath("/QuizMario/login.html", "?code=pkce-fixture", "#access_token=fixture", "/QuizMario/grok/login.html?code=pkce-fixture#access_token=fixture");
assertPath("/QuizMario/index.html", "?from=root", "#mark", "/QuizMario/grok/?from=root#mark");
assert.strictEqual(door.targetPath("/QuizMario/grok/", "", ""), null);
assert.strictEqual(door.targetPath("/QuizMario/grok", "", ""), null);
assert.strictEqual(door.targetPath("/QuizMario/grok/index.html", "?x=1", "#y"), null);
assert.strictEqual(door.targetPath("/QuizMario/grok/login.html", "?code=1", "#type=recovery"), null);
assert.strictEqual(door.targetPath("/QuizMario/grok/teacher.html", "", ""), null);
assert.strictEqual(door.targetPath("/grok/login.html", "", ""), null);
assert.strictEqual(door.targetPath("/QuizMario/word-universe.html", "", ""), null);
assert.strictEqual(door.targetPath("/QuizMario/grok/word-universe.html", "", ""), null);

const doorJs = read("root-door.js");
assert.ok(!/localStorage|sessionStorage|quizmario-auth|document\.cookie|supabase/i.test(doorJs), "root door script does not touch auth storage");

const redirects = {
  "index.html": "grok/",
  "login.html": "grok/login.html",
  "teacher.html": "grok/teacher.html",
};
const inline = read("index.html").match(/<script>\n\(function \(\) \{[\s\S]*?\}\)\(\);\n<\/script>/);
assert.ok(inline, "index.html carries the inline redirect");
for (const [file, dest] of Object.entries(redirects)) {
  const html = read(file);
  const legacy = read(path.join("legacy-root", file));
  assert.ok(html.includes('src="root-door.js"'), file + " loads the door script");
  assert.ok(html.includes(inline[0]), file + " uses the same inline redirect");
  assert.ok(html.includes('http-equiv="refresh" content="0; url=' + dest + '"'), file + " noscript fallback");
  assert.ok(html.includes('href="' + dest + '"'), file + " visible link");
  assert.ok(!/localStorage|sessionStorage|quizmario-auth|document\.cookie|supabase|127\.0\.0\.1:8501|去 ALS|screen-gate|src="game\.js"|src="auth-page\.js"/.test(html), file + " does not boot the old app or auth");
  assert.notStrictEqual(html, legacy, file + " is no longer the preserved legacy document");
  assert.ok(legacy.includes("<html"), "preserved " + file + " stays in legacy-root");
}
assert.ok(read("legacy-root/index.html").includes('href="http://127.0.0.1:8501/"'), "legacy home is kept, not republished as the door");
assert.ok(read("legacy-root/index.html").includes('location.replace("login.html")'), "legacy home still has its own login handoff");

for (const file of ["grok/index.html", "grok/login.html", "grok/teacher.html", "grok/word-universe.html", "grok/ielts-sources.html"]) {
  const html = read(file);
  assert.ok(!html.includes("root-door.js") && !html.includes("QuizMarioRootDoor"), file + " is not a root door");
  assert.ok(!html.includes("127.0.0.1:8501"), file + " does not grow a localhost ALS link");
}
assert.ok(read("grok/index.html").includes('location.replace("login.html" + blob)'), "grok home still forwards recovery tokens itself");
assert.ok(read("grok/index.html").includes("连续答对三次后移出今日任务，待观察；记录保留"), "grok graduation copy stays");
assert.ok(read("grok/login.html").includes('id="btn-forgot"'), "grok forgot-password control stays");
assert.ok(read("grok/auth-page.js").includes("quizmario-auth"), "grok auth storage key stays in the grok file");

function configField(file, name) {
  return read(file).match(new RegExp(name + ':\\s*"([^"]+)"'))[1];
}
assert.strictEqual(configField("grok/config.js", "SUPABASE_URL"), LIVE_URL);
assert.strictEqual(configField("config.js", "SUPABASE_URL"), LIVE_URL);
assert.strictEqual(configField("grok/config.js", "SITE_URL"), GROK_SITE);
assert.strictEqual(configField("config.js", "SITE_URL"), ROOT_SITE);

const readme = read("README.md");
assert.ok(readme.includes(GROK_SITE));
assert.ok(readme.includes("https://andywillbeback.github.io/QuizMario/grok/login.html"));
assert.ok(readme.includes("https://andywillbeback.github.io/QuizMario/grok/teacher.html"));
assert.ok(readme.includes("连续答对三次后移出今日任务，待观察"));
assert.ok(!readme.includes("连续答对两次"));
assert.ok(!readme.includes("127.0.0.1:8501"));
assert.ok(readme.includes(LIVE_URL));
assert.ok(readme.includes("旧的站点根地址"));

const eventsDoc = read("docs/learner-events.md");
assert.ok(eventsDoc.includes("official student entrance is the 1st edition"));
assert.ok(eventsDoc.includes("three consecutive corrects"));
assert.ok(eventsDoc.includes("待观察"));

const pages = read(".github/workflows/pages.yml");
assert.ok(pages.includes("--exclude legacy-root"), "preserved legacy HTML is not a published door");
assert.ok(pages.includes("needs: verify"), "Pages deploy still waits for the learning-contract job");
assert.ok(!pages.includes("legacy-root/index.html"), "deploy does not special-case the old home back in");

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
  const seen = [];
  const server = http.createServer((req, res) => {
    const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
    seen.push(req.url || "/");
    const rel = urlPath === "/" ? "index.html" : urlPath.replace(/^\/+/, "");
    const file = path.normalize(path.join(root, rel));
    if (!file.startsWith(root + path.sep) && file !== root) {
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
    server.listen(0, "127.0.0.1", () => resolve({ server, seen }));
  });
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
  const bin = process.env.CHROME_BIN || "google-chrome";
  const chrome = spawn(bin, [
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const { server } = await startServer();
  const origin = "http://127.0.0.1:" + server.address().port;
  const userDir = fs.mkdtempSync(path.join(os.tmpdir(), "qm-door-"));
  const launched = launchChrome(userDir);
  let cdp = null;
  let sessionId = null;
  const urls = [];
  const marks = [];
  try {
    const port = await launched.port;
    const version = await (await fetch("http://127.0.0.1:" + port + "/json/version")).json();
    const ws = new WebSocket(version.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      ws.addEventListener("open", resolve);
      ws.addEventListener("error", () => reject(new Error("DevTools websocket failed")));
    });
    cdp = new Cdp(ws);
    cdp.listeners.push((msg) => {
      if (msg.method === "Page.frameNavigated" && msg.params.frame && !msg.params.frame.parentId) {
        urls.push(msg.params.frame.url);
      } else if (msg.method === "Runtime.consoleAPICalled") {
        const text = (msg.params.args || []).map((arg) => arg.value || "").join(" ");
        if (text.indexOf("QM_DOOR ") === 0) marks.push(text.slice("QM_DOOR ".length));
      }
    });
    const created = await cdp.send("Target.createTarget", { url: "about:blank" });
    const attached = await cdp.send("Target.attachToTarget", { targetId: created.targetId, flatten: true });
    sessionId = attached.sessionId;
    await cdp.send("Page.enable", {}, sessionId);
    await cdp.send("Runtime.enable", {}, sessionId);
    await cdp.send("Page.addScriptToEvaluateOnNewDocument", {
      source: "console.info('QM_DOOR ' + location.pathname + location.search + location.hash);",
    }, sessionId);

    async function href() {
      const res = await cdp.send("Runtime.evaluate", {
        expression: "location.pathname + location.search + location.hash",
        returnByValue: true,
      }, sessionId);
      return res.result && res.result.value;
    }

    async function waitFor(predicate, label) {
      const start = Date.now();
      let last = null;
      while (Date.now() - start < 15000) {
        last = await href().catch(() => null);
        const hit = urls.find(predicate)
          || marks.map((mark) => origin + mark).find(predicate)
          || (last && predicate(origin + last) ? origin + last : null);
        if (hit) return hit;
        await sleep(50);
      }
      throw new Error("timed out waiting for " + label + " urls=" + JSON.stringify(urls) + " marks=" + JSON.stringify(marks) + " last=" + last);
    }

    await cdp.send("Page.navigate", { url: origin + "/index.html?from=root&book=1#section-2" }, sessionId);
    const home = await waitFor((url) => /\/grok\/(?:index\.html)?\?from=root&book=1#section-2(?:$|&)/.test(url), "home door");
    assert.ok(home.includes("/grok/"), home);

    await cdp.send("Page.navigate", { url: origin + "/login.html?from=root&book=1#section-2" }, sessionId);
    const login = await waitFor((url) => url.includes("/grok/login.html?from=root&book=1#section-2"), "login door");
    assert.ok(!login.includes("/grok/grok/"), login);
    await sleep(400);
    const loginStayed = await href();
    assert.ok(loginStayed.indexOf("/grok/login.html?from=root&book=1#section-2") === 0, loginStayed);

    await cdp.send("Page.navigate", { url: origin + "/teacher.html?from=root&book=1#section-2" }, sessionId);
    const teacher = await waitFor((url) => url.includes("/grok/teacher.html?from=root&book=1#section-2"), "teacher door");
    assert.ok(!teacher.includes("/grok/grok/"), teacher);

    await cdp.send("Page.navigate", { url: origin + "/grok/login.html?from=grok#stay" }, sessionId);
    const direct = await waitFor((url) => url.includes("/grok/login.html?from=grok#stay"), "direct grok login");
    await sleep(600);
    const directStayed = await href();
    assert.strictEqual(directStayed, "/grok/login.html?from=grok#stay", direct + " -> " + directStayed);
    assert.ok(!urls.some((url) => url.includes("/grok/grok/")), "grok login must not be sent through the root door");

    console.log("root-doors ok");
  } finally {
    if (launched.chrome && launched.chrome.exitCode === null && launched.chrome.signalCode === null) {
      await new Promise((resolve) => {
        launched.chrome.once("close", resolve);
        launched.chrome.kill("SIGKILL");
      });
    }
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(userDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

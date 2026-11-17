"use strict";

/*
 * Phone and desktop clicks for the teacher class HTML export.
 * Synthetic students only. Supabase is stubbed; no live account and no network
 * to supabase.co.
 *
 * Run: node tests/teacher-mobile-export.test.js
 */

const assert = require("assert");
const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const root = path.join(__dirname, "..");
const metrics = require(path.join(root, "grok/study-metrics.js"));
const OUT = path.join(os.tmpdir(), "quizmario-test-artifacts", "teacher-mobile-export.test.js");
fs.mkdirSync(OUT, { recursive: true });

const NOW = "2026-11-08T04:00:00.000Z";
const card = { state: "review", interval: 2, reps: 5, mastery: 3, correct: 5, wrong: 0, due: Date.parse(NOW) + 86400000 };
function progress(id, name, cls, track, word) {
  return {
    user_id: id,
    updated_at: NOW,
    source_card_count: 1,
    save: { track, profile: { name, cls }, cards: { [track + "|0::" + word]: card } },
  };
}
const PAYLOAD = {
  snapshot_version: "teacher-board-v2",
  generated_at: NOW,
  event_since: "2026-10-25T04:00:00.000Z",
  progress: [
    progress("11111111-1111-4111-8111-111111111111", "林小舟", "初三1班", "gaokao", "apple"),
    progress("22222222-2222-4222-8222-222222222222", "周晚星", "初三1班", "gaokao", "river"),
    progress("33333333-3333-4333-8333-333333333333", "陈北辰", "高一2班", "zhongkao", "stone"),
  ],
  events: [],
  directory: [
    { user_id: "11111111-1111-4111-8111-111111111111", masked_email: "l***@example.com" },
    { user_id: "22222222-2222-4222-8222-222222222222", masked_email: "z***@example.com" },
    { user_id: "33333333-3333-4333-8333-333333333333", masked_email: "c***@example.com" },
  ],
};
const SESSION = {
  access_token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJhYWFhYWFhYS1hYWFhLTRhYWEtOGFhYS1hYWFhYWFhYWFhYWEiLCJyb2xlIjoiYXV0aGVudGljYXRlZCIsImV4cCI6MTk5OTk5OTk5OX0.fixture",
  token_type: "bearer",
  expires_in: 3600,
  expires_at: 1999999999,
  refresh_token: "fixture-refresh",
  user: {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    aud: "authenticated",
    role: "authenticated",
    email: "teacher.fixture@example.com",
    app_metadata: { provider: "email", providers: ["email"], role: "teacher" },
    user_metadata: {},
  },
};

function expectedPack(key) {
  const board = metrics.fromSnapshot(PAYLOAD);
  return metrics.classPack(board, key, new Date());
}

function assertArchive(buf, key) {
  const pack = expectedPack(key);
  assert.ok(buf.equals(Buffer.from(pack.bytes)), key + " zip bytes differ from classPack");
  const text = buf.toString("utf8");
  assert.ok(text.includes("<html"), key + " archive is missing an HTML page");
  assert.ok(!text.includes("班级学情.csv"), key + " archive must not contain a spreadsheet");
  assert.ok(!text.includes("index.html"), key + " archive must not contain an index");
  if (key === "初三1班") {
    assert.ok(text.includes("林小舟"));
    assert.ok(text.includes("周晚星"));
    assert.ok(!text.includes("陈北辰"));
  } else {
    assert.ok(text.includes("陈北辰"));
    assert.ok(!text.includes("林小舟"));
  }
  return pack;
}

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

function contentType(file) {
  if (file.endsWith(".html")) return "text/html; charset=utf-8";
  if (file.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (file.endsWith(".svg")) return "image/svg+xml";
  return "application/octet-stream";
}

function startServer() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");
    const rel = decodeURIComponent(url.pathname);
    if (rel.includes("..")) { res.writeHead(400); res.end("bad"); return; }
    const file = path.join(root, rel.replace(/^\/+/, ""));
    if (!file.startsWith(root)) { res.writeHead(403); res.end("no"); return; }
    fs.readFile(file, (err, buf) => {
      if (err) { res.writeHead(404); res.end("missing"); return; }
      res.writeHead(200, { "content-type": contentType(file), "cache-control": "no-store" });
      res.end(buf);
    });
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}

function launchChrome(userDir) {
  const chrome = spawn(process.env.CHROME_BIN || "google-chrome", [
    "--headless=new", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage",
    "--disable-extensions", "--mute-audio", "--no-first-run", "--no-default-browser-check",
    "--remote-debugging-port=0", "--remote-allow-origins=*",
    `--user-data-dir=${userDir}`, "about:blank",
  ], { stdio: ["ignore", "pipe", "pipe"] });
  const port = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Chrome did not open a DevTools port")), 20000);
    let buf = "";
    const onData = (chunk) => {
      buf += chunk.toString();
      const match = buf.match(/DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)\//);
      if (match) { clearTimeout(timer); resolve(Number(match[1])); }
    };
    chrome.stderr.on("data", onData);
    chrome.stdout.on("data", onData);
    chrome.on("exit", (code) => { clearTimeout(timer); reject(new Error("Chrome exited (" + code + ")")); });
  });
  return { chrome, port };
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

function earlyScript() {
  return `(() => {
    try { localStorage.setItem("quizmario-auth", ${JSON.stringify(JSON.stringify(SESSION))}); } catch (e) {}
    const payload = ${JSON.stringify(PAYLOAD)};
    const orig = window.fetch.bind(window);
    window.fetch = function (input, init) {
      const url = typeof input === "string" ? input : (input && input.url) || "";
      if (url.indexOf("supabase.co") !== -1) {
        let body = {};
        if (url.indexOf("teacher_class_board") !== -1) body = payload;
        else if (url.indexOf("/auth/v1/user") !== -1) body = ${JSON.stringify(SESSION.user)};
        else if (url.indexOf("/auth/v1/") !== -1) body = ${JSON.stringify(SESSION)};
        return Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } }));
      }
      return orig(input, init);
    };
    const mode = location.hash || "";
    if (mode.indexOf("share-") >= 0) {
      window.__shared = null;
      navigator.canShare = function (data) {
        const file = data && data.files && data.files[0];
        if (!file) return false;
        if (mode.indexOf("share-none") >= 0) return false;
        if (mode.indexOf("share-octet") >= 0) return file.type === "application/octet-stream";
        return file.type === "application/zip";
      };
      navigator.share = function (data) {
        const file = data.files[0];
        return file.arrayBuffer().then(function (buf) {
          const bytes = new Uint8Array(buf);
          let bin = "";
          for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
          window.__shared = { name: file.name, type: file.type, b64: btoa(bin) };
          if (mode.indexOf("share-abort") >= 0) {
            const err = new Error("cancel");
            err.name = "AbortError";
            throw err;
          }
        });
      };
    }
  })();`;
}

function zipsIn(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((name) => name.endsWith(".zip")).map((name) => {
    const full = path.join(dir, name);
    return { name, full, buf: fs.readFileSync(full) };
  });
}

async function main() {
  const server = await startServer();
  const origin = "http://127.0.0.1:" + server.address().port;
  const userDir = fs.mkdtempSync(path.join(os.tmpdir(), "qm-mobile-export-"));
  const launched = launchChrome(userDir);
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
    const cdp = new Cdp(ws);
    const shots = [];

    async function run(spec) {
      const downloadDir = path.join(OUT, "downloads", spec.name);
      fs.rmSync(downloadDir, { recursive: true, force: true });
      fs.mkdirSync(downloadDir, { recursive: true });
      await cdp.send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: downloadDir, eventsEnabled: true });
      const created = await cdp.send("Target.createTarget", { url: "about:blank" });
      const attached = await cdp.send("Target.attachToTarget", { targetId: created.targetId, flatten: true });
      const sessionId = attached.sessionId;
      await cdp.send("Page.enable", {}, sessionId);
      await cdp.send("Runtime.enable", {}, sessionId);
      await cdp.send("Emulation.setDeviceMetricsOverride", {
        width: spec.width, height: spec.height, deviceScaleFactor: 1, mobile: !!spec.mobile,
      }, sessionId);
      if (spec.touch) {
        await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 }, sessionId);
      }
      if (spec.userAgent) {
        await cdp.send("Emulation.setUserAgentOverride", { userAgent: spec.userAgent, platform: spec.platform || "" }, sessionId);
      }
      await cdp.send("Page.addScriptToEvaluateOnNewDocument", { source: earlyScript() }, sessionId);
      async function evaluate(expression) {
        const res = await cdp.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }, sessionId);
        if (res.exceptionDetails) {
          const desc = res.exceptionDetails.exception && res.exceptionDetails.exception.description;
          throw new Error(res.exceptionDetails.text + (desc ? " " + desc : ""));
        }
        return res.result ? res.result.value : undefined;
      }
      async function waitBoard() {
        const start = Date.now();
        let last = null;
        while (Date.now() - start < 25000) {
          try {
            last = await evaluate(`(() => {
              const board = document.getElementById("board");
              const rows = document.querySelectorAll("#student-body tr").length;
              return { hidden: !board || board.hidden, rows, status: (document.getElementById("cloud-status") || {}).textContent || "" };
            })()`);
            if (last && !last.hidden && last.rows > 0) return last;
          } catch (err) { last = { error: String(err.message || err) }; }
          await sleep(150);
        }
        throw new Error(spec.name + " board not ready " + JSON.stringify(last));
      }
      async function click(finder, label) {
        const point = await evaluate(`(() => {
          ${finder}
          if (!el) return null;
          el.scrollIntoView({ block: "center", inline: "nearest" });
          const r = el.getBoundingClientRect();
          const x = Math.min(innerWidth - 4, Math.max(4, r.left + Math.min(r.width / 2, 28)));
          const y = Math.min(innerHeight - 4, Math.max(4, r.top + r.height / 2));
          const top = document.elementFromPoint(x, y);
          return { x, y, top: top && (top.id || top.textContent || "").trim().slice(0, 40), w: r.width, h: r.height };
        })()`);
        assert.ok(point, spec.name + " missing " + label);
        await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x: point.x, y: point.y, button: "left", clickCount: 1 }, sessionId);
        await cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: point.x, y: point.y, button: "left", clickCount: 1 }, sessionId);
        return point;
      }
      async function shot(name) {
        const png = await cdp.send("Page.captureScreenshot", { format: "png" }, sessionId);
        const file = path.join(OUT, spec.name + "-" + name + ".png");
        fs.writeFileSync(file, Buffer.from(png.data, "base64"));
        shots.push(file);
        return file;
      }
      async function state() {
        return evaluate(`(() => {
          const roster = document.getElementById("roster");
          const button = document.getElementById("btn-export-student-class");
          const rs = roster ? getComputedStyle(roster) : null;
          const bs = button ? getComputedStyle(button) : null;
          const br = button ? button.getBoundingClientRect() : null;
          return {
            status: (document.getElementById("cloud-status") || {}).textContent || "",
            roster: rs ? rs.display : "",
            studentOpen: document.body.classList.contains("student-open"),
            exportText: button ? button.textContent : "",
            exportDisplay: bs ? bs.display : "",
            exportInView: !!(br && br.width > 0 && br.bottom > 0 && br.top < innerHeight),
            shared: window.__shared ? { name: window.__shared.name, type: window.__shared.type, b64: window.__shared.b64 } : null,
            touch: navigator.maxTouchPoints,
            ua: navigator.userAgent,
          };
        })()`);
      }
      await cdp.send("Page.navigate", { url: origin + "/grok/teacher.html" + spec.hash }, sessionId);
      await waitBoard();
      const result = { clicks: [] };
      for (const step of spec.steps) {
        if (step.shot) await shot(step.shot);
        if (step.finder) result.clicks.push(await click(step.finder, step.id));
        await sleep(step.wait || 700);
        result.after = await state();
        if (step.shotAfter) await shot(step.shotAfter);
      }
      result.files = zipsIn(downloadDir);
      try { await cdp.send("Target.closeTarget", { targetId: created.targetId }); } catch (_) {}
      return result;
    }

    const row = (name) => `const el = [...document.querySelectorAll("#student-body tr[data-id]")].find((tr) => (tr.innerText || "").indexOf(${JSON.stringify(name)}) >= 0);`;
    const byId = (id) => `const el = document.getElementById(${JSON.stringify(id)});`;
    const classBtn = (key) => `const el = document.querySelector(${JSON.stringify('[data-export-class="' + key + '"]')});`;
    const androidUA = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.6778.200 Mobile Safari/537.36";
    const iphoneUA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1";
    const ipadUA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";

    const desktop = await run({
      name: "desktop",
      width: 1280,
      height: 900,
      hash: "#multi",
      steps: [
        { id: "one-click", finder: byId("btn-export-class"), wait: 900 },
      ],
    });
    assert.strictEqual(desktop.files.length, 0, "desktop one-click with several classes does not download");
    assert.ok(desktop.after.status.includes("一次只打包一个班级"), desktop.after.status);

    const desktopStudent = await run({
      name: "desktop-student",
      width: 1280,
      height: 900,
      hash: "#multi",
      steps: [
        { id: "open", finder: row("林小舟"), wait: 500 },
        { id: "detail-export", finder: byId("btn-export-student-class"), wait: 1200, shotAfter: "detail-export" },
      ],
    });
    assert.strictEqual(desktopStudent.after.roster, "block", "desktop keeps the roster while a student is open");
    assert.strictEqual(desktopStudent.files.length, 1, "desktop student action downloads one zip");
    assert.ok(desktopStudent.files[0].name.startsWith("聚光单词-学情-初三1班-"));
    assert.ok(desktopStudent.files[0].name.endsWith(".zip"));
    assertArchive(desktopStudent.files[0].buf, "初三1班");
    assert.ok(desktopStudent.after.status.includes("已下载「初三1班」"));

    const desktopOther = await run({
      name: "desktop-per-class",
      width: 1280,
      height: 900,
      hash: "#multi",
      steps: [{ id: "per-class", finder: classBtn("高一2班"), wait: 1200 }],
    });
    assert.strictEqual(desktopOther.files.length, 1);
    assert.ok(desktopOther.files[0].name.includes("高一2班"));
    assertArchive(desktopOther.files[0].buf, "高一2班");

    const phone = await run({
      name: "phone-detail",
      width: 390,
      height: 844,
      mobile: true,
      hash: "#multi",
      steps: [
        { id: "open", finder: row("林小舟"), wait: 600, shotAfter: "student-open" },
        { id: "detail-export", finder: byId("btn-export-student-class"), wait: 1200, shotAfter: "saved" },
      ],
    });
    assert.strictEqual(phone.after.roster, "none", "phone hides the roster after opening a student");
    assert.strictEqual(phone.after.studentOpen, true);
    assert.strictEqual(phone.after.exportText, "下载该班学情");
    assert.strictEqual(phone.after.exportDisplay, "block");
    assert.strictEqual(phone.after.exportInView, true, "the class download stays on the student page");
    assert.strictEqual(phone.files.length, 1);
    assertArchive(phone.files[0].buf, "初三1班");

    const phoneOneClick = await run({
      name: "phone-one-click",
      width: 390,
      height: 844,
      mobile: true,
      hash: "#multi",
      steps: [
        { id: "open", finder: row("陈北辰"), wait: 500 },
        { id: "one-click", finder: byId("btn-export-class"), wait: 1200 },
      ],
    });
    assert.strictEqual(phoneOneClick.after.roster, "none");
    assert.strictEqual(phoneOneClick.files.length, 1, "one-click uses the open student's class when the picker is hidden");
    assertArchive(phoneOneClick.files[0].buf, "高一2班");
    assert.ok(!phoneOneClick.after.status.includes("请先在名单上方选定班级"), phoneOneClick.after.status);

    async function sharedBytes(runResult) {
      assert.ok(runResult.after.shared, "share was not called");
      const buf = Buffer.from(runResult.after.shared.b64, "base64");
      return { buf, shared: runResult.after.shared, files: runResult.files, status: runResult.after.status, touch: runResult.after.touch };
    }

    const shareZip = await sharedBytes(await run({
      name: "android-share-zip",
      width: 390,
      height: 844,
      mobile: true,
      touch: true,
      userAgent: androidUA,
      platform: "Linux armv8l",
      hash: "#share-zip",
      steps: [
        { id: "open", finder: row("林小舟"), wait: 400 },
        { id: "detail-export", finder: byId("btn-export-student-class"), wait: 800 },
      ],
    }));
    assert.ok(shareZip.touch > 1, "touch points " + shareZip.touch);
    assert.strictEqual(shareZip.files.length, 0, "a shareable zip is not also forced through the download anchor");
    assert.strictEqual(shareZip.shared.type, "application/zip");
    assert.ok(shareZip.shared.name.startsWith("聚光单词-学情-初三1班-"));
    assertArchive(shareZip.buf, "初三1班");
    assert.ok(shareZip.status.includes("已下载「初三1班」") || shareZip.status.includes("正在打开系统分享"));

    const shareOctet = await sharedBytes(await run({
      name: "iphone-share-octet",
      width: 390,
      height: 844,
      mobile: true,
      touch: true,
      userAgent: iphoneUA,
      platform: "iPhone",
      hash: "#share-octet",
      steps: [
        { id: "open", finder: row("林小舟"), wait: 400 },
        { id: "detail-export", finder: byId("btn-export-student-class"), wait: 800 },
      ],
    }));
    assert.strictEqual(shareOctet.files.length, 0);
    assert.strictEqual(shareOctet.shared.type, "application/octet-stream");
    assert.ok(shareOctet.shared.name.endsWith(".zip"));
    assertArchive(shareOctet.buf, "初三1班");

    const shareNone = await run({
      name: "android-share-unsupported",
      width: 390,
      height: 844,
      mobile: true,
      touch: true,
      userAgent: androidUA,
      platform: "Linux armv8l",
      hash: "#share-none",
      steps: [
        { id: "open", finder: row("林小舟"), wait: 400 },
        { id: "detail-export", finder: byId("btn-export-student-class"), wait: 1200 },
      ],
    });
    assert.strictEqual(shareNone.after.shared, null);
    assert.strictEqual(shareNone.files.length, 1, "unsupported share falls back to the browser download");
    assertArchive(shareNone.files[0].buf, "初三1班");
    assert.ok(shareNone.after.status.includes("已下载「初三1班」"));

    const shareAbort = await run({
      name: "android-share-cancel",
      width: 390,
      height: 844,
      mobile: true,
      touch: true,
      userAgent: androidUA,
      platform: "Linux armv8l",
      hash: "#share-abort",
      steps: [
        { id: "open", finder: row("林小舟"), wait: 400 },
        { id: "detail-export", finder: byId("btn-export-student-class"), wait: 800 },
      ],
    });
    assert.strictEqual(shareAbort.files.length, 0, "cancelling the share sheet does not also download");
    assert.ok(shareAbort.after.status.includes("已取消保存"), shareAbort.after.status);

    const ipad = await sharedBytes(await run({
      name: "ipad-share-zip",
      width: 820,
      height: 1180,
      mobile: true,
      touch: true,
      userAgent: ipadUA,
      platform: "MacIntel",
      hash: "#share-zip",
      steps: [
        { id: "open", finder: row("林小舟"), wait: 400 },
        { id: "detail-export", finder: byId("btn-export-student-class"), wait: 800 },
      ],
    }));
    assert.strictEqual(ipad.files.length, 0);
    assert.strictEqual(ipad.shared.type, "application/zip");
    assertArchive(ipad.buf, "初三1班");

    console.log("teacher-mobile-export ok");
    console.log(shots.join("\n"));
  } finally {
    if (chrome) chrome.kill("SIGKILL");
    server.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

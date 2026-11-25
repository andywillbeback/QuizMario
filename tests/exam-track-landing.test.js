"use strict";

/*
 * Saved exam courses return to that course's home.
 * Run: node tests/exam-track-landing.test.js
 *
 * grok/game.js used to finish every boot on the 中考/高考/雅思 chooser, including
 * a reload and sync.suspend()'s location.replace("index.html"). Close, 退出,
 * Escape, and the notebook close buttons already stay in the course. This
 * test locks the boot landing: a confirmed session with zhongkao, gaokao, or
 * ielts opens that home; no exam track still opens the chooser; 更换考级 is
 * the way back.
 */

if (typeof WebSocket === "undefined") {
  global.WebSocket = require("ws");
}

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { startServer, launchChrome, Cdp, earlyScript, SESSION } = require("./speech-browser.test");

const root = path.join(__dirname, "..");

function read(name) {
  return fs.readFileSync(path.join(root, name), "utf8");
}

function staticGuards() {
  const game = read("grok/game.js");
  const notebook = read("grok/word-notebook.js");
  const questions = read("grok/question-notebook.js");
  const config = read("grok/config.js");

  assert.ok(game.includes("function landSavedExamTrack"), "boot can resume a saved exam");
  assert.ok(game.includes('addEventListener("quizmario:session-ready", landSavedExamTrack)'));
  assert.ok(game.includes('id === "zhongkao"') && game.includes('id === "gaokao"') && game.includes('id === "ielts"'));
  assert.ok(/if \(\$\("btn-back-gate"\)\) \$\("btn-back-gate"\)\.addEventListener\("click", \(\) => showScreen\("gate"\)\)/.test(game),
    "更换考级 still opens the chooser");
  assert.ok(/\$\("btn-quit"\)\.addEventListener\("click", \(\) => \{[\s\S]*?showScreen\("home"\)/.test(game),
    "practice 退出 still returns home");
  assert.ok(notebook.includes("notebook-close") && !notebook.includes('showScreen("gate")'),
    "错词本 close does not open the exam chooser");
  assert.ok(questions.includes("question-notebook-close") && !questions.includes('showScreen("gate")'),
    "错题本 close does not open the exam chooser");
  const peekEscape = game.slice(game.indexOf("function closeRelatedPeekOnKey"), game.indexOf("function setRelatedPeekText"));
  assert.ok(peekEscape.includes('e.key === "Escape"') && !peekEscape.includes('showScreen("gate")'),
    "Escape on a related-word peek does not open the exam chooser");
  assert.ok(config.includes("https://andywillbeback.github.io/QuizMario/grok/"), "SITE_URL stays on the Pages path");
  assert.ok(config.includes("https://cmainasvlfdynidabunp.supabase.co"), "SUPABASE_URL stays on the project host");
  assert.ok(!config.includes("workers.dev"), "no workers.dev fallback");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function saveFor(track) {
  return {
    points: 0,
    streak: 0,
    bestStreak: 0,
    unlockedLevel: 2,
    cards: {},
    levelStars: {},
    sortMode: "default",
    voiceOn: false,
    track: track,
    trackUnlock: { [track]: 2 },
    trackStars: {},
    daily: {},
    profile: { name: "测落地", cls: "虚构班" },
    updatedAt: "2026-11-20T00:00:00.000Z",
  };
}

const SAVE_KEY = "vocabSpotlight_v1:account:" + SESSION.user.id;

async function main() {
  staticGuards();
  const server = await startServer();
  const origin = "http://127.0.0.1:" + server.address().port;
  const userDir = fs.mkdtempSync(path.join(os.tmpdir(), "qm-exam-landing-"));
  const launched = launchChrome(userDir);
  let ws = null;
  try {
    const port = await launched.port;
    const version = await (await fetch("http://127.0.0.1:" + port + "/json/version")).json();
    ws = new WebSocket(version.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      ws.addEventListener("open", resolve);
      ws.addEventListener("error", () => reject(new Error("DevTools websocket failed")));
    });
    const cdp = new Cdp(ws);
    const created = await cdp.send("Target.createTarget", { url: "about:blank" });
    const attached = await cdp.send("Target.attachToTarget", { targetId: created.targetId, flatten: true });
    const sessionId = attached.sessionId;
    const send = (method, params) => cdp.send(method, params, sessionId);
    async function evaluate(expression) {
      const res = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
      if (res.exceptionDetails) {
        const desc = res.exceptionDetails.exception && res.exceptionDetails.exception.description;
        throw new Error(res.exceptionDetails.text + (desc ? " " + desc : ""));
      }
      return res.result ? res.result.value : undefined;
    }
    async function wait(expression, label, ms = 20000) {
      const start = Date.now();
      let last = null;
      while (Date.now() - start < ms) {
        try { last = await evaluate(expression); } catch (err) {
          if (!/context|destroyed|navigated/i.test(String(err && err.message))) throw err;
          last = null;
        }
        if (last) return last;
        await sleep(80);
      }
      throw new Error("timed out waiting for " + label + " last=" + JSON.stringify(last));
    }
    const snapExpr = `(() => {
      const gate = document.getElementById("screen-gate");
      const home = document.getElementById("screen-home");
      const play = document.getElementById("screen-play");
      if (!gate || !home || !window.__QM) return null;
      if (!document.documentElement.classList.contains("session-ok")) return null;
      return {
        gate: gate.classList.contains("active"),
        home: home.classList.contains("active"),
        play: !!(play && play.classList.contains("active")),
        track: window.__QM.track,
        notebook: !!(document.getElementById("word-notebook") || {}).open,
        questions: !!(document.getElementById("question-notebook") || {}).open,
      };
    })()`;

    await send("Page.enable");
    await send("Runtime.enable");
    await send("Page.addScriptToEvaluateOnNewDocument", { source: earlyScript(null) });
    // The shared auth stub has no progress row. A reload test can publish the
    // same save the account cache holds, so an empty cloud snapshot does not
    // wipe the name that lets 更换考级 choose a course again.
    await send("Page.addScriptToEvaluateOnNewDocument", { source: `(function () {
      var prior = window.fetch;
      window.fetch = function (input, init) {
        var url = typeof input === "string" ? input : (input && input.url) || "";
        var method = ((init && init.method) || (input && input.method) || "GET").toUpperCase();
        if (/user_progress/.test(url) && (method === "GET" || method === "HEAD")) {
          var raw = "";
          try { raw = sessionStorage.getItem("qm-cloud-save") || ""; } catch (e) { raw = ""; }
          if (raw) {
            return Promise.resolve(new Response(JSON.stringify([{ save: JSON.parse(raw), updated_at: "2026-11-20T00:00:00.000Z" }]), {
              status: 200, headers: { "content-type": "application/json" }
            }));
          }
        }
        return prior.apply(this, arguments);
      };
    })();` });
    await send("Page.navigate", { url: origin + "/grok/index.html" });

    const first = await wait(snapExpr + " && (() => { const s = " + snapExpr + "; return s && s.gate && !s.home ? s : null; })()", "chooser when no exam track is saved", 30000);
    assert.strictEqual(first.gate, true);
    assert.strictEqual(first.home, false);
    assert.ok(first.track !== "zhongkao" && first.track !== "gaokao" && first.track !== "ielts", first.track);

    async function reloadTo(track) {
      const payload = JSON.stringify(saveFor(track));
      await evaluate(`localStorage.setItem(${JSON.stringify(SAVE_KEY)}, ${JSON.stringify(payload)}); sessionStorage.setItem("qm-cloud-save", ${JSON.stringify(payload)})`);
      await evaluate(`document.documentElement.setAttribute("data-qm-boot", "stale")`);
      await send("Page.reload", { ignoreCache: true });
      return wait(`(() => {
        if (!document.documentElement || document.documentElement.getAttribute("data-qm-boot") === "stale") return null;
        const s = ${snapExpr};
        if (!s || !s.home || s.gate || s.track !== ${JSON.stringify(track)}) return null;
        return s;
      })()`, track + " home after reload", 30000);
    }

    for (const track of ["zhongkao", "gaokao", "ielts"]) {
      const home = await reloadTo(track);
      assert.strictEqual(home.home, true, track);
      assert.strictEqual(home.gate, false, track);
      assert.strictEqual(home.track, track);
    }

    await evaluate(`document.getElementById("btn-back-gate").click()`);
    const chooser = await wait(`(() => { const s = ${snapExpr}; return s && s.gate && !s.home ? s : null; })()`, "更换考级");
    assert.strictEqual(chooser.gate, true);
    assert.strictEqual(chooser.track, "ielts", "更换考级 does not drop the saved course");
    await evaluate(`window.dispatchEvent(new CustomEvent("quizmario:session-ready"))`);
    await sleep(150);
    const stayed = await evaluate(snapExpr);
    assert.strictEqual(stayed.gate, true, "a later session reveal does not leave 更换考级");
    assert.strictEqual(stayed.home, false);

    await evaluate(`document.getElementById("btn-gate-ielts").click()`);
    await wait(`(() => { const s = ${snapExpr}; return s && s.home && !s.gate && s.track === "ielts" ? s : null; })()`, "back to 雅思 home");

    await evaluate(`document.getElementById("btn-notebook").click()`);
    await wait(`document.getElementById("word-notebook") && document.getElementById("word-notebook").open`, "错词本");
    await evaluate(`document.getElementById("notebook-close").click()`);
    const afterNotebook = await wait(`(() => {
      const dialog = document.getElementById("word-notebook");
      const s = ${snapExpr};
      if (!dialog || dialog.open || !s || !s.home || s.gate) return null;
      return s;
    })()`, "错词本 close stays home");
    assert.strictEqual(afterNotebook.track, "ielts");

    await evaluate(`document.getElementById("btn-question-notebook").click()`);
    await wait(`document.getElementById("question-notebook") && document.getElementById("question-notebook").open`, "错题本");
    await evaluate(`document.getElementById("question-notebook-close").click()`);
    const afterQuestions = await wait(`(() => {
      const dialog = document.getElementById("question-notebook");
      const s = ${snapExpr};
      if (!dialog || dialog.open || !s || !s.home || s.gate) return null;
      return s;
    })()`, "错题本 close stays home");
    assert.strictEqual(afterQuestions.track, "ielts");

    await evaluate(`document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))`);
    const afterEscape = await evaluate(snapExpr);
    assert.strictEqual(afterEscape.home, true, "Escape on the home does not open the chooser");
    assert.strictEqual(afterEscape.gate, false);
    assert.strictEqual(afterEscape.track, "ielts");

    await evaluate(`(() => {
      const soft = document.getElementById("must-gate");
      if (soft && !soft.hidden) document.getElementById("btn-must-later").click();
      document.getElementById("btn-continue").click();
      return true;
    })()`);
    await wait(`(() => {
      const play = document.getElementById("screen-play");
      const n = document.querySelectorAll("#choices .choice").length;
      if (!(play && play.classList.contains("active")) || n < 1) return null;
      return true;
    })()`, "practice card", 20000);
    await evaluate(`document.getElementById("btn-quit").click()`);
    const afterQuit = await wait(`(() => { const s = ${snapExpr}; return s && s.home && !s.gate && !s.play ? s : null; })()`, "退出 returns home");
    assert.strictEqual(afterQuit.track, "ielts");

    await evaluate(`document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))`);
    await evaluate(`location.replace("index.html")`);
    const remounted = await wait(`(() => {
      const s = ${snapExpr};
      if (!s || !s.home || s.gate || s.track !== "ielts") return null;
      return s;
    })()`, "remount returns to 雅思 home", 30000);
    assert.strictEqual(remounted.home, true);
    assert.strictEqual(remounted.gate, false);

    const core = saveFor("gaokao");
    core.track = "core";
    const corePayload = JSON.stringify(core);
    await evaluate(`localStorage.setItem(${JSON.stringify(SAVE_KEY)}, ${JSON.stringify(corePayload)}); sessionStorage.setItem("qm-cloud-save", ${JSON.stringify(corePayload)})`);
    await evaluate(`document.documentElement.setAttribute("data-qm-boot", "stale")`);
    await send("Page.reload", { ignoreCache: true });
    const noExam = await wait(`(() => {
      if (!document.documentElement || document.documentElement.getAttribute("data-qm-boot") === "stale") return null;
      const s = ${snapExpr};
      if (!s || !s.gate || s.home) return null;
      return s;
    })()`, "core track still uses the chooser", 30000);
    assert.strictEqual(noExam.gate, true);
    assert.ok(noExam.track !== "zhongkao" && noExam.track !== "gaokao" && noExam.track !== "ielts", noExam.track);
  } finally {
    try { if (ws) ws.close(); } catch (_) {}
    try { if (launched.chrome) launched.chrome.kill("SIGKILL"); } catch (_) {}
    server.close();
    try { fs.rmSync(userDir, { recursive: true, force: true }); } catch (_) {}
  }
  console.log("exam-track-landing ok");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

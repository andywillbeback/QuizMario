"use strict";

/*
 * Login banner: missing Supabase SDK / failed createClient must not be
 * described as an empty config.js. The config sentence stays only when
 * QUIZMARIO_CONFIG URL/key fail isCloudConfigured.
 *
 * Run: node tests/auth-banner.test.js
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");

function read(name) {
  return fs.readFileSync(path.join(root, name), "utf8");
}

const CONFIG_GROK = "还不能登录：请在 config.js 填入 SUPABASE_URL 和 SUPABASE_ANON_KEY（见 README）。未登录不能选择中考或高考。";
const CONFIG_ROOT = "还不能登录：请在 config.js 填入 SUPABASE_URL 和 SUPABASE_ANON_KEY（见 README）。现在可以返回游戏，进度仍保存在本机。";
const SDK_HELP = "还不能登录：页面没有加载到 Supabase 登录组件。请刷新后再试。这不是 config.js 未填写。";
const CLIENT_HELP = "还不能登录：登录客户端没有创建成功。请刷新后再试。这不是 config.js 未填写。";
const LIVE_KEY = "sb_publishable_wXq1t1Ynsj9o1qGpU5T3IQ_7M5EC1ZK";
const LIVE_URL = "https://cmainasvlfdynidabunp.supabase.co";
const GROK_PROXY_URL = "https://quizmario-supabase-proxy.juguang-qm.workers.dev";

function staticGuards() {
  for (const file of ["login.html", "index.html", "grok/login.html", "grok/index.html"]) {
    const html = read(file);
    assert.ok(html.includes('src="vendor/supabase.umd.js"'), file + " loads the vendored SDK");
    assert.ok(!html.includes("cdn.jsdelivr.net/npm/@supabase/supabase-js"), file + " still loads supabase from jsDelivr");
    assert.ok(html.indexOf('src="config.js"') < html.indexOf('src="vendor/supabase.umd.js"'), file + " loads config before the SDK");
    assert.ok(html.indexOf('src="vendor/supabase.umd.js"') < html.indexOf('src="sync-merge.js"'), file + " loads the SDK before sync-merge");
  }
  const grokUmd = read("grok/vendor/supabase.umd.js");
  const rootUmd = read("vendor/supabase.umd.js");
  assert.strictEqual(grokUmd, rootUmd, "grok and root vendor copies match");
  assert.ok(grokUmd.includes('.version="2.49.4"'), "vendored file is supabase-js 2.49.4");
  assert.ok(grokUmd.includes("createClient"), "vendored file exposes createClient");

  const expectedUrl = {
    "config.js": LIVE_URL,
    "grok/config.js": GROK_PROXY_URL,
  };
  for (const file of ["config.js", "grok/config.js"]) {
    const src = read(file);
    const url = src.match(/SUPABASE_URL:\s*"([^"]+)"/)[1];
    const key = src.match(/SUPABASE_ANON_KEY:\s*"([^"]+)"/)[1];
    assert.strictEqual(url, expectedUrl[file], file + " URL");
    assert.strictEqual(key, LIVE_KEY, file + " keeps the publishable key");
    assert.ok(!/service_role\s*[:=]\s*['"][^'"]+['"]/.test(src), file);
    assert.ok(!/eyJ[A-Za-z0-9_-]{10,}\./.test(src), file + " must not embed a JWT");
  }

  const grokMerge = require(path.join(root, "grok/sync-merge.js"));
  const proxyConfig = {
    SUPABASE_URL: GROK_PROXY_URL,
    SUPABASE_ANON_KEY: LIVE_KEY,
    SITE_URL: "https://andywillbeback.github.io/QuizMario/grok/",
  };
  assert.strictEqual(grokMerge.isCloudConfigured(proxyConfig), true, "grok accepts the CF proxy base URL");
  assert.strictEqual(grokMerge.isCloudConfigured({
    SUPABASE_URL: GROK_PROXY_URL + "/",
    SUPABASE_ANON_KEY: LIVE_KEY,
  }), true, "trailing slash is stripped before the host check");
  assert.strictEqual(grokMerge.isCloudConfigured({
    SUPABASE_URL: "https://evil.workers.dev",
    SUPABASE_ANON_KEY: LIVE_KEY,
  }), false, "an arbitrary workers.dev host stays unconfigured");
  assertBanner("grok/auth-page.js", {
    config: proxyConfig,
    supabase: { createClient() { return authClient(); } },
  }, null);

  const grokAuth = read("grok/auth-page.js");
  assert.ok(grokAuth.includes(CONFIG_GROK), "grok config-missing sentence stays");
  assert.ok(!grokAuth.includes("返回游戏"), "grok login copy must not send people back to the exam gate");
  assert.ok(read("auth-page.js").includes(CONFIG_ROOT), "root config-missing sentence stays");
}

function fakeDocument() {
  const els = {};
  return {
    getElementById(id) {
      if (!els[id]) {
        els[id] = {
          id,
          hidden: id === "config-banner",
          textContent: "",
          className: "",
          value: "",
          required: false,
          disabled: false,
          autocomplete: "",
          addEventListener() {},
          setAttribute() {},
          hasAttribute() { return false; },
        };
      }
      return els[id];
    },
  };
}

function authClient() {
  return {
    auth: {
      getSession() { return Promise.resolve({ data: { session: null } }); },
      signInWithPassword() { return Promise.resolve({ data: {}, error: null }); },
      signUp() { return Promise.resolve({ data: {}, error: null }); },
      resetPasswordForEmail() { return Promise.resolve({ data: {}, error: null }); },
      signOut() { return Promise.resolve({}); },
      updateUser() { return Promise.resolve({ data: {}, error: null }); },
    },
  };
}

function loadBanner(authFile, opts) {
  const dir = path.dirname(path.join(root, authFile));
  const sandbox = {
    console,
    URLSearchParams,
    Promise,
    document: fakeDocument(),
    location: { search: "", hash: "", href: "https://example.test/login.html" },
    QUIZMARIO_CONFIG: opts.config,
  };
  if (opts.supabase !== undefined) sandbox.supabase = opts.supabase;
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.module = { exports: {} };
  sandbox.exports = sandbox.module.exports;
  if (opts.merge !== false) {
    vm.runInNewContext(fs.readFileSync(path.join(dir, "sync-merge.js"), "utf8"), sandbox, { filename: "sync-merge.js" });
  }
  vm.runInNewContext(fs.readFileSync(path.join(dir, "cloud-client.js"), "utf8"), sandbox, { filename: "cloud-client.js" });
  vm.runInNewContext(fs.readFileSync(path.join(root, authFile), "utf8"), sandbox, { filename: authFile });
  return sandbox.document.getElementById("config-banner");
}

const liveConfig = { SUPABASE_URL: LIVE_URL, SUPABASE_ANON_KEY: LIVE_KEY, SITE_URL: "https://andywillbeback.github.io/QuizMario/grok/" };
const emptyConfig = { SUPABASE_URL: "", SUPABASE_ANON_KEY: "" };

function assertBanner(authFile, opts, expected) {
  const banner = loadBanner(authFile, opts);
  if (expected == null) {
    assert.strictEqual(banner.hidden, true, authFile + " banner should stay hidden");
    assert.strictEqual(banner.textContent, "", authFile + " banner text");
    return;
  }
  assert.strictEqual(banner.hidden, false, authFile + " banner should show");
  assert.strictEqual(banner.textContent, expected, authFile);
  if (expected !== CONFIG_GROK && expected !== CONFIG_ROOT) {
    assert.ok(!banner.textContent.includes("请在 config.js 填入"), authFile + " blamed config.js");
  }
}

function messageMatrix() {
  const pages = [
    ["grok/auth-page.js", CONFIG_GROK],
    ["auth-page.js", CONFIG_ROOT],
  ];
  for (const [file, configText] of pages) {
    assertBanner(file, {
      config: emptyConfig,
      supabase: { createClient() { throw new Error("sdk should not be asked"); } },
    }, configText);

    assertBanner(file, {
      config: liveConfig,
      supabase: undefined,
    }, SDK_HELP);

    assertBanner(file, {
      config: liveConfig,
      supabase: { createClient() { throw new Error("init failed"); } },
    }, CLIENT_HELP);

    assertBanner(file, {
      config: liveConfig,
      supabase: { createClient() { return null; } },
    }, CLIENT_HELP);

    let calls = 0;
    assertBanner(file, {
      config: liveConfig,
      supabase: {
        createClient() {
          calls += 1;
          return authClient();
        },
      },
    }, null);
    assert.ok(calls >= 1, file + " did not call createClient");

    assertBanner(file, {
      config: emptyConfig,
      merge: false,
      supabase: { createClient() { return authClient(); } },
    }, SDK_HELP);
  }
}

staticGuards();
messageMatrix();
console.log("auth banner ok");

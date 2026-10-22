/* After login, merge cloud progress with vocabSpotlight_v1 and upsert local saves.
 * Offline play does not require this script to succeed.
 */
(function () {
  "use strict";

  var MERGE = window.QuizMarioMerge;
  var CLIENT = window.QuizMarioCloudClient;
  var DEBOUNCE_MS = 1500;
  var STORAGE_KEY = "vocabSpotlight_v1";

  var user = null;
  var holdUploads = true;
  var pendingDuringBoot = false;
  var timer = null;
  var uploadChain = Promise.resolve();
  var bootLocalJson = "";

  function $(id) { return document.getElementById(id); }

  function clone(obj) {
    return JSON.parse(JSON.stringify(obj || {}));
  }

  function setStatus(text, detail) {
    var el = $("sync-status");
    if (!el) return;
    el.textContent = text;
    el.title = detail || "";
    el.classList.toggle("is-error", text.indexOf("失败") !== -1);
  }

  function revealApp() {
    document.documentElement.classList.add("session-ok");
  }

  function sendToLogin() {
    var tail = window.__QM_AUTH_PENDING ? ((location.search || "") + (location.hash || "")) : "";
    location.replace("login.html" + tail);
  }

  function renderAccount() {
    var logged = !!user;
    var link = $("login-link");
    var cta = $("login-cta");
    var out = $("btn-logout");
    var wipe = $("wipe-label");
    if (link) link.hidden = logged;
    if (cta) cta.hidden = logged;
    if (out) out.hidden = !logged;
    if (wipe) wipe.hidden = !logged;
    if (!logged) {
      var configured = CLIENT && CLIENT.isConfigured();
      setStatus("未登录本地", configured ? "" : "config.js 仍是占位符，进度只保存在本机");
    }
  }

  function friendlySyncError(err) {
    var msg = (err && err.message) || String(err || "同步失败");
    if (/user_progress|schema cache|does not exist|42P01|PGRST205/i.test(msg)) {
      return "云端表 user_progress 还没有建好。请在 Supabase SQL 编辑器运行 supabase/user_progress.sql。";
    }
    if (/JWT|invalid api key|apikey/i.test(msg)) {
      return "Supabase anon key 无效。请检查 config.js 里的 SUPABASE_ANON_KEY。";
    }
    return msg;
  }

  function onLocalSave() {
    if (holdUploads || !user) {
      if (holdUploads) pendingDuringBoot = true;
      return;
    }
    setStatus("已登录 · 同步中", user.email || "");
    if (timer) clearTimeout(timer);
    timer = setTimeout(function () {
      timer = null;
      enqueueUpload();
    }, DEBOUNCE_MS);
  }

  function enqueueUpload() {
    var qm = window.__QM;
    if (!qm || !user || typeof qm.getSave !== "function") return uploadChain;
    var snapshot;
    try { snapshot = clone(qm.getSave()); } catch (_) { return uploadChain; }
    uploadChain = uploadChain.then(function () {
      return uploadSnapshot(snapshot);
    }).catch(function (e) {
      setStatus("已登录 · 同步失败", friendlySyncError(e));
    });
    return uploadChain;
  }

  async function uploadSnapshot(snapshot) {
    var client = CLIENT && CLIENT.client();
    if (!client || !user || !MERGE) return;
    if (MERGE.isBlank(snapshot)) {
      setStatus("已登录 · 已同步", user.email || "");
      return;
    }
    if (!snapshot.updatedAt && window.__QM && typeof window.__QM.touchUpdatedAt === "function") {
      window.__QM.touchUpdatedAt();
      snapshot = clone(window.__QM.getSave());
    }
    var res = await client.from("user_progress").upsert({
      user_id: user.id,
      save: snapshot,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });
    if (res.error) throw res.error;
    setStatus("已登录 · 已同步", user.email || "");
  }

  function flushNow() {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    if (!user || holdUploads) return;
    enqueueUpload();
  }

  async function logout(opts) {
    opts = opts || {};
    if (opts.wipe) {
      if (!window.confirm("退出并清除本机进度？云端进度会保留，下次登录可以再同步下来。")) return;
    }
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    pendingDuringBoot = false;
    var client = CLIENT && CLIENT.client();
    if (client) {
      try { await client.auth.signOut(); } catch (_) {}
    }
    user = null;
    try { localStorage.removeItem("quizmario-auth"); } catch (_) {}
    if (opts.wipe) {
      try { localStorage.removeItem(STORAGE_KEY); } catch (_) {}
      if (window.QuizMarioLearnerEvents && typeof window.QuizMarioLearnerEvents.clear === "function") {
        try { window.QuizMarioLearnerEvents.clear(); } catch (_) {}
      }
    }
    location.replace("login.html");
  }

  async function boot() {
    renderAccount();
    var qm = window.__QM;
    if (qm && typeof qm.getSave === "function") {
      try { bootLocalJson = JSON.stringify(qm.getSave()); } catch (_) { bootLocalJson = ""; }
    }
    if (!MERGE || !CLIENT || !CLIENT.isConfigured() || !CLIENT.client() || !qm) {
      holdUploads = false;
      renderAccount();
      if (window.__QM_EXPECT_SESSION) revealApp();
      else sendToLogin();
      return;
    }
    var client = CLIENT.client();
    try {
      var sessionRes = await client.auth.getSession();
      var session = sessionRes && sessionRes.data && sessionRes.data.session;
      user = session && session.user ? session.user : null;
      if (!user) {
        pendingDuringBoot = false;
        renderAccount();
        sendToLogin();
        return;
      }
      revealApp();
      setStatus("已登录 · 同步中", user.email || "");
      renderAccount();
      var fetched = await client.from("user_progress").select("save,updated_at").eq("user_id", user.id).maybeSingle();
      if (fetched.error) throw fetched.error;
      var cloud = MERGE.normalizeCloudSave(fetched.data);
      var bootLocal = bootLocalJson ? JSON.parse(bootLocalJson) : {};
      var liveJson = "";
      try { liveJson = JSON.stringify(qm.getSave()); } catch (_) {}
      var dirty = liveJson !== bootLocalJson;
      var plan = MERGE.planSync(bootLocal, cloud);
      if (plan.source === "cloud" && cloud) {
        qm.applyCloudSave(cloud);
        pendingDuringBoot = false;
        setStatus("已登录 · 已同步", user.email || "");
      } else if (plan.upload || (dirty && plan.source === "local" && !MERGE.isBlank(qm.getSave()))) {
        if (!qm.getSave().updatedAt && typeof qm.touchUpdatedAt === "function") qm.touchUpdatedAt();
        await uploadSnapshot(clone(qm.getSave()));
      } else {
        setStatus("已登录 · 已同步", user.email || "");
      }
    } catch (e) {
      setStatus(user ? "已登录 · 同步失败" : "未登录本地", friendlySyncError(e));
      if (window.console && console.warn) console.warn("QuizMario sync", e);
      if (user || window.__QM_EXPECT_SESSION) revealApp();
      else sendToLogin();
    } finally {
      holdUploads = false;
      if (user && window.QuizMarioLearnerEvents && typeof window.QuizMarioLearnerEvents.bindUser === "function") {
        try { await window.QuizMarioLearnerEvents.bindUser(user); } catch (_) {}
      }
      if (pendingDuringBoot && user) {
        pendingDuringBoot = false;
        enqueueUpload();
      }
      if (user && window.__QM && typeof window.__QM.onSessionReady === "function") {
        try { window.__QM.onSessionReady(); } catch (_) {}
      }
    }
  }

  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden") flushNow();
  });
  window.addEventListener("pagehide", function () { flushNow(); });

  var logoutBtn = $("btn-logout");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", function () {
      var wipeEl = $("wipe-local");
      logout({ wipe: !!(wipeEl && wipeEl.checked) });
    });
  }

  window.QuizMarioCloud = {
    onLocalSave: onLocalSave,
    loggedIn: function () { return !!user; },
    logout: logout,
  };

  boot();
})();

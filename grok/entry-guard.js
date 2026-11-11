/* A verified session can start an account-bound progress read while the game
 * scripts load. Only sync.js may reveal that account's learning interface. */
(function () {
  "use strict";

  var verification = 0, verifiedUser = null, observedAuthOwner, signedOut = false, watching = false, cancelVerification = null;

  function status(message, failed) {
    if (window.__QM_ENTRY_STATUS) window.__QM_ENTRY_STATUS(message, failed);
    else {
      var hold = document.getElementById("auth-hold");
      if (hold) hold.textContent = message;
    }
  }

  function goLogin() {
    if (window.__QM_ENTRY_REDIRECTING) return;
    window.__QM_ENTRY_REDIRECTING = true;
    window.__QM_ENTRY_AUTH_READY = false;
    window.__QM_ENTRY_OWNER = "";
    window.__QM_ENTRY_PROGRESS = null;
    verifiedUser = null;
    clearTimeout(window.__QM_ENTRY_WATCHDOG);
    document.documentElement.classList.remove("session-ok");
    var tail = "";
    if (window.__QM_AUTH_PENDING) tail = (location.search || "") + (location.hash || "");
    location.replace("login.html" + tail);
  }

  function showGate() {
    if (window.__QM_ENTRY_REDIRECTING) return;
    window.__QM_ENTRY_PHASE = "content";
    status("登录已确认，正在加载学习页面…", false);
    // Keep the page-load watchdog until the account-owned application is ready.
    // Auth alone cannot reveal a previous account's in-memory save.
    if (!window.__QM_SYNC_READY) return;
    var cloud = window.QuizMarioCloud;
    if (!cloud || !cloud.userId || !verifiedUser || cloud.userId() !== verifiedUser.id) return;
    window.__QM_ENTRY_PHASE = "ready";
    clearTimeout(window.__QM_ENTRY_WATCHDOG);
    document.documentElement.classList.add("session-ok");
  }

  function sessionUser(res) {
    var session = res && res.data && res.data.session;
    if (!res || res.error || !session || !session.user || !session.user.id) return null;
    if (!session.access_token && !session.refresh_token) return null;
    if (session.expires_at && Number(session.expires_at) * 1000 < Date.now() - 5000) return null;
    return session.user;
  }

  function sessionError(code) {
    var error = new Error(code);
    error.code = code;
    return error;
  }

  function missingSession(error) {
    if (!error) return false;
    if (error.name === "AuthSessionMissingError") return true;
    return (Number(error.status) === 400 || Number(error.status) === 401) &&
      /^(invalid_grant|refresh_token_not_found|refresh_token_already_used|session_not_found|session_expired)$/.test(error.code || "");
  }

  function prefetchProgress(client, owner, attempt) {
    var core = window.QuizMarioSyncCore;
    if (window.__QM_SYNC_READY || !core || !core.request || !client.from) return;
    var early = { owner: owner, used: false };
    // The existing request deadline includes the response body. Observe errors
    // now even when sync.js will not consume this result until much later.
    early.promise = Promise.resolve().then(function () {
      if (attempt !== verification || window.__QM_ENTRY_REDIRECTING) throw sessionError("QM_AUTH_CHANGED");
      return core.request(client.from("user_progress").select("save,updated_at").eq("user_id", owner).maybeSingle());
    }).then(function (response) {
      if (attempt !== verification || window.__QM_ENTRY_REDIRECTING) throw sessionError("QM_AUTH_CHANGED");
      return { response: response };
    }).catch(function (error) { return { error: error }; });
    window.__QM_ENTRY_PROGRESS = early;
  }

  function observeAuth(client) {
    if (watching || !client.auth.onAuthStateChange) return;
    watching = true;
    client.auth.onAuthStateChange(function (event, session) {
      observedAuthOwner = session && session.user ? session.user.id : "";
      if (event === "SIGNED_OUT") signedOut = true;
      else if (session && session.user) signedOut = false;
      if (verifiedUser && observedAuthOwner !== verifiedUser.id) goLogin();
    });
  }

  async function verify() {
    var attempt = ++verification, timer;
    if (cancelVerification) cancelVerification();
    verifiedUser = null;
    observedAuthOwner = undefined;
    signedOut = false;
    window.__QM_ENTRY_AUTH_READY = false;
    window.__QM_ENTRY_OWNER = "";
    window.__QM_ENTRY_PROGRESS = null;
    window.__QM_ENTRY_PHASE = "session";
    status("正在确认登录状态…", false);
    if (!window.__QM_EXPECT_SESSION && !window.__QM_AUTH_PENDING) {
      goLogin();
      return;
    }
    try {
      var api = window.QuizMarioCloudClient;
      var client = api && typeof api.client === "function" ? api.client() : null;
      if (!client || !client.auth || typeof client.auth.getSession !== "function") throw sessionError("QM_AUTH_COMPONENT");
      observeAuth(client);
      // Share the bounded, validated result. A timeout must reject for sync.js
      // too; a late SDK completion cannot reopen the page after that deadline.
      var pending = new Promise(function (resolve, reject) {
        cancelVerification = function () { reject(sessionError("QM_AUTH_CHANGED")); };
        timer = setTimeout(function () { reject(sessionError("QM_AUTH_TIMEOUT")); }, 25000);
        Promise.resolve().then(function () { return client.auth.getSession(); }).then(function (res) {
          if (res && res.error) throw res.error;
          var user = sessionUser(res);
          if (!user) throw sessionError("QM_AUTH_SESSION");
          var store = window.QuizMarioAccountStore;
          var owner = store && store.owner ? store.owner() : "";
          if (attempt !== verification || window.__QM_ENTRY_REDIRECTING ||
              (owner && owner !== user.id) || (observedAuthOwner !== undefined && observedAuthOwner !== user.id))
            throw sessionError("QM_AUTH_CHANGED");
          resolve(res);
        }).catch(reject);
      });
      window.__QM_ENTRY_SESSION = pending;
      var res = await pending;
      if (attempt !== verification || window.__QM_ENTRY_REDIRECTING) return;
      verifiedUser = sessionUser(res);
      window.__QM_ENTRY_OWNER = verifiedUser.id;
      window.__QM_ENTRY_AUTH_READY = true;
      if (sessionUser(res)) showGate();
      else goLogin();
      if (verifiedUser && !window.__QM_ENTRY_REDIRECTING) prefetchProgress(client, verifiedUser.id, attempt);
    } catch (error) {
      if (attempt !== verification || window.__QM_ENTRY_REDIRECTING) return;
      // Retryable fetch/lock errors retain their session. The bundled SDK
      // removes storage and emits SIGNED_OUT for permanent refresh failures.
      var store = window.QuizMarioAccountStore;
      if (missingSession(error) || (signedOut && store && !store.owner()) ||
          (error && (error.code === "QM_AUTH_SESSION" || error.code === "QM_AUTH_CHANGED"))) { goLogin(); return; }
      document.documentElement.classList.remove("session-ok");
      status("暂时无法确认登录状态，请检查网络后刷新重试。", true);
    } finally {
      clearTimeout(timer);
      if (attempt === verification) cancelVerification = null;
    }
  }

  window.addEventListener("storage", function (event) {
    if (event.key !== "quizmario-auth" && event.key !== null) return;
    var session;
    try { session = JSON.parse(event.newValue || "null"); } catch (_) {}
    observedAuthOwner = session && session.user ? session.user.id : "";
    if (verifiedUser && observedAuthOwner !== verifiedUser.id) goLogin();
  });
  window.addEventListener("pageshow", function (ev) {
    if (!ev.persisted) return;
    window.__QM_ENTRY_REDIRECTING = false;
    document.documentElement.classList.remove("session-ok");
    verify();
  });

  verify();
})();


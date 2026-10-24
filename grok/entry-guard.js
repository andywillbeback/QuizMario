/* grok-track entry order.
 * index.html stays hidden until getSession() returns a user.
 * A localStorage blob alone must not paint 中考 / 高考.
 */
(function () {
  "use strict";

  function goLogin() {
    if (window.__QM_ENTRY_REDIRECTING) return;
    window.__QM_ENTRY_REDIRECTING = true;
    document.documentElement.classList.remove("session-ok");
    var tail = "";
    if (window.__QM_AUTH_PENDING) tail = (location.search || "") + (location.hash || "");
    location.replace("login.html" + tail);
  }

  function showGate() {
    if (window.__QM_ENTRY_REDIRECTING) return;
    document.documentElement.classList.add("session-ok");
  }

  function sessionUser(res) {
    var session = res && res.data && res.data.session;
    if (!session || !session.user) return null;
    if (!session.access_token && !session.refresh_token) return null;
    if (session.expires_at && Number(session.expires_at) * 1000 < Date.now() - 5000) return null;
    return session.user;
  }

  async function verify() {
    if (!window.__QM_EXPECT_SESSION && !window.__QM_AUTH_PENDING) {
      goLogin();
      return;
    }
    var api = window.QuizMarioCloudClient;
    var client = api && typeof api.client === "function" ? api.client() : null;
    if (!client || !client.auth || typeof client.auth.getSession !== "function") {
      goLogin();
      return;
    }
    try {
      var res = await client.auth.getSession();
      if (sessionUser(res)) showGate();
      else goLogin();
    } catch (e) {
      goLogin();
    }
  }

  window.addEventListener("pageshow", function (ev) {
    if (!ev.persisted) return;
    window.__QM_ENTRY_REDIRECTING = false;
    document.documentElement.classList.remove("session-ok");
    verify();
  });

  verify();
})();

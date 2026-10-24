/* Login / register page. Does not read or write vocabSpotlight_v1. */
(function () {
  "use strict";

  var CLIENT = window.QuizMarioCloudClient;
  var mode = "register";

  function $(id) { return document.getElementById(id); }

  function msg(text, kind) {
    var el = $("auth-msg");
    if (!el) return;
    el.textContent = text || "";
    el.className = kind || "";
  }

  function humanAuthError(err) {
    var text = (err && err.message) || String(err || "");
    if (/invalid login credentials/i.test(text)) return "邮箱或密码不正确。";
    if (/already registered|already been registered/i.test(text)) return "这个邮箱已经注册过，请直接登录。";
    if (/email not confirmed/i.test(text)) return "邮箱还没确认。请先点邮件里的链接，再登录。";
    if (/password/i.test(text) && /6|least/i.test(text)) return "密码至少 6 位。";
    if (/invalid email/i.test(text)) return "邮箱格式不对。";
    if (/rate limit|too many|security purposes/i.test(text)) return "尝试太频繁，请稍后再试。";
    if (/user_progress|schema cache/i.test(text)) return text;
    return text || "登录失败。";
  }

  function configured() {
    return CLIENT && CLIENT.isConfigured() && CLIENT.client();
  }

  function configHelp() {
    return "还不能登录：请在 config.js 填入 SUPABASE_URL 和 SUPABASE_ANON_KEY（见 README）。未登录不能选择中考或高考。";
  }

  function setMode(next) {
    mode = next === "register" ? "register" : "login";
    var confirmLabel = $("confirm-label");
    var confirmInput = $("confirm");
    var password = $("password");
    if (confirmLabel) confirmLabel.hidden = mode !== "register";
    if (confirmInput) {
      confirmInput.required = mode === "register";
      if (mode !== "register") confirmInput.value = "";
    }
    if (password) password.autocomplete = mode === "register" ? "new-password" : "current-password";
    var submit = $("btn-submit");
    if (submit) submit.textContent = mode === "register" ? "注册" : "登录";
    var loginBtn = $("mode-login");
    var regBtn = $("mode-register");
    if (loginBtn) {
      loginBtn.setAttribute("aria-pressed", mode === "login" ? "true" : "false");
      if (loginBtn.hasAttribute("aria-selected")) {
        loginBtn.setAttribute("aria-selected", mode === "login" ? "true" : "false");
      }
    }
    if (regBtn) {
      regBtn.setAttribute("aria-pressed", mode === "register" ? "true" : "false");
      if (regBtn.hasAttribute("aria-selected")) {
        regBtn.setAttribute("aria-selected", mode === "register" ? "true" : "false");
      }
    }
    msg("");
  }

  function showSession(email) {
    var form = $("auth-form");
    var panel = $("session-panel");
    if (form) form.hidden = true;
    if (panel) panel.hidden = false;
    var who = $("session-email");
    if (who) who.textContent = email || "";
    msg("已登录。本机进度会在进入游戏后同步。退出不会删除本机进度。", "ok");
  }

  function showForm() {
    var form = $("auth-form");
    var panel = $("session-panel");
    if (form) form.hidden = false;
    if (panel) panel.hidden = true;
  }

  function readRedirectError() {
    var search = new URLSearchParams(window.location.search);
    var hash = new URLSearchParams((window.location.hash || "").replace(/^#/, ""));
    var description = search.get("error_description") || hash.get("error_description");
    var error = search.get("error") || hash.get("error");
    if (description) return decodeURIComponent(description.replace(/\+/g, " "));
    if (error) return error;
    return "";
  }

  async function boot() {
    setMode("register");
    var banner = $("config-banner");
    if (!configured()) {
      if (banner) {
        banner.hidden = false;
        banner.textContent = configHelp();
      }
      return;
    }
    if (banner) banner.hidden = true;
    var redirectError = readRedirectError();
    if (redirectError) msg(redirectError, "bad");
    try {
      var res = await CLIENT.client().auth.getSession();
      var session = res && res.data && res.data.session;
      if (session && session.user) showSession(session.user.email);
    } catch (e) {
      msg(humanAuthError(e), "bad");
    }
  }

  var loginModeBtn = $("mode-login");
  var registerModeBtn = $("mode-register");
  if (loginModeBtn) loginModeBtn.addEventListener("click", function () { setMode("login"); });
  if (registerModeBtn) registerModeBtn.addEventListener("click", function () { setMode("register"); });

  var form = $("auth-form");
  if (form) {
    form.addEventListener("submit", async function (e) {
      e.preventDefault();
      var email = String($("email").value || "").trim().toLowerCase();
      var password = String($("password").value || "");
      var confirm = String(($("confirm") && $("confirm").value) || "");
      if (!email || !password) {
        msg("请填写邮箱和密码。", "bad");
        return;
      }
      if (password.length < 6) {
        msg("密码至少 6 位。", "bad");
        return;
      }
      if (mode === "register" && password !== confirm) {
        msg("两次密码不一致。", "bad");
        return;
      }
      if (!configured()) {
        msg(configHelp(), "bad");
        return;
      }
      var submit = $("btn-submit");
      if (submit) submit.disabled = true;
      msg(mode === "register" ? "正在注册…" : "正在登录…");
      try {
        var client = CLIENT.client();
        if (mode === "register") {
          var signed = await client.auth.signUp({
            email: email,
            password: password,
            options: { emailRedirectTo: CLIENT.siteUrl() },
          });
          if (signed.error) throw signed.error;
          if (signed.data && signed.data.session) {
            window.location.href = "index.html";
            return;
          }
          msg("注册成功。请到邮箱点确认链接（用同一浏览器打开），然后再登录。课堂使用可以在 Supabase 里关掉 Confirm email，注册后会直接进入游戏。", "ok");
        } else {
          var logged = await client.auth.signInWithPassword({ email: email, password: password });
          if (logged.error) throw logged.error;
          window.location.href = "index.html";
        }
      } catch (err) {
        msg(humanAuthError(err), "bad");
      } finally {
        if (submit) submit.disabled = false;
      }
    });
  }

  var forgot = $("btn-forgot");
  if (forgot) {
    forgot.addEventListener("click", async function () {
      var email = String(($("email") && $("email").value) || "").trim().toLowerCase();
      if (!email) {
        msg("请先填写邮箱，再发送重置邮件。", "bad");
        return;
      }
      if (!configured()) {
        msg(configHelp(), "bad");
        return;
      }
      forgot.disabled = true;
      try {
        var res = await CLIENT.client().auth.resetPasswordForEmail(email, {
          redirectTo: CLIENT.siteUrl() + "login.html",
        });
        if (res.error) throw res.error;
        msg("如果这个邮箱已注册，你会收到重置邮件。请用同一浏览器打开链接，然后在本页设置新密码。", "ok");
      } catch (err) {
        msg(humanAuthError(err), "bad");
      } finally {
        forgot.disabled = false;
      }
    });
  }

  var logoutBtn = $("btn-session-logout");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", async function () {
      if (!configured()) {
        showForm();
        msg("已退出。本机游戏进度仍保留。", "ok");
        return;
      }
      logoutBtn.disabled = true;
      try {
        await CLIENT.client().auth.signOut();
      } catch (_) {}
      logoutBtn.disabled = false;
      showForm();
      msg("已退出。本机游戏进度仍保留。", "ok");
    });
  }

  var passForm = $("password-form");
  if (passForm) {
    passForm.addEventListener("submit", async function (e) {
      e.preventDefault();
      var next = String($("new-password").value || "");
      var again = String($("new-password-2").value || "");
      if (next.length < 6) {
        msg("新密码至少 6 位。", "bad");
        return;
      }
      if (next !== again) {
        msg("两次新密码不一致。", "bad");
        return;
      }
      if (!configured()) {
        msg(configHelp(), "bad");
        return;
      }
      var btn = $("btn-update-password");
      if (btn) btn.disabled = true;
      try {
        var res = await CLIENT.client().auth.updateUser({ password: next });
        if (res.error) throw res.error;
        $("new-password").value = "";
        $("new-password-2").value = "";
        msg("密码已更新。", "ok");
      } catch (err) {
        msg(humanAuthError(err), "bad");
      } finally {
        if (btn) btn.disabled = false;
      }
    });
  }

  boot();
})();

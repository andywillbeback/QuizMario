/* Learner 姓名 + 班级. Pure helpers, plus a soft prompt on the exam gate.
 * If this file throws, login and practice still run.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.QuizMarioProfileName = api;
  if (root && root.document) {
    try { install(root, api); } catch (_) {}
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var STORAGE_KEY = "vocabSpotlight_v1";

  function chars(s) {
    return Array.from(String(s || "")).length;
  }

  function clean(raw) {
    return String(raw == null ? "" : raw).replace(/[\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim();
  }

  function validateDisplayName(raw) {
    var name = clean(raw);
    if (!name) return { ok: false, error: "请填写姓名。" };
    var n = chars(name);
    if (n < 2 || n > 12) return { ok: false, error: "姓名需要 2–12 个字。" };
    return { ok: true, name: name };
  }

  function validateClassName(raw) {
    var cls = clean(raw);
    if (!cls) return { ok: false, error: "请填写班级名。" };
    if (chars(cls) > 20) return { ok: false, error: "班级名最多 20 个字。" };
    return { ok: true, cls: cls };
  }

  function validatePair(nameRaw, clsRaw) {
    var name = validateDisplayName(nameRaw);
    if (!name.ok) return name;
    var cls = validateClassName(clsRaw);
    if (!cls.ok) return cls;
    return { ok: true, name: name.name, cls: cls.cls };
  }

  function readProfile(save) {
    var p = save && save.profile;
    if (!p || typeof p !== "object" || Array.isArray(p)) return { name: "", cls: "" };
    return {
      name: typeof p.name === "string" ? p.name.trim() : "",
      cls: typeof p.cls === "string" ? p.cls.trim() : "",
    };
  }

  function metadataOf(user) {
    var meta = user && user.user_metadata;
    if (!meta || typeof meta !== "object") return { name: "", cls: "" };
    var cls = meta.class_name;
    if (typeof cls !== "string") cls = meta.cls;
    return {
      name: typeof meta.display_name === "string" ? meta.display_name.trim() : "",
      cls: typeof cls === "string" ? cls.trim() : "",
    };
  }

  function firstValid(check, values) {
    for (var i = 0; i < values.length; i++) {
      var row = check(values[i]);
      if (row.ok) return row.name || row.cls;
    }
    return "";
  }

  /** Local profile, then cloud profile, then sign-up metadata. */
  function pickProfile(save, cloud, user) {
    var local = readProfile(save);
    var remote = readProfile(cloud);
    var meta = metadataOf(user);
    return {
      name: firstValid(validateDisplayName, [local.name, remote.name, meta.name]),
      cls: firstValid(validateClassName, [local.cls, remote.cls, meta.cls]),
    };
  }

  function complete(profile) {
    return !!(validateDisplayName(profile && profile.name).ok && validateClassName(profile && profile.cls).ok);
  }

  function signupData(name, cls) {
    return { display_name: name, class_name: cls };
  }

  function seedLocalProfile(name, cls, storage) {
    var store = storage;
    if (!store) {
      if (typeof localStorage === "undefined") return null;
      store = localStorage;
    }
    var save = {};
    try {
      save = JSON.parse(store.getItem(STORAGE_KEY) || "{}") || {};
    } catch (_) {
      save = {};
    }
    if (!save || typeof save !== "object" || Array.isArray(save)) save = {};
    if (!save.profile || typeof save.profile !== "object" || Array.isArray(save.profile)) {
      save.profile = { name: "", cls: "" };
    }
    if (!String(save.profile.name || "").trim()) save.profile.name = name;
    if (!String(save.profile.cls || "").trim()) save.profile.cls = cls;
    if (!save.updatedAt) save.updatedAt = new Date().toISOString();
    store.setItem(STORAGE_KEY, JSON.stringify(save));
    return save;
  }

  return {
    STORAGE_KEY: STORAGE_KEY,
    clean: clean,
    validateDisplayName: validateDisplayName,
    validateClassName: validateClassName,
    validatePair: validatePair,
    readProfile: readProfile,
    metadataOf: metadataOf,
    pickProfile: pickProfile,
    complete: complete,
    signupData: signupData,
    seedLocalProfile: seedLocalProfile,
  };
});

function install(root, api) {
  var doc = root.document;

  function $(id) { return doc.getElementById(id); }

  function sessionUser() {
    try {
      var raw = root.localStorage.getItem("quizmario-auth");
      var session = raw && JSON.parse(raw);
      return session && session.user ? session.user : null;
    } catch (_) {
      return null;
    }
  }

  function currentProfile() {
    var qm = root.__QM;
    var save = qm && typeof qm.getSave === "function" ? qm.getSave() : null;
    return api.pickProfile(save, null, sessionUser());
  }

  function identityReady() {
    return api.complete(currentProfile());
  }

  function applyIdentity(pair) {
    var qm = root.__QM;
    if (qm && typeof qm.setProfile === "function") {
      qm.setProfile(pair.name, pair.cls);
      return;
    }
    api.seedLocalProfile(pair.name, pair.cls);
  }

  function pushMetadata(pair) {
    try {
      var clients = root.QuizMarioCloudClient;
      var client = clients && typeof clients.client === "function" ? clients.client() : null;
      if (!client || !client.auth || typeof client.auth.updateUser !== "function") return;
      Promise.resolve(client.auth.updateUser({ data: api.signupData(pair.name, pair.cls) })).catch(function () {});
    } catch (_) {}
  }

  function ensureStyle() {
    if ($("profile-name-style")) return;
    var style = doc.createElement("style");
    style.id = "profile-name-style";
    style.textContent = [
      "#profile-name-gate{position:fixed;inset:0;z-index:80;display:flex;align-items:center;justify-content:center;padding:24px;background:rgba(3,6,15,.72)}",
      "#profile-name-gate[hidden]{display:none!important}",
      "#profile-name-gate form{width:min(420px,100%);padding:22px 18px;border-radius:16px;background:#10182c;color:#f4f7ff;box-shadow:0 18px 50px rgba(0,0,0,.45)}",
      "#profile-name-gate h2{margin:0 0 8px;font-size:1.25rem}",
      "#profile-name-gate p{margin:0 0 14px;color:rgba(226,234,248,.8);font-size:.92rem;line-height:1.45}",
      "#profile-name-gate input{display:block;width:100%;height:46px;margin:0 0 10px;padding:0 12px;border-radius:8px;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.06);color:#fff;font:inherit}",
      "#profile-name-gate button{width:100%;height:46px;border:0;border-radius:8px;background:linear-gradient(180deg,#ffe066,#f5b800);color:#1a1300;font:inherit;font-weight:700;cursor:pointer}",
      "#profile-name-msg{min-height:1.2em;margin:8px 0 0;color:#ffb4c0;font-size:.85rem}",
    ].join("");
    doc.head.appendChild(style);
  }

  function buildPrompt() {
    ensureStyle();
    var gate = doc.createElement("div");
    gate.id = "profile-name-gate";
    gate.hidden = true;
    gate.innerHTML = [
      '<form id="profile-name-form">',
      "<h2>填写姓名和班级</h2>",
      "<p>两项都要填，才能进入中考或高考。</p>",
      '<label for="profile-name-input">姓名</label>',
      '<input id="profile-name-input" name="display-name" type="text" maxlength="12" autocomplete="nickname" placeholder="姓名（2–12 字）">',
      '<label for="profile-class-input">班级名</label>',
      '<input id="profile-class-input" name="class-name" type="text" maxlength="20" autocomplete="organization" placeholder="班级名">',
      '<button type="submit" id="profile-name-save">保存</button>',
      '<p id="profile-name-msg" role="status"></p>',
      "</form>",
    ].join("");
    doc.body.appendChild(gate);
    var form = $("profile-name-form");
    if (form) {
      form.addEventListener("submit", function (e) {
        e.preventDefault();
        var msg = $("profile-name-msg");
        var pair;
        try {
          pair = api.validatePair(
            ($("profile-name-input") || {}).value,
            ($("profile-class-input") || {}).value
          );
        } catch (_) {
          pair = { ok: false, error: "暂时存不了姓名，请再试一次。" };
        }
        if (!pair.ok) {
          if (msg) msg.textContent = pair.error || "请填写姓名和班级名。";
          return;
        }
        try {
          applyIdentity(pair);
        } catch (_) {
          try { api.seedLocalProfile(pair.name, pair.cls); } catch (__) {}
        }
        pushMetadata(pair);
        gate.hidden = true;
        if (msg) msg.textContent = "";
      });
    }
    return gate;
  }

  function openPrompt() {
    try {
      var gate = $("profile-name-gate") || buildPrompt();
      var picked = currentProfile();
      var nameInput = $("profile-name-input");
      var clsInput = $("profile-class-input");
      if (nameInput && !nameInput.value) nameInput.value = picked.name || "";
      if (clsInput && !clsInput.value) clsInput.value = picked.cls || "";
      gate.hidden = false;
      if (nameInput && typeof nameInput.focus === "function") nameInput.focus();
    } catch (_) {}
  }

  function onGateClick(e) {
    try {
      if (identityReady()) {
        var picked = currentProfile();
        var qm = root.__QM;
        var have = qm && typeof qm.getSave === "function" ? api.readProfile(qm.getSave()) : { name: "", cls: "" };
        if ((picked.name && picked.name !== have.name) || (picked.cls && picked.cls !== have.cls)) {
          try { applyIdentity({ name: picked.name || have.name, cls: picked.cls || have.cls }); } catch (_) {}
        }
        return;
      }
      e.preventDefault();
      e.stopImmediatePropagation();
      openPrompt();
    } catch (_) {}
  }

  function bindGate() {
    ["btn-gate-zhongkao", "btn-gate-gaokao"].forEach(function (id) {
      var btn = $(id);
      if (!btn || btn.getAttribute("data-profile-name") === "1") return;
      btn.setAttribute("data-profile-name", "1");
      btn.addEventListener("click", onGateClick, true);
    });
  }

  bindGate();
  var qm = root.__QM;
  if (qm) {
    var prev = qm.onSessionReady;
    qm.onSessionReady = function () {
      try { if (typeof prev === "function") prev(); } catch (_) {}
      try {
        bindGate();
        if (!identityReady()) openPrompt();
      } catch (_) {}
    };
  }
}

/* 聚光单词 achievement card + Shanghai check-in.
 * A calendar day counts only after a completed set (the existing clear screen).
 * Streak and the「我要打十个」unlock stay in localStorage, not learner_events.
 * If this file fails to load, game.js hides the share button and practice continues.
 *
 * Also require()-able from node tests. Browser UI attaches when document exists.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.QuizMarioShare = api;
  if (root && root.document) {
    try { api.installBrowser(root); } catch (_) {}
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var BRAND = "聚光单词 · 1st edition";
  var ACHIEVEMENT_ID = "wo_yao_da_shi_ge";
  var ACHIEVEMENT_TITLE = "我要打十个";
  var STREAK_GOAL = 10;
  var STORAGE_KEY = "juguang_checkin_v1";
  var TZ = "Asia/Shanghai";
  var FONT = "\"PingFang SC\", \"Noto Sans SC\", \"Microsoft YaHei\", sans-serif";
  var CARD_W = 1080;
  var CARD_H = 1350;

  var installed = false;
  var current = null;
  var currentUrl = "";
  var currentBlob = null;
  var paintGen = 0;
  var logoImg = null;
  var logoFailed = false;

  function emptyState() {
    return { v: 1, days: [], unlocked: {} };
  }

  function shanghaiDayKey(ms) {
    var d = new Date(ms == null ? Date.now() : ms);
    if (isNaN(d.getTime())) return "";
    var fmt;
    try {
      fmt = new Intl.DateTimeFormat("en-US", {
        timeZone: TZ,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      });
    } catch (_) {
      return "";
    }
    var parts = fmt.formatToParts(d);
    var y = "";
    var m = "";
    var day = "";
    for (var i = 0; i < parts.length; i++) {
      if (parts[i].type === "year") y = parts[i].value;
      else if (parts[i].type === "month") m = parts[i].value;
      else if (parts[i].type === "day") day = parts[i].value;
    }
    if (!/^\d{4}$/.test(y) || !/^\d{2}$/.test(m) || !/^\d{2}$/.test(day)) return "";
    return y + "-" + m + "-" + day;
  }

  function shiftDay(day, delta) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(day || ""));
    if (!m) return "";
    var utc = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + Number(delta || 0));
    var dt = new Date(utc);
    if (isNaN(dt.getTime())) return "";
    var mo = dt.getUTCMonth() + 1;
    var da = dt.getUTCDate();
    return dt.getUTCFullYear() + "-" + (mo < 10 ? "0" : "") + mo + "-" + (da < 10 ? "0" : "") + da;
  }

  function formatDay(day) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(day || ""));
    if (!m) return "";
    return Number(m[1]) + "年" + Number(m[2]) + "月" + Number(m[3]) + "日";
  }

  function clip(text, max) {
    var s = String(text || "");
    if (s.length <= max) return s;
    return s.slice(0, Math.max(0, max - 1)) + "…";
  }

  function normalizeState(raw) {
    var days = [];
    var seen = Object.create(null);
    var list = raw && Array.isArray(raw.days) ? raw.days : [];
    for (var i = 0; i < list.length; i++) {
      var day = String(list[i] || "");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || seen[day]) continue;
      seen[day] = true;
      days.push(day);
    }
    days.sort();
    if (days.length > 2000) days = days.slice(days.length - 2000);
    var unlocked = {};
    var prev = raw && raw.unlocked && typeof raw.unlocked === "object" ? raw.unlocked : null;
    if (prev && prev[ACHIEVEMENT_ID]) unlocked[ACHIEVEMENT_ID] = String(prev[ACHIEVEMENT_ID]);
    return { v: 1, days: days, unlocked: unlocked };
  }

  function streakOn(days, endDay) {
    if (!endDay) return 0;
    var set = Object.create(null);
    for (var i = 0; i < days.length; i++) set[days[i]] = true;
    var n = 0;
    var cursor = endDay;
    while (cursor && set[cursor]) {
      n += 1;
      if (n > 4000) break;
      cursor = shiftDay(cursor, -1);
    }
    return n;
  }

  /** Consecutive check-in days ending on `today`, or yesterday if today is still open. */
  function activeStreak(days, today) {
    var list = Array.isArray(days) ? days : [];
    var end = today || "";
    var set = Object.create(null);
    for (var i = 0; i < list.length; i++) set[list[i]] = true;
    if (!set[end]) end = shiftDay(today, -1);
    if (!end || !set[end]) return 0;
    return streakOn(list, end);
  }

  function recordSetComplete(state, nowMs) {
    var day = shanghaiDayKey(nowMs);
    if (!day) return null;
    var next = normalizeState(state);
    if (next.days.indexOf(day) === -1) {
      next.days.push(day);
      next.days.sort();
    }
    var streak = streakOn(next.days, day);
    var had = !!next.unlocked[ACHIEVEMENT_ID];
    var justUnlocked = false;
    if (streak >= STREAK_GOAL && !had) {
      next.unlocked[ACHIEVEMENT_ID] = day;
      justUnlocked = true;
    }
    return {
      state: next,
      day: day,
      streak: streak,
      unlocked: !!next.unlocked[ACHIEVEMENT_ID],
      justUnlocked: justUnlocked,
    };
  }

  /** Saved profile name, else a masked email local-part, else 学员. Never a made-up username. */
  function learnerDisplayName(input) {
    input = input || {};
    var name = String(input.name == null ? "" : input.name).replace(/\s+/g, " ").trim();
    if (name) return name;
    var masked = maskLocalPart(input.email);
    if (masked) return masked;
    return "学员";
  }

  function maskLocalPart(email) {
    var s = String(email == null ? "" : email).trim();
    var at = s.indexOf("@");
    if (at <= 0) return "";
    var local = s.slice(0, at);
    var host = s.slice(at + 1);
    if (!local || !host) return "";
    var stars = local.indexOf("***");
    if (stars !== -1) {
      var already = local.slice(0, stars + 3);
      return already === "***" ? "" : already;
    }
    var keep = local.length <= 1 ? 1 : 2;
    return local.slice(0, keep) + "***";
  }

  function cardModel(checkin, meta) {
    checkin = checkin || {};
    meta = meta || {};
    var streak = checkin.streak || 0;
    var showAchievement = !!(checkin.unlocked && streak >= STREAK_GOAL);
    var title = showAchievement ? ACHIEVEMENT_TITLE : (meta.kind === "level" ? "完成一组" : "今日打卡");
    var subtitle = showAchievement
      ? ("已连续打卡" + streak + "天")
      : ("连续 " + streak + "/" + STREAK_GOAL + " 天");
    var copy = showAchievement
      ? ("聚光单词 · " + ACHIEVEMENT_TITLE + "｜已连续打卡" + streak + "天")
      : ("聚光单词 · " + title + "｜连续 " + streak + "/" + STREAK_GOAL + " 天");
    return {
      brand: BRAND,
      title: title,
      subtitle: subtitle,
      date: formatDay(checkin.day),
      day: checkin.day || "",
      streak: streak,
      goal: STREAK_GOAL,
      unlocked: !!checkin.unlocked,
      showAchievement: showAchievement,
      justUnlocked: !!checkin.justUnlocked,
      label: meta.label ? String(meta.label) : "",
      learner: learnerDisplayName({ name: meta.name, email: meta.email }),
      copy: copy,
    };
  }

  function readState(storage) {
    if (!storage || typeof storage.getItem !== "function") return emptyState();
    try {
      var raw = storage.getItem(STORAGE_KEY);
      if (!raw) return emptyState();
      return normalizeState(JSON.parse(raw));
    } catch (_) {
      return emptyState();
    }
  }

  function writeState(storage, state) {
    if (!storage || typeof storage.setItem !== "function") return;
    storage.setItem(STORAGE_KEY, JSON.stringify(normalizeState(state)));
  }

  function commitSetComplete(storage, nowMs, meta) {
    var next = recordSetComplete(readState(storage), nowMs);
    if (!next) return null;
    try { writeState(storage, next.state); } catch (_) {}
    return cardModel(next, meta);
  }

  function clearLocal(storage) {
    var store = storage;
    if (!store && typeof localStorage !== "undefined") store = localStorage;
    if (!store || typeof store.removeItem !== "function") return;
    try { store.removeItem(STORAGE_KEY); } catch (_) {}
    current = null;
    currentUrl = "";
    currentBlob = null;
  }

  function traceRound(ctx, x, y, w, h, r) {
    var radius = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }

  function drawEmblem(ctx, cx, cy) {
    ctx.beginPath();
    ctx.arc(cx, cy, 54, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(230,201,138,0.14)";
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#e6c98a";
    ctx.stroke();
    ctx.fillStyle = "#e6c98a";
    ctx.font = "700 48px " + FONT;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("聚", cx, cy + 2);
  }

  function drawDots(ctx, cx, cy, model) {
    var goal = model.goal || STREAK_GOAL;
    var filled = Math.max(0, Math.min(goal, model.streak || 0));
    var gap = 28;
    var start = cx - ((goal - 1) * gap) / 2;
    for (var i = 0; i < goal; i++) {
      ctx.beginPath();
      ctx.arc(start + i * gap, cy, 9, 0, Math.PI * 2);
      ctx.fillStyle = i < filled ? "#e6c98a" : "rgba(255,255,255,0.16)";
      ctx.fill();
    }
  }

  function paintCard(ctx, model, assets) {
    if (!ctx || !model || typeof ctx.fillRect !== "function" || typeof ctx.fillText !== "function") return false;
    assets = assets || {};
    var w = assets.width || (ctx.canvas && ctx.canvas.width) || CARD_W;
    var h = assets.height || (ctx.canvas && ctx.canvas.height) || CARD_H;
    try {
      var bg = ctx.createLinearGradient ? ctx.createLinearGradient(0, 0, 0, h) : null;
      if (bg && bg.addColorStop) {
        bg.addColorStop(0, "#16305f");
        bg.addColorStop(0.42, "#07101f");
        bg.addColorStop(1, "#03060f");
        ctx.fillStyle = bg;
      } else {
        ctx.fillStyle = "#03060f";
      }
      ctx.fillRect(0, 0, w, h);
      if (ctx.createRadialGradient) {
        var glow = ctx.createRadialGradient(w / 2, 180, 20, w / 2, 220, 520);
        if (glow && glow.addColorStop) {
          glow.addColorStop(0, "rgba(230,201,138,0.28)");
          glow.addColorStop(1, "rgba(230,201,138,0)");
          ctx.fillStyle = glow;
          ctx.fillRect(0, 0, w, h);
        }
      }
      traceRound(ctx, 48, 48, w - 96, h - 96, 40);
      ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(230,201,138,0.9)";
      ctx.stroke();
      traceRound(ctx, 68, 68, w - 136, h - 136, 32);
      ctx.lineWidth = 1;
      ctx.strokeStyle = "rgba(230,201,138,0.35)";
      ctx.stroke();

      ctx.textAlign = "center";
      var y = 200;
      var logo = assets.logo;
      if (logo && logo.width && typeof ctx.drawImage === "function") {
        try {
          var scale = Math.min(760 / logo.width, 150 / logo.height);
          var dw = logo.width * scale;
          var dh = logo.height * scale;
          ctx.drawImage(logo, (w - dw) / 2, y, dw, dh);
          y += dh + 28;
        } catch (_) {
          drawEmblem(ctx, w / 2, y + 54);
          y += 132;
        }
      } else {
        drawEmblem(ctx, w / 2, y + 54);
        y += 132;
      }

      ctx.textBaseline = "top";
      ctx.fillStyle = "rgba(226,234,248,0.8)";
      ctx.font = "500 34px " + FONT;
      ctx.fillText(model.brand || BRAND, w / 2, y);
      y += 48;
      ctx.fillStyle = "#e6c98a";
      ctx.font = "600 36px " + FONT;
      ctx.fillText(clip(model.learner || "学员", 18), w / 2, y);
      y += 56;
      ctx.fillStyle = "#e6c98a";
      ctx.fillRect((w / 2) - 36, y, 72, 4);
      y += 40;
      ctx.fillStyle = "#f8fbff";
      ctx.font = "800 92px " + FONT;
      ctx.fillText(model.title || "", w / 2, y);
      y += 118;
      ctx.fillStyle = "#e6c98a";
      ctx.font = "600 42px " + FONT;
      ctx.fillText(model.subtitle || "", w / 2, y);
      y += 78;
      drawDots(ctx, w / 2, y, model);
      y += 44;
      if (model.label) {
        ctx.fillStyle = "rgba(226,234,248,0.66)";
        ctx.font = "400 30px " + FONT;
        ctx.fillText(clip(model.label, 28), w / 2, y);
        y += 52;
      }
      ctx.fillStyle = "rgba(226,234,248,0.78)";
      ctx.font = "500 32px " + FONT;
      ctx.fillText(model.date || "", w / 2, y);
      return true;
    } catch (_) {
      return false;
    }
  }

  function hideOffer() {
    paintGen += 1;
    var doc = typeof document !== "undefined" ? document : null;
    if (!doc) return;
    var box = doc.getElementById("share-achievement");
    var sheet = doc.getElementById("share-sheet");
    if (box) box.hidden = true;
    if (sheet) sheet.hidden = true;
  }

  function hideSheet() {
    paintGen += 1;
    var doc = typeof document !== "undefined" ? document : null;
    if (!doc) return;
    var sheet = doc.getElementById("share-sheet");
    if (sheet) sheet.hidden = true;
  }

  function onSetComplete(meta) {
    try {
      meta = meta || {};
      var storage = typeof localStorage !== "undefined" ? localStorage : null;
      if (!storage) {
        hideOffer();
        return null;
      }
      var model = commitSetComplete(storage, meta.now, meta);
      if (!model) {
        hideOffer();
        return null;
      }
      current = model;
      currentUrl = "";
      currentBlob = null;
      hideSheet();
      var doc = typeof document !== "undefined" ? document : null;
      var box = doc && doc.getElementById("share-achievement");
      if (box) box.hidden = false;
      return model;
    } catch (_) {
      hideOffer();
      return null;
    }
  }

  function loadLogo(done) {
    if (logoImg || logoFailed) {
      done(logoImg);
      return;
    }
    if (typeof Image === "undefined") {
      done(null);
      return;
    }
    var img = new Image();
    var finished = false;
    function finish(image) {
      if (finished) return;
      finished = true;
      done(image || null);
    }
    img.onload = function () {
      logoImg = img;
      finish(img);
    };
    img.onerror = function () {
      logoFailed = true;
      finish(null);
    };
    try { img.src = "logo-mark.png"; } catch (_) { logoFailed = true; finish(null); }
  }

  function setHint(text) {
    var doc = typeof document !== "undefined" ? document : null;
    var hint = doc && doc.getElementById("share-card-hint");
    if (hint) hint.textContent = text || "";
  }

  function openSheet() {
    var doc = typeof document !== "undefined" ? document : null;
    if (!doc || !current) return;
    var sheet = doc.getElementById("share-sheet");
    if (!sheet) return;
    var gen = ++paintGen;
    sheet.hidden = false;
    var copyEl = doc.getElementById("share-card-copy");
    if (copyEl) copyEl.textContent = current.copy || "";
    var who = doc.getElementById("share-card-learner");
    if (who) who.textContent = current.learner || "";
    var status = doc.getElementById("share-card-status");
    if (status) status.textContent = current.justUnlocked ? ACHIEVEMENT_TITLE : "";
    var nativeBtn = doc.getElementById("btn-share-native");
    if (nativeBtn) {
      var canNative = false;
      try { canNative = typeof navigator !== "undefined" && typeof navigator.share === "function"; } catch (_) {}
      nativeBtn.hidden = !canNative;
    }
    var img = doc.getElementById("share-card-img");
    var save = doc.getElementById("btn-share-save");
    if (img) {
      img.removeAttribute("src");
      img.hidden = true;
    }
    if (save) {
      save.hidden = true;
      save.setAttribute("href", "#");
    }
    setHint("正在生成成就卡片…");
    var model = current;
    loadLogo(function (logo) {
      if (gen !== paintGen || current !== model) return;
      try {
        var canvas = doc.createElement("canvas");
        canvas.width = CARD_W;
        canvas.height = CARD_H;
        var ctx = canvas.getContext && canvas.getContext("2d");
        var ok = paintCard(ctx, model, { logo: logo, width: CARD_W, height: CARD_H });
        if (!ok) {
          setHint("图片生成失败，仍可复制文案。");
          return;
        }
        var url = canvas.toDataURL("image/png");
        if (gen !== paintGen) return;
        currentUrl = url;
        if (img) {
          img.src = url;
          img.hidden = false;
        }
        if (save) {
          save.href = url;
          save.hidden = false;
        }
        setHint("长按图片保存，可发到朋友圈");
        if (typeof canvas.toBlob === "function") {
          canvas.toBlob(function (blob) {
            if (gen === paintGen) currentBlob = blob || null;
          }, "image/png");
        }
      } catch (_) {
        setHint("图片生成失败，仍可复制文案。");
      }
    });
  }

  function fallbackCopy(text) {
    var doc = typeof document !== "undefined" ? document : null;
    if (!doc || !doc.body || !doc.execCommand) return false;
    var ta = doc.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    doc.body.appendChild(ta);
    ta.select();
    var ok = false;
    try { ok = !!doc.execCommand("copy"); } catch (_) { ok = false; }
    ta.remove();
    return ok;
  }

  function setStatus(text) {
    var doc = typeof document !== "undefined" ? document : null;
    var status = doc && doc.getElementById("share-card-status");
    if (status) status.textContent = text || "";
  }

  function copyCurrent() {
    if (!current || !current.copy) return;
    var text = current.copy;
    var clip = typeof navigator !== "undefined" && navigator.clipboard && navigator.clipboard.writeText;
    if (clip) {
      navigator.clipboard.writeText(text).then(function () {
        setStatus("文案已复制");
      }, function () {
        setStatus(fallbackCopy(text) ? "文案已复制" : "复制失败，请长按上方文案");
      });
      return;
    }
    setStatus(fallbackCopy(text) ? "文案已复制" : "复制失败，请长按上方文案");
  }

  function nativeShare() {
    var model = current;
    if (!model || typeof navigator === "undefined" || typeof navigator.share !== "function") return;
    var payload = { title: model.brand, text: model.copy };
    var file = null;
    try {
      if (currentBlob && typeof File === "function") {
        file = new File([currentBlob], "juguang-checkin.png", { type: "image/png" });
      }
    } catch (_) {
      file = null;
    }
    var sharePromise;
    try {
      if (file && typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
        sharePromise = navigator.share({ files: [file], title: payload.title, text: payload.text });
      } else {
        sharePromise = navigator.share(payload);
      }
    } catch (_) {
      return;
    }
    if (sharePromise && typeof sharePromise.then === "function") {
      sharePromise.then(function () {}, function () {});
    }
  }

  function installBrowser(win) {
    if (installed) return;
    var doc = win && win.document;
    if (!doc) return;
    installed = true;
    var shareBtn = doc.getElementById("btn-share-achievement");
    if (shareBtn) {
      shareBtn.addEventListener("click", function (ev) {
        if (ev && ev.preventDefault) ev.preventDefault();
        try { openSheet(); } catch (_) {}
      });
    }
    var copyBtn = doc.getElementById("btn-share-copy");
    if (copyBtn) {
      copyBtn.addEventListener("click", function (ev) {
        if (ev && ev.preventDefault) ev.preventDefault();
        try { copyCurrent(); } catch (_) {}
      });
    }
    var nativeBtn = doc.getElementById("btn-share-native");
    if (nativeBtn) {
      nativeBtn.addEventListener("click", function (ev) {
        if (ev && ev.preventDefault) ev.preventDefault();
        try { nativeShare(); } catch (_) {}
      });
    }
    var closeBtn = doc.getElementById("btn-share-close");
    if (closeBtn) {
      closeBtn.addEventListener("click", function (ev) {
        if (ev && ev.preventDefault) ev.preventDefault();
        hideSheet();
      });
    }
    var save = doc.getElementById("btn-share-save");
    if (save) {
      save.addEventListener("click", function (ev) {
        var href = save.getAttribute("href") || "";
        if (!href || href === "#") {
          if (ev && ev.preventDefault) ev.preventDefault();
        }
      });
    }
  }

  return {
    BRAND: BRAND,
    ACHIEVEMENT_ID: ACHIEVEMENT_ID,
    ACHIEVEMENT_TITLE: ACHIEVEMENT_TITLE,
    STREAK_GOAL: STREAK_GOAL,
    STORAGE_KEY: STORAGE_KEY,
    CARD_W: CARD_W,
    CARD_H: CARD_H,
    emptyState: emptyState,
    shanghaiDayKey: shanghaiDayKey,
    shiftDay: shiftDay,
    formatDay: formatDay,
    normalizeState: normalizeState,
    streakOn: streakOn,
    activeStreak: activeStreak,
    recordSetComplete: recordSetComplete,
    cardModel: cardModel,
    learnerDisplayName: learnerDisplayName,
    readState: readState,
    commitSetComplete: commitSetComplete,
    clearLocal: clearLocal,
    paintCard: paintCard,
    onSetComplete: onSetComplete,
    installBrowser: installBrowser,
  };
});

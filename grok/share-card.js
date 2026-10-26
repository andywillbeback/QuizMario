/* 聚光单词 achievement card + Shanghai check-in.
 * A calendar day counts only after a completed set (the existing clear screen).
 * Streak stays in localStorage for the card subtitle, not in learner_events.
 * 「我要打十个」is offered every time a set finishes. It does not wait for
 * 10 consecutive Shanghai days. The stored name has no exclamation; the
 * painted card title is 我要打十个！.
 * If this file fails to load or the card fails to paint, practice continues.
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
  var ACHIEVEMENT_CARD_TITLE = "我要打十个！";
  /* Caps the streak dots on the card. Not an unlock threshold. */
  var STREAK_GOAL = 10;
  var STORAGE_KEY = "juguang_checkin_v1";
  var TZ = "Asia/Shanghai";
  /* One family only. A comma-separated list or a numeric weight can make
   * canvas reject the font and leave the 10px default, which looks blank. */
  var FONT_CANDIDATES = [
    "PingFang SC",
    "Hiragino Sans GB",
    "Heiti SC",
    "Noto Sans SC",
    "Noto Sans CJK SC",
    "Source Han Sans SC",
    "Microsoft YaHei",
    "WenQuanYi Micro Hei",
    "Droid Sans Fallback",
    "system-ui",
    "sans-serif",
  ];
  var CARD_W = 1080;
  var CARD_H = 1350;
  var PAINT_FAIL_HINT = "图片生成失败，可以继续练习。";
  var fontChoice = null;
  /* Outlines for the painted title. Used when no system font actually draws 我. */
  var TITLE_GLYPHS = {
    "我": [["M",944,1608],["L",1016,1464],["Q",872,1432,704,1400],["L",704,1112],["L",1208,1112],["Q",1184,1360,1184,1664],["L",1360,1664],["Q",1360,1352,1376,1112],["L",1944,1112],["L",1944,952],["L",1384,952],["Q",1416,696,1480,456],["Q",1592,616,1688,824],["L",1840,744],["Q",1704,448,1544,256],["Q",1656,-8,1720,-8],["Q",1744,-8,1776,36],["Q",1808,80,1824,160],["L",1960,104],["Q",1888,-184,1712,-184],["Q",1568,-184,1424,128],["Q",1224,-48,976,-168],["L",896,-24],["Q",1184,120,1352,296],["Q",1256,576,1224,952],["L",704,952],["L",704,632],["Q",880,672,1024,720],["L",1056,560],["Q",888,504,704,456],["L",704,48],["Q",704,-88,664,-136],["Q",624,-184,504,-184],["Q",360,-184,232,-152],["L",192,24],["Q",336,-16,480,-16],["Q",536,-16,536,88],["L",536,416],["Q",344,368,136,328],["L",104,504],["Q",336,544,536,584],["L",536,952],["L",104,952],["L",104,1112],["L",536,1112],["L",536,1376],["L",240,1328],["L",176,1488],["Q",592,1528,944,1608],["Z"],["M",1592,1624],["Q",1752,1464,1848,1280],["L",1704,1200],["Q",1616,1376,1448,1528],["Z"]],
    "要": [["M",88,600],["L",760,600],["L",856,736],["L",1024,704],["L",952,600],["L",1936,600],["L",1936,456],["L",1560,456],["Q",1456,232,1272,112],["L",1880,-56],["L",1752,-192],["Q",1400,-72,1088,16],["Q",752,-136,200,-192],["L",112,-32],["Q",544,0,824,80],["Q",568,144,352,192],["Q",512,320,640,456],["L",88,456],["Z"],["M",1048,160],["Q",1296,280,1384,456],["L",840,456],["Q",744,336,648,248],["Z"],["M",160,1600],["L",1888,1600],["L",1888,1448],["L",1336,1448],["L",1336,1288],["L",1792,1288],["L",1792,784],["L",256,784],["L",256,1288],["L",728,1288],["L",728,1448],["L",160,1448],["Z"],["M",1192,1288],["L",1192,1448],["L",872,1448],["L",872,1288],["Z"],["M",416,920],["L",728,920],["L",728,1152],["L",416,1152],["Z"],["M",872,1152],["L",872,920],["L",1192,920],["L",1192,1152],["Z"],["M",1336,1152],["L",1336,920],["L",1632,920],["L",1632,1152],["Z"]],
    "打": [["M",912,1568],["L",1944,1568],["L",1944,1416],["L",1608,1416],["L",1608,32],["Q",1608,-80,1560,-128],["Q",1512,-176,1360,-176],["Q",1272,-176,1192,-160],["L",1160,0],["Q",1264,-16,1360,-16],["Q",1448,-16,1448,56],["L",1448,1416],["L",912,1416],["Z"],["M",104,1320],["L",400,1320],["L",400,1656],["L",560,1656],["L",560,1320],["L",808,1320],["L",808,1168],["L",560,1168],["L",560,752],["L",808,856],["L",840,712],["L",560,584],["L",560,32],["Q",560,-88,520,-136],["Q",480,-184,384,-184],["Q",256,-184,144,-160],["L",112,8],["Q",232,-24,360,-24],["Q",400,-24,400,72],["L",400,520],["L",136,424],["L",80,592],["Q",248,640,400,696],["L",400,1168],["L",104,1168],["Z"]],
    "十": [["M",120,1032],["L",936,1032],["L",936,1656],["L",1096,1656],["L",1096,1032],["L",1928,1032],["L",1928,880],["L",1096,880],["L",1096,-184],["L",936,-184],["L",936,880],["L",120,880],["Z"]],
    "个": [["M",1008,1656],["L",1176,1616],["L",1136,1544],["Q",1416,1048,1968,856],["L",1872,680],["Q",1336,912,1040,1392],["Q",720,936,208,648],["L",96,776],["Q",456,992,648,1184],["Q",840,1376,1008,1656],["Z"],["M",944,976],["L",1104,976],["L",1104,-184],["L",944,-184],["Z"]],
    "！": [["M",1088,416],["L",968,416],["L",912,1464],["L",1136,1464],["Z"],["M",1152,112],["Q",1152,40,1120,4],["Q",1088,-32,1024,-32],["Q",960,-32,928,4],["Q",896,40,896,112],["Q",896,184,928,216],["Q",960,248,1024,248],["Q",1088,248,1120,216],["Q",1152,184,1152,112],["Z"]],
  };


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
    if (!next.unlocked[ACHIEVEMENT_ID]) next.unlocked[ACHIEVEMENT_ID] = day;
    return {
      state: next,
      day: day,
      streak: streak,
      unlocked: true,
      justUnlocked: true,
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
    var showAchievement = !!(checkin.unlocked || checkin.justUnlocked || checkin.day);
    var title = showAchievement ? ACHIEVEMENT_TITLE : (meta.kind === "level" ? "完成一组" : "今日打卡");
    var cardTitle = showAchievement ? ACHIEVEMENT_CARD_TITLE : title;
    var subtitle = showAchievement
      ? ("已连续打卡" + streak + "天")
      : ("连续打卡" + streak + "天");
    var copy = showAchievement
      ? ("聚光单词 · " + ACHIEVEMENT_TITLE + "｜已连续打卡" + streak + "天")
      : ("聚光单词 · " + title + "｜连续打卡" + streak + "天");
    return {
      brand: BRAND,
      title: title,
      cardTitle: cardTitle,
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

  function quoteFamily(name) {
    if (!name || name === "sans-serif" || name === "system-ui") return name || "sans-serif";
    return '"' + String(name).replace(/"/g, "") + '"';
  }

  function fontApplied(ctx, px) {
    try {
      var got = ctx && ctx.font;
      if (typeof got !== "string") return true;
      return got.indexOf(String(px) + "px") !== -1;
    } catch (_) {
      return true;
    }
  }

  function glyphInk(doc, family) {
    try {
      var canvas = doc.createElement("canvas");
      if (!canvas || typeof canvas.getContext !== "function") return -1;
      canvas.width = 48;
      canvas.height = 48;
      var probe = canvas.getContext("2d");
      if (!probe || typeof probe.getImageData !== "function" || typeof probe.fillText !== "function") return -1;
      function count(ch) {
        probe.fillStyle = "#000000";
        probe.fillRect(0, 0, 48, 48);
        probe.fillStyle = "#ffffff";
        probe.font = "bold 32px " + quoteFamily(family);
        if (!fontApplied(probe, 32)) return 0;
        probe.textAlign = "center";
        probe.textBaseline = "middle";
        probe.fillText(ch, 24, 24);
        var data = probe.getImageData(0, 0, 48, 48).data;
        if (!data || !data.length) return -1;
        var n = 0;
        for (var i = 0; i < data.length; i += 4) {
          if (data[i] > 40 || data[i + 1] > 40 || data[i + 2] > 40) n += 1;
        }
        return n;
      }
      var ink = count("我");
      if (ink < 0) return -1;
      var missing = count("\uFFFF");
      if (missing < 0) return ink > 24 ? ink : 0;
      if (ink < 24) return 0;
      if (missing > 0 && ink < missing * 1.35) return 0;
      return ink;
    } catch (_) {
      return -1;
    }
  }

  function inspectFonts() {
    if (fontChoice) return fontChoice;
    var doc = typeof document !== "undefined" ? document : null;
    if (!doc || typeof doc.createElement !== "function") {
      return { family: "sans-serif", ink: -1 };
    }
    var best = { family: "sans-serif", ink: 0 };
    for (var i = 0; i < FONT_CANDIDATES.length; i++) {
      var ink = glyphInk(doc, FONT_CANDIDATES[i]);
      if (ink < 0) {
        fontChoice = { family: "sans-serif", ink: -1 };
        return fontChoice;
      }
      if (ink > best.ink) best = { family: FONT_CANDIDATES[i], ink: ink };
      if (ink > 24) {
        fontChoice = { family: FONT_CANDIDATES[i], ink: ink };
        return fontChoice;
      }
    }
    fontChoice = best.ink > 0 ? best : { family: "sans-serif", ink: 0 };
    return fontChoice;
  }

  function fontDecision(assets) {
    if (assets && typeof assets.fontInk === "number") {
      return {
        family: assets.fontFamily ? String(assets.fontFamily) : "sans-serif",
        ink: assets.fontInk,
      };
    }
    try { return inspectFonts(); } catch (_) { return { family: "sans-serif", ink: -1 }; }
  }

  function fontOf(choice, weight, px) {
    var word = weight >= 600 ? "bold" : "normal";
    var family = choice && choice.family ? choice.family : "sans-serif";
    return word + " " + px + "px " + quoteFamily(family);
  }

  function setFont(ctx, choice, weight, px) {
    ctx.font = fontOf(choice, weight, px);
    if (!fontApplied(ctx, px)) {
      ctx.font = (weight >= 600 ? "bold " : "normal ") + px + "px sans-serif";
    }
  }

  function drawEmblem(ctx, cx, cy, choice) {
    ctx.beginPath();
    ctx.arc(cx, cy, 54, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(230,201,138,0.14)";
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#e6c98a";
    ctx.stroke();
    ctx.fillStyle = "#e6c98a";
    setFont(ctx, choice, 700, 48);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("聚", cx, cy + 2);
  }

  function curveTo(ctx, cpx, cpy, x, y) {
    if (typeof ctx.quadraticCurveTo === "function") ctx.quadraticCurveTo(cpx, cpy, x, y);
    else ctx.lineTo(x, y);
  }

  function drawTrophy(ctx, cx, cy) {
    var canSave = typeof ctx.save === "function" && typeof ctx.restore === "function";
    if (canSave) ctx.save();
    try {
      ctx.beginPath();
      ctx.arc(cx, cy - 8, 168, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(230,201,138,0.14)";
      ctx.fill();
      if (typeof ctx.translate === "function") ctx.translate(cx, cy);
      if (typeof ctx.scale === "function") ctx.scale(1.35, 1.35);
      ctx.lineCap = "round";
      ctx.strokeStyle = "#e6c98a";
      ctx.lineWidth = 12;
      ctx.beginPath();
      ctx.arc(-78, -28, 34, 0.7 * Math.PI, 1.55 * Math.PI);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(78, -28, 34, 1.45 * Math.PI, 0.3 * Math.PI);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-62, -78);
      curveTo(ctx, -70, -10, -28, 28);
      ctx.lineTo(28, 28);
      curveTo(ctx, 70, -10, 62, -78);
      curveTo(ctx, 0, -58, -62, -78);
      ctx.closePath();
      ctx.fillStyle = "#e6c98a";
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-40, -70);
      curveTo(ctx, -44, -16, -16, 16);
      ctx.lineTo(8, 16);
      curveTo(ctx, 18, -20, 10, -66);
      ctx.closePath();
      ctx.fillStyle = "rgba(255,244,210,0.45)";
      ctx.fill();
      ctx.beginPath();
      if (typeof ctx.ellipse === "function") ctx.ellipse(0, -78, 64, 14, 0, 0, Math.PI * 2);
      else ctx.arc(0, -78, 64, 0, Math.PI * 2);
      ctx.fillStyle = "#fff4d2";
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = "#b8893e";
      ctx.stroke();
      ctx.fillStyle = "#e6c98a";
      ctx.fillRect(-10, 28, 20, 36);
      ctx.beginPath();
      ctx.moveTo(-22, 26);
      ctx.lineTo(22, 26);
      ctx.lineTo(16, 36);
      ctx.lineTo(-16, 36);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-46, 64);
      ctx.lineTo(46, 64);
      ctx.lineTo(36, 82);
      ctx.lineTo(-36, 82);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#b8893e";
      ctx.fillRect(-54, 82, 108, 12);
    } finally {
      if (canSave) ctx.restore();
    }
  }

  function drawGlyphTitle(ctx, text, cx, cy, px) {
    var chars = String(text || "").split("");
    var gap = Math.round(px * 0.04);
    var advance = px + gap;
    var x = cx - ((chars.length * advance) - gap) / 2;
    var top = cy - px / 2;
    ctx.fillStyle = "#f8fbff";
    for (var i = 0; i < chars.length; i++) {
      var cmds = TITLE_GLYPHS[chars[i]];
      if (cmds && cmds.length) {
        ctx.beginPath();
        for (var c = 0; c < cmds.length; c++) {
          var cmd = cmds[c];
          var op = cmd[0];
          if (op === "M") ctx.moveTo(x + (cmd[1] / 2048) * px, top + ((2048 - cmd[2]) / 2048) * px);
          else if (op === "L") ctx.lineTo(x + (cmd[1] / 2048) * px, top + ((2048 - cmd[2]) / 2048) * px);
          else if (op === "Q") {
            curveTo(
              ctx,
              x + (cmd[1] / 2048) * px,
              top + ((2048 - cmd[2]) / 2048) * px,
              x + (cmd[3] / 2048) * px,
              top + ((2048 - cmd[4]) / 2048) * px
            );
          } else if (op === "Z") ctx.closePath();
        }
        ctx.fill();
      }
      x += advance;
    }
  }

  function drawDots(ctx, cx, cy, model) {
    var cap = model.goal || STREAK_GOAL;
    var streak = Math.max(0, model.streak || 0);
    var total = cap;
    var filled = Math.max(0, Math.min(cap, streak));
    /* Achievement dots count the streak. Empty slots would look like a 10-day gate. */
    if (model.showAchievement) {
      total = Math.max(1, Math.min(cap, streak || 1));
      filled = total;
    }
    var gap = 28;
    var start = cx - ((total - 1) * gap) / 2;
    for (var i = 0; i < total; i++) {
      ctx.beginPath();
      ctx.arc(start + i * gap, cy, 9, 0, Math.PI * 2);
      ctx.fillStyle = i < filled ? "#e6c98a" : "rgba(255,255,255,0.16)";
      ctx.fill();
    }
  }

  function paintLine(ctx, choice, text, weight, px, x, y, color, baseline) {
    if (!text) return;
    ctx.fillStyle = color;
    setFont(ctx, choice, weight, px);
    ctx.textAlign = "center";
    ctx.textBaseline = baseline || "top";
    ctx.fillText(text, x, y);
  }

  function paintHeadline(ctx, choice, text, px, x, y) {
    var glyphs = !!(choice && choice.ink === 0);
    if (!glyphs) {
      ctx.fillStyle = "#f8fbff";
      setFont(ctx, choice, 700, px);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      if (!fontApplied(ctx, px)) glyphs = true;
      else ctx.fillText(text, x, y);
    }
    if (glyphs) drawGlyphTitle(ctx, text, x, y, px);
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
        var glow = ctx.createRadialGradient(w / 2, h * 0.42, 20, w / 2, h * 0.46, 520);
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

      var choice = fontDecision(assets);
      var cx = w / 2;
      ctx.textAlign = "center";
      if (model.showAchievement) {
        paintLine(ctx, choice, model.brand || BRAND, 500, 34, cx, 168, "rgba(226,234,248,0.8)", "top");
        paintLine(ctx, choice, clip(model.learner || "学员", 18), 700, 36, cx, 222, "#e6c98a", "top");
        ctx.fillStyle = "#e6c98a";
        ctx.fillRect(cx - 36, 276, 72, 4);
        var mid = h / 2;
        drawTrophy(ctx, cx, mid - 120);
        var headline = model.cardTitle || ACHIEVEMENT_CARD_TITLE;
        paintHeadline(ctx, choice, headline, 96, cx, mid + 110);
        paintLine(ctx, choice, model.subtitle || "", 700, 42, cx, mid + 200, "#e6c98a", "middle");
        drawDots(ctx, cx, mid + 280, model);
        var foot = mid + 340;
        if (model.label) {
          paintLine(ctx, choice, clip(model.label, 28), 400, 30, cx, foot, "rgba(226,234,248,0.66)", "middle");
          foot += 48;
        }
        paintLine(ctx, choice, model.date || "", 500, 32, cx, Math.max(foot, h - 150), "rgba(226,234,248,0.78)", "middle");
        return true;
      }

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
          drawEmblem(ctx, cx, y + 54, choice);
          y += 132;
        }
      } else {
        drawEmblem(ctx, cx, y + 54, choice);
        y += 132;
      }

      paintLine(ctx, choice, model.brand || BRAND, 500, 34, cx, y, "rgba(226,234,248,0.8)", "top");
      y += 48;
      paintLine(ctx, choice, clip(model.learner || "学员", 18), 700, 36, cx, y, "#e6c98a", "top");
      y += 56;
      ctx.fillStyle = "#e6c98a";
      ctx.fillRect(cx - 36, y, 72, 4);
      y += 40;
      paintLine(ctx, choice, model.cardTitle || model.title || "", 700, 92, cx, y, "#f8fbff", "top");
      y += 118;
      paintLine(ctx, choice, model.subtitle || "", 700, 42, cx, y, "#e6c98a", "top");
      y += 78;
      drawDots(ctx, cx, y, model);
      y += 44;
      if (model.label) {
        paintLine(ctx, choice, clip(model.label, 28), 400, 30, cx, y, "rgba(226,234,248,0.66)", "top");
        y += 52;
      }
      paintLine(ctx, choice, model.date || "", 500, 32, cx, y, "rgba(226,234,248,0.78)", "top");
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
          setHint(PAINT_FAIL_HINT);
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
        setHint(PAINT_FAIL_HINT);
      }
    });
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
    ACHIEVEMENT_CARD_TITLE: ACHIEVEMENT_CARD_TITLE,
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

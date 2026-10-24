/* 聚光单词（grok） teacher board.
 * Cloud charts are the default. QMR1 paste stays behind a collapsed section.
 * Authorization is app_metadata.role === "teacher". user_metadata is ignored.
 */
(function (root) {
  "use strict";

  var TRACK_NAMES = {
    core: "原版核心",
    zhongkao: "中考",
    gaokao: "高考",
    ket: "KET",
    pet: "PET",
    cet4: "四级",
  };
  var PRACTICE_TYPES = {
    "vocab.answer_correct": true,
    "vocab.answer_wrong": true,
    "vocab.answer_unknown": true,
    "vocab.wrong_book_add": true,
  };
  var WEAK_EVENT_TYPES = {
    "vocab.answer_wrong": true,
    "vocab.wrong_book_add": true,
  };
  var EVENT_LABELS = {
    "vocab.answer_correct": "答对",
    "vocab.answer_wrong": "答错",
    "vocab.answer_unknown": "不会",
    "vocab.wrong_book_add": "错词本",
    "vocab.due_review": "到期信号",
  };
  var MASTERY_LABELS = ["0", "0.5", "1", "2", "3"];
  var DENIED_MESSAGE = "这个账号不是教师，不能打开班级看板。授权只认 app_metadata 里的 role=teacher，不认 user_metadata。";

  function num(v) {
    var n = Number(v);
    return isFinite(n) ? n : 0;
  }

  function asObject(v) {
    if (typeof v === "string") {
      try { v = JSON.parse(v); } catch (e) { return {}; }
    }
    if (!v || typeof v !== "object" || Array.isArray(v)) return {};
    return v;
  }

  function dayKey(value) {
    var d = value instanceof Date ? value : new Date(value);
    if (isNaN(d.getTime())) return "";
    var m = d.getMonth() + 1;
    var day = d.getDate();
    return d.getFullYear() + "-" + (m < 10 ? "0" : "") + m + "-" + (day < 10 ? "0" : "") + day;
  }

  function dayWindow(now, n) {
    var labels = [];
    var set = Object.create(null);
    var base = new Date(now);
    if (isNaN(base.getTime())) base = new Date();
    base.setHours(12, 0, 0, 0);
    var count = n || 7;
    for (var i = count - 1; i >= 0; i--) {
      var x = new Date(base);
      x.setDate(base.getDate() - i);
      var key = dayKey(x);
      labels.push(key);
      set[key] = labels.length - 1;
    }
    return { labels: labels, index: set };
  }

  function maskEmail(raw) {
    var s = String(raw == null ? "" : raw).trim();
    var at = s.indexOf("@");
    if (at <= 0) return "—";
    var local = s.slice(0, at);
    var host = s.slice(at + 1);
    if (!host) return "—";
    var stars = local.indexOf("***");
    if (stars !== -1) return local.slice(0, stars + 3) + "@" + host;
    var keep = local.length <= 1 ? 1 : 2;
    return local.slice(0, keep) + "***@" + host;
  }

  function learnerLabel(id, masked) {
    if (masked) return maskEmail(masked);
    var text = String(id || "");
    if (!text) return "学员";
    return "学员 " + text.slice(0, 8);
  }

  /** JWT app_metadata only. user_metadata.role must not authorize. */
  function isTeacher(user) {
    if (!user || typeof user !== "object") return false;
    var app = user.app_metadata;
    if (!app || typeof app !== "object") return false;
    return app.role === "teacher";
  }

  function spellingTouched(spell) {
    if (!spell || typeof spell !== "object") return false;
    if (num(spell.correct) + num(spell.wrong) + num(spell.unknown) > 0) return true;
    var typed = spell.typed;
    if (typed && num(typed.correct) + num(typed.wrong) + num(typed.unknown) > 0) return true;
    var mc = spell.mc;
    if (mc && num(mc.correct) + num(mc.wrong) + num(mc.unknown) > 0) return true;
    return false;
  }

  function spellingWrong(spell) {
    if (!spell || typeof spell !== "object") return 0;
    if (spell.wrong != null) return num(spell.wrong);
    if (spell.typed && spell.typed.wrong != null) return num(spell.typed.wrong);
    return 0;
  }

  function cardTouched(card) {
    if (!card || typeof card !== "object") return false;
    if (card.state === "learning" || card.state === "review") return true;
    if (num(card.reps) > 0 || num(card.correct) > 0 || num(card.wrong) > 0 || num(card.unknown) > 0 || num(card.mastery) > 0) return true;
    return spellingTouched(card.spelling);
  }

  /** 1 when the card is in review with an interval of at least one day, else 0.5 if touched. */
  function cardCredit(card) {
    if (!cardTouched(card)) return 0;
    if (card.state === "review" && num(card.interval) >= 1) return 1;
    return 0.5;
  }

  function isSolid(card) {
    return !!(card && card.state === "review" && num(card.interval) >= 1);
  }

  /** 已学会. Live saves often leave mastered null; those need mastery >= 3 as well. */
  function isLearned(card) {
    if (!isSolid(card)) return false;
    if (card.mastered === true) return true;
    if (card.mastered === false) return false;
    return num(card.mastery) >= 3;
  }

  function masteryBin(mastery) {
    var m = num(mastery);
    if (m >= 3) return 4;
    if (m >= 2) return 3;
    if (m >= 1) return 2;
    if (m >= 0.5) return 1;
    return 0;
  }

  function headwordFromKey(key) {
    var s = String(key || "");
    var i = s.lastIndexOf("::");
    var word = i >= 0 ? s.slice(i + 2) : s;
    return word.trim().toLowerCase();
  }

  function eventHeadword(ev) {
    if (!ev || typeof ev !== "object") return "";
    var payload = asObject(ev.payload);
    return String(ev.headword || payload.headword || payload.lemma || "").trim().toLowerCase();
  }

  function eventLearner(ev) {
    if (!ev) return "";
    return String(ev.learner_id || ev.user_id || "");
  }

  function modeLabel(ev) {
    var payload = asObject(ev && ev.payload);
    var dir = String(payload.task_direction || "");
    var detail = String(payload.task_direction_detail || "");
    if (dir === "recognition" || detail === "meaning") return "看英选义";
    if (dir === "production" || detail === "spelling" || detail === "form") return "看义产出";
    if (dir) return dir;
    var type = ev && ev.event_type;
    return EVENT_LABELS[type] || type || "其他";
  }

  function eventLabel(ev) {
    var type = ev && ev.event_type;
    return EVENT_LABELS[type] || type || "事件";
  }

  function trackLabel(id) {
    if (!id) return "—";
    return TRACK_NAMES[id] || String(id);
  }

  function profileOf(save) {
    var p = save.profile;
    if (!p || typeof p !== "object" || Array.isArray(p)) return { name: "", cls: "" };
    return {
      name: typeof p.name === "string" ? p.name.trim() : "",
      cls: typeof p.cls === "string" ? p.cls.trim() : "",
    };
  }

  function dailyAnswers(bucket) {
    if (!bucket || typeof bucket !== "object") return 0;
    return num(bucket.c) + num(bucket.w) + num(bucket.unk);
  }

  function blankWeak() {
    return { word: "", gloss: "", wrong: 0, events: 0, book: 0, students: Object.create(null) };
  }

  function touchWeak(map, word, studentId, extra) {
    word = String(word || "").trim().toLowerCase();
    if (!word) return;
    var row = map[word] || blankWeak();
    row.word = word;
    extra = extra || {};
    if (extra.wrong) row.wrong += extra.wrong;
    if (extra.events) row.events += extra.events;
    if (extra.book) row.book += extra.book;
    if (extra.gloss && !row.gloss) row.gloss = String(extra.gloss);
    if (studentId) row.students[studentId] = true;
    map[word] = row;
  }

  function weakScore(row) {
    var base = num(row.wrong) + num(row.events);
    return base > 0 ? base : num(row.book);
  }

  function weakList(map, studentId) {
    var out = [];
    var words = Object.keys(map);
    for (var i = 0; i < words.length; i++) {
      var row = map[words[i]];
      if (studentId && !row.students[studentId]) continue;
      var score = weakScore(row);
      if (score <= 0) continue;
      var who = Object.keys(row.students);
      out.push({
        word: row.word,
        gloss: row.gloss || "",
        score: score,
        students: studentId ? 1 : who.length,
      });
    }
    out.sort(function (a, b) {
      if (b.score !== a.score) return b.score - a.score;
      if (b.students !== a.students) return b.students - a.students;
      return a.word < b.word ? -1 : a.word > b.word ? 1 : 0;
    });
    return out;
  }

  function formatWhen(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso || "");
    var hh = d.getHours();
    var mm = d.getMinutes();
    return dayKey(d) + " " + (hh < 10 ? "0" : "") + hh + ":" + (mm < 10 ? "0" : "") + mm;
  }

  function shortDay(key) {
    return String(key || "").slice(5);
  }

  /**
   * progressRows: {user_id, save, updated_at}[]
   * events: learner_events rows
   * directory: {user_id, masked_email}[] (already masked; masked again on the client)
   */
  function buildBoard(progressRows, events, directory, now) {
    progressRows = progressRows || [];
    events = events || [];
    directory = directory || [];
    var window7 = dayWindow(now, 7);
    var maskedById = Object.create(null);
    for (var d = 0; d < directory.length; d++) {
      if (directory[d] && directory[d].user_id) maskedById[directory[d].user_id] = directory[d].masked_email;
    }

    var saves = Object.create(null);
    var order = [];
    function ensure(id) {
      if (!id || saves[id]) return;
      saves[id] = {
        id: id,
        save: {},
        updatedAt: "",
        events: [],
      };
      order.push(id);
    }
    for (var p = 0; p < progressRows.length; p++) {
      var row = progressRows[p] || {};
      var pid = String(row.user_id || "");
      if (!pid) continue;
      ensure(pid);
      saves[pid].save = asObject(row.save);
      saves[pid].updatedAt = row.updated_at || saves[pid].save.updatedAt || "";
    }
    for (var e = 0; e < events.length; e++) {
      var ev = events[e] || {};
      var lid = eventLearner(ev);
      if (!lid) continue;
      ensure(lid);
      saves[lid].events.push(ev);
    }

    var weakMap = Object.create(null);
    var masteryCounts = [0, 0, 0, 0, 0];
    var activity = [0, 0, 0, 0, 0, 0, 0];
    var modeMap = Object.create(null);
    var students = [];
    var masteryValues = [];
    var active7 = 0;

    for (var s = 0; s < order.length; s++) {
      var id = order[s];
      var pack = saves[id];
      var save = pack.save;
      var profile = profileOf(save);
      var cards = asObject(save.cards);
      var cardKeys = Object.keys(cards);
      var touched = 0;
      var credit = 0;
      var learned = 0;
      for (var c = 0; c < cardKeys.length; c++) {
        var card = cards[cardKeys[c]];
        if (!cardTouched(card)) continue;
        touched++;
        credit += cardCredit(card);
        if (isLearned(card)) learned++;
        masteryCounts[masteryBin(card.mastery)]++;
        var wrongs = num(card.wrong) + spellingWrong(card.spelling);
        if (wrongs > 0) {
          touchWeak(weakMap, headwordFromKey(cardKeys[c]), id, { wrong: wrongs });
        }
      }
      var book = asObject(save.wrongBook);
      var bookKeys = Object.keys(book);
      var bookActive = 0;
      for (var b = 0; b < bookKeys.length; b++) {
        var entry = book[bookKeys[b]];
        if (!entry || typeof entry !== "object" || entry.active !== true) continue;
        bookActive++;
        var lemma = entry.lemma ? String(entry.lemma).trim().toLowerCase() : headwordFromKey(bookKeys[b]);
        touchWeak(weakMap, lemma, id, { book: 1, gloss: entry.gloss_zh || "" });
      }

      var daily = asObject(save.daily);
      var daily7 = [];
      var dailyActive = false;
      for (var di = 0; di < window7.labels.length; di++) {
        var bucket = daily[window7.labels[di]];
        var answers = dailyAnswers(bucket);
        daily7.push(answers);
        if (answers > 0) dailyActive = true;
      }

      var event7 = [0, 0, 0, 0, 0, 0, 0];
      var eventActive = false;
      var timeline = [];
      var evs = pack.events.slice().sort(function (a, b) {
        var aa = String(a.created_at || "");
        var bb = String(b.created_at || "");
        return aa < bb ? 1 : aa > bb ? -1 : 0;
      });
      for (var ei = 0; ei < evs.length; ei++) {
        var one = evs[ei];
        var when = dayKey(one.created_at);
        var slot = window7.index[when];
        var type = one.event_type;
        if (slot != null) {
          eventActive = true;
          if (PRACTICE_TYPES[type]) {
            event7[slot]++;
            activity[slot]++;
          }
        }
        if (WEAK_EVENT_TYPES[type]) {
          var payload = asObject(one.payload);
          touchWeak(weakMap, eventHeadword(one), id, { events: 1, gloss: payload.gloss_zh || "" });
        }
        var mode = modeLabel(one);
        modeMap[mode] = (modeMap[mode] || 0) + 1;
        if (timeline.length < 12) {
          timeline.push({
            at: formatWhen(one.created_at),
            label: eventLabel(one),
            word: eventHeadword(one),
          });
        }
      }

      var mastery = touched ? Math.round((credit / touched) * 100) : null;
      if (mastery != null) masteryValues.push(mastery);
      var isActive = dailyActive || eventActive;
      if (isActive) active7++;
      var personal = sum(daily7) > 0 ? daily7 : event7;
      var studentWeak = weakList(weakMap, id);
      students.push({
        id: id,
        email: learnerLabel(id, maskedById[id]),
        name: profile.name,
        cls: profile.cls,
        track: typeof save.track === "string" ? save.track : "",
        trackLabel: trackLabel(save.track),
        touched: touched,
        learned: learned,
        mastery: mastery,
        streak: num(save.streak),
        bestStreak: num(save.bestStreak),
        points: num(save.points),
        bookActive: bookActive,
        weakCount: studentWeak.length,
        weak: studentWeak.slice(0, 8),
        active7: isActive,
        updatedAt: pack.updatedAt ? formatWhen(pack.updatedAt) : "",
        line: personal,
        lineSource: sum(daily7) > 0 ? "daily" : "events",
        lineLabels: window7.labels.map(shortDay),
        practice7: sum(event7),
        answers7: sum(daily7),
        timeline: timeline,
      });
    }

    students.sort(function (a, b) {
      var am = a.mastery == null ? -1 : a.mastery;
      var bm = b.mastery == null ? -1 : b.mastery;
      if (bm !== am) return bm - am;
      if (b.touched !== a.touched) return b.touched - a.touched;
      return a.email < b.email ? -1 : a.email > b.email ? 1 : 0;
    });

    var classWeak = weakList(weakMap).slice(0, 10);
    var modeLabels = Object.keys(modeMap);
    modeLabels.sort(function (a, b) { return modeMap[b] - modeMap[a] || (a < b ? -1 : 1); });
    var avg = masteryValues.length
      ? Math.round(masteryValues.reduce(function (a, b) { return a + b; }, 0) / masteryValues.length)
      : null;

    return {
      empty: order.length === 0,
      students: students,
      kpis: {
        students: students.length,
        active7: active7,
        mastery: avg,
        weak: weakList(weakMap).length,
      },
      mastery: { labels: MASTERY_LABELS.slice(), counts: masteryCounts },
      activity: { labels: window7.labels.map(shortDay), counts: activity },
      modes: {
        labels: modeLabels,
        counts: modeLabels.map(function (label) { return modeMap[label]; }),
      },
      weak: classWeak,
    };
  }

  function sum(list) {
    var n = 0;
    for (var i = 0; i < list.length; i++) n += num(list[i]);
    return n;
  }

  // ---- legacy QMR1 paste (collapsed; not the default board) ----
  function decodeReport(text) {
    var t = String(text || "").trim();
    if (!t) return null;
    if (t[0] === "{") return normalizeReport(JSON.parse(t));
    if (t.indexOf("QMR1.") !== 0) throw new Error("不是报告码（应以 QMR1. 开头）");
    t = t.slice(5).replace(/\s+/g, "");
    var json = typeof atob === "function"
      ? decodeURIComponent(escape(atob(t)))
      : Buffer.from(t, "base64").toString("utf8");
    return normalizeReport(JSON.parse(json));
  }

  function normalizeReport(r) {
    if (!r || r.v !== 1 || typeof r.tr !== "object") throw new Error("报告格式不正确");
    return r;
  }

  function parseMany(text) {
    var reports = [];
    var errors = [];
    var s = String(text || "").trim();
    if (!s) return { reports: reports, errors: errors };
    if (s[0] === "[") {
      try {
        var arr = JSON.parse(s);
        for (var i = 0; i < arr.length; i++) reports.push(normalizeReport(arr[i]));
      } catch (e) { errors.push(e.message); }
      return { reports: reports, errors: errors };
    }
    var parts = s[0] === "{" ? [s] : s.split(/\s+/);
    for (var p = 0; p < parts.length; p++) {
      if (!parts[p].trim()) continue;
      try { reports.push(decodeReport(parts[p])); } catch (err) { errors.push(err.message); }
    }
    return { reports: reports, errors: errors };
  }

  function mergeReports(existing, incoming) {
    var map = {};
    var list = existing.concat(incoming);
    var keys = [];
    for (var i = 0; i < list.length; i++) {
      var r = list[i];
      var k = (r.k || "") + "|" + (r.n || "");
      if (!map[k]) keys.push(k);
      if (!map[k] || String(r.at) > String(map[k].at)) map[k] = r;
    }
    var out = [];
    for (var j = 0; j < keys.length; j++) out.push(map[keys[j]]);
    return out;
  }

  function reportTotals(r) {
    var learned = 0;
    var total = 0;
    var cleared = 0;
    var clearedNames = [];
    var ids = Object.keys(r.tr || {});
    for (var i = 0; i < ids.length; i++) {
      var triple = r.tr[ids[i]];
      var l = triple[0];
      var t = triple[1];
      var c = triple[2] || [];
      learned += l;
      total += t;
      cleared += c.length;
      for (var n = 0; n < c.length; n++) clearedNames.push((TRACK_NAMES[ids[i]] || ids[i]) + c[n]);
    }
    return { learned: learned, total: total, cleared: cleared, clearedNames: clearedNames };
  }

  function classWeakReports(reports, limit) {
    var m = {};
    for (var i = 0; i < reports.length; i++) {
      var wk = reports[i].wk || [];
      for (var j = 0; j < wk.length; j++) {
        var w = wk[j][0];
        var zh = wk[j][1];
        var wrong = wk[j][2];
        var x = m[w] || { w: w, zh: zh, wrong: 0, students: 0 };
        x.wrong += wrong;
        x.students++;
        m[w] = x;
      }
    }
    var rows = [];
    var names = Object.keys(m);
    for (var k = 0; k < names.length; k++) rows.push(m[names[k]]);
    rows.sort(function (a, b) { return b.students - a.students || b.wrong - a.wrong; });
    return rows.slice(0, limit || 20);
  }

  var api = {
    DENIED_MESSAGE: DENIED_MESSAGE,
    maskEmail: maskEmail,
    isTeacher: isTeacher,
    cardTouched: cardTouched,
    cardCredit: cardCredit,
    isLearned: isLearned,
    buildBoard: buildBoard,
    modeLabel: modeLabel,
    dayKey: dayKey,
    decodeReport: decodeReport,
    parseMany: parseMany,
    merge: mergeReports,
    totals: reportTotals,
    classWeak: classWeakReports,
  };
  root.QMTeacher = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof document === "undefined") return;

  var $ = function (id) { return document.getElementById(id); };
  var charts = {};
  var board = null;
  var selectedId = "";
  var PALETTE = ["#8eb7ff", "#e6c98a", "#7ddec8", "#f0a0c0", "#c9b6ff", "#f3d37a", "#9fd0ff"];

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  function show(id, on) {
    var el = $(id);
    if (el) el.hidden = !on;
  }

  function setGate(text, bad) {
    var el = $("gate-msg");
    if (!el) return;
    el.hidden = !text;
    el.textContent = text || "";
    el.className = bad ? "is-bad" : "";
  }

  function destroyChart(id) {
    if (charts[id]) {
      charts[id].destroy();
      charts[id] = null;
    }
  }

  function showFallback(id, lines) {
    var el = $(id + "-fallback");
    if (!el) return;
    el.hidden = !lines;
    el.textContent = lines || "";
  }

  function mountChart(id, config, fallback) {
    var canvas = $(id);
    if (!canvas || !root.Chart) {
      destroyChart(id);
      showFallback(id, fallback);
      return;
    }
    showFallback(id, "");
    destroyChart(id);
    charts[id] = new root.Chart(canvas, config);
  }

  function axisColor() {
    return "#d5e2fb";
  }

  function baseScales() {
    return {
      x: { ticks: { color: axisColor() }, grid: { color: "rgba(190,214,255,.12)" } },
      y: { beginAtZero: true, ticks: { color: axisColor(), precision: 0 }, grid: { color: "rgba(190,214,255,.12)" } },
    };
  }

  function renderCharts(data) {
    if (!data) return;
    mountChart("chart-mastery", {
      type: "bar",
      data: {
        labels: data.mastery.labels,
        datasets: [{ label: "词条", data: data.mastery.counts, backgroundColor: "#8eb7ff", borderRadius: 6 }],
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: baseScales() },
    }, data.mastery.labels.map(function (label, i) { return label + "星 " + data.mastery.counts[i]; }).join("\n"));

    mountChart("chart-activity", {
      type: "line",
      data: {
        labels: data.activity.labels,
        datasets: [{
          label: "练习次数",
          data: data.activity.counts,
          borderColor: "#e6c98a",
          backgroundColor: "rgba(230,201,138,.18)",
          fill: true,
          tension: 0.3,
          pointRadius: 3,
        }],
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: baseScales() },
    }, data.activity.labels.map(function (label, i) { return label + " " + data.activity.counts[i]; }).join("\n"));

    var modeColors = data.modes.labels.map(function (_, i) { return PALETTE[i % PALETTE.length]; });
    if (data.modes.labels.length) {
      mountChart("chart-modes", {
        type: "doughnut",
        data: { labels: data.modes.labels, datasets: [{ data: data.modes.counts, backgroundColor: modeColors, borderWidth: 0 }] },
        options: { responsive: true, maintainAspectRatio: false, cutout: "62%", plugins: { legend: { position: "bottom", labels: { color: axisColor(), boxWidth: 12 } } } },
      }, data.modes.labels.map(function (label, i) { return label + " " + data.modes.counts[i]; }).join("\n"));
    } else {
      destroyChart("chart-modes");
      showFallback("chart-modes", "还没有学习事件");
    }

    if (data.weak.length) {
      mountChart("chart-weak", {
        type: "bar",
        data: {
          labels: data.weak.map(function (row) { return row.word; }),
          datasets: [{ label: "错次", data: data.weak.map(function (row) { return row.score; }), backgroundColor: "#7ddec8", borderRadius: 6 }],
        },
        options: {
          indexAxis: "y",
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: baseScales(),
        },
      }, data.weak.map(function (row) { return row.word + " " + row.score; }).join("\n"));
    } else {
      destroyChart("chart-weak");
      showFallback("chart-weak", "还没有薄弱词");
    }
  }

  function renderKpis(data) {
    $("kpi-students").textContent = String(data.kpis.students);
    $("kpi-active").textContent = String(data.kpis.active7);
    $("kpi-mastery").textContent = data.kpis.mastery == null ? "—" : String(data.kpis.mastery);
    $("kpi-weak").textContent = String(data.kpis.weak);
  }

  function renderTable(data) {
    var body = $("student-body");
    if (!body) return;
    body.innerHTML = data.students.map(function (st) {
      return "<tr data-id=\"" + esc(st.id) + "\"" + (st.id === selectedId ? " class=\"is-on\"" : "") + ">" +
        "<td>" + esc(st.email) + "</td>" +
        "<td>" + esc(st.name || "—") + "</td>" +
        "<td>" + esc(st.trackLabel) + "</td>" +
        "<td>" + st.touched + "</td>" +
        "<td>" + (st.mastery == null ? "—" : st.mastery) + "</td>" +
        "<td>" + st.learned + "</td>" +
        "<td>" + st.weakCount + "</td>" +
        "<td>" + (st.active7 ? "活跃" : "—") + "</td>" +
        "<td>" + esc(st.updatedAt || "—") + "</td></tr>";
    }).join("");
  }

  function renderDetail(st) {
    show("detail", !!st);
    if (!st) {
      destroyChart("chart-student");
      return;
    }
    $("detail-title").textContent = st.email + (st.name ? " · " + st.name : "");
    $("detail-progress").textContent =
      "词库 " + st.trackLabel +
      " · 积分 " + st.points +
      " · 连续打卡 " + st.streak +
      " · 最佳 " + st.bestStreak +
      " · 已接触 " + st.touched +
      " · 掌握 " + (st.mastery == null ? "—" : st.mastery + "%") +
      " · 已学会 " + st.learned +
      " · 错词本 " + st.bookActive +
      " · 近7日存档答题 " + st.answers7 +
      " · 近7日练习事件 " + st.practice7 +
      (st.cls ? " · 班级 " + st.cls : "");
    $("detail-line-hint").textContent = st.lineSource === "daily"
      ? "折线是存档 daily 的答题次数（答对 + 答错 + 不会）。"
      : "这份存档近 7 日没有 daily 答题，折线改用该学员的练习事件。";
    mountChart("chart-student", {
      type: "line",
      data: {
        labels: st.lineLabels,
        datasets: [{
          label: "次数",
          data: st.line,
          borderColor: "#8eb7ff",
          backgroundColor: "rgba(142,183,255,.18)",
          fill: true,
          tension: 0.3,
          pointRadius: 3,
        }],
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: baseScales() },
    }, st.lineLabels.map(function (label, i) { return label + " " + st.line[i]; }).join("\n"));
    $("student-weak").innerHTML = "<tr><th>单词</th><th>释义</th><th>信号</th></tr>" +
      (st.weak.length ? st.weak.map(function (row) {
        return "<tr><td>" + esc(row.word) + "</td><td>" + esc(row.gloss || "—") + "</td><td>" + row.score + "</td></tr>";
      }).join("") : "<tr><td colspan=\"3\">没有薄弱词</td></tr>");
    $("student-timeline").innerHTML = st.timeline.length
      ? st.timeline.map(function (row) {
        return "<li>" + esc(row.at) + " · " + esc(row.label) + (row.word ? " · " + esc(row.word) : "") + "</li>";
      }).join("")
      : "<li>还没有学习事件</li>";
  }

  function paint(data) {
    board = data;
    renderKpis(data);
    show("empty-state", data.empty);
    show("chart-grid", !data.empty);
    renderCharts(data);
    renderTable(data);
    var current = null;
    for (var i = 0; i < data.students.length; i++) {
      if (data.students[i].id === selectedId) current = data.students[i];
    }
    if (!current) selectedId = "";
    renderDetail(current);
  }

  async function fetchAll(client, table, columns, orderCol) {
    var size = 1000;
    var from = 0;
    var out = [];
    while (from < 20000) {
      var query = client.from(table).select(columns).range(from, from + size - 1);
      if (orderCol) query = query.order(orderCol, { ascending: true });
      var res = await query;
      if (res.error) throw res.error;
      var batch = res.data || [];
      for (var i = 0; i < batch.length; i++) out.push(batch[i]);
      if (batch.length < size) break;
      from += size;
    }
    return out;
  }

  async function loadClass(client, user) {
    if (!api.isTeacher(user)) {
      var denied = new Error(api.DENIED_MESSAGE);
      denied.code = "not_teacher";
      throw denied;
    }
    var progress = await fetchAll(client, "user_progress", "user_id,save,updated_at", "user_id");
    var events = await fetchAll(
      client,
      "learner_events",
      "learner_id,user_id,event_type,payload,created_at,headword",
      "created_at"
    );
    var directory = [];
    var note = "";
    var dir = await client.rpc("teacher_directory");
    if (dir.error) {
      note = "邮箱掩码目录还没生效。请在 Supabase SQL 编辑器运行 grok/supabase/teacher_read.sql，然后刷新。当前用学员编号代替邮箱。";
    } else {
      directory = dir.data || [];
    }
    var data = api.buildBoard(progress, events, directory, new Date());
    data.note = note;
    return data;
  }

  function humanAuthError(err) {
    var text = (err && err.message) || String(err || "");
    if (/invalid login credentials/i.test(text)) return "邮箱或密码不正确。";
    if (/email not confirmed/i.test(text)) return "邮箱还没确认。请先点邮件里的链接，再回到这个页面登录。";
    if (/invalid email/i.test(text)) return "邮箱格式不对。";
    if (/rate limit|too many/i.test(text)) return "尝试太频繁，请稍后再试。";
    return text || "登录失败。";
  }

  function clientOrNull() {
    var cloud = root.QuizMarioCloudClient;
    if (!cloud || !cloud.isConfigured() || !cloud.client()) return null;
    return cloud.client();
  }

  async function currentUser(client) {
    var sessionRes = await client.auth.getSession();
    var session = sessionRes && sessionRes.data && sessionRes.data.session;
    var user = session && session.user;
    if (!user) return null;
    if (api.isTeacher(user)) return user;
    try {
      var refreshed = await client.auth.refreshSession();
      var next = refreshed && refreshed.data && refreshed.data.session && refreshed.data.session.user;
      if (next) return next;
    } catch (e) {}
    return user;
  }

  function showLogin() {
    show("gate", true);
    show("board", false);
    show("login-form", true);
    show("btn-logout-gate", false);
    setGate("", false);
  }

  function showDenied() {
    show("gate", true);
    show("board", false);
    show("login-form", false);
    show("btn-logout-gate", true);
    setGate(api.DENIED_MESSAGE, true);
  }

  function showBoard(user) {
    show("gate", false);
    show("board", true);
    var who = $("who");
    if (who) who.textContent = maskEmail(user && user.email) ;
  }

  async function openBoard(client, user) {
    if (!api.isTeacher(user)) {
      showDenied();
      return;
    }
    showBoard(user);
    $("cloud-status").textContent = "正在读取云端进度…";
    try {
      var data = await loadClass(client, user);
      $("cloud-status").textContent = data.note || ("已更新 " + data.kpis.students + " 名学员");
      paint(data);
    } catch (err) {
      if (err && err.code === "not_teacher") {
        showDenied();
        return;
      }
      $("cloud-status").textContent = "读取失败。" + humanAuthError(err) + " 若只能看到自己的进度，请运行 grok/supabase/teacher_read.sql 后退出再登录。";
    }
  }

  async function boot() {
    var client = clientOrNull();
    if (!client) {
      showLogin();
      setGate("还不能登录：请确认 grok/config.js 已填写 SUPABASE_URL 和 SUPABASE_ANON_KEY。页面不会使用 service 密钥。", true);
      return;
    }
    var user = await currentUser(client);
    if (!user) showLogin();
    else await openBoard(client, user);
  }

  var login = $("login-form");
  if (login) {
    login.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var client = clientOrNull();
      if (!client) return;
      var email = $("email").value.trim();
      var password = $("password").value;
      setGate("正在登录…", false);
      client.auth.signInWithPassword({ email: email, password: password }).then(function (res) {
        if (res.error) throw res.error;
        return currentUser(client);
      }).then(function (user) {
        return openBoard(client, user);
      }).catch(function (err) {
        setGate(humanAuthError(err), true);
      });
    });
  }

  async function logout() {
    var client = clientOrNull();
    if (client) {
      try { await client.auth.signOut(); } catch (e) {}
    }
    selectedId = "";
    board = null;
    showLogin();
  }

  var out = $("btn-logout");
  if (out) out.addEventListener("click", logout);
  var outGate = $("btn-logout-gate");
  if (outGate) outGate.addEventListener("click", logout);
  var refresh = $("btn-refresh");
  if (refresh) {
    refresh.addEventListener("click", function () {
      var client = clientOrNull();
      if (!client) return;
      currentUser(client).then(function (user) { return openBoard(client, user); });
    });
  }
  var body = $("student-body");
  if (body) {
    body.addEventListener("click", function (ev) {
      var tr = ev.target.closest ? ev.target.closest("tr[data-id]") : null;
      if (!tr || !board) return;
      selectedId = tr.getAttribute("data-id");
      renderTable(board);
      var st = null;
      for (var i = 0; i < board.students.length; i++) {
        if (board.students[i].id === selectedId) st = board.students[i];
      }
      renderDetail(st);
      var panel = $("detail");
      if (panel && panel.scrollIntoView) panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  }
  var back = $("btn-detail-back");
  if (back) {
    back.addEventListener("click", function () {
      selectedId = "";
      if (board) renderTable(board);
      renderDetail(null);
    });
  }

  bindLegacy();
  boot().catch(function (err) {
    setGate(humanAuthError(err), true);
  });

  function bindLegacy() {
    if (!$("btn-parse") || !$("codes")) return;
    var KEY = "vocabSpotlight_teacher_v1";
    var all = [];
    try { all = JSON.parse(localStorage.getItem(KEY) || "[]"); } catch (e) { all = []; }
    function filtered() {
      var c = $("cls").value;
      return all.filter(function (r) { return !c || r.k === c; });
    }
    function renderLegacy() {
      try { localStorage.setItem(KEY, JSON.stringify(all)); } catch (e) {}
      var classes = [];
      var seen = {};
      for (var i = 0; i < all.length; i++) {
        if (!seen[all[i].k]) { seen[all[i].k] = true; classes.push(all[i].k); }
      }
      classes.sort();
      var cur = $("cls").value;
      $("cls").innerHTML = '<option value="">全部</option>' + classes.map(function (c) {
        return "<option" + (c === cur ? " selected" : "") + ">" + esc(c) + "</option>";
      }).join("");
      var rs = filtered();
      $("legacy-summary").innerHTML = "<div><b>" + rs.length + "</b>旧报告</div>";
      var rows = rs.map(function (r) { return { r: r, t: reportTotals(r) }; });
      rows.sort(function (a, b) { return b.t.learned - a.t.learned; });
      $("legacy-tbl").innerHTML = "<tr><th>姓名</th><th>班级</th><th>已学会</th><th>易错词</th><th>报告时间</th></tr>" +
        rows.map(function (item) {
          var r = item.r;
          var t = item.t;
          return "<tr><td>" + esc(r.n) + "</td><td>" + esc(r.k) + "</td><td>" + t.learned + "</td><td>" +
            esc((r.wk || []).slice(0, 5).map(function (x) { return x[0]; }).join(", ")) + "</td><td>" +
            esc(String(r.at).slice(0, 16).replace("T", " ")) + "</td></tr>";
        }).join("");
      $("legacy-weak").innerHTML = "<tr><th>单词</th><th>中文</th><th>出错学生数</th><th>总错次</th></tr>" +
        classWeakReports(rs, 20).map(function (x) {
          return "<tr><td>" + esc(x.w) + "</td><td>" + esc(x.zh) + "</td><td>" + x.students + "</td><td>" + x.wrong + "</td></tr>";
        }).join("");
    }
    function ingest(text) {
      var parsed = parseMany(text);
      all = mergeReports(all, parsed.reports);
      $("legacy-status").textContent = "导入 " + parsed.reports.length + " 份" +
        (parsed.errors.length ? "，" + parsed.errors.length + " 份无法识别" : "") +
        "。当前 " + all.length + " 名学生。";
      renderLegacy();
    }
    $("btn-parse").onclick = function () { ingest($("codes").value); $("codes").value = ""; };
    $("btn-file").onclick = function () { $("file").click(); };
    $("file").onchange = function (e) {
      var files = e.target.files;
      function readOne(file) {
        var rd = new FileReader();
        rd.onload = function () { ingest(String(rd.result)); };
        rd.readAsText(file);
      }
      for (var i = 0; i < files.length; i++) readOne(files[i]);
      e.target.value = "";
    };
    $("cls").onchange = renderLegacy;
    $("btn-clear").onclick = function () {
      if (confirm("清空本机保存的全部旧报告？")) { all = []; renderLegacy(); }
    };
    $("btn-csv").onclick = function () {
      var lines = ["班级码,姓名,已学会"];
      var rs = filtered();
      for (var i = 0; i < rs.length; i++) {
        lines.push([rs[i].k, rs[i].n, reportTotals(rs[i]).learned].join(","));
      }
      var blob = new Blob(["\ufeff" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "legacy-report.csv";
      document.body.appendChild(a);
      a.click();
      a.remove();
    };
    renderLegacy();
  }
})(typeof window !== "undefined" ? window : globalThis);

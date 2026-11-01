/* Teacher board UI. Pure metrics live in study-metrics.js.
 * This file boots only on teacher.html (#board). It does not run on the student home.
 */
(function (root) {
  "use strict";

  var api = root.QMTeacherCore || null;
  if (!api && typeof require === "function") api = require("./study-metrics.js");
  if (!api) throw new Error("study-metrics.js did not load");
  root.QMTeacher = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof document === "undefined") return;
  if (!document.getElementById("board")) return;

  var maskEmail = api.maskEmail;
  var parseMany = api.parseMany;
  var mergeReports = api.merge;
  var reportTotals = api.totals;
  var classWeakReports = api.classWeak;

  var $ = function (id) { return document.getElementById(id); };
  var charts = {};
  var board = null;
  var selectedId = "";
  /** null = every class. "" = 未填班级. */
  var selectedClass = null;
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

  function chartBoxWidth(id) {
    var canvas = $(id);
    var box = canvas && canvas.parentNode;
    return box ? box.clientWidth : 0;
  }

  function resizeCharts() {
    var ids = Object.keys(charts);
    for (var i = 0; i < ids.length; i++) {
      if (charts[ids[i]] && charts[ids[i]].resize) {
        try { charts[ids[i]].resize(); } catch (e) {}
      }
    }
  }

  /** Defer one frame when the panel was hidden, so Chart.js does not lock in a 0-width canvas. */
  function mountChart(id, config, fallback, attempt) {
    attempt = attempt || 0;
    var canvas = $(id);
    if (!canvas || !root.Chart) {
      destroyChart(id);
      showFallback(id, fallback);
      return;
    }
    if (chartBoxWidth(id) === 0 && attempt < 4 && root.requestAnimationFrame) {
      root.requestAnimationFrame(function () { mountChart(id, config, fallback, attempt + 1); });
      return;
    }
    showFallback(id, "");
    destroyChart(id);
    try {
      charts[id] = new root.Chart(canvas, config);
    } catch (err) {
      destroyChart(id);
      showFallback(id, fallback);
    }
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

    var duration = data.duration || { labels: [], counts: [] };
    mountChart("chart-duration", {
      type: "line",
      data: {
        labels: duration.labels,
        datasets: [{
          label: "学习分钟",
          data: duration.counts,
          borderColor: "#7ddec8",
          backgroundColor: "rgba(125,222,200,.18)",
          fill: true,
          tension: 0.3,
          pointRadius: 3,
        }],
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: baseScales() },
    }, (duration.labels || []).map(function (label, i) { return label + " " + duration.counts[i] + "分钟"; }).join("\n"));

    var forget = data.forget || { labels: [], counts: [] };
    mountChart("chart-forget", {
      type: "bar",
      data: {
        labels: forget.labels,
        datasets: [{
          label: "词条",
          data: forget.counts,
          backgroundColor: ["#c9842e", "#c45b7a", "#8eb7ff", "#7ddec8"],
          borderRadius: 6,
        }],
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: baseScales() },
    }, (forget.labels || []).map(function (label, i) { return label + " " + forget.counts[i]; }).join("\n"));
  }

  function renderKpis(data) {
    $("kpi-students").textContent = String(data.kpis.students);
    $("kpi-active").textContent = String(data.kpis.active7);
    $("kpi-mastery").textContent = data.kpis.mastery == null ? "—" : String(data.kpis.mastery);
    $("kpi-weak").textContent = String(data.kpis.weak);
  }

  function optionValueForClass(key) {
    return key ? key : "__none__";
  }

  function classKeyFromOption(value) {
    if (!value || value === "*") return null;
    if (value === "__none__") return "";
    return value;
  }

  function visibleGroups(data) {
    var groups = (data && data.groups) || api.groupStudents((data && data.students) || []);
    if (selectedClass === null) return groups;
    var picked = [];
    for (var i = 0; i < groups.length; i++) {
      if (groups[i].key === selectedClass) picked.push(groups[i]);
    }
    return picked;
  }

  function renderClassSelect(data) {
    var sel = $("board-class");
    if (!sel) return;
    var groups = (data && data.groups) || [];
    var html = '<option value="*">全部班级</option>';
    var alive = selectedClass === null;
    for (var i = 0; i < groups.length; i++) {
      var group = groups[i];
      if (group.key === selectedClass) alive = true;
      html += '<option value="' + esc(optionValueForClass(group.key)) + '">' +
        esc(group.label) + "（" + group.students.length + "）</option>";
    }
    if (!alive) selectedClass = null;
    sel.innerHTML = html;
    sel.value = selectedClass === null ? "*" : optionValueForClass(selectedClass);
  }

  function studentRows(list) {
    return list.map(function (st) {
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

  function renderTable(data) {
    var body = $("student-body");
    if (!body) return;
    var groups = visibleGroups(data);
    if (!groups.length) {
      body.innerHTML = "<tr class=\"class-row\"><td colspan=\"9\">这个班级还没有学员。</td></tr>";
      return;
    }
    body.innerHTML = groups.map(function (group) {
      var note = group.key ? "" : " · 学生可在学习首页改班级名";
      return "<tr class=\"class-row\"><td colspan=\"9\"><strong>" + esc(group.label) + "</strong> · " +
        group.students.length + " 人" + esc(note) +
        "<button type=\"button\" class=\"ghost\" data-export-class=\"" + esc(optionValueForClass(group.key)) + "\">下载该班学情</button></td></tr>" +
        studentRows(group.students);
    }).join("");
  }

  function abilityLegend(st) {
    var el = $("ability-legend");
    if (!el) return;
    var axes = (st && st.abilities) || [];
    el.innerHTML = axes.map(function (axis) {
      var thin = axis.score == null;
      var text = thin ? "样本不足" : axis.score + "分";
      return "<span" + (thin ? " class=\"is-thin\"" : "") + ">" + esc(axis.label) + " " + text + "</span>";
    }).join("");
  }

  function renderRadar(st, spec) {
    var axes = (st && st.abilities) || [];
    spec = spec || { data: [], thin: [], labels: [] };
    var fallback = axes.map(function (axis) {
      return axis.label + " " + (axis.score == null ? "样本不足" : axis.score);
    }).join("\n");
    var allThin = spec.thin.length > 0;
    for (var t = 0; t < spec.thin.length; t++) if (!spec.thin[t]) allThin = false;
    mountChart(spec.id || "chart-radar", {
      type: "radar",
      data: {
        labels: spec.labels,
        datasets: [{
          label: "学情",
          data: spec.data,
          borderColor: "#8eb7ff",
          backgroundColor: "rgba(142,183,255,.22)",
          pointBackgroundColor: "#e6c98a",
          pointRadius: 4,
          spanGaps: false,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: function (ctx) {
                var axis = axes[ctx.dataIndex];
                if (!axis || axis.score == null) return "样本不足";
                return axis.score + "分";
              },
            },
          },
        },
        scales: {
          r: {
            min: 0,
            max: 100,
            ticks: { display: false, stepSize: 25 },
            grid: { color: allThin ? "rgba(139,147,167,.35)" : "rgba(190,214,255,.2)" },
            angleLines: { color: allThin ? "rgba(139,147,167,.9)" : "rgba(190,214,255,.28)", lineWidth: allThin ? 2 : 1 },
            pointLabels: {
              color: function (ctx) {
                var i = ctx && ctx.index != null ? ctx.index : 0;
                return spec.thin[i] ? "#8b93a7" : "#d5e2fb";
              },
              font: { size: 13 },
            },
          },
        },
      },
    }, fallback);
  }

  var personalEmptyPlugin = {
    id: "personalEmpty",
    afterDraw: function (chart) {
      var msg = chart.options && chart.options.plugins && chart.options.plugins.personalEmpty;
      if (!msg) return;
      var area = chart.chartArea || { left: 0, right: chart.width, top: 0, bottom: chart.height };
      var ctx = chart.ctx;
      ctx.save();
      ctx.fillStyle = "#d5e2fb";
      ctx.font = "13px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(msg, (area.left + area.right) / 2, (area.top + area.bottom) / 2);
      ctx.restore();
    },
  };

  function statChip(label, value) {
    return "<span><b>" + esc(value) + "</b>" + esc(label) + "</span>";
  }

  function clearStudentCharts() {
    destroyChart("chart-student");
    destroyChart("chart-radar");
    destroyChart("chart-student-mastery");
    destroyChart("chart-student-modes");
    destroyChart("chart-student-accuracy");
    destroyChart("chart-student-duration");
    destroyChart("chart-student-forget");
  }

  function renderDetail(st) {
    if (document.body) document.body.classList.toggle("student-open", !!st);
    show("detail", !!st);
    if (!st) {
      clearStudentCharts();
      var legend = $("ability-legend");
      if (legend) legend.innerHTML = "";
      var cleared = $("detail-stats");
      if (cleared) cleared.innerHTML = "";
      var clearedLists = $("student-inventory");
      if (clearedLists) clearedLists.innerHTML = "";
      if (root.requestAnimationFrame) root.requestAnimationFrame(resizeCharts);
      return;
    }
    var specs = api.studentChartSpecs(st);
    $("detail-title").textContent = (st.name ? st.name + " · " : "") + st.email;
    var summary = $("detail-summary");
    if (summary) summary.textContent = st.summary || "";
    var stats = $("detail-stats");
    if (stats) {
      stats.innerHTML = [
        statChip("词库", st.trackLabel || "—"),
        statChip("已接触", st.touched),
        statChip("掌握", st.mastery == null ? "—" : st.mastery + "%"),
        statChip("已学会", st.learned),
        statChip("近7日答题", st.answers7),
        statChip("近7日分钟", st.minutes7 == null ? "—" : st.minutes7),
        statChip("逾期", st.forget ? st.forget.overdue : 0),
        statChip("薄弱词", st.weakCount),
      ].join("");
    }
    abilityLegend(st);
    $("detail-progress").textContent =
      (st.cls ? "班级 " + st.cls + " · " : "") +
      "积分 " + st.points +
      " · 连续打卡 " + st.streak +
      " · 最佳 " + st.bestStreak +
      " · 错词本 " + st.bookActive +
      " · 近7日练习事件 " + st.practice7 +
      (st.forget ? " · 今日到期 " + st.forget.due + " · 学习中 " + st.forget.learning + " · 已巩固 " + st.forget.solid : "");
    var lineHint = $("detail-line-hint");
    if (lineHint) {
      lineHint.textContent = specs.activity.eventData
        ? "实线是存档 daily 的答题次数（答对 + 答错 + 不会）。虚线是练习事件。两套数字不相加。"
        : (st.lineSource === "daily"
          ? "折线是存档 daily 的答题次数（答对 + 答错 + 不会）。"
          : "这份存档近 7 日没有 daily 答题，折线改用该学员的练习事件。");
    }
    renderRadar(st, specs.radar);
    if (!specs.mastery.empty) {
      mountChart(specs.mastery.id, {
        type: "bar",
        data: {
          labels: specs.mastery.labels,
          datasets: [{ label: "词条", data: specs.mastery.data, backgroundColor: "#7ddec8", borderRadius: 6 }],
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: baseScales() },
      }, specs.mastery.labels.map(function (label, i) { return label + "星 " + specs.mastery.data[i]; }).join("\n"));
    } else {
      destroyChart(specs.mastery.id);
      showFallback(specs.mastery.id, "还没有已接触的词");
    }
    var activitySets = [{
      label: st.lineSource === "daily" ? "答题" : "练习",
      data: specs.activity.data,
      borderColor: "#8eb7ff",
      backgroundColor: "rgba(142,183,255,.18)",
      fill: !specs.activity.eventData,
      tension: 0.3,
      pointRadius: 3,
    }];
    if (specs.activity.eventData) {
      activitySets.push({
        label: "练习事件",
        data: specs.activity.eventData,
        borderColor: "#e6c98a",
        backgroundColor: "transparent",
        fill: false,
        borderDash: [5, 4],
        tension: 0.3,
        pointRadius: 3,
      });
    }
    mountChart(specs.activity.id, {
      type: "line",
      data: { labels: specs.activity.labels, datasets: activitySets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: !!specs.activity.eventData, labels: { color: axisColor(), boxWidth: 12 } } },
        scales: baseScales(),
      },
    }, specs.activity.labels.map(function (label, i) { return label + " " + specs.activity.data[i]; }).join("\n"));
    mountChart(specs.duration.id, {
      type: "line",
      data: {
        labels: specs.duration.labels,
        datasets: [{
          label: "学习分钟",
          data: specs.duration.data,
          borderColor: "#7ddec8",
          backgroundColor: "rgba(125,222,200,.16)",
          fill: true,
          tension: 0.3,
          pointRadius: 3,
        }],
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: baseScales() },
    }, specs.duration.labels.map(function (label, i) { return label + " " + specs.duration.data[i] + "分钟"; }).join("\n"));
    mountChart(specs.forget.id, {
      type: "bar",
      data: {
        labels: specs.forget.labels,
        datasets: [{
          label: "词条",
          data: specs.forget.data,
          backgroundColor: ["#c9842e", "#c45b7a", "#8eb7ff", "#7ddec8"],
          borderRadius: 6,
        }],
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: baseScales() },
    }, specs.forget.labels.map(function (label, i) { return label + " " + specs.forget.data[i]; }).join("\n"));
    var modesHint = $("detail-modes-hint");
    if (modesHint) {
      modesHint.textContent = st.modes && st.modes.basis === "practice"
        ? "事件里没有题型，这张图用存档里的练习次数。到期信号不计入，也不和事件相加。"
        : "只统计该学员的答题。到期信号不计入。没有答题就不编造占比。";
    }
    var modeColors = specs.modes.labels.map(function (_, i) { return PALETTE[i % PALETTE.length]; });
    var modeNote = specs.modes.empty ? "暂无答题，不编造占比" : "";
    mountChart(specs.modes.id, {
      type: "doughnut",
      data: {
        labels: specs.modes.labels,
        datasets: [{ data: specs.modes.data, backgroundColor: modeColors, borderWidth: 0 }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: "62%",
        plugins: {
          legend: { display: !specs.modes.empty, position: "bottom", labels: { color: axisColor(), boxWidth: 12 } },
          personalEmpty: modeNote,
        },
      },
      plugins: [personalEmptyPlugin],
    }, specs.modes.labels.length
      ? specs.modes.labels.map(function (label, i) { return label + " " + specs.modes.data[i]; }).join("\n")
      : modeNote);
    var accuracyHint = $("detail-accuracy-hint");
    if (accuracyHint && specs.accuracy.empty) {
      accuracyHint.textContent = "近 7 日没有一天达到 " + api.MIN_SAMPLE + " 次答题。坐标还在，缺口不是 0 分。";
    }
    mountChart(specs.accuracy.id, {
      type: "line",
      data: {
        labels: specs.accuracy.labels,
        datasets: [{
          label: "正确率",
          data: specs.accuracy.data,
          borderColor: "#e6c98a",
          backgroundColor: "rgba(230,201,138,.16)",
          fill: false,
          tension: 0.25,
          spanGaps: false,
          pointRadius: function (ctx) { return ctx.raw == null ? 0 : 4; },
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          personalEmpty: specs.accuracy.empty ? "样本不足，不画成 0" : "",
          tooltip: {
            callbacks: {
              label: function (ctx) {
                if (ctx.raw == null) return "样本不足";
                return ctx.raw + "分";
              },
            },
          },
        },
        scales: {
          x: { ticks: { color: axisColor() }, grid: { color: "rgba(190,214,255,.12)" } },
          y: { min: 0, max: 100, ticks: { color: axisColor(), stepSize: 25 }, grid: { color: "rgba(190,214,255,.12)" } },
        },
      },
      plugins: [personalEmptyPlugin],
    }, specs.accuracy.labels.map(function (label, i) {
      var score = specs.accuracy.data[i];
      return label + " " + (score == null ? "样本不足" : score);
    }).join("\n"));
    var inventoryHost = $("student-inventory");
    if (inventoryHost) {
      inventoryHost.innerHTML = api.inventoryListsHtml(st.inventory || {
        practiced: [],
        learned: [],
        weak: st.weak || [],
      });
    }
    $("student-timeline").innerHTML = st.timeline.length
      ? st.timeline.map(function (row) {
        return "<li>" + esc(row.at) + " · " + esc(row.label) + (row.word ? " · " + esc(row.word) : "") + "</li>";
      }).join("")
      : "<li>还没有学习事件</li>";
  }

  function paint(data) {
    board = data;
    renderClassSelect(data);
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
      note = "邮箱掩码目录还没生效。请在 Supabase SQL 编辑器运行本目录 supabase/teacher_read.sql，然后刷新。当前用学员编号代替邮箱。";
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
      $("cloud-status").textContent = "读取失败。" + humanAuthError(err) + " 若只能看到自己的进度，请运行本目录 supabase/teacher_read.sql 后退出再登录。";
    }
  }

  async function boot() {
    var client = clientOrNull();
    if (!client) {
      showLogin();
      setGate("还不能登录：请确认本目录 config.js 已填写 SUPABASE_URL 和 SUPABASE_ANON_KEY。页面不会使用 service 密钥。", true);
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
    selectedClass = null;
    board = null;
    showLogin();
  }

  function downloadClass(key) {
    var status = $("cloud-status");
    if (!board) {
      if (status) status.textContent = "还没有可下载的班级数据。请先刷新。";
      return;
    }
    try {
      var pack = api.classPack(board, key, new Date());
      if (!pack.count) {
        if (status) status.textContent = "这个班级还没有学员，没有打包。";
        return;
      }
      var blob = new Blob([pack.bytes], { type: "application/zip" });
      var link = document.createElement("a");
      var url = URL.createObjectURL(blob);
      link.href = url;
      link.download = pack.filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
      if (status) {
        status.textContent = "已下载「" + pack.label + "」图文报告（" + pack.count +
          " 名学员）。请解压后先打开「请先打开学员报告.html」，或打开「学员」文件夹里的网页给家长看。每页都有图表和简短评价。附表里的汇总表不是主报告。";
      }
    } catch (err) {
      if (status) status.textContent = "下载失败。请再试一次。";
    }
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
  var exportClass = $("btn-export-class");
  if (exportClass) {
    exportClass.addEventListener("click", function () {
      var status = $("cloud-status");
      if (!board) {
        if (status) status.textContent = "还没有可下载的班级数据。请先刷新。";
        return;
      }
      if (selectedClass !== null) {
        downloadClass(selectedClass);
        return;
      }
      var groups = board.groups || [];
      if (groups.length === 1) {
        downloadClass(groups[0].key);
        return;
      }
      if (status) {
        status.textContent = "一次只打包一个班级。请先在名单上方选定班级，或点该班的「下载该班学情」。";
      }
    });
  }
  var classSelect = $("board-class");
  if (classSelect) {
    classSelect.addEventListener("change", function () {
      selectedClass = classKeyFromOption(classSelect.value);
      if (board) renderTable(board);
      if (selectedClass === null || !board) return;
      var still = false;
      var students = board.students || [];
      for (var i = 0; i < students.length; i++) {
        if (students[i].id === selectedId && api.classKeyOf(students[i]) === selectedClass) still = true;
      }
      if (!still) {
        selectedId = "";
        renderDetail(null);
      }
    });
  }
  var body = $("student-body");
  if (body) {
    body.addEventListener("click", function (ev) {
      var exportBtn = ev.target.closest ? ev.target.closest("[data-export-class]") : null;
      if (exportBtn) {
        ev.preventDefault();
        downloadClass(classKeyFromOption(exportBtn.getAttribute("data-export-class")));
        return;
      }
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
      if (panel && panel.scrollIntoView) panel.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }
  var detailPanel = $("detail");
  if (detailPanel) {
    detailPanel.addEventListener("click", function (ev) {
      var btn = ev.target && ev.target.closest ? ev.target.closest("[data-own-more]") : null;
      if (!btn) return;
      var section = btn.closest(".own-bucket");
      if (!section) return;
      section.classList.add("is-open");
      btn.hidden = true;
    });
  }
  var back = $("btn-detail-back");
  if (back) {
    back.addEventListener("click", function () {
      selectedId = "";
      if (board) renderTable(board);
      renderDetail(null);
      var roster = $("roster");
      if (roster && roster.scrollIntoView) roster.scrollIntoView({ behavior: "smooth", block: "start" });
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

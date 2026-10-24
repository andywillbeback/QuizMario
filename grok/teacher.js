/* Vocab Spotlight teacher dashboard — fully static; parses QMR1 report codes. */
(function (root) {
  "use strict";
  const TRACK_NAMES = { core: "原版核心", zhongkao: "中考核心", ket: "KET", pet: "PET", cet4: "四级" };

  function decodeReport(text) {
    let t = String(text || "").trim();
    if (!t) return null;
    if (t[0] === "{") return normalize(JSON.parse(t));
    if (!t.startsWith("QMR1.")) throw new Error("不是报告码（应以 QMR1. 开头）");
    t = t.slice(5).replace(/\s+/g, "");
    const json = typeof atob === "function"
      ? decodeURIComponent(escape(atob(t)))
      : Buffer.from(t, "base64").toString("utf8");
    return normalize(JSON.parse(json));
  }

  function normalize(r) {
    if (!r || r.v !== 1 || typeof r.tr !== "object") throw new Error("报告格式不正确");
    return r;
  }

  /** Accepts a blob of text: one code per line, or a JSON array/object. Returns {reports, errors}. */
  function parseMany(text) {
    const reports = [], errors = [];
    const s = String(text || "").trim();
    if (!s) return { reports, errors };
    if (s[0] === "[") {
      try { for (const r of JSON.parse(s)) reports.push(normalize(r)); } catch (e) { errors.push(e.message); }
      return { reports, errors };
    }
    const parts = s[0] === "{" ? [s] : s.split(/\s+/);
    for (const p of parts) {
      if (!p.trim()) continue;
      try { reports.push(decodeReport(p)); } catch (e) { errors.push(e.message); }
    }
    return { reports, errors };
  }

  /** Keep the newest report per class+name. */
  function merge(existing, incoming) {
    const map = new Map();
    for (const r of existing.concat(incoming)) {
      const k = (r.k || "") + "|" + (r.n || "");
      const old = map.get(k);
      if (!old || String(r.at) > String(old.at)) map.set(k, r);
    }
    return Array.from(map.values());
  }

  function totals(r) {
    let learned = 0, total = 0, cleared = 0;
    const clearedNames = [];
    for (const id of Object.keys(r.tr)) {
      const [l, t, c] = r.tr[id];
      learned += l; total += t; cleared += (c || []).length;
      for (const n of c || []) clearedNames.push((TRACK_NAMES[id] || id) + n);
    }
    return { learned, total, cleared, clearedNames };
  }

  function classWeak(reports, limit) {
    const m = new Map();
    for (const r of reports) for (const [w, zh, wrong] of r.wk || []) {
      const x = m.get(w) || { w, zh, wrong: 0, students: 0 };
      x.wrong += wrong; x.students++; m.set(w, x);
    }
    return Array.from(m.values()).sort((a, b) => b.students - a.students || b.wrong - a.wrong).slice(0, limit || 20);
  }

  const pct = (x) => (x == null ? "" : Math.round(x * 100) + "%");
  const csvCell = (v) => { const s = String(v == null ? "" : v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };

  function toCsv(reports) {
    const ids = Array.from(new Set(reports.flatMap((r) => Object.keys(r.tr))));
    const head = ["班级码", "姓名", "报告时间", "连续打卡天数", "学习天数", "累计答题", "总正确率", "近7天正确率", "近7天复习保持率", "已学会词数", "通关组数", "已通关组"]
      .concat(ids.map((id) => (TRACK_NAMES[id] || id) + "已学会/总数"), ["易错词"]);
    const rows = reports.map((r) => {
      const t = totals(r);
      return [r.k, r.n, r.at, r.s, r.ad, r.a, pct(r.acc), pct(r.a7), pct(r.r7), t.learned, t.cleared, t.clearedNames.join(" ")]
        .concat(ids.map((id) => r.tr[id] ? r.tr[id][0] + "/" + r.tr[id][1] : ""), [(r.wk || []).slice(0, 8).map((x) => x[0]).join(" ")]);
    });
    return "\ufeff" + [head].concat(rows).map((row) => row.map(csvCell).join(",")).join("\n");
  }

  const api = { decodeReport, parseMany, merge, totals, classWeak, toCsv };
  root.QMTeacher = api;
  if (typeof module !== "undefined") module.exports = api;
  if (typeof document === "undefined" || !document.getElementById("codes")) return;

  // ---- UI ----
  const $ = (id) => document.getElementById(id);
  const KEY = "vocabSpotlight_teacher_v1";
  let all = [];
  try { all = JSON.parse(localStorage.getItem(KEY) || "[]"); } catch (_) {}
  let sortKey = "learned";
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  function filtered() { const c = $("cls").value; return all.filter((r) => !c || r.k === c); }

  function render() {
    localStorage.setItem(KEY, JSON.stringify(all));
    const classes = Array.from(new Set(all.map((r) => r.k))).sort();
    const cur = $("cls").value;
    $("cls").innerHTML = '<option value="">全部</option>' + classes.map((c) => '<option' + (c === cur ? " selected" : "") + ">" + esc(c) + "</option>").join("");
    const rs = filtered();
    const avg = (f) => { const v = rs.map(f).filter((x) => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
    const active7 = rs.filter((r) => (r.d || []).some((d) => (Date.now() - new Date(d[0] + "T12:00:00").getTime()) < 7 * 864e5)).length;
    $("summary").innerHTML =
      "<div><b>" + rs.length + "</b>学生数</div>" +
      "<div><b>" + active7 + "</b>近7天活跃</div>" +
      "<div><b>" + Math.round(avg((r) => totals(r).learned) || 0) + "</b>人均已学会词</div>" +
      "<div><b>" + (pct(avg((r) => r.a7)) || "—") + "</b>平均近7天正确率</div>" +
      "<div><b>" + (pct(avg((r) => r.r7)) || "—") + "</b>平均复习保持率</div>" +
      "<div><b>" + (avg((r) => r.s) || 0).toFixed(1) + "</b>平均连续打卡</div>";
    const rows = rs.map((r) => ({ r, t: totals(r) }));
    const keyFn = { learned: (x) => -x.t.learned, name: (x) => x.r.n, a7: (x) => -(x.r.a7 || 0), s: (x) => -(x.r.s || 0), cleared: (x) => -x.t.cleared };
    rows.sort((a, b) => { const fa = keyFn[sortKey](a), fb = keyFn[sortKey](b); return fa < fb ? -1 : fa > fb ? 1 : 0; });
    const maxL = Math.max(1, ...rows.map((x) => x.t.learned));
    $("tbl").innerHTML = '<tr><th data-k="name">姓名</th><th>班级</th><th data-k="learned">已学会</th><th data-k="cleared">已通关组</th><th data-k="a7">近7天正确率</th><th>保持率</th><th data-k="s">连续打卡</th><th>易错词</th><th>报告时间</th></tr>' +
      rows.map(({ r, t }) => "<tr><td>" + esc(r.n) + "</td><td>" + esc(r.k) + "</td><td>" + t.learned + ' <span class="bar" style="width:' + Math.round(60 * t.learned / maxL) + 'px"></span></td><td>' + esc(t.clearedNames.join(" ") || "—") +
        "</td><td>" + (pct(r.a7) || "—") + "</td><td>" + (pct(r.r7) || "—") + "</td><td>" + (r.s || 0) + "</td><td>" + esc((r.wk || []).slice(0, 5).map((x) => x[0]).join(", ")) + "</td><td>" + esc(String(r.at).slice(0, 16).replace("T", " ")) + "</td></tr>").join("");
    for (const th of $("tbl").querySelectorAll("th[data-k]")) th.onclick = () => { sortKey = th.dataset.k; render(); };
    $("weak").innerHTML = "<tr><th>单词</th><th>中文</th><th>出错学生数</th><th>总错次</th></tr>" +
      classWeak(rs, 20).map((x) => "<tr><td>" + esc(x.w) + "</td><td>" + esc(x.zh) + "</td><td>" + x.students + "</td><td>" + x.wrong + "</td></tr>").join("");
  }

  function ingest(text) {
    const { reports, errors } = parseMany(text);
    all = merge(all, reports);
    $("status").textContent = "导入 " + reports.length + " 份" + (errors.length ? "，" + errors.length + " 份无法识别" : "") + "。当前共 " + all.length + " 名学生（同名同班保留最新一份）。";
    render();
  }

  $("btn-parse").onclick = () => { ingest($("codes").value); $("codes").value = ""; };
  $("btn-file").onclick = () => $("file").click();
  $("file").onchange = (e) => {
    for (const f of e.target.files) { const rd = new FileReader(); rd.onload = () => ingest(String(rd.result)); rd.readAsText(f); }
    e.target.value = "";
  };
  $("cls").onchange = render;
  $("btn-clear").onclick = () => { if (confirm("清空本机保存的全部学生报告？")) { all = []; render(); } };
  $("btn-csv").onclick = () => {
    const blob = new Blob([toCsv(filtered())], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "class-report-" + ($("cls").value || "all") + "-" + new Date().toISOString().slice(0, 10) + ".csv";
    document.body.appendChild(a); a.click(); a.remove();
  };
  render();
})(typeof window !== "undefined" ? window : globalThis);

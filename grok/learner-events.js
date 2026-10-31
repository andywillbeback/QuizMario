/* QuizMario → ALS learner_events.
 * Signals only. SM-2 / Anki-lite clocks stay in srs-rules.js.
 * Local outbox (quizmario_learner_events_v1) is the JSONL export.
 * Logged-in inserts go to Supabase public.learner_events
 * (see supabase/learner_events.sql and supabase/learner_events_evidence.sql).
 * The upsert sends only DB_COLUMNS. evidence_kind, independent, and
 * task_direction are optional top-level columns and are always copied into
 * payload. The browser uses the anon key through QuizMarioCloudClient.
 * A failed insert must not affect user_progress sync.
 *
 * Also require()-able from node tests. Browser storage attaches when document exists.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.QuizMarioLearnerEvents = api;
  if (root && root.document) api.installBrowser(root);
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  var SOURCE = "quizmario";
  var STORAGE_KEY = "quizmario_learner_events_v1";
  var MAX_EVENTS = 800;
  var TYPES = {
    CORRECT: "vocab.answer_correct",
    WRONG: "vocab.answer_wrong",
    UNKNOWN: "vocab.answer_unknown",
    DUE: "vocab.due_review",
    WRONG_BOOK: "vocab.wrong_book_add",
    SESSION_START: "session.start",
    SESSION_END: "session.end",
  };
  var EPOCH_DUE = "1970-01-01T00:00:00.000Z";
  var EVIDENCE_KIND = {
    typed_spelling: true,
    mc_recognition: true,
    mc_production: true,
  };
  /** Top-level columns public.learner_events accepts.
   *  Keep this list aligned with supabase/learner_events.sql.
   *  Unknown keys must not be upserted: PostgREST returns PGRST204. */
  var DB_COLUMNS = [
    "event_id", "learner_id", "user_id", "source", "event_type",
    "payload", "created_at", "item_id", "headword", "frame_id",
    "cefr_level", "run_purpose",
    "evidence_kind", "independent", "task_direction",
  ];
  var REMOTE_COLUMNS = DB_COLUMNS.join(",");

  /** Copy typed-spelling evidence onto the event and its payload. false is stored. */
  function applyEvidence(ev, input) {
    if (!ev || !input) return ev;
    if (!ev.payload || typeof ev.payload !== "object") ev.payload = {};
    var kind = input.evidence_kind != null ? String(input.evidence_kind).trim() : "";
    if (EVIDENCE_KIND[kind]) {
      ev.evidence_kind = kind;
      ev.payload.evidence_kind = kind;
    }
    if (input.independent === true || input.independent === false) {
      ev.independent = input.independent;
      ev.payload.independent = input.independent;
    }
    if (input.task_direction) {
      var dir = String(input.task_direction);
      ev.task_direction = dir;
      ev.payload.task_direction = dir;
    }
    return ev;
  }

  function emptyStore() {
    return { v: 1, learner_id: "", events: [], uploaded: {} };
  }

  function newId() {
    var c = typeof crypto !== "undefined" ? crypto : null;
    if (c && typeof c.randomUUID === "function") return c.randomUUID();
    var hex = "";
    for (var i = 0; i < 32; i++) hex += Math.floor(Math.random() * 16).toString(16);
    return hex.slice(0, 8) + "-" + hex.slice(8, 12) + "-4" + hex.slice(13, 16) +
      "-a" + hex.slice(17, 20) + "-" + hex.slice(20, 32);
  }

  function headwordOf(word) {
    return String(word || "").trim().toLowerCase();
  }

  function cefrForTrack(track) {
    if (track === "ket") return "A2";
    if (track === "pet") return "B1";
    return "";
  }

  function normalizeIso(value) {
    if (!value) return "";
    var d = new Date(value);
    if (isNaN(d.getTime())) return String(value);
    return d.toISOString();
  }

  /** Card due is epoch ms. Missing / non-absolute dues collapse to a stable sentinel. */
  function dueAtIso(ms) {
    var n = Number(ms);
    if (!n || !isFinite(n) || n < 1e11) return EPOCH_DUE;
    return new Date(n).toISOString();
  }

  function buildEvent(input, nowIso) {
    input = input || {};
    var type = input.event_type;
    var head = headwordOf(input.headword || input.word || input.lemma);
    var learner = input.learner_id || input.user_id || "";
    var created = normalizeIso(input.created_at || nowIso || new Date().toISOString());
    var payload = {};
    if (head) payload.headword = head;
    if (input.track) payload.track = String(input.track);
    var gloss = input.gloss_zh != null ? String(input.gloss_zh).trim() : "";
    if (gloss) payload.gloss_zh = gloss;
    if (type === TYPES.DUE) payload.due_at = normalizeIso(input.due_at) || dueAtIso(input.due_ms != null ? input.due_ms : input.dueAt) || created;
    if (type === TYPES.WRONG && input.answer) payload.answer = String(input.answer).trim();
    if (input.outcome && type !== TYPES.DUE && type !== TYPES.SESSION_START && type !== TYPES.SESSION_END) {
      payload.outcome = String(input.outcome);
    }
    if (type === TYPES.SESSION_START && input.started_at) {
      payload.started_at = normalizeIso(input.started_at) || String(input.started_at);
    }
    if (type === TYPES.SESSION_END) {
      var durMs = Number(input.duration_ms);
      if (!isFinite(durMs) || durMs < 0) durMs = 0;
      if (!durMs && input.duration_sec != null) {
        var sec = Number(input.duration_sec);
        if (isFinite(sec) && sec > 0) durMs = sec * 1000;
      }
      if (durMs > 0) {
        payload.duration_ms = Math.round(durMs);
        payload.duration_sec = Math.round(durMs / 1000);
      }
      if (input.started_at) payload.started_at = normalizeIso(input.started_at) || String(input.started_at);
      if (input.ended_at) payload.ended_at = normalizeIso(input.ended_at) || String(input.ended_at);
      if (input.end_reason) payload.end_reason = String(input.end_reason);
    }
    var ev = {
      event_id: input.event_id || newId(),
      learner_id: learner,
      user_id: input.user_id || learner,
      source: SOURCE,
      event_type: type,
      created_at: created,
      payload: payload,
    };
    var item = input.item_id || input.key || input.cardKey || "";
    if (item) ev.item_id = String(item);
    if (head) ev.headword = head;
    var cefr = input.cefr_level || cefrForTrack(input.track);
    if (cefr) ev.cefr_level = cefr;
    applyEvidence(ev, input);
    return ev;
  }

  function dueDedupeKey(ev) {
    if (!ev || ev.event_type !== TYPES.DUE) return "";
    var payload = ev.payload || {};
    return [
      TYPES.DUE,
      ev.item_id || "",
      ev.headword || "",
      payload.track || "",
      payload.due_at || "",
    ].join("|");
  }

  function sortEvents(events) {
    return events.sort(function (a, b) {
      if (a.created_at < b.created_at) return -1;
      if (a.created_at > b.created_at) return 1;
      return String(a.event_id).localeCompare(String(b.event_id));
    });
  }

  function trim(store) {
    sortEvents(store.events);
    if (store.events.length <= MAX_EVENTS) return store;
    var removed = store.events.splice(0, store.events.length - MAX_EVENTS);
    var uploaded = store.uploaded || {};
    for (var i = 0; i < removed.length; i++) delete uploaded[removed[i].event_id];
    store.uploaded = uploaded;
    return store;
  }

  function append(store, event) {
    store = store || emptyStore();
    if (!store.events) store.events = [];
    if (!store.uploaded) store.uploaded = {};
    var key = dueDedupeKey(event);
    if (key) {
      for (var i = 0; i < store.events.length; i++) {
        if (dueDedupeKey(store.events[i]) === key) {
          return { store: store, event: store.events[i], duplicate: true };
        }
      }
    }
    store.events.push(event);
    trim(store);
    return { store: store, event: event, duplicate: false };
  }

  /** Fill blank ids. Never rewrite an event that already belongs to someone. */
  function stampLearner(store, learnerId) {
    if (!store || !learnerId) return 0;
    store.learner_id = learnerId;
    var n = 0;
    var events = store.events || [];
    for (var i = 0; i < events.length; i++) {
      if (!events[i].learner_id) {
        events[i].learner_id = learnerId;
        events[i].user_id = learnerId;
        n++;
      }
    }
    return n;
  }

  /** Drop another account's rows so a shared browser cannot upload them. */
  function retainLearner(store, learnerId) {
    if (!store || !learnerId) return store;
    var keep = [];
    var events = store.events || [];
    for (var i = 0; i < events.length; i++) {
      if (!events[i].learner_id || events[i].learner_id === learnerId) keep.push(events[i]);
    }
    store.events = keep;
    var uploaded = {};
    var prev = store.uploaded || {};
    for (var k = 0; k < keep.length; k++) {
      if (prev[keep[k].event_id]) uploaded[keep[k].event_id] = true;
    }
    store.uploaded = uploaded;
    store.learner_id = learnerId;
    return store;
  }

  function copyPayload(src) {
    var payload = {};
    if (!src || typeof src !== "object" || Array.isArray(src)) return payload;
    var keys = Object.keys(src);
    for (var i = 0; i < keys.length; i++) payload[keys[i]] = src[keys[i]];
    return payload;
  }

  function hasValue(value) {
    return value != null && value !== "";
  }

  /** Prefer the event field, then payload. false is a real independent flag. */
  function evidenceOf(ev, key) {
    var top = ev ? ev[key] : undefined;
    if (top === false || hasValue(top)) return top;
    var payload = ev && ev.payload;
    if (payload && (payload[key] === false || hasValue(payload[key]))) return payload[key];
    return undefined;
  }

  function pickDbColumns(row) {
    var out = {};
    if (!row) return out;
    for (var i = 0; i < DB_COLUMNS.length; i++) {
      var key = DB_COLUMNS[i];
      if (Object.prototype.hasOwnProperty.call(row, key)) out[key] = row[key];
    }
    return out;
  }

  function publicEvent(ev) {
    ev = ev || {};
    var payload = copyPayload(ev.payload);
    var kind = evidenceOf(ev, "evidence_kind");
    var independent = evidenceOf(ev, "independent");
    var direction = evidenceOf(ev, "task_direction");
    if (hasValue(kind)) payload.evidence_kind = kind;
    if (independent === true || independent === false) payload.independent = independent;
    if (hasValue(direction)) payload.task_direction = direction;
    var out = {
      event_id: ev.event_id,
      learner_id: ev.learner_id || "",
      user_id: ev.user_id || ev.learner_id || "",
      source: SOURCE,
      event_type: ev.event_type,
      created_at: normalizeIso(ev.created_at) || ev.created_at,
      payload: payload,
    };
    if (ev.item_id) out.item_id = ev.item_id;
    if (ev.headword) out.headword = ev.headword;
    if (ev.frame_id) out.frame_id = ev.frame_id;
    if (ev.cefr_level) out.cefr_level = ev.cefr_level;
    if (ev.run_purpose) out.run_purpose = ev.run_purpose;
    if (hasValue(kind)) out.evidence_kind = kind;
    if (independent === true || independent === false) out.independent = independent;
    if (hasValue(direction)) out.task_direction = direction;
    return pickDbColumns(out);
  }

  function toJsonl(events) {
    var list = (events || []).slice();
    sortEvents(list);
    var lines = [];
    for (var i = 0; i < list.length; i++) lines.push(JSON.stringify(publicEvent(list[i])));
    return lines.length ? lines.join("\n") + "\n" : "";
  }

  /** Rows still to insert. Only DB_COLUMNS, so an unknown field cannot 400 the flush. */
  function pendingRows(store) {
    var learner = store && store.learner_id;
    var uploaded = (store && store.uploaded) || {};
    var events = (store && store.events) || [];
    var rows = [];
    for (var i = 0; i < events.length; i++) {
      var ev = events[i];
      if (!ev.learner_id || (learner && ev.learner_id !== learner)) continue;
      if (uploaded[ev.event_id]) continue;
      if (ev.source && ev.source !== SOURCE) continue;
      rows.push(pickDbColumns(publicEvent(ev)));
    }
    return rows;
  }

  function markUploaded(store, ids) {
    store.uploaded = store.uploaded || {};
    var list = ids || [];
    for (var i = 0; i < list.length; i++) store.uploaded[list[i]] = true;
    return store;
  }

  function countUploaded(store) {
    var uploaded = (store && store.uploaded) || {};
    var events = (store && store.events) || [];
    var n = 0;
    for (var i = 0; i < events.length; i++) if (uploaded[events[i].event_id]) n++;
    return n;
  }

  function fromRemote(row) {
    if (!row || !row.event_id || !row.event_type) return null;
    if (row.source && row.source !== SOURCE) return null;
    var payload = row.payload;
    if (typeof payload === "string") {
      try { payload = JSON.parse(payload); } catch (_) { payload = {}; }
    }
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) payload = {};
    var ev = {
      event_id: String(row.event_id),
      learner_id: row.learner_id || "",
      user_id: row.user_id || row.learner_id || "",
      source: SOURCE,
      event_type: row.event_type,
      created_at: row.created_at,
      payload: payload,
    };
    if (row.item_id) ev.item_id = String(row.item_id);
    if (row.headword) ev.headword = headwordOf(row.headword);
    else if (payload.headword) ev.headword = headwordOf(payload.headword);
    if (row.frame_id) ev.frame_id = String(row.frame_id);
    if (row.cefr_level) ev.cefr_level = String(row.cefr_level);
    if (row.run_purpose) ev.run_purpose = String(row.run_purpose);
    applyEvidence(ev, {
      evidence_kind: row.evidence_kind || payload.evidence_kind,
      independent: row.independent === true || row.independent === false ? row.independent : payload.independent,
      task_direction: row.task_direction || payload.task_direction,
    });
    return ev;
  }

  function mergeRemote(store, rows) {
    store = store || emptyStore();
    var seen = {};
    var events = store.events || [];
    for (var i = 0; i < events.length; i++) seen[events[i].event_id] = true;
    var list = rows || [];
    var added = 0;
    for (var r = 0; r < list.length; r++) {
      var ev = fromRemote(list[r]);
      if (!ev || seen[ev.event_id]) {
        if (ev) markUploaded(store, [ev.event_id]);
        continue;
      }
      var res = append(store, ev);
      if (!res.duplicate) {
        seen[ev.event_id] = true;
        added++;
      } else if (res.event && res.event.event_id && res.event.event_id !== ev.event_id) {
        markUploaded(store, [res.event.event_id]);
      }
      markUploaded(store, [ev.event_id]);
    }
    return { store: store, added: added };
  }

  function classifyCloudError(err) {
    var msg = (err && err.message) || String(err || "");
    if (/learner_events|schema cache|does not exist|42P01|PGRST205|PGRST204/i.test(msg)) return "missing";
    return "error";
  }

  function installBrowser(root) {
    var memory = null;
    var flushTimer = null;
    var flushChain = Promise.resolve();
    var cloudState = "";
    var cloudBlocked = "";
    var warned = false;
    var pulled = false;
    var DEBOUNCE_MS = 800;

    function load() {
      if (memory) return memory;
      try {
        var raw = root.localStorage && root.localStorage.getItem(STORAGE_KEY);
        if (raw) memory = JSON.parse(raw);
      } catch (_) {}
      if (!memory || !Array.isArray(memory.events)) memory = emptyStore();
      if (!memory.uploaded) memory.uploaded = {};
      return memory;
    }

    function persistStore() {
      try {
        if (root.localStorage) root.localStorage.setItem(STORAGE_KEY, JSON.stringify(load()));
      } catch (e) {
        if (root.console && console.warn) console.warn("QuizMario learner_events local", e);
      }
    }

    function $(id) { return root.document.getElementById(id); }

    function cloudMode() {
      var clientApi = root.QuizMarioCloudClient;
      var cloud = root.QuizMarioCloud;
      var configured = clientApi && typeof clientApi.isConfigured === "function" && clientApi.isConfigured() && clientApi.client && clientApi.client();
      var logged = cloud && typeof cloud.loggedIn === "function" && cloud.loggedIn();
      if (!configured) return "unconfigured";
      if (!logged) return "logged_out";
      return "session";
    }

    function statusText() {
      var store = load();
      var n = store.events.length;
      var up = countUploaded(store);
      var mode = cloudMode();
      if (!n) {
        return "还没有学习信号。答对、答错、进入错词本，或首页算出今日到期之后，可以下载 JSONL。间隔重复仍由本机计算。";
      }
      var base = "本机 " + n + " 条学习信号（source=quizmario）";
      if (mode === "session" && cloudState === "ok" && up > 0) {
        return base + "，其中 " + up + " 条已写入 Supabase learner_events。ALS 不会自动收到这些行：下载 JSONL 交给 ingest，或等 ALS 自己来读这张表。";
      }
      if (mode === "session" && cloudState === "missing") {
        return base + "。Supabase 还没有 learner_events 表，请在 SQL 编辑器运行 supabase/learner_events.sql。JSONL 可以下载。";
      }
      if (mode === "session" && cloudState === "error") {
        return base + "。写入 Supabase 失败，JSONL 仍可下载。";
      }
      if (mode === "logged_out") {
        return base + "。登录后才会写入 Supabase。JSONL 可以下载。";
      }
      return base + "。JSONL 可以下载，交给 ALS 的 ingest_learner_events.py。";
    }

    function refreshStatus() {
      var el = $("learner-events-status");
      if (el) el.textContent = statusText();
    }

    function setNote(text) {
      var el = $("learner-events-note");
      if (!el) return;
      el.hidden = !text;
      el.textContent = text || "";
    }

    function withIdentity(input) {
      var store = load();
      input = Object.assign({}, input || {});
      if (!input.learner_id && store.learner_id) {
        input.learner_id = store.learner_id;
        input.user_id = store.learner_id;
      }
      if (!input.cefr_level) input.cefr_level = cefrForTrack(input.track);
      return input;
    }

    function remember(inputs) {
      var store = load();
      var added = [];
      var list = inputs || [];
      for (var i = 0; i < list.length; i++) {
        var ev = buildEvent(withIdentity(list[i]));
        var res = append(store, ev);
        if (!res.duplicate) added.push(res.event);
      }
      if (added.length) persistStore();
      refreshStatus();
      if (added.length) scheduleFlush();
      return { added: added, events: exportEvents() };
    }

    function exportEvents() {
      var store = load();
      var learner = store.learner_id;
      var out = [];
      for (var i = 0; i < store.events.length; i++) {
        var ev = store.events[i];
        if (learner && ev.learner_id && ev.learner_id !== learner) continue;
        out.push(ev);
      }
      return out;
    }

    function noteFailure(err) {
      var kind = classifyCloudError(err);
      cloudState = kind;
      if (kind === "missing") cloudBlocked = "missing";
      if (!warned && root.console && console.warn) {
        warned = true;
        console.warn("QuizMario learner_events", err);
      }
      refreshStatus();
    }

    function clientOrNull() {
      var clientApi = root.QuizMarioCloudClient;
      if (!clientApi || typeof clientApi.client !== "function") return null;
      try { return clientApi.client(); } catch (_) { return null; }
    }

    async function pullOnce() {
      if (pulled) return;
      var client = clientOrNull();
      var store = load();
      if (!client || !store.learner_id) return;
      pulled = true;
      var res = await client.from("learner_events")
        .select(REMOTE_COLUMNS)
        .eq("learner_id", store.learner_id)
        .eq("source", SOURCE)
        .order("created_at", { ascending: false })
        .limit(MAX_EVENTS);
      if (res.error) throw res.error;
      mergeRemote(store, res.data || []);
      persistStore();
      refreshStatus();
    }

    async function flushOnce() {
      var client = clientOrNull();
      var store = load();
      if (!client || !store.learner_id || cloudMode() !== "session") {
        refreshStatus();
        return;
      }
      var rows = pendingRows(store);
      if (rows.length) {
        var res = await client.from("learner_events").upsert(rows, {
          onConflict: "event_id",
          ignoreDuplicates: true,
        });
        if (res.error) throw res.error;
        var ids = [];
        for (var i = 0; i < rows.length; i++) ids.push(rows[i].event_id);
        markUploaded(store, ids);
        persistStore();
        cloudState = "ok";
        cloudBlocked = "";
        warned = false;
      } else if (cloudState !== "missing" && cloudState !== "error") {
        cloudState = "ok";
      }
      try {
        await pullOnce();
      } catch (pullErr) {
        if (!warned && root.console && console.warn) {
          warned = true;
          console.warn("QuizMario learner_events pull", pullErr);
        }
      }
      refreshStatus();
    }

    function enqueueFlush() {
      flushChain = flushChain.then(flushOnce).catch(noteFailure);
      return flushChain;
    }

    function scheduleFlush() {
      if (cloudBlocked === "missing") return;
      if (flushTimer) clearTimeout(flushTimer);
      flushTimer = setTimeout(function () {
        flushTimer = null;
        enqueueFlush();
      }, DEBOUNCE_MS);
    }

    function flush() {
      if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = null;
      }
      cloudBlocked = "";
      return enqueueFlush();
    }

    function bindUser(user) {
      var id = user && (user.id || user.user_id);
      if (!id) return Promise.resolve();
      var store = load();
      retainLearner(store, id);
      stampLearner(store, id);
      persistStore();
      cloudBlocked = "";
      pulled = false;
      refreshStatus();
      return flush();
    }

    function clear() {
      memory = emptyStore();
      pulled = false;
      cloudState = "";
      try { if (root.localStorage) root.localStorage.removeItem(STORAGE_KEY); } catch (_) {}
      refreshStatus();
      setNote("");
    }

    function download() {
      var events = exportEvents();
      if (!events.length) {
        setNote("还没有学习信号，没有文件可下。");
        return "";
      }
      var body = toJsonl(events);
      try {
        var blob = new Blob([body], { type: "application/x-ndjson" });
        var a = root.document.createElement("a");
        var stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
        a.href = URL.createObjectURL(blob);
        a.download = "quizmario-learner-events-" + stamp + ".jsonl";
        root.document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
        setNote("已下载 JSONL。放到 ALS 的 data/learner_events_inbox/ 再跑 ingest。这不是 ALS 已入库。");
      } catch (e) {
        setNote("下载失败：" + ((e && e.message) || e));
      }
      flush();
      return body;
    }

    function copyJsonl() {
      var events = exportEvents();
      if (!events.length) {
        setNote("还没有学习信号，没有内容可复制。");
        return Promise.resolve("");
      }
      var body = toJsonl(events);
      var clip = root.navigator && root.navigator.clipboard;
      if (clip && typeof clip.writeText === "function") {
        return clip.writeText(body).then(function () {
          setNote("JSONL 已复制。粘到 ALS 的 data/learner_events_inbox/ 再跑 ingest。这不是 ALS 已入库。");
          return body;
        }, function () {
          setNote("复制失败，请改用下载。");
          return body;
        });
      }
      setNote("这个浏览器不能写入剪贴板，请改用下载。");
      return Promise.resolve(body);
    }

    var exportBtn = $("btn-export-learner-events");
    if (exportBtn) exportBtn.addEventListener("click", download);
    var copyBtn = $("btn-copy-learner-events");
    if (copyBtn) copyBtn.addEventListener("click", function () { copyJsonl(); });

    root.document.addEventListener("visibilitychange", function () {
      if (root.document.visibilityState === "hidden") flush();
    });
    root.addEventListener("pagehide", function () { flush(); });

    refreshStatus();

    api.record = function (input) { return remember([input]); };
    api.recordDue = function (items) {
      var inputs = [];
      var list = items || [];
      for (var i = 0; i < list.length; i++) {
        var it = list[i] || {};
        inputs.push({
          event_type: TYPES.DUE,
          headword: it.headword || it.word,
          item_id: it.item_id || it.key,
          track: it.track,
          gloss_zh: it.gloss_zh || it.meaning_zh || "",
          due_at: it.due_at,
          due_ms: it.due_ms != null ? it.due_ms : it.dueAt,
          cefr_level: it.cefr_level,
        });
      }
      return remember(inputs);
    };
    api.bindUser = bindUser;
    api.flush = flush;
    api.clear = clear;
    api.list = function () { return exportEvents().map(publicEvent); };
    api.toJsonl = function () { return toJsonl(exportEvents()); };
    api.download = download;
    api.copyJsonl = copyJsonl;
    api._load = load;
  }

  var api = {
    SOURCE: SOURCE,
    STORAGE_KEY: STORAGE_KEY,
    MAX_EVENTS: MAX_EVENTS,
    TYPES: TYPES,
    EPOCH_DUE: EPOCH_DUE,
    emptyStore: emptyStore,
    newId: newId,
    headwordOf: headwordOf,
    cefrForTrack: cefrForTrack,
    dueAtIso: dueAtIso,
    EVIDENCE_KIND: EVIDENCE_KIND,
    applyEvidence: applyEvidence,
    buildEvent: buildEvent,
    dueDedupeKey: dueDedupeKey,
    append: append,
    stampLearner: stampLearner,
    retainLearner: retainLearner,
    DB_COLUMNS: DB_COLUMNS,
    publicEvent: publicEvent,
    toJsonl: toJsonl,
    pendingRows: pendingRows,
    markUploaded: markUploaded,
    countUploaded: countUploaded,
    fromRemote: fromRemote,
    mergeRemote: mergeRemote,
    classifyCloudError: classifyCloudError,
    installBrowser: installBrowser,
  };
  return api;
});

/* QuizMario → ALS learner_events.
 * Signals only. SM-2 / Anki-lite clocks stay in srs-rules.js.
 * Local outbox (quizmario_learner_events_v1) is the JSONL export.
 * Logged-in inserts go to Supabase public.learner_events (see supabase/learner_events.sql).
 * A failed insert must not affect user_progress sync.
 *
 * Schema v2 adds sense and evidence fields. They are extra JSON keys.
 * The Supabase upsert still sends only the original columns; the new
 * fields travel inside payload so a table created before v2 still accepts
 * the row. JSONL repeats those fields on the line for the ALS ingester.
 * Lines with no schema_version are v1 and stay valid.
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
  };
  var EPOCH_DUE = "1970-01-01T00:00:00.000Z";
  var SCHEMA_VERSION = 2;
  var DAY_MS = 24 * 60 * 60 * 1000;
  var CLOUD_COLUMNS = [
    "event_id", "learner_id", "user_id", "source", "event_type",
    "payload", "created_at", "item_id", "headword", "frame_id",
    "cefr_level", "run_purpose",
  ];
  var EVIDENCE_KEYS = [
    "sense_id", "sense_id_kind", "lemma", "pos",
    "task_direction", "task_direction_detail", "attempt",
    "hint_exposed", "hint_exposed_at", "answer_exposed", "answer_exposed_at",
    "review_interval_days", "review_interval_ms",
    "content_version", "bank_version",
    "grade_status", "score",
  ];

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

  /** False and 0 are real values. Empty string is "not provided". */
  function present(v) {
    return v != null && v !== "";
  }

  function put(target, key, value) {
    if (present(value) || value === false || value === 0) target[key] = value;
  }

  /** Bank POS tags look like "v." / "adj.". The sense key stores them without the trailing dot. */
  function posToken(pos) {
    var p = String(pos || "").trim().toLowerCase();
    if (p.charAt(p.length - 1) === ".") p = p.slice(0, -1);
    return p;
  }

  /**
   * Provisional sense key when the card has no bank sense_id.
   * lemma.pos.gloss_zh, POS trailing dot stripped.
   * Missing POS keeps the empty slot: lemma..gloss_zh.
   * Gloss-only or lemma-only callers get a shorter key; kind says which.
   */
  function provisionalSenseId(lemma, pos, gloss) {
    var l = headwordOf(lemma);
    var p = posToken(pos);
    var g = String(gloss || "").trim().replace(/\s+/g, " ");
    if (!l) return "";
    if (p && g) return l + "." + p + "." + g;
    if (!p && g) return l + ".." + g;
    if (p && !g) return l + "." + p;
    return l;
  }

  function resolveSense(input, lemma, pos, gloss) {
    var explicit = input.sense_id != null ? String(input.sense_id).trim() : "";
    if (explicit) {
      return {
        sense_id: explicit,
        sense_id_kind: input.sense_id_kind ? String(input.sense_id_kind) : "bank",
      };
    }
    if (!lemma && !gloss) return null;
    var id = provisionalSenseId(lemma, pos, gloss);
    if (!id) return null;
    var kind = "provisional";
    if (!gloss) kind = pos ? "lemma_pos" : "lemma_only";
    return { sense_id: id, sense_id_kind: kind };
  }

  function resolveDirection(input) {
    var raw = input.task_direction != null ? input.task_direction : input.direction;
    if (raw == null || String(raw).trim() === "") return null;
    var v = String(raw).trim().toLowerCase();
    if (v === "recognition" || v === "meaning" || v === "en-zh" || v === "en_zh") {
      return {
        task_direction: "recognition",
        task_direction_detail: v === "recognition" ? "" : v,
      };
    }
    if (v === "production" || v === "form" || v === "spelling" || v === "zh-en" || v === "zh_en") {
      var detail = (v === "form" || v === "spelling") ? v : "";
      return { task_direction: "production", task_direction_detail: detail };
    }
    return null;
  }

  function resolveAttempt(input) {
    if (input.attempt === "first_attempt" || input.attempt === "retry") return input.attempt;
    if (input.first_attempt === true || input.firstTry === true) return "first_attempt";
    if (input.first_attempt === false || input.firstTry === false || input.retry === true) return "retry";
    return "";
  }

  function flagValue(input, names) {
    for (var i = 0; i < names.length; i++) {
      if (!Object.prototype.hasOwnProperty.call(input, names[i])) continue;
      var v = input[names[i]];
      if (v === true || v === false) return v;
      if (v === "true") return true;
      if (v === "false") return false;
    }
    return null;
  }

  function gradeSpec(grade) {
    if (grade == null || grade === "") return null;
    var g = String(grade).trim().toLowerCase();
    if (g === "1" || g === "good") return { grade_status: "good", score: 1 };
    if (g === "2" || g === "easy") return { grade_status: "easy", score: 2 };
    if (g === "0" || g === "again") return { grade_status: "again", score: 0 };
    if (g === "unknown") return { grade_status: "unknown", score: 0 };
    if (g === "pending" || g === "ungraded") return { grade_status: "pending" };
    return null;
  }

  function resolveGrade(input, type) {
    if (present(input.grade_status)) {
      var spec = gradeSpec(input.grade_status);
      if (!spec) spec = { grade_status: String(input.grade_status) };
      if (input.score != null && input.score !== "" && spec.grade_status !== "pending") {
        var n = Number(input.score);
        if (isFinite(n)) spec.score = n;
      }
      return spec;
    }
    var quality = input.quality != null ? input.quality : input.srs_quality;
    if (quality != null && quality !== "") return gradeSpec(quality) || gradeSpec(type === TYPES.UNKNOWN ? "unknown" : quality);
    if (type === TYPES.WRONG) return gradeSpec("again");
    if (type === TYPES.UNKNOWN) return gradeSpec("unknown");
    if (type === TYPES.CORRECT) return gradeSpec("pending");
    return null;
  }

  function resolveInterval(input) {
    var raw = input.review_interval_days;
    if (raw == null || raw === "") raw = input.interval_days;
    if (raw == null || raw === "") raw = input.interval;
    if (raw == null || raw === "") return null;
    var n = Number(raw);
    if (!isFinite(n) || n < 0) return null;
    return { review_interval_days: n, review_interval_ms: Math.round(n * DAY_MS) };
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
    if (type === TYPES.WRONG && input.reason && (input.reason === "form" || input.reason === "sense" || input.reason === "pos" || input.reason === "other")) {
      payload.reason = input.reason;
      var reasonZh = input.reason_zh != null ? String(input.reason_zh).trim() : "";
      if (reasonZh) payload.reason_zh = reasonZh;
    }
    if (input.outcome && type !== TYPES.DUE) payload.outcome = String(input.outcome);
    var eventId = input.event_id || newId();
    var ev = {
      schema_version: SCHEMA_VERSION,
      event_id: eventId,
      source_event_id: input.source_event_id ? String(input.source_event_id) : eventId,
      learner_id: learner,
      user_id: input.user_id || learner,
      source: SOURCE,
      event_type: type,
      created_at: created,
      payload: payload,
    };
    if (learner) {
      ev.canonical_learner_id = input.canonical_learner_id || learner;
      ev.source_user_id = input.source_user_id || input.user_id || learner;
    }
    var item = input.item_id || input.key || input.cardKey || "";
    if (item) ev.item_id = String(item);
    if (head) ev.headword = head;
    var cefr = input.cefr_level || cefrForTrack(input.track);
    if (cefr) ev.cefr_level = cefr;

    var lemma = headwordOf(input.lemma || head);
    var pos = input.pos != null ? String(input.pos).trim() : (input.POS != null ? String(input.POS).trim() : "");
    if (lemma) ev.lemma = lemma;
    if (pos) ev.pos = pos;
    var sense = resolveSense(input, lemma, pos, gloss);
    if (sense) {
      ev.sense_id = sense.sense_id;
      ev.sense_id_kind = sense.sense_id_kind;
    }
    var direction = resolveDirection(input);
    if (direction) {
      ev.task_direction = direction.task_direction;
      if (direction.task_direction_detail) ev.task_direction_detail = direction.task_direction_detail;
    }
    var attempt = resolveAttempt(input);
    if (attempt) ev.attempt = attempt;
    var hintExposed = flagValue(input, ["hint_exposed", "hintExposed"]);
    if (hintExposed != null) ev.hint_exposed = hintExposed;
    var hintAt = input.hint_exposed_at || input.hintExposedAt;
    if (hintAt) ev.hint_exposed_at = normalizeIso(hintAt) || String(hintAt);
    var answerExposed = flagValue(input, ["answer_exposed", "answerExposed", "hintSeen"]);
    if (answerExposed != null) ev.answer_exposed = answerExposed;
    var answerAt = input.answer_exposed_at || input.answerExposedAt;
    if (answerAt) ev.answer_exposed_at = normalizeIso(answerAt) || String(answerAt);
    var interval = resolveInterval(input);
    if (interval) {
      ev.review_interval_days = interval.review_interval_days;
      ev.review_interval_ms = interval.review_interval_ms;
    }
    var content = input.content_version || input.bank_version || "";
    var bank = input.bank_version || input.content_version || "";
    if (content) ev.content_version = String(content);
    if (bank) ev.bank_version = String(bank);
    var grade = resolveGrade(input, type);
    if (grade) {
      ev.grade_status = grade.grade_status;
      if (grade.score != null) ev.score = grade.score;
    }
    stampPayload(ev);
    return ev;
  }

  /** Mirror v2 identity and evidence into payload. Existing payload keys stay. */
  function stampPayload(ev) {
    var payload = ev.payload || (ev.payload = {});
    put(payload, "schema_version", ev.schema_version);
    put(payload, "source_event_id", ev.source_event_id);
    put(payload, "canonical_learner_id", ev.canonical_learner_id);
    put(payload, "source_user_id", ev.source_user_id);
    for (var i = 0; i < EVIDENCE_KEYS.length; i++) {
      var k = EVIDENCE_KEYS[i];
      if (present(ev[k]) || ev[k] === false || ev[k] === 0) payload[k] = ev[k];
    }
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
        if (events[i].schema_version) {
          events[i].canonical_learner_id = events[i].canonical_learner_id || learnerId;
          events[i].source_user_id = events[i].source_user_id || learnerId;
          stampPayload(events[i]);
        }
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
    var keys = src && typeof src === "object" ? Object.keys(src) : [];
    for (var i = 0; i < keys.length; i++) payload[keys[i]] = src[keys[i]];
    return payload;
  }

  function publicEvent(ev) {
    var payload = copyPayload(ev.payload);
    var out = {
      event_id: ev.event_id,
      learner_id: ev.learner_id || "",
      user_id: ev.user_id || ev.learner_id || "",
      source: SOURCE,
      event_type: ev.event_type,
      created_at: normalizeIso(ev.created_at) || ev.created_at,
    };
    if (ev.schema_version) {
      out.schema_version = ev.schema_version;
      payload.schema_version = ev.schema_version;
    }
    if (ev.source_event_id) {
      out.source_event_id = ev.source_event_id;
      payload.source_event_id = ev.source_event_id;
    }
    if (ev.schema_version && out.learner_id) {
      out.canonical_learner_id = ev.canonical_learner_id || out.learner_id;
      payload.canonical_learner_id = out.canonical_learner_id;
      out.source_user_id = ev.source_user_id || out.user_id || out.learner_id;
      payload.source_user_id = out.source_user_id;
    } else {
      if (ev.canonical_learner_id) {
        out.canonical_learner_id = ev.canonical_learner_id;
        payload.canonical_learner_id = ev.canonical_learner_id;
      }
      if (ev.source_user_id) {
        out.source_user_id = ev.source_user_id;
        payload.source_user_id = ev.source_user_id;
      }
    }
    for (var i = 0; i < EVIDENCE_KEYS.length; i++) {
      var k = EVIDENCE_KEYS[i];
      var val = ev[k];
      if (!present(val) && val !== false && val !== 0) val = payload[k];
      if (present(val) || val === false || val === 0) {
        out[k] = val;
        payload[k] = val;
      }
    }
    if (ev.item_id) out.item_id = ev.item_id;
    if (ev.headword) out.headword = ev.headword;
    if (ev.frame_id) out.frame_id = ev.frame_id;
    if (ev.cefr_level) out.cefr_level = ev.cefr_level;
    if (ev.run_purpose) out.run_purpose = ev.run_purpose;
    out.payload = payload;
    return out;
  }

  /** Columns the current learner_events table accepts. Rich fields stay in payload. */
  function cloudRow(ev) {
    var pub = publicEvent(ev);
    var row = {};
    for (var i = 0; i < CLOUD_COLUMNS.length; i++) {
      var k = CLOUD_COLUMNS[i];
      if (k === "payload") {
        row.payload = pub.payload || {};
        continue;
      }
      if (present(pub[k]) || pub[k] === 0) row[k] = pub[k];
    }
    row.event_id = pub.event_id;
    row.learner_id = pub.learner_id || "";
    row.user_id = pub.user_id || row.learner_id;
    row.source = SOURCE;
    row.event_type = pub.event_type;
    row.created_at = pub.created_at;
    return row;
  }

  function toJsonl(events) {
    var list = (events || []).slice();
    sortEvents(list);
    var lines = [];
    for (var i = 0; i < list.length; i++) lines.push(JSON.stringify(publicEvent(list[i])));
    return lines.length ? lines.join("\n") + "\n" : "";
  }

  function gradeIsPending(ev) {
    if (!ev || ev.event_type !== TYPES.CORRECT) return false;
    var g = ev.grade_status || (ev.payload && ev.payload.grade_status);
    return g === "pending";
  }

  /**
   * Rows still to insert. A correct answer stays local until Good / Easy
   * fills grade_status, unless force is set (page hide, explicit flush).
   * The shape is the Supabase column set, not the JSONL line.
   */
  function pendingRows(store, opts) {
    var force = !!(opts && opts.force);
    var learner = store && store.learner_id;
    var uploaded = (store && store.uploaded) || {};
    var events = (store && store.events) || [];
    var rows = [];
    for (var i = 0; i < events.length; i++) {
      var ev = events[i];
      if (!ev.learner_id || (learner && ev.learner_id !== learner)) continue;
      if (uploaded[ev.event_id]) continue;
      if (ev.source && ev.source !== SOURCE) continue;
      if (!force && gradeIsPending(ev)) continue;
      rows.push(cloudRow(ev));
    }
    return rows;
  }

  /** Latest matching event gets grade_status / score. Local only; the table is append-only. */
  function applyGrade(store, match, grade) {
    var spec = gradeSpec(grade);
    if (!store || !spec) return null;
    match = match || {};
    var events = store.events || [];
    var found = null;
    for (var i = events.length - 1; i >= 0; i--) {
      var ev = events[i];
      if (match.event_id && ev.event_id !== match.event_id) continue;
      if (match.event_type && ev.event_type !== match.event_type) continue;
      if (match.item_id && ev.item_id !== match.item_id) continue;
      if (match.headword && headwordOf(ev.headword) !== headwordOf(match.headword)) continue;
      found = ev;
      break;
    }
    if (!found) return null;
    found.grade_status = spec.grade_status;
    if (spec.score != null) found.score = spec.score;
    else delete found.score;
    found.payload = found.payload || {};
    found.payload.grade_status = spec.grade_status;
    if (spec.score != null) found.payload.score = spec.score;
    else delete found.payload.score;
    return found;
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
    liftFields(ev);
    return ev;
  }

  function liftFields(ev) {
    var payload = ev.payload || {};
    var keys = ["schema_version", "source_event_id", "canonical_learner_id", "source_user_id"].concat(EVIDENCE_KEYS);
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      var onEvent = ev[k];
      if (present(onEvent) || onEvent === false || onEvent === 0) continue;
      var fromPayload = payload[k];
      if (present(fromPayload) || fromPayload === false || fromPayload === 0) ev[k] = fromPayload;
    }
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
        .select("event_id,learner_id,user_id,source,event_type,payload,created_at,item_id,headword,frame_id,cefr_level,run_purpose")
        .eq("learner_id", store.learner_id)
        .eq("source", SOURCE)
        .order("created_at", { ascending: false })
        .limit(MAX_EVENTS);
      if (res.error) throw res.error;
      mergeRemote(store, res.data || []);
      persistStore();
      refreshStatus();
    }

    async function flushOnce(force) {
      var client = clientOrNull();
      var store = load();
      if (!client || !store.learner_id || cloudMode() !== "session") {
        refreshStatus();
        return;
      }
      var rows = pendingRows(store, { force: !!force });
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

    function enqueueFlush(opts) {
      var force = !!(opts && opts.force);
      flushChain = flushChain.then(function () { return flushOnce(force); }).catch(noteFailure);
      return flushChain;
    }

    function scheduleFlush() {
      if (cloudBlocked === "missing") return;
      if (flushTimer) clearTimeout(flushTimer);
      flushTimer = setTimeout(function () {
        flushTimer = null;
        enqueueFlush({ force: false });
      }, DEBOUNCE_MS);
    }

    function flush() {
      if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = null;
      }
      cloudBlocked = "";
      return enqueueFlush({ force: true });
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
    api.noteGrade = function (match, grade) {
      var ev = applyGrade(load(), match, grade);
      if (!ev) return null;
      persistStore();
      scheduleFlush();
      return publicEvent(ev);
    };
    api.recordDue = function (items) {
      var inputs = [];
      var list = items || [];
      for (var i = 0; i < list.length; i++) {
        var it = list[i] || {};
        inputs.push({
          event_type: TYPES.DUE,
          headword: it.headword || it.word,
          lemma: it.lemma || it.headword || it.word,
          pos: it.pos,
          sense_id: it.sense_id,
          item_id: it.item_id || it.key,
          track: it.track,
          gloss_zh: it.gloss_zh || it.meaning_zh || "",
          due_at: it.due_at,
          due_ms: it.due_ms != null ? it.due_ms : it.dueAt,
          cefr_level: it.cefr_level,
          review_interval_days: it.review_interval_days != null ? it.review_interval_days : it.interval,
          content_version: it.content_version,
          bank_version: it.bank_version,
          task_direction: it.task_direction,
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

  function sampleEvent() {
    return buildEvent({
      event_id: "7c1a9c2e-4b18-4f0a-9c1d-2a6e5b8d0f11",
      learner_id: "11111111-1111-4111-8111-111111111111",
      event_type: TYPES.WRONG,
      headword: "communicate",
      lemma: "communicate",
      pos: "v.",
      gloss_zh: "交流",
      item_id: "zhongkao|0::communicate",
      track: "zhongkao",
      answer: "community",
      outcome: "wrong",
      reason: "form",
      reason_zh: "形近",
      task_direction: "meaning",
      first_attempt: true,
      answer_exposed: false,
      review_interval_days: 3,
      content_version: "words-v12",
      bank_version: "words-v12",
      created_at: "2026-10-22T00:00:00.000Z",
    }, "2026-10-22T00:00:00.000Z");
  }

  var api = {
    SOURCE: SOURCE,
    STORAGE_KEY: STORAGE_KEY,
    MAX_EVENTS: MAX_EVENTS,
    TYPES: TYPES,
    EPOCH_DUE: EPOCH_DUE,
    SCHEMA_VERSION: SCHEMA_VERSION,
    CLOUD_COLUMNS: CLOUD_COLUMNS,
    emptyStore: emptyStore,
    newId: newId,
    headwordOf: headwordOf,
    cefrForTrack: cefrForTrack,
    dueAtIso: dueAtIso,
    buildEvent: buildEvent,
    provisionalSenseId: provisionalSenseId,
    posToken: posToken,
    cloudRow: cloudRow,
    applyGrade: applyGrade,
    sampleEvent: sampleEvent,
    dueDedupeKey: dueDedupeKey,
    append: append,
    stampLearner: stampLearner,
    retainLearner: retainLearner,
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

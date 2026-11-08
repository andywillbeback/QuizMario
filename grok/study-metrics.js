/* Shared study metrics for one learner's save and events.
 * Student home reads window.QMStudy only (own charts and word lists).
 * The class board, ZIP pack, and teacher login stay in teacher.js and run
 * only when teacher.html has #board. user_metadata does not authorize.
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
    "vocab.notebook_add": "加入笔记本",
    "vocab.due_review": "到期信号",
    "session.start": "开始学习",
    "session.end": "学习结束",
  };
  var FORGET_LABELS = ["今日到期", "逾期", "学习中", "已巩固"];
  var FORGET_COLORS = ["#c9842e", "#c45b7a", "#2e6fc4", "#2f9e8f"];
  var MASTERY_LABELS = ["0", "0.5", "1", "2", "3"];
  var DENIED_MESSAGE = "这个账号不是教师，不能打开班级看板。授权只认 app_metadata 里的 role=teacher，不认 user_metadata。";
  var SNAPSHOT_VERSION = "teacher-board-v2";
  var CALCULATION_VERSION = "teacher-metrics-2026-11-08.2";

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
    return spellingTouched(card.spelling) || spellingTouched(card.polysemy) || spellingTouched(card.collocationEvidence);
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
    var dir = String((ev && ev.task_direction) || payload.task_direction || "");
    var detail = String((ev && ev.task_direction_detail) || payload.task_direction_detail || "");
    var kind = String((ev && ev.evidence_kind) || payload.evidence_kind || "");
    if (dir === "recognition" || dir === "meaning" || detail === "meaning" || kind === "mc_recognition") return "看英选义";
    if (dir === "spelling" || detail === "spelling" || kind === "typed_spelling") return "拼写";
    if (dir === "cloze" || detail === "cloze" || kind === "cloze") return "完形";
    if (dir === "production" || dir === "form" || detail === "form" || kind === "mc_production") return "看义产出";
    if (dir === "collocation" || dir === "related" || dir === "related_item" || dir === "phrase" || detail === "collocation" || detail === "phrase") return "搭配";
    if (dir === "polysemy" || kind === "mc_polysemy") return "一词多义";
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

  function trackId(value) {
    return typeof value === "string" && /^[a-z0-9][a-z0-9_-]*$/i.test(value.trim())
      ? value.trim().toLowerCase() : "";
  }

  function itemTrack(key) {
    var text = String(key || "");
    var explicit = /^([a-z0-9][a-z0-9_-]*)\|\d+::/i.exec(text);
    if (explicit) return trackId(explicit[1]);
    return /^\d+::/.test(text) ? "core" : "";
  }

  /** A menu selection does not establish which track was actually practiced. */
  function practiceTrackContext(save, events, now) {
    var observed = Object.create(null);
    var breakdown = Object.create(null);
    var cards = asObject(save && save.cards);
    Object.keys(cards).forEach(function (key) {
      var id = itemTrack(key);
      if (!cardTouched(cards[key])) return;
      if (id) observed[id] = true;
      var slot = id || "unattributed";
      var row = breakdown[slot] || {track:id,label:id ? trackLabel(id) : "未标明词库",cards:0,due:0};
      row.cards++;
      var bucket = forgetBucket(cards[key], now);
      if (bucket === "due" || bucket === "overdue") row.due++;
      breakdown[slot] = row;
    });
    var latest = 0;
    var latestTracks = Object.create(null);
    var conflicting = 0;
    var missing = 0;
    var clock = new Date(now || Date.now()).getTime();
    (events || []).forEach(function (ev) {
      if (!answerOutcome(ev)) return;
      var p = asObject(ev.payload);
      var candidates = [trackId(ev.track), trackId(p.track), itemTrack(ev.item_id || p.item_id)];
      var ids = Object.create(null);
      candidates.forEach(function (id) { if (id) ids[id] = true; });
      var keys = Object.keys(ids);
      if (keys.length > 1) { conflicting++; return; }
      if (!keys.length) { missing++; return; }
      var id = keys[0];
      var at = Date.parse(ev.created_at);
      if (!isFinite(at) || at > clock + 300000) return;
      observed[id] = true;
      if (at > latest) { latest = at; latestTracks = Object.create(null); }
      if (at === latest) latestTracks[id] = true;
    });
    var recent = Object.keys(latestTracks).sort();
    var tracks = Object.keys(observed).sort();
    var source = recent.length === 1 ? "answer-event" : (recent.length > 1 ? "simultaneous-answers" : (tracks.length ? "cards" : "unverified"));
    var selected = trackId(save && save.track);
    var chosen = recent.length === 1 ? recent[0] : (tracks.length === 1 ? tracks[0] : "");
    return {
      track: chosen,
      label: chosen ? trackLabel(chosen) : (tracks.length ? "多词库（" + tracks.map(trackLabel).join("、") + "）" : "待核对"),
      source: source,
      tracks: tracks,
      selectedTrack: selected,
      selectedLabel: selected ? trackLabel(selected) : "未记录",
      conflictingAnswers: conflicting,
      untaggedAnswers: missing,
      lastAnswerAt: latest ? new Date(latest).toISOString() : "",
      scope: "全部词库累计",
      breakdown: Object.keys(breakdown).sort().map(function (id) {return breakdown[id];}),
    };
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

  function round1(value) {
    return Math.round(num(value) * 10) / 10;
  }

  /** One decimal minute. Matches grok/session-duration.js. */
  function msToMinutes(ms) {
    var n = num(ms);
    if (n <= 0) return 0;
    return round1(n / 60000);
  }

  function isSessionEvent(type) {
    return type === "session.start" || type === "session.end";
  }

  function localDayStart(now) {
    var d = now instanceof Date ? new Date(now.getTime()) : new Date(now || Date.now());
    if (isNaN(d.getTime())) d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }

  /** Same new-card rule as srs-rules.js, so a lapsed learning card stays in the queue. */
  function cardIsNew(card) {
    if (!card || typeof card !== "object") return true;
    if (card.state === "learning" || card.state === "review") return false;
    if (card.state === "new") return true;
    return num(card.reps) === 0 && num(card.correct) === 0 && num(card.wrong) === 0 && !(num(card.unknown) > 0);
  }

  function cardIsSolid(card) {
    return !!(card && card.state === "review" && num(card.interval) >= 1);
  }

  function cardIsLearning(card) {
    if (!card || cardIsNew(card) || cardIsSolid(card)) return false;
    if (card.state === "learning") return true;
    return num(card.interval) < 1 && num(card.reps) > 0;
  }

  /**
   * One bucket per card. 逾期 wins, then 今日到期 (due now, not before today),
   * then a future learning step, then a future solid card. New cards are omitted.
   * This is not a fifth radar axis.
   */
  function forgetBucket(card, now) {
    if (!card || cardIsNew(card)) return "";
    var due = num(card.due);
    var start = localDayStart(now);
    var at = now instanceof Date ? now.getTime() : num(now) || Date.now();
    if (due > 0 && due < start) return "overdue";
    if (!due || due <= at) return "due";
    if (cardIsLearning(card)) return "learning";
    if (cardIsSolid(card)) return "solid";
    return "learning";
  }

  function emptyForget() {
    return { due: 0, overdue: 0, learning: 0, solid: 0, lapsed: 0 };
  }

  function forgetCounts(cards, now) {
    var counts = emptyForget();
    var obj = asObject(cards);
    var keys = Object.keys(obj);
    for (var i = 0; i < keys.length; i++) {
      var card = obj[keys[i]];
      var bucket = forgetBucket(card, now);
      if (!bucket) continue;
      counts[bucket] += 1;
      if (num(card && card.lapses) > 0) counts.lapsed += 1;
    }
    return counts;
  }

  function forgetSeries(counts) {
    counts = counts || emptyForget();
    return {
      labels: FORGET_LABELS.slice(),
      counts: [num(counts.due), num(counts.overdue), num(counts.learning), num(counts.solid)],
      due: num(counts.due),
      overdue: num(counts.overdue),
      learning: num(counts.learning),
      solid: num(counts.solid),
      lapsed: num(counts.lapsed),
    };
  }

  /**
   * 待复习数量 = 今日到期 + 逾期.
   * due: a touched card whose due is missing, 0, or <= now, and that is not overdue.
   * overdue: a touched card with due > 0 before local midnight.
   * Future 学习中 and 已巩固 cards stay out. New cards stay out.
   * This does not change isLearned or the SRS schedule.
   */
  function reviewDueCount(forget) {
    forget = forget || {};
    return num(forget.due) + num(forget.overdue);
  }

  function addForget(into, part) {
    into.due += num(part.due);
    into.overdue += num(part.overdue);
    into.learning += num(part.learning);
    into.solid += num(part.solid);
    into.lapsed += num(part.lapsed);
    return into;
  }

  /** session.end durations for one local day. Ignored when the save already has that day. */
  function sessionEndMs(events, day) {
    var total = 0;
    var list = events || [];
    for (var i = 0; i < list.length; i++) {
      var ev = list[i];
      if (!ev || ev.event_type !== "session.end") continue;
      if (dayKey(ev.created_at) !== day) continue;
      var payload = asObject(ev.payload);
      var ms = num(payload.duration_ms);
      if (!ms && payload.duration_sec) ms = num(payload.duration_sec) * 1000;
      if (ms > 0) total += ms;
    }
    return total;
  }

  /**
   * Prefer save.studyDaily, then an existing daily.studyMs mirror.
   * session.end is only the fallback for a day the save does not name,
   * so a heartbeat plus a later end event is not added twice.
   */
  function studyMsForDay(save, events, day) {
    var study = asObject(save && save.studyDaily);
    if (Object.prototype.hasOwnProperty.call(study, day)) return Math.max(0, num(study[day]));
    var bucket = asObject(save && save.daily)[day];
    if (bucket && typeof bucket === "object" && Object.prototype.hasOwnProperty.call(bucket, "studyMs")) {
      return Math.max(0, num(bucket.studyMs));
    }
    return sessionEndMs(events, day);
  }

  function studyMinuteSeries(save, events, now) {
    var window7 = dayWindow(now, 7);
    var minutes = [];
    for (var i = 0; i < window7.labels.length; i++) {
      minutes.push(msToMinutes(studyMsForDay(save, events, window7.labels[i])));
    }
    return {
      labels: window7.labels.map(shortDay),
      minutes: minutes,
      total: round1(minutes.reduce(function (sum, n) { return sum + num(n); }, 0)),
    };
  }

  function blankWeak() {
    return { word: "", gloss: "", wrong: 0, events: 0, book: 0, students: Object.create(null) };
  }

  function addWeakEvidence(row, extra) {
    if (extra.wrong) row.wrong += extra.wrong;
    if (extra.events) row.events += extra.events;
    if (extra.book) row.book += extra.book;
    if (extra.gloss && !row.gloss) row.gloss = String(extra.gloss);
  }

  function touchWeak(map, word, studentId, extra) {
    word = String(word || "").trim().toLowerCase();
    if (!word) return;
    var row = map[word] || blankWeak();
    row.word = word;
    extra = extra || {};
    addWeakEvidence(row, extra);
    if (studentId) {
      var own = row.students[studentId] || { wrong: 0, events: 0, book: 0, gloss: "" };
      addWeakEvidence(own, extra);
      row.students[studentId] = own;
    }
    map[word] = row;
  }

  function weakScore(row) {
    // A saved cumulative failure and an event may be the same answer.
    var base = Math.max(num(row.wrong), num(row.events));
    return base > 0 ? base : (num(row.book) > 0 ? 1 : 0);
  }

  function weakList(map, studentId) {
    var out = [];
    var words = Object.keys(map);
    for (var i = 0; i < words.length; i++) {
      var row = map[words[i]];
      if (studentId && !row.students[studentId]) continue;
      var own = studentId ? row.students[studentId] : row;
      var score = studentId ? weakScore(own) : Object.keys(row.students).reduce(function (n, id) {
        return n + weakScore(row.students[id]);
      }, 0);
      if (score <= 0) continue;
      var who = Object.keys(row.students);
      out.push({
        word: row.word,
        gloss: own.gloss || "",
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
   * Four parent-facing scores, each 0–100. Fewer than MIN_SAMPLE attempts
   * stays null (样本不足), never a fake 0.
   *
   * 认词  Answer events tagged recognition / meaning / mc_recognition.
   *       Phrase and collocation rows are not counted here.
   *       Below 5 events, use save.practice.meaning when collocation
   *       evidence is still thin. Event rows and the save bucket are not added.
   * 搭配  Collocation / related-item rows: evidence or direction
   *       collocation|related|related_item|phrase, payload.scene containing 搭配,
   *       payload.related/collocation true, or a headword with whitespace
   *       (中考固定搭配 cards are multi-word). Below 5 events, use those cards'
   *       correct / (correct+wrong+unknown) plus typed-spelling attempts.
   * 产出  spelling / cloze / production: typed_spelling, mc_production, cloze,
   *       or direction form|spelling|production|cloze.
   *       Below 5 events, use spelling.typed on single-word cards.
   *       spelling.mc is legacy multiple choice and is ignored.
   *       save.practice.spelling is the last resort, and only when phrase
   *       cards have not already filled 搭配.
   * 巩固  Average of the parts that have a real sample:
   *       learned/touched when touched >= 5 (已学会 uses the board rule),
   *       and review stability. Stability prefers all-time daily rc/(rc+rw)
   *       when that pair is >= 5, else answer events whose
   *       review_interval_days >= 1, else solid/touched (review, interval >= 1).
   *       One part alone is the score. Neither part → null.
   * 不会 counts in the denominator and not as correct.
   * vocab.due_review and vocab.wrong_book_add are not accuracy attempts.
   */
  var MIN_SAMPLE = 5;
  var COLLOCATION_TAGS = {
    collocation: true,
    related: true,
    related_item: true,
    phrase: true,
  };

  function clampScore(value) {
    var n = Math.round(num(value));
    if (n < 0) return 0;
    if (n > 100) return 100;
    return n;
  }

  function fieldOf(ev, key) {
    if (!ev) return "";
    var top = ev[key];
    if (top != null && top !== "") return top;
    var payload = asObject(ev.payload);
    if (payload[key] != null && payload[key] !== "") return payload[key];
    return "";
  }

  function answerOutcome(ev) {
    var type = ev && ev.event_type;
    if (type === "vocab.answer_correct") return "correct";
    if (type === "vocab.answer_wrong") return "wrong";
    if (type === "vocab.answer_unknown") return "unknown";
    return "";
  }

  function isPhraseHeadword(word) {
    return /\s/.test(String(word || "").trim());
  }

  function isCollocationEvent(ev) {
    var payload = asObject(ev && ev.payload);
    var fields = [
      fieldOf(ev, "evidence_kind"),
      fieldOf(ev, "task_direction"),
      fieldOf(ev, "task_direction_detail"),
      payload.item_kind,
      payload.card_kind,
      payload.kind,
      payload.task,
    ];
    for (var i = 0; i < fields.length; i++) {
      var key = String(fields[i] || "").trim().toLowerCase();
      if (COLLOCATION_TAGS[key]) return true;
    }
    if (payload.related === true || payload.collocation === true) return true;
    if (/搭配/.test(String(payload.scene || ""))) return true;
    return isPhraseHeadword(eventHeadword(ev));
  }

  function isProductionEvent(ev) {
    var kind = String(fieldOf(ev, "evidence_kind") || "").toLowerCase();
    var dir = String(fieldOf(ev, "task_direction") || "").toLowerCase();
    var detail = String(fieldOf(ev, "task_direction_detail") || "").toLowerCase();
    if (kind === "typed_spelling" || kind === "mc_production" || kind === "cloze") return true;
    if (detail === "form" || detail === "spelling" || detail === "cloze") return true;
    if (dir === "production" || dir === "form" || dir === "spelling" || dir === "cloze") return true;
    return false;
  }

  function isRecognitionEvent(ev) {
    var kind = String(fieldOf(ev, "evidence_kind") || "").toLowerCase();
    var dir = String(fieldOf(ev, "task_direction") || "").toLowerCase();
    var detail = String(fieldOf(ev, "task_direction_detail") || "").toLowerCase();
    if (kind === "mc_recognition") return true;
    if (detail === "meaning") return true;
    if (dir === "recognition" || dir === "meaning") return true;
    return false;
  }

  /** recognition | collocation | production | "" for one answer event. */
  function axisOf(ev) {
    if (!answerOutcome(ev)) return "";
    if (isCollocationEvent(ev)) return "collocation";
    if (isProductionEvent(ev)) return "production";
    if (isRecognitionEvent(ev)) return "recognition";
    return "";
  }

  function tallyAnswers(events) {
    var out = {
      recognition: { n: 0, good: 0 },
      collocation: { n: 0, good: 0 },
      production: { n: 0, good: 0 },
    };
    var list = events || [];
    for (var i = 0; i < list.length; i++) {
      var outcome = answerOutcome(list[i]);
      if (!outcome) continue;
      var id = axisOf(list[i]);
      if (!out[id]) continue;
      out[id].n++;
      if (outcome === "correct") out[id].good++;
    }
    return out;
  }

  function practiceBucket(save, name) {
    var practice = asObject(save && save.practice);
    var row = practice[name];
    if (!row || typeof row !== "object") return { n: 0, good: 0 };
    return { n: num(row.n), good: num(row.good) };
  }

  function typedAttempt(spell) {
    if (!spell || typeof spell !== "object") return { n: 0, good: 0 };
    var typed = spell.typed;
    if (typed && typeof typed === "object") {
      var n = num(typed.correct) + num(typed.wrong) + num(typed.unknown);
      if (n > 0) return { n: n, good: num(typed.correct) };
    }
    return { n: 0, good: 0 };
  }

  function addAttempt(into, part) {
    into.n += part.n;
    into.good += part.good;
  }

  function collocationFromCards(cards) {
    var out = { n: 0, good: 0 };
    cards = asObject(cards);
    var keys = Object.keys(cards);
    for (var i = 0; i < keys.length; i++) {
      if (!isPhraseHeadword(headwordFromKey(keys[i]))) continue;
      var card = cards[keys[i]];
      if (!card || typeof card !== "object") continue;
      addAttempt(out, {
        n: num(card.correct) + num(card.wrong) + num(card.unknown),
        good: num(card.correct),
      });
      addAttempt(out, typedAttempt(card.spelling));
      var gate = asObject(card.collocationEvidence);
      addAttempt(out, {n:num(gate.correct)+num(gate.wrong)+num(gate.unknown),good:num(gate.correct)});
    }
    return out;
  }

  function typedSpellingTotals(cards) {
    var out = { n: 0, good: 0 };
    cards = asObject(cards);
    var keys = Object.keys(cards);
    for (var i = 0; i < keys.length; i++) {
      if (isPhraseHeadword(headwordFromKey(keys[i]))) continue;
      var card = cards[keys[i]];
      if (!card || typeof card !== "object") continue;
      addAttempt(out, typedAttempt(card.spelling));
    }
    return out;
  }

  function pickSample(primary, fallback, primaryBasis, fallbackBasis) {
    if (primary && primary.n >= MIN_SAMPLE) {
      return { n: primary.n, good: primary.good, basis: primaryBasis };
    }
    if (fallback && fallback.n >= MIN_SAMPLE) {
      return { n: fallback.n, good: fallback.good, basis: fallbackBasis };
    }
    var pn = primary ? primary.n : 0;
    var fn = fallback ? fallback.n : 0;
    var usePrimary = pn >= fn;
    return {
      n: usePrimary ? pn : fn,
      good: usePrimary ? num(primary && primary.good) : num(fallback && fallback.good),
      basis: "thin",
    };
  }

  function finishRatio(id, label, sample) {
    var n = num(sample && sample.n);
    var good = num(sample && sample.good);
    var thin = n < MIN_SAMPLE;
    return {
      id: id,
      label: label,
      score: thin ? null : clampScore(good / n * 100),
      n: n,
      good: good,
      basis: thin ? "thin" : (sample.basis || ""),
    };
  }

  function dailyRetention(save) {
    var daily = asObject(save && save.daily);
    var keys = Object.keys(daily);
    var n = 0;
    var good = 0;
    for (var i = 0; i < keys.length; i++) {
      var bucket = daily[keys[i]];
      if (!bucket || typeof bucket !== "object") continue;
      good += num(bucket.rc);
      n += num(bucket.rc) + num(bucket.rw);
    }
    return { n: n, good: good };
  }

  function reviewEventTotals(events) {
    var n = 0;
    var good = 0;
    var list = events || [];
    for (var i = 0; i < list.length; i++) {
      var outcome = answerOutcome(list[i]);
      if (!outcome) continue;
      if (!(num(fieldOf(list[i], "review_interval_days")) >= 1)) continue;
      n++;
      if (outcome === "correct") good++;
    }
    return { n: n, good: good };
  }

  function retentionAxis(save, events, touched, learned, solid) {
    var learnedOk = touched >= MIN_SAMPLE;
    var daily = dailyRetention(save);
    var reviewed = reviewEventTotals(events);
    var stability = null;
    var basis = "";
    if (daily.n >= MIN_SAMPLE) {
      stability = daily.good / daily.n;
      basis = "retention";
    } else if (reviewed.n >= MIN_SAMPLE) {
      stability = reviewed.good / reviewed.n;
      basis = "review-events";
    } else if (learnedOk) {
      stability = solid / touched;
      basis = "solid";
    }
    var learnedRatio = learnedOk ? (touched ? learned / touched : 0) : null;
    if (learnedRatio == null && stability == null) {
      return {
        id: "retention",
        label: "巩固",
        score: null,
        n: Math.max(touched, daily.n, reviewed.n),
        good: learned,
        basis: "thin",
      };
    }
    var parts = [];
    if (learnedRatio != null) parts.push(learnedRatio);
    if (stability != null) parts.push(stability);
    var avg = 0;
    for (var i = 0; i < parts.length; i++) avg += parts[i];
    avg /= parts.length;
    var labelBasis = learnedRatio != null && stability != null
      ? (basis === "solid" ? "learned+solid" : "learned+" + basis)
      : (learnedRatio != null ? "learned" : basis);
    var n = learnedOk ? touched : 0;
    if (basis === "retention") n = Math.max(n, daily.n);
    else if (basis === "review-events") n = Math.max(n, reviewed.n);
    else n = Math.max(n, touched);
    var good = basis === "retention" ? daily.good : (basis === "review-events" ? reviewed.good : learned);
    return {
      id: "retention",
      label: "巩固",
      score: clampScore(avg * 100),
      n: n,
      good: good,
      basis: labelBasis,
    };
  }

  function productionFallback(cards, save) {
    var typed = typedSpellingTotals(cards);
    if (typed.n >= MIN_SAMPLE) return { n: typed.n, good: typed.good, basis: "typed" };
    if (collocationFromCards(cards).n >= MIN_SAMPLE) return { n: typed.n, good: typed.good, basis: "thin" };
    var practice = practiceBucket(save, "spelling");
    if (practice.n >= MIN_SAMPLE) return { n: practice.n, good: practice.good, basis: "practice" };
    return {
      n: Math.max(typed.n, practice.n),
      good: typed.n >= practice.n ? typed.good : practice.good,
      basis: "thin",
    };
  }

  function scoreAbilities(input) {
    input = input || {};
    var events = input.events || [];
    var save = input.save || {};
    var cards = input.cards || {};
    var tallies = tallyAnswers(events);
    var colloCards = collocationFromCards(cards);
    var collo = pickSample(tallies.collocation, colloCards, "events", "cards");
    var recogFallback = collo.n >= MIN_SAMPLE
      ? { n: tallies.recognition.n, good: tallies.recognition.good }
      : practiceBucket(save, "meaning");
    var recognition = pickSample(tallies.recognition, recogFallback, "events", "practice");
    var produced = pickSample(tallies.production, productionFallback(cards, save), "events", "fallback");
    if (produced.basis === "fallback") {
      var typed = typedSpellingTotals(cards);
      produced.basis = typed.n >= MIN_SAMPLE ? "typed" : "practice";
    }
    return [
      finishRatio("recognition", "认词", recognition),
      finishRatio("collocation", "搭配", collo),
      finishRatio("production", "产出", produced),
      retentionAxis(save, events, num(input.touched), num(input.learned), num(input.solid)),
    ];
  }

  function plainAxis(axis) {
    return {
      recognition: "看英文认意思",
      collocation: "词组搭配",
      production: "中文到英文练习（可含选择题）",
      retention: "巩固记录（合成分）",
    }[axis && axis.id] || (axis && axis.label) || "这项";
  }

  /** Wording only. The score itself still comes from scoreAbilities. */
  function bandOf(score) {
    if (score >= 85) return "steady";
    if (score >= 70) return "growing";
    return "weak";
  }

  function bandTail(band, score) {
    if (band === "steady") return "比较稳（" + score + "分）";
    if (band === "growing") return "正在变熟（" + score + "分）";
    return "还需要多练（" + score + "分）";
  }

  /** One sentence. Thin axes stay 样本不足; a real 0 is said as 0分. */
  function axisSentence(axes) {
    var clauses = [];
    var i = 0;
    axes = axes || [];
    while (i < axes.length) {
      if (axes[i].score == null) {
        var thin = [];
        while (i < axes.length && axes[i].score == null) {
          thin.push(plainAxis(axes[i]));
          i++;
        }
        clauses.push(thin.join("、") + (thin.length > 1 ? "都还是样本不足，先不打分" : "样本不足，先不打分"));
      } else {
        var score = axes[i].score;
        var band = bandOf(score);
        var names = [];
        while (i < axes.length && axes[i].score != null && axes[i].score === score && bandOf(axes[i].score) === band) {
          names.push(plainAxis(axes[i]));
          i++;
        }
        clauses.push(names.join("、") + bandTail(band, score));
      }
    }
    if (!clauses.length) return "四项学情样本不足，先不打分。";
    return clauses.join("；") + "。";
  }

  /** Parent and teacher blurb. Says 待复习数量 for every student, and never says 已学会. */
  function parentSummary(st) {
    st = st || {};
    var name = st.name ? st.name : "这位同学";
    var track = st.trackLabel && st.trackLabel !== "—" ? st.trackLabel : "";
    var touched = num(st.touched);
    var context = st.trackContext;
    var open = name;
    if (context && context.source === "answer-event") open += "最近记录的答题来自" + track + "词库";
    else if (context && context.tracks.length) open += "的练习记录覆盖" + context.tracks.map(trackLabel).join("、") + "词库";
    else open += "的单词练习（实际词库待核对）";
    open += "；以下为全部词库累计学情，已接触 " + touched + " 张词条卡";
    open += "，待复习数量 " + reviewDueCount(st.forget) + " 个";
    open += "。";
    var activity;
    if (!st.active7) {
      activity = "近 7 天还没有新的练习。";
    } else if (num(st.practice7) > 0) {
      activity = "近 7 天存档主流程记有 " + num(st.answers7) + " 次答题，事件流记到 " + num(st.practice7) + " 次练习事件";
      if (st.answerEvents7 != null && st.wrongBookEvents7 != null) activity += "（其中答题 " + num(st.answerEvents7) + " 次、错词本标记 " + num(st.wrongBookEvents7) + " 次；与存档不相加）。";
      else activity += "（两套记录可能重叠，不相加）。";
    } else if (num(st.answers7) > 0) {
      activity = "近 7 天有练习，存档里有 " + num(st.answers7) + " 次答题。";
    } else if (!num(st.practice7)) {
      activity = "近 7 天有学习活动，尚无新的答题记录。";
    } else {
      activity = "近 7 天有学习活动，尚无新的答题记录。";
    }
    var weakLine;
    var weak = st.weak || [];
    if (weak.length) {
      var words = [];
      var limit = Math.min(5, weak.length);
      for (var w = 0; w < limit; w++) {
        words.push(weak[w].gloss ? weak[w].word + "（" + weak[w].gloss + "）" : weak[w].word);
      }
      weakLine = "建议在家再认一认这些词：" + words.join("、") + "。";
    } else if (touched > 0) {
      weakLine = "目前没有特别集中的薄弱词。";
    } else {
      weakLine = "练习记录还很少，可以先看哪几项是样本不足。";
    }
    return open + activity + "按累计存档与已加载事件计算，" + axisSentence(st.abilities) + weakLine;
  }

  /** Answer events only. due_review and the wrong-book signal are not question types. */
  function answerModeMix(events) {
    var map = Object.create(null);
    var list = events || [];
    for (var i = 0; i < list.length; i++) {
      if (!answerOutcome(list[i])) continue;
      var label = modeLabel(list[i]);
      map[label] = (map[label] || 0) + 1;
    }
    var labels = Object.keys(map);
    labels.sort(function (a, b) { return map[b] - map[a] || (a < b ? -1 : 1); });
    return {
      labels: labels,
      counts: labels.map(function (label) { return map[label]; }),
    };
  }

  /**
   * This student's question mix. Answer events first.
   * vocab.due_review is never a slice. If that student has no answer events,
   * use save.practice counts (meaning / spelling / cloze) when those are real.
   * The two sources are not added together.
   */
  function studentModeMix(events, save) {
    var fromEvents = answerModeMix(events);
    var eventTotal = 0;
    var i;
    for (i = 0; i < fromEvents.counts.length; i++) eventTotal += fromEvents.counts[i];
    if (eventTotal > 0) {
      return { labels: fromEvents.labels, counts: fromEvents.counts, basis: "events" };
    }
    var practice = asObject(save && save.practice);
    var pairs = [
      ["看英选义", practice.meaning],
      ["拼写", practice.spelling],
      ["完形", practice.cloze],
      ["看义产出", practice.production],
    ];
    var labels = [];
    var counts = [];
    for (i = 0; i < pairs.length; i++) {
      var row = pairs[i][1];
      var n = row && typeof row === "object" ? num(row.n) : 0;
      if (n > 0) {
        labels.push(pairs[i][0]);
        counts.push(n);
      }
    }
    return { labels: labels, counts: counts, basis: counts.length ? "practice" : "empty" };
  }

  function dailyAttempt(bucket) {
    if (!bucket || typeof bucket !== "object") return { n: 0, good: 0 };
    return {
      n: num(bucket.c) + num(bucket.w) + num(bucket.unk),
      good: num(bucket.c),
    };
  }

  /**
   * One point per day in the window. A day with fewer than MIN_SAMPLE attempts
   * is null, never 0. Daily counts and event counts are not added together.
   * 不会 sits in the denominator.
   */
  function accuracySeries(save, events, now) {
    var window7 = dayWindow(now, 7);
    var daily = asObject(save && save.daily);
    var byDay = Object.create(null);
    var list = events || [];
    for (var i = 0; i < list.length; i++) {
      var outcome = answerOutcome(list[i]);
      if (!outcome) continue;
      var key = dayKey(list[i].created_at);
      if (!byDay[key]) byDay[key] = { n: 0, good: 0 };
      byDay[key].n++;
      if (outcome === "correct") byDay[key].good++;
    }
    var labels = [];
    var scores = [];
    var ns = [];
    for (var d = 0; d < window7.labels.length; d++) {
      var day = window7.labels[d];
      var fromDaily = dailyAttempt(daily[day]);
      var fromEvents = byDay[day] || { n: 0, good: 0 };
      var sample = null;
      if (fromDaily.n >= MIN_SAMPLE) sample = fromDaily;
      else if (fromEvents.n >= MIN_SAMPLE) sample = fromEvents;
      labels.push(shortDay(day));
      ns.push(sample ? sample.n : Math.max(fromDaily.n, fromEvents.n));
      scores.push(sample ? clampScore(sample.good / sample.n * 100) : null);
    }
    return { labels: labels, scores: scores, ns: ns };
  }

  function escHtml(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  function svgPoint(cx, cy, radius, index, count, scale) {
    var ang = -Math.PI / 2 + (index * 2 * Math.PI / count);
    return [cx + Math.cos(ang) * radius * scale, cy + Math.sin(ang) * radius * scale];
  }

  function svgOpen(w, h, label, chartName) {
    var chart = chartName ? ' data-chart="' + escHtml(chartName) + '"' : "";
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + w + " " + h + '" width="' + w + '" height="' + h + '" preserveAspectRatio="xMidYMid meet" role="img" aria-label="' + escHtml(label) + '"' + chart + ">";
  }

  function svgNote(w, h, label, message) {
    return svgOpen(w, h, label) +
      '<rect x="0" y="0" width="' + w + '" height="' + h + '" rx="12" fill="#f4f7fb"/>' +
      '<text x="' + (w / 2) + '" y="' + (h / 2) + '" font-size="13" text-anchor="middle" fill="#5c677a">' + escHtml(message) + "</text></svg>";
  }

  function svgRadar(abilities, textFill) {
    var list = abilities || [];
    var scoredInk = textFill || "#1c2430";
    var thinInk = textFill || "#8b93a7";
    var cx = 180;
    var cy = 150;
    var radius = 70;
    var n = list.length || 4;
    var grid = "";
    for (var g = 1; g <= 4; g++) {
      var ring = [];
      for (var i = 0; i < n; i++) {
        var rp = svgPoint(cx, cy, radius, i, n, g / 4);
        ring.push(rp[0].toFixed(1) + "," + rp[1].toFixed(1));
      }
      grid += '<polygon points="' + ring.join(" ") + '" fill="none" stroke="#d5dbe8" stroke-width="1"/>';
    }
    var spokes = "";
    var poly = [];
    var dots = "";
    var labels = "";
    for (var s = 0; s < n; s++) {
      var axis = list[s] || { label: "", score: null };
      var end = svgPoint(cx, cy, radius, s, n, 1);
      var thin = axis.score == null;
      spokes += '<line x1="' + cx + '" y1="' + cy + '" x2="' + end[0].toFixed(1) + '" y2="' + end[1].toFixed(1) + '" stroke="' + (thin ? "#b7becc" : "#8aa0c4") + '" stroke-width="' + (thin ? "4" : "1") + '"/>';
      if (!thin) {
        var scale = Math.max(0, Math.min(100, num(axis.score))) / 100;
        var p = svgPoint(cx, cy, radius, s, n, scale);
        poly.push(p[0].toFixed(1) + "," + p[1].toFixed(1));
        dots += '<circle cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="3.5" fill="#2e6fc4"/>';
      }
      var lp = svgPoint(cx, cy, radius, s, n, 1.24);
      var text = thin ? axis.label + " 样本不足" : axis.label + " " + axis.score;
      labels += '<text x="' + lp[0].toFixed(1) + '" y="' + lp[1].toFixed(1) + '" font-size="12" text-anchor="middle" fill="' + (thin ? thinInk : scoredInk) + '">' + escHtml(text) + "</text>";
    }
    var shape = "";
    if (poly.length === n && n >= 3) {
      shape = '<polygon points="' + poly.join(" ") + '" fill="rgba(46,111,196,.22)" stroke="#2e6fc4" stroke-width="2"/>';
    }
    return svgOpen(360, 300, "学情雷达") + grid + spokes + shape + dots + labels + "</svg>";
  }

  function lineXs(count, padL, innerW) {
    var xs = [];
    var n = count || 1;
    for (var j = 0; j < count; j++) {
      xs.push(padL + (n === 1 ? innerW / 2 : j * innerW / (n - 1)));
    }
    return xs;
  }

  /** Activity counts. Zero is a real count. extraValues draws the practice-event line. */
  function svgLine(labels, values, extraValues, title, chartName) {
    labels = labels || [];
    values = values || [];
    extraValues = extraValues || null;
    var w = 360;
    var h = 188;
    var padL = 28;
    var padB = 28;
    var padT = 22;
    var padR = 16;
    var max = 1;
    var i;
    for (i = 0; i < values.length; i++) if (num(values[i]) > max) max = num(values[i]);
    if (extraValues) {
      for (i = 0; i < extraValues.length; i++) if (num(extraValues[i]) > max) max = num(extraValues[i]);
    }
    var innerW = w - padL - padR;
    var innerH = h - padT - padB;
    var count = Math.max(values.length, extraValues ? extraValues.length : 0);
    var xs = lineXs(count, padL, innerW);
    function series(data, color, dash) {
      var pts = [];
      var circles = "";
      for (var j = 0; j < data.length; j++) {
        var x = xs[j];
        var y = padT + innerH - (num(data[j]) / max) * innerH;
        pts.push(x.toFixed(1) + "," + y.toFixed(1));
        circles += '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="3" fill="' + color + '"/>';
        if (num(data[j]) > 0) {
          var ly = y < padT + 16 ? y + 14 : y - 8;
          circles += '<text x="' + x.toFixed(1) + '" y="' + ly.toFixed(1) + '" font-size="10" text-anchor="middle" fill="' + color + '">' + num(data[j]) + "</text>";
        }
      }
      var dashAttr = dash ? ' stroke-dasharray="5 4"' : "";
      return '<polyline points="' + pts.join(" ") + '" fill="none" stroke="' + color + '" stroke-width="2"' + dashAttr + "/>" + circles;
    }
    var labs = "";
    for (var j = 0; j < count; j++) {
      labs += '<text x="' + xs[j].toFixed(1) + '" y="' + (h - 8) + '" font-size="10" text-anchor="middle" fill="#5c677a">' + escHtml(labels[j] || "") + "</text>";
    }
    var legend = extraValues
      ? '<text x="' + padL + '" y="14" font-size="10" fill="#2e6fc4">答题</text><text x="' + (padL + 36) + '" y="14" font-size="10" fill="#b8860b">练习事件</text>'
      : "";
    return svgOpen(w, h, title || "近7日练习", chartName) + legend + series(values, "#2e6fc4", false) +
      (extraValues ? series(extraValues, "#b8860b", true) : "") + labs + "</svg>";
  }

  function svgBars(labels, values, title, chartName, colors) {
    labels = labels || [];
    values = values || [];
    var w = 360;
    var h = 168;
    var padL = 28;
    var padB = 28;
    var padT = 14;
    var padR = 10;
    var max = 1;
    for (var i = 0; i < values.length; i++) if (num(values[i]) > max) max = num(values[i]);
    var innerW = w - padL - padR;
    var innerH = h - padT - padB;
    var slot = labels.length ? innerW / labels.length : innerW;
    var barW = Math.max(8, slot * 0.56);
    var bars = "";
    var labs = "";
    for (var j = 0; j < labels.length; j++) {
      var bh = (num(values[j]) / max) * innerH;
      var x = padL + j * slot + (slot - barW) / 2;
      var y = padT + innerH - bh;
      var fill = colors && colors[j] ? colors[j] : "#2f9e8f";
      bars += '<rect x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + barW.toFixed(1) + '" height="' + Math.max(0, bh).toFixed(1) + '" rx="4" fill="' + fill + '"/>';
      if (num(values[j]) > 0) {
        bars += '<text x="' + (x + barW / 2).toFixed(1) + '" y="' + Math.max(padT + 10, y - 4).toFixed(1) + '" font-size="11" text-anchor="middle" fill="#1c2430">' + num(values[j]) + "</text>";
      }
      labs += '<text x="' + (x + barW / 2).toFixed(1) + '" y="' + (h - 8) + '" font-size="10" text-anchor="middle" fill="#5c677a">' + escHtml(labels[j]) + "</text>";
    }
    return svgOpen(w, h, title || "掌握度", chartName) + bars + labs + "</svg>";
  }

  var DONUT_COLORS = ["#2e6fc4", "#2f9e8f", "#c9842e", "#c45b7a", "#6b5bb8", "#b89a2e", "#3d8fb5"];

  function svgDonut(labels, values, textFill) {
    labels = labels || [];
    values = values || [];
    var legendInk = textFill || "#1c2430";
    var quietInk = textFill || "#5c677a";
    var w = 360;
    var h = 200;
    var total = 0;
    var i;
    for (i = 0; i < values.length; i++) total += num(values[i]);
    if (!total) {
      return svgOpen(w, h, "题型占比", "modes") +
        '<circle cx="110" cy="92" r="54" fill="none" stroke="#d5dbe8" stroke-width="22"/>' +
        '<text x="110" y="96" font-size="13" text-anchor="middle" fill="' + quietInk + '">暂无答题</text>' +
        '<text x="180" y="178" font-size="12" text-anchor="middle" fill="' + quietInk + '">还没有答题记录，不编造题型占比</text></svg>';
    }
    var cx = 96;
    var cy = 100;
    var r = 70;
    var ir = 42;
    var angle = -Math.PI / 2;
    var paths = "";
    for (i = 0; i < values.length; i++) {
      var frac = num(values[i]) / total;
      if (frac <= 0) continue;
      var color = DONUT_COLORS[i % DONUT_COLORS.length];
      if (frac >= 0.999) {
        paths += '<circle cx="' + cx + '" cy="' + cy + '" r="' + ((r + ir) / 2) + '" fill="none" stroke="' + color + '" stroke-width="' + (r - ir) + '"/>';
        break;
      }
      var a0 = angle;
      var a1 = angle + frac * Math.PI * 2;
      angle = a1;
      var large = (a1 - a0) > Math.PI ? 1 : 0;
      var p = function (rad, radius) {
        return (cx + Math.cos(rad) * radius).toFixed(1) + " " + (cy + Math.sin(rad) * radius).toFixed(1);
      };
      paths += '<path d="M ' + p(a0, r) + " A " + r + " " + r + " 0 " + large + " 1 " + p(a1, r) +
        " L " + p(a1, ir) + " A " + ir + " " + ir + " 0 " + large + " 0 " + p(a0, ir) + ' Z" fill="' + color + '"/>';
    }
    var legend = "";
    var shown = Math.min(labels.length, 6);
    for (var k = 0; k < shown; k++) {
      var ly = 36 + k * 24;
      legend += '<rect x="188" y="' + (ly - 10) + '" width="12" height="12" rx="2" fill="' + DONUT_COLORS[k % DONUT_COLORS.length] + '"/>';
      legend += '<text x="206" y="' + ly + '" font-size="12" fill="' + legendInk + '">' + escHtml(labels[k] + " " + num(values[k])) + "</text>";
    }
    return svgOpen(w, h, "题型占比", "modes") + paths + legend + "</svg>";
  }

  /**
   * Fixed 0–100 scale. Null days are gaps, not zeros.
   * A plotted 0 means every sampled answer that day was wrong.
   */
  function svgAccuracy(labels, scores) {
    labels = labels || [];
    scores = scores || [];
    var w = 360;
    var h = 188;
    var any = false;
    var i;
    for (i = 0; i < scores.length; i++) if (scores[i] != null) any = true;
    var padL = 32;
    var padB = 28;
    var padT = 18;
    var padR = 12;
    var innerW = w - padL - padR;
    var innerH = h - padT - padB;
    var xs = lineXs(scores.length, padL, innerW);
    var grid = "";
    for (var g = 0; g <= 2; g++) {
      var gy = padT + innerH - (g / 2) * innerH;
      grid += '<line x1="' + padL + '" y1="' + gy.toFixed(1) + '" x2="' + (w - padR) + '" y2="' + gy.toFixed(1) + '" stroke="#e4e8f0" stroke-width="1"/>';
      grid += '<text x="4" y="' + (gy + 4).toFixed(1) + '" font-size="10" fill="#8b93a7">' + (g * 50) + "</text>";
    }
    var seg = [];
    var marks = "";
    var labs = "";
    for (var j = 0; j < scores.length; j++) {
      var x = xs[j];
      labs += '<text x="' + x.toFixed(1) + '" y="' + (h - 8) + '" font-size="10" text-anchor="middle" fill="' + (scores[j] == null ? "#b7becc" : "#5c677a") + '">' + escHtml(labels[j] || "") + "</text>";
      if (scores[j] == null) {
        if (seg.length) {
          marks += '<polyline points="' + seg.join(" ") + '" fill="none" stroke="#2e6fc4" stroke-width="2"/>';
          seg = [];
        }
        continue;
      }
      var y = padT + innerH - (Math.max(0, Math.min(100, num(scores[j]))) / 100) * innerH;
      seg.push(x.toFixed(1) + "," + y.toFixed(1));
      marks += '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="3.5" fill="#2e6fc4"/>';
      marks += '<text x="' + x.toFixed(1) + '" y="' + (y - 8).toFixed(1) + '" font-size="11" text-anchor="middle" fill="#1c2430">' + num(scores[j]) + "</text>";
    }
    if (seg.length) marks += '<polyline points="' + seg.join(" ") + '" fill="none" stroke="#2e6fc4" stroke-width="2"/>';
    var note = any ? "" : '<text x="' + (w / 2) + '" y="' + (padT + innerH / 2) + '" font-size="13" text-anchor="middle" fill="#5c677a">近7日正确率样本不足，不画成0</text>';
    return svgOpen(w, h, "近7日正确率", "accuracy") + grid + marks + labs + note + "</svg>";
  }

  function scoreCell(axis) {
    if (!axis || axis.score == null) return "样本不足";
    return String(axis.score);
  }

  function csvCell(value) {
    var s = String(value == null ? "" : value);
    if (/^[=+\-@]/.test(s)) s = "'" + s;
    if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  function weakText(rows) {
    var bits = [];
    var list = rows || [];
    for (var i = 0; i < list.length; i++) {
      bits.push(list[i].gloss ? list[i].word + "（" + list[i].gloss + "）" : list[i].word);
    }
    return bits.join("、");
  }

  function classCsv(board) {
    var headers = ["姓名", "邮箱", "班级", "词库", "已练词条卡", "进度指数", "认词", "搭配", "产出", "巩固", "近7日答题", "近7日学习分钟", "待复习数量", "今日到期", "逾期词数", "学习中", "已巩固", "薄弱词", "更新"];
    var lines = [headers.join(",")];
    var students = (board && board.students) || [];
    for (var i = 0; i < students.length; i++) {
      var st = students[i];
      var axes = {};
      var list = st.abilities || [];
      for (var a = 0; a < list.length; a++) axes[list[a].id] = list[a];
      lines.push([
        st.name || "",
        st.email || "",
        st.cls || "",
        st.trackLabel || "",
        st.touched,
        st.mastery == null ? "" : st.mastery,
        scoreCell(axes.recognition),
        scoreCell(axes.collocation),
        scoreCell(axes.production),
        scoreCell(axes.retention),
        num(st.answers7),
        st.minutes7 == null ? "" : st.minutes7,
        reviewDueCount(st.forget),
        st.forget ? st.forget.due : "",
        st.forget ? st.forget.overdue : "",
        st.forget ? st.forget.learning : "",
        st.forget ? st.forget.solid : "",
        weakText(st.weak),
        st.updatedAt || "",
      ].map(csvCell).join(","));
    }
    return lines.join("\n");
  }

  function sameSeries(a, b) {
    if (!a || !b || a.length !== b.length) return false;
    for (var i = 0; i < a.length; i++) if (num(a[i]) !== num(b[i])) return false;
    return true;
  }

  function activityExtra(st) {
    if (!st || st.lineSource !== "daily") return null;
    if (!(sum(st.eventLine || []) > 0)) return null;
    if (sameSeries(st.line, st.eventLine)) return null;
    return st.eventLine;
  }

  function studentChartSpecs(st) {
    st = st || {};
    var axes = st.abilities || [];
    var bins = st.masteryBins || [0, 0, 0, 0, 0];
    var modes = st.modes || { labels: [], counts: [] };
    var accuracy = st.accuracy || { labels: [], scores: [], ns: [] };
    var scores = accuracy.scores || [];
    var modeCounts = modes.counts || [];
    return {
      minSample: MIN_SAMPLE,
      radar: {
        id: "chart-radar",
        type: "radar",
        labels: axes.map(function (axis) { return axis.label; }),
        data: axes.map(function (axis) { return axis.score == null ? null : axis.score; }),
        thin: axes.map(function (axis) { return axis.score == null; }),
      },
      activity: {
        id: "chart-student",
        type: "line",
        labels: st.lineLabels || [],
        data: st.line || [],
        eventData: activityExtra(st),
      },
      mastery: {
        id: "chart-student-mastery",
        type: "bar",
        labels: MASTERY_LABELS.slice(),
        data: bins,
        empty: sum(bins) === 0,
      },
      modes: {
        id: "chart-student-modes",
        type: "doughnut",
        labels: modes.labels || [],
        data: modeCounts,
        empty: sum(modeCounts) === 0,
      },
      accuracy: {
        id: "chart-student-accuracy",
        type: "line",
        labels: accuracy.labels || [],
        data: scores.map(function (score) { return score == null ? null : score; }),
        ns: accuracy.ns || [],
        empty: !scores.some(function (score) { return score != null; }),
      },
      duration: {
        id: "chart-student-duration",
        type: "line",
        labels: st.minutesLabels || st.lineLabels || [],
        data: st.minutes || [],
      },
      forget: {
        id: "chart-student-forget",
        type: "bar",
        labels: (st.forget && st.forget.labels) || FORGET_LABELS.slice(),
        data: (st.forget && st.forget.counts) || [0, 0, 0, 0],
        lapsed: st.forget ? num(st.forget.lapsed) : 0,
      },
    };
  }

  function studentReportHtml(st, generated) {
    st = st || {};
    var name = st.name || "学员";
    var axes = st.abilities || [];
    var weakRows = st.weak || [];
    var modes = st.modes || { labels: [], counts: [] };
    var accuracy = st.accuracy || { labels: [], scores: [] };
    var specs = studentChartSpecs(st);
    var lineNote = st.lineSource === "daily"
      ? (specs.activity.eventData ? "蓝线是每天的答题次数，金线是练习事件。两套数字不相加。" : "折线是近 7 天每天的答题次数。")
      : "近 7 天存档里没有每日答题，折线改用练习事件次数。";
    var accuracyNote = specs.accuracy.empty
      ? "近 7 日没有一天达到 " + MIN_SAMPLE + " 次答题，正确率不画成 0。"
      : "纵轴是 0 到 100。少于 " + MIN_SAMPLE + " 次的日期留空，不记成 0 分。图上的 0 表示那天答完的题都错了。";
    return "<!DOCTYPE html><html lang=\"zh-CN\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>" +
      escHtml("聚光单词 · 学情 · " + name) + "</title><style>" +
      "body{font-family:'PingFang SC','Noto Sans SC','Segoe UI',sans-serif;color:#1c2430;background:#fff;margin:0;padding:28px;line-height:1.65}" +
      "h1{font-size:1.45rem;margin:0 0 4px}h2{font-size:1.05rem;margin:0 0 6px}" +
      ".muted{color:#5c677a;font-size:.88rem;margin:4px 0 8px}" +
      ".summary{background:#f7f4ec;border:1px solid #eadcba;border-radius:12px;padding:12px 14px;margin:0}" +
      ".charts{display:grid;grid-template-columns:1fr 1fr;gap:8px 18px;align-items:start}" +
      ".chart{min-width:0;margin:0 0 8px}.wide{grid-column:1 / -1}.wide svg{max-width:720px}" +
      "svg{width:100%;max-width:420px;height:auto;display:block;background:#f4f7fb;border-radius:12px}" +
      "table{border-collapse:collapse;width:100%;max-width:640px}td,th{border-bottom:1px solid #e4e8f0;padding:6px 8px;text-align:left}" +
      "@media (max-width:640px){.charts{grid-template-columns:1fr}.wide{grid-column:auto}}" +
      "</style></head><body><h1>" + escHtml(name) + "的学情</h1><p class=\"muted\">账号 " +
      escHtml(st.email || "—") + (st.cls ? " · 班级 " + escHtml(st.cls) : "") + " · 词库 " +
      escHtml(st.trackLabel || "—") + " · 待复习数量 " + reviewDueCount(st.forget) +
      " · 报告生成 " + escHtml(generated || "") + "</p><p class=\"muted\">" +
      escHtml(reportDataNotes(st)) + "</p><h2>简短评价</h2><p class=\"summary\">" +
      escHtml(st.summary || "") + "</p><div class=\"charts\"><section class=\"chart\"><h2>学情雷达</h2><p class=\"muted\">认词、搭配、产出、巩固。样本少于 " +
      MIN_SAMPLE + " 次为样本不足，坐标轴为灰色，不记成 0 分。</p>" + svgRadar(axes) +
      "</section><section class=\"chart\"><h2>近7日练习</h2><p class=\"muted\">" + escHtml(lineNote) + "</p>" +
      svgLine(st.lineLabels, st.line, specs.activity.eventData) +
      "</section><section class=\"chart\"><h2>近7日学习分钟</h2><p class=\"muted\">可见且最近有操作的练习时间。切到别的标签页、或超过 3 分钟没有点击，都不计入。单位是分钟。</p>" +
      svgLine(specs.duration.labels, specs.duration.data, null, "近7日学习分钟", "duration") +
      "</section><section class=\"chart\"><h2>遗忘节点</h2><p class=\"muted\">今日到期、逾期、学习中、已巩固。一张卡只进一栏。这四栏不是雷达的第五轴。雷达仍是认词、搭配、产出、巩固。</p>" +
      svgBars(specs.forget.labels, specs.forget.data, "遗忘节点", "forget", FORGET_COLORS) +
      "</section><section class=\"chart\"><h2>掌握度</h2><p class=\"muted\">已接触词的掌握星级：0、0.5、1、2、3。未学的新词不在图里。</p>" +
      svgBars(MASTERY_LABELS, st.masteryBins || [0, 0, 0, 0, 0]) +
      "</section><section class=\"chart\"><h2>题型占比</h2><p class=\"muted\">只统计答题。到期信号不计入。</p>" +
      svgDonut(modes.labels, modes.counts) +
      "</section><section class=\"chart wide\"><h2>近7日正确率</h2><p class=\"muted\">" + escHtml(accuracyNote) + "</p>" +
      svgAccuracy(accuracy.labels, accuracy.scores) +
      "</section></div>" + inventoryListsHtml(st.inventory || {
        practiced: [],
        learned: [],
        weak: weakRows,
      }, { report: true, limit: 20 }) +
      "<p class=\"muted\">本页由聚光单词教师看板根据已经加载的学习记录生成，给家长阅读。不含登录凭证。</p></body></html>";
  }

  function reportDataNotes(st) {
    st = st || {};
    var notes = ["统计范围：全部词库累计存档及当前加载的事件。已接触按词条卡计数，同词在不同组或词库可能分别计数。"];
    if (st.trackContext) notes.push("存档中选中的词库：" + st.trackContext.selectedLabel + "（选择本身不证明已经练习）。");
    if (st.trackContext && st.trackContext.breakdown && st.trackContext.breakdown.length) notes.push("词库分布：" + st.trackContext.breakdown.map(function (b) {return b.label + " " + b.cards + " 张卡，待复习 " + b.due + " 张";}).join("；") + "。");
    if (st.sourceUpdatedAt) notes.push("存档更新时间：" + formatWhen(st.sourceUpdatedAt) + "。");
    if (st.dataReadAt) notes.push("数据读取时间：" + formatWhen(st.dataReadAt) + "。");
    if (st.eventSince && st.dataReadAt) notes.push("事件时间范围：" + formatWhen(st.eventSince) + " 至 " + formatWhen(st.dataReadAt) + "；存档计数保留累计历史。");
    if (st.calculationVersion) notes.push("统计版本：" + st.calculationVersion + "。");
    notes.push("遗忘节点只统计已进入SRS排程的卡片；单独的搭配或附加练习尚未排程时不计入到期数量。");
    notes.push("认词、搭配和中文到英文练习分数使用累计练习或已加载事件；中文到英文轴可包含选择题，不能等同于独立拼写能力。巩固为进度与复习记录合成分，不是隔天测验正确率。进度指数仅对已练卡片作阶段折算，不是正确率或全部词库的掌握比例。");
    var axes = st.abilities || [];
    var basisNames = { events: "答题事件", practice: "累计练习", typed: "手动拼写", cards: "词条卡记录", thin: "样本不足" };
    var samples = axes.map(function (axis) {
      var basis = axis.id === "retention" ? "进度/复习合成记录" : (basisNames[axis.basis] || axis.basis || "未注明");
      return axis.label + "：" + basis + "，记录数 " + num(axis.n);
    });
    if (samples.length) notes.push(samples.join("；") + "。");
    notes.push("薄弱词来自历史错误或错词本的待巩固线索（包括手动加入），需复测确认当前状态；信号取存档与事件计数的较大者用于排序，不是精确错误次数。练习分数包含已有记录中的重做或受助表现，不等于无提示首答成绩。");
    return notes.join(" ");
  }

  function utf8Bytes(text) {
    if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(String(text == null ? "" : text));
    var s = unescape(encodeURIComponent(String(text == null ? "" : text)));
    var out = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
  }

  function crc32(bytes) {
    if (!crc32.table) {
      var table = new Uint32Array(256);
      for (var i = 0; i < 256; i++) {
        var c = i;
        for (var k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
        table[i] = c >>> 0;
      }
      crc32.table = table;
    }
    var crc = 0xffffffff;
    for (var j = 0; j < bytes.length; j++) crc = crc32.table[(crc ^ bytes[j]) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
  }

  function concatBytes(parts) {
    var n = 0;
    for (var i = 0; i < parts.length; i++) n += parts[i].length;
    var out = new Uint8Array(n);
    var offset = 0;
    for (var j = 0; j < parts.length; j++) {
      out.set(parts[j], offset);
      offset += parts[j].length;
    }
    return out;
  }

  function le16(n) {
    return new Uint8Array([n & 255, (n >> 8) & 255]);
  }

  function le32(n) {
    return new Uint8Array([n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >> 24) & 255]);
  }

  function zipStore(files) {
    var locals = [];
    var centrals = [];
    var offset = 0;
    for (var i = 0; i < files.length; i++) {
      var name = utf8Bytes(files[i].name);
      var data = files[i].data;
      var crc = crc32(data);
      var local = concatBytes([
        le32(0x04034b50), le16(20), le16(0x0800), le16(0), le16(0), le16(0),
        le32(crc), le32(data.length), le32(data.length), le16(name.length), le16(0),
        name, data,
      ]);
      var central = concatBytes([
        le32(0x02014b50), le16(20), le16(20), le16(0x0800), le16(0), le16(0), le16(0),
        le32(crc), le32(data.length), le32(data.length), le16(name.length), le16(0),
        le16(0), le16(0), le16(0), le32(0), le32(offset), name,
      ]);
      locals.push(local);
      centrals.push(central);
      offset += local.length;
    }
    var centralBlob = concatBytes(centrals);
    var eocd = concatBytes([
      le32(0x06054b50), le16(0), le16(0), le16(files.length), le16(files.length),
      le32(centralBlob.length), le32(offset), le16(0),
    ]);
    return concatBytes(locals.concat([centralBlob, eocd]));
  }

  function reportFileName(st, index, used) {
    var base = st && st.name ? String(st.name).trim() : "";
    base = base.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "").slice(0, 40);
    if (!base) base = "学员" + (index + 1);
    var name = base;
    var n = 2;
    while (used[name]) {
      name = base + "-" + n;
      n++;
    }
    used[name] = true;
    return name + ".html";
  }

  var UNFILED_CLASS = "未填班级";

  /** profile.cls, trimmed. Empty means the student has not filled a class. */
  function classKeyOf(st) {
    var cls = st && typeof st.cls === "string" ? st.cls.trim() : "";
    return cls;
  }

  function classLabelOf(key) {
    return key ? key : UNFILED_CLASS;
  }

  /** Same-class students stay together. Named classes sort by name; 未填班级 is last. */
  function groupStudents(students) {
    var map = Object.create(null);
    var order = [];
    students = students || [];
    for (var i = 0; i < students.length; i++) {
      var key = classKeyOf(students[i]);
      if (!map[key]) {
        map[key] = { key: key, label: classLabelOf(key), students: [] };
        order.push(key);
      }
      map[key].students.push(students[i]);
    }
    order.sort(function (a, b) {
      if (!a && b) return 1;
      if (a && !b) return -1;
      return a < b ? -1 : a > b ? 1 : 0;
    });
    var groups = [];
    for (var g = 0; g < order.length; g++) groups.push(map[order[g]]);
    return groups;
  }

  function studentsInClass(board, key) {
    var students = (board && board.students) || [];
    var out = [];
    for (var i = 0; i < students.length; i++) {
      if (classKeyOf(students[i]) === key) out.push(students[i]);
    }
    return out;
  }

  function zipSafe(name) {
    var text = String(name || "").replace(/[\\/:*?"<>|\u0000-\u001f]/g, "").trim();
    return text || UNFILED_CLASS;
  }

  /**
   * One ZIP for a single 班级. key "" is 未填班级.
   * Does not mix students from other classes.
   */
  function classPack(board, key, now) {
    var students = studentsInClass(board, key);
    var label = classLabelOf(key);
    var when = dayKey(now || new Date());
    return {
      key: key,
      label: label,
      count: students.length,
      filename: "聚光单词-学情-" + zipSafe(label) + "-" + when + ".zip",
      bytes: classZip({ students: students }, now),
    };
  }

  /**
   * One HTML 学情 page per student, at the zip root.
   * No index, no spreadsheet, no 附表.
   * No ids, tokens, or raw emails.
   */
  function classZip(board, now) {
    var when = dayKey(now || new Date());
    var students = (board && board.students) || [];
    var used = Object.create(null);
    var files = [];
    for (var i = 0; i < students.length; i++) {
      files.push({
        name: reportFileName(students[i], i, used),
        data: utf8Bytes(studentReportHtml(students[i], when)),
      });
    }
    return zipStore(files);
  }

  var LIST_PREVIEW = 8;
  var LIST_CAP = 40;

  function glossOf(word, glosses) {
    if (!glosses) return "";
    var w = String(word || "").trim().toLowerCase();
    if (!w) return "";
    if (glosses[w]) return String(glosses[w]);
    var cut = w.indexOf(":");
    if (cut > 0 && glosses[w.slice(0, cut)]) return String(glosses[w.slice(0, cut)]);
    return "";
  }

  function paintGloss(rows, glosses) {
    var list = rows || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i] && !list[i].gloss) list[i].gloss = glossOf(list[i].word, glosses);
    }
  }

  function sortInventory(map) {
    var out = [];
    var words = Object.keys(map);
    for (var i = 0; i < words.length; i++) out.push(map[words[i]]);
    out.sort(function (a, b) {
      var as = a.score == null ? -1 : a.score;
      var bs = b.score == null ? -1 : b.score;
      if (bs !== as) return bs - as;
      return a.word < b.word ? -1 : a.word > b.word ? 1 : 0;
    });
    return out;
  }

  /**
   * One learner's practice inventory.
   * 已练习: touched cards, plus weak-list words that have no card yet.
   * 熟练 · 已学会: isLearned.
   * 不熟练 · 薄弱: the existing weak-signal rows (not every unlearned card).
   * A word may sit in more than one list.
   */
  function practiceInventory(cards, weakRows, glosses) {
    var practicedMap = Object.create(null);
    var learnedMap = Object.create(null);
    var obj = asObject(cards);
    var keys = Object.keys(obj);
    var i;
    for (i = 0; i < keys.length; i++) {
      var card = obj[keys[i]];
      if (!cardTouched(card)) continue;
      var word = headwordFromKey(keys[i]);
      if (!word) continue;
      var gloss = glossOf(word, glosses);
      var mastery = num(card.mastery);
      var prev = practicedMap[word];
      if (!prev || mastery > prev.score) {
        practicedMap[word] = { word: word, gloss: prev && prev.gloss ? prev.gloss : gloss, score: mastery };
      } else if (prev && !prev.gloss && gloss) {
        prev.gloss = gloss;
      }
      if (!isLearned(card)) continue;
      var learnedScore = card.mastered === true ? Math.max(mastery, 3) : mastery;
      var known = learnedMap[word];
      if (!known || learnedScore > known.score) {
        learnedMap[word] = { word: word, gloss: known && known.gloss ? known.gloss : gloss, score: learnedScore };
      } else if (known && !known.gloss && gloss) {
        known.gloss = gloss;
      }
    }
    var weak = [];
    var weakListRows = weakRows || [];
    for (i = 0; i < weakListRows.length; i++) {
      var item = weakListRows[i];
      if (!item || !item.word) continue;
      var weakGloss = item.gloss || glossOf(item.word, glosses);
      weak.push({ word: item.word, gloss: weakGloss, score: num(item.score) });
      if (!practicedMap[item.word]) {
        practicedMap[item.word] = { word: item.word, gloss: weakGloss, score: null };
      } else if (!practicedMap[item.word].gloss && weakGloss) {
        practicedMap[item.word].gloss = weakGloss;
      }
    }
    return {
      practiced: sortInventory(practicedMap),
      learned: sortInventory(learnedMap),
      weak: weak,
    };
  }

  function formatScore(value) {
    if (value == null || value === "") return "—";
    var rounded = Math.round(num(value) * 10) / 10;
    return String(rounded);
  }

  function inventoryRows(rows, preview, cap, showAll) {
    var list = rows || [];
    var shown = Math.min(list.length, cap);
    var html = "";
    for (var i = 0; i < shown; i++) {
      var row = list[i];
      var extra = !showAll && i >= preview ? " class=\"own-more\"" : "";
      html += "<tr" + extra + "><td>" + escHtml(row.word) + "</td><td>" + escHtml(row.gloss || "—") + "</td><td>" +
        escHtml(formatScore(row.score)) + "</td></tr>";
    }
    return { html: html, shown: shown, total: list.length, collapsed: !showAll && shown > preview };
  }

  function inventorySection(spec, rows, opts) {
    var report = !!(opts && opts.report);
    var opened = !!(opts && opts.open && opts.open[spec.id]);
    var preview = report ? (opts.limit || 20) : LIST_PREVIEW;
    var cap = report ? (opts.limit || 20) : LIST_CAP;
    var built = inventoryRows(rows, preview, cap, report || opened);
    var rest = built.total > built.shown
      ? "<p class=\"own-rest\">还有 " + (built.total - built.shown) + " 个未列出。</p>"
      : "";
    var button = built.collapsed ? "<button type=\"button\" data-own-more>查看更多</button>" : "";
    var tag = report ? "h2" : "h4";
    var empty = built.total ? "" : "<p class=\"own-empty\">" + escHtml(spec.empty) + "</p>";
    var table = built.total
      ? "<table><thead><tr><th>单词</th><th>释义</th><th>" + escHtml(spec.score) + "</th></tr></thead><tbody>" +
        built.html + "</tbody></table>"
      : "";
    return "<section class=\"own-bucket\" data-bucket=\"" + spec.id + "\"><" + tag + ">" +
      escHtml(spec.title) + "（" + built.total + "）</" + tag + "><p class=\"own-hint\">" +
      escHtml(spec.hint) + "</p>" + empty + table + button + rest + "</section>";
  }

  /** Three labeled lists. report:true is for the parent HTML page (no script, no hidden rows). */
  function inventoryListsHtml(inventory, opts) {
    inventory = inventory || {};
    var report = !!(opts && opts.report);
    var parentCopy = report || !!(opts && opts.parent);
    var learnedCopy = parentCopy
      ? {
        title: "熟练",
        hint: "至少一张对应词条卡达到熟练记录门槛。数字是该词条卡的星级，不代表所有词义或新情境都已掌握。",
        empty: "还没有达到熟练的词。",
      }
      : {
        title: "熟练 · 已学会",
        hint: "隔天巩固，并且达到已学会。数字是掌握度。",
        empty: "还没有达到已学会的词。",
      };
    var specs = [
      {
        id: "practiced",
        title: "已练习",
        score: "掌握",
        hint: "已经做过的词，含还在错词本里的词。数字是掌握度（0–3）。没有词卡时记为 —。",
        empty: "还没有练过的词。",
      },
      {
        id: "learned",
        title: learnedCopy.title,
        score: "掌握",
        hint: learnedCopy.hint,
        empty: learnedCopy.empty,
      },
      {
        id: "weak",
        title: "不熟练 · 薄弱词",
        score: "信号",
        hint: "历史错误或错词本（包括手动加入）提供的待复核线索。数字是信号强度，不是当前掌握度；是否仍不熟练，需要复测。",
        empty: "目前没有特别集中的薄弱词。",
      },
    ];
    var html = "<div class=\"own-lists\">";
    for (var i = 0; i < specs.length; i++) {
      html += inventorySection(specs[i], inventory[specs[i].id], opts);
    }
    return html + "</div>";
  }

  function chartBlock(title, hint, svg, bright) {
    return "<section class=\"own-chart" + (bright ? " own-ink" : "") + "\"><h4>" + escHtml(title) + "</h4><p class=\"own-hint\">" +
      escHtml(hint) + "</p>" + svg + "</section>";
  }

  /** Static charts for one learner. No class roster, no other students. */
  function personalChartsHtml(st) {
    st = st || {};
    var specs = studentChartSpecs(st);
    var axes = st.abilities || [];
    var accuracyNote = specs.accuracy.empty
      ? "近 7 日没有一天达到 " + MIN_SAMPLE + " 次答题，正确率不画成 0。"
      : "少于 " + MIN_SAMPLE + " 次的日期留空，不记成 0 分。图上的 0 表示那天答完的题都错了。";
    var lineNote = st.lineSource === "daily"
      ? (specs.activity.eventData ? "蓝线是每天的答题次数，金线是练习事件。两套数字不相加。" : "折线是近 7 天每天的答题次数。")
      : "近 7 日存档里没有每日答题，折线改用练习事件。";
    return "<div class=\"own-charts\">" +
      chartBlock("学情雷达", "认词、搭配、产出、巩固。样本少于 " + MIN_SAMPLE + " 次为样本不足，不记成 0 分。", svgRadar(axes, "#fff"), true) +
      chartBlock("题型占比", "只统计答题。到期信号不计入。没有答题就不编造占比。", svgDonut(specs.modes.labels, specs.modes.data, "#fff"), true) +
      chartBlock("近7日正确率", accuracyNote, svgAccuracy(specs.accuracy.labels, specs.accuracy.data)) +
      chartBlock("近7日学习分钟", "可见且最近有操作的练习时间。切走页面或超过 3 分钟没有操作的时间不计入。", svgLine(specs.duration.labels, specs.duration.data, null, "近7日学习分钟", "duration")) +
      chartBlock("遗忘节点", "今日到期、逾期、学习中、已巩固。一张卡只进一栏，不进入认词、搭配、产出、巩固雷达。", svgBars(specs.forget.labels, specs.forget.data, "遗忘节点", "forget", FORGET_COLORS)) +
      chartBlock("掌握度", "已接触词的掌握星级：0、0.5、1、2、3。未学的新词不在图里。", svgBars(specs.mastery.labels, specs.mastery.data, "掌握度", "mastery")) +
      chartBlock("近7日练习", lineNote, svgLine(st.lineLabels, st.line, specs.activity.eventData, "近7日练习", "activity")) +
      "</div>";
  }

  /**
   * One learner, the same fields the personal teacher chart uses.
   * weakMap is the class map when the board is building every student.
   * A personal call passes null and only touches this save.
   */
  function learnerSnapshot(id, save, events, updatedAt, email, now, weakMap) {
    save = asObject(save);
    var map = weakMap || Object.create(null);
    var window7 = dayWindow(now, 7);
    var profile = profileOf(save);
    var cards = asObject(save.cards);
    var cardKeys = Object.keys(cards);
    var touched = 0;
    var credit = 0;
    var learned = 0;
    var solid = 0;
    var masteryBins = [0, 0, 0, 0, 0];
    var c;
    for (c = 0; c < cardKeys.length; c++) {
      var card = cards[cardKeys[c]];
      if (!cardTouched(card)) continue;
      touched++;
      credit += cardCredit(card);
      if (isLearned(card)) learned++;
      if (isSolid(card)) solid++;
      var bin = masteryBin(card.mastery);
      masteryBins[bin]++;
      var wrongs = num(card.wrong) + spellingWrong(card.spelling) + num(card.polysemy && card.polysemy.wrong) + num(card.collocationEvidence && card.collocationEvidence.wrong);
      if (wrongs > 0) touchWeak(map, headwordFromKey(cardKeys[c]), id, { wrong: wrongs });
    }
    var book = asObject(save.wrongBook);
    var bookKeys = Object.keys(book);
    var bookActive = 0;
    for (var b = 0; b < bookKeys.length; b++) {
      var entry = book[bookKeys[b]];
      if (!entry || typeof entry !== "object" || entry.active !== true) continue;
      bookActive++;
      var lemma = entry.lemma ? String(entry.lemma).trim().toLowerCase() : headwordFromKey(bookKeys[b]);
      touchWeak(map, lemma, id, { book: 1, gloss: entry.gloss_zh || "" });
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
    var answerEvents7 = 0;
    var wrongBookEvents7 = 0;
    var eventActive = false;
    var timeline = [];
    var modeCounts = Object.create(null);
    var evs = (events && events.slice) ? events.slice() : [];
    evs.sort(function (a, b) {
      var aa = String(a && a.created_at || "");
      var bb = String(b && b.created_at || "");
      return aa < bb ? 1 : aa > bb ? -1 : 0;
    });
    for (var ei = 0; ei < evs.length; ei++) {
      var one = evs[ei];
      var when = dayKey(one && one.created_at);
      var slot = window7.index[when];
      var type = one && one.event_type;
      var sessionEvent = isSessionEvent(type);
      if (slot != null) {
        if (PRACTICE_TYPES[type] || sessionEvent) eventActive = true;
        if (!sessionEvent && PRACTICE_TYPES[type]) event7[slot]++;
        if (answerOutcome(one)) answerEvents7++;
        if (type === "vocab.wrong_book_add") wrongBookEvents7++;
      }
      if (sessionEvent) continue;
      if (WEAK_EVENT_TYPES[type]) {
        var payload = asObject(one.payload);
        touchWeak(map, eventHeadword(one), id, {
          events: type === "vocab.answer_wrong" ? 1 : 0,
          book: type === "vocab.wrong_book_add" ? 1 : 0,
          gloss: payload.gloss_zh || "",
        });
      }
      var mode = modeLabel(one);
      modeCounts[mode] = (modeCounts[mode] || 0) + 1;
      if (timeline.length < 12) {
        timeline.push({
          at: formatWhen(one.created_at),
          label: eventLabel(one),
          word: eventHeadword(one),
        });
      }
    }
    var mastery = touched ? Math.round((credit / touched) * 100) : null;
    var studied = studyMinuteSeries(save, evs, now);
    if (studied.total > 0) dailyActive = true;
    var fq = forgetCounts(cards, now);
    var isActive = dailyActive || eventActive;
    var personal = sum(daily7) > 0 ? daily7 : event7;
    var studentWeak = weakList(map, id);
    var abilities = scoreAbilities({
      events: evs,
      save: save,
      cards: cards,
      touched: touched,
      learned: learned,
      solid: solid,
    });
    var trackContext = practiceTrackContext(save, evs, now);
    var studentRow = {
      id: id,
      email: email || "",
      name: profile.name,
      cls: profile.cls,
      track: trackContext.track,
      trackLabel: trackContext.label,
      trackContext: trackContext,
      touched: touched,
      learned: learned,
      mastery: mastery,
      streak: num(save.streak),
      bestStreak: num(save.bestStreak),
      points: num(save.points),
      bookActive: bookActive,
      weakCount: studentWeak.length,
      weak: studentWeak.slice(0, 20),
      active7: isActive,
      updatedAt: updatedAt ? formatWhen(updatedAt) : "",
      sourceUpdatedAt: updatedAt || save.updatedAt || "",
      line: personal,
      lineSource: sum(daily7) > 0 ? "daily" : "events",
      lineLabels: window7.labels.map(shortDay),
      eventLine: event7,
      practice7: sum(event7),
      answerEvents7: answerEvents7,
      wrongBookEvents7: wrongBookEvents7,
      answers7: sum(daily7),
      timeline: timeline,
      masteryBins: masteryBins,
      modes: studentModeMix(evs, save),
      accuracy: accuracySeries(save, evs, now),
      abilities: abilities,
      minutes: studied.minutes,
      minutesLabels: studied.labels,
      minutes7: studied.total,
      forget: forgetSeries(fq),
      inventory: practiceInventory(cards, studentWeak, null),
      summary: "",
    };
    studentRow.summary = parentSummary(studentRow);
    return {
      row: studentRow,
      masteryBins: masteryBins,
      event7: event7,
      modeCounts: modeCounts,
      forgetRaw: fq,
    };
  }

  /** This learner only. Does not read a class, a directory, or anyone else's save. */
  function buildPersonal(save, events, now, opts) {
    opts = opts || {};
    var clean = asObject(save);
    var evs = events || [];
    if (opts.learnerId) {
      var mine = [];
      var want = String(opts.learnerId);
      for (var i = 0; i < evs.length; i++) {
        var ev = evs[i];
        var who = ev && (ev.learner_id || ev.user_id);
        if (!who || String(who) === want) mine.push(ev);
      }
      evs = mine;
    }
    var snap = learnerSnapshot(opts.id || "self", clean, evs, clean.updatedAt || "", opts.email || "", now, null);
    var row = snap.row;
    if (opts.glosses) {
      paintGloss(row.inventory.practiced, opts.glosses);
      paintGloss(row.inventory.learned, opts.glosses);
      paintGloss(row.inventory.weak, opts.glosses);
      paintGloss(row.weak, opts.glosses);
    }
    return row;
  }

  /** Reject a partial/old projection or class-level contamination before export. */
  function auditBoardSnapshot(board, payload, now) {
    var errors = [];
    if (!payload || payload.snapshot_version !== SNAPSHOT_VERSION) errors.push("snapshot-version");
    var progress = (payload && payload.progress) || [];
    var events = (payload && payload.events) || [];
    var students = (board && board.students) || [];
    var fields = ["touched","learned","mastery","weakCount","weak","abilities","forget","answers7","practice7","answerEvents7","wrongBookEvents7","inventory","trackContext"];
    progress.forEach(function (source) {
      var row = students.filter(function (s) {return s.id === source.user_id;})[0];
      if (!row) {errors.push("missing-student");return;}
      if (!Number.isInteger(source.source_card_count) || source.source_card_count !== row.touched) errors.push("source-card-count");
      var mine = events.filter(function (e) {return eventLearner(e) === source.user_id;});
      var personal = buildPersonal(source.save, mine, now, {id:source.user_id,email:row.email,learnerId:source.user_id});
      fields.forEach(function (key) {
        if (JSON.stringify(personal[key]) !== JSON.stringify(row[key])) errors.push("student-isolation:" + key);
      });
      if (sum(row.masteryBins || []) !== row.touched) errors.push("mastery-partition");
      if (row.practice7 !== row.answerEvents7 + row.wrongBookEvents7) errors.push("event-partition");
      if (sum((row.trackContext.breakdown || []).map(function (b) {return b.cards;})) !== row.touched) errors.push("track-partition");
    });
    if (students.some(function (s) {return !progress.some(function (p) {return p.user_id === s.id;});})) errors.push("event-without-save");
    return {ok:errors.length === 0,errors:errors,calculationVersion:CALCULATION_VERSION,snapshotVersion:payload && payload.snapshot_version};
  }

  function fromSnapshot(payload) {
    if (!payload || !payload.generated_at || !isFinite(Date.parse(payload.generated_at))) throw new Error("统计快照缺少可核对的读取时间。");
    var when = new Date(payload.generated_at);
    var board = buildBoard(payload.progress, payload.events, payload.directory, when);
    board.dataReadAt = payload.generated_at;
    board.students.forEach(function (st) {
      st.dataReadAt=board.dataReadAt;st.eventSince=payload.event_since || "";st.calculationVersion=CALCULATION_VERSION;
    });
    board.integrity=auditBoardSnapshot(board,payload,when);
    if (!board.integrity.ok) throw new Error("统计版本或数据校验未通过，已停止显示新的评价。请刷新后重试。");
    Object.defineProperty(board,"sourcePayload",{value:payload,enumerable:false});
    return board;
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
    var durationCounts = [0, 0, 0, 0, 0, 0, 0];
    var forgetTotals = emptyForget();

    for (var s = 0; s < order.length; s++) {
      var id = order[s];
      var pack = saves[id];
      var snap = learnerSnapshot(
        id,
        pack.save,
        pack.events,
        pack.updatedAt,
        learnerLabel(id, maskedById[id]),
        now,
        weakMap
      );
      var studentRow = snap.row;
      var bins = snap.masteryBins;
      for (var bi = 0; bi < bins.length && bi < masteryCounts.length; bi++) masteryCounts[bi] += bins[bi];
      var event7 = snap.event7;
      for (var ai = 0; ai < event7.length && ai < activity.length; ai++) activity[ai] += event7[ai];
      if (studentRow.mastery != null) masteryValues.push(studentRow.mastery);
      var minutes = studentRow.minutes || [];
      for (var mi = 0; mi < minutes.length && mi < durationCounts.length; mi++) {
        durationCounts[mi] = round1(durationCounts[mi] + minutes[mi]);
      }
      addForget(forgetTotals, snap.forgetRaw);
      if (studentRow.active7) active7++;
      var modeNames = Object.keys(snap.modeCounts);
      for (var mn = 0; mn < modeNames.length; mn++) {
        modeMap[modeNames[mn]] = (modeMap[modeNames[mn]] || 0) + snap.modeCounts[modeNames[mn]];
      }
      students.push(studentRow);
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
      groups: groupStudents(students),
      kpis: {
        students: students.length,
        active7: active7,
        mastery: avg,
        weak: weakList(weakMap).length,
      },
      mastery: { labels: MASTERY_LABELS.slice(), counts: masteryCounts },
      activity: { labels: window7.labels.map(shortDay), counts: activity },
      duration: { labels: window7.labels.map(shortDay), counts: durationCounts },
      forget: forgetSeries(forgetTotals),
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
    MIN_SAMPLE: MIN_SAMPLE,
    buildBoard: buildBoard,
    axisOf: axisOf,
    scoreAbilities: scoreAbilities,
    parentSummary: parentSummary,
    reportDataNotes: reportDataNotes,
    practiceTrackContext: practiceTrackContext,
    auditBoardSnapshot: auditBoardSnapshot,
    fromSnapshot: fromSnapshot,
    CALCULATION_VERSION: CALCULATION_VERSION,
    answerModeMix: answerModeMix,
    studentModeMix: studentModeMix,
    accuracySeries: accuracySeries,
    studentChartSpecs: studentChartSpecs,
    classCsv: classCsv,
    studentReportHtml: studentReportHtml,
    classZip: classZip,
    forgetBucket: forgetBucket,
    forgetCounts: forgetCounts,
    reviewDueCount: reviewDueCount,
    studyMinuteSeries: studyMinuteSeries,
    msToMinutes: msToMinutes,
    UNFILED_CLASS: UNFILED_CLASS,
    classKeyOf: classKeyOf,
    groupStudents: groupStudents,
    classPack: classPack,
    modeLabel: modeLabel,
    dayKey: dayKey,
    decodeReport: decodeReport,
    parseMany: parseMany,
    merge: mergeReports,
    totals: reportTotals,
    classWeak: classWeakReports,
    buildPersonal: buildPersonal,
    practiceInventory: practiceInventory,
    personalChartsHtml: personalChartsHtml,
    inventoryListsHtml: inventoryListsHtml,
  };
  root.QMStudy = {
    MIN_SAMPLE: MIN_SAMPLE,
    cardTouched: cardTouched,
    isLearned: isLearned,
    scoreAbilities: scoreAbilities,
    studentModeMix: studentModeMix,
    accuracySeries: accuracySeries,
    studentChartSpecs: studentChartSpecs,
    forgetCounts: forgetCounts,
    studyMinuteSeries: studyMinuteSeries,
    buildPersonal: buildPersonal,
    practiceInventory: practiceInventory,
    personalChartsHtml: personalChartsHtml,
    inventoryListsHtml: inventoryListsHtml,
  };
  if (root.document && typeof root.document.getElementById === "function" && root.document.getElementById("board")) {
    root.QMTeacherCore = api;
  }
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);

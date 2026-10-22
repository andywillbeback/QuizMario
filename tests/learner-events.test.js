"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const le = require("../learner-events");

const UID = "11111111-1111-4111-8111-111111111111";
const NOW = "2026-10-21T06:00:00.000Z";

function wrong(extra) {
  return le.buildEvent(Object.assign({
    event_type: le.TYPES.WRONG,
    learner_id: UID,
    headword: "Communicate",
    item_id: "zhongkao|0::communicate",
    track: "zhongkao",
    gloss_zh: "交流",
    answer: "community",
    created_at: NOW,
  }, extra || {}), NOW);
}

{
  const ev = wrong();
  assert.strictEqual(ev.source, "quizmario");
  assert.strictEqual(ev.event_type, "vocab.answer_wrong");
  assert.strictEqual(ev.headword, "communicate");
  assert.strictEqual(ev.learner_id, UID);
  assert.strictEqual(ev.user_id, UID);
  assert.strictEqual(ev.payload.headword, "communicate");
  assert.strictEqual(ev.payload.track, "zhongkao");
  assert.strictEqual(ev.payload.gloss_zh, "交流");
  assert.strictEqual(ev.payload.answer, "community");
  assert.ok(!ev.payload.reason, "a wrong pick without a class does not invent one");
  assert.strictEqual(ev.item_id, "zhongkao|0::communicate");
  assert.ok(!ev.cefr_level, "zhongkao is not given a guessed CEFR");
  const line = JSON.parse(le.toJsonl([ev]).trim());
  assert.strictEqual(line.source, "quizmario");
  assert.strictEqual(line.headword, "communicate");
  assert.ok(!line.uploaded);
}

{
  const ket = le.buildEvent({
    event_type: le.TYPES.CORRECT,
    learner_id: UID,
    headword: "adult",
    track: "ket",
    gloss_zh: "成年人",
    created_at: NOW,
  }, NOW);
  assert.strictEqual(ket.event_type, "vocab.answer_correct");
  assert.strictEqual(ket.cefr_level, "A2");
  assert.strictEqual(le.cefrForTrack("pet"), "B1");
  assert.strictEqual(le.cefrForTrack("cet4"), "");
  assert.ok(!ket.payload.answer, "a correct signal does not invent an answer");
}

{
  const tagged = wrong({ reason: "form", reason_zh: "形近" });
  assert.strictEqual(tagged.payload.reason, "form");
  assert.strictEqual(tagged.payload.reason_zh, "形近");
  assert.strictEqual(tagged.payload.answer, "community");
  const ignored = le.buildEvent({
    event_type: le.TYPES.UNKNOWN,
    learner_id: UID,
    headword: "communicate",
    track: "zhongkao",
    outcome: "unknown",
    reason: "form",
    reason_zh: "形近",
    created_at: NOW,
  }, NOW);
  assert.ok(!ignored.payload.reason, "不会 does not carry a miss bucket");
  const junk = wrong({ reason: "llm" });
  assert.ok(!junk.payload.reason, "only the four buckets are stored");
}

{
  const store = le.emptyStore();
  const due = le.buildEvent({
    event_type: le.TYPES.DUE,
    learner_id: UID,
    headword: "alpha",
    item_id: "zhongkao|0::alpha",
    track: "zhongkao",
    due_ms: 1700000000000,
    created_at: NOW,
  }, NOW);
  assert.strictEqual(due.payload.due_at, "2023-11-14T22:13:20.000Z");
  const first = le.append(store, due);
  assert.strictEqual(first.duplicate, false);
  const again = le.append(store, le.buildEvent({
    event_type: le.TYPES.DUE,
    learner_id: UID,
    headword: "Alpha",
    item_id: "zhongkao|0::alpha",
    track: "zhongkao",
    due_at: due.payload.due_at,
    created_at: "2026-10-21T07:00:00.000Z",
  }));
  assert.strictEqual(again.duplicate, true);
  assert.strictEqual(store.events.length, 1, "the same due moment is one signal");
  const other = le.append(store, le.buildEvent({
    event_type: le.TYPES.DUE,
    learner_id: UID,
    headword: "alpha",
    item_id: "zhongkao|0::alpha",
    track: "zhongkao",
    due_at: "2026-10-22T00:00:00.000Z",
    created_at: NOW,
  }));
  assert.strictEqual(other.duplicate, false);
  assert.strictEqual(store.events.length, 2);
  assert.strictEqual(le.dueAtIso(0), le.EPOCH_DUE);
}

{
  const store = le.emptyStore();
  le.append(store, wrong({ event_id: "10000000-0000-4000-8000-000000000001", created_at: NOW }));
  le.append(store, wrong({ event_id: "10000000-0000-4000-8000-000000000002", created_at: "2026-10-21T06:01:00.000Z" }));
  const book = le.buildEvent({
    event_type: le.TYPES.WRONG_BOOK,
    headword: "communicate",
    track: "zhongkao",
    gloss_zh: "交流",
    created_at: "2026-10-21T06:02:00.000Z",
  });
  assert.strictEqual(book.learner_id, "");
  le.append(store, book);
  assert.strictEqual(store.events.length, 3, "answers and book adds are not deduped");
  assert.strictEqual(le.stampLearner(store, UID), 1);
  assert.strictEqual(book.learner_id, UID);
  assert.strictEqual(book.user_id, UID);
  assert.strictEqual(le.pendingRows(store).length, 3);
  le.markUploaded(store, [store.events[0].event_id]);
  assert.strictEqual(le.pendingRows(store).length, 2);
  assert.strictEqual(le.countUploaded(store), 1);

  const other = "22222222-2222-4222-8222-222222222222";
  store.events[1].learner_id = other;
  store.events[1].user_id = other;
  le.retainLearner(store, UID);
  assert.ok(store.events.every((ev) => ev.learner_id === UID));
  assert.ok(!store.events.some((ev) => ev.learner_id === other));
}

{
  const remote = le.fromRemote({
    event_id: "10000000-0000-4000-8000-000000000009",
    learner_id: UID,
    user_id: UID,
    source: "als",
    event_type: "als.session_end",
    payload: {},
    created_at: NOW,
  });
  assert.strictEqual(remote, null, "QM export does not ingest ALS outcomes");
  const row = le.fromRemote({
    event_id: "10000000-0000-4000-8000-000000000010",
    learner_id: UID,
    user_id: UID,
    source: "quizmario",
    event_type: "vocab.due_review",
    headword: "BETA",
    payload: { headword: "beta", track: "zhongkao", due_at: "2026-10-21T00:00:00.000Z" },
    created_at: "2026-10-21T00:00:00+00:00",
  });
  assert.strictEqual(row.headword, "beta");
  const store = le.emptyStore();
  store.learner_id = UID;
  const merged = le.mergeRemote(store, [row]);
  assert.strictEqual(merged.added, 1);
  assert.strictEqual(le.pendingRows(store).length, 0, "pulled rows are already durable");
  const text = le.toJsonl(store.events);
  const parsed = JSON.parse(text.trim());
  assert.strictEqual(parsed.created_at, "2026-10-21T00:00:00.000Z");
  assert.strictEqual(parsed.payload.due_at, "2026-10-21T00:00:00.000Z");
}

{
  assert.strictEqual(le.classifyCloudError({ message: "Could not find the table public.learner_events in the schema cache" }), "missing");
  assert.strictEqual(le.classifyCloudError({ message: "JWT expired" }), "error");
}

{
  const sql = fs.readFileSync(path.join(__dirname, "../supabase/learner_events.sql"), "utf8");
  assert.ok(sql.includes("create table if not exists public.learner_events"));
  assert.ok(sql.includes("auth.uid() = learner_id"));
  assert.ok(sql.includes("source = 'quizmario'"));
  assert.ok(/revoke all on table public\.learner_events from anon/.test(sql));
  assert.ok(sql.includes("grant select, insert on table public.learner_events"));
  assert.ok(!/for update/i.test(sql), "browser role stays append-only");
  assert.ok(!/for delete/i.test(sql));
  const doc = fs.readFileSync(path.join(__dirname, "../docs/learner-events.md"), "utf8");
  for (const field of ["event_id", "learner_id", "user_id", "source", "event_type", "payload", "created_at", "headword", "due_at", "item_id"]) {
    assert.ok(doc.includes(field), "ingest doc names " + field);
  }
  assert.ok(doc.includes("ingest_learner_events.py"));
  assert.ok(doc.includes("vocab.due_review") && doc.includes("vocab.wrong_book_add"));
  assert.ok(doc.includes("vocab.answer_unknown"), "不会 is its own event, not a wrong pick");
  assert.ok(doc.includes("payload") && doc.includes("`reason`"), "wrong picks may carry a reason tag");
  assert.ok(!/已同步到\s*ALS/.test(doc + sql));
  for (const field of [
    "schema_version", "canonical_learner_id", "source_user_id", "source_event_id",
    "sense_id", "lemma", "pos", "task_direction", "attempt",
    "answer_exposed", "review_interval_days", "content_version", "bank_version",
    "grade_status", "score", "lemma.pos.gloss_zh",
  ]) {
    assert.ok(doc.includes(field), "v2 doc names " + field);
  }
  assert.ok(sql.includes("sense_id"), "payload comment names the v2 sense key");
  assert.ok(!/add column/i.test(sql), "v2 does not require a new column");
}

{
  const ev = wrong({
    pos: "v.",
    task_direction: "meaning",
    first_attempt: true,
    answer_exposed: false,
    review_interval_days: 3,
    content_version: "words-v12",
  });
  assert.strictEqual(ev.schema_version, 2);
  assert.strictEqual(ev.source_event_id, ev.event_id);
  assert.strictEqual(ev.canonical_learner_id, UID);
  assert.strictEqual(ev.source_user_id, UID);
  assert.strictEqual(ev.sense_id, "communicate.v.交流");
  assert.strictEqual(ev.sense_id_kind, "provisional");
  assert.strictEqual(ev.lemma, "communicate");
  assert.strictEqual(ev.pos, "v.");
  assert.strictEqual(ev.task_direction, "recognition");
  assert.strictEqual(ev.task_direction_detail, "meaning");
  assert.strictEqual(ev.attempt, "first_attempt");
  assert.strictEqual(ev.answer_exposed, false);
  assert.strictEqual(ev.review_interval_days, 3);
  assert.strictEqual(ev.review_interval_ms, 3 * 24 * 60 * 60 * 1000);
  assert.strictEqual(ev.content_version, "words-v12");
  assert.strictEqual(ev.bank_version, "words-v12");
  assert.strictEqual(ev.grade_status, "again");
  assert.strictEqual(ev.score, 0);
  assert.strictEqual(ev.payload.sense_id, ev.sense_id);
  assert.strictEqual(ev.payload.grade_status, "again");
  assert.ok(!Object.prototype.hasOwnProperty.call(ev, "hint_exposed"), "the example line is not a tracked hint");
  const line = JSON.parse(le.toJsonl([ev]).trim());
  assert.strictEqual(line.schema_version, 2);
  assert.strictEqual(line.headword, "communicate");
  assert.strictEqual(line.payload.headword, "communicate");
  assert.strictEqual(line.payload.answer, "community");
  const row = le.cloudRow(ev);
  for (const key of Object.keys(row)) {
    assert.ok(le.CLOUD_COLUMNS.indexOf(key) !== -1, "cloud row stays on " + key);
  }
  assert.ok(!Object.prototype.hasOwnProperty.call(row, "sense_id"));
  assert.ok(!Object.prototype.hasOwnProperty.call(row, "schema_version"));
  assert.strictEqual(row.payload.sense_id, "communicate.v.交流");
  assert.strictEqual(row.payload.canonical_learner_id, UID);
}

{
  const bank = wrong({ sense_id: "communicate:social", pos: "v." });
  assert.strictEqual(bank.sense_id, "communicate:social");
  assert.strictEqual(bank.sense_id_kind, "bank");
  const bare = le.buildEvent({
    event_type: le.TYPES.DUE,
    learner_id: UID,
    headword: "alpha",
    due_at: "2026-10-22T00:00:00.000Z",
    created_at: NOW,
  }, NOW);
  assert.strictEqual(bare.sense_id, "alpha");
  assert.strictEqual(bare.sense_id_kind, "lemma_only");
  assert.ok(!bare.grade_status, "a due signal is not a grade");
  assert.ok(!bare.task_direction);
  assert.strictEqual(le.provisionalSenseId("May", "n.", "五月"), "may.n.五月");
  assert.strictEqual(le.provisionalSenseId("communicate", "", "交流"), "communicate..交流");
}

{
  const produced = le.buildEvent({
    event_type: le.TYPES.CORRECT,
    learner_id: UID,
    headword: "adult",
    pos: "n.",
    gloss_zh: "成年人",
    track: "ket",
    task_direction: "spelling",
    first_attempt: false,
    answer_exposed: true,
    answer_exposed_at: "2026-10-22T01:02:03.000Z",
    hint_exposed: true,
    hint_exposed_at: "2026-10-22T01:00:00.000Z",
    created_at: NOW,
  }, NOW);
  assert.strictEqual(produced.task_direction, "production");
  assert.strictEqual(produced.task_direction_detail, "spelling");
  assert.strictEqual(produced.attempt, "retry");
  assert.strictEqual(produced.answer_exposed, true);
  assert.strictEqual(produced.answer_exposed_at, "2026-10-22T01:02:03.000Z");
  assert.strictEqual(produced.hint_exposed, true);
  assert.strictEqual(produced.hint_exposed_at, "2026-10-22T01:00:00.000Z");
  assert.strictEqual(produced.grade_status, "pending");
  assert.ok(!Object.prototype.hasOwnProperty.call(produced, "score"));
  assert.strictEqual(produced.cefr_level, "A2");
  const own = le.buildEvent({
    event_type: le.TYPES.WRONG,
    learner_id: UID,
    event_id: "10000000-0000-4000-8000-0000000000aa",
    source_event_id: "qm-local-1",
    headword: "adult",
    created_at: NOW,
  }, NOW);
  assert.strictEqual(own.source_event_id, "qm-local-1");
  assert.strictEqual(own.event_id, "10000000-0000-4000-8000-0000000000aa");
}

{
  const store = le.emptyStore();
  store.learner_id = UID;
  const pending = le.buildEvent({
    event_type: le.TYPES.CORRECT,
    learner_id: UID,
    headword: "adult",
    item_id: "ket|0::adult",
    gloss_zh: "成年人",
    created_at: NOW,
  }, NOW);
  le.append(store, pending);
  assert.strictEqual(le.pendingRows(store).length, 0, "Good/Easy is still open, so the row waits");
  assert.strictEqual(le.pendingRows(store, { force: true }).length, 1);
  const graded = le.applyGrade(store, { item_id: "ket|0::adult", event_type: le.TYPES.CORRECT }, "easy");
  assert.strictEqual(graded.grade_status, "easy");
  assert.strictEqual(graded.score, 2);
  assert.strictEqual(graded.payload.score, 2);
  const rows = le.pendingRows(store);
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].payload.grade_status, "easy");
  assert.ok(!Object.prototype.hasOwnProperty.call(rows[0], "grade_status"));
}

{
  const remote = le.fromRemote({
    event_id: "10000000-0000-4000-8000-0000000000bb",
    learner_id: UID,
    user_id: UID,
    source: "quizmario",
    event_type: "vocab.answer_wrong",
    headword: "communicate",
    created_at: NOW,
    payload: {
      headword: "communicate",
      gloss_zh: "交流",
      schema_version: 2,
      source_event_id: "10000000-0000-4000-8000-0000000000bb",
      canonical_learner_id: UID,
      source_user_id: UID,
      sense_id: "communicate.v.交流",
      lemma: "communicate",
      pos: "v.",
      grade_status: "again",
      score: 0,
      answer_exposed: false,
    },
  });
  assert.strictEqual(remote.schema_version, 2);
  assert.strictEqual(remote.sense_id, "communicate.v.交流");
  assert.strictEqual(remote.answer_exposed, false);
  assert.strictEqual(remote.score, 0);
  const again = JSON.parse(le.toJsonl([remote]).trim());
  assert.strictEqual(again.canonical_learner_id, UID);
  assert.strictEqual(again.payload.sense_id, "communicate.v.交流");
  const v1 = le.fromRemote({
    event_id: "10000000-0000-4000-8000-0000000000cc",
    learner_id: UID,
    user_id: UID,
    source: "quizmario",
    event_type: "vocab.answer_wrong",
    headword: "beta",
    payload: { headword: "beta", track: "zhongkao" },
    created_at: NOW,
  });
  const v1Line = JSON.parse(le.toJsonl([v1]).trim());
  assert.ok(!Object.prototype.hasOwnProperty.call(v1Line, "schema_version"), "a v1 row stays a v1 row");
  assert.strictEqual(v1Line.headword, "beta");
  assert.strictEqual(v1Line.learner_id, UID);
  assert.strictEqual(v1Line.payload.track, "zhongkao");
}

{
  const sampleLine = le.toJsonl([le.sampleEvent()]).trim();
  const sample = JSON.parse(sampleLine);
  assert.strictEqual(sample.schema_version, 2);
  assert.strictEqual(sample.sense_id, "communicate.v.交流");
  assert.strictEqual(sample.event_type, "vocab.answer_wrong");
  assert.strictEqual(sample.payload.outcome, "wrong");
  const doc = fs.readFileSync(path.join(__dirname, "../docs/learner-events.md"), "utf8");
  const documented = doc.split("\n").filter((line) => line.indexOf('"schema_version":2') !== -1 && line.indexOf('"sense_id"') !== -1);
  assert.strictEqual(documented.length, 1, "the doc shows one sample line");
  assert.strictEqual(documented[0], sampleLine, "node tools/sample-learner-event.js regenerates the documented line");
  const script = fs.readFileSync(path.join(__dirname, "../tools/sample-learner-event.js"), "utf8");
  assert.ok(script.includes("sampleEvent"));
  const words = fs.readFileSync(path.join(__dirname, "../words.js"), "utf8");
  assert.ok(words.includes('QUIZMARIO_CONTENT_VERSION = "words-v12"'));
}

console.log("learner-events ok");

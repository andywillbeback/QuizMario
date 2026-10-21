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
  assert.ok(!/已同步到\s*ALS/.test(doc + sql));
}

console.log("learner-events ok");

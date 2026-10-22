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
  assert.strictEqual(remote, null, "unmapped ALS rows stay out of the local store");
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

{
  const sense = "ability.n.能力";
  const types = ["sense_return", "vocab.sense_return", "als.sense_return"];
  assert.deepStrictEqual(le.ALS_RETURN_TYPES, types);
  types.forEach((type, i) => {
    const row = le.fromRemote({
      event_id: "20000000-0000-4000-8000-00000000000" + i,
      learner_id: UID,
      user_id: UID,
      source: "als",
      event_type: type,
      created_at: NOW,
      payload: { sense_id: sense },
    });
    assert.ok(row, type);
    assert.strictEqual(row.source, "als", "pull keeps the real ALS source");
    assert.strictEqual(row.event_type, type);
    assert.strictEqual(row.sense_id, sense);
    assert.strictEqual(le.publicEvent(row).source, "als");
    assert.strictEqual(le.cloudRow(row), null, "ALS rows are not shaped into a quizmario upload");
    assert.strictEqual(le.toJsonl([row]), "", "QM JSONL does not copy or rewrite an ALS return");
  });

  const store = le.emptyStore();
  store.learner_id = UID;
  const local = wrong({ event_id: "10000000-0000-4000-8000-0000000000d1" });
  le.append(store, local);
  const returned = le.fromRemote({
    event_id: "20000000-0000-4000-8000-00000000000a",
    learner_id: UID,
    user_id: UID,
    source: "als",
    event_type: "sense_return",
    created_at: "2026-10-22T03:00:00.000Z",
    payload: JSON.stringify({ sense_id: sense }),
  });
  le.append(store, returned);
  const pending = le.pendingRows(store, { force: true });
  assert.strictEqual(pending.length, 1);
  assert.strictEqual(pending[0].event_id, local.event_id);
  assert.strictEqual(pending[0].source, "quizmario");
  assert.ok(pending.every((row) => row.source === "quizmario"));
  const exported = le.toJsonl(store.events);
  assert.ok(exported.indexOf('"source":"quizmario"') !== -1);
  assert.ok(exported.indexOf('"source":"als"') === -1);
  assert.ok(exported.indexOf("sense_return") === -1);
  assert.strictEqual(store.events.filter((ev) => ev.source === "als").length, 1);
}

{
  const calls = [];
  function builder(reply) {
    const state = { eqs: [], inn: null };
    const api = {
      select() { return api; },
      eq(key, value) { state.eqs.push([key, value]); return api; },
      in(key, value) { state.inn = [key, value.slice()]; return api; },
      order() { return api; },
      limit(n) {
        state.limit = n;
        calls.push(state);
        return Promise.resolve(reply(state));
      },
    };
    return api;
  }
  const client = {
    from(table) {
      assert.strictEqual(table, "learner_events");
      return builder((state) => {
        const source = state.eqs.filter((pair) => pair[0] === "source").map((pair) => pair[1])[0];
        if (source === "quizmario") {
          return {
            data: [{
              event_id: "30000000-0000-4000-8000-000000000001",
              learner_id: UID,
              user_id: UID,
              source: "quizmario",
              event_type: "vocab.answer_wrong",
              headword: "ability",
              payload: { headword: "ability", sense_id: "ability.n.能力" },
              created_at: NOW,
            }],
            error: null,
          };
        }
        assert.strictEqual(source, "als");
        assert.deepStrictEqual(state.inn, ["event_type", le.ALS_RETURN_TYPES]);
        return {
          data: [
            {
              event_id: "30000000-0000-4000-8000-000000000002",
              learner_id: UID,
              user_id: UID,
              source: "als",
              event_type: "sense_return",
              payload: { sense_id: "ability.n.能力" },
              created_at: "2026-10-22T04:00:00.000Z",
            },
            {
              event_id: "30000000-0000-4000-8000-000000000003",
              learner_id: UID,
              user_id: UID,
              source: "als",
              event_type: "als.session_end",
              payload: { sense_id: "ability.n.能力" },
              created_at: "2026-10-22T04:01:00.000Z",
            },
          ],
          error: null,
        };
      });
    },
  };
  le.fetchRemoteRows(client, UID).then((fetched) => {
    assert.strictEqual(fetched.error, null);
    assert.strictEqual(calls.length, 2, "pull reads quizmario rows and ALS returns separately");
    assert.ok(calls.every((call) => call.eqs.some((pair) => pair[0] === "learner_id" && pair[1] === UID)));
    assert.strictEqual(calls[0].limit, le.MAX_EVENTS);
    const store = le.emptyStore();
    store.learner_id = UID;
    const merged = le.mergeRemote(store, fetched.rows);
    assert.strictEqual(merged.added, 2, "session_end is dropped; the sense_return is kept");
    assert.deepStrictEqual(store.events.map((ev) => ev.source).sort(), ["als", "quizmario"]);
    const als = store.events.find((ev) => ev.source === "als");
    assert.strictEqual(als.event_type, "sense_return");
    assert.strictEqual(als.sense_id, "ability.n.能力");
    const rows = le.pendingRows(store, { force: true });
    assert.ok(rows.every((row) => row.source === "quizmario" && row.event_type !== "sense_return"));
    const loop = require("../home-loop");
    const book = {
      "zhongkao::ability": { lemma: "ability", pos: "n.", gloss_zh: "能力", active: true, alsDeepDone: false },
      "zhongkao::accept": { lemma: "accept", sense_id: "accept.v.接受", pos: "v.", gloss_zh: "接受", active: true, alsDeepDone: false },
    };
    const events = store.events.map(le.publicEvent);
    assert.strictEqual(loop.markDeepQualified(book, events), true);
    assert.strictEqual(book["zhongkao::ability"].alsDeepDone, true);
    assert.strictEqual(book["zhongkao::accept"].alsDeepDone, false);
    const mid = loop.homeDeepTrain({
      signedIn: true,
      onHome: true,
      mustCount: 4,
      items: [book["zhongkao::ability"], book["zhongkao::accept"]],
      events: events,
    });
    assert.strictEqual(mid.visible, true);
    assert.strictEqual(mid.count, 1);
    assert.strictEqual(mid.text, "1 个错词待 ALS 深练");
    const accept = le.fromRemote({
      event_id: "30000000-0000-4000-8000-000000000004",
      learner_id: UID,
      user_id: UID,
      source: "als",
      event_type: "vocab.sense_return",
      payload: { sense_id: "accept.v.接受" },
      created_at: "2026-10-22T05:00:00.000Z",
    });
    events.push(le.publicEvent(accept));
    assert.strictEqual(loop.markDeepQualified(book, events), true);
    const gone = loop.homeDeepTrain({
      signedIn: true,
      onHome: true,
      mustCount: 4,
      items: [book["zhongkao::ability"], book["zhongkao::accept"]],
      events: events,
    });
    assert.strictEqual(gone.visible, false, "empty deep-train debt hides the CTA");
    assert.strictEqual(gone.count, 0);
    assert.strictEqual(loop.alsReturnCounts(events), null, "sense_return is not ALS 补了 / 回流词");
    const full = le.emptyStore();
    for (let i = 0; i < le.MAX_EVENTS; i++) {
      le.append(full, wrong({
        event_id: "40000000-0000-4000-8000-" + String(i).padStart(12, "0"),
        created_at: "2026-10-22T08:00:" + String(i % 60).padStart(2, "0") + ".000Z",
      }));
    }
    assert.strictEqual(full.events.length, le.MAX_EVENTS);
    const oldReturn = le.fromRemote({
      event_id: "30000000-0000-4000-8000-000000000099",
      learner_id: UID,
      user_id: UID,
      source: "als",
      event_type: "als.sense_return",
      payload: { sense_id: "ability.n.能力" },
      created_at: "2020-01-01T00:00:00.000Z",
    });
    le.append(full, oldReturn);
    // Soft overflow: every row above was still unuploaded, so the return
    // is kept without dropping them (Q6 / 聚光单词（grok）).
    assert.strictEqual(full.events.length, le.MAX_EVENTS + 1,
      "unuploaded quizmario rows soft-overflow past the 800 cap with an ALS return");
    assert.ok(full.events.some((ev) => ev.source === "als" && ev.sense_id === "ability.n.能力"),
      "ALS return is kept");
    assert.strictEqual(
      full.events.filter((ev) => ev.source !== "als").length,
      le.MAX_EVENTS,
      "no unuploaded quizmario row was dropped for the return"
    );

    {
      // Cap may drop uploaded quizmario, never pending ones.
      const mix = le.emptyStore();
      mix.learner_id = UID;
      for (let i = 0; i < le.MAX_EVENTS; i++) {
        const ev = wrong({
          event_id: "42000000-0000-4000-8000-" + String(i).padStart(12, "0"),
          created_at: "2026-10-22T10:00:" + String(i % 60).padStart(2, "0") + ".000Z",
        });
        le.append(mix, ev);
        le.markUploaded(mix, [ev.event_id]);
      }
      assert.strictEqual(mix.events.length, le.MAX_EVENTS);
      const pendingIds = [];
      for (let i = 0; i < 50; i++) {
        const ev = wrong({
          event_id: "41000000-0000-4000-8000-" + String(i).padStart(12, "0"),
          created_at: "2026-10-22T11:00:" + String(i % 60).padStart(2, "0") + ".000Z",
        });
        le.append(mix, ev);
        pendingIds.push(ev.event_id);
      }
      // Soft overflow: 50 pending + up to 750 newest uploaded.
      assert.strictEqual(mix.events.length, le.MAX_EVENTS);
      for (const id of pendingIds) {
        assert.ok(mix.events.some((ev) => ev.event_id === id), "pending " + id + " survived trim");
      }
      assert.strictEqual(le.pendingRows(mix, { force: true }).length, 50);
      // due dedupe still collapses same card + due_at
      const dueA = le.buildEvent({
        event_type: le.TYPES.DUE,
        learner_id: UID,
        headword: "ability",
        item_id: "zhongkao|0::ability",
        track: "zhongkao",
        due_at: "2026-10-23T00:00:00.000Z",
        created_at: "2026-10-22T11:00:00.000Z",
      });
      const dueB = le.buildEvent({
        event_type: le.TYPES.DUE,
        learner_id: UID,
        headword: "ability",
        item_id: "zhongkao|0::ability",
        track: "zhongkao",
        due_at: "2026-10-23T00:00:00.000Z",
        created_at: "2026-10-22T11:01:00.000Z",
      });
      const d1 = le.append(mix, dueA);
      const d2 = le.append(mix, dueB);
      assert.strictEqual(d2.duplicate, true, "offline retry of same due is deduped");
      assert.strictEqual(d1.event.event_id, d2.event.event_id);
    }

    const sync = fs.readFileSync(path.join(__dirname, "../sync.js"), "utf8");
    assert.ok(sync.includes("await window.QuizMarioLearnerEvents.bindUser(user)"),
      "home sync waits for the pull before the session-ready paint");
    const game = fs.readFileSync(path.join(__dirname, "../game.js"), "utf8");
    assert.ok(game.includes("markDeepQualified") && game.includes("onLearnerEvents"));
    const leSrc = fs.readFileSync(path.join(__dirname, "../learner-events.js"), "utf8");
    assert.ok(leSrc.includes('addEventListener("online"'), "online retries pending flush + pull");
    assert.ok(leSrc.includes('addEventListener("pageshow"'), "pageshow re-pulls ALS returns after ALS tab");
    assert.ok(leSrc.includes("retryOutboxAndPull"), "Q4/Q6 retry helper present");
    assert.ok(leSrc.includes("Soft-overflow") || leSrc.includes("soft-overflow") || leSrc.includes("unuploaded"),
      "trim documents unuploaded soft-overflow");
    const rules = fs.readFileSync(path.join(__dirname, "../srs-rules.js"), "utf8");
    assert.ok(!rules.includes("alsDeepDone") && !rules.includes("sense_return"),
      "recognition schedule() does not learn about ALS returns");
    console.log("learner-events ok");
  }).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

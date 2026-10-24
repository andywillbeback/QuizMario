# QuizMario learner_events → ALS

QuizMario emits **signals**. The Anki-lite / SM-2 clock stays in `srs-rules.js` (`due`, `interval`, `reps`). ALS must not schedule cards from these rows.

This is the QuizMario half of the closed loop. ALS already writes its own SQLite `learner_events` and can ingest this JSONL. There is no browser-to-browser sync with the ALS Mac app.

## Identity

Same Supabase email and password as ALS. Both `learner_id` and `user_id` are the Supabase `auth.users.id` UUID. ALS ingest accepts `user_id` as an alias of `learner_id`.

## Event types (`source` is always `"quizmario"`)

| `event_type` | When QuizMario emits it | `payload` |
|---|---|---|
| `vocab.answer_wrong` | A multiple-choice pick is wrong | `headword`, `track`, `gloss_zh`, `outcome` `"wrong"`, optional `answer` (the picked word), optional `reason` (`form` 形近, `sense` 义近, `pos` 词性, `other` 其他/未归类) and `reason_zh`. Missing `reason` means that pick was not classified. |
| `vocab.answer_unknown` | The student taps「不会」instead of guessing | `headword`, `track`, `gloss_zh`, `outcome` `"unknown"`. Not a wrong pick: no `answer`, and the daily log counts `unk` rather than `w`. |
| `vocab.wrong_book_add` | The lemma **enters** 错词本 (a new miss, or a cumulative `wrong >= 2` scan). A later miss while it is already in the book does not emit again. | `headword`, `track`, `gloss_zh` |
| `vocab.due_review` | The home screen builds today's due queue, or the student opens 今日到期 / continue-into-due. Same card + `due_at` is emitted once. | `headword`, `due_at` (ISO-8601 UTC), `track`, `gloss_zh` |
| `vocab.answer_correct` | A multiple-choice pick is correct (before Good / Easy). Good / Easy only moves the QM clock. | `headword`, `track`, `gloss_zh` |

Top-level fields on every row: `event_id`, `learner_id`, `user_id`, `source`, `event_type`, `created_at`, `headword`, optional `item_id` (QM card key), optional `cefr_level` (`ket` → `A2`, `pet` → `B1` only).

`headword` is lowercased. `vocab.due_review` always has `payload.due_at`. A card with no absolute due timestamp uses `1970-01-01T00:00:00.000Z` so the same queue does not emit again on every refresh.

## Schema v2 (sense and evidence)

New rows set `schema_version` to `2`. A line with no `schema_version` is v1. Both parse: v2 only adds keys. `learner_id`, `user_id`, `headword`, `event_type`, and the old `payload` keys (`headword`, `track`, `gloss_zh`, `answer`, `reason`, `outcome`, `due_at`) stay where they were.

Identity, when the Supabase uid is known:

| Field | Meaning |
|---|---|
| `canonical_learner_id` | Same uuid as `learner_id`. The id ALS should treat as the learner. |
| `source_user_id` | QuizMario's user id. Today that is the same Supabase `auth.users.id` as `user_id`. |
| `source_event_id` | Id QuizMario assigned at emission. Defaults to `event_id`. |

These three are also copied into `payload`, because the Supabase table has no new columns. The upsert sends only `event_id`, `learner_id`, `user_id`, `source`, `event_type`, `payload`, `created_at`, `item_id`, `headword`, `frame_id`, `cefr_level`, `run_purpose`. A database that never re-ran the SQL still accepts the insert.

Evidence, only when QuizMario actually has it:

| Field | When it is set |
|---|---|
| `sense_id` | Bank `sense_id` if the card has one (`sense_id_kind` `"bank"`). Otherwise a provisional key (`sense_id_kind` `"provisional"`). |
| `lemma` | Lowercased headword. |
| `pos` | Bank part of speech, unchanged (`v.`, `n.`, `adj.`). Omitted when the card has none. |
| `task_direction` | `recognition` (看英文选中文, QM `meaning`) or `production` (看中文选英文 / 拼写). |
| `task_direction_detail` | QM's own direction when it is finer than the two-way split: `meaning`, `form`, or `spelling`. |
| `attempt` | `first_attempt` or `retry`. A retry is the same session's later card after a miss (`_repeat`). |
| `answer_exposed` | Whether the answer was already shown before this attempt. `false` is tracked, not omitted. |
| `answer_exposed_at` | ISO time of that reveal, when the requeue stamped it. |
| `hint_exposed`, `hint_exposed_at` | Only if a caller tracks a hint separately. The always-on example line is not a hint exposure, and QuizMario does not time it. |
| `review_interval_days`, `review_interval_ms` | The SRS `interval` already on the card, in days and milliseconds. Omitted for a new card. This is not a request for ALS to schedule the card. `reps` is still not included. |
| `content_version`, `bank_version` | Core bank is `words-v12` (`window.QUIZMARIO_CONTENT_VERSION`). Other tracks use `exam-tracks:<track id>` until those files grow their own stamp. The two fields match unless a caller passes both. |
| `grade_status` | `again` (wrong pick), `unknown` (不会), `pending` (correct, Good/Easy not chosen yet), `good`, `easy`. Due and wrong-book rows have none. |
| `score` | SM-2 quality when graded: `0` again/unknown, `1` good, `2` easy. Absent while `pending`. |
| `evidence_kind` | `typed_spelling` for 拼写 key-in, `mc_recognition` for 看英文选中文, `mc_production` for 看中文选英文 / 今日必练. Omitted when the caller does not set one of those three. |
| `independent` | Typed spelling only. `true` once the typed streak is 稳定, otherwise `false`. `false` is stored. Meaning and 今日必练 do not set it. Old multiple-choice spelling is not independent. |

`sense_id` provisional form is `lemma.pos.gloss_zh`. The POS token drops a trailing dot, so `v.` becomes `v` and the key is `communicate.v.交流`. Split on the first two `.` only; the gloss is the remainder and may contain `；` or spaces. Unknown POS keeps an empty slot: `communicate..交流`. Lemma only, with no gloss, is `sense_id_kind` `"lemma_only"` and is not a sense distinction. `sense-id.js` (`may:month`, `china:country`) is the card-key disambiguator for a few surfaces. It is not the bank sense id and is not written as `sense_id` unless a card already carries that field.

A correct pick is stored as `grade_status` `"pending"` and is not uploaded until Good / Easy sets `good` or `easy`, or until a forced flush (leaving the page, or the export button). The Supabase role is still append-only: if a `pending` row was already inserted, a later Good/Easy updates the local JSONL only.

This richness is the probe feed. It does not add an ALS panel to the student login page, and it does not turn on a free always-sync control.

Example (regenerate with `node tools/sample-learner-event.js`):

```json
{"event_id":"7c1a9c2e-4b18-4f0a-9c1d-2a6e5b8d0f11","learner_id":"11111111-1111-4111-8111-111111111111","user_id":"11111111-1111-4111-8111-111111111111","source":"quizmario","event_type":"vocab.answer_wrong","created_at":"2026-10-22T00:00:00.000Z","schema_version":2,"source_event_id":"7c1a9c2e-4b18-4f0a-9c1d-2a6e5b8d0f11","canonical_learner_id":"11111111-1111-4111-8111-111111111111","source_user_id":"11111111-1111-4111-8111-111111111111","sense_id":"communicate.v.交流","sense_id_kind":"provisional","lemma":"communicate","pos":"v.","task_direction":"recognition","task_direction_detail":"meaning","attempt":"first_attempt","answer_exposed":false,"review_interval_days":3,"review_interval_ms":259200000,"content_version":"words-v12","bank_version":"words-v12","grade_status":"again","score":0,"item_id":"zhongkao|0::communicate","headword":"communicate","payload":{"headword":"communicate","track":"zhongkao","gloss_zh":"交流","answer":"community","reason":"form","reason_zh":"形近","outcome":"wrong","schema_version":2,"source_event_id":"7c1a9c2e-4b18-4f0a-9c1d-2a6e5b8d0f11","canonical_learner_id":"11111111-1111-4111-8111-111111111111","source_user_id":"11111111-1111-4111-8111-111111111111","sense_id":"communicate.v.交流","sense_id_kind":"provisional","lemma":"communicate","pos":"v.","task_direction":"recognition","task_direction_detail":"meaning","attempt":"first_attempt","answer_exposed":false,"review_interval_days":3,"review_interval_ms":259200000,"content_version":"words-v12","bank_version":"words-v12","grade_status":"again","score":0}}
```

## Where the rows live

1. **This browser:** `localStorage` key `quizmario_learner_events_v1` (latest 800). The student login page and home do not show an ingest panel. On the game page console, call `QuizMarioLearnerEvents.download()` or `QuizMarioLearnerEvents.copyJsonl()`. `?alsDebug=1` (or `localStorage.quizmario_als_debug = "1"`) mounts the panel on the game home only, never on login.
2. **Supabase** `public.learner_events`, after you run `supabase/learner_events.sql` in the SQL editor. Logged-in inserts use the anon key and RLS. SELECT is `auth.uid() = learner_id` with no source filter, so the signed-in student can read ALS rows stored for that same learner. INSERT still requires `source = 'quizmario'` (and `user_id = auth.uid()`). The browser cannot write `source = als`. The table is append-only for the browser role (no update/delete policy). A missing table or a failed insert leaves the local outbox intact and does **not** change `user_progress` sync.
3. **ALS SQLite** only after the Mac ingest below. The site never says the events were synced to ALS.

Login pulls two sets for this `learner_id`: the latest 800 `source = quizmario` rows, and the latest 800 `source = als` rows whose `event_type` is `sense_return`, `vocab.sense_return`, or `als.sense_return`. QuizMario rows come back into the outbox so a second browser can export them. ALS returns stay in the local store with their real `source` (`als`). They are not rewritten to `quizmario`, not uploaded, and not copied into the QM JSONL export. `sense_id` is read from `payload` (the table has no `sense_id` column). Other ALS event types are ignored. A return that arrives after this page's pull is picked up on the next signed-in load. QuizMario's own emitters still always set `source` to `quizmario`.

## ALS ingest (Mac)

Copy the downloaded file to the ALS inbox, then run the existing ingester. Pass the Supabase uid if the script requires `--learner` (the file already sets `learner_id` / `user_id` to that uid).

```bash
cp ~/Downloads/quizmario-learner-events-*.jsonl data/learner_events_inbox/quizmario.jsonl

.venv/bin/python scripts/ingest_learner_events.py \
  --learner <supabase-auth-uid> \
  data/learner_events_inbox/quizmario.jsonl
```

Field names the ingester should read: `event_id`, `learner_id` (or `user_id`), `source`, `event_type`, `payload`, `created_at`, `item_id`, `headword`, `cefr_level`. For due signals, read `payload.due_at`. v2 lines also carry `schema_version`, `canonical_learner_id`, `source_user_id`, `source_event_id`, and, when QuizMario had them, `sense_id`, `lemma`, `pos`, `task_direction`, `attempt`, `answer_exposed`, `review_interval_days`, `content_version` / `bank_version`, `grade_status`, `score`, `evidence_kind`, and `independent`. The same evidence keys are inside `payload` for a Supabase reader. Ignore unknown keys. Do not treat `review_interval_days` as a schedule to apply; `reps` is still not on the event. A v1 line has no `schema_version` and still parses.

## 错词本 → ALS 深练 (QuizMario half)

Recognition SRS stays in QuizMario. `schedule()` does not move because an ALS sentence pass happened. Deep-train debt is also not 「ALS 补了 / 回流词」: that strip stays empty until real `source=als` outcome rows can be mapped.

An active 错词本 row owes deep practice until `alsDeepDone` is set. A readable event sets that flag when `source=als` and `event_type` is `sense_return`, `vocab.sense_return`, or `als.sense_return` for that `sense_id`, and `created_at` is newer than the row's last miss. A return already in the local store does not close the debt again after a later miss. The next return after that miss does. A QuizMario `vocab.wrong_book_add` does not clear the debt. Two correct ratings inside 今日必练 graduate the book row and do not mark the debt done by themselves. A new miss clears `alsDeepDone`.

When that debt is above zero, the signed-in student home shows 「N 个错词待 ALS 深练」 and a primary link, including while 今日必练 still has cards. The daily soft gate shows the same link so it is not buried. 「去 ALS 修语法」 remains the bare side door after 今日必练. The student home does not show an ingest panel or claim that ALS already stored the rows.

Both links open `http://127.0.0.1:8501/` (local Streamlit). The deep-train link puts both ALS contracts on the same URL. The Mac tip reads `deep_train=1` and `sense_ids` (one URL-decoded comma-separated list of unique sense ids). The repeated groups stay for a parser that zips `sense_id`, `headword`, `gloss_zh`, and `track` by index.

```text
http://127.0.0.1:8501/?qm_deep=1&run_purpose=als_deep_train&deep_train=1&sense_ids=ability.n.%E8%83%BD%E5%8A%9B&sense_id=ability.n.%E8%83%BD%E5%8A%9B&headword=ability&gloss_zh=%E8%83%BD%E5%8A%9B&track=zhongkao
```

`qm_deep=1` and `deep_train=1` both mean this entry is wrong-book deep practice, not the grammar side door. `sense_id` is the bank id when the card has one, otherwise the provisional `lemma.pos.gloss_zh` key (POS trailing dot removed). Two senses join as `sense_ids=first%2Csecond` after `encodeURIComponent` of the comma-separated list.

「ALS 没打开？先保存这批错词」 downloads `quizmario-als-deep-train.jsonl` for the same senses. Each line is a `source=quizmario` `vocab.wrong_book_add` row with `schema_version` 2, `run_purpose` `als_deep_train`, and L2 fields `sense_id`, `headword`, `gloss_zh`, `track` (plus `lemma` and `pos` when known) on the line and inside `payload`. Drop that file in the inbox and run the existing ingester. Do not schedule QuizMario cards from it. Prefer these senses in Repair → Rebuild → Vary → Transfer until an independent-evidence gate passes, then emit `sense_return` (or `vocab.sense_return` / `als.sense_return`) with `source=als`, the same `learner_id`, and the same `sense_id` inside `payload`. The signed-in client pulls that row and sets `alsDeepDone`, which drops the deep CTA. `schedule()` does not move. The browser role cannot insert `source=als`; ALS writes that row with a key that bypasses RLS, and `learner_id` / `user_id` must be the student's auth uid. If ALS only writes its SQLite file, or uses a different `learner_id`, the debt stays.

```bash
node tools/sample-learner-event.js
```

## Supabase setup

In the Dashboard SQL editor, run `supabase/learner_events.sql` once (same project as `user_progress`). Then reload QuizMario, answer once, and confirm a row in **Table Editor → learner_events**.

## Pages preview check

1. Open the Pages preview, log in with the shared student account.
2. Pick 中考, answer one card wrong. 错词本 should gain that word.
3. Login and the home do not show 「ALS 学习信号」, 「下载 JSONL」, or a learner_events ingest note. In the console, `QuizMarioLearnerEvents.list()` includes `vocab.answer_wrong` and, if the word newly entered the book, `vocab.wrong_book_add`. It must not say the rows were synced to ALS.
4. If today's due queue is non-empty, `list()` includes `vocab.due_review` rows with `payload.due_at`. Opening 今日必练 again does not duplicate the same `due_at`.
5. `QuizMarioLearnerEvents.download()` saves JSONL. Each line parses as JSON, `source` is `quizmario`, and `learner_id` is the Supabase uid.
6. In Supabase, the same `event_id`s are rows in `learner_events`. If the SQL has not been run, the console export still returns JSONL. Progress sync (`已登录 · 已同步`) still refers only to `user_progress`. With `?alsDebug=1` the game home can show that the table is missing; that panel is not on the login page.

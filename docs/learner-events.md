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

Example:

```json
{"event_id":"7c1a9c2e-4b18-4f0a-9c1d-2a6e5b8d0f11","learner_id":"11111111-1111-4111-8111-111111111111","user_id":"11111111-1111-4111-8111-111111111111","source":"quizmario","event_type":"vocab.answer_wrong","headword":"communicate","item_id":"zhongkao|0::communicate","created_at":"2026-10-21T06:00:00.000Z","payload":{"headword":"communicate","track":"zhongkao","gloss_zh":"交流","answer":"community","outcome":"wrong"}}
```

## Where the rows live

1. **This browser:** `localStorage` key `quizmario_learner_events_v1` (latest 800). The student login page and home do not show an ingest panel. On the game page console, call `QuizMarioLearnerEvents.download()` or `QuizMarioLearnerEvents.copyJsonl()`. `?alsDebug=1` (or `localStorage.quizmario_als_debug = "1"`) mounts the panel on the game home only, never on login.
2. **Supabase** `public.learner_events`, after you run `supabase/learner_events.sql` in the SQL editor. Logged-in inserts use the anon key and RLS (`auth.uid() = learner_id`, `source = 'quizmario'`). The table is append-only for the browser role (no update/delete policy). A missing table or a failed insert leaves the local outbox intact and does **not** change `user_progress` sync.
3. **ALS SQLite** only after the Mac ingest below. The site never says the events were synced to ALS.

Login pulls this user's `source = quizmario` rows back into the outbox so a second browser can export them. Rows with `source = als` are not copied into the QM export.

## ALS ingest (Mac)

Copy the downloaded file to the ALS inbox, then run the existing ingester. Pass the Supabase uid if the script requires `--learner` (the file already sets `learner_id` / `user_id` to that uid).

```bash
cp ~/Downloads/quizmario-learner-events-*.jsonl data/learner_events_inbox/quizmario.jsonl

.venv/bin/python scripts/ingest_learner_events.py \
  --learner <supabase-auth-uid> \
  data/learner_events_inbox/quizmario.jsonl
```

Field names the ingester should read: `event_id`, `learner_id` (or `user_id`), `source`, `event_type`, `payload`, `created_at`, `item_id`, `headword`, `cefr_level`. For due signals, read `payload.due_at`. Do not read QM `interval` / `reps` from these events; they are not included.

## Supabase setup

In the Dashboard SQL editor, run `supabase/learner_events.sql` once (same project as `user_progress`). Then reload QuizMario, answer once, and confirm a row in **Table Editor → learner_events**.

## Pages preview check

1. Open the Pages preview, log in with the shared student account.
2. Pick 中考, answer one card wrong. 错词本 should gain that word.
3. Login and the home do not show 「ALS 学习信号」, 「下载 JSONL」, or a learner_events ingest note. In the console, `QuizMarioLearnerEvents.list()` includes `vocab.answer_wrong` and, if the word newly entered the book, `vocab.wrong_book_add`. It must not say the rows were synced to ALS.
4. If today's due queue is non-empty, `list()` includes `vocab.due_review` rows with `payload.due_at`. Opening 今日必练 again does not duplicate the same `due_at`.
5. `QuizMarioLearnerEvents.download()` saves JSONL. Each line parses as JSON, `source` is `quizmario`, and `learner_id` is the Supabase uid.
6. In Supabase, the same `event_id`s are rows in `learner_events`. If the SQL has not been run, the console export still returns JSONL. Progress sync (`已登录 · 已同步`) still refers only to `user_progress`. With `?alsDebug=1` the game home can show that the table is missing; that panel is not on the login page.

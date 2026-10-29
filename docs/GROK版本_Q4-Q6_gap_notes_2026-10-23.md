# Grok版本 — 聚光单词（grok）Q4 / Q5 / Q6 gap notes

**Not Andy-done.** Draft for morning review. Parallel to ChatGPT; naming locked: **聚光单词（grok）**, **ALS（grok）**, pack **Grok版本**.

Live path baseline: PR #40 deep-train CTA + PR #41 sense_return clear @ `main`.

## Gaps found (before this pack)

| ID | Gap | Severity |
|---|---|---|
| Q6 | `trim()` preferred ALS returns then newest rest; a busy outbox of **unuploaded** quizmario rows could be dropped when length > 800 before flush. Offline / tab-return had no `online` or visible re-pull retry beyond `pagehide`/`hidden` flush. | High |
| Q4 | `pullOnce` set `pulled=true` for the session; returning from the ALS tab without a full reload did not re-pull `sense_return`, so debt/CTA could stay stale until next login/bind. Learner + sense_id on handoff/URL/wrong-book were already on #40/#41. | Medium |
| Q5 | QM closed debt on any `source=als` sense_return type + miss clock. ALS emit already gates on `qualified_for_sense_return` / independent evidence, but QM ignored explicit `false` / recognition-only payload fields if they ever landed. | Medium (contract honor) |

## What this pack changed

1. **Q6** (`learner-events.js`): trim never drops unuploaded `source=quizmario` or ALS `sense_return` rows; soft-overflow above 800 when pending + returns require it; only uploaded quizmario may be trimmed. `online` / `pageshow` / `visibilityState===visible` call `retryOutboxAndPull` (reset `pulled`, force flush + re-pull). A failed pending upsert still re-pulls, then reports the upload error. Existing due dedupe + upsert `ignoreDuplicates` keep retries safe.
2. **Q4**: same re-pull on return/visible/online so learner continuity + sense_return map after ALS tab without inventing new product fields. Handoff still stamps `learner_id` / `sense_id` as on main.
3. **Q5** (`home-loop.js`): `returnEvidenceOk` / `qualifiesAlsReturn` reject explicit `qualified_for_sense_return=false`, `independent=false`, recognition-only `task_direction`/`evidence_kind`. Legacy omit still qualifies. **`returnClearsMiss` / `lastMissAt` unchanged** (PR #41 miss clock preserved).
4. Docs + tests updated; helpers exported for unit coverage.

## NOT_DONE (morning Andy)

- No live Supabase service-role smoke; no `identity_map` bind.
- No squash-merge to `main` (new scope; leave draft).
- Local node ACE verify on this branch fixed two holes: trim no longer drops ALS returns to fit a partial outbox, and a failed upsert still re-pulls. Still not Andy-done.
- ChatGPT parallel pack not compared here.
- Q1–Q3, Q7–Q9 and ALS A1–A12 out of tonight’s QuizMario Q4–Q6 scope.
- Soft-overflow can grow localStorage if flush stays blocked for a long time — still safer than dropping signals; ops watch if needed.

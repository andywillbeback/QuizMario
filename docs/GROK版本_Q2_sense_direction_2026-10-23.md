# Grok版本 — 聚光单词（grok） Q2 义项与练习方向分开

**Date:** 2026-10-23 Asia/Shanghai  
**Branch:** `grok/q2-sense-direction`  
**Base:** `main` @ `692387e` (#41)  
**Rebase note:** Branched from `main` (same tip as #43/#44 bases). Does **not** include PR #44 Q1 typed spelling. After #44 merges, rebase this branch — `practice.noteSpelling` / typed·mc shape from Q1 should compose with `noteDirection`; session `form` bucket and `task_direction=spelling` are additive.  
**PR:** (filled after open)  
**Not Andy-done / not live.** Leave draft; do not merge. PR #43 / #44 left alone.

## Checklist

> 英文→词义、中文→英文识别、独立拼写分别记录，统一两端义项编号。

| Check | Result |
|-------|--------|
| Per-card `directions.en_zh` / `directions.zh_en` separate | PASS |
| Spelling stays on `prog.spelling`, not mixed into recognition | PASS |
| Session `save.practice.form` alongside meaning / spelling | PASS |
| `task_direction=spelling` first-class (not production) | PASS |
| Canonical details `en_zh` / `zh_en` / `spelling`\|`typed` | PASS |
| Shared `QuizMarioSense.provisionalSenseId` / `resolveSenseKey` / `sameSenseId` | PASS |
| LE + home-loop provisional keys match Sense | PASS |
| Draft PR labeled Grok版本 / 聚光单词（grok） | PASS |

## Inspect (before)

- Sessions already split `meaning` / `form` / `spelling`, but `save.practice` only tallied meaning+spelling (form attempts invisible).
- Per-card progress had `prog.spelling` only; en→zh and zh→en shared the SM-2 clock with **no** separate direction tallies.
- `learner-events.resolveDirection` mapped spelling → `task_direction=production` + detail `spelling`.
- Provisional sense keys were duplicated in `learner-events.js` and `home-loop.js` with no shared contract doc.

## Changes

1. **`practice.js`**: `noteDirection` / `directionSignal` / `normalizeDirectionKey`; `prog.directions.en_zh|zh_en`; `ensureSessionPractice` adds `form`.
2. **`learner-events.js`**: spelling → `task_direction=spelling`; meaning→detail `en_zh`; form→detail `zh_en`; Sense contract when loaded.
3. **`sense-id.js`**: `provisionalSenseId`, `resolveSenseKey`, `sameSenseId`, `posToken`.
4. **`home-loop.js`**: uses Sense provisional helper when available.
5. **`game.js`**: bumps `form` for zh→en; records `noteDirection` on grade.
6. **`feedback.js`**: direction labels accept `en_zh` / spelling.
7. **Docs**: `docs/GROK版本_sense_id_contract_Q2.md` + learner-events.md Q2 table.
8. **Tests**: `tests/sense-direction.test.js` + learner-events expectations.

## Local tests

```bash
node tests/sense-direction.test.js
node tests/learner-events.test.js
node tests/p1.test.js
node tests/home-loop.test.js
node tests/learner-event-emitters.test.js
node tests/review-queues.test.js
node tests/sync-merge.test.js
node tests/must-remain.test.js
node tests/error-types.test.js
node tests/placement.test.js
node tests/progress-narrative.test.js
```

All listed green on this tip.

## NOT_DONE

- Andy review / Pages smoke
- Merge to main
- Rebase onto #44 after Q1 lands
- Live identity / service-role (out of Q2 scope)
- Radar fourth axis still meaning/spelling/retention/hint (form tracked in session, not forced into radar)

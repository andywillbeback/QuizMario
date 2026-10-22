# Grok版本 — 聚光单词（grok） Q3 修正延迟保持与错词毕业

**Date:** 2026-10-23 Asia/Shanghai  
**Branch:** `grok/q3-delay-graduation`  
**Base:** `main` @ `692387e` (#41)  
**Not Andy-done / not live.** Leave draft; do not merge.  
Leaves alone: PR #43 @ `78077c8`, PR #44 @ `203664d`, PR #45 @ `8d48cc8`.

## Checklist

> 按实际间隔检查；同轮连续答对不直接等于长期掌握。

| Check | Result |
|-------|--------|
| Inspect wrongbook graduation + SRS delay on main | PASS |
| Same-session consecutive corrects ≠ graduate | PASS (`sessionCleared` only) |
| Graduation requires later calendar day than `lastCorrectAt` | PASS |
| SRS 已学会 still cross-day only (unchanged) | PASS |
| Draft PR labeled Grok版本 / 聚光单词（grok） Q3 | (opened after push) |
| Tests green | (local suite) |

## Before

- `noteWrongBookCorrect`: streak ≥ 2 → `active=false` (same session OK)
- `srs-rules.js` 已学会 already required cross-day clean hit

## After (Q3)

- Same calendar day as `lastCorrectAt`: increment streak; at 2 set `sessionCleared`; **stay active**
- Later calendar day than `lastCorrectAt`: **graduate**
- Miss / re-enter: reset streak, `sessionCleared`, `lastCorrectAt`
- UI copy: 同轮连对≠长期掌握；隔天再认对才毕业

## Files

- `review-queues.js`, `game.js`, `docs/learner-events.md`
- `tests/delay-graduation.test.js`, `tests/review-queues.test.js`, `tests/p0.test.js`

## Conflicts note

Branched from `main` (same as #43/#44/#45). Likely touch conflicts with #43 (Q4–Q6 `review-queues` / `game.js` / learner-events) and soft overlap with #44/#45 (`game.js`). Rebase after those land; do not merge this draft onto them overnight.

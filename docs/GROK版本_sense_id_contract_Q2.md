# Grok版本 — sense_id 契约（聚光单词（grok） Q2）

**Date:** 2026-10-23 Asia/Shanghai  
**Owners:** QuizMario ↔ ALS（grok）  
**Not Andy-done.** Contract for event handoff and deep-train debt matching.

## Rule

1. If the card / row already carries a **bank** `sense_id`, both ends use that string and `sense_id_kind=bank`.
2. Otherwise both ends build the **provisional** key: `lemma.pos.gloss_zh` with POS trailing `.` stripped (`v.` → `v`). Empty POS keeps the slot: `lemma..gloss`.
3. Equality is exact string match after trim (`QuizMarioSense.sameSenseId`). Do not fold aliases here.

## Forms

| Kind | Example | Who writes it |
|------|---------|----------------|
| bank | `communicate:social` | Bank / future lexicon when present on the card |
| provisional | `communicate.v.交流` | QuizMario events + home-loop debt + ALS return match |
| lemma_pos | `communicate.v` | Due / sparse rows with POS but no gloss |
| lemma_only | `communicate` | Last-resort key — not a sense distinction |

## Practice directions (separate from sense_id)

| Canonical detail | `task_direction` | QM session | Recorded on |
|------------------|------------------|------------|-------------|
| `en_zh` | `recognition` | 看英文选中文 (`meaning`) | `prog.directions.en_zh` + `save.practice.meaning` |
| `zh_en` | `production` | 看中文选英文 (`form` / 今日必练) | `prog.directions.zh_en` + `save.practice.form` |
| `spelling` / `typed` | **`spelling`** | 拼写 | `prog.spelling` + `save.practice.spelling` |

Spelling must **not** map to `task_direction=production` (Q2). Recognition SRS / 通关 still ignore spelling.

## Shared API

- `QuizMarioSense.provisionalSenseId(lemma, pos, gloss)`
- `QuizMarioSense.resolveSenseKey({ sense_id, lemma, pos, gloss_zh })`
- `QuizMarioSense.sameSenseId(a, b)`
- `QuizMarioPractice.normalizeDirectionKey` / `noteDirection` / `directionSignal`

ALS ingest and sense_return clear paths should match provisional keys with the same recipe; bank ids pass through unchanged.

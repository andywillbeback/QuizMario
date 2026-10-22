# Grok版本 — 聚光单词（grok） Q1 真实拼写输入

**Not Andy-done.** Draft PR. Naming: **Grok版本** / **聚光单词（grok）**.

## Checklist

将当前选择式「拼写」改为键入；旧选择成绩不能算独立拼写。

## Changes

1. **UI** (`index.html` + `game.js`): 拼写 session shows `#type-row` / `#answer-input` / `#btn-check-spelling`. Meaning and 今日必练 (form) stay multiple-choice. Enter submits typed spelling; keys 1–4 ignored while typing.
2. **Progress** (`practice.js`): `spelling.typed` vs `spelling.mc`. `spellingSignal` / `isIndependentSpelling` read **typed only**. Pre-Q1 top-level correct/wrong/unknown migrate into `.mc` on first shape.
3. **Events**: spelling answers emit `evidence_kind=typed_spelling` and `independent` from typed stability.
4. **Feedback**: spelling copy says 键入 / 输入了; notes 旧选择不算独立.

## Tests

```bash
node tests/spelling-typed.test.js
node tests/p1.test.js
node tests/exam-coverage.test.js
node tests/placement.test.js
```

## NOT_DONE

- Live Pages smoke / Andy sign-off
- Merge to main
- ChatGPT parallel compare

# Lexicon sense audit

Scanned **10064** cards: `words.js` core **3000**, 中考 + 高考 in `exam-tracks.js` **7064**.

Compared `meaning_zh` / `explain_zh` with `example_en` / `example_zh`. A card was a candidate when the gloss and the Chinese example shared no character (content words only): **167** core and **303** exam cards before this pass. Also compared **92** exam cards that reuse a core sentence but not the core gloss.

## communicate = 显露

Not a live translator. Before `18efe65`, `tracks.js` already had this card as **交流**, with `We communicate with our friends online.` Commit `18efe65` ("Combine the speech freeze fix with an audited 3000-word bank") added `communicate` to `words.js` as **显露** and `explain_zh` `中考/CEFR 常用词：显露`, and kept the social example. Nothing in `data/repairs/` or `tools/` writes 显露 for this word. The 3000-word rewrite attached a different dictionary sense (显露, the "make known / communicate information" sense) to the social sentence. `tools/build-exam-tracks.js` copies `meaning_zh` from the bank, so both exam tracks inherited 显露.

This branch already corrected that card. It stays **沟通；交流** on the core card and on both exam tracks. The hint and both examples are unchanged.

## Fixed in this pass

Clear sense swaps, where the gloss was a different meaning from the sentence. **13** card rows, **6** lemmas.

| Lemma | Was | Now | Where |
| --- | --- | --- | --- |
| claim | 声称；要求 | 认领 | core + 中考 + 高考 |
| boom | 繁荣；轰鸣 (core), 繁荣 (exams) | 轰鸣 | core + 中考 + 高考 |
| story | 楼层 | 故事 | 中考 + 高考 (core was already 故事) |
| attraction | 景点 | 引力 | 中考 + 高考 (core was already 引力) |
| rail | 栏杆 | 铁轨 | 中考 + 高考 (core was already 铁轨) |
| mummy | 木乃伊 | 妈妈 | 高考 only (core was already 妈妈) |

Why the exam rows drifted: example repairs in `data/repairs/` replaced the sentence and did not set `meaning_zh`. `story` also collides with `storey` in `tools/build-exam-tracks.js` (`["storey", "story"]` share one sense key), so the exam card inherited 楼层 and then received the grandma-story sentence. `attraction`, `boom`, `rail`, and `mummy` took the other sense from the lexicon overlay (景点 / 繁荣 / 栏杆 / 木乃伊) before that example swap. Those repairs now include `meaning_zh`, so a later `node tools/build-exam-tracks.js` keeps these glosses. `storey` stays 楼层.

## Left unchanged

Near-synonyms, collocations, and paraphrases were not rewritten. After the fixes, the same zero-overlap screen still flags **166** core cards and **292** exam cards, including 通知/告诉, 对谈/聊天, 父亲/爸爸, 通知/公告, 罐子/广口瓶, 倒影/反射, 定期/经常, 咨询/商讨. **83** exam cards still use a longer or shorter gloss than the core card for the same sentence (完成 / 完成；实现, 围裙 / 围腰, and similar). Those stay.

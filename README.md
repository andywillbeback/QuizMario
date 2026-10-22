# QuizMario · Vocab Spotlight

剑桥口语考官带练的间隔重复背单词游戏（纯静态站点，可「添加到主屏幕」）。

线上：https://andywillbeback.github.io/QuizMario/ · 教师看板：teacher.html

- 词库：原版核心 8 组 400 词 · 中考核心 100 · KET(A2) 100 · PET(B1) 100 · 四级基础 100（每组 50 词，新词库均含例句）
- Anki-lite SRS（Good / Easy）。通关：本组至少 80% 的词条进入复习且间隔 ≥1 天。答错会把那一张退回学习、稍后重问，但不再要求新词 / 到期 / 学习中全部为 0。
- 今日必练：首页把「今日到期」（已打开的组里 `due <= 现在` 且不是纯新词）和「错词本」收成一条练习。先到期，再补还没出现在到期里的错词。看中文选英文，答完仍走 `schedule()`。到期账本和错词本账本分开存。
- 错词本：答错（quality 0）或累计 `wrong >= 2` 会自动收录。在今日必练里，这个词连续答对两次后毕业移出；再答错会重新收录。继续闯关里答对不推进毕业。收录写在原存档里，登录后随云同步。
- 错因：选择题答错时，用词条、释义、词性和已有干扰项归进 形近、义近、词性，或 其他/未归类。不调用模型。「不会」不计入。首页和今日必练练完的画面会列出最近这些错因，方便对着同一类再练。
- 进度叙事：已登录并进入词库首页后，回流条和错因下面有 1–3 句白话。内容来自现有存档：今日必练还剩几道或已经清完、已经通关几组和现在在第几组、这场考试的摸底是否做完，以及最近错因里最多的一类。不新开计分，也不另写口号。
- 每天第一次进入学生首页时，若已登录且今日必练至少 1 道、当天还没点过「开始」或「稍后」，会问「今天有 N 道到期/错词，先清掉？」。开始才进入练习，稍后只关掉当天的提示。不会自动跳进卡片。
- 今日必练提醒：已经点过「稍后」、之后再次进入首页时，若今日必练还有 N 道（N≥1），回流条和进度叙事下面会出现一条不挡操作的提示「今天还有 N 道今日必练」。点「开始今日必练」才进入练习。同一天只出现一次，记在本机，不发推送。软提示还在时不显示这条。
- 继续闯关是普通学习，没有倒计时，也不会改去练今日必练。看英文、选中文意思，这路计入通关。拼写（看中文选英文）单独记，错了也不挡住第一次通关。初学每轮新词更少；这一组到期词很多时，再少引入新词。
- 12 分钟挑战是单独的模式（`srs-rules.js` 里的 `CHALLENGE_MS`）。时限内通关：奖杯 +「挑战成功」+ 随机成就句，并播放掌声 `audio/15_applause.wav`。超时：屏幕显示「遗憾失败」、乌鸦飞过、随机横幅，并播放鸦叫 `audio/16_crows.wav`。这两段是自制音效，可以整文件替换。若放上 `audio/13_challenge_cheer.m4a` 或 `audio/14_challenge_regret.m4a`，则改播这两条可选录音。
- 作者本人连杀 / 终结语音；🔈 英式发音（speechSynthesis en-GB）
- 学习数据面板（打卡、已学会、正确率、复习保持率、14 天图表）
- 学生报告码 → 教师看板导入 → 班级进度 / 易错词 / CSV
- 进度导出 JSON / 备份码；PWA
- 可选邮箱登录，用 Supabase 在手机和电脑之间同步进度（不登录仍可离线玩）

## 云端登录（Supabase，可选）

学生不登录也能玩，进度仍在本机 `localStorage`（`vocabSpotlight_v1`）。登录后，同一邮箱可以在手机和电脑上恢复进度。

站点地址（Auth Site URL）：`https://andywillbeback.github.io/QuizMario/`

### Andy 需要做的一次性配置

1. 在 [supabase.com](https://supabase.com) 新建一个免费项目。
2. **Authentication → Providers → Email**：保持 Email 开启。课堂使用建议关掉 **Confirm email**，这样注册后立刻进入游戏。若保持开启，学生必须在**同一浏览器**里点确认邮件（PKCE）。
3. **Authentication → URL Configuration**
   - Site URL：`https://andywillbeback.github.io/QuizMario/`
   - Redirect URLs 再加上：
     - `https://andywillbeback.github.io/QuizMario/`
     - `https://andywillbeback.github.io/QuizMario/index.html`
     - `https://andywillbeback.github.io/QuizMario/login.html`
4. **Project Settings → API**，把两个值贴进仓库根目录的 `config.js`（替换占位符，不要发明假密钥）：
   - Project URL → `SUPABASE_URL`
   - `anon` `public` 密钥（或新的 publishable key）→ `SUPABASE_ANON_KEY`
   - **不要**把 `service_role` 密钥放进 `config.js` 或网页。anon key 可以公开，行级安全会挡住别人的进度。
5. 打开 **SQL Editor**，把 `supabase/user_progress.sql` 整段粘贴运行。这会创建 `user_progress`（`user_id`、`save jsonb`、`updated_at`）并打开 RLS：每个登录用户只能读写自己的那一行。
6. 再运行 `supabase/learner_events.sql`。这张表只收学习信号（答对、答错、错词本收录、今日到期），不保存 SM-2 时钟。详见 `docs/learner-events.md`。
7. 提交更新后的 `config.js`，等 GitHub Pages 更新。首页「登录 / 同步进度」进入 `login.html`。

本地试玩可以用任意静态服务器打开本目录；没填真实密钥时，登录页会提示未配置，游戏照常可玩。

### 同步规则

- 每次本机保存会写入 `save.updatedAt`。已登录时约 1.5 秒防抖后 upsert 到 `user_progress`。
- 登录或刷新时比较本机和云端：两边都有进度时，**较新的 `updatedAt` 整份覆盖**（last-write-wins）。
- 一边是空档（没学过）时，保留有进度的那一边，避免空档盖掉云端。
- 旧存档没有 `updatedAt` 时：云端时间戳优先；若本机已学词条更多，则保留本机并上传。
- 状态文案：`未登录本地`、`已登录 · 同步中`、`已登录 · 已同步`、`已登录 · 同步失败`。
- 退出只清登录会话。勾选「退出时清除本机」并在弹窗里确认后，才会删本机进度和学习信号；云端不删。
- 已登录时点「重置进度」只清本机进度和学习信号。刷新后云端进度会再同步下来。云端 `learner_events` 行不删。

## 学习信号（ALS）

间隔重复仍在本机 `srs-rules.js`。登录后，答对、答错、错词本收录、今日到期会写入 Supabase `learner_events`（`source=quizmario`），并留一份本机 JSONL。登录页和首页不显示「ALS 学习信号」。在游戏页控制台调用 `QuizMarioLearnerEvents.download()` 或 `copyJsonl()`，或打开 `?alsDebug=1`，再把 JSONL 交给 ALS：

```bash
.venv/bin/python scripts/ingest_learner_events.py \
  --learner <supabase-auth-uid> \
  data/learner_events_inbox/quizmario.jsonl
```

`learner_id` 和 `user_id` 都是 Supabase 用户 id。`vocab.due_review` 的到期时间在 `payload.due_at`。站点不会显示「已同步到 ALS」：ALS Mac 入库要跑上面的 ingest，或以后自己读这张表。字段说明见 `docs/learner-events.md`。

`schema_version` 2 在 JSONL 行上和 `payload` 里加上义项和作答证据（`sense_id`、词性、recognition/production、第一次还是重试、答案是否已露出、真实复习间隔、词库版本、Good/Easy/Again）。没有 `schema_version` 的旧行仍然能解析。Supabase 不新增列。样本：`node tools/sample-learner-event.js`。这是给闭环探针的事件，不是登录页上的同步开关。

今日必练练完后的「去 ALS 修语法」打开本机 Streamlit `http://127.0.0.1:8501/`。只有这台 Mac 上 ALS 已经在跑时才能打开；还没有公开的 ALS 网址。

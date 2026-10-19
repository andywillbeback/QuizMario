# QuizMario · Vocab Spotlight

剑桥口语考官带练的间隔重复背单词游戏（纯静态站点，可「添加到主屏幕」）。

线上：https://andywillbeback.github.io/QuizMario/ · 教师看板：teacher.html

- 词库：原版核心 8 组 400 词 · 中考核心 100 · KET(A2) 100 · PET(B1) 100 · 四级基础 100（每组 50 词，新词库均含例句）
- Anki-lite SRS（Good / Easy）。通关：本组至少 80% 的词条进入复习且间隔 ≥1 天。答错会把那一张退回学习、稍后重问，但不再要求新词 / 到期 / 学习中全部为 0。
- 还没通关的一组是 12 分钟挑战（`srs-rules.js` 里的 `CHALLENGE_MS`）。时限内通关：奖杯 + `audio/13_challenge_cheer.m4a`。超时：屏幕显示「遗憾失败」+ `audio/14_challenge_regret.m4a`。文件还没放进来时，用提示音和中文语音顶上。
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
6. 提交更新后的 `config.js`，等 GitHub Pages 更新。首页「登录 / 同步进度」进入 `login.html`。

本地试玩可以用任意静态服务器打开本目录；没填真实密钥时，登录页会提示未配置，游戏照常可玩。

### 同步规则

- 每次本机保存会写入 `save.updatedAt`。已登录时约 1.5 秒防抖后 upsert 到 `user_progress`。
- 登录或刷新时比较本机和云端：两边都有进度时，**较新的 `updatedAt` 整份覆盖**（last-write-wins）。
- 一边是空档（没学过）时，保留有进度的那一边，避免空档盖掉云端。
- 旧存档没有 `updatedAt` 时：云端时间戳优先；若本机已学词条更多，则保留本机并上传。
- 状态文案：`未登录本地`、`已登录 · 同步中`、`已登录 · 已同步`、`已登录 · 同步失败`。
- 退出只清登录会话。勾选「退出时清除本机」并在弹窗里确认后，才会删本机进度；云端不删。
- 已登录时点「重置进度」只清本机。刷新后云端进度会再同步下来。

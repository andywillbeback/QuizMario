# 单词宇宙：单元归属与熟练度

完成单元只登记内容，不授予熟练。`save.universeCompletedSets[track][setNumber]`
保留已完成单元；重复完成更新该单元的时间，不重复添加词条。旧存档的
`trackStars` / 当前 `levelStars` 可恢复历史通关单元。普通通关与完成单元拼写/
多义练习都会登记该单元；今日必练等跨单元队列不冒充某一个单元完成。

## 显示范围

- `?track=gaokao&set=1` 严格使用高考第 1 单元，包括短语、功能词和未测词条。
- 本组不受概览的 32/52 节点上限限制，不添加邻组或示例词。
- 各大类词条数之和等于本组词条数；大类依据当前词条的英文、中文释义、
  词性规则确定。大小写义项（如 May/may）保留独立节点。
- 主题类包括生活、科技、学习、自然、情感、出行、时间、社会；一般动作、
  性质、功能词与通用事物另列。分类是可检查的内容规则，不是脑内语义距离。
- 没有 `set` 时显示已完成单元的合并集合；尚无完成记录时展示已有练习证据。
  概览提供分页，每个登记词条都可访问。列表和 3D 使用同一个图数据模型。
- 无 WebGL 自动使用分类列表，仍能查看完整本组与实时颜色。

## 颜色与证据

0–3 是工程等级，不是已校准的掌握概率。

1. 本组有记录时使用本组、同词库、同义项的记录。概览使用同词库最近记录，
   不再取不同组/不同词库的最高分；旧无时间记录采用保守选择。
2. 展示认词、已观察到的键入拼写、多义成绩；已有维度的弱证据限制综合颜色。
3. 配置有有效关联搭配时，搭配未测不能显示整体熟练。已测搭配取较弱的证据；
   未测标“待验证”，不伪造一次失败。
4. 搭配关每次作答写入对应短语卡的 `collocationEvidence`，并发送对应短语的
   learner event。搭配错误不修改宿主词的 SM-2 时钟，也不授予宿主词额外奖励。
5. 错误后重试成功记为辅助完成，不增加独立熟练等级；独立成功先增加至最多
   2，后续跨日期独立成功才可达到 3。新错误会撤销熟练颜色。
6. 原单词 Good/Easy 复习规则继续由 `srs-rules.js` 负责。

## 刷新与同步

宇宙监听存档 storage 事件、`quizmario:progress`、返回页面与恢复可见，并在
页面可见时每秒检查一次本机存档变更。只有存档变化才重新构图；每次作答
重算不代表每次颜色必定变化。此处不是另建云端订阅。

完成后跳转前尝试刷新现有进度和事件上传，等待最长 1.5 秒，离线仍可进入
本机宇宙。新增登记保存在原存档内，经既有同步、导入、导出流程保留。

## 验证

`node tests/word-universe.test.js` 覆盖完成登记、备份还原、搭配错误/辅助重试、
最近记录、大小写义项、全部 372 个单元（含 166 个中高考单元）的成员/分类计数，以及列表的
实时刷新。`node tests/universe-renderer.test.js` 用模拟渲染原语执行真实 3D
mount/rebuild，验证图数据刷新；它不替代手机 GPU 实测。

## 入口

练习页题目上方固定提供“本组宇宙”和“本组分类列表”；列表链接直接携带
`track`、当前词条的单元号及 `view=list`，新窗口打开以保留正在进行的练习。
未提交答案前查看参考会标记本题已使用提示。单元完成页和学情页也提供列表
入口。手动选列表后，本设备后续完成单元时沿用列表模式，可在宇宙页切回 3D。

## Mobile reading interface

The student home and practice screens use `mobile-ui.css`; the universe uses `universe-ui.css`. The practice screen keeps one-column choices, a large word card, safe-area-aware rating dock and direct current-unit universe/list links. Opening reference links before submission continues to mark the response as assisted.

The classified list has four disjoint, current-page counts: mastered, reinforcement, pending collocation and untested. Pending collocation never appears as mastered. Rows expand to show component evidence and associated phrases; outside-unit associations are labelled and never added to unit membership. Category buttons jump within the scrollable word list. Progress refreshes preserve open word details.

## Relationship graph

`universe-network.js` supplies the default SVG network on the universe page, with no WebGL requirement. The existing learner model and progress watcher feed the same exact-unit graph into the network, list and explicit `view=3d` views. List rows and graph nodes select the same detail; narrow screens use a word-list drawer and word-detail bottom sheet. Search, category focus, drag, pinch/wheel zoom, keyboard node selection and fit controls work within the current graph.

The graph draws category membership and deduplicated in-scope associations already present in the word bank. It does not infer semantic similarity or introduce outside-unit nodes. Node size represents association degree, fill represents existing mastery evidence, and grey remains untested. A bounded deterministic layout keeps mastery-only refreshes from repositioning nodes; selected evidence updates in place.

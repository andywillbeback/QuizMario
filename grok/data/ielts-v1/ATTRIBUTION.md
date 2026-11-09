# 雅思综合词库来源与许可

这是聚光单词的综合学习词库，不是 IELTS 官方发布的完整考试词表。
所有覆盖数字都以 headwords.json 中冻结的清单为分母，不等于词族数、
真实考试覆盖率、个人词汇量或 IELTS 分数。

## 通用与学术参考清单

- NGSL 1.2：Browne, Culligan and Phillips；2,809 个主表词头及 52 个补充词头。
  https://www.newgeneralservicelist.com/new-general-service-list
- NAWL 1.2：Browne, Culligan and Phillips；957 个词头。
  https://www.newgeneralservicelist.com/new-academic-word-list
- 以上清单为 CC BY-SA 4.0：
  https://creativecommons.org/licenses/by-sa/4.0/
- headwords.json 保留参考列表；bank.json 是重新配套释义、例句和搭配的改编。
  这两份数据以 CC BY-SA 4.0 提供。该许可不改变应用代码、音效或其他词库的许可。

## Word Atlas 内容

Word Atlas contributors — CC BY 4.0
https://github.com/designfuchen/word-atlas
https://github.com/designfuchen/word-atlas/blob/main/CONTENT_LICENSE.md
https://creativecommons.org/licenses/by/4.0/

采用其 2026-11-09 获取的 7,298 条 CSV 数据作为主题词汇和双语用法来源。
上游 Git blob：9b605fe26b4ef2ed2127053c6503c5f9d051719e。
原 CSV 的 SHA-256 见 coverage.json。
改动包括：主要义项分离、优先选择完整目标词例句、双语订正、合并写法拆分、
常用复数与拼写变体处理、教学分组、可追溯搭配链接和独立的多义练习。
未复制其图片、声音、字体或界面设计；未声明上游为本产品背书。
上游文字由 AI 生成、经自动校验，未逐条人工审校。聚光的结构和算术检查
不等于逐条人工语言审定，也不证明考试效果。

## 补充材料

- authored-supplement.tsv：聚光为缺项、义项或例句问题整理的双语补充和订正。
- authored-collocations.tsv：聚光配套编写的常见雅思表达与搭配例句。
- context-glosses.tsv：为开放例句选择相符的词性和中文主释义。
- 复用已发布 QuizMario 中高考及通用词库的合适例句时，保留单独来源标记。
- phonetics.json 的部分词典音标来自 ECDICT（MIT）；完整许可见 ECDICT-LICENSE.txt。
  https://github.com/skywind3000/ECDICT
- 每张卡保留 source，适用时保留 source_id；统计和输入哈希见 coverage.json。

分组顺序在 v1 冻结。未来增加词项须追加，不能重排旧单元以免改变进度键。
没有将既有学生记录转成新词库记录，也没有将中高考熟练度自动授予雅思。

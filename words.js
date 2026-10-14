/* QuizMario — Vocab Spotlight word bank
 * Policy: EVERY item is (1) a single English word OR (2) a fixed expression/construction.
 * Fields: word, meaning_zh, example_en?, pos, roots, affix, root_group, scene, explain_zh
 * Sort modes: root_affix (root_group) · scene
 * v4: each set ≥50 cards · Anki-lite SRS · Good/Easy review · clear pass rule.
 */
window.VOCAB_LEVELS = [
  [
    {
      "word": "a lot of",
      "meaning_zh": "许多",
      "pos": "quantifier",
      "roots": "quantity",
      "affix": "phrase",
      "scene": "日常短语",
      "explain_zh": "表示数量多；常接可数/不可数名词。",
      "root_group": "固定结构",
      "example_en": "I know that he still spent time helping a classmate even though he also had a lot of homework."
    },
    {
      "word": "alarm",
      "meaning_zh": "闹钟",
      "pos": "noun",
      "roots": "alarm",
      "affix": "base",
      "scene": "校园生活",
      "explain_zh": "闹钟；也可指警报。这里指叫醒人的闹钟。",
      "root_group": "词根 · alarm",
      "example_en": "I believe that she was late for the first class because the alarm did not ring."
    },
    {
      "word": "according to",
      "meaning_zh": "根据",
      "pos": "prep_phrase",
      "roots": "accord",
      "affix": "prep+to",
      "scene": "逻辑连接",
      "explain_zh": "根据……；后接来源/人，不直接接完整从句作主句。",
      "root_group": "介词短语"
    },
    {
      "word": "athletes",
      "meaning_zh": "运动员",
      "pos": "noun",
      "roots": "athlete",
      "affix": "-s",
      "scene": "体育运动",
      "explain_zh": "运动员（复数）。",
      "root_group": "名词派生",
      "example_en": "I realize that it is necessary for athletes to warm up before a match."
    },
    {
      "word": "as long as",
      "meaning_zh": "只要",
      "pos": "conj",
      "roots": "as_long",
      "affix": "conj",
      "scene": "逻辑连接",
      "explain_zh": "只要……就；引导条件从句。",
      "root_group": "连词/连接语"
    },
    {
      "word": "balance",
      "meaning_zh": "平衡",
      "pos": "verb",
      "roots": "balanc",
      "affix": "base",
      "scene": "学习态度",
      "explain_zh": "平衡（动/名）；常见 balance A and B。",
      "root_group": "词根 · balanc",
      "example_en": "The parent expects that the child will be able to balance study and rest."
    },
    {
      "word": "as soon as",
      "meaning_zh": "一……就",
      "pos": "conj",
      "roots": "as_soon",
      "affix": "conj",
      "scene": "逻辑连接",
      "explain_zh": "一……就……；强调紧接发生。",
      "root_group": "连词/连接语"
    },
    {
      "word": "campus",
      "meaning_zh": "校园",
      "pos": "noun",
      "roots": "camp",
      "affix": "base",
      "scene": "校园生活",
      "explain_zh": "校园；学校场地。",
      "root_group": "词根 · camp",
      "example_en": "I believe that the idea is that the school can hold a paper-recycling week."
    },
    {
      "word": "ask questions",
      "meaning_zh": "提问",
      "pos": "verb_phrase",
      "roots": "ask",
      "affix": "V+N",
      "scene": "课堂学习",
      "explain_zh": "提问；课堂固定搭配。",
      "root_group": "动宾/固定搭配",
      "example_en": "I know that it is important that students ask for help promptly when they face difficulties."
    },
    {
      "word": "cancelled",
      "meaning_zh": "取消",
      "pos": "verb",
      "roots": "cancel",
      "affix": "-ed",
      "scene": "活动安排",
      "explain_zh": "取消（过去式/过分）；活动被取消。",
      "root_group": "动词 · 过去式",
      "example_en": "I know that the choir rehearsal was cancelled because several classmates caught a cold."
    },
    {
      "word": "back up files",
      "meaning_zh": "备份文件",
      "pos": "verb_phrase",
      "roots": "back_up",
      "affix": "phrasal",
      "scene": "科技电脑",
      "explain_zh": "备份文件；back up = 备份。",
      "root_group": "短语动词",
      "example_en": "I feel that it is also wise for students working on projects to keep backing up their files."
    },
    {
      "word": "careful",
      "meaning_zh": "认真的",
      "pos": "adj",
      "roots": "care",
      "affix": "-ful",
      "scene": "学习态度",
      "explain_zh": "认真的/小心的；-ful 表‘充满’。",
      "root_group": "形容词词缀",
      "example_en": "I think that it is important that everyone reviews carefully after class."
    },
    {
      "word": "be able to",
      "meaning_zh": "能够",
      "pos": "modal_phrase",
      "roots": "able",
      "affix": "be+adj+to",
      "scene": "日常短语",
      "explain_zh": "能够做某事；后接动词原形。",
      "root_group": "固定结构",
      "example_en": "The parent expects that the child will be able to balance study and rest."
    },
    {
      "word": "checked",
      "meaning_zh": "检查",
      "pos": "verb",
      "roots": "check",
      "affix": "-ed",
      "scene": "课堂学习",
      "explain_zh": "检查（过去式）；核对。",
      "root_group": "动词 · 过去式",
      "example_en": "I know that the older female student shared her experience in the meeting room last Friday."
    },
    {
      "word": "break time",
      "meaning_zh": "课间休息",
      "pos": "noun_phrase",
      "roots": "break",
      "affix": "phrase",
      "scene": "校园生活",
      "explain_zh": "课间休息时间。",
      "root_group": "名词短语",
      "example_en": "We play badminton during break time."
    },
    {
      "word": "classroom",
      "meaning_zh": "教室",
      "pos": "noun",
      "roots": "class+room",
      "affix": "compound",
      "scene": "校园生活",
      "explain_zh": "上课的房间。",
      "root_group": "合成词"
    },
    {
      "word": "classmate",
      "meaning_zh": "同学",
      "pos": "noun",
      "roots": "class+mate",
      "affix": "compound",
      "scene": "校园生活",
      "explain_zh": "同班同学。",
      "root_group": "合成词"
    },
    {
      "word": "homework",
      "meaning_zh": "家庭作业",
      "pos": "noun",
      "roots": "home+work",
      "affix": "compound",
      "scene": "课堂学习",
      "explain_zh": "老师布置的课后作业。",
      "root_group": "合成词"
    },
    {
      "word": "textbook",
      "meaning_zh": "课本",
      "pos": "noun",
      "roots": "text+book",
      "affix": "compound",
      "scene": "阅读图书",
      "explain_zh": "上课用的教材。",
      "root_group": "合成词"
    },
    {
      "word": "write down",
      "meaning_zh": "写下",
      "pos": "phrasal",
      "roots": "write",
      "affix": "prep",
      "scene": "课堂学习",
      "explain_zh": "把……记下来。",
      "root_group": "短语动词",
      "example_en": "Please write down the key points."
    },
    {
      "word": "pay attention",
      "meaning_zh": "注意",
      "pos": "verb_phrase",
      "roots": "pay",
      "affix": "phrase",
      "scene": "课堂学习",
      "explain_zh": "专心听/看；常接 to。",
      "root_group": "动宾/固定搭配"
    },
    {
      "word": "in time",
      "meaning_zh": "及时",
      "pos": "prep_phrase",
      "roots": "time",
      "affix": "prep",
      "scene": "时间安排",
      "explain_zh": "及时；赶上了。与 on time（准时）不同。",
      "root_group": "介词短语"
    },
    {
      "word": "at least",
      "meaning_zh": "至少",
      "pos": "adv_phrase",
      "roots": "least",
      "affix": "phrase",
      "scene": "逻辑连接",
      "explain_zh": "至少；不少于。",
      "root_group": "固定结构"
    },
    {
      "word": "for example",
      "meaning_zh": "例如",
      "pos": "prep_phrase",
      "roots": "example",
      "affix": "phrase",
      "scene": "逻辑连接",
      "explain_zh": "举例说明。",
      "root_group": "介词短语"
    },
    {
      "word": "teamwork",
      "meaning_zh": "团队合作",
      "pos": "noun",
      "roots": "team+work",
      "affix": "compound",
      "scene": "团队协作",
      "explain_zh": "一起合作完成任务。",
      "root_group": "合成词"
    },
    {
      "word": "score",
      "meaning_zh": "得分；分数",
      "pos": "noun",
      "roots": "score",
      "affix": "base",
      "scene": "体育运动",
      "explain_zh": "比分/考试分数。",
      "root_group": "词根 · score"
    },
    {
      "word": "practice",
      "meaning_zh": "练习",
      "pos": "verb",
      "roots": "practic",
      "affix": "base",
      "scene": "学习态度",
      "explain_zh": "反复练习以熟练。",
      "root_group": "词根 · practic"
    },
    {
      "word": "review",
      "meaning_zh": "复习",
      "pos": "verb",
      "roots": "re+view",
      "affix": "re-",
      "scene": "学习态度",
      "explain_zh": "再看一遍；复习功课。",
      "root_group": "前缀 · re-"
    },
    {
      "word": "memorise",
      "meaning_zh": "记住；背诵",
      "pos": "verb",
      "roots": "memor",
      "affix": "-ise",
      "scene": "课堂学习",
      "explain_zh": "把内容记牢（英式拼写）。",
      "root_group": "词根 · memor"
    },
    {
      "word": "dictionary",
      "meaning_zh": "词典",
      "pos": "noun",
      "roots": "dict",
      "affix": "-ionary",
      "scene": "阅读图书",
      "explain_zh": "查词义的工具书。",
      "root_group": "词根 · dict"
    },
    {
      "word": "pencil case",
      "meaning_zh": "文具盒",
      "pos": "noun_phrase",
      "roots": "pencil",
      "affix": "phrase",
      "scene": "校园生活",
      "explain_zh": "装笔的盒子。",
      "root_group": "名词短语"
    },
    {
      "word": "take notes",
      "meaning_zh": "记笔记",
      "pos": "verb_phrase",
      "roots": "take",
      "affix": "phrase",
      "scene": "课堂学习",
      "explain_zh": "边听边记录要点。",
      "root_group": "动宾/固定搭配"
    },
    {
      "word": "almost",
      "meaning_zh": "几乎",
      "pos": "adv",
      "roots": "almost",
      "affix": "base",
      "scene": "日常短语",
      "explain_zh": "几乎；程度接近但未完全。",
      "root_group": "副词"
    },
    {
      "word": "already",
      "meaning_zh": "已经",
      "pos": "adv",
      "roots": "already",
      "affix": "base",
      "scene": "时间安排",
      "explain_zh": "已经；常用于完成时。",
      "root_group": "副词"
    },
    {
      "word": "answer",
      "meaning_zh": "回答；答案",
      "pos": "noun",
      "roots": "answer",
      "affix": "base",
      "scene": "课堂学习",
      "explain_zh": "作名词或动词；answer the question。",
      "root_group": "词根 · answer"
    },
    {
      "word": "appear",
      "meaning_zh": "出现；似乎",
      "pos": "verb",
      "roots": "appear",
      "affix": "base",
      "scene": "校园生活",
      "explain_zh": "appear to do 似乎……。",
      "root_group": "词根 · appear"
    },
    {
      "word": "attend",
      "meaning_zh": "参加；出席",
      "pos": "verb",
      "roots": "attend",
      "affix": "base",
      "scene": "活动安排",
      "explain_zh": "attend a meeting / class。",
      "root_group": "词根 · attend"
    },
    {
      "word": "available",
      "meaning_zh": "可获得的；有空的",
      "pos": "adj",
      "roots": "avail",
      "affix": "-able",
      "scene": "日常短语",
      "explain_zh": "be available for…。",
      "root_group": "词根 · avail"
    },
    {
      "word": "aware",
      "meaning_zh": "意识到的",
      "pos": "adj",
      "roots": "aware",
      "affix": "base",
      "scene": "学习态度",
      "explain_zh": "be aware of…。",
      "root_group": "词根 · aware"
    },
    {
      "word": "basic",
      "meaning_zh": "基本的",
      "pos": "adj",
      "roots": "bas",
      "affix": "-ic",
      "scene": "课堂学习",
      "explain_zh": "basic skills。",
      "root_group": "词根 · base"
    },
    {
      "word": "belong to",
      "meaning_zh": "属于",
      "pos": "verb_phrase",
      "roots": "belong",
      "affix": "base",
      "scene": "日常短语",
      "explain_zh": "belong to sb；无进行时。",
      "root_group": "固定结构"
    },
    {
      "word": "brave",
      "meaning_zh": "勇敢的",
      "pos": "adj",
      "roots": "brave",
      "affix": "base",
      "scene": "学习态度",
      "explain_zh": "brave enough to…。",
      "root_group": "词根 · brave"
    },
    {
      "word": "bright",
      "meaning_zh": "明亮的；聪明的",
      "pos": "adj",
      "roots": "bright",
      "affix": "base",
      "scene": "校园生活",
      "explain_zh": "a bright student。",
      "root_group": "词根 · bright"
    },
    {
      "word": "celebrate",
      "meaning_zh": "庆祝",
      "pos": "verb",
      "roots": "celebr",
      "affix": "-ate",
      "scene": "活动安排",
      "explain_zh": "celebrate a festival。",
      "root_group": "词根 · celebr"
    },
    {
      "word": "search",
      "meaning_zh": "搜索",
      "pos": "verb",
      "roots": "search",
      "affix": "base",
      "scene": "科技电脑",
      "explain_zh": "search for information。",
      "root_group": "词根 · search"
    },
    {
      "word": "season",
      "meaning_zh": "季节",
      "pos": "noun",
      "roots": "season",
      "affix": "base",
      "scene": "天气出行",
      "explain_zh": "four seasons。",
      "root_group": "词根 · season"
    },
    {
      "word": "secret",
      "meaning_zh": "秘密",
      "pos": "noun",
      "roots": "secret",
      "affix": "base",
      "scene": "日常短语",
      "explain_zh": "keep a secret。",
      "root_group": "词根 · secret"
    },
    {
      "word": "seem",
      "meaning_zh": "似乎",
      "pos": "verb",
      "roots": "seem",
      "affix": "base",
      "scene": "日常短语",
      "explain_zh": "seem to be。",
      "root_group": "词根 · seem"
    },
    {
      "word": "select",
      "meaning_zh": "选择",
      "pos": "verb",
      "roots": "select",
      "affix": "base",
      "scene": "课堂学习",
      "explain_zh": "select the best option。",
      "root_group": "词根 · select"
    },
    {
      "word": "sense",
      "meaning_zh": "感觉；意义",
      "pos": "noun",
      "roots": "sense",
      "affix": "base",
      "scene": "表达交流",
      "explain_zh": "make sense。",
      "root_group": "词根 · sense"
    }
  ],
  [
    {
      "word": "because of",
      "meaning_zh": "因为",
      "pos": "prep_phrase",
      "roots": "cause",
      "affix": "prep+of",
      "scene": "逻辑连接",
      "explain_zh": "因为……；后接名词短语，不接完整从句。",
      "root_group": "介词短语"
    },
    {
      "word": "clearly",
      "meaning_zh": "清晰地",
      "pos": "adv",
      "roots": "clear",
      "affix": "-ly",
      "scene": "表达交流",
      "explain_zh": "清晰地；clear + -ly。",
      "root_group": "副词 · -ly",
      "example_en": "I feel that she still gave a clear talk even though she was nervous."
    },
    {
      "word": "book fair",
      "meaning_zh": "读书市集",
      "pos": "noun_phrase",
      "roots": "book",
      "affix": "N+N",
      "scene": "阅读图书",
      "explain_zh": "书展/读书市集。",
      "root_group": "名词短语",
      "example_en": "The community director announces that a book fair will be held at the weekend."
    },
    {
      "word": "cold",
      "meaning_zh": "寒冷",
      "pos": "adj",
      "roots": "cold",
      "affix": "base",
      "scene": "健康生活",
      "explain_zh": "寒冷的；与感冒语境相关。",
      "root_group": "词根 · cold",
      "example_en": "I suppose that they kept training even though the weather was cold."
    },
    {
      "word": "caught a cold",
      "meaning_zh": "感冒",
      "pos": "verb_phrase",
      "roots": "cold",
      "affix": "idiom",
      "scene": "健康生活",
      "explain_zh": "感冒了；固定搭配 catch a cold。",
      "root_group": "习语",
      "example_en": "I know that the choir rehearsal was cancelled because several classmates caught a cold."
    },
    {
      "word": "competed",
      "meaning_zh": "比赛",
      "pos": "verb",
      "roots": "compet",
      "affix": "-ed",
      "scene": "体育运动",
      "explain_zh": "比赛/竞争（过去式）；compete。",
      "root_group": "动词 · 过去式",
      "example_en": "I suppose that the players still competed with determination even though the field was a bit slippery."
    },
    {
      "word": "check sources",
      "meaning_zh": "核对来源",
      "pos": "verb_phrase",
      "roots": "check",
      "affix": "V+N",
      "scene": "课堂学习",
      "explain_zh": "核对信息来源。",
      "root_group": "动宾/固定搭配",
      "example_en": "I know that it is also important for people writing a report to keep checking their sources."
    },
    {
      "word": "corrected",
      "meaning_zh": "纠正",
      "pos": "verb",
      "roots": "correct",
      "affix": "-ed",
      "scene": "课堂学习",
      "explain_zh": "纠正（过去式）。",
      "root_group": "动词 · 过去式",
      "example_en": "I know that the classmate timed me on the running track yesterday."
    },
    {
      "word": "colour mixing",
      "meaning_zh": "调色",
      "pos": "noun_phrase",
      "roots": "colour",
      "affix": "N+Ving",
      "scene": "校园生活",
      "explain_zh": "调色；美术用语。",
      "root_group": "名词短语",
      "example_en": "I know that the classmate helped me prepare art supplies in the studio yesterday."
    },
    {
      "word": "curiosity",
      "meaning_zh": "好奇心",
      "pos": "noun",
      "roots": "curios",
      "affix": "-ity",
      "scene": "学习态度",
      "explain_zh": "好奇心；curious → curiosity（-ity）。",
      "root_group": "名词后缀 · -ation/-ity",
      "example_en": "The author claims that curiosity drives real learning."
    },
    {
      "word": "come up with",
      "meaning_zh": "想出",
      "pos": "phrasal",
      "roots": "come",
      "affix": "phrasal:come",
      "scene": "日常短语",
      "explain_zh": "想出（主意/办法）。",
      "root_group": "短语动词 · come"
    },
    {
      "word": "data",
      "meaning_zh": "数据",
      "pos": "noun",
      "roots": "dat",
      "affix": "base",
      "scene": "实验科学",
      "explain_zh": "数据；学术语境常用。",
      "root_group": "词根 · dat",
      "example_en": "The scientist points out that the data still need further verification."
    },
    {
      "word": "community centre",
      "meaning_zh": "社区中心",
      "pos": "noun_phrase",
      "roots": "community",
      "affix": "N+N",
      "scene": "校园生活",
      "explain_zh": "社区中心。",
      "root_group": "名词短语",
      "example_en": "I know that the coach led the training on the playground the day before yesterday."
    },
    {
      "word": "delayed",
      "meaning_zh": "推迟",
      "pos": "verb",
      "roots": "delay",
      "affix": "-ed",
      "scene": "活动安排",
      "explain_zh": "推迟/延误（过去式/过分）。",
      "root_group": "动词 · 过去式",
      "example_en": "I realize that the homework submission was delayed because the file format was wrong."
    },
    {
      "word": "as well as",
      "meaning_zh": "以及；也",
      "pos": "conj",
      "roots": "as_well",
      "affix": "conj",
      "scene": "逻辑连接",
      "explain_zh": "连接并列成分，语气偏“还有”。",
      "root_group": "连词/连接语"
    },
    {
      "word": "in fact",
      "meaning_zh": "事实上",
      "pos": "adv_phrase",
      "roots": "fact",
      "affix": "phrase",
      "scene": "逻辑连接",
      "explain_zh": "用来引出真实情况。",
      "root_group": "固定结构"
    },
    {
      "word": "agree with",
      "meaning_zh": "同意（某人）",
      "pos": "phrasal",
      "roots": "agree",
      "affix": "with",
      "scene": "表达交流",
      "explain_zh": "同意某人或某人的看法。",
      "root_group": "短语动词"
    },
    {
      "word": "disagree",
      "meaning_zh": "不同意",
      "pos": "verb",
      "roots": "dis+agree",
      "affix": "dis-",
      "scene": "表达交流",
      "explain_zh": "持不同意见。",
      "root_group": "前缀 · dis-"
    },
    {
      "word": "explain",
      "meaning_zh": "解释",
      "pos": "verb",
      "roots": "plain",
      "affix": "ex-",
      "scene": "表达交流",
      "explain_zh": "把道理说清楚。",
      "root_group": "词根 · plain"
    },
    {
      "word": "bookshelf",
      "meaning_zh": "书架",
      "pos": "noun",
      "roots": "book+shelf",
      "affix": "compound",
      "scene": "阅读图书",
      "explain_zh": "放书的架子。",
      "root_group": "合成词"
    },
    {
      "word": "borrow",
      "meaning_zh": "借（入）",
      "pos": "verb",
      "roots": "borrow",
      "affix": "base",
      "scene": "阅读图书",
      "explain_zh": "从别人处借入；常接 from。",
      "root_group": "词根 · borrow"
    },
    {
      "word": "return",
      "meaning_zh": "归还；返回",
      "pos": "verb",
      "roots": "re+turn",
      "affix": "re-",
      "scene": "阅读图书",
      "explain_zh": "把书还回图书馆。",
      "root_group": "前缀 · re-"
    },
    {
      "word": "fever",
      "meaning_zh": "发烧",
      "pos": "noun",
      "roots": "fever",
      "affix": "base",
      "scene": "健康生活",
      "explain_zh": "体温偏高。",
      "root_group": "词根 · fever"
    },
    {
      "word": "medicine",
      "meaning_zh": "药",
      "pos": "noun",
      "roots": "medic",
      "affix": "-ine",
      "scene": "健康生活",
      "explain_zh": "治疗用的药物。",
      "root_group": "词根 · medic"
    },
    {
      "word": "exercise",
      "meaning_zh": "锻炼；练习题",
      "pos": "noun",
      "roots": "exercis",
      "affix": "base",
      "scene": "健康生活",
      "explain_zh": "身体锻炼或习题。",
      "root_group": "词根 · exercis"
    },
    {
      "word": "stretch",
      "meaning_zh": "伸展",
      "pos": "verb",
      "roots": "stretch",
      "affix": "base",
      "scene": "体育运动",
      "explain_zh": "拉伸身体肌肉。",
      "root_group": "词根 · stretch"
    },
    {
      "word": "coach",
      "meaning_zh": "教练",
      "pos": "noun",
      "roots": "coach",
      "affix": "base",
      "scene": "体育运动",
      "explain_zh": "指导训练的人。",
      "root_group": "词根 · coach"
    },
    {
      "word": "experiment",
      "meaning_zh": "实验",
      "pos": "noun",
      "roots": "periment",
      "affix": "ex-",
      "scene": "实验科学",
      "explain_zh": "为验证而做的试验。",
      "root_group": "词根 · periment"
    },
    {
      "word": "result",
      "meaning_zh": "结果",
      "pos": "noun",
      "roots": "result",
      "affix": "base",
      "scene": "实验科学",
      "explain_zh": "实验或比赛的结果。",
      "root_group": "词根 · result"
    },
    {
      "word": "invite",
      "meaning_zh": "邀请",
      "pos": "verb",
      "roots": "vite",
      "affix": "in-",
      "scene": "活动安排",
      "explain_zh": "请别人来参加。",
      "root_group": "词根 · vite"
    },
    {
      "word": "join in",
      "meaning_zh": "参加（活动）",
      "pos": "phrasal",
      "roots": "join",
      "affix": "in",
      "scene": "活动安排",
      "explain_zh": "加入正在进行的活动。",
      "root_group": "短语动词"
    },
    {
      "word": "cheer up",
      "meaning_zh": "振作起来",
      "pos": "phrasal",
      "roots": "cheer",
      "affix": "up",
      "scene": "学习态度",
      "explain_zh": "让人打起精神。",
      "root_group": "短语动词"
    },
    {
      "word": "chance",
      "meaning_zh": "机会",
      "pos": "noun",
      "roots": "chance",
      "affix": "base",
      "scene": "活动安排",
      "explain_zh": "have a chance to do。",
      "root_group": "词根 · chance"
    },
    {
      "word": "choose",
      "meaning_zh": "选择",
      "pos": "verb",
      "roots": "choose",
      "affix": "base",
      "scene": "表达交流",
      "explain_zh": "choose to do；过去式 chose。",
      "root_group": "词根 · choose"
    },
    {
      "word": "comfortable",
      "meaning_zh": "舒适的",
      "pos": "adj",
      "roots": "comfort",
      "affix": "-able",
      "scene": "健康生活",
      "explain_zh": "feel comfortable。",
      "root_group": "词根 · comfort"
    },
    {
      "word": "compare",
      "meaning_zh": "比较",
      "pos": "verb",
      "roots": "compare",
      "affix": "base",
      "scene": "课堂学习",
      "explain_zh": "compare A with B。",
      "root_group": "词根 · compar"
    },
    {
      "word": "complete",
      "meaning_zh": "完成；完整的",
      "pos": "verb",
      "roots": "complete",
      "affix": "base",
      "scene": "课堂学习",
      "explain_zh": "complete the task。",
      "root_group": "词根 · complet"
    },
    {
      "word": "consider",
      "meaning_zh": "考虑",
      "pos": "verb",
      "roots": "consider",
      "affix": "base",
      "scene": "学习态度",
      "explain_zh": "consider doing。",
      "root_group": "词根 · consider"
    },
    {
      "word": "continue",
      "meaning_zh": "继续",
      "pos": "verb",
      "roots": "continue",
      "affix": "base",
      "scene": "活动安排",
      "explain_zh": "continue to do / doing。",
      "root_group": "词根 · continu"
    },
    {
      "word": "create",
      "meaning_zh": "创造",
      "pos": "verb",
      "roots": "create",
      "affix": "base",
      "scene": "科技电脑",
      "explain_zh": "create a new account。",
      "root_group": "词根 · creat"
    },
    {
      "word": "curious",
      "meaning_zh": "好奇的",
      "pos": "adj",
      "roots": "curi",
      "affix": "-ous",
      "scene": "学习态度",
      "explain_zh": "be curious about…。",
      "root_group": "词根 · curi"
    },
    {
      "word": "daily",
      "meaning_zh": "每日的",
      "pos": "adj",
      "roots": "day",
      "affix": "-ly",
      "scene": "健康生活",
      "explain_zh": "daily exercise。",
      "root_group": "词根 · day"
    },
    {
      "word": "danger",
      "meaning_zh": "危险",
      "pos": "noun",
      "roots": "danger",
      "affix": "base",
      "scene": "健康生活",
      "explain_zh": "in danger。",
      "root_group": "词根 · danger"
    },
    {
      "word": "decide",
      "meaning_zh": "决定",
      "pos": "verb",
      "roots": "decide",
      "affix": "base",
      "scene": "问题解决",
      "explain_zh": "decide to do。",
      "root_group": "词根 · decid"
    },
    {
      "word": "describe",
      "meaning_zh": "描述",
      "pos": "verb",
      "roots": "describe",
      "affix": "base",
      "scene": "表达交流",
      "explain_zh": "describe in detail。",
      "root_group": "词根 · describ"
    },
    {
      "word": "develop",
      "meaning_zh": "发展；培养",
      "pos": "verb",
      "roots": "develop",
      "affix": "base",
      "scene": "进步成长",
      "explain_zh": "develop a habit。",
      "root_group": "词根 · develop"
    },
    {
      "word": "diet",
      "meaning_zh": "饮食",
      "pos": "noun",
      "roots": "diet",
      "affix": "base",
      "scene": "健康生活",
      "explain_zh": "a balanced diet。",
      "root_group": "词根 · diet"
    },
    {
      "word": "discuss",
      "meaning_zh": "讨论",
      "pos": "verb",
      "roots": "discuss",
      "affix": "base",
      "scene": "团队协作",
      "explain_zh": "discuss the problem。",
      "root_group": "词根 · discuss"
    },
    {
      "word": "serious",
      "meaning_zh": "严肃的；严重的",
      "pos": "adj",
      "roots": "serious",
      "affix": "base",
      "scene": "学习态度",
      "explain_zh": "a serious problem。",
      "root_group": "词根 · serious"
    },
    {
      "word": "serve",
      "meaning_zh": "服务；端上",
      "pos": "verb",
      "roots": "serve",
      "affix": "base",
      "scene": "日常短语",
      "explain_zh": "serve the community。",
      "root_group": "词根 · serve"
    }
  ],
  [
    {
      "word": "deal with",
      "meaning_zh": "处理",
      "pos": "phrasal",
      "roots": "deal",
      "affix": "phrasal:deal",
      "scene": "问题解决",
      "explain_zh": "处理、应对。",
      "root_group": "短语动词 · deal"
    },
    {
      "word": "difficult",
      "meaning_zh": "很难",
      "pos": "adj",
      "roots": "difficult",
      "affix": "base",
      "scene": "学习态度",
      "explain_zh": "困难的。",
      "root_group": "词根 · difficult",
      "example_en": "I believe that he still finished it on time even though the task was difficult."
    },
    {
      "word": "depend on",
      "meaning_zh": "依靠",
      "pos": "phrasal",
      "roots": "depend",
      "affix": "phrasal:depend",
      "scene": "逻辑连接",
      "explain_zh": "依靠、取决于。",
      "root_group": "短语动词 · depend"
    },
    {
      "word": "discipline",
      "meaning_zh": "纪律",
      "pos": "noun",
      "roots": "disciplin",
      "affix": "base",
      "scene": "体育运动",
      "explain_zh": "纪律；也可指学科。",
      "root_group": "词根 · disciplin",
      "example_en": "The captain insists that discipline is the foundation of winning."
    },
    {
      "word": "divide tasks",
      "meaning_zh": "分工",
      "pos": "verb_phrase",
      "roots": "divid",
      "affix": "V+N",
      "scene": "团队协作",
      "explain_zh": "分工；分配任务。",
      "root_group": "动宾/固定搭配",
      "example_en": "I realize that it is also necessary for the group to keep dividing tasks in advance."
    },
    {
      "word": "exhibits",
      "meaning_zh": "展品",
      "pos": "noun",
      "roots": "exhibit",
      "affix": "-s",
      "scene": "校园生活",
      "explain_zh": "展品（复数）。",
      "root_group": "名词派生",
      "example_en": "I know that the classmate took photos of the notes in the exhibition hall last week."
    },
    {
      "word": "due to",
      "meaning_zh": "由于",
      "pos": "prep_phrase",
      "roots": "due",
      "affix": "prep+to",
      "scene": "逻辑连接",
      "explain_zh": "由于……；偏书面，后接名词。",
      "root_group": "介词短语"
    },
    {
      "word": "foundation",
      "meaning_zh": "基础",
      "pos": "noun",
      "roots": "found",
      "affix": "-ation",
      "scene": "学习态度",
      "explain_zh": "基础；found + -ation。",
      "root_group": "名词后缀 · -ation/-ity",
      "example_en": "The captain insists that discipline is the foundation of winning."
    },
    {
      "word": "enough sleep",
      "meaning_zh": "保证睡眠",
      "pos": "noun_phrase",
      "roots": "sleep",
      "affix": "adj+N",
      "scene": "健康生活",
      "explain_zh": "充足睡眠。",
      "root_group": "名词短语",
      "example_en": "I know that it is also crucial for exam candidates to keep getting enough sleep."
    },
    {
      "word": "held",
      "meaning_zh": "举办",
      "pos": "verb",
      "roots": "hold",
      "affix": "irregular",
      "scene": "活动安排",
      "explain_zh": "举办/举行（hold 的过去式）。",
      "root_group": "动词 · 过去式",
      "example_en": "I think that they still held a successful sharing session even though the club had few members."
    },
    {
      "word": "error-correction",
      "meaning_zh": "错题订正",
      "pos": "noun",
      "roots": "correct",
      "affix": "compound",
      "scene": "课堂学习",
      "explain_zh": "错题订正。",
      "root_group": "合成词",
      "example_en": "I realize that the evidence is that error-correction records show deeper understanding."
    },
    {
      "word": "honestly",
      "meaning_zh": "诚实地",
      "pos": "adv",
      "roots": "honest",
      "affix": "-ly",
      "scene": "学习态度",
      "explain_zh": "诚实地；honest + -ly。",
      "root_group": "副词 · -ly",
      "example_en": "The class teacher hopes that everyone can face mistakes honestly."
    },
    {
      "word": "even though",
      "meaning_zh": "即使",
      "pos": "conj",
      "roots": "even",
      "affix": "conj",
      "scene": "逻辑连接",
      "explain_zh": "即使……也；让步状语从句。",
      "root_group": "连词/连接语",
      "example_en": "I feel that they kept training even though the weather was cold."
    },
    {
      "word": "important",
      "meaning_zh": "重要的",
      "pos": "adj",
      "roots": "import",
      "affix": "-ant",
      "scene": "学习态度",
      "explain_zh": "重要的。",
      "root_group": "形容词词缀",
      "example_en": "I think that it is important that students organize their thoughts before speaking."
    },
    {
      "word": "solve",
      "meaning_zh": "解决",
      "pos": "verb",
      "roots": "solv",
      "affix": "base",
      "scene": "问题解决",
      "explain_zh": "找出办法处理问题。",
      "root_group": "词根 · solv"
    },
    {
      "word": "solution",
      "meaning_zh": "解决方案",
      "pos": "noun",
      "roots": "solut",
      "affix": "-ion",
      "scene": "问题解决",
      "explain_zh": "解决问题的办法。",
      "root_group": "名词后缀 · -ation/-ity"
    },
    {
      "word": "challenge",
      "meaning_zh": "挑战",
      "pos": "noun",
      "roots": "challeng",
      "affix": "base",
      "scene": "学习态度",
      "explain_zh": "有难度的任务。",
      "root_group": "词根 · challeng"
    },
    {
      "word": "effort",
      "meaning_zh": "努力",
      "pos": "noun",
      "roots": "effort",
      "affix": "base",
      "scene": "学习态度",
      "explain_zh": "付出的精力。",
      "root_group": "词根 · effort"
    },
    {
      "word": "in spite of",
      "meaning_zh": "尽管",
      "pos": "prep_phrase",
      "roots": "spite",
      "affix": "phrase",
      "scene": "逻辑连接",
      "explain_zh": "尽管有困难仍……；后接名词。",
      "root_group": "介词短语"
    },
    {
      "word": "as a result",
      "meaning_zh": "因此",
      "pos": "adv_phrase",
      "roots": "result",
      "affix": "phrase",
      "scene": "逻辑连接",
      "explain_zh": "引出结果。",
      "root_group": "固定结构"
    },
    {
      "word": "cooperate",
      "meaning_zh": "合作",
      "pos": "verb",
      "roots": "oper",
      "affix": "co-",
      "scene": "团队协作",
      "explain_zh": "一起工作。",
      "root_group": "前缀 · co-"
    },
    {
      "word": "share ideas",
      "meaning_zh": "分享想法",
      "pos": "verb_phrase",
      "roots": "share",
      "affix": "phrase",
      "scene": "团队协作",
      "explain_zh": "把观点告诉同伴。",
      "root_group": "动宾/固定搭配"
    },
    {
      "word": "museum",
      "meaning_zh": "博物馆",
      "pos": "noun",
      "roots": "muse",
      "affix": "-um",
      "scene": "校园生活",
      "explain_zh": "收藏展览文物的地方。",
      "root_group": "名词派生"
    },
    {
      "word": "gallery",
      "meaning_zh": "画廊；展厅",
      "pos": "noun",
      "roots": "galler",
      "affix": "base",
      "scene": "校园生活",
      "explain_zh": "展示作品的厅室。",
      "root_group": "名词派生"
    },
    {
      "word": "breakfast",
      "meaning_zh": "早餐",
      "pos": "noun",
      "roots": "break+fast",
      "affix": "compound",
      "scene": "健康生活",
      "explain_zh": "早晨吃的一餐。",
      "root_group": "合成词"
    },
    {
      "word": "vegetarian",
      "meaning_zh": "素食者",
      "pos": "noun",
      "roots": "veget",
      "affix": "-arian",
      "scene": "健康生活",
      "explain_zh": "不吃肉的人。",
      "root_group": "词根 · veget"
    },
    {
      "word": "schedule",
      "meaning_zh": "日程表",
      "pos": "noun",
      "roots": "schedul",
      "affix": "base",
      "scene": "活动安排",
      "explain_zh": "时间安排表。",
      "root_group": "词根 · schedul"
    },
    {
      "word": "deadline",
      "meaning_zh": "截止日期",
      "pos": "noun",
      "roots": "dead+line",
      "affix": "compound",
      "scene": "活动安排",
      "explain_zh": "必须完成的最后期限。",
      "root_group": "合成词"
    },
    {
      "word": "revise",
      "meaning_zh": "修订；复习",
      "pos": "verb",
      "roots": "vis",
      "affix": "re-",
      "scene": "课堂学习",
      "explain_zh": "修改文稿或复习功课。",
      "root_group": "前缀 · re-"
    },
    {
      "word": "summarise",
      "meaning_zh": "总结",
      "pos": "verb",
      "roots": "summar",
      "affix": "-ise",
      "scene": "课堂学习",
      "explain_zh": "归纳要点（英式）。",
      "root_group": "词根 · summar"
    },
    {
      "word": "confident",
      "meaning_zh": "自信的",
      "pos": "adj",
      "roots": "fid",
      "affix": "con-",
      "scene": "学习态度",
      "explain_zh": "对自己有信心。",
      "root_group": "词根 · fid"
    },
    {
      "word": "patient",
      "meaning_zh": "有耐心的",
      "pos": "adj",
      "roots": "pati",
      "affix": "-ent",
      "scene": "学习态度",
      "explain_zh": "能忍受等待或不急躁。",
      "root_group": "词根 · pati"
    },
    {
      "word": "energy",
      "meaning_zh": "精力；能量",
      "pos": "noun",
      "roots": "energy",
      "affix": "base",
      "scene": "健康生活",
      "explain_zh": "full of energy。",
      "root_group": "词根 · energ"
    },
    {
      "word": "enough",
      "meaning_zh": "足够的",
      "pos": "adj",
      "roots": "enough",
      "affix": "base",
      "scene": "日常短语",
      "explain_zh": "enough time to do。",
      "root_group": "词根 · enough"
    },
    {
      "word": "especially",
      "meaning_zh": "尤其",
      "pos": "adv",
      "roots": "especial",
      "affix": "-ly",
      "scene": "逻辑连接",
      "explain_zh": "especially when…。",
      "root_group": "词根 · especial"
    },
    {
      "word": "exact",
      "meaning_zh": "确切的",
      "pos": "adj",
      "roots": "exact",
      "affix": "base",
      "scene": "课堂学习",
      "explain_zh": "the exact meaning。",
      "root_group": "词根 · exact"
    },
    {
      "word": "expect",
      "meaning_zh": "期待；预计",
      "pos": "verb",
      "roots": "expect",
      "affix": "base",
      "scene": "表达交流",
      "explain_zh": "expect sb to do。",
      "root_group": "词根 · expect"
    },
    {
      "word": "experience",
      "meaning_zh": "经验；经历",
      "pos": "noun",
      "roots": "experience",
      "affix": "base",
      "scene": "进步成长",
      "explain_zh": "learn from experience。",
      "root_group": "词根 · experi"
    },
    {
      "word": "express",
      "meaning_zh": "表达",
      "pos": "verb",
      "roots": "express",
      "affix": "base",
      "scene": "表达交流",
      "explain_zh": "express oneself。",
      "root_group": "词根 · express"
    },
    {
      "word": "fail",
      "meaning_zh": "失败；不及格",
      "pos": "verb",
      "roots": "fail",
      "affix": "base",
      "scene": "学习态度",
      "explain_zh": "fail to do；fail an exam。",
      "root_group": "词根 · fail"
    },
    {
      "word": "famous",
      "meaning_zh": "著名的",
      "pos": "adj",
      "roots": "fame",
      "affix": "-ous",
      "scene": "校园生活",
      "explain_zh": "be famous for…。",
      "root_group": "词根 · fame"
    },
    {
      "word": "follow",
      "meaning_zh": "跟随；遵循",
      "pos": "verb",
      "roots": "follow",
      "affix": "base",
      "scene": "课堂学习",
      "explain_zh": "follow the instructions。",
      "root_group": "词根 · follow"
    },
    {
      "word": "foreign",
      "meaning_zh": "外国的",
      "pos": "adj",
      "roots": "foreign",
      "affix": "base",
      "scene": "阅读图书",
      "explain_zh": "a foreign language。",
      "root_group": "词根 · foreign"
    },
    {
      "word": "forget",
      "meaning_zh": "忘记",
      "pos": "verb",
      "roots": "forget",
      "affix": "base",
      "scene": "日常短语",
      "explain_zh": "forget to do / doing。",
      "root_group": "词根 · forget"
    },
    {
      "word": "friendly",
      "meaning_zh": "友好的",
      "pos": "adj",
      "roots": "friend",
      "affix": "-ly",
      "scene": "团队协作",
      "explain_zh": "a friendly smile。",
      "root_group": "词根 · friend"
    },
    {
      "word": "future",
      "meaning_zh": "未来",
      "pos": "noun",
      "roots": "future",
      "affix": "base",
      "scene": "学习态度",
      "explain_zh": "in the future。",
      "root_group": "词根 · futur"
    },
    {
      "word": "share",
      "meaning_zh": "分享",
      "pos": "verb",
      "roots": "share",
      "affix": "base",
      "scene": "团队协作",
      "explain_zh": "share ideas。",
      "root_group": "词根 · share"
    },
    {
      "word": "shoulder",
      "meaning_zh": "肩膀；承担",
      "pos": "noun",
      "roots": "shoulder",
      "affix": "base",
      "scene": "团队协作",
      "explain_zh": "shoulder responsibility。",
      "root_group": "词根 · shoulder"
    },
    {
      "word": "silent",
      "meaning_zh": "沉默的",
      "pos": "adj",
      "roots": "silent",
      "affix": "base",
      "scene": "课堂学习",
      "explain_zh": "keep silent。",
      "root_group": "词根 · silent"
    },
    {
      "word": "similar",
      "meaning_zh": "相似的",
      "pos": "adj",
      "roots": "similar",
      "affix": "base",
      "scene": "逻辑连接",
      "explain_zh": "be similar to…。",
      "root_group": "词根 · similar"
    }
  ],
  [
    {
      "word": "every day",
      "meaning_zh": "每天",
      "pos": "adv_phrase",
      "roots": "day",
      "affix": "time",
      "scene": "时间安排",
      "explain_zh": "每天（副词短语）；everyday 是形容词。",
      "root_group": "时间表达",
      "example_en": "I think that it is important that classmates preview new words before class."
    },
    {
      "word": "improved",
      "meaning_zh": "提高",
      "pos": "verb",
      "roots": "improv",
      "affix": "-ed",
      "scene": "进步成长",
      "explain_zh": "提高/改善（过去式）。",
      "root_group": "动词 · 过去式",
      "example_en": "I think that their relay performance improved noticeably because they trained every day."
    },
    {
      "word": "face mistakes",
      "meaning_zh": "面对错误",
      "pos": "verb_phrase",
      "roots": "face",
      "affix": "V+N",
      "scene": "学习态度",
      "explain_zh": "面对错误。",
      "root_group": "动宾/固定搭配",
      "example_en": "The class teacher hopes that everyone can face mistakes honestly."
    },
    {
      "word": "introduced",
      "meaning_zh": "介绍",
      "pos": "verb",
      "roots": "introduc",
      "affix": "-ed",
      "scene": "表达交流",
      "explain_zh": "介绍（过去式）。",
      "root_group": "动词 · 过去式",
      "example_en": "I know that the classmate took photos of the notes in the exhibition hall last week."
    },
    {
      "word": "file format",
      "meaning_zh": "文件格式",
      "pos": "noun_phrase",
      "roots": "file",
      "affix": "N+N",
      "scene": "科技电脑",
      "explain_zh": "文件格式。",
      "root_group": "名词短语",
      "example_en": "I realize that the homework submission was delayed because the file format was wrong."
    },
    {
      "word": "lack",
      "meaning_zh": "缺少",
      "pos": "verb",
      "roots": "lack",
      "affix": "base",
      "scene": "问题解决",
      "explain_zh": "缺少（动词/名词）。",
      "root_group": "词根 · lack",
      "example_en": "I know that the problem is that some students lack practice opportunities."
    },
    {
      "word": "find out",
      "meaning_zh": "查明",
      "pos": "phrasal",
      "roots": "find",
      "affix": "phrasal:find",
      "scene": "问题解决",
      "explain_zh": "查明、弄清。",
      "root_group": "短语动词 · find"
    },
    {
      "word": "late",
      "meaning_zh": "迟到",
      "pos": "adj",
      "roots": "late",
      "affix": "base",
      "scene": "校园生活",
      "explain_zh": "迟到的/晚的。",
      "root_group": "词根 · late",
      "example_en": "I believe that she was late for the first class because the alarm did not ring."
    },
    {
      "word": "finish homework",
      "meaning_zh": "完成作业",
      "pos": "verb_phrase",
      "roots": "finish",
      "affix": "V+N",
      "scene": "课堂学习",
      "explain_zh": "完成作业。",
      "root_group": "动宾/固定搭配",
      "example_en": "I think that it is important that classmates preview new words before class."
    },
    {
      "word": "learned",
      "meaning_zh": "学会",
      "pos": "verb",
      "roots": "learn",
      "affix": "-ed",
      "scene": "进步成长",
      "explain_zh": "学会/学到（过去式）。",
      "root_group": "动词 · 过去式",
      "example_en": "I know that she gradually learned the basic operations even though the software interface was unfamiliar."
    },
    {
      "word": "focus on",
      "meaning_zh": "专注于",
      "pos": "phrasal",
      "roots": "focus",
      "affix": "phrasal:focus",
      "scene": "学习态度",
      "explain_zh": "专注于。",
      "root_group": "短语动词 · focus"
    },
    {
      "word": "library",
      "meaning_zh": "图书馆",
      "pos": "noun",
      "roots": "libr",
      "affix": "-ary",
      "scene": "阅读图书",
      "explain_zh": "图书馆。",
      "root_group": "名词派生",
      "example_en": "I know that the classmate taught her photography in the campus garden last week."
    },
    {
      "word": "give up",
      "meaning_zh": "放弃",
      "pos": "phrasal",
      "roots": "give",
      "affix": "phrasal:give",
      "scene": "学习态度",
      "explain_zh": "放弃。",
      "root_group": "短语动词 · give"
    },
    {
      "word": "matters",
      "meaning_zh": "很关键",
      "pos": "verb",
      "roots": "matter",
      "affix": "-s",
      "scene": "学习态度",
      "explain_zh": "要紧、重要（动词）。",
      "root_group": "名词派生",
      "example_en": "I suppose that it is important that a regular routine can improve attention."
    },
    {
      "word": "from time to time",
      "meaning_zh": "偶尔",
      "pos": "adv_phrase",
      "roots": "time",
      "affix": "phrase",
      "scene": "时间安排",
      "explain_zh": "不时；偶尔。",
      "root_group": "时间表达"
    },
    {
      "word": "right away",
      "meaning_zh": "立刻",
      "pos": "adv_phrase",
      "roots": "right",
      "affix": "phrase",
      "scene": "时间安排",
      "explain_zh": "马上做。",
      "root_group": "时间表达"
    },
    {
      "word": "progress",
      "meaning_zh": "进步",
      "pos": "noun",
      "roots": "gress",
      "affix": "pro-",
      "scene": "进步成长",
      "explain_zh": "向前推进；取得进展。",
      "root_group": "词根 · gress"
    },
    {
      "word": "achieve",
      "meaning_zh": "达成",
      "pos": "verb",
      "roots": "chiev",
      "affix": "a-",
      "scene": "进步成长",
      "explain_zh": "通过努力完成目标。",
      "root_group": "词根 · chiev"
    },
    {
      "word": "mistake",
      "meaning_zh": "错误",
      "pos": "noun",
      "roots": "take",
      "affix": "mis-",
      "scene": "学习态度",
      "explain_zh": "做错的地方；可改正。",
      "root_group": "前缀 · mis-"
    },
    {
      "word": "advice",
      "meaning_zh": "建议（不可数）",
      "pos": "noun",
      "roots": "vice",
      "affix": "ad-",
      "scene": "表达交流",
      "explain_zh": "劝告；不可数，一条用 a piece of advice。",
      "root_group": "词根 · vice"
    },
    {
      "word": "suggest",
      "meaning_zh": "建议",
      "pos": "verb",
      "roots": "gest",
      "affix": "sug-",
      "scene": "表达交流",
      "explain_zh": "提出建议。",
      "root_group": "词根 · gest"
    },
    {
      "word": "download",
      "meaning_zh": "下载",
      "pos": "verb",
      "roots": "load",
      "affix": "down-",
      "scene": "科技电脑",
      "explain_zh": "从网络保存到本地。",
      "root_group": "短语动词 · 方向"
    },
    {
      "word": "upload",
      "meaning_zh": "上传",
      "pos": "verb",
      "roots": "load",
      "affix": "up-",
      "scene": "科技电脑",
      "explain_zh": "把文件传到网上。",
      "root_group": "短语动词 · 方向"
    },
    {
      "word": "password",
      "meaning_zh": "密码",
      "pos": "noun",
      "roots": "pass+word",
      "affix": "compound",
      "scene": "科技电脑",
      "explain_zh": "登录用的暗码。",
      "root_group": "合成词"
    },
    {
      "word": "figure out",
      "meaning_zh": "弄明白",
      "pos": "phrasal",
      "roots": "figure",
      "affix": "out",
      "scene": "问题解决",
      "explain_zh": "想通；算出。",
      "root_group": "短语动词"
    },
    {
      "word": "work out",
      "meaning_zh": "算出；锻炼",
      "pos": "phrasal",
      "roots": "work",
      "affix": "out",
      "scene": "问题解决",
      "explain_zh": "算出答案；也可指健身。",
      "root_group": "短语动词"
    },
    {
      "word": "canteen",
      "meaning_zh": "食堂",
      "pos": "noun",
      "roots": "canteen",
      "affix": "base",
      "scene": "校园生活",
      "explain_zh": "学校里用餐的地方。",
      "root_group": "名词派生"
    },
    {
      "word": "dormitory",
      "meaning_zh": "宿舍",
      "pos": "noun",
      "roots": "dorm",
      "affix": "-itory",
      "scene": "校园生活",
      "explain_zh": "学生住宿处（可简称 dorm）。",
      "root_group": "词根 · dorm"
    },
    {
      "word": "quiz",
      "meaning_zh": "小测验",
      "pos": "noun",
      "roots": "quiz",
      "affix": "base",
      "scene": "课堂学习",
      "explain_zh": "短小的测试。",
      "root_group": "词根 · quiz"
    },
    {
      "word": "essay",
      "meaning_zh": "短文；作文",
      "pos": "noun",
      "roots": "essay",
      "affix": "base",
      "scene": "课堂学习",
      "explain_zh": "写成篇的文章。",
      "root_group": "词根 · essay"
    },
    {
      "word": "novel",
      "meaning_zh": "小说",
      "pos": "noun",
      "roots": "novel",
      "affix": "base",
      "scene": "阅读图书",
      "explain_zh": "长篇虚构故事。",
      "root_group": "词根 · novel"
    },
    {
      "word": "author",
      "meaning_zh": "作者",
      "pos": "noun",
      "roots": "author",
      "affix": "base",
      "scene": "阅读图书",
      "explain_zh": "写书的人。",
      "root_group": "词根 · author"
    },
    {
      "word": "gather",
      "meaning_zh": "收集；聚集",
      "pos": "verb",
      "roots": "gather",
      "affix": "base",
      "scene": "团队协作",
      "explain_zh": "gather information。",
      "root_group": "词根 · gather"
    },
    {
      "word": "general",
      "meaning_zh": "一般的；总的",
      "pos": "adj",
      "roots": "general",
      "affix": "base",
      "scene": "逻辑连接",
      "explain_zh": "in general。",
      "root_group": "词根 · gener"
    },
    {
      "word": "goal",
      "meaning_zh": "目标",
      "pos": "noun",
      "roots": "goal",
      "affix": "base",
      "scene": "进步成长",
      "explain_zh": "set a goal。",
      "root_group": "词根 · goal"
    },
    {
      "word": "grade",
      "meaning_zh": "成绩；年级",
      "pos": "noun",
      "roots": "grade",
      "affix": "base",
      "scene": "课堂学习",
      "explain_zh": "get a good grade。",
      "root_group": "词根 · grade"
    },
    {
      "word": "habit",
      "meaning_zh": "习惯",
      "pos": "noun",
      "roots": "habit",
      "affix": "base",
      "scene": "学习态度",
      "explain_zh": "form a good habit。",
      "root_group": "词根 · habit"
    },
    {
      "word": "happen",
      "meaning_zh": "发生",
      "pos": "verb",
      "roots": "happen",
      "affix": "base",
      "scene": "日常短语",
      "explain_zh": "What happened?",
      "root_group": "词根 · happen"
    },
    {
      "word": "hardly",
      "meaning_zh": "几乎不",
      "pos": "adv",
      "roots": "hard",
      "affix": "-ly",
      "scene": "逻辑连接",
      "explain_zh": "hardly ever。",
      "root_group": "词根 · hard"
    },
    {
      "word": "health",
      "meaning_zh": "健康",
      "pos": "noun",
      "roots": "health",
      "affix": "base",
      "scene": "健康生活",
      "explain_zh": "in good health。",
      "root_group": "词根 · health"
    },
    {
      "word": "honest",
      "meaning_zh": "诚实的",
      "pos": "adj",
      "roots": "honest",
      "affix": "base",
      "scene": "学习态度",
      "explain_zh": "be honest with…。",
      "root_group": "词根 · honest"
    },
    {
      "word": "however",
      "meaning_zh": "然而",
      "pos": "adv",
      "roots": "however",
      "affix": "base",
      "scene": "逻辑连接",
      "explain_zh": "句首转折。",
      "root_group": "连词/连接语"
    },
    {
      "word": "imagine",
      "meaning_zh": "想象",
      "pos": "verb",
      "roots": "imagine",
      "affix": "base",
      "scene": "表达交流",
      "explain_zh": "imagine doing。",
      "root_group": "词根 · imagin"
    },
    {
      "word": "include",
      "meaning_zh": "包括",
      "pos": "verb",
      "roots": "include",
      "affix": "base",
      "scene": "逻辑连接",
      "explain_zh": "include A and B。",
      "root_group": "词根 · includ"
    },
    {
      "word": "increase",
      "meaning_zh": "增加",
      "pos": "verb",
      "roots": "increase",
      "affix": "base",
      "scene": "进步成长",
      "explain_zh": "increase by 10%。",
      "root_group": "词根 · increas"
    },
    {
      "word": "information",
      "meaning_zh": "信息",
      "pos": "noun",
      "roots": "inform",
      "affix": "-ation",
      "scene": "科技电脑",
      "explain_zh": "不可数。",
      "root_group": "词根 · inform"
    },
    {
      "word": "introduce",
      "meaning_zh": "介绍",
      "pos": "verb",
      "roots": "introduce",
      "affix": "base",
      "scene": "表达交流",
      "explain_zh": "introduce A to B。",
      "root_group": "词根 · introduc"
    },
    {
      "word": "invent",
      "meaning_zh": "发明",
      "pos": "verb",
      "roots": "invent",
      "affix": "base",
      "scene": "科技电脑",
      "explain_zh": "invent a machine。",
      "root_group": "词根 · invent"
    },
    {
      "word": "simple",
      "meaning_zh": "简单的",
      "pos": "adj",
      "roots": "simple",
      "affix": "base",
      "scene": "课堂学习",
      "explain_zh": "a simple way。",
      "root_group": "词根 · simpl"
    },
    {
      "word": "single",
      "meaning_zh": "单一的；单身的",
      "pos": "adj",
      "roots": "single",
      "affix": "base",
      "scene": "日常短语",
      "explain_zh": "a single ticket。",
      "root_group": "词根 · single"
    }
  ],
  [
    {
      "word": "group discussion",
      "meaning_zh": "小组讨论",
      "pos": "noun_phrase",
      "roots": "group",
      "affix": "N+N",
      "scene": "团队协作",
      "explain_zh": "小组讨论。",
      "root_group": "名词短语",
      "example_en": "I think that it is important that students organize their thoughts before speaking."
    },
    {
      "word": "nervous",
      "meaning_zh": "紧张",
      "pos": "adj",
      "roots": "nerv",
      "affix": "-ous",
      "scene": "表达交流",
      "explain_zh": "紧张的。",
      "root_group": "形容词词缀",
      "example_en": "I feel that she still gave a clear talk even though she was nervous."
    },
    {
      "word": "group work",
      "meaning_zh": "小组合作",
      "pos": "noun_phrase",
      "roots": "group",
      "affix": "N+N",
      "scene": "团队协作",
      "explain_zh": "小组合作。",
      "root_group": "名词短语",
      "example_en": "I suppose that the result is that most students prefer group work."
    },
    {
      "word": "organised",
      "meaning_zh": "组织",
      "pos": "verb",
      "roots": "organ",
      "affix": "-ised",
      "scene": "活动安排",
      "explain_zh": "组织（英式拼写过去式）。",
      "root_group": "动词 · 过去式",
      "example_en": "I know that the coach led the training on the playground the day before yesterday."
    },
    {
      "word": "half an hour",
      "meaning_zh": "半小时",
      "pos": "noun_phrase",
      "roots": "hour",
      "affix": "time",
      "scene": "时间安排",
      "explain_zh": "半小时。",
      "root_group": "时间表达",
      "example_en": "The doctor suggests that students exercise outdoors for half an hour every day."
    },
    {
      "word": "paused",
      "meaning_zh": "暂停",
      "pos": "verb",
      "roots": "paus",
      "affix": "-ed",
      "scene": "科技电脑",
      "explain_zh": "暂停（过去式）。",
      "root_group": "动词 · 过去式",
      "example_en": "I suppose that the computer class was interrupted because the power went out suddenly."
    },
    {
      "word": "hand in",
      "meaning_zh": "上交",
      "pos": "phrasal",
      "roots": "hand",
      "affix": "phrasal:hand",
      "scene": "课堂学习",
      "explain_zh": "上交（作业等）。",
      "root_group": "短语动词 · hand"
    },
    {
      "word": "players",
      "meaning_zh": "队员",
      "pos": "noun",
      "roots": "play",
      "affix": "-er+s",
      "scene": "体育运动",
      "explain_zh": "队员/选手。",
      "root_group": "名词派生",
      "example_en": "The coach thinks that the players will support each other."
    },
    {
      "word": "healthy meal",
      "meaning_zh": "健康套餐",
      "pos": "noun_phrase",
      "roots": "health",
      "affix": "-y+N",
      "scene": "健康生活",
      "explain_zh": "健康套餐/餐食。",
      "root_group": "名词短语",
      "example_en": "I know that the volunteer kept the queue in order at the canteen entrance yesterday."
    },
    {
      "word": "poster",
      "meaning_zh": "海报",
      "pos": "noun",
      "roots": "post",
      "affix": "-er",
      "scene": "校园生活",
      "explain_zh": "海报。",
      "root_group": "名词派生",
      "example_en": "I know that the older female student shared her experience in the meeting room last Friday."
    },
    {
      "word": "help classmates",
      "meaning_zh": "帮助同学",
      "pos": "verb_phrase",
      "roots": "help",
      "affix": "V+N",
      "scene": "团队协作",
      "explain_zh": "帮助同学。",
      "root_group": "动宾/固定搭配",
      "example_en": "I think that he still spent time helping a classmate even though he also had a lot of homework."
    },
    {
      "word": "postponed",
      "meaning_zh": "推迟",
      "pos": "verb",
      "roots": "postpon",
      "affix": "-ed",
      "scene": "活动安排",
      "explain_zh": "推迟（过去式）；偏‘改期’。",
      "root_group": "动词 · 过去式",
      "example_en": "I feel that the sports meeting was postponed because it rained heavily."
    },
    {
      "word": "in advance",
      "meaning_zh": "提前",
      "pos": "adv_phrase",
      "roots": "advance",
      "affix": "prep+N",
      "scene": "时间安排",
      "explain_zh": "提前。",
      "root_group": "介词短语",
      "example_en": "I realize that the debate team performed excellently because everyone prepared well in advance."
    },
    {
      "word": "prefer",
      "meaning_zh": "更喜欢",
      "pos": "verb",
      "roots": "prefer",
      "affix": "base",
      "scene": "表达交流",
      "explain_zh": "更喜欢；prefer A to B。",
      "root_group": "词根 · prefer",
      "example_en": "I suppose that the result is that most students prefer group work."
    },
    {
      "word": "brainstorm",
      "meaning_zh": "头脑风暴",
      "pos": "verb",
      "roots": "brain+storm",
      "affix": "compound",
      "scene": "团队协作",
      "explain_zh": "集体快速想点子。",
      "root_group": "合成词"
    },
    {
      "word": "role",
      "meaning_zh": "角色；职责",
      "pos": "noun",
      "roots": "role",
      "affix": "base",
      "scene": "团队协作",
      "explain_zh": "在小组里的分工。",
      "root_group": "词根 · role"
    },
    {
      "word": "leader",
      "meaning_zh": "领导者",
      "pos": "noun",
      "roots": "lead",
      "affix": "-er",
      "scene": "团队协作",
      "explain_zh": "带领团队的人。",
      "root_group": "名词派生"
    },
    {
      "word": "audience",
      "meaning_zh": "观众；听众",
      "pos": "noun",
      "roots": "audi",
      "affix": "-ence",
      "scene": "表达交流",
      "explain_zh": "听演讲或看表演的人。",
      "root_group": "词根 · audi"
    },
    {
      "word": "announce",
      "meaning_zh": "宣布",
      "pos": "verb",
      "roots": "nounc",
      "affix": "an-",
      "scene": "表达交流",
      "explain_zh": "正式告诉大家。",
      "root_group": "词根 · nounc"
    },
    {
      "word": "festival",
      "meaning_zh": "节日；节庆",
      "pos": "noun",
      "roots": "fest",
      "affix": "-ival",
      "scene": "活动安排",
      "explain_zh": "庆祝活动。",
      "root_group": "词根 · fest"
    },
    {
      "word": "ceremony",
      "meaning_zh": "仪式",
      "pos": "noun",
      "roots": "ceremon",
      "affix": "base",
      "scene": "活动安排",
      "explain_zh": "正式典礼。",
      "root_group": "词根 · ceremon"
    },
    {
      "word": "for a while",
      "meaning_zh": "一会儿",
      "pos": "adv_phrase",
      "roots": "while",
      "affix": "phrase",
      "scene": "时间安排",
      "explain_zh": "持续一小段时间。",
      "root_group": "时间表达"
    },
    {
      "word": "so far",
      "meaning_zh": "到目前为止",
      "pos": "adv_phrase",
      "roots": "far",
      "affix": "phrase",
      "scene": "时间安排",
      "explain_zh": "从过去到现在。",
      "root_group": "时间表达"
    },
    {
      "word": "save a file",
      "meaning_zh": "保存文件",
      "pos": "verb_phrase",
      "roots": "save",
      "affix": "phrase",
      "scene": "科技电脑",
      "explain_zh": "把文档存盘。",
      "root_group": "动宾/固定搭配"
    },
    {
      "word": "search online",
      "meaning_zh": "上网搜索",
      "pos": "verb_phrase",
      "roots": "search",
      "affix": "phrase",
      "scene": "科技电脑",
      "explain_zh": "在网络上查找信息。",
      "root_group": "动宾/固定搭配"
    },
    {
      "word": "debate",
      "meaning_zh": "辩论",
      "pos": "noun",
      "roots": "bate",
      "affix": "de-",
      "scene": "课堂学习",
      "explain_zh": "双方陈述不同观点。",
      "root_group": "词根 · bate"
    },
    {
      "word": "project",
      "meaning_zh": "项目；课题",
      "pos": "noun",
      "roots": "ject",
      "affix": "pro-",
      "scene": "课堂学习",
      "explain_zh": "需要一段时间完成的任务。",
      "root_group": "词根 · ject"
    },
    {
      "word": "champion",
      "meaning_zh": "冠军",
      "pos": "noun",
      "roots": "champion",
      "affix": "base",
      "scene": "体育运动",
      "explain_zh": "比赛第一名。",
      "root_group": "词根 · champion"
    },
    {
      "word": "tournament",
      "meaning_zh": "锦标赛",
      "pos": "noun",
      "roots": "tourn",
      "affix": "-ament",
      "scene": "体育运动",
      "explain_zh": "多轮比赛。",
      "root_group": "词根 · tourn"
    },
    {
      "word": "nutrition",
      "meaning_zh": "营养",
      "pos": "noun",
      "roots": "nutri",
      "affix": "-tion",
      "scene": "健康生活",
      "explain_zh": "食物提供的养分。",
      "root_group": "词根 · nutri"
    },
    {
      "word": "hydrate",
      "meaning_zh": "补水",
      "pos": "verb",
      "roots": "hydr",
      "affix": "-ate",
      "scene": "健康生活",
      "explain_zh": "补充水分。",
      "root_group": "词根 · hydr"
    },
    {
      "word": "playground",
      "meaning_zh": "操场",
      "pos": "noun",
      "roots": "play+ground",
      "affix": "compound",
      "scene": "校园生活",
      "explain_zh": "户外活动场地。",
      "root_group": "合成词"
    },
    {
      "word": "join",
      "meaning_zh": "加入",
      "pos": "verb",
      "roots": "join",
      "affix": "base",
      "scene": "团队协作",
      "explain_zh": "join a club。",
      "root_group": "词根 · join"
    },
    {
      "word": "journey",
      "meaning_zh": "旅程",
      "pos": "noun",
      "roots": "journey",
      "affix": "base",
      "scene": "天气出行",
      "explain_zh": "a long journey。",
      "root_group": "词根 · journey"
    },
    {
      "word": "keep",
      "meaning_zh": "保持；继续",
      "pos": "verb",
      "roots": "keep",
      "affix": "base",
      "scene": "学习态度",
      "explain_zh": "keep doing。",
      "root_group": "词根 · keep"
    },
    {
      "word": "knowledge",
      "meaning_zh": "知识",
      "pos": "noun",
      "roots": "know",
      "affix": "-ledge",
      "scene": "课堂学习",
      "explain_zh": "不可数。",
      "root_group": "词根 · know"
    },
    {
      "word": "language",
      "meaning_zh": "语言",
      "pos": "noun",
      "roots": "language",
      "affix": "base",
      "scene": "表达交流",
      "explain_zh": "learn a language。",
      "root_group": "词根 · languag"
    },
    {
      "word": "latest",
      "meaning_zh": "最新的",
      "pos": "adj",
      "roots": "late",
      "affix": "-est",
      "scene": "科技电脑",
      "explain_zh": "the latest news。",
      "root_group": "词根 · late"
    },
    {
      "word": "lead",
      "meaning_zh": "领导；通向",
      "pos": "verb",
      "roots": "lead",
      "affix": "base",
      "scene": "团队协作",
      "explain_zh": "lead to…。",
      "root_group": "词根 · lead"
    },
    {
      "word": "learn from",
      "meaning_zh": "向……学习",
      "pos": "verb_phrase",
      "roots": "learn",
      "affix": "base",
      "scene": "学习态度",
      "explain_zh": "learn from mistakes。",
      "root_group": "固定结构"
    },
    {
      "word": "length",
      "meaning_zh": "长度",
      "pos": "noun",
      "roots": "long",
      "affix": "-th",
      "scene": "课堂学习",
      "explain_zh": "the length of…。",
      "root_group": "词根 · long"
    },
    {
      "word": "level",
      "meaning_zh": "水平；级别",
      "pos": "noun",
      "roots": "level",
      "affix": "base",
      "scene": "进步成长",
      "explain_zh": "reach a higher level。",
      "root_group": "词根 · level"
    },
    {
      "word": "limit",
      "meaning_zh": "限制",
      "pos": "noun",
      "roots": "limit",
      "affix": "base",
      "scene": "时间安排",
      "explain_zh": "time limit。",
      "root_group": "词根 · limit"
    },
    {
      "word": "listen to",
      "meaning_zh": "听",
      "pos": "verb_phrase",
      "roots": "listen",
      "affix": "base",
      "scene": "课堂学习",
      "explain_zh": "listen to the teacher。",
      "root_group": "固定结构"
    },
    {
      "word": "local",
      "meaning_zh": "当地的",
      "pos": "adj",
      "roots": "local",
      "affix": "base",
      "scene": "校园生活",
      "explain_zh": "local news。",
      "root_group": "词根 · local"
    },
    {
      "word": "manage",
      "meaning_zh": "设法；管理",
      "pos": "verb",
      "roots": "manage",
      "affix": "base",
      "scene": "问题解决",
      "explain_zh": "manage to do。",
      "root_group": "词根 · manag"
    },
    {
      "word": "material",
      "meaning_zh": "材料",
      "pos": "noun",
      "roots": "material",
      "affix": "base",
      "scene": "课堂学习",
      "explain_zh": "reading materials。",
      "root_group": "词根 · materi"
    },
    {
      "word": "mean",
      "meaning_zh": "意思是；意味着",
      "pos": "verb",
      "roots": "mean",
      "affix": "base",
      "scene": "表达交流",
      "explain_zh": "What does it mean?",
      "root_group": "词根 · mean"
    },
    {
      "word": "memory",
      "meaning_zh": "记忆",
      "pos": "noun",
      "roots": "memory",
      "affix": "base",
      "scene": "学习态度",
      "explain_zh": "in memory of…；have a good memory。",
      "root_group": "词根 · memor"
    },
    {
      "word": "situation",
      "meaning_zh": "情况",
      "pos": "noun",
      "roots": "situation",
      "affix": "base",
      "scene": "问题解决",
      "explain_zh": "in this situation。",
      "root_group": "词根 · situat"
    }
  ],
  [
    {
      "word": "in order to",
      "meaning_zh": "为了",
      "pos": "conj",
      "roots": "order",
      "affix": "conj",
      "scene": "逻辑连接",
      "explain_zh": "为了……；后接动词原形。",
      "root_group": "连词/连接语"
    },
    {
      "word": "prepared",
      "meaning_zh": "准备",
      "pos": "verb",
      "roots": "prepar",
      "affix": "-ed",
      "scene": "活动安排",
      "explain_zh": "准备（过去式/过分）。",
      "root_group": "动词 · 过去式",
      "example_en": "I know that the volunteer kept the queue in order at the canteen entrance yesterday."
    },
    {
      "word": "instead of",
      "meaning_zh": "而不是",
      "pos": "prep_phrase",
      "roots": "instead",
      "affix": "prep+of",
      "scene": "逻辑连接",
      "explain_zh": "而不是……；后接名词/动名词。",
      "root_group": "介词短语"
    },
    {
      "word": "presentation",
      "meaning_zh": "展示",
      "pos": "noun",
      "roots": "present",
      "affix": "-ation",
      "scene": "表达交流",
      "explain_zh": "展示/演示；present + -ation。",
      "root_group": "名词后缀 · -ation/-ity",
      "example_en": "I suppose that the fact is that everyone takes this presentation seriously."
    },
    {
      "word": "keep quiet",
      "meaning_zh": "保持安静",
      "pos": "verb_phrase",
      "roots": "keep",
      "affix": "V+adj",
      "scene": "阅读图书",
      "explain_zh": "保持安静。",
      "root_group": "动宾/固定搭配",
      "example_en": "I believe that it is important that people do not talk loudly in the reading room."
    },
    {
      "word": "problem",
      "meaning_zh": "题目",
      "pos": "noun",
      "roots": "problem",
      "affix": "base",
      "scene": "课堂学习",
      "explain_zh": "问题/题目。",
      "root_group": "词根 · problem",
      "example_en": "My deskmate feels that this problem has a simpler solution."
    },
    {
      "word": "key points",
      "meaning_zh": "关键点",
      "pos": "noun_phrase",
      "roots": "key",
      "affix": "adj+N",
      "scene": "课堂学习",
      "explain_zh": "要点。",
      "root_group": "名词短语",
      "example_en": "I suppose that it is also useful for people attending a lecture to keep noting the key points."
    },
    {
      "word": "valuable",
      "meaning_zh": "有价值",
      "pos": "adj",
      "roots": "valu",
      "affix": "-able",
      "scene": "学习态度",
      "explain_zh": "有价值的；value + -able。",
      "root_group": "形容词词缀",
      "example_en": "I realize that it is important that keeping up with reading aloud improves fluency."
    },
    {
      "word": "lab notes",
      "meaning_zh": "实验记录",
      "pos": "noun_phrase",
      "roots": "lab",
      "affix": "N+N",
      "scene": "实验科学",
      "explain_zh": "实验记录。",
      "root_group": "名词短语",
      "example_en": "I think that it is important that everyone reviews carefully after class."
    },
    {
      "word": "listen carefully",
      "meaning_zh": "认真倾听",
      "pos": "verb_phrase",
      "roots": "listen",
      "affix": "V+adv",
      "scene": "课堂学习",
      "explain_zh": "认真倾听。",
      "root_group": "动宾/固定搭配",
      "example_en": "I think that it is important that students organize their thoughts before speaking."
    },
    {
      "word": "look after",
      "meaning_zh": "照顾",
      "pos": "phrasal",
      "roots": "look",
      "affix": "phrasal:look",
      "scene": "日常短语",
      "explain_zh": "照顾。",
      "root_group": "短语动词 · look"
    },
    {
      "word": "look for",
      "meaning_zh": "寻找",
      "pos": "phrasal",
      "roots": "look",
      "affix": "phrasal:look",
      "scene": "日常短语",
      "explain_zh": "寻找。",
      "root_group": "短语动词 · look"
    },
    {
      "word": "make sure",
      "meaning_zh": "确保",
      "pos": "verb_phrase",
      "roots": "make",
      "affix": "V+adj",
      "scene": "日常短语",
      "explain_zh": "确保、核实。",
      "root_group": "动宾/固定搭配"
    },
    {
      "word": "morning reading",
      "meaning_zh": "早读",
      "pos": "noun_phrase",
      "roots": "read",
      "affix": "N+Ving",
      "scene": "阅读图书",
      "explain_zh": "早读。",
      "root_group": "名词短语",
      "example_en": "I feel that it is important that the group submits reports on time."
    },
    {
      "word": "so as to",
      "meaning_zh": "为了",
      "pos": "conj",
      "roots": "so_as",
      "affix": "conj",
      "scene": "逻辑连接",
      "explain_zh": "表示目的；后接动词原形。",
      "root_group": "连词/连接语"
    },
    {
      "word": "not only",
      "meaning_zh": "不仅",
      "pos": "adv_phrase",
      "roots": "only",
      "affix": "phrase",
      "scene": "逻辑连接",
      "explain_zh": "常与 but also 连用。",
      "root_group": "固定结构"
    },
    {
      "word": "get ready",
      "meaning_zh": "做好准备",
      "pos": "verb_phrase",
      "roots": "ready",
      "affix": "phrase",
      "scene": "活动安排",
      "explain_zh": "准备妥当。",
      "root_group": "动宾/固定搭配"
    },
    {
      "word": "set up",
      "meaning_zh": "布置；安装",
      "pos": "phrasal",
      "roots": "set",
      "affix": "up",
      "scene": "活动安排",
      "explain_zh": "把设备或场地安排好。",
      "root_group": "短语动词"
    },
    {
      "word": "speech",
      "meaning_zh": "演讲",
      "pos": "noun",
      "roots": "speech",
      "affix": "base",
      "scene": "表达交流",
      "explain_zh": "当众讲话。",
      "root_group": "词根 · speech"
    },
    {
      "word": "persuade",
      "meaning_zh": "说服",
      "pos": "verb",
      "roots": "suad",
      "affix": "per-",
      "scene": "表达交流",
      "explain_zh": "让别人接受你的看法。",
      "root_group": "词根 · suad"
    },
    {
      "word": "chapter",
      "meaning_zh": "章节",
      "pos": "noun",
      "roots": "chapter",
      "affix": "base",
      "scene": "阅读图书",
      "explain_zh": "书的一章。",
      "root_group": "词根 · chapter"
    },
    {
      "word": "paragraph",
      "meaning_zh": "段落",
      "pos": "noun",
      "roots": "graph",
      "affix": "para-",
      "scene": "阅读图书",
      "explain_zh": "文章中的一段。",
      "root_group": "词根 · graph"
    },
    {
      "word": "skim",
      "meaning_zh": "略读",
      "pos": "verb",
      "roots": "skim",
      "affix": "base",
      "scene": "阅读图书",
      "explain_zh": "快速浏览大意。",
      "root_group": "词根 · skim"
    },
    {
      "word": "scan",
      "meaning_zh": "扫读",
      "pos": "verb",
      "roots": "scan",
      "affix": "base",
      "scene": "阅读图书",
      "explain_zh": "快速找特定信息。",
      "root_group": "词根 · scan"
    },
    {
      "word": "concentrate",
      "meaning_zh": "集中注意力",
      "pos": "verb",
      "roots": "centr",
      "affix": "con-",
      "scene": "学习态度",
      "explain_zh": "专心；常接 on。",
      "root_group": "词根 · centr"
    },
    {
      "word": "persist",
      "meaning_zh": "坚持",
      "pos": "verb",
      "roots": "sist",
      "affix": "per-",
      "scene": "学习态度",
      "explain_zh": "持续努力不放弃。",
      "root_group": "词根 · sist"
    },
    {
      "word": "microscope",
      "meaning_zh": "显微镜",
      "pos": "noun",
      "roots": "scope",
      "affix": "micro-",
      "scene": "实验科学",
      "explain_zh": "放大看细小物体的仪器。",
      "root_group": "词根 · scope"
    },
    {
      "word": "observe",
      "meaning_zh": "观察",
      "pos": "verb",
      "roots": "serv",
      "affix": "ob-",
      "scene": "实验科学",
      "explain_zh": "仔细看并记录。",
      "root_group": "词根 · serv"
    },
    {
      "word": "hypothesis",
      "meaning_zh": "假设",
      "pos": "noun",
      "roots": "thesis",
      "affix": "hypo-",
      "scene": "实验科学",
      "explain_zh": "实验前提出的推测。",
      "root_group": "词根 · thesis"
    },
    {
      "word": "everyday",
      "meaning_zh": "日常的",
      "pos": "adj",
      "roots": "every+day",
      "affix": "compound",
      "scene": "日常短语",
      "explain_zh": "平常的；作定语。注意与 every day（每天）不同。",
      "root_group": "合成词"
    },
    {
      "word": "by yourself",
      "meaning_zh": "独自；靠自己",
      "pos": "adv_phrase",
      "roots": "self",
      "affix": "phrase",
      "scene": "日常短语",
      "explain_zh": "没有别人帮助。",
      "root_group": "固定结构"
    },
    {
      "word": "at once",
      "meaning_zh": "立刻",
      "pos": "adv_phrase",
      "roots": "once",
      "affix": "phrase",
      "scene": "日常短语",
      "explain_zh": "马上；立刻。",
      "root_group": "固定结构"
    },
    {
      "word": "mention",
      "meaning_zh": "提到",
      "pos": "verb",
      "roots": "mention",
      "affix": "base",
      "scene": "表达交流",
      "explain_zh": "mention that…。",
      "root_group": "词根 · mention"
    },
    {
      "word": "method",
      "meaning_zh": "方法",
      "pos": "noun",
      "roots": "method",
      "affix": "base",
      "scene": "课堂学习",
      "explain_zh": "a useful method。",
      "root_group": "词根 · method"
    },
    {
      "word": "modern",
      "meaning_zh": "现代的",
      "pos": "adj",
      "roots": "modern",
      "affix": "base",
      "scene": "科技电脑",
      "explain_zh": "modern technology。",
      "root_group": "词根 · modern"
    },
    {
      "word": "natural",
      "meaning_zh": "自然的",
      "pos": "adj",
      "roots": "natur",
      "affix": "-al",
      "scene": "实验科学",
      "explain_zh": "natural resources。",
      "root_group": "词根 · natur"
    },
    {
      "word": "necessary",
      "meaning_zh": "必要的",
      "pos": "adj",
      "roots": "necessary",
      "affix": "base",
      "scene": "学习态度",
      "explain_zh": "It is necessary to…。",
      "root_group": "词根 · necess"
    },
    {
      "word": "notice",
      "meaning_zh": "注意到；通知",
      "pos": "verb",
      "roots": "notice",
      "affix": "base",
      "scene": "日常短语",
      "explain_zh": "notice sb doing。",
      "root_group": "词根 · notic"
    },
    {
      "word": "offer",
      "meaning_zh": "提供",
      "pos": "verb",
      "roots": "offer",
      "affix": "base",
      "scene": "表达交流",
      "explain_zh": "offer to help。",
      "root_group": "词根 · offer"
    },
    {
      "word": "opinion",
      "meaning_zh": "观点",
      "pos": "noun",
      "roots": "opinion",
      "affix": "base",
      "scene": "表达交流",
      "explain_zh": "in my opinion。",
      "root_group": "词根 · opin"
    },
    {
      "word": "opportunity",
      "meaning_zh": "机会",
      "pos": "noun",
      "roots": "opportunity",
      "affix": "base",
      "scene": "进步成长",
      "explain_zh": "a great opportunity。",
      "root_group": "词根 · opportun"
    },
    {
      "word": "organize",
      "meaning_zh": "组织",
      "pos": "verb",
      "roots": "organize",
      "affix": "base",
      "scene": "活动安排",
      "explain_zh": "organize an event。",
      "root_group": "词根 · organiz"
    },
    {
      "word": "overcome",
      "meaning_zh": "克服",
      "pos": "verb",
      "roots": "over",
      "affix": "come",
      "scene": "问题解决",
      "explain_zh": "overcome difficulties。",
      "root_group": "词根 · over+come"
    },
    {
      "word": "perform",
      "meaning_zh": "表演；表现",
      "pos": "verb",
      "roots": "perform",
      "affix": "base",
      "scene": "体育运动",
      "explain_zh": "perform well。",
      "root_group": "词根 · perform"
    },
    {
      "word": "perhaps",
      "meaning_zh": "也许",
      "pos": "adv",
      "roots": "perhaps",
      "affix": "base",
      "scene": "日常短语",
      "explain_zh": "perhaps later。",
      "root_group": "词根 · perhaps"
    },
    {
      "word": "personal",
      "meaning_zh": "个人的",
      "pos": "adj",
      "roots": "person",
      "affix": "-al",
      "scene": "日常短语",
      "explain_zh": "personal information。",
      "root_group": "词根 · person"
    },
    {
      "word": "pollution",
      "meaning_zh": "污染",
      "pos": "noun",
      "roots": "pollut",
      "affix": "-ion",
      "scene": "实验科学",
      "explain_zh": "air pollution。",
      "root_group": "词根 · pollut"
    },
    {
      "word": "popular",
      "meaning_zh": "受欢迎的",
      "pos": "adj",
      "roots": "popular",
      "affix": "base",
      "scene": "校园生活",
      "explain_zh": "be popular with…。",
      "root_group": "词根 · popul"
    },
    {
      "word": "skill",
      "meaning_zh": "技能",
      "pos": "noun",
      "roots": "skill",
      "affix": "base",
      "scene": "进步成长",
      "explain_zh": "practice a skill。",
      "root_group": "词根 · skill"
    },
    {
      "word": "social",
      "meaning_zh": "社会的",
      "pos": "adj",
      "roots": "social",
      "affix": "base",
      "scene": "表达交流",
      "explain_zh": "social media。",
      "root_group": "词根 · social"
    }
  ],
  [
    {
      "word": "note down",
      "meaning_zh": "记下",
      "pos": "phrasal",
      "roots": "note",
      "affix": "phrasal:note",
      "scene": "课堂学习",
      "explain_zh": "记下。",
      "root_group": "短语动词 · note",
      "example_en": "I suppose that it is also useful for people attending a lecture to keep noting the key points."
    },
    {
      "word": "on time",
      "meaning_zh": "按时",
      "pos": "adv_phrase",
      "roots": "time",
      "affix": "prep+N",
      "scene": "时间安排",
      "explain_zh": "按时。",
      "root_group": "介词短语",
      "example_en": "The teacher believes that students can finish the project on time."
    },
    {
      "word": "one another",
      "meaning_zh": "互相",
      "pos": "pron_phrase",
      "roots": "another",
      "affix": "reciprocal",
      "scene": "团队协作",
      "explain_zh": "互相（三者以上常用）。",
      "root_group": "相互代词",
      "example_en": "I know that it is important that different opinions are expressed politely."
    },
    {
      "word": "pick up",
      "meaning_zh": "捡起",
      "pos": "phrasal",
      "roots": "pick",
      "affix": "phrasal:pick",
      "scene": "日常短语",
      "explain_zh": "捡起；也可指学会/接人。",
      "root_group": "短语动词 · pick"
    },
    {
      "word": "power went out",
      "meaning_zh": "停电",
      "pos": "verb_phrase",
      "roots": "power",
      "affix": "idiom",
      "scene": "科技电脑",
      "explain_zh": "停电了。",
      "root_group": "习语",
      "example_en": "I suppose that the computer class was interrupted because the power went out suddenly."
    },
    {
      "word": "put on",
      "meaning_zh": "穿上",
      "pos": "phrasal",
      "roots": "put",
      "affix": "phrasal:put",
      "scene": "日常短语",
      "explain_zh": "穿上（衣服等）。",
      "root_group": "短语动词 · put"
    },
    {
      "word": "put phones aside",
      "meaning_zh": "把手机放一边",
      "pos": "verb_phrase",
      "roots": "put",
      "affix": "phrasal:put",
      "scene": "学习态度",
      "explain_zh": "把手机放一边。",
      "root_group": "短语动词 · put",
      "example_en": "I realize that it is important that students turn off unrelated notifications while doing homework."
    },
    {
      "word": "rained heavily",
      "meaning_zh": "下大雨",
      "pos": "verb_phrase",
      "roots": "rain",
      "affix": "V+adv",
      "scene": "天气出行",
      "explain_zh": "下大雨。",
      "root_group": "动宾/固定搭配",
      "example_en": "I feel that the sports meeting was postponed because it rained heavily."
    },
    {
      "word": "raise a hand",
      "meaning_zh": "举手",
      "pos": "verb_phrase",
      "roots": "raise",
      "affix": "V+N",
      "scene": "课堂学习",
      "explain_zh": "举手。",
      "root_group": "动宾/固定搭配",
      "example_en": "I believe that it is also polite for everyone to keep raising a hand before speaking."
    },
    {
      "word": "rather than",
      "meaning_zh": "而不是",
      "pos": "conj",
      "roots": "rather",
      "affix": "conj",
      "scene": "逻辑连接",
      "explain_zh": "而不是；常接动词原形或名词。",
      "root_group": "连词/连接语"
    },
    {
      "word": "read aloud",
      "meaning_zh": "朗读",
      "pos": "verb_phrase",
      "roots": "read",
      "affix": "V+adv",
      "scene": "阅读图书",
      "explain_zh": "朗读。",
      "root_group": "动宾/固定搭配",
      "example_en": "I believe that it is helpful for beginners to read aloud often."
    },
    {
      "word": "reference book",
      "meaning_zh": "参考书",
      "pos": "noun_phrase",
      "roots": "refer",
      "affix": "-ence+N",
      "scene": "阅读图书",
      "explain_zh": "参考书；refer → reference。",
      "root_group": "名词后缀 · -ation/-ity",
      "example_en": "I know that the teacher recommended a reading list in the library last week."
    },
    {
      "word": "school bus",
      "meaning_zh": "班车",
      "pos": "noun_phrase",
      "roots": "school",
      "affix": "N+N",
      "scene": "天气出行",
      "explain_zh": "校车/班车。",
      "root_group": "名词短语",
      "example_en": "I know that the school bus was late because there was a traffic jam."
    },
    {
      "word": "science lab",
      "meaning_zh": "实验室",
      "pos": "noun_phrase",
      "roots": "scien",
      "affix": "N+N",
      "scene": "实验科学",
      "explain_zh": "科学实验室。",
      "root_group": "名词短语",
      "example_en": "I know that the teacher demonstrated the steps in the lab yesterday."
    },
    {
      "word": "underline",
      "meaning_zh": "在……下划线",
      "pos": "verb",
      "roots": "line",
      "affix": "under-",
      "scene": "课堂学习",
      "explain_zh": "划线标出重点。",
      "root_group": "前缀 · under-"
    },
    {
      "word": "highlight",
      "meaning_zh": "高亮标出",
      "pos": "verb",
      "roots": "light",
      "affix": "high-",
      "scene": "课堂学习",
      "explain_zh": "用荧光笔标重点。",
      "root_group": "合成词"
    },
    {
      "word": "in a hurry",
      "meaning_zh": "匆忙地",
      "pos": "adv_phrase",
      "roots": "hurry",
      "affix": "phrase",
      "scene": "时间安排",
      "explain_zh": "很急；赶时间。",
      "root_group": "介词短语"
    },
    {
      "word": "ahead of time",
      "meaning_zh": "提前",
      "pos": "adv_phrase",
      "roots": "ahead",
      "affix": "phrase",
      "scene": "时间安排",
      "explain_zh": "比原定时间早。",
      "root_group": "时间表达"
    },
    {
      "word": "each other",
      "meaning_zh": "互相",
      "pos": "pronoun",
      "roots": "each",
      "affix": "phrase",
      "scene": "团队协作",
      "explain_zh": "两者之间互相。",
      "root_group": "相互代词"
    },
    {
      "word": "together",
      "meaning_zh": "一起",
      "pos": "adv",
      "roots": "gether",
      "affix": "to-",
      "scene": "团队协作",
      "explain_zh": "共同行动。",
      "root_group": "副词 · -ly"
    },
    {
      "word": "plug in",
      "meaning_zh": "插上电源",
      "pos": "phrasal",
      "roots": "plug",
      "affix": "in",
      "scene": "科技电脑",
      "explain_zh": "把插头插入插座。",
      "root_group": "短语动词"
    },
    {
      "word": "log in",
      "meaning_zh": "登录",
      "pos": "phrasal",
      "roots": "log",
      "affix": "in",
      "scene": "科技电脑",
      "explain_zh": "输入账号进入系统。",
      "root_group": "短语动词"
    },
    {
      "word": "log out",
      "meaning_zh": "退出登录",
      "pos": "phrasal",
      "roots": "log",
      "affix": "out",
      "scene": "科技电脑",
      "explain_zh": "离开账号。",
      "root_group": "短语动词"
    },
    {
      "word": "give up easily",
      "meaning_zh": "轻易放弃",
      "pos": "verb_phrase",
      "roots": "give",
      "affix": "phrase",
      "scene": "学习态度",
      "explain_zh": "遇到困难就马上停止。",
      "root_group": "动宾/固定搭配"
    },
    {
      "word": "keep trying",
      "meaning_zh": "继续尝试",
      "pos": "verb_phrase",
      "roots": "keep",
      "affix": "-ing",
      "scene": "学习态度",
      "explain_zh": "不放弃地再试。",
      "root_group": "动宾/固定搭配"
    },
    {
      "word": "cloudy",
      "meaning_zh": "多云的",
      "pos": "adj",
      "roots": "cloud",
      "affix": "-y",
      "scene": "天气出行",
      "explain_zh": "天空有云。",
      "root_group": "形容词词缀"
    },
    {
      "word": "umbrella",
      "meaning_zh": "雨伞",
      "pos": "noun",
      "roots": "umbrella",
      "affix": "base",
      "scene": "天气出行",
      "explain_zh": "挡雨的伞。",
      "root_group": "名词派生"
    },
    {
      "word": "although",
      "meaning_zh": "虽然",
      "pos": "conj",
      "roots": "though",
      "affix": "al-",
      "scene": "逻辑连接",
      "explain_zh": "引导让步从句；不与 but 连用。",
      "root_group": "连词/连接语"
    },
    {
      "word": "unless",
      "meaning_zh": "除非",
      "pos": "conj",
      "roots": "less",
      "affix": "un-",
      "scene": "逻辑连接",
      "explain_zh": "如果不……；引导条件。",
      "root_group": "连词/连接语"
    },
    {
      "word": "contents page",
      "meaning_zh": "目录页",
      "pos": "noun_phrase",
      "roots": "content",
      "affix": "phrase",
      "scene": "阅读图书",
      "explain_zh": "列出章节页码的页。",
      "root_group": "名词短语"
    },
    {
      "word": "footnote",
      "meaning_zh": "脚注",
      "pos": "noun",
      "roots": "foot+note",
      "affix": "compound",
      "scene": "阅读图书",
      "explain_zh": "页底的注释。",
      "root_group": "合成词"
    },
    {
      "word": "beaker",
      "meaning_zh": "烧杯",
      "pos": "noun",
      "roots": "beak",
      "affix": "-er",
      "scene": "实验科学",
      "explain_zh": "实验室盛液体的杯子。",
      "root_group": "名词派生"
    },
    {
      "word": "prepare for",
      "meaning_zh": "为……准备",
      "pos": "verb_phrase",
      "roots": "prepare",
      "affix": "base",
      "scene": "时间安排",
      "explain_zh": "prepare for the exam。",
      "root_group": "固定结构"
    },
    {
      "word": "present",
      "meaning_zh": "展示；礼物；出席的",
      "pos": "verb",
      "roots": "present",
      "affix": "base",
      "scene": "课堂学习",
      "explain_zh": "present an idea。",
      "root_group": "词根 · present"
    },
    {
      "word": "prevent",
      "meaning_zh": "防止",
      "pos": "verb",
      "roots": "prevent",
      "affix": "base",
      "scene": "健康生活",
      "explain_zh": "prevent sb from doing。",
      "root_group": "词根 · prevent"
    },
    {
      "word": "price",
      "meaning_zh": "价格",
      "pos": "noun",
      "roots": "price",
      "affix": "base",
      "scene": "日常短语",
      "explain_zh": "the price of…。",
      "root_group": "词根 · price"
    },
    {
      "word": "probably",
      "meaning_zh": "大概",
      "pos": "adv",
      "roots": "probably",
      "affix": "base",
      "scene": "逻辑连接",
      "explain_zh": "probably true。",
      "root_group": "词根 · probabl"
    },
    {
      "word": "process",
      "meaning_zh": "过程",
      "pos": "noun",
      "roots": "process",
      "affix": "base",
      "scene": "科技电脑",
      "explain_zh": "in the process。",
      "root_group": "词根 · process"
    },
    {
      "word": "produce",
      "meaning_zh": "生产；产生",
      "pos": "verb",
      "roots": "produce",
      "affix": "base",
      "scene": "实验科学",
      "explain_zh": "produce energy。",
      "root_group": "词根 · produc"
    },
    {
      "word": "protect",
      "meaning_zh": "保护",
      "pos": "verb",
      "roots": "protect",
      "affix": "base",
      "scene": "健康生活",
      "explain_zh": "protect the environment。",
      "root_group": "词根 · protect"
    },
    {
      "word": "provide",
      "meaning_zh": "提供",
      "pos": "verb",
      "roots": "provide",
      "affix": "base",
      "scene": "团队协作",
      "explain_zh": "provide sb with sth。",
      "root_group": "词根 · provid"
    },
    {
      "word": "purpose",
      "meaning_zh": "目的",
      "pos": "noun",
      "roots": "purpose",
      "affix": "base",
      "scene": "逻辑连接",
      "explain_zh": "for the purpose of…。",
      "root_group": "词根 · purpos"
    },
    {
      "word": "quality",
      "meaning_zh": "质量",
      "pos": "noun",
      "roots": "quality",
      "affix": "base",
      "scene": "学习态度",
      "explain_zh": "high quality。",
      "root_group": "词根 · qualit"
    },
    {
      "word": "quickly",
      "meaning_zh": "迅速地",
      "pos": "adv",
      "roots": "quick",
      "affix": "-ly",
      "scene": "时间安排",
      "explain_zh": "think quickly。",
      "root_group": "词根 · quick"
    },
    {
      "word": "quietly",
      "meaning_zh": "安静地",
      "pos": "adv",
      "roots": "quiet",
      "affix": "-ly",
      "scene": "课堂学习",
      "explain_zh": "sit quietly。",
      "root_group": "词根 · quiet"
    },
    {
      "word": "raise",
      "meaning_zh": "举起；提高；筹集",
      "pos": "verb",
      "roots": "raise",
      "affix": "base",
      "scene": "活动安排",
      "explain_zh": "raise money。",
      "root_group": "词根 · raise"
    },
    {
      "word": "realize",
      "meaning_zh": "意识到；实现",
      "pos": "verb",
      "roots": "realize",
      "affix": "base",
      "scene": "学习态度",
      "explain_zh": "realize that…。",
      "root_group": "词根 · realiz"
    },
    {
      "word": "receive",
      "meaning_zh": "收到",
      "pos": "verb",
      "roots": "receive",
      "affix": "base",
      "scene": "日常短语",
      "explain_zh": "receive a letter。",
      "root_group": "词根 · receiv"
    },
    {
      "word": "source",
      "meaning_zh": "来源",
      "pos": "noun",
      "roots": "source",
      "affix": "base",
      "scene": "阅读图书",
      "explain_zh": "a reliable source。",
      "root_group": "词根 · source"
    },
    {
      "word": "special",
      "meaning_zh": "特别的",
      "pos": "adj",
      "roots": "special",
      "affix": "base",
      "scene": "活动安排",
      "explain_zh": "a special day。",
      "root_group": "词根 · special"
    }
  ],
  [
    {
      "word": "so that",
      "meaning_zh": "以便",
      "pos": "conj",
      "roots": "so",
      "affix": "conj",
      "scene": "逻辑连接",
      "explain_zh": "以便/为了；引导目的从句。",
      "root_group": "连词/连接语"
    },
    {
      "word": "speaking practice",
      "meaning_zh": "口语练习",
      "pos": "noun_phrase",
      "roots": "speak",
      "affix": "Ving+N",
      "scene": "表达交流",
      "explain_zh": "口语练习。",
      "root_group": "名词短语",
      "example_en": "I realize that it is important that keeping up with reading aloud improves fluency."
    },
    {
      "word": "starting stance",
      "meaning_zh": "起跑姿势",
      "pos": "noun_phrase",
      "roots": "start",
      "affix": "Ving+N",
      "scene": "体育运动",
      "explain_zh": "起跑姿势。",
      "root_group": "名词短语",
      "example_en": "I know that the classmate timed me on the running track yesterday."
    },
    {
      "word": "support each other",
      "meaning_zh": "互相支持",
      "pos": "verb_phrase",
      "roots": "support",
      "affix": "V+recip",
      "scene": "团队协作",
      "explain_zh": "互相支持。",
      "root_group": "动宾/固定搭配",
      "example_en": "The coach thinks that the players will support each other."
    },
    {
      "word": "take off",
      "meaning_zh": "脱下",
      "pos": "phrasal",
      "roots": "take",
      "affix": "phrasal:take",
      "scene": "日常短语",
      "explain_zh": "脱下；也可指起飞。",
      "root_group": "短语动词 · take"
    },
    {
      "word": "take part in",
      "meaning_zh": "参加",
      "pos": "phrasal",
      "roots": "take",
      "affix": "phrasal:take",
      "scene": "校园生活",
      "explain_zh": "参加。",
      "root_group": "短语动词 · take"
    },
    {
      "word": "time was tight",
      "meaning_zh": "时间紧",
      "pos": "idiom",
      "roots": "time",
      "affix": "idiom",
      "scene": "时间安排",
      "explain_zh": "时间很紧。",
      "root_group": "习语",
      "example_en": "I believe that she handed in a complete report even though time was tight."
    },
    {
      "word": "timely feedback",
      "meaning_zh": "及时反馈",
      "pos": "noun_phrase",
      "roots": "time",
      "affix": "-ly+N",
      "scene": "进步成长",
      "explain_zh": "及时反馈。",
      "root_group": "名词短语",
      "example_en": "I think that the truth is that timely feedback speeds up progress."
    },
    {
      "word": "traffic jam",
      "meaning_zh": "交通堵塞",
      "pos": "noun_phrase",
      "roots": "traffic",
      "affix": "N+N",
      "scene": "天气出行",
      "explain_zh": "交通堵塞。",
      "root_group": "名词短语",
      "example_en": "I know that the school bus was late because there was a traffic jam."
    },
    {
      "word": "turn off",
      "meaning_zh": "关闭",
      "pos": "phrasal",
      "roots": "turn",
      "affix": "phrasal:turn",
      "scene": "科技电脑",
      "explain_zh": "关闭（电源/设备）。",
      "root_group": "短语动词 · turn",
      "example_en": "I realize that it is important that students turn off unrelated notifications while doing homework."
    },
    {
      "word": "turn on",
      "meaning_zh": "打开",
      "pos": "phrasal",
      "roots": "turn",
      "affix": "phrasal:turn",
      "scene": "科技电脑",
      "explain_zh": "打开（电源/设备）。",
      "root_group": "短语动词 · turn"
    },
    {
      "word": "warm up",
      "meaning_zh": "热身",
      "pos": "phrasal",
      "roots": "warm",
      "affix": "phrasal:warm",
      "scene": "体育运动",
      "explain_zh": "热身。",
      "root_group": "短语动词 · warm",
      "example_en": "I realize that it is necessary for athletes to warm up before a match."
    },
    {
      "word": "wear goggles",
      "meaning_zh": "戴护目镜",
      "pos": "verb_phrase",
      "roots": "wear",
      "affix": "V+N",
      "scene": "实验科学",
      "explain_zh": "戴护目镜。",
      "root_group": "动宾/固定搭配",
      "example_en": "I feel that the point is that students must wear goggles before experiments."
    },
    {
      "word": "weekly plan",
      "meaning_zh": "周计划",
      "pos": "noun_phrase",
      "roots": "week",
      "affix": "-ly+N",
      "scene": "时间安排",
      "explain_zh": "周计划。",
      "root_group": "名词短语",
      "example_en": "I think that it is also practical for busy students to keep making a weekly plan."
    },
    {
      "word": "in case",
      "meaning_zh": "以防；万一",
      "pos": "conj",
      "roots": "case",
      "affix": "phrase",
      "scene": "逻辑连接",
      "explain_zh": "以防某种情况发生。",
      "root_group": "连词/连接语"
    },
    {
      "word": "even if",
      "meaning_zh": "即使",
      "pos": "conj",
      "roots": "even",
      "affix": "conj",
      "scene": "逻辑连接",
      "explain_zh": "即使……也……。",
      "root_group": "连词/连接语"
    },
    {
      "word": "pronounce",
      "meaning_zh": "发音",
      "pos": "verb",
      "roots": "nounc",
      "affix": "pro-",
      "scene": "表达交流",
      "explain_zh": "把词读出来。",
      "root_group": "词根 · nounc"
    },
    {
      "word": "fluently",
      "meaning_zh": "流利地",
      "pos": "adv",
      "roots": "fluent",
      "affix": "-ly",
      "scene": "表达交流",
      "explain_zh": "说话顺畅。",
      "root_group": "副词 · -ly"
    },
    {
      "word": "opponent",
      "meaning_zh": "对手",
      "pos": "noun",
      "roots": "pon",
      "affix": "op-",
      "scene": "体育运动",
      "explain_zh": "比赛中的对方。",
      "root_group": "词根 · pon"
    },
    {
      "word": "referee",
      "meaning_zh": "裁判",
      "pos": "noun",
      "roots": "fer",
      "affix": "re-",
      "scene": "体育运动",
      "explain_zh": "主持比赛判罚的人。",
      "root_group": "词根 · fer"
    },
    {
      "word": "encourage",
      "meaning_zh": "鼓励",
      "pos": "verb",
      "roots": "cour",
      "affix": "en-",
      "scene": "团队协作",
      "explain_zh": "给人勇气和信心。",
      "root_group": "词根 · cour"
    },
    {
      "word": "appreciate",
      "meaning_zh": "感激；欣赏",
      "pos": "verb",
      "roots": "preci",
      "affix": "ap-",
      "scene": "团队协作",
      "explain_zh": "感谢帮助或欣赏优点。",
      "root_group": "词根 · preci"
    },
    {
      "word": "hang up",
      "meaning_zh": "挂断；挂起",
      "pos": "phrasal",
      "roots": "hang",
      "affix": "up",
      "scene": "日常短语",
      "explain_zh": "挂电话或挂衣服。",
      "root_group": "短语动词"
    },
    {
      "word": "look forward to",
      "meaning_zh": "期待",
      "pos": "phrasal",
      "roots": "look",
      "affix": "to",
      "scene": "日常短语",
      "explain_zh": "盼望；后接名词或动名词。",
      "root_group": "短语动词 · look"
    },
    {
      "word": "enrol",
      "meaning_zh": "注册入学",
      "pos": "verb",
      "roots": "rol",
      "affix": "en-",
      "scene": "校园生活",
      "explain_zh": "登记成为学生（英式）。",
      "root_group": "词根 · rol"
    },
    {
      "word": "assembly",
      "meaning_zh": "集会；早会",
      "pos": "noun",
      "roots": "sembl",
      "affix": "as-",
      "scene": "校园生活",
      "explain_zh": "全校集合。",
      "root_group": "词根 · sembl"
    },
    {
      "word": "postpone",
      "meaning_zh": "推迟",
      "pos": "verb",
      "roots": "pon",
      "affix": "post-",
      "scene": "时间安排",
      "explain_zh": "改到较晚时间（动词形式）。",
      "root_group": "前缀 · post-"
    },
    {
      "word": "rush hour",
      "meaning_zh": "高峰时段",
      "pos": "noun_phrase",
      "roots": "rush",
      "affix": "phrase",
      "scene": "天气出行",
      "explain_zh": "上下班交通最拥堵的时段。",
      "root_group": "名词短语"
    },
    {
      "word": "pedestrian",
      "meaning_zh": "行人",
      "pos": "noun",
      "roots": "ped",
      "affix": "-estrian",
      "scene": "天气出行",
      "explain_zh": "走路的人。",
      "root_group": "词根 · ped"
    },
    {
      "word": "reboot",
      "meaning_zh": "重启",
      "pos": "verb",
      "roots": "boot",
      "affix": "re-",
      "scene": "科技电脑",
      "explain_zh": "重新启动电脑。",
      "root_group": "前缀 · re-"
    },
    {
      "word": "update",
      "meaning_zh": "更新",
      "pos": "verb",
      "roots": "date",
      "affix": "up-",
      "scene": "科技电脑",
      "explain_zh": "升级到新版本。",
      "root_group": "短语动词 · 方向"
    },
    {
      "word": "safety first",
      "meaning_zh": "安全第一",
      "pos": "idiom",
      "roots": "safety",
      "affix": "phrase",
      "scene": "实验科学",
      "explain_zh": "实验与出行都要把安全放首位。",
      "root_group": "习语"
    },
    {
      "word": "recent",
      "meaning_zh": "最近的",
      "pos": "adj",
      "roots": "recent",
      "affix": "base",
      "scene": "时间安排",
      "explain_zh": "in recent years。",
      "root_group": "词根 · recent"
    },
    {
      "word": "recognize",
      "meaning_zh": "认出；承认",
      "pos": "verb",
      "roots": "recognize",
      "affix": "base",
      "scene": "表达交流",
      "explain_zh": "recognize a face。",
      "root_group": "词根 · recogniz"
    },
    {
      "word": "recommend",
      "meaning_zh": "推荐",
      "pos": "verb",
      "roots": "recommend",
      "affix": "base",
      "scene": "表达交流",
      "explain_zh": "recommend doing / that…。",
      "root_group": "词根 · recommend"
    },
    {
      "word": "record",
      "meaning_zh": "记录；纪录",
      "pos": "noun",
      "roots": "record",
      "affix": "base",
      "scene": "体育运动",
      "explain_zh": "break a record。",
      "root_group": "词根 · record"
    },
    {
      "word": "reduce",
      "meaning_zh": "减少",
      "pos": "verb",
      "roots": "reduce",
      "affix": "base",
      "scene": "健康生活",
      "explain_zh": "reduce stress。",
      "root_group": "词根 · reduc"
    },
    {
      "word": "refuse",
      "meaning_zh": "拒绝",
      "pos": "verb",
      "roots": "refuse",
      "affix": "base",
      "scene": "表达交流",
      "explain_zh": "refuse to do。",
      "root_group": "词根 · refus"
    },
    {
      "word": "regard",
      "meaning_zh": "认为；看待",
      "pos": "verb",
      "roots": "regard",
      "affix": "base",
      "scene": "逻辑连接",
      "explain_zh": "regard A as B。",
      "root_group": "词根 · regard"
    },
    {
      "word": "regular",
      "meaning_zh": "定期的；有规律的",
      "pos": "adj",
      "roots": "regular",
      "affix": "base",
      "scene": "健康生活",
      "explain_zh": "regular exercise。",
      "root_group": "词根 · regul"
    },
    {
      "word": "relate to",
      "meaning_zh": "与……相关",
      "pos": "verb_phrase",
      "roots": "relate",
      "affix": "base",
      "scene": "逻辑连接",
      "explain_zh": "relate to the topic。",
      "root_group": "固定结构"
    },
    {
      "word": "remain",
      "meaning_zh": "保持；剩余",
      "pos": "verb",
      "roots": "remain",
      "affix": "base",
      "scene": "日常短语",
      "explain_zh": "remain calm。",
      "root_group": "词根 · remain"
    },
    {
      "word": "remind",
      "meaning_zh": "提醒",
      "pos": "verb",
      "roots": "remind",
      "affix": "base",
      "scene": "时间安排",
      "explain_zh": "remind sb to do。",
      "root_group": "词根 · remind"
    },
    {
      "word": "remove",
      "meaning_zh": "移除",
      "pos": "verb",
      "roots": "remove",
      "affix": "base",
      "scene": "科技电脑",
      "explain_zh": "remove a file。",
      "root_group": "词根 · remov"
    },
    {
      "word": "require",
      "meaning_zh": "需要；要求",
      "pos": "verb",
      "roots": "require",
      "affix": "base",
      "scene": "课堂学习",
      "explain_zh": "require sb to do。",
      "root_group": "词根 · requir"
    },
    {
      "word": "research",
      "meaning_zh": "研究",
      "pos": "noun",
      "roots": "research",
      "affix": "base",
      "scene": "实验科学",
      "explain_zh": "do research。",
      "root_group": "词根 · research"
    },
    {
      "word": "respect",
      "meaning_zh": "尊重",
      "pos": "verb",
      "roots": "respect",
      "affix": "base",
      "scene": "团队协作",
      "explain_zh": "respect others。",
      "root_group": "词根 · respect"
    },
    {
      "word": "speed",
      "meaning_zh": "速度",
      "pos": "noun",
      "roots": "speed",
      "affix": "base",
      "scene": "体育运动",
      "explain_zh": "at high speed。",
      "root_group": "词根 · speed"
    },
    {
      "word": "spread",
      "meaning_zh": "传播；展开",
      "pos": "verb",
      "roots": "spread",
      "affix": "base",
      "scene": "表达交流",
      "explain_zh": "spread the news。",
      "root_group": "词根 · spread"
    },
    {
      "word": "standard",
      "meaning_zh": "标准",
      "pos": "noun",
      "roots": "standard",
      "affix": "base",
      "scene": "课堂学习",
      "explain_zh": "meet the standard。",
      "root_group": "词根 · standard"
    }
  ]
];

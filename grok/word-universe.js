/* Personal word universe: exact unit membership, all unit entries (including
 * phrases), recent track/sense-specific evidence, and live local refresh.
 * Completion never awards mastery; missing collocation evidence blocks 熟练.
 */
(function (root, factory) {
  var api = factory(root);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.QuizMarioWordUniverse = api;
  if (root && root.document && root.document.getElementById && root.document.getElementById("universe-root")) {
    api.mount(root.document.getElementById("universe-root"));
  }
})(typeof window !== "undefined" ? window : globalThis, function (root) {
  "use strict";

  var Progress = root.QuizMarioUniverseProgress;
  if (!Progress && typeof require === "function") Progress = require("./universe-progress.js");
  var SAVE_KEY = "vocabSpotlight_v1";
  var EVENT_KEY = "quizmario_learner_events_v1";
  var LEGEND = "颜色越深 = 越不熟练";
  var UNSCORED_NOTE = "灰色 = 尚无证据，不记成 0 分；有搭配待验证时不标熟练";
  var PHRASE_CAP = 8;

  function wordSet(text) {
    var out = Object.create(null);
    var parts = String(text || "").split(/\s+/);
    for (var i = 0; i < parts.length; i++) if (parts[i]) out[parts[i]] = true;
    return out;
  }

  var THEMES = [
    {
      id: "technology",
      label: "TECHNOLOGY",
      zh: "科学与技术",
      hue: 196,
      en: wordSet("alarm computer internet phone software digital technology robot email e-mail website online keyboard screen television radio camera video media program code device electronic network app smartphone telephone laptop tablet ai tv data digital"),
      stems: ["comput", "internet", "technolog", "digit", "softwar", "phone", "robot", "email", "website", "online", "keyboard", "screen", "televis", "camera", "video", "network", "electron", "laptop", "tablet"],
      zhKeys: ["电脑", "计算机", "互联网", "网络", "软件", "科技", "技术", "数字", "电话", "手机", "程序", "键盘", "机器人", "电子邮件", "网站", "电子", "屏幕", "电视", "相机"],
    },
    {
      id: "school",
      label: "SCHOOL",
      zh: "学习与交流",
      hue: 42,
      en: wordSet("advice school teacher student class lesson exam test homework book learn study classroom pupil college university pencil pen desk grade course dictionary library knowledge education classmate textbook subject math maths science history language english chinese question answer read write spell notebook homework"),
      stems: ["school", "teach", "student", "lesson", "exam", "homework", "college", "univers", "librar", "diction", "educat", "textbook", "science", "history"],
      zhKeys: ["学校", "老师", "教师", "学生", "课堂", "作业", "考试", "图书馆", "字典", "教育"],
    },
    {
      id: "nature",
      label: "NATURE",
      zh: "自然与环境",
      hue: 132,
      en: wordSet("nature natural animal plant tree flower river mountain weather rain snow wind sun moon star earth sea ocean forest bird fish dog cat horse farm grass leaf sky cloud water fire air environment pollution tiger lion panda garden weather"),
      stems: ["natur", "animal", "plant", "mountain", "weather", "ocean", "forest", "environment", "pollut", "river", "flower"],
      zhKeys: ["自然", "动物", "植物", "天气", "山", "河", "海", "森林", "环境"],
    },
    {
      id: "life",
      label: "LIFE",
      zh: "生活与健康",
      hue: 352,
      en: wordSet("adult ache aid life live alive living lifestyle lifetime childhood death dead die dying family home house friend friendship love health healthy food meal breakfast lunch dinner parent mother father mom dad baby child birth body heart blood face hand eye hair sleep eat drink cook kitchen hospital doctor nurse medicine ill sick people person man woman boy girl husband wife brother sister uncle aunt grow growth pet clothes shirt dress shoe sport sports game music song film movie holiday birthday age young old"),
      stems: ["life", "live", "child", "family", "friend", "health", "mother", "father", "brother", "sister", "hospital", "doctor", "medicine", "breakfast", "dinner"],
      zhKeys: ["生活", "生命", "家庭", "健康", "食物", "身体", "医院", "医生"],
    },
    {
      id: "feeling",
      label: "FEELING",
      zh: "情绪与态度",
      hue: 300,
      en: wordSet("happy happiness sad sadness angry anger fear afraid hope worry smile cry joy sorry proud lonely nervous excite excited exciting surprise surprised surprising emotion feel feeling anxious anxiety hate"),
      stems: ["happ", "anger", "angry", "afraid", "worry", "nervous", "excit", "surpris", "emotion", "lonely"],
      zhKeys: ["高兴", "快乐", "伤心", "生气", "害怕", "情感", "担心"],
    },
    {
      id: "travel",
      label: "TRAVEL",
      zh: "出行与空间",
      hue: 210,
      en: wordSet("abroad ahead travel trip train bus car plane airport station road street map hotel tourist visit ticket ship bike bicycle traffic journey taxi flight passenger railway subway boat"),
      stems: ["travel", "airport", "station", "tourist", "traffic", "journey", "bicycle", "railway", "subway"],
      zhKeys: ["旅行", "交通", "机场", "车站", "火车", "飞机"],
    },
    {
      id: "time",
      label: "TIME",
      zh: "时间与频率",
      hue: 24,
      en: wordSet("ago again time today tomorrow yesterday morning afternoon evening night week month year hour minute clock calendar season spring summer autumn winter early late always never often sometimes daily weekly weekend"),
      stems: ["today", "tomorrow", "yesterday", "morning", "afternoon", "evening", "calendar", "season", "winter", "summer", "autumn", "spring", "night", "week", "month", "year"],
      zhKeys: ["时间", "今天", "明天", "昨天", "早上", "晚上", "季节"],
    },
    {
      id: "society",
      label: "SOCIETY",
      zh: "人物与社会",
      hue: 262,
      en: wordSet("actor actress ad accident advantage society social law lawyer government economy economic money job work business city country nation police war peace duty public community citizen president king queen market price bank company office trade factory village town capital culture cultural rule policy election vote tax poor rich success successful fail failure problem chance opportunity"),
      stems: ["advantage", "societ", "govern", "econom", "business", "company", "citizen", "president", "culture", "success", "opportunit"],
      zhKeys: ["社会", "政府", "经济", "公司", "优势", "工作", "城市", "国家"],
    },
  ];

  var OTHER = { id: "other", label: "GENERAL", zh: "通用事物与概念", hue: 222, en: Object.create(null), stems: [], zhKeys: [] };
  THEMES.push(
    { id: "action", label: "ACTION", zh: "动作与变化", hue: 172, en: wordSet("action activity accept achieve add allow appear apply arrange avoid become begin break build call carry change choose collect compare complete consider continue create cut decide develop discover do draw explain find finish follow get give happen help hold improve include increase introduce join keep know leave let look make mean move need offer open organize own pay pick prepare prevent produce provide put reach receive reduce remember remove require return save seem send serve set show solve start stay stop support take teach tell think try turn understand use wait want watch win"), stems: [], zhKeys: [] },
    { id: "description", label: "QUALITY", zh: "性质与程度", hue: 65, en: wordSet("able available basic beautiful big common different difficult easy enough excellent famous fast fine free full general good great hard heavy high important large little long low main many more most much necessary new nice normal only other possible real right same short simple small special strong such sure true useful usual very whole wide wrong"), stems: [], zhKeys: [] },
    { id: "function", label: "FUNCTION", zh: "语法与连接", hue: 28, en: wordSet("actually a an the and or but if unless although though because since while whether than that which who whom whose what whatever whoever when where why how as at by for from in into of on onto out over through to under until up upon with without be am is are was were been being can could may might must shall should will would ought i me my mine myself you your yours yourself he him his himself she her hers herself it its itself we us our ours ourselves they them their theirs themselves this these those both each either neither any anybody anyone anything everybody everyone everything nobody none nothing some somebody someone something all another else so nor yet"), stems: [], zhKeys: [] }
  );
  var THEME_ORDER = ["life", "technology", "school", "nature", "feeling", "travel", "time", "society", "action", "description", "function", "other"];
  /* Co-lemmas that are only function words stay in the detail list.
   * They are real related[] entries, but each one would otherwise become
   * its own orbit and spend the node cap. */
  var STOP_NEIGHBOR = wordSet("a an the of to in on for with by at from as and or over up out off into about than");
  var SHOWCASE = {
    life: ["life", "live", "alive", "childhood", "death", "family", "health", "grow"],
    technology: ["technology", "computer", "internet", "phone", "software", "digital", "robot", "camera"],
  };

  function themeById(id) {
    if (id === "other") return OTHER;
    for (var i = 0; i < THEMES.length; i++) if (THEMES[i].id === id) return THEMES[i];
    return OTHER;
  }

  function norm(s) {
    if (Progress) return Progress.norm(s);
    var related = root.QuizMarioRelated;
    if (related && typeof related.norm === "function") return related.norm(s);
    return String(s == null ? "" : s).trim().toLowerCase().replace(/[’‘]/g, "'").replace(/\s+/g, " ");
  }

  function isPhrase(text) {
    var s = String(text || "");
    return /\s/.test(s) || s.indexOf("...") !== -1 || s.indexOf("…") !== -1;
  }

  function stemHit(lemma, stems) {
    for (var i = 0; i < stems.length; i++) {
      var stem = stems[i];
      if (!stem || stem.length < 4) continue;
      if (lemma === stem || lemma.indexOf(stem) === 0) return true;
      if (stem.length >= 5 && lemma.indexOf(stem) !== -1) return true;
    }
    return false;
  }

  function glossHit(gloss, keys) {
    var parts = String(gloss || "").split(/[；;，,、/|]+/);
    var keySet = Object.create(null);
    for (var k = 0; k < keys.length; k++) keySet[keys[k]] = true;
    for (var i = 0; i < parts.length; i++) {
      var part = parts[i].replace(/\s+/g, "");
      if (part && keySet[part]) return true;
    }
    return false;
  }

  function themeOf(word, gloss, pos) {
    var lemma = String(word || "").trim().toLowerCase();
    var meaning = String(gloss || "");
    if ((word === "May" && /五月/.test(meaning)) || (word === "March" && /三月/.test(meaning))) return themeById("time");
    if ((word === "Miss" && /小姐/.test(meaning)) || word === "WHO" || word === "China") return themeById("society");
    if (word === "china" && /瓷/.test(meaning)) return themeById("life");
    if (lemma === "bank" && /河岸|岸边/.test(meaning)) return themeById("nature");
    if (lemma === "plant" && /工厂/.test(meaning)) return themeById("society");
    if (lemma === "spring" && /弹簧/.test(meaning)) return themeById("technology");
    if (lemma === "watch" && /手表/.test(meaning)) return themeById("time");
    // Exact headword matches precede every stem/gloss match. POS is a safe
    // fallback for general verbs, descriptions and grammatical function words.
    for (var i = 0; i < THEMES.length; i++) if (THEMES[i].en[lemma]) return THEMES[i];
    var semantic = [
      ["technology", /计算机|电脑|互联网|软件|数码|电子|机器人|科技|技术|程序|设备|屏幕|电池|电力|发明|实验|科学|物理|化学/],
      ["school", /学校|学生|老师|教师|课堂|课文|课程|学习|教育|考试|作业|图书馆|语法|词汇|字母|阅读|读书|拼写|翻译|大学|知识|交流|语言/],
      ["nature", /动物|植物|森林|树木|花朵|环境|污染|气候|天气|地球|海洋|河流|山脉|火山|自然|昆虫|鸟类|哺乳|生态/],
      ["life", /生活|生命|家庭|家人|亲属|父亲|母亲|孩子|儿童|婴儿|身体|健康|疾病|医院|医生|护士|药物|食物|食用|早餐|午餐|晚餐|烹饪|厨房|衣服|衣物|家具|睡眠|运动|体育/],
      ["feeling", /感情|情感|情绪|高兴|快乐|幸福|悲伤|伤心|愤怒|生气|害怕|担心|焦虑|紧张|兴奋|惊讶|孤独|自豪|感到|期待|盼望|态度/],
      ["travel", /旅行|旅游|交通|车辆|乘车|火车|飞机|航班|机场|车站|地铁|驾驶|自行车|公交|公共汽车|道路|街道|旅馆|酒店|方向|位置|空间/],
      ["time", /时间|时刻|小时|分钟|星期|月份|季节|今天|明天|昨天|早晨|上午|下午|晚上|年代|世纪|数量|数字|数目/],
      ["society", /社会|政府|国家|城市|社区|公民|法律|政治|经济|金钱|货币|价格|银行|公司|商业|职业|工作|文化|艺术|历史|人类|人民|民族|战争|和平|权利|责任/]
    ];
    for (var g = 0; g < semantic.length; g++) if (semantic[g][1].test(String(gloss || ""))) return themeById(semantic[g][0]);
    for (var t = 0; t < THEMES.length - 3; t++) if (stemHit(lemma, THEMES[t].stems)) return THEMES[t];
    if (/\b(afraid|angry|anxious|amazed|ashamed|crazy|eager|excited|fond|glad|happy|interested|nervous|pleased|proud|satisfied|sorry|surprised|worried)\b/.test(lemma)) return themeById("feeling");
    if (/\b(allergic|ill|sick|healthy)\b/.test(lemma)) return themeById("life");
    if (/\b(late|early)\b/.test(lemma)) return themeById("time");
    var tag = String(pos || "").toLowerCase();
    if (/^(prep|conj|pron|det|art|modal|aux)/.test(tag)) return themeById("function");
    if (/^(v\.|verb|phrasal|verb_phrase)/.test(tag)) return themeById("action");
    if (/^(adj|adv)/.test(tag)) return themeById("description");
    if (/^[a-z]+\s/.test(lemma) && /^(be|take|make|get|have|give|put|keep|come|go|look|turn|set)\b/.test(lemma)) return themeById("action");
    return OTHER;
  }

  function hslToHex(h, s, l) {
    var hue = ((h % 360) + 360) % 360;
    var sat = Math.max(0, Math.min(100, s)) / 100;
    var lig = Math.max(0, Math.min(100, l)) / 100;
    var c = (1 - Math.abs(2 * lig - 1)) * sat;
    var hp = hue / 60;
    var x = c * (1 - Math.abs((hp % 2) - 1));
    var r = 0;
    var g = 0;
    var b = 0;
    if (hp < 1) { r = c; g = x; }
    else if (hp < 2) { r = x; g = c; }
    else if (hp < 3) { g = c; b = x; }
    else if (hp < 4) { g = x; b = c; }
    else if (hp < 5) { r = x; b = c; }
    else { r = c; b = x; }
    var m = lig - c / 2;
    function hex(v) {
      var n = Math.round((v + m) * 255);
      if (n < 0) n = 0;
      if (n > 255) n = 255;
      var t = n.toString(16);
      return t.length < 2 ? "0" + t : t;
    }
    return "#" + hex(r) + hex(g) + hex(b);
  }

  /** Scored mastery 0 is darkest. Unscored stays mid gray and is not a 0. */
  function visualOf(theme, mastery, scored) {
    var hue = theme && theme.hue != null ? theme.hue : OTHER.hue;
    if (!scored) {
      return { hue: hue, sat: 14, light: 54, hex: hslToHex(hue, 14, 54), unscored: true };
    }
    var m = Number(mastery);
    if (!isFinite(m)) m = 0;
    if (m < 0) m = 0;
    if (m > 3) m = 3;
    var light = 28 + (m / 3) * 44;
    return { hue: hue, sat: 72, light: light, hex: hslToHex(hue, 72, light), unscored: false };
  }

  function allTracks() {
    var out = (root.VOCAB_EXAM_TRACKS || []).slice();
    var others = root.VOCAB_TRACKS || [];
    for (var i = 0; i < others.length; i++) {
      if (out.some(function (t) { return t.id === others[i].id; })) continue;
      var track = others[i];
      out.push(track.id === "core" ? Object.assign({}, track, { sets: root.VOCAB_LEVELS || [] }) : track);
    }
    return out;
  }
  function findTrack(tracks, trackId) {
    var list = tracks || [];
    for (var i = 0; i < list.length; i++) if (list[i] && list[i].id === trackId) return list[i];
    return list[0] || null;
  }
  function flatten(track, setIndex, eligible) {
    var lemmas = [], byNorm = Object.create(null), seen = Object.create(null), levels = Object.create(null);
    var sets = track && track.sets || [];
    for (var s = 0; s < sets.length; s++) {
      for (var i = 0; i < (sets[s] || []).length; i++) {
        var card = sets[s][i];
        if (!card || typeof card.word !== "string") continue;
        var key = norm(card.word);
        if (!key) continue;
        if (!byNorm[key]) byNorm[key] = card;
        if (setIndex != null && s !== setIndex) continue;
        if (eligible && eligible.indexOf(s + 1) < 0) continue;
        if (seen[key]) continue;
        seen[key] = true; levels[key] = s; lemmas.push(card);
      }
    }
    return { lemmas: lemmas, byNorm: byNorm, levels: levels };
  }

  function phraseCountOf(card, byNorm) {
    var related = root.QuizMarioRelated;
    if (!related || typeof related.lemmas !== "function") return 0;
    var items = related.lemmas(card);
    var n = 0;
    for (var i = 0; i < items.length; i++) {
      if (!isPhrase(items[i])) continue;
      var hit = byNorm[related.norm(items[i])];
      if (hit && String(hit.meaning_zh || "").trim()) n++;
    }
    return n;
  }

  function phrasesFor(card, byNorm, index) {
    var related = root.QuizMarioRelated;
    if (!related || typeof related.lemmas !== "function") return [];
    var primaryNorm = "";
    if (index && typeof related.primaryCollocation === "function") {
      var primary = null;
      try { primary = related.primaryCollocation(card, index); } catch (e) { primary = null; }
      if (primary && primary.lemma) primaryNorm = related.norm(primary.lemma);
    }
    var items = related.lemmas(card);
    var out = [];
    var seen = Object.create(null);
    for (var i = 0; i < items.length; i++) {
      if (!isPhrase(items[i])) continue;
      var key = related.norm(items[i]);
      var hit = byNorm[key];
      if (!hit) continue;
      var gloss = String(hit.meaning_zh || "").trim();
      if (!gloss || seen[key]) continue;
      seen[key] = true;
      out.push({
        word: String(hit.word || items[i]),
        key: key,
        gloss: gloss,
        ipa: hit.ipa || "",
        primary: key === primaryNorm && !!primaryNorm,
      });
    }
    out.sort(function (a, b) {
      if (a.primary !== b.primary) return a.primary ? -1 : 1;
      return a.word < b.word ? -1 : a.word > b.word ? 1 : 0;
    });
    if (out.length > PHRASE_CAP) out = out.slice(0, PHRASE_CAP);
    return out;
  }

  function coLemmasOf(card, phrases, byNorm) {
    var related = root.QuizMarioRelated;
    if (!related || typeof related.lemmas !== "function") return [];
    var self = related.norm(card.word);
    var out = [];
    var seen = Object.create(null);
    function add(text) {
      if (isPhrase(text)) return;
      var key = related.norm(text);
      if (!key || key === self || seen[key]) return;
      var hit = byNorm[key];
      if (!hit || isPhrase(hit.word)) return;
      seen[key] = true;
      out.push(hit.word);
    }
    var own = related.lemmas(card);
    for (var i = 0; i < own.length; i++) add(own[i]);
    for (var p = 0; p < phrases.length; p++) {
      var phraseCard = byNorm[phrases[p].key];
      if (!phraseCard) continue;
      var rels = related.lemmas(phraseCard);
      for (var j = 0; j < rels.length; j++) add(rels[j]);
    }
    return out;
  }

  function compareWeak(a, b) {
    if (a.weak !== b.weak) return a.weak ? -1 : 1;
    if (a.scored !== b.scored) return a.scored ? -1 : 1;
    if (a.scored && b.scored && a.mastery !== b.mastery) return a.mastery - b.mastery;
    return a.word < b.word ? -1 : a.word > b.word ? 1 : 0;
  }

  /* Set cap: weak, then never-practiced, then lower mastery. Whole-track
   * selection still uses compareWeak (scored before unscored). */
  function compareSetFocus(a, b) {
    if (a.weak !== b.weak) return a.weak ? -1 : 1;
    if (a.scored !== b.scored) return a.scored ? 1 : -1;
    if (a.scored && b.scored && a.mastery !== b.mastery) return a.mastery - b.mastery;
    return a.word < b.word ? -1 : a.word > b.word ? 1 : 0;
  }

  function parseScope(search) {
    var out = { trackId: "", set: null };
    var text = String(search || "");
    var q = text.indexOf("?");
    if (q >= 0) text = text.slice(q + 1);
    if (!text) return out;
    var parts = text.split("&");
    for (var i = 0; i < parts.length; i++) {
      if (!parts[i]) continue;
      var cut = parts[i].indexOf("=");
      var rawKey = cut >= 0 ? parts[i].slice(0, cut) : parts[i];
      var rawVal = cut >= 0 ? parts[i].slice(cut + 1) : "";
      var key = "";
      var val = "";
      try {
        key = decodeURIComponent(rawKey.replace(/\+/g, " "));
        val = decodeURIComponent(rawVal.replace(/\+/g, " "));
      } catch (e) {
        continue;
      }
      if (key === "track" && /^(core|ket|pet|cet4|zhongkao|gaokao)$/.test(val)) out.trackId = val;
      if (key === "set" && val !== "" && isFinite(Number(val))) {
        var n = Math.floor(Number(val));
        if (n >= 1) out.set = n;
      }
    }
    return out;
  }

  /** 1-based set number, matching 第N组 / currentLevel. */
  function resolveSet(track, set) {
    if (set == null || set === "") return null;
    var n = Number(set);
    if (!isFinite(n)) return null;
    var num = Math.floor(n);
    if (num < 1) return null;
    var count = track && track.sets ? track.sets.length : 0;
    return { number: num, index: num - 1, missing: num > count };
  }

  function orbitPoint(i, n, radius) {
    if (n <= 1) return { x: radius * 0.85, y: 0.35, z: 0.2 };
    var y = 1 - (i / (n - 1)) * 2;
    var ring = Math.sqrt(Math.max(0, 1 - y * y));
    var theta = Math.PI * (3 - Math.sqrt(5)) * i;
    return {
      x: Math.cos(theta) * ring * radius,
      y: y * radius * 0.82,
      z: Math.sin(theta) * ring * radius,
    };
  }

  function placeThemes(ids) {
    var n = ids.length;
    var out = [];
    if (!n) return out;
    if (n === 1) {
      out.push({ id: ids[0], x: 0, y: 0, z: 0 });
      return out;
    }
    var rx = n === 2 ? 14 : 11 + n;
    var rz = n === 2 ? 0.4 : 7 + n * 0.45;
    for (var i = 0; i < n; i++) {
      var ang = Math.PI + (i / n) * Math.PI * 2;
      out.push({
        id: ids[i],
        x: Math.cos(ang) * rx,
        y: i % 2 === 0 ? 0.4 : -0.6,
        z: Math.sin(ang) * rz,
      });
    }
    return out;
  }

  function buildGraph(opt) {
    opt = opt || {};
    var track = findTrack(opt.tracks || allTracks(), opt.trackId), save = opt.save || {};
    var empty = { trackId: "", trackName: "", legend: LEGEND, unscoredNote: UNSCORED_NOTE, themes: [], lemmas: [], spokes: [],
      stats: { bankLemmas: 0, touched: 0, shown: 0, cap: 0, page: 0, pages: 1, completedSets: 0 }, masteryOk: !!Progress };
    if (!track || !Progress) return empty;
    var spec = resolveSet(track, opt.set), completed = Progress.completedSets(save, track.id);
    var pool = flatten(track, spec ? (spec.missing ? -1 : spec.index) : null, !spec && completed.length ? completed : null);
    var bank = flatten(track, null), related = root.QuizMarioRelated;
    var index = related && related.indexTrack ? related.indexTrack(track.sets || []) : null;
    var stateIndex = Progress.createIndex(save, track.id);
    var rows = [];
    for (var i = 0; i < pool.lemmas.length; i++) {
      var card = pool.lemmas[i], key = norm(card.word), level = spec ? spec.index : null;
      var evidence = Progress.effectiveState(save, track.id, card, level, index, related, stateIndex);
      if (!spec && !completed.length && evidence.score == null) continue;
      var theme = themeOf(card.word, card.meaning_zh, card.pos);
      var phrases = phrasesFor(card, bank.byNorm, index);
      for (var p = 0; p < phrases.length; p++) {
        var phraseState = Progress.itemState(save, track.id, phrases[p].word, null, stateIndex);
        phrases[p].mastery = phraseState.score; phrases[p].scored = phraseState.score != null;
        phrases[p].visual = visualOf(theme, phraseState.score, phraseState.score != null);
      }
      rows.push({ key: key, word: card.word, gloss: card.meaning_zh || "", ipa: card.ipa || "", pos: card.pos || "",
        themeId: theme.id, category: theme.zh, levelIdx: pool.levels[key], mastery: evidence.score, scored: evidence.score != null,
        weak: evidence.score != null && evidence.score < 2 || evidence.collocationPending, evidence: evidence,
        visual: visualOf(theme, evidence.score, evidence.score != null), phrases: phrases,
        coLemmas: coLemmasOf(card, phrases, bank.byNorm) });
    }
    rows.sort(compareSetFocus);
    // A unit is complete and exact: never truncate it or add outside seed words.
    // All-unit view is paged, so every registered item remains reachable.
    var cap = spec && !opt.pageSize ? Math.max(1, rows.length) : Math.max(1, Number(opt.pageSize) || Number(opt.cap) || 52);
    var pages = Math.max(1, Math.ceil(rows.length / cap));
    var page = Math.max(0, Math.min(pages - 1, Math.floor(Number(opt.page) || 0)));
    var selected = rows.slice(page * cap, (page + 1) * cap), groups = Object.create(null);
    selected.forEach(function (row) { (groups[row.themeId] || (groups[row.themeId] = [])).push(row); });
    var ids = THEME_ORDER.filter(function (id) { return groups[id] && groups[id].length; });
    var themes = placeThemes(ids).map(function (point) {
      var meta = themeById(point.id);
      return Object.assign({}, point, { label: meta.label, zh: meta.zh, hue: meta.hue, count: groups[point.id].length });
    });
    var lemmas = [], spokes = [];
    themes.forEach(function (theme) {
      var members = groups[theme.id];
      members.sort(function (a, b) { return a.key.localeCompare(b.key); });
      members.forEach(function (row, index) {
        var local = orbitPoint(index, members.length, 4.6 + Math.min(3.6, members.length * 0.12));
        lemmas.push(Object.assign({}, row, { id: "lemma:" + row.key, local: local,
          x: theme.x + local.x, y: theme.y + local.y, z: theme.z + local.z }));
        spokes.push({ from: "theme:" + theme.id, to: "lemma:" + row.key });
      });
    });
    return { trackId: track.id, trackName: track.name || track.id, legend: LEGEND, unscoredNote: UNSCORED_NOTE,
      scopeLabel: spec ? "本组学情 · Set " + spec.number : "我的单词宇宙", setNumber: spec ? spec.number : null,
      themes: themes, lemmas: lemmas, spokes: spokes, masteryOk: true, completedSets: completed,
      stats: { bankLemmas: rows.length, touched: rows.filter(function (r) { return r.scored; }).length,
        shown: lemmas.length, cap: cap, page: page, pages: pages, completedSets: completed.length } };
  }

  // The classic 3D presentation has three orbit hubs and one Connected Papers
  // grey-teal hue. Detailed semantic categories and learner evidence are retained.
  var CLASSIC_HUE = 184;
  function classicVisual(mastery, scored) {
    var light = scored ? 29 + Math.max(0, Math.min(3, Number(mastery) || 0)) / 3 * 47 : 55;
    return { hue: CLASSIC_HUE, sat: 22, light: light,
      hex: hslToHex(CLASSIC_HUE, 22, light), unscored: !scored };
  }
  function classic3DGraph(base, narrow) {
    var definitions = [
      {id:"life",label:"LIFE",zh:"生活",members:["life","nature","feeling","travel","time","society"]},
      {id:"technology",label:"TECHNOLOGY",zh:"科技",members:["technology","school"]},
      {id:"other",label:"OTHER",zh:"其他",members:["action","description","function","other"]}
    ];
    var centers = narrow ? [{x:-1,y:11,z:1},{x:2,y:0,z:-2},{x:-1,y:-11,z:1}] : placeThemes(["life","technology","other"]);
    var themes = definitions.map(function (d, i) { return Object.assign({}, centers[i], {
      id:d.id,label:d.label,zh:d.zh,hue:CLASSIC_HUE,count:0 }); });
    var grouped = {life:[],technology:[],other:[]};
    base.lemmas.forEach(function (row) {
      var def = definitions.find(function (d) { return d.members.indexOf(row.themeId) >= 0; }) || definitions[2];
      grouped[def.id].push(row);
    });
    var lemmas = [], spokes = [];
    themes.forEach(function (theme) {
      var members = grouped[theme.id]; theme.count = members.length;
      members.forEach(function (row, i) {
        var local = orbitPoint(i,members.length,4.6+Math.min(narrow?2.4:3.6,members.length*.12));
        var phrases = row.phrases.map(function (p) { return Object.assign({},p,{visual:classicVisual(p.mastery,p.scored)}); });
        lemmas.push(Object.assign({},row,{detailThemeId:row.themeId,themeId:theme.id,orbitCategory:theme.zh,
          visual:classicVisual(row.mastery,row.scored),phrases:phrases,local:local,
          x:theme.x+local.x,y:theme.y+local.y,z:theme.z+local.z}));
        spokes.push({from:"theme:"+theme.id,to:"lemma:"+row.key});
      });
    });
    return Object.assign({},base,{themes:themes,lemmas:lemmas,spokes:spokes,
      legend:"同一灰青色系 · 颜色越深，越需要巩固",classic3d:true});
  }

  function readLocal() {
    var save = { cards: {} };
    try {
      var raw = root.localStorage && root.localStorage.getItem(SAVE_KEY);
      if (raw) save = JSON.parse(raw);
    } catch (e) {}
    if (!save || typeof save !== "object") save = { cards: {} };
    var events = [];
    var learnerId = "";
    try {
      var evRaw = root.localStorage && root.localStorage.getItem(EVENT_KEY);
      var store = evRaw ? JSON.parse(evRaw) : null;
      if (store && Array.isArray(store.events)) events = store.events;
      if (store && store.learner_id) learnerId = String(store.learner_id);
    } catch (e2) {}
    var trackId = save.track || "zhongkao";
    return { save: save, events: events, learnerId: learnerId, trackId: trackId };
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function masteryText(node) {
    if (!node || !node.scored) return "待验证 · 尚无证据，不记成 0 分";
    var label = node.mastery === 3 ? "熟练" : "待巩固";
    if (node.evidence && node.evidence.collocationPending) label = "搭配待验证";
    return label + " · 综合熟练度 " + (Math.round(Number(node.mastery) * 10) / 10) + "/3";
  }
  function evidenceHtml(node) {
    var e = node && node.evidence;
    if (!e) return "";
    var label = function (v) { return v == null ? "待验证" : v + "/3"; };
    return "<p class=\"uni-meta\">认词 " + label(e.recognition) + " · 拼写 " + label(e.spelling) + " · 多义 " + label(e.polysemy) +
      (e.requiredCollocations ? " · 搭配 " + label(e.collocation) + (e.collocationPending ? "（含未验证）" : "") : "") + "</p>";
  }

  function wordDetailHtml(graph, rec, phraseWord) {
      var weakNote = rec.weak ? "<p class=\"uni-meta\">综合证据尚未达到熟练；请查看认词、搭配、拼写和多义的具体记录。</p>" : "";
      var phraseHtml = "";
      if (!rec.phrases.length) {
        phraseHtml = "<p class=\"uni-meta\">当前词库的 related[] 里没有能对上的固定搭配。</p>";
      } else {
        phraseHtml = "<p class=\"uni-kicker\">固定搭配</p><ul class=\"uni-phrases\">";
        for (var i = 0; i < rec.phrases.length; i++) {
          var p = rec.phrases[i];
          var mark = p.primary ? " · 主搭配" : "";
          if (graph.setNumber && !graph.lemmas.some(function (n) { return n.key === norm(p.word); })) mark += " · 本组外关联";
          var on = phraseWord && norm(phraseWord) === p.key ? " is-on" : "";
          phraseHtml += "<li><button type=\"button\" data-phrase=\"" + esc(p.word) + "\" class=\"uni-phrase" + on + "\">" +
            esc(p.word) + "</button><span>" + esc(p.gloss) + " · " + esc(masteryText(p)) + esc(mark) + "</span></li>";
        }
        phraseHtml += "</ul>";
      }
      var linkHtml = "";
      if (rec.coLemmas && rec.coLemmas.length) {
        linkHtml = "<p class=\"uni-kicker\">词与词（词库里已有）</p><p class=\"uni-links\">";
        for (var c = 0; c < rec.coLemmas.length; c++) {
          var surface = rec.coLemmas[c];
          var inGraph = false;
          for (var r = 0; r < graph.lemmas.length; r++) {
            if (graph.lemmas[r].key === norm(surface)) inGraph = true;
          }
          if (c) linkHtml += " · ";
          if (inGraph) linkHtml += "<button type=\"button\" data-focus-word=\"" + esc(surface) + "\">" + esc(surface) + "</button>";
          else linkHtml += "<span>" + esc(surface) + "</span>";
        }
        linkHtml += "</p>";
      }
      var shownPhrase = null;
      if (phraseWord) {
        for (var q = 0; q < rec.phrases.length; q++) {
          if (norm(rec.phrases[q].word) === norm(phraseWord)) shownPhrase = rec.phrases[q];
        }
      }
      var title = shownPhrase ? shownPhrase.word : rec.word;
      var gloss = shownPhrase ? shownPhrase.gloss : rec.gloss;
      var ipa = shownPhrase ? shownPhrase.ipa : rec.ipa;
      var scoreLine = shownPhrase ? masteryText(shownPhrase) : masteryText(rec);
      return
        "<button type=\"button\" class=\"uni-clear\" data-clear-focus>返回全景</button>" +
        "<h2>" + esc(title) + "</h2>" +
        (ipa ? "<p class=\"uni-ipa\">" + esc(ipa) + "</p>" : "") +
        "<p class=\"uni-gloss\">" + esc(gloss || "—") + "</p>" +
        "<p class=\"uni-score\">" + esc(scoreLine) + "</p>" +
        "<p class=\"uni-meta\">大类：" + esc(rec.orbitCategory ? rec.orbitCategory + " · " + rec.category : rec.category || themeById(rec.themeId).zh) + "</p>" + evidenceHtml(shownPhrase || rec) +
        weakNote + phraseHtml + linkHtml;
  }

  function watchProgress(refresh) {
    var last = "";
    function check(force) {
      var signature = "";
      try { signature = (root.localStorage.getItem(SAVE_KEY) || "") + "|" + (root.localStorage.getItem(EVENT_KEY) || ""); } catch (_) {}
      if (force || signature !== last) { last = signature; refresh(); }
    }
    root.addEventListener("storage", function (ev) { if (!ev.key || ev.key === SAVE_KEY || ev.key === EVENT_KEY) check(false); });
    root.addEventListener("quizmario:progress", function () { check(false); });
    root.addEventListener("focus", function () { check(false); });
    root.addEventListener("pageshow", function () { check(false); });
    root.document.addEventListener("visibilitychange", function () { if (root.document.visibilityState !== "hidden") check(false); });
    // Covers same-document storage writes that do not emit a storage event.
    var timer = root.setInterval ? root.setInterval(function () { if (root.document.visibilityState !== "hidden") check(false); }, 1000) : null;
    root.addEventListener("pagehide", function (ev) { if (!ev.persisted && timer != null) root.clearInterval(timer); });
    check(false);
  }
  function paintControls(graph) {
    var doc = root.document, select = doc.getElementById("universe-set"), trackSelect = doc.getElementById("universe-track");
    try {
      if (root.history && root.location.href) {
        var url = new URL(root.location.href);
        url.searchParams.set("track", graph.trackId);
        if (graph.setNumber) url.searchParams.set("set", graph.setNumber); else url.searchParams.delete("set");
        root.history.replaceState(null, "", url.pathname + url.search);
      }
    } catch (_) {}
    if (doc.querySelectorAll) {
      var switches = doc.querySelectorAll("[data-universe-track]");
      for (var b = 0; b < switches.length; b++) switches[b].setAttribute("aria-pressed", switches[b].getAttribute("data-universe-track") === graph.trackId ? "true" : "false");
    }
    if (select) {
      var options = '<option value="">全部词条（已完成单元 ' + (graph.completedSets || []).length + '）</option>';
      var sets = (graph.completedSets || []).slice();
      if (graph.setNumber && sets.indexOf(graph.setNumber) < 0) sets.push(graph.setNumber);
      sets.sort(function (a, b) { return a - b; });
      for (var i = 0; i < sets.length; i++) options += '<option value="' + sets[i] + '">第 ' + sets[i] + ' 单元</option>';
      select.innerHTML = options; select.value = graph.setNumber || "";
    }
    if (trackSelect) {
      trackSelect.innerHTML = allTracks().map(function (t) { return '<option value="' + esc(t.id) + '">' + esc(t.name || t.id) + '</option>'; }).join("");
      trackSelect.value = graph.trackId;
    }
    var threeLink = doc.getElementById("universe-3d");
    if (threeLink) threeLink.href = "?track=" + encodeURIComponent(graph.trackId) + (graph.setNumber ? "&set=" + graph.setNumber : "") + "&view=3d";
    var prev = doc.getElementById("universe-prev"), next = doc.getElementById("universe-next"), page = doc.getElementById("universe-page");
    if (prev) { prev.disabled = graph.stats.page === 0; prev.hidden = graph.stats.pages <= 1; }
    if (next) { next.disabled = graph.stats.page + 1 >= graph.stats.pages; next.hidden = graph.stats.pages <= 1; }
    if (page) page.textContent = graph.stats.pages > 1 ? ((graph.stats.page + 1) + "/" + graph.stats.pages) : "";
  }
  function navigateScope(track, set, list) {
    try { root.localStorage.setItem("quizmario_universe_view", list ? "list" : "3d"); } catch (_) {}
    var url = new URL(root.location.href);
    url.searchParams.set("track", track);
    if (set) url.searchParams.set("set", set); else url.searchParams.delete("set");
    if (list) url.searchParams.set("view", "list"); else url.searchParams.set("view", "graph");
    root.location.assign(url.pathname + url.search);
  }
  function bindControls(state, refresh, listMode) {
    var doc = root.document;
    var set = doc.getElementById("universe-set"), track = doc.getElementById("universe-track");
    if (set) set.addEventListener("change", function () { state.setNumber = Number(set.value) || null; state.page = 0; refresh(); });
    if (track) track.addEventListener("change", function () { state.trackId = track.value; state.setNumber = null; state.page = 0; refresh(); });
    var prev = doc.getElementById("universe-prev"), next = doc.getElementById("universe-next");
    if (prev) prev.addEventListener("click", function () { state.page = Math.max(0, state.page - 1); refresh(); });
    if (next) next.addEventListener("click", function () { state.page++; refresh(); });
    var view = doc.getElementById("universe-view");
    if (view) { view.textContent = listMode ? "关系图谱" : "分类词表"; view.addEventListener("click", function () { navigateScope(state.trackId, state.setNumber, !listMode); }); }
  }
  function graphStatus(g) {
    return (g.scopeLabel || "") + " · " + g.trackName + " · 本页 " + g.stats.shown + "/" + g.stats.bankLemmas +
      " 个词条 · " + g.themes.length + " 个大类 · 已完成 " + g.stats.completedSets + " 个单元 · 随作答记录自动更新";
  }
  function listStatus(row) {
    if (!row.scored) return { id: "unseen", label: "未验证" };
    if (row.evidence && row.evidence.collocationPending) return { id: "collocation", label: "搭配待验证" };
    return row.mastery === 3 ? { id: "mastered", label: "熟练" } : { id: "learning", label: "待巩固" };
  }
  function listMarkup(graph) {
    var counts = { mastered: 0, learning: 0, collocation: 0, unseen: 0 };
    graph.lemmas.forEach(function (row) { counts[listStatus(row).id]++; });
    var scope = graph.setNumber ? "第 " + graph.setNumber + " 单元" : "我的词汇集";
    var html = '<section class="collection-overview" aria-label="本页学情概览"><div class="collection-copy"><span class="collection-kicker">' + esc(scope) + '</span><h2>每一次练习，都有迹可循。</h2><p>' + graph.stats.shown + ' 个词条 · ' + graph.themes.length + ' 个大类' + (graph.stats.pages > 1 ? ' · 第 ' + (graph.stats.page + 1) + ' 页' : '') + '</p></div><div class="collection-orbit" aria-hidden="true"><i></i><i></i><i></i><span>词</span></div>';
    html += '<div class="collection-counts">';
    [{id:"mastered",label:"已熟练"},{id:"learning",label:"待巩固"},{id:"collocation",label:"搭配待验证"},{id:"unseen",label:"未验证"}].forEach(function (item) {
      html += '<div class="count-' + item.id + '"><b>' + counts[item.id] + '</b><span><i></i>' + item.label + '</span></div>';
    });
    html += '</div><p class="collection-note">搭配未熟练，单词不计熟练；灰色词条还需要练习验证。</p></section>';
    if (!graph.lemmas.length) return html + '<div class="universe-empty"><h2>你的词汇，正在这里生长。</h2><p>完成一个单元后，该单元全部词条会自动加入，并随练习更新掌握状态。</p><a href="index.html">去学习 →</a></div>';
    html += '<nav class="category-nav" aria-label="词汇分类">';
    graph.themes.forEach(function (theme) { html += '<button type="button" data-category-jump="' + esc(theme.id) + '">' + esc(theme.zh) + '<span>' + theme.count + '</span></button>'; });
    html += '</nav><div class="collection-list-title"><h2>分类词表</h2><span>点开词条，查看学习记录</span></div>';
    for (var t = 0; t < graph.themes.length; t++) {
      var theme = graph.themes[t], rows = graph.lemmas.filter(function (n) { return n.themeId === theme.id; });
      html += '<section class="universe-category" id="category-' + esc(theme.id) + '"><h2><i style="--category-hue:' + theme.hue + '"></i>' + esc(theme.zh) + '<span>' + rows.length + ' 词</span></h2><ul>';
      rows.forEach(function (row) {
        var status = listStatus(row);
        html += '<li><details class="word-record" data-word-key="' + esc(row.key) + '"><summary><span class="word-copy"><b>' + esc(row.word) + '</b><span class="universe-gloss">' + esc(row.gloss) + '</span></span><span class="word-state state-' + status.id + '"><i style="background:' + row.visual.hex + '"></i>' + status.label + '</span><span class="word-chevron" aria-hidden="true">›</span></summary><div class="word-evidence">' + (row.ipa ? '<p class="word-ipa">' + esc(row.ipa) + '</p>' : '') + '<p>' + esc(masteryText(row)) + '</p>' + evidenceHtml(row);
        if (row.phrases.length) {
          html += '<h3>关联搭配</h3><ul class="word-phrases">';
          row.phrases.forEach(function (phrase) {
            var outside = graph.setNumber && !graph.lemmas.some(function (n) { return n.key === norm(phrase.word); });
            html += '<li><b>' + esc(phrase.word) + '</b><span>' + esc(phrase.gloss) + '</span><small>' + esc(masteryText(phrase)) + (outside ? ' · 本组外关联' : '') + '</small></li>';
          });
          html += '</ul>';
        }
        html += '</div></details></li>';
      });
      html += '</ul></section>';
    }
    return html + '<p class="collection-end">每个词都有自己的成长节奏</p>';
  }
  function mountList(host, reason) {
    var doc = root.document, opened = parseScope(root.location.search), local = readLocal();
    var state = { trackId: opened.trackId || local.trackId, setNumber: opened.set, page: 0 }, graph;
    host.className = "universe-list-host";
    if (doc.body && doc.body.classList) doc.body.classList.add("is-universe-list");
    function refresh() {
      var local = readLocal();
      var expanded = [];
      if (host.querySelectorAll) Array.prototype.forEach.call(host.querySelectorAll('details[open]'), function (item) { expanded.push(item.getAttribute("data-word-key")); });
      graph = buildGraph({ tracks: allTracks(), trackId: state.trackId, set: state.setNumber, page: state.page, cap: 52, save: local.save, events: local.events });
      state.page = graph.stats.page;
      var title = doc.getElementById("universe-title"), status = doc.getElementById("universe-status");
      if (title) title.textContent = "单词宇宙";
      doc.title = (graph.setNumber ? "第 " + graph.setNumber + " 单元 · " : "") + "单词宇宙 · 聚光单词";
      if (status) status.textContent = graph.trackName + " · " + (graph.setNumber ? "本单元全部 " + graph.stats.bankLemmas + " 个词条" : "已完成 " + graph.stats.completedSets + " 个单元，共 " + graph.stats.bankLemmas + " 个词条");
      host.innerHTML = listMarkup(graph);
      if (host.querySelectorAll && expanded.length) Array.prototype.forEach.call(host.querySelectorAll('details'), function (item) { item.open = expanded.indexOf(item.getAttribute("data-word-key")) >= 0; });
      paintControls(graph);
    }
    bindControls(state, refresh, true);
    if (reason && host.getAttribute("data-layout") !== "network") {
      var view = doc.getElementById("universe-view");
      if (view) { view.textContent = "分类视图"; view.disabled = true; view.title = "当前设备暂不支持 3D，已显示完整分类词表"; }
    }
    host.addEventListener("click", function (ev) {
      var btn = ev.target && ev.target.closest && ev.target.closest("[data-category-jump]");
      if (!btn) return;
      var target = doc.getElementById("category-" + btn.getAttribute("data-category-jump"));
      if (target && target.scrollIntoView) target.scrollIntoView({behavior:"smooth",block:"start"});
    });
    doc.addEventListener("click", function (ev) {
      var btn = ev.target && ev.target.closest && ev.target.closest("[data-universe-track]");
      if (btn) { state.trackId = btn.getAttribute("data-universe-track"); state.setNumber = null; state.page = 0; refresh(); }
    });
    api.currentGraph = function () { return graph; };
    api.focusWord = function () { return false; };
    watchProgress(refresh);
  }

  function mount(host) {
    if (!host || host.getAttribute("data-universe") === "1") return;
    host.setAttribute("data-universe", "1");
    var doc = root.document;
    var statusEl = doc.getElementById("universe-status");
    var detailEl = doc.getElementById("universe-detail");
    var legendEl = doc.getElementById("universe-legend");
    if (legendEl && !legendEl.textContent) {
      legendEl.innerHTML = "<b>" + esc(LEGEND) + "</b><span>" + esc(UNSCORED_NOTE) + "</span>";
    }
    function setStatus(text) {
      if (statusEl) statusEl.textContent = text;
    }
    var opened = parseScope((root.location && root.location.search) || "");
    var trackId = opened.trackId || readLocal().trackId;
    var setNumber = opened.set;
    var titleEl = doc.getElementById("universe-title");
    function paintTitle(label) {
      var text = label || "单词记忆宇宙 · beta";
      if (titleEl) titleEl.textContent = text;
      doc.title = label ? (label + " · 单词记忆宇宙") : "单词记忆宇宙 · beta";
    }
    if (setNumber) paintTitle("本组学情 · Set " + setNumber);
    var scopePrefix = setNumber ? ("本组学情 · Set " + setNumber + " · ") : "";
    var requestedList = /(?:[?&])view=list(?:&|$)/.test((root.location && root.location.search) || "");
    var rememberedList = false;
    try {
      if (requestedList) root.localStorage.setItem("quizmario_universe_view", "list");
      rememberedList = root.localStorage.getItem("quizmario_universe_view") === "list";
    } catch (_) {}
    var explicit3d = /(?:[?&])view=3d(?:&|$)/.test((root.location && root.location.search) || "");
    if (requestedList) { mountList(host, ""); return; }
    if (host.getAttribute("data-layout") === "network" && root.QuizMarioUniverseNetwork && !explicit3d) {
      root.QuizMarioUniverseNetwork.mount(host, { api: api, esc: esc, norm: norm, parseScope: parseScope,
        readLocal: readLocal, buildGraph: buildGraph, allTracks: allTracks, listStatus: listStatus,
        masteryText: masteryText, paintControls: paintControls, bindControls: bindControls, watchProgress: watchProgress });
      return;
    }
    if (rememberedList && !explicit3d) { mountList(host, ""); return; }
    function orbitFallback(reason) {
      if (root.QuizMarioOrbitFallback) {
        root.QuizMarioOrbitFallback.mount(host,{api:api,esc:esc,parseScope:parseScope,readLocal:readLocal,
          allTracks:allTracks,buildGraph:buildGraph,classic3DGraph:classic3DGraph,classicVisual:classicVisual,
          paintControls:paintControls,bindControls:bindControls,watchProgress:watchProgress,
          wordDetailHtml:wordDetailHtml,masteryText:masteryText,graphStatus:graphStatus});
      } else mountList(host,reason);
    }
    if (!root.THREE) {
      orbitFallback("3D 引擎未加载，已切换列表");
      return;
    }
    var canvas = doc.createElement("canvas");
    var gl = null;
    try { gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl"); } catch (e) { gl = null; }
    if (!gl) {
      orbitFallback("设备不支持 WebGL，已切换列表");
      return;
    }

    var THREE = root.THREE;
    var reduce = false;
    try {
      reduce = !!(root.matchMedia && root.matchMedia("(prefers-reduced-motion: reduce)").matches);
    } catch (e2) { reduce = false; }
    var narrow = false;
    try { narrow = !!(root.matchMedia && root.matchMedia("(max-width: 800px)").matches); } catch (e3) { narrow = false; }
    var cap = 52;
    if (doc.body && doc.body.classList) doc.body.classList.add("is-classic-3d");
    if (legendEl) legendEl.innerHTML = '<b>同一灰青色系 · 深色需要巩固</b><span class="classic-depth-ramp" aria-hidden="true"></span><span>半透明为尚未验证；搭配未熟练不计熟练</span>';

    var renderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: !narrow, alpha: false, powerPreference: "high-performance" }); }
    catch (_) { orbitFallback("3D 初始化失败，已切换列表"); return; }
    renderer.setPixelRatio(Math.min(root.devicePixelRatio || 1, narrow ? 1.5 : 2));
    renderer.setClearColor(0x070b16, 1);
    renderer.domElement.id = "universe-canvas";
    renderer.domElement.setAttribute("aria-label", "单词记忆宇宙，可拖动旋转，点单词展开固定搭配");
    host.appendChild(renderer.domElement);

    var scene = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera(48, 1, 0.1, 400);
    scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    var hemi = new THREE.HemisphereLight(0xd6e5e4, 0x263737, 0.55);
    scene.add(hemi);
    var sun = new THREE.DirectionalLight(0xffffff, 0.85);
    sun.position.set(18, 28, 14);
    scene.add(sun);

    var starPositions = new Float32Array(480 * 3);
    for (var si = 0; si < 480; si++) {
      var rr = 50 + Math.random() * 90;
      var th = Math.random() * Math.PI * 2;
      var ph = Math.acos(2 * Math.random() - 1);
      starPositions[si * 3] = rr * Math.sin(ph) * Math.cos(th);
      starPositions[si * 3 + 1] = rr * Math.sin(ph) * Math.sin(th) * 0.7;
      starPositions[si * 3 + 2] = rr * Math.cos(ph);
    }
    var starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute("position", new THREE.BufferAttribute(starPositions, 3));
    scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0x93afb0, size: 0.28, sizeAttenuation: true })));

    var world = new THREE.Group();
    scene.add(world);

    var look = { x: 0, y: 0.4, z: 0 };
    var radius = narrow ? 30 : 36;
    var theta = 0.25;
    var phi = 1.12;
    var goal = { x: 0, y: 0.4, z: 0, radius: radius };
    var defaultRadius = radius;
    var records = [];
    var pickables = [];
    var focused = null;
    var graph = null;
    var scopeState = { trackId: trackId, setNumber: setNumber, page: 0 };
    var dragging = false;
    var moved = false;
    var lastX = 0;
    var lastY = 0;
    var activePointer = null;
    var pinchDist = 0;

    function resize() {
      var w = host.clientWidth || root.innerWidth || 1;
      var h = host.clientHeight || root.innerHeight || 1;
      camera.aspect = w / Math.max(1, h);
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
      renderer.domElement.style.width = "100%";
      renderer.domElement.style.height = "100%";
    }

    function placeCamera() {
      var sin = Math.sin(phi);
      camera.position.set(
        look.x + radius * sin * Math.sin(theta),
        look.y + radius * Math.cos(phi),
        look.z + radius * sin * Math.cos(theta)
      );
      camera.lookAt(look.x, look.y, look.z);
    }

    function disposeObject(obj) {
      obj.traverse(function (node) {
        if (node.geometry && node.geometry.dispose) node.geometry.dispose();
        var mats = node.material ? (Array.isArray(node.material) ? node.material : [node.material]) : [];
        for (var i = 0; i < mats.length; i++) {
          if (mats[i].map && mats[i].map.dispose) mats[i].map.dispose();
          if (mats[i].dispose) mats[i].dispose();
        }
      });
    }

    function labelTexture(text, light) {
      var canvas = doc.createElement("canvas");
      canvas.width = 512;
      canvas.height = 280;
      var g = canvas.getContext("2d");
      g.clearRect(0, 0, 512, 280);
      g.fillStyle = light > 60 ? "#102033" : "#f7fbff";
      g.textAlign = "center";
      g.textBaseline = "middle";
      var raw = String(text || "");
      var words = raw.split(/\s+/);
      var lines = [raw];
      if (words.length > 2) {
        var mid = Math.ceil(words.length / 2);
        lines = [words.slice(0, mid).join(" "), words.slice(mid).join(" ")];
      } else if (raw.length > 16 && words.length === 2) {
        lines = words;
      }
      var size = raw.length > 22 ? 42 : raw.length > 14 ? 52 : 64;
      g.font = "700 " + size + "px system-ui, Segoe UI, sans-serif";
      var start = lines.length === 1 ? 140 : 108;
      g.lineWidth = 10;
      g.strokeStyle = light > 60 ? "rgba(255,255,255,0.8)" : "rgba(0,0,0,0.72)";
      for (var i = 0; i < lines.length; i++) {
        var y = start + i * (size + 8);
        g.strokeText(lines[i], 256, y, 480);
        g.fillText(lines[i], 256, y, 480);
      }
      var tex = new THREE.CanvasTexture(canvas);
      tex.needsUpdate = true;
      return tex;
    }

    function makeOrb(word, visual, radiusOrb, labelScale) {
      var group = new THREE.Group();
      var color = new THREE.Color(visual.hex);
      var mat = new THREE.MeshStandardMaterial({
        color: color,
        emissive: color,
        emissiveIntensity: visual.unscored ? 0.08 : 0.18 + (visual.light / 100) * 0.65,
        roughness: 0.38,
        metalness: 0.12,
        transparent: true,
        opacity: visual.unscored ? 0.62 : 0.94,
      });
      mat.userData.baseOpacity = mat.opacity;
      var geo = new THREE.SphereGeometry(radiusOrb, narrow ? 14 : 22, narrow ? 10 : 16);
      var sphere = new THREE.Mesh(geo, mat);
      group.add(sphere);
      var haloMat = new THREE.MeshBasicMaterial({
        color: color,
        transparent: true,
        opacity: visual.unscored ? 0.05 : 0.14,
        depthWrite: false,
      });
      haloMat.userData.baseOpacity = haloMat.opacity;
      var halo = new THREE.Mesh(new THREE.SphereGeometry(radiusOrb * 1.38, 10, 8), haloMat);
      group.add(halo);
      var spriteMat = new THREE.SpriteMaterial({
        map: labelTexture(word, visual.light),
        transparent: true,
        depthWrite: false,
        depthTest: false,
      });
      spriteMat.userData.baseOpacity = 1;
      var sprite = new THREE.Sprite(spriteMat);
      sprite.renderOrder = 2;
      var aspect = 512 / 280;
      sprite.scale.set(labelScale * aspect, labelScale, 1);
      sprite.position.set(0, 0, 0);
      group.add(sprite);
      return { group: group, sphere: sphere, sprite: sprite, halo: halo, mats: [mat, haloMat, spriteMat] };
    }

    function bindPick(orb, data) {
      orb.sphere.userData = data;
      orb.sprite.userData = data;
      orb.halo.userData = data;
      pickables.push(orb.sphere, orb.sprite, orb.halo);
    }

    function makeRod(from, to, hex) {
      var dir = new THREE.Vector3().subVectors(to, from);
      var len = dir.length();
      if (len < 0.08) return null;
      var geo = new THREE.CylinderGeometry(0.03, 0.03, len, 5, 1, true);
      var mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(hex), transparent: true, opacity: 0.4 });
      mat.userData.baseOpacity = 0.4;
      var mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(from).add(to).multiplyScalar(0.5);
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
      return mesh;
    }

    function applyOpacity(mats, factor) {
      for (var i = 0; i < mats.length; i++) {
        var base = mats[i].userData.baseOpacity == null ? 1 : mats[i].userData.baseOpacity;
        mats[i].opacity = base * factor;
        mats[i].transparent = true;
      }
    }

    function restoreScene() {
      for (var i = 0; i < records.length; i++) {
        applyOpacity(records[i].mats, 1);
        records[i].sphere.scale.setScalar(1);
        if (records[i].phraseGroup && records[i].phraseGroup.parent) {
          records[i].phraseGroup.parent.remove(records[i].phraseGroup);
          disposeObject(records[i].phraseGroup);
          records[i].phraseGroup = null;
        }
        if (records[i].coGroup && records[i].coGroup.parent) {
          records[i].coGroup.parent.remove(records[i].coGroup);
          disposeObject(records[i].coGroup);
          records[i].coGroup = null;
        }
      }
      pickables = pickables.filter(function (mesh) { return mesh.userData.kind !== "phrase"; });
    }

    function renderDetail(rec, phraseWord) {
      if (!detailEl) return;
      detailEl.hidden = !rec;
      detailEl.innerHTML = rec ? wordDetailHtml(graph,rec,phraseWord) : "";
    }

    function statusFor(g, focusedWord) {
      return (focusedWord ? "已选中「" + focusedWord + "」 · " : "") + graphStatus(g);
    }

    function focusRecord(rec, phraseWord) {
      if (!rec) return;
      if (focused && focused !== rec) clearFocus(true);
      for (var b = 0; b < records.length; b++) {
        if (records[b].kind === "lemma") records[b].group.position.y = records[b].baseY;
      }
      focused = rec;
      if (!rec.phraseGroup && rec.data && rec.data.phrases && rec.data.phrases.length) {
        var anchor = new THREE.Group();
        var phrases = rec.data.phrases.filter(function (p) {
          // Unit nodes remain exact; outside collocations stay in the detail list.
          return !graph.setNumber && !graph.lemmas.some(function (n) { return n.key === norm(p.word); });
        });
        var n = phrases.length;
        for (var i = 0; i < n; i++) {
          var p = phrases[i];
          var ang = n === 1 ? 0.6 : (-Math.PI / 2 + (i / n) * Math.PI * 2);
          var dist = 3.8;
          var local = new THREE.Vector3(Math.cos(ang) * dist, Math.sin(ang) * dist * 0.72, (i % 2 === 0 ? 0.45 : -0.45));
          var orb = makeOrb(p.word, p.visual, p.primary ? 1.05 : 0.92, p.word.length > 18 ? 0.62 : 0.74);
          orb.group.position.copy(local);
          anchor.add(orb.group);
          bindPick(orb, { kind: "phrase", lemmaKey: rec.key, phrase: p.word });
          var rod = makeRod(new THREE.Vector3(0, 0, 0), local, p.visual.hex);
          if (rod) anchor.add(rod);
        }
        rec.group.add(anchor);
        rec.phraseGroup = anchor;
      }
      if (!rec.coGroup && rec.data && rec.data.coLemmas && rec.data.coLemmas.length) {
        var links = new THREE.Group();
        var from = new THREE.Vector3();
        rec.group.getWorldPosition(from);
        for (var c = 0; c < rec.data.coLemmas.length; c++) {
          var other = findLemma(rec.data.coLemmas[c]);
          if (!other) continue;
          var to = new THREE.Vector3();
          other.group.getWorldPosition(to);
          var link = makeRod(from, to, rec.data.visual.hex);
          if (link) links.add(link);
        }
        if (links.children.length) {
          scene.add(links);
          rec.coGroup = links;
        }
      }
      for (var r = 0; r < records.length; r++) {
        var fade = records[r] === rec ? 1 : (records[r].themeId === rec.themeId ? 0.38 : 0.2);
        applyOpacity(records[r].mats, fade);
        records[r].sphere.scale.setScalar(records[r] === rec ? 1.9 : 1);
      }
      var wp = new THREE.Vector3();
      rec.group.getWorldPosition(wp);
      goal.x = wp.x;
      goal.y = wp.y;
      goal.z = wp.z;
      goal.radius = narrow ? 12 : 14;
      renderDetail(rec.data, phraseWord || "");
      setStatus(statusFor(graph, rec.word));
    }

    function clearFocus(silent) {
      restoreScene();
      focused = null;
      goal.x = 0;
      goal.y = 0.4;
      goal.z = 0;
      goal.radius = defaultRadius;
      if (!silent) {
        renderDetail(null);
        setStatus(statusFor(graph, ""));
      }
    }

    function findLemma(word) {
      var key = norm(word);
      for (var i = 0; i < records.length; i++) {
        if (records[i].kind === "lemma" && records[i].key === key) return records[i];
      }
      return null;
    }

    function rebuild() {
      var previousFocus = graph && graph.trackId === scopeState.trackId && graph.setNumber === scopeState.setNumber && focused ? focused.key : "";
      clearFocus(true);
      disposeObject(world);
      world.clear ? world.clear() : world.remove.apply(world, world.children.slice());
      while (world.children && world.children.length) world.remove(world.children[0]);
      records = [];
      pickables = [];
      world.rotation.y = 0;
      var local = readLocal();
      trackId = scopeState.trackId || local.trackId; setNumber = scopeState.setNumber;
      graph = buildGraph({
        tracks: allTracks(),
        trackId: trackId,
        set: setNumber,
        page: scopeState.page,
        save: local.save,
        events: local.events,
        learnerId: local.learnerId,
        cap: cap,
        pageSize: 52,
      });
      graph = classic3DGraph(graph, narrow);
      scopeState.page = graph.stats.page;
      defaultRadius = narrow ? 56 : 38;
      goal.radius = defaultRadius;
      paintControls(graph);
      paintTitle("单词宇宙");
      var buttons = doc.querySelectorAll("[data-universe-track]");
      for (var b = 0; b < buttons.length; b++) {
        buttons[b].setAttribute("aria-pressed", buttons[b].getAttribute("data-universe-track") === graph.trackId ? "true" : "false");
      }
      var byLemma = Object.create(null);
      for (var i = 0; i < graph.lemmas.length; i++) byLemma[graph.lemmas[i].key] = graph.lemmas[i];
      for (var t = 0; t < graph.themes.length; t++) {
        var theme = graph.themes[t];
        var tg = new THREE.Group();
        tg.position.set(theme.x, theme.y, theme.z);
        var coreVisual = { hue: CLASSIC_HUE, sat:22, hex:hslToHex(CLASSIC_HUE,22,64), unscored:false, light:64 };
        var core = makeOrb(theme.zh, coreVisual, narrow ? 1.45 : 1.85, narrow ? 0.78 : 0.95);
        tg.add(core.group);
        bindPick(core, { kind: "core", themeId: theme.id });
        records.push({
          kind: "core",
          themeId: theme.id,
          word: theme.label,
          group: core.group,
          sphere: core.sphere,
          mats: core.mats,
          baseY: 0,
          phraseGroup: null,
        });
        world.add(tg);
        var members = [];
        for (var m = 0; m < graph.lemmas.length; m++) {
          if (graph.lemmas[m].themeId === theme.id) members.push(graph.lemmas[m]);
        }
        for (var n = 0; n < members.length; n++) {
          var lemma = members[n];
          var orb = makeOrb(lemma.word, lemma.visual, 0.78, lemma.word.length > 12 ? 0.62 : 0.78);
          orb.group.position.set(lemma.local.x, lemma.local.y, lemma.local.z);
          tg.add(orb.group);
          bindPick(orb, { kind: "lemma", key: lemma.key });
          var rod = makeRod(new THREE.Vector3(0, 0, 0), orb.group.position, lemma.visual.hex);
          if (rod) {
            tg.add(rod);
            orb.mats.push(rod.material);
          }
          var coLines = lemma.coLemmas || [];
          records.push({
            kind: "lemma",
            key: lemma.key,
            word: lemma.word,
            themeId: lemma.themeId,
            group: orb.group,
            sphere: orb.sphere,
            mats: orb.mats,
            baseY: lemma.local.y,
            data: lemma,
            phraseGroup: null,
            coLemmas: coLines,
          });
        }
      }
      setStatus(statusFor(graph, ""));
      renderDetail(null);
      if (previousFocus) {
        for (var f = 0; f < records.length; f++) if (records[f].kind === "lemma" && records[f].key === previousFocus) { focusRecord(records[f], ""); break; }
      }
    }

    var raycaster = new THREE.Raycaster();
    var pointer = new THREE.Vector2();

    function pickAt(clientX, clientY) {
      var rect = renderer.domElement.getBoundingClientRect();
      if (!rect.width || !rect.height) return null;
      pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      var hits = raycaster.intersectObjects(pickables, false);
      return hits.length ? hits[0].object : null;
    }

    function onPick(obj) {
      if (!obj || !obj.userData) {
        clearFocus(false);
        return;
      }
      if (obj.userData.kind === "lemma") {
        var rec = findLemma(obj.userData.key);
        if (rec) focusRecord(rec, "");
        return;
      }
      if (obj.userData.kind === "phrase") {
        var hostRec = findLemma(obj.userData.lemmaKey);
        if (hostRec) focusRecord(hostRec, obj.userData.phrase);
        return;
      }
      if (obj.userData.kind === "core") {
        clearFocus(true);
        for (var i = 0; i < graph.themes.length; i++) {
          if (graph.themes[i].id === obj.userData.themeId) {
            goal.x = graph.themes[i].x;
            goal.y = graph.themes[i].y;
            goal.z = graph.themes[i].z;
            goal.radius = narrow ? 16 : 18;
          }
        }
        renderDetail(null);
        setStatus(statusFor(graph, ""));
      }
    }

    renderer.domElement.addEventListener("pointerdown", function (ev) {
      if (ev.pointerType === "mouse" && ev.button !== 0) return;
      dragging = true;
      moved = false;
      activePointer = ev.pointerId;
      lastX = ev.clientX;
      lastY = ev.clientY;
      try { renderer.domElement.setPointerCapture(ev.pointerId); } catch (e) {}
    });
    renderer.domElement.addEventListener("pointermove", function (ev) {
      if (!dragging || ev.pointerId !== activePointer) return;
      var dx = ev.clientX - lastX;
      var dy = ev.clientY - lastY;
      if (dx * dx + dy * dy > 16) moved = true;
      lastX = ev.clientX;
      lastY = ev.clientY;
      theta -= dx * 0.005;
      phi -= dy * 0.004;
      if (phi < 0.28) phi = 0.28;
      if (phi > Math.PI - 0.28) phi = Math.PI - 0.28;
    });
    function endPointer(ev) {
      if (!dragging || (activePointer != null && ev.pointerId !== activePointer)) return;
      dragging = false;
      activePointer = null;
      if (!moved) onPick(pickAt(ev.clientX, ev.clientY));
    }
    renderer.domElement.addEventListener("pointerup", endPointer);
    renderer.domElement.addEventListener("pointercancel", function () { dragging = false; activePointer = null; });
    renderer.domElement.addEventListener("wheel", function (ev) {
      ev.preventDefault();
      goal.radius += ev.deltaY * 0.02;
      if (goal.radius < 6) goal.radius = 6;
      if (goal.radius > 70) goal.radius = 70;
    }, { passive: false });
    renderer.domElement.addEventListener("touchstart", function (ev) {
      if (ev.touches.length === 2) pinchDist = Math.hypot(ev.touches[0].clientX - ev.touches[1].clientX, ev.touches[0].clientY - ev.touches[1].clientY);
    }, { passive: true });
    renderer.domElement.addEventListener("touchmove", function (ev) {
      if (ev.touches.length === 2) {
        ev.preventDefault();
        var d = Math.hypot(ev.touches[0].clientX - ev.touches[1].clientX, ev.touches[0].clientY - ev.touches[1].clientY);
        if (pinchDist) {
          goal.radius += (pinchDist - d) * 0.06;
          if (goal.radius < 6) goal.radius = 6;
          if (goal.radius > 70) goal.radius = 70;
        }
        pinchDist = d;
      }
    }, { passive: false });

    if (detailEl) {
      detailEl.addEventListener("click", function (ev) {
        var t = ev.target;
        if (!t || !t.closest) return;
        if (t.closest("[data-clear-focus]")) {
          clearFocus(false);
          return;
        }
        var phraseBtn = t.closest("[data-phrase]");
        if (phraseBtn && focused) {
          focusRecord(focused, phraseBtn.getAttribute("data-phrase") || "");
          return;
        }
        var wordBtn = t.closest("[data-focus-word]");
        if (wordBtn) {
          var rec = findLemma(wordBtn.getAttribute("data-focus-word") || "");
          if (rec) focusRecord(rec, "");
        }
      });
    }
    doc.addEventListener("click", function (ev) {
      var btn = ev.target && ev.target.closest && ev.target.closest("[data-universe-track]");
      if (!btn) return;
      var next = btn.getAttribute("data-universe-track");
      if (!next || next === trackId) return;
      trackId = next;
      setNumber = null;
      scopeState.trackId = next; scopeState.setNumber = null; scopeState.page = 0;
      try {
        if (root.history && root.location) {
          var url = new URL(root.location.href);
          url.searchParams.set("track", trackId);
          url.searchParams.delete("set");
          root.history.replaceState(null, "", url.pathname + url.search + url.hash);
        }
      } catch (eUrl) {}
      rebuild();
    });
    doc.addEventListener("keydown", function (ev) {
      if (ev.key === "Escape") clearFocus(false);
    });
    root.addEventListener("resize", resize);

    var started = false;
    function tick(now) {
      look.x += (goal.x - look.x) * 0.1;
      look.y += (goal.y - look.y) * 0.1;
      look.z += (goal.z - look.z) * 0.1;
      radius += (goal.radius - radius) * 0.1;
      if (!reduce && !focused && !dragging) world.rotation.y += 0.0011;
      if (!focused) {
        for (var i = 0; i < records.length; i++) {
          if (records[i].kind !== "lemma") continue;
          var bob = reduce ? 0 : Math.sin(now * 0.001 + i * 0.45) * 0.1;
          records[i].group.position.y = records[i].baseY + bob;
        }
      }
      placeCamera();
      renderer.render(scene, camera);
      if (started) root.requestAnimationFrame(tick);
    }

    api.currentGraph = function () { return graph; };
    bindControls(scopeState, rebuild, false);
    resize();
    watchProgress(rebuild);
    started = true;
    root.requestAnimationFrame(tick);
    api.focusWord = function (word) {
      var rec = findLemma(word);
      if (rec) focusRecord(rec, "");
      return !!rec;
    };
    api.clearFocus = function () { clearFocus(false); };
    api.currentGraph = function () { return graph; };
  }

  var api = {
    LEGEND: LEGEND,
    UNSCORED_NOTE: UNSCORED_NOTE,
    SAVE_KEY: SAVE_KEY,
    THEMES: THEMES,
    SHOWCASE: SHOWCASE,
    isPhrase: isPhrase,
    themeOf: themeOf,
    visualOf: visualOf,
    hslToHex: hslToHex,
    buildGraph: buildGraph,
    classic3DGraph: classic3DGraph,
    classicVisual: classicVisual,
    wordDetailHtml: wordDetailHtml,
    parseScope: parseScope,
    readLocal: readLocal,
    mount: mount,
    allTracks: allTracks,
    masteryText: masteryText,
    CLUSTER_RULE: "Exact current-unit membership, including phrase entries. All entries receive one primary category from headword, current gloss and POS rules. Current-unit evidence wins; otherwise latest same-track/sense evidence is used. Overall colour includes observed spelling/polysemy and required collocations; untested collocations block mastered. Completed units persist and full-universe pages keep every registered entry accessible.",
  };
  return api;
});

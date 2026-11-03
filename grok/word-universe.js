/* 单词记忆宇宙 · beta
 * Additive 3D view. Does not write the save, schedule cards, or touch auth.
 *
 * Theme rule (heuristic buckets, not model edges):
 * 1. Exact English lemma hit on a bucket list, in bucket order.
 * 2. Else a stem: length >= 4 and the lemma starts with it; length >= 5
 *    also matches a substring (so "lifestyle" joins LIFE, "telephone" joins
 *    TECHNOLOGY).
 * 3. Else a Chinese gloss segment (split on ；;，,、/|) exactly equals a
 *    bucket gloss.
 * 4. Else the lemma joins 其他.
 * Bucket order is technology, school, nature, life, feeling, travel, time,
 * society. LIFE and TECHNOLOGY are the seed cores.
 *
 * First paint is theme cores plus single-word lemmas only. Phrase cards stay
 * off the graph until a lemma is clicked. A phrase node exists only when
 * related[] names a card in this exam track that has a gloss. The primary
 * phrase is QuizMarioRelated.primaryCollocation (the same hard-gate choice).
 * Co-lemma links are other single-word entries already on those phrase cards.
 * Nothing is invented.
 *
 * Color uses QMStudy.buildPersonal().inventory.practiced[].score, the same
 * 掌握度 0–3 as 我的学情三栏. Weakest scored color is darkest. A word with no
 * score stays gray and is not painted as 0. The 不熟练 list only decides which
 * nodes fit under the cap; it is not a second score.
 * LIFE / TECHNOLOGY keep a few showcase lemmas so an empty save still has
 * the two seed cores. Those nodes use real mastery when the save has it.
 *
 * No set in the query keeps that whole-track graph. ?track=gaokao&set=12
 * (1-based, same number as 第N组) limits lemma nodes to that set. 固定搭配
 * still resolve on click from the whole track. A set that fits the cap shows
 * every lemma. Over the cap, 不熟练 then 未学 come before high mastery.
 * Showcase seeds are only the whole-track empty state, or a set that has
 * no single-word lemmas.
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

  var SAVE_KEY = "vocabSpotlight_v1";
  var EVENT_KEY = "quizmario_learner_events_v1";
  var LEGEND = "颜色越深 = 越不熟练";
  var UNSCORED_NOTE = "灰色 = 未学，不记成 0 分";
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
      zh: "科技",
      hue: 196,
      en: wordSet("computer internet phone software digital technology robot email e-mail website online keyboard screen television radio camera video media program code device electronic network app smartphone telephone laptop tablet ai tv data digital"),
      stems: ["comput", "internet", "technolog", "digit", "softwar", "phone", "robot", "email", "website", "online", "keyboard", "screen", "televis", "camera", "video", "network", "electron", "laptop", "tablet"],
      zhKeys: ["电脑", "计算机", "互联网", "网络", "软件", "科技", "技术", "数字", "电话", "手机", "程序", "键盘", "机器人", "电子邮件", "网站", "电子", "屏幕", "电视", "相机"],
    },
    {
      id: "school",
      label: "SCHOOL",
      zh: "学校",
      hue: 42,
      en: wordSet("school teacher student class lesson exam test homework book learn study classroom pupil college university pencil pen desk grade course dictionary library knowledge education classmate textbook subject math maths science history language english chinese question answer read write spell notebook homework"),
      stems: ["school", "teach", "student", "lesson", "exam", "homework", "college", "univers", "librar", "diction", "educat", "textbook", "science", "history"],
      zhKeys: ["学校", "老师", "教师", "学生", "课堂", "作业", "考试", "图书馆", "字典", "教育"],
    },
    {
      id: "nature",
      label: "NATURE",
      zh: "自然",
      hue: 132,
      en: wordSet("nature natural animal plant tree flower river mountain weather rain snow wind sun moon star earth sea ocean forest bird fish dog cat horse farm grass leaf sky cloud water fire air environment pollution tiger lion panda garden weather"),
      stems: ["natur", "animal", "plant", "mountain", "weather", "ocean", "forest", "environment", "pollut", "river", "flower"],
      zhKeys: ["自然", "动物", "植物", "天气", "山", "河", "海", "森林", "环境"],
    },
    {
      id: "life",
      label: "LIFE",
      zh: "生活",
      hue: 352,
      en: wordSet("life live alive living lifestyle lifetime childhood death dead die dying family home house friend friendship love health healthy food meal breakfast lunch dinner parent mother father mom dad baby child birth body heart blood face hand eye hair sleep eat drink cook kitchen hospital doctor nurse medicine ill sick people person man woman boy girl husband wife brother sister uncle aunt grow growth pet clothes shirt dress shoe sport sports game music song film movie holiday birthday age young old"),
      stems: ["life", "live", "child", "family", "friend", "health", "mother", "father", "brother", "sister", "hospital", "doctor", "medicine", "breakfast", "dinner"],
      zhKeys: ["生活", "生命", "家庭", "健康", "食物", "身体", "医院", "医生"],
    },
    {
      id: "feeling",
      label: "FEELING",
      zh: "情感",
      hue: 300,
      en: wordSet("happy happiness sad sadness angry anger fear afraid hope worry smile cry joy sorry proud lonely nervous excite excited exciting surprise surprised surprising emotion feel feeling anxious anxiety hate"),
      stems: ["happ", "anger", "angry", "afraid", "worry", "nervous", "excit", "surpris", "emotion", "lonely"],
      zhKeys: ["高兴", "快乐", "伤心", "生气", "害怕", "情感", "担心"],
    },
    {
      id: "travel",
      label: "TRAVEL",
      zh: "出行",
      hue: 210,
      en: wordSet("travel trip train bus car plane airport station road street map hotel tourist visit ticket ship bike bicycle traffic journey taxi flight passenger railway subway boat"),
      stems: ["travel", "airport", "station", "tourist", "traffic", "journey", "bicycle", "railway", "subway"],
      zhKeys: ["旅行", "交通", "机场", "车站", "火车", "飞机"],
    },
    {
      id: "time",
      label: "TIME",
      zh: "时间",
      hue: 24,
      en: wordSet("time today tomorrow yesterday morning afternoon evening night week month year hour minute clock calendar season spring summer autumn winter early late always never often sometimes daily weekly weekend"),
      stems: ["today", "tomorrow", "yesterday", "morning", "afternoon", "evening", "calendar", "season", "winter", "summer", "autumn", "spring", "night", "week", "month", "year"],
      zhKeys: ["时间", "今天", "明天", "昨天", "早上", "晚上", "季节"],
    },
    {
      id: "society",
      label: "SOCIETY",
      zh: "社会",
      hue: 262,
      en: wordSet("advantage society social law lawyer government economy economic money job work business city country nation police war peace duty public community citizen president king queen market price bank company office trade factory village town capital culture cultural rule policy election vote tax poor rich success successful fail failure problem chance opportunity"),
      stems: ["advantage", "societ", "govern", "econom", "business", "company", "citizen", "president", "culture", "success", "opportunit"],
      zhKeys: ["社会", "政府", "经济", "公司", "优势", "工作", "城市", "国家"],
    },
  ];

  var OTHER = { id: "other", label: "OTHER", zh: "其他", hue: 222, en: Object.create(null), stems: [], zhKeys: [] };
  var THEME_ORDER = ["life", "technology", "school", "nature", "feeling", "travel", "time", "society", "other"];
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

  function themeOf(word, gloss) {
    var lemma = norm(word);
    for (var i = 0; i < THEMES.length; i++) {
      var theme = THEMES[i];
      if (theme.en[lemma] || stemHit(lemma, theme.stems) || glossHit(gloss, theme.zhKeys)) return theme;
    }
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

  function masteryIndex(save, events, learnerId) {
    var byWord = Object.create(null);
    var weak = Object.create(null);
    var study = root.QMStudy;
    if (!study || typeof study.buildPersonal !== "function") {
      return { byWord: byWord, weak: weak, ok: false };
    }
    var model;
    try {
      model = study.buildPersonal(save || {}, events || [], new Date(), learnerId ? { learnerId: learnerId } : {});
    } catch (e) {
      return { byWord: byWord, weak: weak, ok: false };
    }
    var practiced = model && model.inventory && model.inventory.practiced || [];
    for (var i = 0; i < practiced.length; i++) {
      var row = practiced[i];
      if (!row || !row.word) continue;
      var score = row.score == null || row.score === "" ? null : Number(row.score);
      byWord[norm(row.word)] = { score: score != null && isFinite(score) ? score : null };
    }
    var weakRows = model && model.inventory && model.inventory.weak || [];
    for (var w = 0; w < weakRows.length; w++) {
      if (weakRows[w] && weakRows[w].word) weak[norm(weakRows[w].word)] = true;
    }
    return { byWord: byWord, weak: weak, ok: true };
  }

  function findTrack(tracks, trackId) {
    var list = tracks || [];
    var id = trackId === "gaokao" ? "gaokao" : "zhongkao";
    for (var i = 0; i < list.length; i++) {
      if (list[i] && list[i].id === id) return list[i];
    }
    return list[0] || null;
  }

  /* setIndex null: whole track. A number keeps lemmas from that set only.
   * byNorm always covers the track so a click can still resolve 固定搭配. */
  function flatten(track, setIndex) {
    var lemmas = [];
    var byNorm = Object.create(null);
    var lemmaSeen = Object.create(null);
    var sets = track && track.sets || [];
    var scoped = setIndex != null;
    for (var s = 0; s < sets.length; s++) {
      var row = sets[s] || [];
      for (var i = 0; i < row.length; i++) {
        var card = row[i];
        if (!card || typeof card.word !== "string") continue;
        var key = norm(card.word);
        if (!key) continue;
        if (!byNorm[key]) byNorm[key] = card;
        if (isPhrase(card.word)) continue;
        if (scoped && s !== setIndex) continue;
        if (lemmaSeen[key]) continue;
        lemmaSeen[key] = true;
        lemmas.push(card);
      }
    }
    return { lemmas: lemmas, byNorm: byNorm };
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
      if (key === "track" && (val === "gaokao" || val === "zhongkao")) out.trackId = val;
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
    var track = findTrack(opt.tracks || root.VOCAB_EXAM_TRACKS || [], opt.trackId);
    var empty = {
      trackId: track && track.id || "",
      trackName: track && track.name || "",
      legend: LEGEND,
      unscoredNote: UNSCORED_NOTE,
      themes: [],
      lemmas: [],
      spokes: [],
      stats: { bankLemmas: 0, touched: 0, shown: 0, cap: opt.cap || 0 },
      masteryOk: false,
    };
    if (!track) return empty;
    var spec = resolveSet(track, opt.set);
    var scoped = !!spec;
    var bank = flatten(track, null);
    var pool = scoped ? flatten(track, spec.missing ? -1 : spec.index) : bank;
    var flat = { lemmas: pool.lemmas, byNorm: bank.byNorm };
    var related = root.QuizMarioRelated;
    var index = null;
    if (related && typeof related.indexTrack === "function") {
      try { index = related.indexTrack(track.sets || []); }
      catch (e) { index = null; }
    }
    var mastery = masteryIndex(opt.save, opt.events, opt.learnerId);
    function rowsFrom(cards, phraseNorm) {
      var list = [];
      var byKey = Object.create(null);
      for (var i = 0; i < cards.length; i++) {
        var card = cards[i];
        var key = norm(card.word);
        if (!key || byKey[key]) continue;
        var theme = themeOf(card.word, card.meaning_zh || "");
        var hit = mastery.byWord[key];
        var scored = !!(hit && hit.score != null && isFinite(hit.score));
        var row = {
          key: key,
          word: card.word,
          gloss: String(card.meaning_zh || "").trim(),
          ipa: card.ipa || "",
          pos: card.pos || "",
          themeId: theme.id,
          mastery: scored ? hit.score : null,
          scored: scored,
          weak: !!mastery.weak[key],
          phraseCount: phraseCountOf(card, phraseNorm),
          card: card,
        };
        list.push(row);
        byKey[key] = row;
      }
      return { rows: list, rowByKey: byKey };
    }
    var built = rowsFrom(flat.lemmas, flat.byNorm);
    var rows = built.rows;
    var rowByKey = built.rowByKey;
    var cap = opt.cap > 0 ? opt.cap : 48;
    var seedPer = opt.seedPer != null ? opt.seedPer : Math.min(6, Math.max(4, Math.floor(cap / 8)));
    var perTheme = opt.perTheme != null ? opt.perTheme : 14;
    var neighborPer = opt.neighborPer != null ? opt.neighborPer : 1;
    var selected = [];
    var have = Object.create(null);
    function push(row) {
      if (!row || have[row.key] || selected.length >= cap) return false;
      have[row.key] = true;
      selected.push(row);
      return true;
    }
    function takeSeeds(lookup) {
      var seedIds = ["life", "technology"];
      for (var s = 0; s < seedIds.length; s++) {
        var names = SHOWCASE[seedIds[s]] || [];
        var nSeed = 0;
        for (var n = 0; n < names.length && nSeed < seedPer; n++) {
          if (push(lookup[norm(names[n])])) nSeed++;
        }
      }
    }
    if (!scoped) {
      takeSeeds(rowByKey);
      var ranked = rows.slice().sort(compareWeak);
      var counts = Object.create(null);
      for (var c = 0; c < selected.length; c++) {
        counts[selected[c].themeId] = (counts[selected[c].themeId] || 0) + 1;
      }
      var take = function (respect) {
        for (var r = 0; r < ranked.length; r++) {
          var row = ranked[r];
          if (!row.scored && !row.weak) continue;
          if (respect && (counts[row.themeId] || 0) >= perTheme) continue;
          if (push(row)) counts[row.themeId] = (counts[row.themeId] || 0) + 1;
          if (selected.length >= cap) return;
        }
      };
      take(true);
      take(false);
    } else if (!rows.length && !spec.missing) {
      var bankRows = rowsFrom(bank.lemmas, bank.byNorm);
      takeSeeds(bankRows.rowByKey);
    } else {
      var setRanked = rows.slice().sort(compareSetFocus);
      for (var sr = 0; sr < setRanked.length; sr++) {
        if (!push(setRanked[sr])) break;
      }
    }

    function attachLinks(list) {
      for (var a = 0; a < list.length; a++) {
        var row = list[a];
        if (row.phrases) continue;
        var phrases = phrasesFor(row.card, flat.byNorm, index);
        var theme = themeById(row.themeId);
        for (var p = 0; p < phrases.length; p++) {
          var pHit = mastery.byWord[phrases[p].key];
          var pScored = !!(pHit && pHit.score != null && isFinite(pHit.score));
          phrases[p].mastery = pScored ? pHit.score : null;
          phrases[p].scored = pScored;
          phrases[p].visual = visualOf(theme, phrases[p].mastery, pScored);
        }
        row.phrases = phrases;
        row.coLemmas = coLemmasOf(row.card, phrases, flat.byNorm);
      }
    }
    attachLinks(selected);
    var base = selected.slice();
    var neighbors = [];
    for (var b = 0; b < base.length; b++) {
      var cos = base[b].coLemmas || [];
      var added = 0;
      for (var k = 0; k < cos.length && added < neighborPer; k++) {
        var other = rowByKey[norm(cos[k])];
        if (other && STOP_NEIGHBOR[other.key]) continue;
        if (push(other)) {
          neighbors.push(other);
          added++;
        }
      }
    }
    attachLinks(neighbors);

    var themeIds = [];
    var seenTheme = Object.create(null);
    for (var t = 0; t < THEME_ORDER.length; t++) {
      for (var u = 0; u < selected.length; u++) {
        if (selected[u].themeId === THEME_ORDER[t] && !seenTheme[THEME_ORDER[t]]) {
          seenTheme[THEME_ORDER[t]] = true;
          themeIds.push(THEME_ORDER[t]);
        }
      }
    }
    var placed = placeThemes(themeIds);
    var themePos = Object.create(null);
    var themes = [];
    for (var tp = 0; tp < placed.length; tp++) {
      var meta = themeById(placed[tp].id);
      var themeNode = {
        id: placed[tp].id,
        label: meta.label,
        zh: meta.zh,
        hue: meta.hue,
        x: placed[tp].x,
        y: placed[tp].y,
        z: placed[tp].z,
      };
      themes.push(themeNode);
      themePos[themeNode.id] = themeNode;
    }
    var groups = Object.create(null);
    for (var g = 0; g < selected.length; g++) {
      if (!groups[selected[g].themeId]) groups[selected[g].themeId] = [];
      groups[selected[g].themeId].push(selected[g]);
    }
    var lemmas = [];
    var spokes = [];
    var themeKeys = Object.keys(groups);
    for (var tk = 0; tk < themeKeys.length; tk++) {
      var bucket = groups[themeKeys[tk]];
      bucket.sort(function (a, b) { return a.word < b.word ? -1 : a.word > b.word ? 1 : 0; });
      var radius = 4.6 + Math.min(2.4, bucket.length * 0.12);
      var origin = themePos[themeKeys[tk]];
      for (var bi = 0; bi < bucket.length; bi++) {
        var row = bucket[bi];
        var local = orbitPoint(bi, bucket.length, radius);
        var theme = themeById(row.themeId);
        lemmas.push({
          id: "lemma:" + row.key,
          key: row.key,
          word: row.word,
          gloss: row.gloss,
          ipa: row.ipa,
          pos: row.pos,
          themeId: row.themeId,
          mastery: row.mastery,
          scored: row.scored,
          weak: row.weak,
          visual: visualOf(theme, row.mastery, row.scored),
          phrases: row.phrases || [],
          coLemmas: row.coLemmas || [],
          local: local,
          x: origin.x + local.x,
          y: origin.y + local.y,
          z: origin.z + local.z,
        });
        spokes.push({ from: "theme:" + row.themeId, to: "lemma:" + row.key });
      }
    }
    var touched = 0;
    for (var z = 0; z < rows.length; z++) if (rows[z].scored || rows[z].weak) touched++;
    return {
      trackId: track.id,
      trackName: track.name || track.id,
      legend: LEGEND,
      unscoredNote: UNSCORED_NOTE,
      scopeLabel: spec ? ("本组学情 · Set " + spec.number) : "",
      setNumber: spec ? spec.number : null,
      themes: themes,
      lemmas: lemmas,
      spokes: spokes,
      stats: { bankLemmas: rows.length, touched: touched, shown: lemmas.length, cap: cap },
      masteryOk: mastery.ok,
    };
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
    var trackId = save.track === "gaokao" || save.track === "zhongkao" ? save.track : "zhongkao";
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
    if (!node || !node.scored) return "未学 · 不记成 0 分";
    var n = Math.round(Number(node.mastery) * 10) / 10;
    return "掌握度 " + n;
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
    if (!root.THREE) {
      setStatus(scopePrefix + "3D 引擎没有加载。单词记忆宇宙需要 WebGL。");
      return;
    }
    var canvas = doc.createElement("canvas");
    var gl = null;
    try { gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl"); } catch (e) { gl = null; }
    if (!gl) {
      setStatus(scopePrefix + "这台设备没有可用的 WebGL，单词记忆宇宙需要真 3D。");
      return;
    }

    var THREE = root.THREE;
    var reduce = false;
    try {
      reduce = !!(root.matchMedia && root.matchMedia("(prefers-reduced-motion: reduce)").matches);
    } catch (e2) { reduce = false; }
    var narrow = false;
    try { narrow = !!(root.matchMedia && root.matchMedia("(max-width: 800px)").matches); } catch (e3) { narrow = false; }
    var cap = narrow ? 32 : 52;

    var renderer = new THREE.WebGLRenderer({ antialias: !narrow, alpha: false, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(root.devicePixelRatio || 1, narrow ? 1.5 : 2));
    renderer.setClearColor(0x070b16, 1);
    renderer.domElement.id = "universe-canvas";
    renderer.domElement.setAttribute("aria-label", "单词记忆宇宙，可拖动旋转，点单词展开固定搭配");
    host.appendChild(renderer.domElement);

    var scene = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera(48, 1, 0.1, 400);
    scene.add(new THREE.AmbientLight(0x9eb4d8, 0.55));
    var hemi = new THREE.HemisphereLight(0xd7e8ff, 0x1a1028, 0.55);
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
    scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xd5e6ff, size: 0.28, sizeAttenuation: true })));

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
      if (!rec) {
        detailEl.hidden = true;
        detailEl.innerHTML = "";
        return;
      }
      detailEl.hidden = false;
      var weakNote = rec.weak ? "<p class=\"uni-meta\">这个词也在「不熟练 · 薄弱词」里。颜色仍用掌握度，不用薄弱信号。</p>" : "";
      var phraseHtml = "";
      if (!rec.phrases.length) {
        phraseHtml = "<p class=\"uni-meta\">当前词库的 related[] 里没有能对上的固定搭配。</p>";
      } else {
        phraseHtml = "<p class=\"uni-kicker\">固定搭配</p><ul class=\"uni-phrases\">";
        for (var i = 0; i < rec.phrases.length; i++) {
          var p = rec.phrases[i];
          var mark = p.primary ? " · 主搭配" : "";
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
          for (var r = 0; r < records.length; r++) {
            if (records[r].kind === "lemma" && records[r].key === norm(surface)) inGraph = true;
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
      detailEl.innerHTML =
        "<button type=\"button\" class=\"uni-clear\" data-clear-focus>返回全景</button>" +
        "<h2>" + esc(title) + "</h2>" +
        (ipa ? "<p class=\"uni-ipa\">" + esc(ipa) + "</p>" : "") +
        "<p class=\"uni-gloss\">" + esc(gloss || "—") + "</p>" +
        "<p class=\"uni-score\">" + esc(scoreLine) + "</p>" +
        weakNote + phraseHtml + linkHtml;
    }

    function statusFor(g, focusedWord) {
      if (!g) return "";
      var tail = g.masteryOk ? "" : " · 学情模块没读到，颜色先按未学";
      var scope = g.scopeLabel ? (g.scopeLabel + " · ") : "";
      var base = scope + g.trackName + " · 显示 " + g.stats.shown + " 个单词（上限 " + g.stats.cap +
        "，优先不熟练）· 词库单词 " + g.stats.bankLemmas + " · 已有学情 " + g.stats.touched + tail;
      if (!g.stats.touched) {
        if (g.setNumber) {
          if (!g.stats.bankLemmas) base += " · 这一组没有单独单词";
        } else {
          base += " · 还没有练习记录，LIFE / TECHNOLOGY 是种子主题";
        }
      }
      if (focusedWord) return "已展开「" + focusedWord + "」的固定搭配 · " + base;
      return "首屏只有主题和单词 · " + base;
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
        var phrases = rec.data.phrases;
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
      clearFocus(true);
      disposeObject(world);
      world.clear ? world.clear() : world.remove.apply(world, world.children.slice());
      while (world.children && world.children.length) world.remove(world.children[0]);
      records = [];
      pickables = [];
      world.rotation.y = 0;
      var local = readLocal();
      graph = buildGraph({
        tracks: root.VOCAB_EXAM_TRACKS || [],
        trackId: trackId || local.trackId,
        set: setNumber,
        save: local.save,
        events: local.events,
        learnerId: local.learnerId,
        cap: cap,
      });
      paintTitle(graph.scopeLabel);
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
        var coreVisual = { hex: hslToHex(theme.hue, 55, 62), unscored: false, light: 62 };
        var core = makeOrb(theme.label, coreVisual, narrow ? 1.45 : 1.85, narrow ? 0.78 : 0.95);
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

    resize();
    rebuild();
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
    parseScope: parseScope,
    readLocal: readLocal,
    mount: mount,
    CLUSTER_RULE: "Heuristic theme buckets in fixed order (technology, school, nature, life, feeling, travel, time, society, else 其他). Match exact English lemma, then stem (prefix if length >= 4, substring if length >= 5), then an exact Chinese gloss segment. First paint is cores plus lemma words only. Click adds phrase cards already in related[] that resolve to a glossed track card; primary is primaryCollocation. Co-lemmas are single-word related[] entries on those cards. Function-word co-lemmas (on/of/to/over/…) stay in the detail list and do not take an orbit. Mastery color is QMStudy inventory.practiced score (0–3, same as 三栏). Unscored stays gray. Weak-list membership only prioritizes which nodes fit the cap. A set query limits lemmas to that set; 固定搭配 still resolve from the whole track. Over the set cap, 不熟练 and 未学 come before high mastery. No set query keeps the whole track.",
  };
  return api;
});

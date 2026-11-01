/* 高考一词多义. Loaded before game.js. Also require()-able from node tests.
 *
 * The correct option is the live card's meaning_zh. The prompt context is that
 * card's example_en. This file does not invent a second production gloss and
 * does not write anything back onto exam-tracks.
 *
 * foils are reviewed wrong senses of the same English lemma. They are options
 * only. glossAnchor must equal the deck gloss or the item is not served.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.QuizMarioPolysemy = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  var BANK = [
    { word: "light", pos: "n.", glossAnchor: "光；灯", foils: ["轻的", "点燃", "浅色的"] },
    { word: "book", pos: "n.", glossAnchor: "书", foils: ["预订", "账本", "订票"] },
    { word: "right", pos: "n.", glossAnchor: "右边", foils: ["正确的", "权利", "立刻"] },
    { word: "present", pos: "v.", glossAnchor: "展示；呈现", foils: ["礼物", "现在的", "在场的"] },
    { word: "match", pos: "v.", glossAnchor: "配对；比得上", foils: ["比赛", "火柴", "对手"] },
    { word: "spring", pos: "n.", glossAnchor: "春天", foils: ["弹簧", "泉水", "弹起"] },
    { word: "watch", pos: "v.", glossAnchor: "观看", foils: ["手表", "看守", "留意"] },
    { word: "miss", pos: "v.", glossAnchor: "想念；错过", foils: ["小姐", "未击中", "缺席"] },
    { word: "Miss", pos: "n.", glossAnchor: "小姐；女士", foils: ["想念", "错过", "未击中"] },
    { word: "May", pos: "n.", glossAnchor: "五月", foils: ["可以", "也许", "许可"] },
    { word: "may", pos: "modal v.", glossAnchor: "可以；也许", foils: ["五月", "山楂", "迈"] },
    { word: "China", pos: "n.", glossAnchor: "中国", foils: ["瓷器", "瓷的", "陶器"] },
    { word: "china", pos: "n.", glossAnchor: "瓷器", foils: ["中国", "中国人", "中文"] },
    { word: "March", pos: "n.", glossAnchor: "三月", foils: ["行进", "游行", "进军"] },
    { word: "march", pos: "v.", glossAnchor: "行进；游行", foils: ["三月", "军乐", "齐步"] },
    { word: "bank", pos: "n.", glossAnchor: "银行", foils: ["河岸", "库存", "堤岸"] },
    { word: "change", pos: "n.", glossAnchor: "改变", foils: ["零钱", "换乘", "找零"] },
    { word: "plant", pos: "n.", glossAnchor: "植物", foils: ["工厂", "种植", "栽种"] },
    { word: "rock", pos: "n.", glossAnchor: "岩石", foils: ["摇滚", "摇动", "晃动"] },
    { word: "date", pos: "n.", glossAnchor: "日期", foils: ["约会", "枣", "约会对象"] },
    { word: "mean", pos: "v.", glossAnchor: "意思是；意味着", foils: ["吝啬的", "平均的", "中间的"] },
    { word: "patient", pos: "n.", glossAnchor: "病人", foils: ["耐心的", "有耐性的", "能忍耐的"] },
    { word: "interest", pos: "n.", glossAnchor: "兴趣", foils: ["利息", "股权", "利害"] },
    { word: "term", pos: "n.", glossAnchor: "学期", foils: ["术语", "期限", "条款"] },
    { word: "current", pos: "adj.", glossAnchor: "当前的", foils: ["电流", "水流", "潮流"] },
    { word: "express", pos: "v.", glossAnchor: "表达", foils: ["快递", "快车", "特快"] },
    { word: "close", pos: "adj.", glossAnchor: "近的；接近的", foils: ["关闭", "结束", "合拢"] },
    { word: "leave", pos: "v.", glossAnchor: "离开", foils: ["留下", "假期", "树叶"] },
    { word: "state", pos: "n.", glossAnchor: "状态；州", foils: ["陈述", "声明", "国家"] },
    { word: "article", pos: "n.", glossAnchor: "文章；冠词", foils: ["物品", "商品", "物件"] },
    { word: "capital", pos: "n.", glossAnchor: "首都；大写", foils: ["资本", "资金", "资方"] },
    { word: "record", pos: "n.", glossAnchor: "记录；纪录", foils: ["唱片", "录音", "录制"] },
    { word: "park", pos: "n.", glossAnchor: "公园", foils: ["停车", "停放", "泊车"] },
    { word: "play", pos: "v.", glossAnchor: "玩；演奏", foils: ["戏剧", "剧本", "播放"] },
    { word: "who", pos: "pron.", glossAnchor: "谁", foils: ["世界卫生组织", "谁的", "哪一位"] },
    { word: "WHO", pos: "abbr.", glossAnchor: "世界卫生组织", foils: ["谁", "谁的", "哪一位"] },
  ];

  function norm(s) {
    return String(s == null ? "" : s).trim();
  }

  function parts(gloss) {
    return norm(gloss).split(/[；;]/).map(function (s) { return s.trim(); }).filter(Boolean);
  }

  /** A foil that repeats the deck gloss, or one ； segment of it, cannot be a choice. */
  function conflicts(foil, gloss) {
    var f = norm(foil);
    var g = norm(gloss);
    if (!f || !g) return true;
    if (f === g) return true;
    var ps = parts(g);
    for (var i = 0; i < ps.length; i++) {
      var p = ps[i];
      if (p.length >= 2 && (f.indexOf(p) !== -1 || p.indexOf(f) !== -1)) return true;
      if (p.length < 2 && f === p) return true;
    }
    return false;
  }

  function findEntry(card) {
    if (!card) return null;
    for (var i = 0; i < BANK.length; i++) {
      if (BANK[i].word === card.word && BANK[i].pos === card.pos) return BANK[i];
    }
    return null;
  }

  /**
   * Four choices. correct is the deck gloss, kept as one string (； is not split).
   * Returns null when the deck gloss drifted from glossAnchor, the example is
   * empty, or fewer than three foils survive.
   * ipa is copied through and stays "" when the card has none.
   */
  function optionSet(card, entry) {
    entry = entry || findEntry(card);
    if (!card || !entry) return null;
    var correct = norm(card.meaning_zh);
    if (!correct || correct !== entry.glossAnchor) return null;
    var context = norm(card.example_en);
    if (!context) return null;
    var foils = [];
    var seen = {};
    var raw = entry.foils || [];
    for (var i = 0; i < raw.length; i++) {
      var f = norm(raw[i]);
      if (!f || seen[f] || conflicts(f, correct)) continue;
      seen[f] = true;
      foils.push(f);
    }
    if (foils.length < 3) return null;
    return {
      correct: correct,
      options: [correct, foils[0], foils[1], foils[2]],
      context: context,
      ipa: norm(card.ipa),
    };
  }

  function isPolysemyTrack(id) {
    return id === "gaokao";
  }

  return {
    BANK: BANK,
    parts: parts,
    conflicts: conflicts,
    findEntry: findEntry,
    optionSet: optionSet,
    isPolysemyTrack: isPolysemyTrack,
  };
});

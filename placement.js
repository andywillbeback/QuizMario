/* Day-1 placement after 中考/高考.
 * Loaded before game.js. Also require()-able from node tests.
 *
 * A signed-in student with no progress on that exam answers 10
 * English → meaning items, then the frontier opens on an early set.
 * Accuracy bands only — not IRT. Students who already moved the
 * frontier, answered a card, or finished placement skip it.
 * 今日必练 stays a separate home path.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.QuizMarioPlacement = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  var ITEM_COUNT = 10;
  var EARLY_SETS = 4;
  var EXAM_TRACKS = { zhongkao: true, gaokao: true };
  var RESULT_TITLE = "起始组";
  var ENTER_LABEL = "进入起始组";

  function cardAttempted(p) {
    if (!p || typeof p !== "object") return false;
    if ((p.reps || 0) > 0 || (p.correct || 0) > 0 || (p.wrong || 0) > 0 || (p.unknown || 0) > 0 || (p.mastery || 0) > 0) return true;
    var spell = p.spelling;
    return !!(spell && ((spell.correct || 0) > 0 || (spell.wrong || 0) > 0 || (spell.unknown || 0) > 0));
  }

  function hasTrackProgress(cards, trackId) {
    var prefix = String(trackId || "") + "|";
    if (prefix === "|") return false;
    var bag = cards && typeof cards === "object" ? cards : {};
    var keys = Object.keys(bag);
    for (var i = 0; i < keys.length; i++) {
      if (keys[i].indexOf(prefix) !== 0) continue;
      if (cardAttempted(bag[keys[i]])) return true;
    }
    return false;
  }

  function placementDone(placement, trackId) {
    var row = placement && placement[trackId];
    return !!(row && row.done);
  }

  /**
   * First exam visit only. signedIn is required. Progress on another
   * track does not count. Empty card stubs (state new, no answers) do not count.
   */
  function needsPlacement(opts) {
    opts = opts || {};
    if (!opts.signedIn) return false;
    var trackId = String(opts.trackId || "");
    if (!EXAM_TRACKS[trackId]) return false;
    if (placementDone(opts.placement, trackId)) return false;
    if (Math.floor(Number(opts.unlockedLevel) || 1) > 1) return false;
    if (hasTrackProgress(opts.cards, trackId)) return false;
    return true;
  }

  function normalizePlacement(raw) {
    var out = {};
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
    var ids = Object.keys(EXAM_TRACKS);
    for (var i = 0; i < ids.length; i++) {
      var id = ids[i];
      var row = raw[id];
      if (!row || typeof row !== "object" || !row.done) continue;
      var total = Math.max(0, Math.floor(Number(row.total) || 0));
      var correct = Math.max(0, Math.floor(Number(row.correct) || 0));
      if (total && correct > total) correct = total;
      out[id] = {
        done: true,
        correct: correct,
        total: total,
        set: Math.max(1, Math.floor(Number(row.set) || 1)),
        at: typeof row.at === "string" ? row.at : "",
      };
    }
    return out;
  }

  function takeFromSet(words, levelIdx, want, seenWord, seenGloss) {
    var list = words || [];
    var n = list.length;
    var out = [];
    if (!n || want <= 0) return out;
    var step = Math.max(1, Math.floor(n / want));
    var used = {};
    for (var k = 0; k < want; k++) {
      var start = Math.min(n - 1, k * step);
      var found = null;
      for (var d = 0; d < n; d++) {
        var w = list[(start + d) % n];
        if (!w) continue;
        var surface = String(w.word || "").trim();
        var key = surface.toLowerCase();
        var gloss = String(w.meaning_zh || "").trim();
        if (!key || !gloss || seenWord[key] || seenGloss[gloss] || used[key]) continue;
        found = w;
        used[key] = true;
        seenWord[key] = true;
        seenGloss[gloss] = true;
        break;
      }
      if (!found) break;
      out.push({
        word: found.word,
        meaning_zh: String(found.meaning_zh).trim(),
        pos: found.pos || "",
        example_en: found.example_en || "",
        example_zh: found.example_zh || "",
        levelIdx: levelIdx,
        setNumber: levelIdx + 1,
      });
    }
    return out;
  }

  /** 10 items spread across the first four sets. Stable, no Math.random. */
  function probeItems(sets, count) {
    var goal = Math.max(1, Math.floor(Number(count) || ITEM_COUNT));
    var all = sets || [];
    var windowSize = Math.min(EARLY_SETS, all.length);
    if (!windowSize) return [];
    var base = Math.floor(goal / windowSize);
    var extra = goal % windowSize;
    var seenWord = {};
    var seenGloss = {};
    var picked = [];
    var s;
    for (s = 0; s < windowSize; s++) {
      var want = base + (s < extra ? 1 : 0);
      var batch = takeFromSet(all[s], s, want, seenWord, seenGloss);
      for (var j = 0; j < batch.length; j++) picked.push(batch[j]);
    }
    for (s = 0; s < windowSize && picked.length < goal; s++) {
      var more = takeFromSet(all[s], s, goal - picked.length, seenWord, seenGloss);
      for (var k = 0; k < more.length; k++) picked.push(more[k]);
    }
    return picked.slice(0, goal);
  }

  /**
   * Accuracy → 1-based starting set. Early only.
   *   < 40% → 1
   *   < 70% → 2
   *   < 90% → 3   mid-early
   *   else  → 4   still early, never deep in a 50-set bank
   * Clamped to the track length.
   */
  function startingSet(correct, total, levelCount) {
    var n = Math.max(0, Math.floor(Number(total) || 0));
    var c = n ? Math.max(0, Math.min(n, Math.floor(Number(correct) || 0))) : 0;
    var acc = n ? c / n : 0;
    var set = 1;
    if (acc >= 0.9) set = 4;
    else if (acc >= 0.7) set = 3;
    else if (acc >= 0.4) set = 2;
    var cap = Math.max(1, Math.floor(Number(levelCount) || 1));
    if (set > cap) set = cap;
    return set;
  }

  function itemLabel(index, total) {
    var n = Math.max(1, Math.floor(Number(total) || ITEM_COUNT));
    var i = Math.max(1, Math.min(n, Math.floor(Number(index) || 1)));
    return "摸底 " + i + "/" + n;
  }

  function itemNote(total) {
    var n = Math.max(1, Math.floor(Number(total) || ITEM_COUNT));
    return "先做 " + n + " 道摸底，看英文选中文。做完就进入你的起始组。";
  }

  function resultMessage(opts) {
    opts = opts || {};
    var correct = Math.max(0, Math.floor(Number(opts.correct) || 0));
    var total = Math.max(0, Math.floor(Number(opts.total) || 0));
    var title = opts.setTitle || ("第 " + (opts.set || 1) + " 组");
    return "摸底 " + correct + "/" + total + "。这是你的起始组：" + title + "。先练这一组，几分钟就能感到通关。";
  }

  function starterNote(setTitle) {
    var title = setTitle || "第 1 组";
    return "这是你的起始组：" + title + "。看英文选中文，先把这一组练出通关感。";
  }

  return {
    ITEM_COUNT: ITEM_COUNT,
    EARLY_SETS: EARLY_SETS,
    RESULT_TITLE: RESULT_TITLE,
    ENTER_LABEL: ENTER_LABEL,
    cardAttempted: cardAttempted,
    hasTrackProgress: hasTrackProgress,
    placementDone: placementDone,
    needsPlacement: needsPlacement,
    normalizePlacement: normalizePlacement,
    probeItems: probeItems,
    startingSet: startingSet,
    itemLabel: itemLabel,
    itemNote: itemNote,
    resultMessage: resultMessage,
    starterNote: starterNote,
  };
});

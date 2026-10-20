/* Due-today and wrong-book queues for 聚光单词.
 * Loaded before game.js. Also require()-able from node tests.
 * SM-2 grades stay in srs-rules.js (0 Again, 1 Good, 2 Easy). No FSRS.
 *
 * 今日到期
 *   Opened groups are sets the student can enter: 0 <= levelIdx < unlockedLevel.
 *   A card is included only when it is not pure-new and due <= now
 *   (the same isNewCard / isDue predicates as srs-rules.js).
 *   One queue, earliest due first, across those groups.
 *   Continue preference: dueCount > 0 → "due", else "latest" (the frontier group).
 *
 * 错词本
 *   A lemma enters when a review is quality 0 (wrong answer / Again),
 *   or when cumulative prog.wrong >= 2 and it is not already graduated
 *   at that same wrong count.
 *   Graduation: two consecutive correct ratings inside 错词本 practice
 *   set active=false and snapshot wrongAtGrad. The lemma leaves the book.
 *   A later miss (or a higher wrong count) puts it back with streak 0.
 *   Correct ratings outside 错词本 do not advance the streak.
 *   Inactive rows are kept so a later scan does not re-collect a graduate
 *   whose cumulative wrong is still >= 2.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.QuizMarioQueues = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  var WRONG_BOOK_GRADUATE = 2;

  function lemmaKey(track, word) {
    return String(track || "core") + "::" + String(word || "").trim().toLowerCase();
  }

  function isOpenedGroup(levelIdx, unlockedLevel) {
    var unlocked = Math.max(1, Number(unlockedLevel) || 1);
    return levelIdx >= 0 && levelIdx < unlocked;
  }

  /** Continue opens the due queue when anything is due; otherwise the latest group. */
  function continueTarget(dueCount) {
    return (Number(dueCount) || 0) > 0 ? "due" : "latest";
  }

  /**
   * groups: [{ levelIdx, words: [{ word, ... }] }]
   * cards: save.cards
   * cardKey(levelIdx, word) -> storage key
   * isNewCard(prog), isDue(prog, now) from srs-rules
   */
  function collectDue(opts) {
    opts = opts || {};
    var now = opts.now;
    var unlocked = opts.unlockedLevel;
    var cards = opts.cards || {};
    var groups = opts.groups || [];
    var cardKey = opts.cardKey;
    var isNewCard = opts.isNewCard;
    var isDue = opts.isDue;
    var out = [];
    for (var g = 0; g < groups.length; g++) {
      var group = groups[g];
      if (!group || !isOpenedGroup(group.levelIdx, unlocked)) continue;
      var words = group.words || [];
      for (var i = 0; i < words.length; i++) {
        var w = words[i];
        if (!w || !w.word || typeof cardKey !== "function") continue;
        var key = cardKey(group.levelIdx, w.word);
        var prog = cards[key];
        if (!prog) continue;
        if (typeof isNewCard === "function" && isNewCard(prog)) continue;
        if (typeof isDue !== "function" || !isDue(prog, now)) continue;
        out.push({
          key: key,
          levelIdx: group.levelIdx,
          word: w,
          dueAt: prog.due || 0,
        });
      }
    }
    out.sort(function (a, b) { return (a.dueAt || 0) - (b.dueAt || 0); });
    return out;
  }

  function blankRow(entry) {
    return {
      lemmaKey: entry.lemmaKey,
      lemma: entry.lemma,
      track: entry.track,
      levelIdx: entry.levelIdx,
      cardKey: entry.cardKey,
      active: false,
      streak: 0,
      priority: 0,
      lastMissAt: 0,
      wrongAtGrad: 0,
    };
  }

  function assignPointer(row, entry, prog) {
    row.lemma = entry.lemma;
    row.track = entry.track;
    row.levelIdx = entry.levelIdx;
    row.cardKey = entry.cardKey;
    row.priority = prog && prog.wrong ? prog.wrong : (row.priority || 0);
  }

  /**
   * reason "miss": quality 0 / wrong answer. Always (re)activates, streak 0.
   * reason "scan": cumulative wrong >= 2, without undoing a graduation
   * whose wrongAtGrad is still caught up.
   */
  function touchWrongBook(book, entry, prog, reason) {
    if (!book || !entry || !entry.lemmaKey) return { entered: false, row: null };
    var wrong = prog && prog.wrong ? prog.wrong : 0;
    var row = book[entry.lemmaKey];
    if (reason === "miss") {
      var created = !row;
      if (!row) row = book[entry.lemmaKey] = blankRow(entry);
      var wasInactive = !row.active;
      assignPointer(row, entry, prog);
      row.active = true;
      row.streak = 0;
      row.priority = wrong;
      row.lastMissAt = entry.now || Date.now();
      return { entered: created || wasInactive, row: row };
    }
    if (wrong < 2) return { entered: false, row: row || null };
    if (!row) {
      row = book[entry.lemmaKey] = blankRow(entry);
      assignPointer(row, entry, prog);
      row.active = true;
      row.streak = 0;
      row.priority = wrong;
      row.lastMissAt = entry.now || Date.now();
      return { entered: true, row: row };
    }
    if (row.active) {
      assignPointer(row, entry, prog);
      return { entered: false, row: row };
    }
    if (wrong > (row.wrongAtGrad || 0)) {
      assignPointer(row, entry, prog);
      row.active = true;
      row.streak = 0;
      row.priority = wrong;
      row.lastMissAt = entry.now || Date.now();
      return { entered: true, row: row };
    }
    return { entered: false, row: row };
  }

  function scanCumulative(book, entries) {
    var added = 0;
    var list = entries || [];
    for (var i = 0; i < list.length; i++) {
      var entry = list[i];
      if (!entry) continue;
      var res = touchWrongBook(book, entry, entry.prog, "scan");
      if (res.entered) added++;
    }
    return added;
  }

  /** One correct rating inside 错词本. Two in a row graduates (removes) the lemma. */
  function noteWrongBookCorrect(book, key, wrongNow) {
    var row = book && book[key];
    if (!row || !row.active) {
      return { graduated: false, streak: row ? (row.streak || 0) : 0, row: row || null };
    }
    row.streak = (row.streak || 0) + 1;
    if (row.streak >= WRONG_BOOK_GRADUATE) {
      row.active = false;
      row.streak = 0;
      row.priority = 0;
      row.wrongAtGrad = wrongNow || 0;
      return { graduated: true, streak: 0, row: row };
    }
    return { graduated: false, streak: row.streak, row: row };
  }

  function activeWrongEntries(book, track) {
    var out = [];
    if (!book || typeof book !== "object") return out;
    var keys = Object.keys(book);
    for (var i = 0; i < keys.length; i++) {
      var row = book[keys[i]];
      if (!row || !row.active) continue;
      if (track && row.track !== track) continue;
      out.push(row);
    }
    out.sort(function (a, b) {
      var byWrong = (b.priority || 0) - (a.priority || 0);
      if (byWrong) return byWrong;
      return (a.lastMissAt || 0) - (b.lastMissAt || 0);
    });
    return out;
  }

  return {
    WRONG_BOOK_GRADUATE: WRONG_BOOK_GRADUATE,
    lemmaKey: lemmaKey,
    isOpenedGroup: isOpenedGroup,
    continueTarget: continueTarget,
    collectDue: collectDue,
    touchWrongBook: touchWrongBook,
    scanCumulative: scanCumulative,
    noteWrongBookCorrect: noteWrongBookCorrect,
    activeWrongEntries: activeWrongEntries,
  };
});

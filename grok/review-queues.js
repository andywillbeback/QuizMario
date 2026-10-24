/* Due-today and wrong-book queues for 聚光单词.
 * Loaded before game.js. Also require()-able from node tests.
 * SM-2 grades stay in srs-rules.js (0 Again, 1 Good, 2 Easy). No FSRS.
 *
 * 今日到期
 *   Opened groups are sets the student can enter: 0 <= levelIdx < unlockedLevel.
 *   A card is included only when it is not pure-new and due <= now
 *   (the same isNewCard / isDue predicates as srs-rules.js).
 *   One queue, earliest due first, across those groups.
 *
 * 今日必练
 *   One practice queue: due cards first, then active 错词本 rows that are
 *   not already in that due list (same card key is kept once, in the due slot).
 *   Storage stays split: SM-2 due is still collectDue; the book is still
 *   touchWrongBook / noteWrongBookCorrect.
 *   Home primacy: count >= 1 and not started today → "primary";
 *   count >= 1 and started today → "secondary"; count 0 → "hidden".
 *   Dismissing the daily soft gate does not count as starting.
 *   The soft gate shows once per calendar day for a signed-in student
 *   while the combined count is at least 1 and they have neither
 *   dismissed nor started 今日必练 that day.
 *
 * 继续闯关
 *   Always "latest" (the frontier group, English → meaning). Due and
 *   wrong-book review belong to 今日必练, not to continue.
 *
 * 错词本
 *   A lemma enters when a review is quality 0 (wrong answer / Again),
 *   or when cumulative prog.wrong >= 2 and it is not already graduated
 *   at that same wrong count.
 *   Graduation: two consecutive correct ratings while that lemma is practiced
 *   inside 错词本 or 今日必练 (the caller decides). That sets active=false
 *   and snapshots wrongAtGrad. The lemma leaves the book.
 *   A later miss (or a higher wrong count) puts it back with streak 0.
 *   Correct ratings in 继续闯关 do not advance the streak.
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
    var api = typeof globalThis !== "undefined" ? globalThis.QuizMarioSense : null;
    if (api && typeof api.lemmaKey === "function") return api.lemmaKey(track, word);
    return String(track || "core") + "::" + String(word || "").trim().toLowerCase();
  }

  function isOpenedGroup(levelIdx, unlockedLevel) {
    var unlocked = Math.max(1, Number(unlockedLevel) || 1);
    return levelIdx >= 0 && levelIdx < unlocked;
  }

  /** 继续闯关 is the frontier study group. dueCount is ignored; review is 今日必练. */
  function continueTarget(_dueCount) {
    return "latest";
  }

  function itemId(item) {
    if (!item || typeof item !== "object") return "";
    if (item.key) return String(item.key);
    if (item.cardKey) return String(item.cardKey);
    return "";
  }

  function copyItem(item) {
    var copy = {};
    var keys = Object.keys(item);
    for (var i = 0; i < keys.length; i++) copy[keys[i]] = item[keys[i]];
    return copy;
  }

  /**
   * Due cards first (caller order, earliest due already sorted), then
   * wrong-book rows whose card is not already in the due list.
   * A shared card stays in the due position and is marked fromWrong too.
   */
  function mergePracticeQueue(dueItems, wrongItems) {
    var due = dueItems || [];
    var wrong = wrongItems || [];
    var out = [];
    var indexById = {};
    var i;
    for (i = 0; i < due.length; i++) {
      var item = due[i];
      var id = itemId(item);
      if (!item || !id || indexById[id] != null) continue;
      var copy = copyItem(item);
      copy.fromDue = true;
      copy.fromWrong = false;
      indexById[id] = out.length;
      out.push(copy);
    }
    for (i = 0; i < wrong.length; i++) {
      var row = wrong[i];
      var wid = itemId(row);
      if (!row || !wid) continue;
      if (indexById[wid] != null) {
        out[indexById[wid]].fromWrong = true;
        continue;
      }
      var wcopy = copyItem(row);
      wcopy.fromDue = false;
      wcopy.fromWrong = true;
      indexById[wid] = out.length;
      out.push(wcopy);
    }
    return out;
  }

  function combinedCount(dueItems, wrongItems) {
    return mergePracticeQueue(dueItems, wrongItems).length;
  }

  /** Today's gate row. A different calendar day clears started and dismissed. */
  function freshDailyGate(record, day) {
    var row = record && typeof record === "object" ? record : {};
    var today = String(day || "");
    if (row.day !== today) {
      return { day: today, started: false, dismissed: false };
    }
    return {
      day: today,
      started: !!row.started,
      dismissed: !!row.dismissed,
    };
  }

  function markDailyGate(record, day, action) {
    var next = freshDailyGate(record, day);
    if (action === "start") next.started = true;
    else if (action === "dismiss") next.dismissed = true;
    return next;
  }

  /**
   * Soft gate: signed in, combined count >= 1, and this calendar day has
   * neither a dismiss (稍后) nor a start (开始 / 今日必练). Not a redirect.
   */
  function shouldShowSoftGate(opts) {
    opts = opts || {};
    if (!opts.signedIn) return false;
    if ((Number(opts.count) || 0) < 1) return false;
    var row = freshDailyGate(opts.record, opts.day);
    if (row.started || row.dismissed) return false;
    return true;
  }

  /**
   * primary: 今日必练 is the first, more prominent home button.
   * secondary: still listed, after the student has started the queue today.
   * hidden: nothing to review. Dismiss alone does not demote the button.
   */
  function homePrimacy(opts) {
    opts = opts || {};
    var count = Number(opts.count) || 0;
    if (count < 1) return "hidden";
    var row = freshDailyGate(opts.record, opts.day);
    if (row.started) return "secondary";
    return "primary";
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
    itemId: itemId,
    mergePracticeQueue: mergePracticeQueue,
    combinedCount: combinedCount,
    freshDailyGate: freshDailyGate,
    markDailyGate: markDailyGate,
    shouldShowSoftGate: shouldShowSoftGate,
    homePrimacy: homePrimacy,
    collectDue: collectDue,
    touchWrongBook: touchWrongBook,
    scanCumulative: scanCumulative,
    noteWrongBookCorrect: noteWrongBookCorrect,
    activeWrongEntries: activeWrongEntries,
  };
});

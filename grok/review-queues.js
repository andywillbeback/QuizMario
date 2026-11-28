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
 *   Wrong-book intake is yellow and red only (2 and 3+ misses). Green and
 *   uncolored book rows stay out. Uncolored SM-2 due cards (0 misses) stay
 *   on the due path. A card marked 待观察 today is left out even if SM-2
 *   due is still today; a later calendar day can take that due card again.
 *   Storage stays split: SM-2 due is still collectDue; the book is still
 *   touchWrongBook / noteWrongBookCorrect.
 *   Home primacy: count >= 1 and not started today → "primary";
 *   count >= 1 and started today → "secondary"; count 0 → "hidden".
 *   Dismissing the daily soft gate does not count as starting.
 *   The soft gate shows once per calendar day for a signed-in student
 *   while the combined count is at least 1 and they have neither
 *   dismissed nor started 今日必练 that day.
 *   A real clear is the round that ends on 「今日必练清空了」 because the
 *   rebuilt queue is empty. That sets cleared on today's mustPractice
 *   row. Until the next calendar day the queue admits nothing else:
 *   newly due cards, red/yellow wrong-book rows, ALS suggestions, and
 *   same-day continuing streaks stay out, so home and the soft gate
 *   stay hidden. A leftover round (「这轮今日必练练完了」) does not set
 *   cleared, and an empty queue before any clear does not either, so
 *   the first due card or miss of the day can still enter. The flag is
 *   stored only when true. The wrong book and SM-2 scheduling are
 *   unchanged; a miss after the clear is kept and can enter tomorrow.
 *
 * 继续闯关
 *   Always "latest" (the frontier group, English → meaning). Due and
 *   wrong-book review belong to 今日必练, not to continue.
 *
 * 错词本
 *   A lemma enters when a review is quality 0 (wrong answer / Again),
 *   or when cumulative prog.wrong >= 2 and it is not already graduated
 *   at that same wrong count.
 *   Graduation from today's intensive queue: three consecutive correct
 *   ratings while that lemma is practiced inside 错词本 or 今日必练 (the
 *   caller decides). That sets active=false, watching=true, and snapshots
 *   wrongAtGrad. The row stays in the book as 待观察. It is not deleted.
 *   A later miss (or a higher wrong count) clears watching and puts it
 *   back with streak 0.
 *   Correct ratings in 继续闯关 do not advance the streak.
 *   Inactive rows are kept so a later scan does not re-collect a graduate
 *   whose cumulative wrong is still >= 2.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.QuizMarioQueues = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  var WRONG_BOOK_GRADUATE = 3;

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
  function mergePracticeQueue(dueItems, wrongItems, alsItems) {
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
    for (const item of alsItems || []) {
      const id = itemId(item);
      if (!id || !Number.isFinite(item.alsReviewAt)) continue;
      if (indexById[id] == null) {
        indexById[id] = out.length;
        out.push({ ...copyItem(item), fromDue: false, fromWrong: false });
      }
      const queued = out[indexById[id]];
      queued.fromAls = true;
      queued.alsReviewAt = Math.max(queued.alsReviewAt || 0, item.alsReviewAt);
    }
    return out;
  }

  // Review the latest revision of each attempt. Separate attempts may still
  // independently nominate the same card and are merged in the practice queue.
  function alsReviewNominations(rows, owner) {
    const latest = new Map();
    for (const row of rows || []) {
      const p = row.payload;
      if (!owner || row.learner_id !== owner || row.user_id !== owner ||
          !p || !p.attempt_id || !Number.isSafeInteger(p.revision) ||
          typeof p.lexical_review !== "boolean") continue;
      const prior = latest.get(p.attempt_id);
      if (!prior || p.revision > prior.payload.revision) latest.set(p.attempt_id, row);
    }
    return [...latest.values()].filter(row => {
      const p = row.payload;
      return p.lexical_review && p.status === "verified" && p.passed === false &&
        ["Rebuild", "Vary", "Transfer"].includes(p.stage) &&
        typeof p.review_gloss_zh === "string" && p.review_gloss_zh.trim() &&
        Number.isFinite(Date.parse(row.created_at));
    });
  }

  function alsReviewMatches(row, card) {
    const normalize = text => String(text || "").normalize("NFC").trim().toLowerCase();
    const gloss = text => normalize(text).replace(/\s+/gu, "").replace(/[。；;]+$/u, "");
    return row.payload.track === card.track && normalize(row.headword) === normalize(card.word) &&
      gloss(row.payload.review_gloss_zh) !== "" &&
      gloss(row.payload.review_gloss_zh) === gloss(card.meaning_zh) &&
      (!row.payload.sense_id || [
        card.sense, card.key, card.track + "::" + card.sense,
        normalize(card.word) + ".." + gloss(card.meaning_zh),
        normalize(card.word) + "." + normalize(card.pos).replace(/^\.|\.$/gu, "") + "." + gloss(card.meaning_zh),
      ].some(id => gloss(id) === gloss(row.payload.sense_id)));
  }

  function combinedCount(dueItems, wrongItems) {
    return mergePracticeQueue(dueItems, wrongItems).length;
  }

  /**
   * Today's gate row. A different calendar day drops started, dismissed,
   * and the same-day clear. cleared is omitted unless it is true, so a
   * save that never cleared does not write false over another device.
   */
  function freshDailyGate(record, day) {
    var row = record && typeof record === "object" ? record : {};
    var today = String(day || "");
    var same = row.day === today;
    var next = {
      day: today,
      started: same && !!row.started,
      dismissed: same && !!row.dismissed,
    };
    if (same && row.cleared) next.cleared = true;
    return next;
  }

  function markDailyGate(record, day, action) {
    var next = freshDailyGate(record, day);
    if (action === "start") next.started = true;
    else if (action === "dismiss") next.dismissed = true;
    return next;
  }

  /**
   * End of one 今日必练 round. remaining is the rebuilt queue length.
   * 0 is 「今日必练清空了」 and locks intake for this calendar day.
   * A positive remainder is 「这轮今日必练练完了」 and does not lock.
   * Call this only after a round. An empty queue before any round is not a clear.
   */
  function noteMustRoundEnd(record, day, remaining) {
    var next = freshDailyGate(record, day);
    var cleared = remaining === 0;
    if (cleared) next.cleared = true;
    return { record: next, cleared: cleared };
  }

  /**
   * Soft gate: signed in, combined count >= 1, and this calendar day has
   * neither a dismiss (稍后) nor a start (开始 / 今日必练). A same-day
   * clear hides it too. Not a redirect.
   */
  function shouldShowSoftGate(opts) {
    opts = opts || {};
    if (!opts.signedIn) return false;
    if ((Number(opts.count) || 0) < 1) return false;
    var row = freshDailyGate(opts.record, opts.day);
    if (row.cleared || row.started || row.dismissed) return false;
    return true;
  }

  /**
   * primary: 今日必练 is the first, more prominent home button.
   * secondary: still listed, after the student has started the queue today.
   * hidden: nothing to review, or today was already cleared. Dismiss alone does not demote the button.
   */
  function homePrimacy(opts) {
    opts = opts || {};
    var row = freshDailyGate(opts.record, opts.day);
    if (row.cleared) return "hidden";
    var count = Number(opts.count) || 0;
    if (count < 1) return "hidden";
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
      if (row.watching) {
        row.watching = false;
        row.watchedDay = "";
      }
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
      if (row.watching) {
        row.watching = false;
        row.watchedDay = "";
      }
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

  /**
   * Miss colors match QuizMarioNotebook.missBand: 1 green, 2 yellow, 3+ red.
   * 0 and non-counts stay uncolored.
   */
  function missTone(count) {
    var n = Number(count);
    if (!isFinite(n) || n < 1) return "";
    n = Math.floor(n);
    if (n === 1) return "green";
    if (n === 2) return "yellow";
    return "red";
  }

  function bookRowFor(book, item) {
    if (!book || !item) return null;
    var id = itemId(item);
    var keys = Object.keys(book);
    var i;
    for (i = 0; i < keys.length; i++) {
      var row = book[keys[i]];
      if (!row) continue;
      if (id && (row.cardKey === id || row.lemmaKey === id || keys[i] === id)) return row;
      if (item.lemmaKey && (row.lemmaKey === item.lemmaKey || keys[i] === item.lemmaKey)) return row;
      if (item.cardKey && row.cardKey === item.cardKey) return row;
    }
    return null;
  }

  function heldFromMustToday(row, day) {
    if (!row || !row.watching) return false;
    if (!day) return false;
    return String(row.watchedDay || "") === String(day);
  }

  /** Yellow and red active rows only. 待观察 and green stay out of the book intake. */
  function includeInMustWrong(row, tone) {
    if (!row || !row.active || row.watching) return false;
    return tone === "yellow" || tone === "red";
  }

  function toneFor(item, opts) {
    opts = opts || {};
    if (typeof opts.tone === "function") return String(opts.tone(item) || "");
    if (typeof opts.missCount === "function") return missTone(opts.missCount(item));
    return "";
  }

  function normalizeMustDayHold(raw) {
    var out = {};
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
    var keys = Object.keys(raw);
    for (var i = 0; i < keys.length; i++) {
      var row = raw[keys[i]];
      if (!row || typeof row !== "object") continue;
      var day = String(row.day || "");
      var streak = Math.max(0, Math.floor(Number(row.streak) || 0));
      var held = !!row.held && !!day;
      if (!held && streak <= 0) continue;
      out[String(keys[i])] = { streak: streak, day: day, held: held };
    }
    return out;
  }

  /** Due-only 今日必练 streak. This is not a 错词本 row and does not touch SRS. */
  function noteMustDayCorrect(hold, cardKey, day) {
    var book = normalizeMustDayHold(hold);
    var key = String(cardKey || "");
    day = String(day || "");
    if (!key || !day) return { hold: book, held: false, streak: 0 };
    var row = book[key];
    if (row && row.held && row.day === day) return { hold: book, held: true, streak: row.streak };
    var streak = row && row.day === day && !row.held ? (row.streak || 0) + 1 : 1;
    var held = streak >= WRONG_BOOK_GRADUATE;
    book[key] = { streak: streak, day: day, held: held };
    return { hold: book, held: held, streak: streak };
  }

  /** A miss before the third correct restarts the count. A same-day hold stays. */
  function noteMustDayMiss(hold, cardKey, day) {
    var book = normalizeMustDayHold(hold);
    var key = String(cardKey || "");
    day = String(day || "");
    var row = key ? book[key] : null;
    if (!row) return { hold: book, held: false, streak: 0 };
    if (row.held && row.day === day) return { hold: book, held: true, streak: row.streak };
    delete book[key];
    return { hold: book, held: false, streak: 0 };
  }

  function mustDayHeld(hold, cardKey, day) {
    var book = normalizeMustDayHold(hold);
    var row = book[String(cardKey || "")];
    return !!(row && row.held && row.day === String(day || ""));
  }

  /** Same-day streak of 1 or 2. These cards stay in 今日必练 even when SM-2 due is later. */
  function unheldMustStreak(hold, cardKey, day) {
    var book = normalizeMustDayHold(hold);
    var row = book[String(cardKey || "")];
    if (!row || row.held || row.day !== String(day || "")) return 0;
    var streak = row.streak || 0;
    if (streak < 1 || streak >= WRONG_BOOK_GRADUATE) return 0;
    return streak;
  }

  /**
   * 今日必练 membership. Due cards keep their order. Green is left out of
   * every slot, including SM-2 due. Uncolored (0-miss) due cards stay.
   * Wrong-book rows must be yellow or red. A 待观察 row or a due-only
   * same-day hold is omitted from every slot, including a short SM-2 due.
   * opts.continuing re-adds same-day unheld streaks of 1 or 2 that are no
   * longer SM-2 due. They leave only when held becomes true at 3 correct.
   * opts.record is today's mustPractice row. After a real clear that row
   * keeps every intake path empty until the next calendar day.
   */
  function buildMustQueue(dueItems, wrongItems, alsItems, opts) {
    opts = opts || {};
    var day = opts.day == null ? "" : String(opts.day);
    if (freshDailyGate(opts.record, day).cleared) return [];
    var book = opts.book || {};
    var due = [];
    var wrong = [];
    var als = [];
    var i;
    function blocked(item) {
      if (!item) return true;
      if (heldFromMustToday(bookRowFor(book, item), day)) return true;
      if (mustDayHeld(opts.hold, itemId(item), day)) return true;
      if (toneFor(item, opts) === "green") return true;
      return false;
    }
    var list = dueItems || [];
    for (i = 0; i < list.length; i++) {
      var dueItem = list[i];
      if (blocked(dueItem)) continue;
      due.push(dueItem);
    }
    list = wrongItems || [];
    for (i = 0; i < list.length; i++) {
      var wrongItem = list[i];
      if (blocked(wrongItem)) continue;
      var wrongRow = bookRowFor(book, wrongItem) || wrongItem;
      if (!includeInMustWrong(wrongRow, toneFor(wrongItem, opts))) continue;
      wrong.push(wrongItem);
    }
    list = alsItems || [];
    for (i = 0; i < list.length; i++) {
      var alsItem = list[i];
      if (blocked(alsItem)) continue;
      als.push(alsItem);
    }
    var merged = mergePracticeQueue(due, wrong, als);
    var seen = {};
    for (i = 0; i < merged.length; i++) seen[itemId(merged[i])] = true;
    list = opts.continuing || [];
    for (i = 0; i < list.length; i++) {
      var extra = list[i];
      var extraId = itemId(extra);
      if (!extra || !extraId || seen[extraId] || blocked(extra)) continue;
      if (!unheldMustStreak(opts.hold, extraId, day)) continue;
      seen[extraId] = true;
      var kept = copyItem(extra);
      kept.fromDue = false;
      kept.fromWrong = !!kept.fromWrong;
      kept.fromContinuing = true;
      merged.push(kept);
    }
    return merged;
  }

  /** One correct rating inside 错词本 or 今日必练. Three in a row leaves today's queue and keeps the row. */
  function noteWrongBookCorrect(book, key, wrongNow, opts) {
    opts = opts || {};
    var row = book && book[key];
    if (!row || !row.active) {
      return { graduated: false, watching: !!(row && row.watching), streak: row ? (row.streak || 0) : 0, row: row || null };
    }
    row.streak = (row.streak || 0) + 1;
    if (row.streak >= WRONG_BOOK_GRADUATE) {
      row.active = false;
      row.watching = true;
      if (opts.day) row.watchedDay = String(opts.day);
      row.streak = 0;
      row.priority = 0;
      row.wrongAtGrad = wrongNow || 0;
      return { graduated: true, watching: true, streak: 0, row: row };
    }
    return { graduated: false, watching: false, streak: row.streak, row: row };
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
    alsReviewNominations: alsReviewNominations,
    alsReviewMatches: alsReviewMatches,
    combinedCount: combinedCount,
    freshDailyGate: freshDailyGate,
    markDailyGate: markDailyGate,
    noteMustRoundEnd: noteMustRoundEnd,
    shouldShowSoftGate: shouldShowSoftGate,
    homePrimacy: homePrimacy,
    collectDue: collectDue,
    touchWrongBook: touchWrongBook,
    scanCumulative: scanCumulative,
    noteWrongBookCorrect: noteWrongBookCorrect,
    activeWrongEntries: activeWrongEntries,
    missTone: missTone,
    includeInMustWrong: includeInMustWrong,
    buildMustQueue: buildMustQueue,
    normalizeMustDayHold: normalizeMustDayHold,
    noteMustDayCorrect: noteMustDayCorrect,
    noteMustDayMiss: noteMustDayMiss,
    mustDayHeld: mustDayHeld,
    unheldMustStreak: unheldMustStreak,
  };
});

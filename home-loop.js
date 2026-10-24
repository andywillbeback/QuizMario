/* Signed-in home loop strip and the 今日必练 clear-screen next step.
 * Loaded before game.js. Also require()-able from node tests.
 *
 * ALS 补了 X / 回流词 Y is not computable here. A pulled source=als
 * sense_return clears deep-train debt only. It is not that pair.
 * Do not substitute the wrong book, the due queue, or the 今日必练
 * count for X/Y.
 *
 * TODO: when an event_type mapping for those two counts is known,
 * alsReturnCounts() should return { filled, returned } and
 * homeLoopStrip will switch to 「ALS 补了 X / 回流词 Y」. Until then
 * it stays null and the strip says 「薄弱点 → 今日必练」.
 *
 * Deep-train debt is a different number. An active 错词本 sense owes
 * ALS deep practice (Repair → Rebuild → Vary → Transfer) until a real
 * source=als sense_return qualifies that sense_id. The return counts
 * only when its created_at is newer than that row's last miss. A later
 * miss clears alsDeepDone, and the stored return does not close the
 * debt again. When ALS payload marks qualified_for_sense_return=false
 * or independent=false (or recognition-only), the return does not close
 * debt. That debt is not alsReturnCounts, and it is not the
 * 今日必练 count. The signed-in home
 * shows 「N 个错词待 ALS 深练」 whenever the debt is above zero, including
 * while 今日必练 still has cards. This slice does not auto-open ALS
 * after each miss.
 *
 * There is still no public ALS site. ALS_GRAMMAR_HREF opens the
 * Mac-local Streamlit practice app at http://127.0.0.1:8501/.
 * The link only works when ALS is already running on the student's Mac.
 * The deep-train CTA uses that same origin and adds both ALS contracts:
 * qm_deep=1 plus repeated sense_id groups, and deep_train=1 with
 * sense_ids as one comma-separated list. 「去 ALS 修语法」 stays the bare side door.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.QuizMarioHomeLoop = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  var ALS_GRAMMAR_HREF = "http://127.0.0.1:8501/";

  /** Always null until real ALS rows can be mapped. See the file comment. */
  function alsReturnCounts(events) {
    var list = events || [];
    for (var i = 0; i < list.length; i++) {
      var ev = list[i];
      if (ev && ev.source === "als") {
        // Present, but the event_type → (filled, returned) map is not defined.
        // Counting them would invent X/Y.
        return null;
      }
    }
    return null;
  }

  function readyAlsCounts(als) {
    if (!als || typeof als !== "object") return null;
    if (typeof als.filled !== "number" || !isFinite(als.filled)) return null;
    if (typeof als.returned !== "number" || !isFinite(als.returned)) return null;
    return {
      filled: Math.max(0, Math.floor(als.filled)),
      returned: Math.max(0, Math.floor(als.returned)),
    };
  }

  /** Same provisional key as learner-events.js: lemma.pos.gloss, dot stripped from POS. */
  function posToken(pos) {
    var p = String(pos || "").trim().toLowerCase();
    if (p.charAt(p.length - 1) === ".") p = p.slice(0, -1);
    return p;
  }

  function provisionalSenseId(lemma, pos, gloss) {
    var l = String(lemma || "").trim().toLowerCase();
    var p = posToken(pos);
    var g = String(gloss || "").trim().replace(/\s+/g, " ");
    if (!l) return "";
    if (p && g) return l + "." + p + "." + g;
    if (!p && g) return l + ".." + g;
    if (p && !g) return l + "." + p;
    return l;
  }

  function isAlsSenseReturn(ev) {
    if (!ev || ev.source !== "als") return false;
    var type = String(ev.event_type || "");
    return type === "sense_return" || type === "vocab.sense_return" || type === "als.sense_return";
  }

  function eventSenseId(ev) {
    var id = ev.sense_id || (ev.payload && ev.payload.sense_id) || "";
    return String(id).trim();
  }

  function returnTimeMs(ev) {
    var raw = ev.created_at || (ev.payload && ev.payload.created_at) || "";
    var t = Date.parse(String(raw));
    return isFinite(t) ? t : 0;
  }

  function payloadField(ev, key) {
    if (!ev) return undefined;
    if (ev[key] !== undefined) return ev[key];
    if (ev.payload && ev.payload[key] !== undefined) return ev.payload[key];
    return undefined;
  }

  /**
   * Q5 strict ALS回流验收 — honor ALS emit contract fields when present.
   * Legacy returns without these keys still qualify (PR #41 path).
   * Does not invent new required fields; only rejects explicit fails:
   * qualified_for_sense_return=false, independent=false, recognition-only.
   * Miss-clock (returnClearsMiss / lastMissAt) stays unchanged.
   */
  function returnEvidenceOk(ev) {
    if (!ev) return false;
    var qualified = payloadField(ev, "qualified_for_sense_return");
    if (qualified === false) return false;
    var independent = payloadField(ev, "independent");
    if (independent === false) return false;
    var dir = payloadField(ev, "task_direction");
    if (dir === "recognition") return false;
    var kind = payloadField(ev, "evidence_kind");
    if (kind === "recognition" || kind === "mc_recognition") return false;
    return true;
  }

  function qualifiesAlsReturn(ev) {
    return isAlsSenseReturn(ev) && returnEvidenceOk(ev);
  }

  /**
   * source=als sense_return qualifies one sense. Unknown ALS rows,
   * including session summaries, do not. QuizMario signals never do.
   * This does not feed alsReturnCounts. Callers compare the time
   * against the row's last miss before closing debt.
   */
  function alsDeepQualifiedIds(events) {
    var ids = [];
    var seen = {};
    var list = events || [];
    for (var i = 0; i < list.length; i++) {
      var ev = list[i];
      if (!qualifiesAlsReturn(ev)) continue;
      var id = eventSenseId(ev);
      if (!id || seen[id]) continue;
      seen[id] = true;
      ids.push(id);
    }
    return ids;
  }

  /** sense_id → newest matching return, in ms. 0 means that return has no created_at. */
  function latestAlsReturnMs(events) {
    var best = {};
    var list = events || [];
    for (var i = 0; i < list.length; i++) {
      var ev = list[i];
      if (!qualifiesAlsReturn(ev)) continue;
      var id = eventSenseId(ev);
      if (!id) continue;
      var t = returnTimeMs(ev);
      if (best[id] == null || t > best[id]) best[id] = t;
    }
    return best;
  }

  /**
   * No miss clock: any matching return still qualifies.
   * A known last miss: only a strictly newer return closes the debt.
   * An undated return does not override that miss.
   */
  function returnClearsMiss(returnMs, lastMissAt) {
    var miss = Number(lastMissAt);
    if (!isFinite(miss) || miss <= 0) return true;
    return returnMs > miss;
  }

  /**
   * Sets alsDeepDone on wrong-book rows whose sense_id matches a
   * source=als sense_return newer than that row's last miss.
   * Recognition graduation does not call this.
   * Mutates the book map. Returns whether any row changed.
   */
  function markDeepQualified(book, events) {
    var best = latestAlsReturnMs(events);
    var ids = Object.keys(best);
    if (!ids.length || !book) return false;
    var keys = Object.keys(book);
    var changed = false;
    for (var i = 0; i < keys.length; i++) {
      var row = book[keys[i]];
      if (!row || row.alsDeepDone === true) continue;
      var sense = String(row.sense_id || "").trim() || provisionalSenseId(row.lemma, row.pos, row.gloss_zh);
      if (!sense || best[sense] == null) continue;
      if (!returnClearsMiss(best[sense], row.lastMissAt)) continue;
      row.alsDeepDone = true;
      changed = true;
    }
    return changed;
  }

  function normalizeDebtItem(raw) {
    if (!raw || typeof raw !== "object") return null;
    if (raw.active === false) return null;
    var lemma = String(raw.lemma || raw.headword || raw.word || "").trim().toLowerCase();
    if (!lemma) return null;
    var gloss = String(raw.gloss_zh != null ? raw.gloss_zh : (raw.meaning_zh || "")).trim();
    var pos = String(raw.pos || "").trim();
    var track = String(raw.track || "").trim();
    var sense = String(raw.sense_id || "").trim() || provisionalSenseId(lemma, pos, gloss);
    if (!sense) return null;
    return {
      active: true,
      alsDeepDone: raw.alsDeepDone === true,
      lemma: lemma,
      headword: lemma,
      gloss_zh: gloss,
      pos: pos,
      track: track,
      sense_id: sense,
      cardKey: raw.cardKey || raw.key || "",
      lemmaKey: raw.lemmaKey || "",
      lastMissAt: isFinite(Number(raw.lastMissAt)) ? Number(raw.lastMissAt) : 0,
    };
  }

  /**
   * Active 错词本 senses that still owe ALS deep practice.
   * Inactive rows and senses already marked alsDeepDone are out.
   * A matching source=als sense_return drops the sense only when that
   * return is newer than the item's last miss. One sense_id counts once.
   */
  function deepTrainDebt(items, events) {
    var best = latestAlsReturnMs(events);
    var list = items || [];
    var out = [];
    var seen = {};
    for (var i = 0; i < list.length; i++) {
      var item = normalizeDebtItem(list[i]);
      if (!item || item.alsDeepDone || seen[item.sense_id]) continue;
      if (best[item.sense_id] != null && returnClearsMiss(best[item.sense_id], item.lastMissAt)) continue;
      seen[item.sense_id] = true;
      out.push(item);
    }
    return out;
  }

  function alsDeepHref(items, events) {
    var list = deepTrainDebt(items, events);
    if (!list.length) return ALS_GRAMMAR_HREF;
    var ids = [];
    var seen = {};
    for (var n = 0; n < list.length; n++) {
      var id = list[n].sense_id;
      if (!id || seen[id]) continue;
      seen[id] = true;
      ids.push(id);
    }
    var parts = [
      "qm_deep=1",
      "run_purpose=als_deep_train",
      "deep_train=1",
      "sense_ids=" + encodeURIComponent(ids.join(",")),
    ];
    for (var i = 0; i < list.length; i++) {
      var it = list[i];
      parts.push("sense_id=" + encodeURIComponent(it.sense_id));
      parts.push("headword=" + encodeURIComponent(it.headword));
      parts.push("gloss_zh=" + encodeURIComponent(it.gloss_zh));
      parts.push("track=" + encodeURIComponent(it.track));
    }
    return ALS_GRAMMAR_HREF + "?" + parts.join("&");
  }

  function handoffEventId(sense, index, now) {
    var seed = String(sense || "") + "|" + index + "|" + String(now || "");
    var h = 2166136261;
    for (var i = 0; i < seed.length; i++) {
      h ^= seed.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    var hex = (h >>> 0).toString(16);
    while (hex.length < 8) hex = "0" + hex;
    var tail = hex + hex;
    return "qmdeep00-0000-4000-8000-" + tail.slice(0, 12);
  }

  /**
   * JSONL ALS can drop in data/learner_events_inbox and ingest.
   * Rows reuse vocab.wrong_book_add and the L2 fields (sense_id,
   * headword, gloss_zh, track). run_purpose als_deep_train marks the
   * handoff. This file is not shown on the student home.
   */
  function deepTrainHandoff(items, opts) {
    opts = opts || {};
    var list = deepTrainDebt(items, opts.events);
    var now = opts.now ? new Date(opts.now) : new Date();
    var created = isNaN(now.getTime()) ? new Date().toISOString() : now.toISOString();
    var learner = opts.learnerId ? String(opts.learnerId) : "";
    var lines = [];
    for (var i = 0; i < list.length; i++) {
      var it = list[i];
      var payload = {
        headword: it.headword,
        track: it.track,
        gloss_zh: it.gloss_zh,
        sense_id: it.sense_id,
        lemma: it.lemma,
        schema_version: 2,
        purpose: "als_deep_train",
      };
      if (it.pos) payload.pos = it.pos;
      if (learner) {
        payload.canonical_learner_id = learner;
        payload.source_user_id = learner;
      }
      var row = {
        event_id: handoffEventId(it.sense_id, i, created),
        source: "quizmario",
        event_type: "vocab.wrong_book_add",
        created_at: created,
        schema_version: 2,
        source_event_id: handoffEventId(it.sense_id, i, created),
        sense_id: it.sense_id,
        lemma: it.lemma,
        headword: it.headword,
        run_purpose: "als_deep_train",
        payload: payload,
      };
      if (it.pos) row.pos = it.pos;
      if (learner) {
        row.learner_id = learner;
        row.user_id = learner;
        row.canonical_learner_id = learner;
        row.source_user_id = learner;
      }
      lines.push(JSON.stringify(row));
    }
    return {
      filename: "quizmario-als-deep-train.jsonl",
      jsonl: lines.length ? lines.join("\n") + "\n" : "",
      count: list.length,
      items: list,
    };
  }

  function deepPrimaryLabel(n) {
    if (n === 1) return "去 ALS 深练这个错词";
    return "去 ALS 深练这 " + n + " 个错词";
  }

  /**
   * Home CTA for outstanding deep-train debt.
   * Visible for a signed-in student on the home screen when debt > 0.
   * mustCount does not hide it. 今日必练 can still be non-empty.
   */
  function homeDeepTrain(opts) {
    opts = opts || {};
    var mustCount = wholeCount(opts.mustCount);
    var items = deepTrainDebt(opts.items, opts.events);
    var n = items.length;
    var href = n ? alsDeepHref(items) : ALS_GRAMMAR_HREF;
    var handoff = deepTrainHandoff(items, {
      events: null,
      learnerId: opts.learnerId,
      now: opts.now,
    });
    var hidden = {
      visible: false,
      count: 0,
      text: "",
      detail: "",
      primaryLabel: "",
      saveLabel: "",
      href: ALS_GRAMMAR_HREF,
      handoff: handoff,
      mustCount: mustCount,
      items: [],
    };
    if (!opts.signedIn || !opts.onHome || n < 1) return hidden;
    var detail = "把这些错词的句子在 ALS 里练透。请先在这台电脑上打开 ALS。";
    if (mustCount > 0) detail = "今日必练还没做完，也可以先去。" + detail;
    return {
      visible: true,
      count: n,
      text: n + " 个错词待 ALS 深练",
      detail: detail,
      primaryLabel: deepPrimaryLabel(n),
      saveLabel: "ALS 没打开？先保存这批错词",
      href: href,
      handoff: handoff,
      mustCount: mustCount,
      items: items,
    };
  }

  /**
   * Visible only on the signed-in student home.
   * action "must" opens 今日必练; "continue" opens the frontier set.
   */
  function homeLoopStrip(opts) {
    opts = opts || {};
    var count = Math.max(0, Math.floor(Number(opts.mustCount) || 0));
    var visible = !!(opts.signedIn && opts.onHome);
    var action = count > 0 ? "must" : "continue";
    if (!visible) {
      return {
        visible: false,
        mode: "hidden",
        text: "",
        detail: "",
        action: action,
        count: count,
      };
    }
    var als = readyAlsCounts(opts.als);
    var detail = count > 0
      ? ("今日必练 " + count + " 道")
      : "今日必练 0 道，继续闯关";
    if (als) {
      return {
        visible: true,
        mode: "als",
        text: "ALS 补了 " + als.filled + " / 回流词 " + als.returned,
        detail: detail,
        action: action,
        count: count,
      };
    }
    return {
      visible: true,
      mode: "weak",
      text: "薄弱点 → 今日必练",
      detail: detail,
      action: action,
      count: count,
    };
  }

  /** 1-based frontier group: the set 继续闯关 opens for this track. */
  function frontierGroup(unlockedLevel, levelCount) {
    var n = Math.max(1, Math.floor(Number(unlockedLevel) || 1));
    var total = Math.floor(Number(levelCount) || 0);
    if (total >= 1 && n > total) n = total;
    return n;
  }

  function wholeCount(value) {
    var n = Math.floor(Number(value));
    if (!isFinite(n) || n < 0) return 0;
    return n;
  }

  /**
   * Next step after a finished queue. The frontier CTA and the ALS
   * grammar link are relevant only when sessionKind is "must"
   * (今日必练 clear). Other clears keep their own buttons.
   * opts.left is today's must queue (due + wrong book), not how many
   * cards this sitting still had on screen. 「练完了」 is only for an
   * empty queue. A round can end while a card is still due later today
   * (rescheduled about 10 minutes out, or still in 错词本).
   */
  function clearNextActions(opts) {
    opts = opts || {};
    var empty = {
      showFrontier: false,
      showAls: false,
      alsRelevant: false,
      showDeep: false,
      frontier: 0,
      left: 0,
      title: "",
      primaryLabel: "",
      alsLabel: "",
      alsHref: "",
      deepLabel: "",
      deepHref: "",
      deepText: "",
      nextLine: "",
      detail: "",
      message: "",
    };
    if (opts.kind !== "must") return empty;
    var n = frontierGroup(opts.unlockedLevel, opts.levelCount);
    var left = wholeCount(opts.left);
    var cleared = left === 0;
    var nextLine = cleared
      ? ("练完了，然后继续闯关第 " + n + " 组。")
      : ("这轮做完了，今天还剩 " + left + " 道，稍后还会再出现。");
    var detail = cleared
      ? "这批到期的词都见过了。错词本里连续答对两次的已经离开。"
      : "到期的按记忆曲线再出现，错词本里的要连续答对两次才离开。";
    var deep = deepTrainDebt(opts.deepItems, opts.events);
    var showDeep = deep.length > 0;
    var message = nextLine + detail;
    if (showDeep) message += "还有 " + deep.length + " 个错词待 ALS 深练。";
    return {
      showFrontier: true,
      showAls: true,
      alsRelevant: true,
      showDeep: showDeep,
      frontier: n,
      left: left,
      title: cleared ? "今日必练清空了" : "这轮先到这里",
      primaryLabel: "继续闯关第 " + n + " 组",
      alsLabel: "去 ALS 修语法",
      alsHref: ALS_GRAMMAR_HREF,
      deepLabel: showDeep ? deepPrimaryLabel(deep.length) : "",
      deepHref: showDeep ? alsDeepHref(deep) : "",
      deepText: showDeep ? (deep.length + " 个错词待 ALS 深练") : "",
      nextLine: nextLine,
      detail: detail,
      message: message,
    };
  }

  return {
    ALS_GRAMMAR_HREF: ALS_GRAMMAR_HREF,
    alsReturnCounts: alsReturnCounts,
    provisionalSenseId: provisionalSenseId,
    alsDeepQualifiedIds: alsDeepQualifiedIds,
    returnClearsMiss: returnClearsMiss,
    returnEvidenceOk: returnEvidenceOk,
    qualifiesAlsReturn: qualifiesAlsReturn,
    markDeepQualified: markDeepQualified,
    deepTrainDebt: deepTrainDebt,
    alsDeepHref: alsDeepHref,
    deepTrainHandoff: deepTrainHandoff,
    homeDeepTrain: homeDeepTrain,
    homeLoopStrip: homeLoopStrip,
    frontierGroup: frontierGroup,
    clearNextActions: clearNextActions,
  };
});

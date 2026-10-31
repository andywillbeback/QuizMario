/* Pure cloud-vs-local progress choice. No network, no DOM.
 * Last-write-wins by save.updatedAt. A blank save never replaces a real one.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.QuizMarioMerge = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function saveTime(save) {
    if (!save || !save.updatedAt) return 0;
    var t = Date.parse(save.updatedAt);
    return Number.isFinite(t) ? t : 0;
  }

  /** Top-level, typed, or legacy MC. MC is progress, not independent mastery. */
  function spellingTouched(spell) {
    if (!spell || typeof spell !== "object") return false;
    if ((spell.correct || 0) > 0 || (spell.wrong || 0) > 0 || (spell.unknown || 0) > 0) return true;
    var typed = spell.typed;
    if (typed && ((typed.correct || 0) + (typed.wrong || 0) + (typed.unknown || 0) > 0)) return true;
    var mc = spell.mc;
    if (mc && ((mc.correct || 0) + (mc.wrong || 0) + (mc.unknown || 0) > 0)) return true;
    return false;
  }

  function studiedCount(save) {
    if (!save || !save.cards || typeof save.cards !== "object") return 0;
    var n = 0;
    var keys = Object.keys(save.cards);
    for (var i = 0; i < keys.length; i++) {
      var p = save.cards[keys[i]];
      if (!p || typeof p !== "object") continue;
      var spelled = spellingTouched(p.spelling);
      if (spelled || (p.reps || 0) > 0 || (p.correct || 0) > 0 || (p.wrong || 0) > 0 || (p.unknown || 0) > 0 || (p.mastery || 0) > 0) n++;
    }
    return n;
  }

  function isBlank(save) {
    if (!save || typeof save !== "object") return true;
    if ((save.points || 0) > 0) return false;
    if ((save.streak || 0) > 0 || (save.bestStreak || 0) > 0) return false;
    if ((save.unlockedLevel || 1) > 1) return false;
    if (save.levelStars && Object.keys(save.levelStars).length) return false;
    if (save.trackUnlock) {
      var ids = Object.keys(save.trackUnlock);
      for (var i = 0; i < ids.length; i++) {
        if ((save.trackUnlock[ids[i]] || 1) > 1) return false;
      }
    }
    if (save.trackStars) {
      var tracks = Object.keys(save.trackStars);
      for (var j = 0; j < tracks.length; j++) {
        var stars = save.trackStars[tracks[j]];
        if (stars && typeof stars === "object" && Object.keys(stars).length) return false;
      }
    }
    if (save.daily && Object.keys(save.daily).length) return false;
    if (save.studyDaily && typeof save.studyDaily === "object") {
      var studyDays = Object.keys(save.studyDaily);
      for (var s = 0; s < studyDays.length; s++) {
        if ((Number(save.studyDaily[studyDays[s]]) || 0) > 0) return false;
      }
    }
    if (studiedCount(save) > 0) return false;
    if (save.wrongBook && typeof save.wrongBook === "object") {
      var lemmas = Object.keys(save.wrongBook);
      for (var w = 0; w < lemmas.length; w++) {
        var row = save.wrongBook[lemmas[w]];
        if (row && row.active) return false;
      }
    }
    return true;
  }

  function isCloudConfigured(cfg) {
    cfg = cfg || {};
    var url = String(cfg.SUPABASE_URL || "").trim().replace(/\/+$/, "");
    var key = String(cfg.SUPABASE_ANON_KEY || "").trim();
    if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url)) return false;
    if (/YOUR_PROJECT|YOUR_SUPABASE|placeholder/i.test(url)) return false;
    if (key.length < 20) return false;
    if (/YOUR_|PASTE_HERE|placeholder|changeme/i.test(key)) return false;
    return true;
  }

  /** Prefer the newer non-blank save. */
  function chooseNewerSave(local, cloud) {
    if (cloud == null) return { source: "local", reason: "no-cloud" };
    var localBlank = isBlank(local);
    var cloudBlank = isBlank(cloud);
    if (localBlank && cloudBlank) return { source: "local", reason: "both-blank" };
    if (localBlank && !cloudBlank) return { source: "cloud", reason: "local-blank" };
    if (!localBlank && cloudBlank) return { source: "local", reason: "cloud-blank" };

    var lt = saveTime(local);
    var ct = saveTime(cloud);
    if (lt > 0 && ct > 0) {
      if (lt > ct) return { source: "local", reason: "local-newer" };
      if (ct > lt) return { source: "cloud", reason: "cloud-newer" };
      return { source: "local", reason: "same-time" };
    }
    if (lt === 0 && ct > 0) {
      if (studiedCount(local) > studiedCount(cloud)) return { source: "local", reason: "legacy-more-cards" };
      return { source: "cloud", reason: "legacy-cloud-wins" };
    }
    if (ct === 0 && lt > 0) return { source: "local", reason: "cloud-no-time" };
    if (studiedCount(local) >= studiedCount(cloud)) return { source: "local", reason: "untimed-local" };
    return { source: "cloud", reason: "untimed-cloud" };
  }

  function planSync(local, cloud) {
    var choice = chooseNewerSave(local, cloud);
    var upload = choice.source === "local" && !isBlank(local) && choice.reason !== "same-time";
    return { source: choice.source, reason: choice.reason, upload: upload };
  }

  /** Row from user_progress → save object, or null. */
  function normalizeCloudSave(row) {
    if (!row || typeof row !== "object") return null;
    var save = row.save;
    if (typeof save === "string") {
      try { save = JSON.parse(save); } catch (_) { return null; }
    }
    if (!save || typeof save !== "object" || Array.isArray(save)) return null;
    if (save.save && typeof save.save === "object" && !save.cards) save = save.save;
    var copy = {};
    var keys = Object.keys(save);
    for (var i = 0; i < keys.length; i++) copy[keys[i]] = save[keys[i]];
    if (!copy.updatedAt && row.updated_at) copy.updatedAt = row.updated_at;
    return copy;
  }

  return {
    saveTime: saveTime,
    spellingTouched: spellingTouched,
    studiedCount: studiedCount,
    isBlank: isBlank,
    isCloudConfigured: isCloudConfigured,
    chooseNewerSave: chooseNewerSave,
    planSync: planSync,
    normalizeCloudSave: normalizeCloudSave,
  };
});

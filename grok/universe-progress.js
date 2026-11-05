/* Persistent unit membership and evidence-based universe colours.
 * Completion adds content; it never awards mastery. SRS remains the only clock.
 */
(function (root, factory) {
  var api = factory(root);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.QuizMarioUniverseProgress = api;
})(typeof window !== "undefined" ? window : globalThis, function (root) {
  "use strict";
  var Sense = root.QuizMarioSense;
  if (!Sense && typeof require === "function") Sense = require("./sense-id.js");
  function object(v) { return v && typeof v === "object" && !Array.isArray(v) ? v : {}; }
  function norm(s) { return Sense ? Sense.senseId(s) : String(s || "").trim().toLowerCase(); }
  function time(v) { var n = Number(v); return isFinite(n) && n > 0 ? n : (Date.parse(v) || 0); }
  function score(v) { return Math.max(0, Math.min(3, Number(v) || 0)); }
  function keyFor(track, level, word) {
    return Sense ? Sense.cardKeyFor(track, level, word) : (track === "core" ? "" : track + "|") + level + "::" + norm(word);
  }
  function normalizeCompleted(input) {
    var out = {};
    Object.keys(object(input)).forEach(function (track) {
      if (!/^[a-z][a-z0-9_-]*$/.test(track) || track === "constructor" || track === "prototype") return;
      var rows = {};
      Object.keys(object(input[track])).forEach(function (set) {
        var n = Number(set);
        if (isFinite(n) && n >= 1 && n === Math.floor(n) && input[track][set]) rows[String(n)] = input[track][set];
      });
      out[track] = rows;
    });
    return out;
  }
  function recordCompleted(save, track, set, now) {
    set = Number(set);
    if (!save || !/^[a-z][a-z0-9_-]*$/.test(track || "") || !isFinite(set) || set < 1 || set !== Math.floor(set) || track === "constructor" || track === "prototype") return false;
    var all = normalizeCompleted(save.universeCompletedSets);
    if (!all[track]) all[track] = {};
    all[track][String(set)] = new Date(now || Date.now()).toISOString();
    save.universeCompletedSets = all;
    return true;
  }
  function completedSets(save, track) {
    save = object(save);
    var found = {};
    Object.keys(object(object(save.universeCompletedSets)[track])).forEach(function (k) { if (save.universeCompletedSets[track][k]) found[k] = true; });
    // Old saves already contain historical set-clear stars. Do not require replay.
    var stars = object(object(save.trackStars)[track]);
    if (save.track === track || (!save.track && track === "core")) stars = Object.assign({}, stars, object(save.levelStars));
    Object.keys(stars).forEach(function (k) { if (Number(stars[k]) > 0) found[k] = true; });
    return Object.keys(found).map(Number).filter(function (n) { return isFinite(n) && n >= 1 && n === Math.floor(n); }).sort(function (a, b) { return a - b; });
  }
  function hasMeaning(p) {
    return !!(p && (p.state === "learning" || p.state === "review" || p.reps > 0 || p.correct > 0 || p.wrong > 0 || p.unknown > 0 || p.mastery > 0));
  }
  function touched(p) {
    return hasMeaning(p) || !!(p && (time(object(p.collocationEvidence).lastAt) || time(object(p.spelling).lastAt) || time(object(p.polysemy).lastAt)));
  }
  function createIndex(save, track) {
    var byToken = Object.create(null), prefix = track === "core" ? "" : track + "|";
    Object.keys(object(object(save).cards)).forEach(function (key) {
      var split = key.lastIndexOf("::"), left = key.slice(0, split);
      if (split < 0 || (track === "core" ? !/^\d+$/.test(left) : left.indexOf(prefix) !== 0)) return;
      var token = key.slice(split + 2);
      (byToken[token] || (byToken[token] = [])).push(key);
    });
    return byToken;
  }
  function latestCard(save, track, word, level, indexed) {
    var cards = object(object(save).cards), token = norm(word), prefix = track === "core" ? "" : track + "|";
    var exact = level != null ? keyFor(track, level, word) : "";
    var best = null;
    (indexed ? (indexed[token] || []) : Object.keys(cards)).forEach(function (key) {
      var split = key.lastIndexOf("::");
      if (split < 0 || key.slice(split + 2) !== token) return;
      var left = key.slice(0, split);
      if (track === "core" ? !/^\d+$/.test(left) : left.indexOf(prefix) !== 0) return;
      var p = cards[key];
      if (!touched(p)) return;
      var at = Math.max(time(p.scheduledAt), time(p.lastAttemptAt), time(object(p.collocationEvidence).lastAt), time(object(p.spelling).lastAt), time(object(p.polysemy).lastAt));
      var row = { key: key, prog: p, at: at };
      if (key === exact) { best = row; return; }
      if (best && best.key === exact) return;
      if (!best || at > best.at || (at === best.at && score(p.mastery) < score(best.prog.mastery))) best = row;
    });
    return best;
  }
  function bucketScore(bucket) {
    var b = object(bucket), n = (b.correct || 0) + (b.wrong || 0) + (b.unknown || 0);
    if (!n) return null;
    if (b.lastOutcome === "wrong" || b.lastOutcome === "unknown") return 0;
    if ((b.streak || 0) >= 2 && (b.correct || 0) > (b.wrong || 0) + (b.unknown || 0)) return 3;
    return (b.streak || 0) > 0 ? 1 : 0;
  }
  function itemState(save, track, word, level, indexed) {
    var hit = latestCard(save, track, word, level, indexed), p = hit ? hit.prog : {};
    var recognition = hasMeaning(p) ? score(p.mastery) : null;
    var gate = object(p.collocationEvidence);
    if (time(gate.lastAt) && (!hasMeaning(p) || time(gate.lastAt) >= time(p.scheduledAt))) recognition = score(gate.score);
    var spelling = bucketScore(object(p.spelling).typed);
    var polysemy = bucketScore(p.polysemy);
    var values = [recognition, spelling, polysemy].filter(function (v) { return v != null; });
    return {
      score: values.length ? Math.min.apply(Math, values) : null,
      recognition: recognition, spelling: spelling, polysemy: polysemy,
      lastAt: hit ? hit.at : 0, key: hit ? hit.key : "", assisted: (gate.assisted || 0) > 0,
    };
  }
  function effectiveState(save, track, card, level, index, related, indexed) {
    var own = itemState(save, track, card.word, level, indexed), required = [];
    if (related && index && !/\s|\.\.\.|…/.test(card.word)) {
      related.lemmas(card).forEach(function (text) {
        if (!/\s|\.\.\.|…/.test(text)) return;
        var hit = index.get(related.norm(text));
        if (hit && hit.word && String(hit.word.meaning_zh || "").trim()) required.push(itemState(save, track, hit.word.word, null, indexed));
      });
    }
    var pending = required.some(function (s) { return s.score == null; });
    var collocValues = required.map(function (s) { return s.score; }).filter(function (s) { return s != null; });
    var collocation = collocValues.length ? Math.min.apply(Math, collocValues) : null;
    var value = own.score;
    if (value != null && own.recognition == null) value = Math.min(value, 2);
    if (value != null && required.length) value = Math.min(value, collocation == null ? 1 : collocation, pending ? 1 : 3);
    return {
      score: value, recognition: own.recognition, spelling: own.spelling, polysemy: own.polysemy,
      collocation: collocation, collocationPending: pending, requiredCollocations: required.length,
      mastered: value === 3 && !pending && own.recognition != null,
      lastAt: own.lastAt,
    };
  }
  function recordCollocation(save, input) {
    var key = keyFor(input.track, input.levelIdx, input.word), cards = object(save.cards);
    save.cards = cards;
    var p = cards[key] || (cards[key] = {}), prev = object(p.collocationEvidence);
    var now = input.now || Date.now(), good = input.outcome === "correct", clean = good && input.firstTry !== false && !input.hintSeen;
    var b = Object.assign({ correct: 0, wrong: 0, unknown: 0, assisted: 0, streak: 0, score: 0, lastAt: 0, lastIndependentAt: 0 }, prev);
    if (good) b.correct++;
    else if (input.outcome === "unknown") b.unknown++;
    else b.wrong++;
    if (!good) { b.streak = 0; b.score = Math.max(0, score(b.score) - 1); }
    else if (!clean) { b.assisted++; b.streak = 0; }
    else {
      b.streak++;
      var laterDay = b.lastIndependentAt && new Date(b.lastIndependentAt).toDateString() !== new Date(now).toDateString();
      b.score = laterDay && b.streak >= 2 ? 3 : Math.min(2, score(b.score) + 1);
      b.lastIndependentAt = now;
    }
    b.lastAt = now; b.lastOutcome = input.outcome;
    p.collocationEvidence = b;
    return { key: key, evidence: b, independent: clean };
  }
  return { normalizeCompleted: normalizeCompleted, recordCompleted: recordCompleted, completedSets: completedSets,
    createIndex: createIndex, itemState: itemState, effectiveState: effectiveState, recordCollocation: recordCollocation, keyFor: keyFor, norm: norm };
});

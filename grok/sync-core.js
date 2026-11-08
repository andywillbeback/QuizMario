/* Pure progress reconciliation and bounded data requests. No auth or teaching policy. */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.QuizMarioSyncCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  function clone(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }
  function equal(a,b) { return JSON.stringify(a) === JSON.stringify(b); }
  function object(v) { return v && typeof v === 'object' && !Array.isArray(v); }
  var DEFAULT_CARD = {ef:2.5,interval:0,reps:0,lapses:0,due:0,correct:0,wrong:0,unknown:0,mastery:0,state:'new',mastered:false,lastOutcome:'',scheduledAt:0};
  function compact(save) {
    var out = clone(save || {}), cards = out.cards || {};
    Object.keys(cards).forEach(function (k) {
      var c = cards[k];
      if (object(c) && Object.keys(c).every(function (f) { return Object.prototype.hasOwnProperty.call(DEFAULT_CARD,f) && c[f] === DEFAULT_CARD[f]; })) delete cards[k];
    });
    out.cards = cards;
    delete out._syncReceipts;
    return out;
  }
  function counter(path) {
    var first = path[0], last = path[path.length-1];
    if (first === 'studyDaily' && path.length === 2) return true;
    if (first === 'points' && path.length === 1) return true;
    if (first === 'daily') return /^(c|w|unk|rc|rw|n|studyMs)$/.test(last);
    if (first === 'practice') return /^(n|good)$/.test(last);
    return first === 'cards' && /^(correct|wrong|unknown)$/.test(last);
  }
  /* Add only this writer's changes since its acknowledged baseline. Counters
     accumulate; SRS state uses the latest save when both writers changed it.
     A write receipt makes an uncertain/duplicated delivery idempotent. */
  function reconcile(base, local, remote) {
    base = compact(base); local = compact(local); remote = compact(remote);
    var preferLocal = Date.parse(local.updatedAt || 0) >= Date.parse(remote.updatedAt || 0);
    function merge(b,l,r,path) {
      if (counter(path) && typeof l === 'number' && typeof r === 'number') {
        var start = typeof b === 'number' ? b : 0;
        if (l >= start && r >= start) return r + (l-start);
      }
      if (equal(l,b)) return clone(r);
      if (equal(r,b)) return clone(l);
      if (object(l) || object(r)) {
        var result = {}, keys = new Set(Object.keys(b || {}).concat(Object.keys(l || {}),Object.keys(r || {})));
        keys.forEach(function (k) {
          var v = merge(b && b[k],l && l[k],r && r[k],path.concat(k));
          if (v !== undefined) result[k] = v;
        });
        return result;
      }
      if (/^(unlockedLevel|bestStreak)$/.test(path[path.length-1]) || path[0] === 'trackUnlock' || path[0] === 'levelStars' || path[0] === 'trackStars') {
        if (typeof l === 'number' && typeof r === 'number') return Math.max(l,r);
      }
      return clone(preferLocal ? l : r);
    }
    return merge(base,local,remote,[]);
  }
  function request(query, ms) {
    var controller = typeof AbortController === 'function' ? new AbortController() : null;
    if (controller && query && typeof query.abortSignal === 'function') query = query.abortSignal(controller.signal);
    var timer;
    var deadline = new Promise(function (_,reject) {
      timer = setTimeout(function () {
        var err = new Error('同步请求超时，记录已留在本机等待自动重试'); err.name = 'TimeoutError';
        reject(err); if (controller) controller.abort();
      },ms || 20000);
    });
    return Promise.race([Promise.resolve(query),deadline]).finally(function () { clearTimeout(timer); });
  }
  function id() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return Date.now().toString(36)+'-'+Math.random().toString(36).slice(2)+'-'+Math.random().toString(36).slice(2);
  }
  return {clone:clone,equal:equal,compact:compact,reconcile:reconcile,request:request,id:id};
});

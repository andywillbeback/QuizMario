/* On-demand sets for 中考, 高考, 雅思 and 原版核心.
 * The directory is a small script. Each set is its own file, prefetched after
 * login and cached by the service worker. Learner progress is never stored here.
 */
(function (root, factory) {
  var create = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = create;
  if (root && root.document) root.QuizMarioBanks = create(root);
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";
  return function create(host) {
    var VERSION = "20261113-set1";
    var NAMES = { zhongkao: "中考", gaokao: "高考", ielts: "雅思", core: "原版核心" };
    var tracks = host.VOCAB_TRACKS || (host.VOCAB_TRACKS = []);
    var inflight = Object.create(null);
    var queue = [];
    var running = 0;
    var filling = Object.create(null);
    var noteTimer = null;
    var LIMIT = 3;

    function manifest() {
      return host.QUIZMARIO_BANK_MANIFEST || null;
    }

    function pad(index) {
      var text = String(index);
      while (text.length < 3) text = "0" + text;
      return text;
    }

    function setUrl(id, index) {
      return "data/banks/" + VERSION + "/" + id + "/" + pad(index) + ".json";
    }

    function later(fn, ms) {
      var timer = host.setTimeout || setTimeout;
      return timer(fn, ms);
    }

    function cancel(id) {
      var clear = host.clearTimeout || clearTimeout;
      clear(id);
    }

    function findTrack(id) {
      for (var i = 0; i < tracks.length; i++) if (tracks[i] && tracks[i].id === id) return tracks[i];
      return null;
    }

    function place(track, beforeId) {
      if (tracks.indexOf(track) >= 0) return;
      var at = -1;
      for (var i = 0; i < tracks.length; i++) if (tracks[i] && tracks[i].id === beforeId) { at = i; break; }
      if (at < 0) tracks.unshift(track);
      else tracks.splice(at, 0, track);
    }

    function full(track, count) {
      if (!track || !Array.isArray(track.sets) || track.sets.length !== count) return false;
      for (var i = 0; i < count; i++) if (!Array.isArray(track.sets[i]) || !track.sets[i].length) return false;
      return true;
    }

    function stub(id, meta) {
      var found = findTrack(id);
      var count = meta && meta.setCount || 0;
      if (found && full(found, count)) {
        found.lazy = false;
        found.loaded = true;
        found.manifestReady = true;
        if (meta && !found.entryCount) found.entryCount = meta.entryCount;
        return found;
      }
      if (!found) {
        found = {
          id: id,
          name: (meta && meta.name) || NAMES[id] || id,
          desc: (meta && meta.desc) || "",
          sets: [],
          titles: [],
          lazy: true,
          loaded: false,
        };
        var before = { zhongkao: "gaokao", gaokao: "ielts", ielts: "core", core: "ket" };
        place(found, before[id]);
      }
      found.lazy = true;
      found.loaded = false;
      if (!Array.isArray(found.sets)) found.sets = [];
      if (meta) {
        found.name = meta.name || found.name;
        found.desc = meta.desc || found.desc;
        found.titles = meta.titles || [];
        found.entryCount = meta.entryCount || 0;
        found.sets.length = meta.setCount || found.sets.length;
        found.manifestReady = true;
      }
      return found;
    }

    function attach() {
      var man = manifest();
      ["ielts", "gaokao", "zhongkao", "core"].forEach(function (id) {
        stub(id, man && man.tracks && man.tracks[id]);
      });
      var exams = [];
      ["zhongkao", "gaokao"].forEach(function (id) {
        var track = findTrack(id);
        if (track) exams.push(track);
      });
      host.VOCAB_EXAM_TRACKS = exams;
    }

    function note() {
      if (typeof host.__QM_NOTE_BANKS !== "function") return;
      cancel(noteTimer);
      noteTimer = later(function () {
        try { host.__QM_NOTE_BANKS(); } catch (e) {}
      }, 80);
    }

    function install(track, index, payload) {
      var cards = payload && Array.isArray(payload.cards) ? payload.cards : (Array.isArray(payload) ? payload : null);
      if (!cards || !cards.length) throw new Error("这一组词库不完整，请刷新后重试。");
      if (!track.sets) track.sets = [];
      track.sets[index] = cards;
      var links = payload && Array.isArray(payload.links) ? payload.links : [];
      if (links.length) {
        if (!track.linkCards) track.linkCards = [];
        var seen = track._linkSeen || (track._linkSeen = Object.create(null));
        for (var i = 0; i < links.length; i++) {
          var row = links[i];
          if (!row || !row.word || row.levelIdx == null) continue;
          var key = row.levelIdx + "\n" + String(row.word.word || "").toLowerCase();
          if (seen[key]) continue;
          seen[key] = 1;
          track.linkCards.push({ levelIdx: row.levelIdx, word: row.word });
        }
      }
      var man = manifest();
      var meta = man && man.tracks && man.tracks[track.id];
      if (meta && full(track, meta.setCount)) track.loaded = true;
      note();
      return cards;
    }

    function fetchText(url) {
      if (inflight[url]) return inflight[url];
      var job = Promise.resolve().then(function () {
        return host.fetch(url, { credentials: "same-origin" });
      }).then(function (res) {
        if (!res || !res.ok) throw new Error("词库暂时无法读取，请稍后重试。");
        return res.text();
      });
      inflight[url] = job;
      job.then(function () {}, function () {}).then(function () {
        if (inflight[url] === job) delete inflight[url];
      });
      return job;
    }

    function pump() {
      while (running < LIMIT && queue.length) {
        var item = queue.shift();
        running++;
        fetchText(item.url).then(item.resolve, item.reject).then(function () {
          running--;
          pump();
        }, function () {
          running--;
          pump();
        });
      }
    }

    function enqueue(url, front) {
      if (inflight[url]) return fetchText(url);
      var pending;
      for (var i = 0; i < queue.length; i++) if (queue[i].url === url) pending = queue[i];
      if (pending) {
        if (front) {
          queue.splice(queue.indexOf(pending), 1);
          queue.unshift(pending);
          pump();
        }
        return pending.promise;
      }
      var resolve, reject;
      var promise = new Promise(function (yes, no) { resolve = yes; reject = no; });
      var item = { url: url, resolve: resolve, reject: reject, promise: promise };
      if (front) queue.unshift(item);
      else queue.push(item);
      pump();
      return promise;
    }

    function prepare(id) {
      attach();
      var man = manifest();
      var meta = man && man.tracks && man.tracks[id];
      var track = findTrack(id);
      if (!man || !meta || !track || !track.manifestReady) {
        return Promise.reject(new Error("词库目录未加载，请刷新后重试。"));
      }
      return Promise.resolve(track);
    }

    function ensureSet(id, index) {
      return prepare(id).then(function (track) {
        if (Array.isArray(track.sets[index])) return track.sets[index];
        var url = setUrl(id, index);
        var timer;
        var timeout = new Promise(function (_, reject) {
          timer = later(function () {
            reject(new Error("这一组加载超时，请检查网络后再点一次。"));
          }, 20000);
        });
        var job = fetchText(url).then(function (text) {
          var payload;
          try { payload = JSON.parse(text); }
          catch (e) { throw new Error("这一组词库不完整，请刷新后重试。"); }
          return install(track, index, payload);
        });
        return Promise.race([job, timeout]).then(function (cards) {
          cancel(timer);
          return cards;
        }, function (error) {
          cancel(timer);
          throw error;
        });
      });
    }

    function warm(id, level) {
      var man = manifest();
      var meta = man && man.tracks && man.tracks[id];
      if (!meta) return;
      var first = Math.max(0, (Number(level) || 1) - 1);
      if (first >= meta.setCount) first = 0;
      var track = findTrack(id);
      if (track && Array.isArray(track.sets[first])) return;
      enqueue(setUrl(id, first), true);
    }

    function fillTrack(id) {
      if (filling[id]) return filling[id];
      var man = manifest();
      var meta = man && man.tracks && man.tracks[id];
      filling[id] = prepare(id).then(function (track) {
        var index = 0;
        function step() {
          if (!meta || index >= meta.setCount) {
            track.loaded = true;
            note();
            return Promise.resolve(track);
          }
          var batch = [];
          for (var n = 0; n < 8 && index < meta.setCount; n++) batch.push(ensureSet(id, index++));
          return Promise.all(batch).then(function () {
            return new Promise(function (resolve) { later(resolve, 0); }).then(step);
          });
        }
        return step();
      });
      filling[id].then(function () {}, function () { delete filling[id]; });
      return filling[id];
    }

    function prefetch(preferId, preferLevel) {
      var man = manifest();
      if (!man || !man.tracks) return;
      var ranked = [];
      function add(id, index) {
        var meta = man.tracks[id];
        if (!meta || index < 0 || index >= meta.setCount) return;
        var url = setUrl(id, index);
        if (ranked.indexOf(url) === -1) ranked.push(url);
      }
      if (preferId) add(preferId, Math.max(0, (Number(preferLevel) || 1) - 1));
      add("zhongkao", 0);
      add("gaokao", 0);
      ["zhongkao", "gaokao", "core"].forEach(function (id) {
        var meta = man.tracks[id];
        if (!meta) return;
        for (var i = 0; i < meta.setCount; i++) add(id, i);
      });
      ranked.forEach(function (url) { enqueue(url, false); });
    }

    function onReady() {
      var save = host.__QM && typeof host.__QM.getSave === "function" ? host.__QM.getSave() : null;
      var id = save && save.track;
      var level = 1;
      if (save && id && save.trackUnlock && save.trackUnlock[id]) level = save.trackUnlock[id];
      else if (save && save.unlockedLevel) level = save.unlockedLevel;
      prefetch(id, level);
    }

    attach();
    if (typeof host.addEventListener === "function") host.addEventListener("quizmario:session-ready", onReady);

    return {
      version: VERSION,
      prepare: prepare,
      ensureSet: ensureSet,
      warm: warm,
      fillTrack: fillTrack,
      prefetch: prefetch,
      setUrl: setUrl,
    };
  };
});

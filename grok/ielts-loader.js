/* IELTS uses the shared game. Its vocabulary downloads only when selected.
 * This loader contains public teaching content, never learner progress. */
(function (root, factory) {
  var create = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = create;
  if (root && root.document) root.QuizMarioIelts = create(root);
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";
  return function create(host) {
    var VERSION = "ielts-composite-20261109-v1";
    var track = {id:"ielts",name:"雅思",sets:[],titles:[],lazy:true,loaded:false,
      desc:"通用高频、学术核心与主题词汇；保留搭配、复习与个人学习记录。"};
    var tracks = host.VOCAB_TRACKS || (host.VOCAB_TRACKS = []);
    var found = tracks.find(function (t) { return t.id === "ielts"; });
    if (found) track = found;
    else {
      var lastExam = tracks.findIndex(function (t) { return t.id === "gaokao"; });
      tracks.splice(lastExam < 0 ? tracks.length : lastExam + 1, 0, track);
    }
    var pending = null;
    function validate(data) {
      if (!data || data.id !== "ielts" || data.version !== VERSION || !Array.isArray(data.sets) || !data.sets.length)
        throw new Error("雅思词库版本不完整，请刷新后重试。");
      if (!Array.isArray(data.titles) || data.titles.length !== data.sets.length)
        throw new Error("雅思单元目录不完整，请刷新后重试。");
      var seen = Object.create(null), count = 0;
      data.sets.forEach(function (set) {
        if (!Array.isArray(set) || !set.length || set.length > 50) throw new Error("雅思单元数据不完整。");
        set.forEach(function (card) {
          if (!card || ["word","pos","meaning_zh","example_en","example_zh"].some(function (k) {return typeof card[k] !== "string" || !card[k].trim();}))
            throw new Error("雅思词条数据不完整。");
          var surface = card.word.trim();
          var key = /^(May|March|Miss|China|WHO|US)$/.test(surface) ? surface : surface.toLowerCase();
          if (seen[key]) throw new Error("雅思词库含重复词条。");
          seen[key] = true; count++;
        });
      });
      if (count !== data.entry_count) throw new Error("雅思词库数量校验失败。");
      return data;
    }
    function install(data) {
      data = validate(data);
      track.sets = data.sets; track.titles = data.titles;
      track.desc = data.desc; track.loaded = true;
      track.version = data.version; track.entry_count = data.entry_count;
      return track;
    }
    function ensure() {
      if (track.loaded) return Promise.resolve(track);
      if (pending) return pending;
      var controller = host.AbortController ? new host.AbortController() : null;
      var later = host.setTimeout ? host.setTimeout.bind(host) : setTimeout;
      var clear = host.clearTimeout ? host.clearTimeout.bind(host) : clearTimeout;
      var timer;
      var timeout = new Promise(function (_, reject) {
        timer = later(function () {
          if (controller) controller.abort();
          reject(new Error("雅思词库加载超时，请检查网络后再点雅思重试。"));
        }, 30000);
      });
      var request = Promise.resolve().then(function () {
        return host.fetch("data/ielts-v1/bank.json?v=" + VERSION, {signal:controller ? controller.signal : undefined});
      }).then(function (res) {
        if (!res || !res.ok) throw new Error("雅思词库暂时无法读取，请稍后重试。");
        return res.json();
      });
      pending = Promise.race([request, timeout]).then(install).finally(function () {
        clear(timer); pending = null;
      });
      return pending;
    }
    return {track:track,ensure:ensure,validate:validate,install:install,version:VERSION};
  };
});

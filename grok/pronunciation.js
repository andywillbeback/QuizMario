/* One teaching voice for headwords, examples, and slow replay.
 * Browser/OS speechSynthesis only. No cloud voice, no bundled recordings.
 * Does not read or replace streak / encouragement clips.
 *
 * Loaded before game.js. Also require()-able from node tests.
 */
(function (root, factory) {
  var api = factory(root);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.QMPronunciation = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  var STORAGE_KEY = "qm_pronunciation_v1";
  var WORD_RATE = 0.88;
  var EXAMPLE_RATE = 0.82;
  var SLOW_RATE = 0.72;
  var CANCEL_GAP_MS = 40;
  var VOICE_WAIT_MS = 700;
  var START_TIMEOUT_MS = 6000;

  var NOVELTY = /^(Albert|Bad News|Bahh|Bells|Boing|Bubbles|Cellos|Fred|Good News|Hysterical|Jester|Junior|Organ|Princess|Ralph|Superstar|Trinoids|Whisper|Wobble|Zarvox)(?:\s|\(|$)/i;
  var LEGACY = /^(Eddy|Flo|Grandma|Grandpa|Reed|Rocko|Sandy|Shelley)(?:\s|\(|$)/i;
  var TEACHING = /^(Daniel|Samantha|Alex|Karen|Serena|Kate|Oliver|Jamie|Ava|Allison|Susan|Zoe|Tom|Moira|Tessa|Martha|Arthur|Hazel|Libby|Sonia|Brian|Amy|Victoria|Nathan|Nicky|Aaron)(?:\s|\(|$)/i;
  var GOOGLE_EN = /Google (UK|US) English/i;
  var QUALITY = /\b(premium|enhanced|natural|neural)\b/i;
  var COMPACT = /\b(compact|novelty)\b/i;
  var RETRYABLE = /^(network|voice-unavailable|language-unavailable|synthesis-unavailable|synthesis-failed|audio-busy)$/;

  function language(value) {
    return String(value || "").replace(/_/g, "-").toLowerCase();
  }

  function isEnglish(voice) {
    return /^en(?:-|$)/.test(language(voice && voice.lang));
  }

  function voiceId(voice) {
    if (!voice) return "";
    return String(voice.voiceURI || voice.name || "") + "::" + language(voice.lang);
  }

  function enhanced(voice) {
    return QUALITY.test(String(voice && voice.name || "") + " " + String(voice && voice.voiceURI || ""));
  }

  function accentMatch(voice, accent) {
    var lang = language(voice && voice.lang);
    var want = language(accent);
    return lang === want || lang.indexOf(want + "-") === 0;
  }

  function describeVoice(voice) {
    if (!voice) return null;
    return {
      id: voiceId(voice),
      name: String(voice.name || "English"),
      lang: String(voice.lang || "en-GB").replace(/_/g, "-"),
      localService: voice.localService !== false,
      quality: enhanced(voice) ? "enhanced" : "standard",
    };
  }

  /**
   * British (or the chosen accent) first, then clearer engines.
   * Enhanced / Premium / Natural / Neural and Google UK/US English outrank
   * compact, legacy, and novelty voices. Remote alone is not a quality signal.
   */
  function selectVoice(voices, accent, requestedId, excluded) {
    excluded = excluded || [];
    var candidates = (voices || []).filter(function (v) {
      return v && isEnglish(v) && !NOVELTY.test(v.name || "") && excluded.indexOf(voiceId(v)) === -1;
    });
    if (requestedId) {
      var requested = candidates.filter(function (v) {
        return voiceId(v) === requestedId || v.voiceURI === requestedId;
      })[0];
      if (requested) return requested;
    }
    function score(v) {
      var s = accentMatch(v, accent) ? 800 : 0;
      if (enhanced(v)) s += 500;
      if (GOOGLE_EN.test(v.name || "") || GOOGLE_EN.test(v.voiceURI || "")) s += 260;
      if (TEACHING.test(v.name || "")) s += 180;
      if (v.default) s += 20;
      if (COMPACT.test(v.name || "") || COMPACT.test(v.voiceURI || "")) s -= 400;
      if (LEGACY.test(v.name || "")) s -= 900;
      return s;
    }
    var ranked = candidates.map(function (v, i) {
      return { voice: v, score: score(v), order: i };
    });
    ranked.sort(function (a, b) {
      return b.score - a.score || a.order - b.order;
    });
    return ranked.length ? ranked[0].voice : null;
  }

  function rateFor(req) {
    if (req.slow) return SLOW_RATE;
    if (req.example) return EXAMPLE_RATE;
    return WORD_RATE;
  }

  function create(options) {
    options = options || {};
    var host = options.window || root || {};
    var synth = Object.prototype.hasOwnProperty.call(options, "speechSynthesis")
      ? options.speechSynthesis
      : host.speechSynthesis;
    var Utterance = options.Utterance || host.SpeechSynthesisUtterance;
    var later = options.setTimeout || (host.setTimeout && host.setTimeout.bind(host));
    var clear = options.clearTimeout || (host.clearTimeout && host.clearTimeout.bind(host));
    var storage;
    try {
      storage = Object.prototype.hasOwnProperty.call(options, "storage") ? options.storage : host.localStorage;
    } catch (_) {}

    var supported = !!(synth && Utterance && later && clear);
    var accent = "en-GB";
    var requestedId = "";
    var voices = [];
    var selected = null;
    var status = supported ? "ready" : "unavailable";
    var message = supported ? "" : "此浏览器暂不支持发音，仍可继续练习。";
    var listeners = [];
    var timers = {};
    var generation = 0;
    var request = null;
    var utterance = null;
    var readingVoices = false;
    var destroyed = false;
    var last = null;
    var playingVoice = null;
    var cancelCooling = false;
    var voicesSettled = false;

    try {
      var raw = storage && storage.getItem(STORAGE_KEY);
      var pref = raw ? JSON.parse(raw) : null;
      if (pref && (pref.accent === "en-GB" || pref.accent === "en-US")) accent = pref.accent;
      if (pref && typeof pref.voiceId === "string") requestedId = pref.voiceId;
    } catch (_) {}

    if (typeof options.onState === "function") listeners.push(options.onState);

    function enabled() {
      try { return !options.isEnabled || !!options.isEnabled(); } catch (_) { return false; }
    }

    function getState() {
      return {
        supported: supported,
        status: status,
        message: message,
        accent: accent,
        voiceId: requestedId,
        selectedVoice: describeVoice(playingVoice || selected),
        voices: voices.filter(function (v) {
          return isEnglish(v) && !NOVELTY.test(v.name || "");
        }).map(describeVoice),
        canReplay: !!last,
        text: request ? request.text : "",
        slow: !!(request && request.slow),
        example: !!(request && request.example),
        normalRate: WORD_RATE,
        exampleRate: EXAMPLE_RATE,
        slowRate: SLOW_RATE,
      };
    }

    function notify(next, note) {
      if (next) status = next;
      if (note !== undefined) message = note;
      var state = getState();
      listeners.slice().forEach(function (fn) {
        try { fn(state); } catch (_) {}
      });
    }

    function schedule(key, fn, delay) {
      if (!later || !clear) return;
      if (timers[key] != null) clear(timers[key]);
      timers[key] = later(function () {
        delete timers[key];
        fn();
      }, delay);
    }

    function clearTimer(key) {
      if (timers[key] != null && clear) {
        clear(timers[key]);
        delete timers[key];
      }
    }

    function clearPlaybackTimers() {
      ["speak", "voicesWait", "start", "end"].forEach(clearTimer);
    }

    function persist() {
      try {
        if (storage) storage.setItem(STORAGE_KEY, JSON.stringify({ accent: accent, voiceId: requestedId }));
      } catch (_) {}
    }

    function current(req) {
      return !destroyed && request === req && req.generation === generation;
    }

    function cancelEngine() {
      try { if (synth) synth.cancel(); } catch (_) {}
      cancelCooling = true;
      schedule("cancelGap", function () { cancelCooling = false; }, CANCEL_GAP_MS);
    }

    function release(cancelSpeech, interruptExternal) {
      var hadSpeech = !!utterance;
      generation += 1;
      clearPlaybackTimers();
      if (utterance) {
        utterance.onstart = null;
        utterance.onend = null;
        utterance.onerror = null;
      }
      utterance = null;
      request = null;
      playingVoice = null;
      var engineBusy = !!(synth && (synth.speaking || synth.pending));
      var shouldCancel = !!(cancelSpeech && synth && (hadSpeech || (interruptExternal && engineBusy)));
      if (shouldCancel) cancelEngine();
      return shouldCancel;
    }

    function stop(opts) {
      release(!opts || opts.cancelSpeech !== false, false);
      if (!destroyed) notify("ready", "");
    }

    function finish(req, error) {
      if (!current(req)) return;
      release(false, false);
      notify(error ? "error" : "ready", error || "");
    }

    function detachUtterance(u) {
      if (!u) return;
      u.onstart = null;
      u.onend = null;
      u.onerror = null;
    }

    /**
     * Chrome can deliver the previous cancel's "interrupted" onto the next
     * utterance, or end it before onstart. Retry the same line instead of
     * treating that as a finished read. A real stop() bumps generation, so
     * current(req) fails and this does not revive a line the caller stopped.
     */
    function retryDropped(req, u) {
      if (!current(req) || utterance !== u || req.started) return false;
      if (req.dropRetries >= 2) return false;
      req.dropRetries += 1;
      detachUtterance(u);
      if (utterance === u) utterance = null;
      clearPlaybackTimers();
      schedule("speak", function () { startSpeech(req); }, CANCEL_GAP_MS);
      return true;
    }

    function refreshVoices() {
      if (!supported || destroyed || readingVoices) return;
      readingVoices = true;
      try {
        voices = Array.prototype.slice.call(synth.getVoices() || []);
      } catch (_) {}
      readingVoices = false;
      if (voices.length) {
        voicesSettled = true;
        clearTimer("voicesSettle");
      }
      selected = selectVoice(voices, accent, requestedId);
      notify();
      if (request && request.waiting && voices.length) {
        var waiting = request;
        waiting.waiting = false;
        clearTimer("voicesWait");
        startSpeech(waiting);
      }
    }

    function startSpeech(req) {
      if (!current(req) || destroyed) return;
      if (!enabled()) { stop(); return; }
      if (!supported) {
        finish(req, "此浏览器暂不支持发音，仍可继续练习。");
        return;
      }
      req.waiting = false;
      var voice = selectVoice(voices, accent, requestedId, req.failedVoices);
      var u;
      try {
        u = new Utterance(req.text);
        u.lang = voice && voice.lang ? String(voice.lang).replace(/_/g, "-") : accent;
        if (voice) u.voice = voice;
        u.rate = rateFor(req);
        u.pitch = 1;
        u.volume = 1;
      } catch (_) {
        finish(req, "发音暂不可用，请点按重试。练习可继续。");
        return;
      }
      utterance = u;
      playingVoice = voice;
      req.started = false;
      u.onstart = function () {
        if (!current(req) || utterance !== u) return;
        req.started = true;
        clearTimer("start");
        notify("speaking", "");
        schedule("end", function () {
          if (!current(req)) return;
          release(true, false);
          if (!destroyed) notify("error", "发音已停止，请点按重试。");
        }, Math.max(60000, req.text.length * 300));
      };
      u.onend = function () {
        if (!current(req) || utterance !== u) return;
        if (!req.started && retryDropped(req, u)) return;
        finish(req);
      };
      u.onerror = function (event) {
        if (!current(req) || utterance !== u) return;
        var code = (event && event.error) || "synthesis-failed";
        if (code === "interrupted" || code === "canceled" || code === "cancelled") {
          if (retryDropped(req, u)) return;
          finish(req);
          return;
        }
        if (code === "not-allowed") {
          finish(req, "浏览器需要点按播放，请再点一次发音按钮。");
          return;
        }
        if (!req.started && !req.retried && RETRYABLE.test(code)) {
          req.retried = true;
          if (voice) req.failedVoices.push(voiceId(voice));
          u.onstart = null;
          u.onend = null;
          u.onerror = null;
          utterance = null;
          clearPlaybackTimers();
          cancelEngine();
          schedule("speak", function () { startSpeech(req); }, CANCEL_GAP_MS);
          return;
        }
        finish(req, "发音暂不可用，请点按重试。练习可继续。");
      };
      notify("queued", "");
      schedule("start", function () {
        if (!current(req) || req.started) return;
        release(true, false);
        if (!destroyed) notify("error", "浏览器未开始发音，请点按重试。");
      }, START_TIMEOUT_MS);
      try {
        if (synth.paused && typeof synth.resume === "function") synth.resume();
        synth.speak(u);
      } catch (_) {
        try { u.onerror({ error: "synthesis-failed" }); } catch (__) {}
      }
    }

    function begin(req) {
      if (!current(req)) return;
      if (!enabled()) { stop(); return; }
      refreshVoices();
      if (!voices.length && supported && !voicesSettled && !req.gesture) {
        req.waiting = true;
        notify("loading", "");
        if (timers.voicesSettle == null) {
          schedule("voicesSettle", function () { voicesSettled = true; }, VOICE_WAIT_MS);
        }
        schedule("voicesWait", function () {
          voicesSettled = true;
          if (!current(req)) return;
          req.waiting = false;
          startSpeech(req);
        }, VOICE_WAIT_MS);
        return;
      }
      startSpeech(req);
    }

    function speak(text, opts) {
      opts = opts || {};
      text = String(text == null ? "" : text).replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
      if (destroyed || !text || !enabled()) return false;
      if (!supported) {
        notify("unavailable", "此浏览器暂不支持发音，仍可继续练习。");
        return false;
      }
      var slow = !!opts.slow;
      var example = !!opts.example;
      var gesture = !!opts.gesture;
      var same = request && request.text === text && request.slow === slow && request.example === example;
      // A second tap while the line is already audible must not clip it.
      // A not-yet-started duplicate from auto-speak stays queued. A button tap
      // (gesture) speaks in this turn so the browser user-activation is kept.
      if (same && (request.started || !gesture)) return true;
      if (typeof options.onBeforeSpeak === "function") {
        try { options.onBeforeSpeak(); } catch (_) {}
      }
      if (gesture) {
        generation += 1;
        clearPlaybackTimers();
        detachUtterance(utterance);
        utterance = null;
        request = null;
        playingVoice = null;
        var tapped = {
          text: text,
          slow: slow,
          example: example,
          generation: generation,
          failedVoices: [],
          retried: false,
          started: false,
          waiting: false,
          dropRetries: 0,
          gesture: true,
        };
        request = tapped;
        last = { text: text, slow: slow, example: example };
        begin(tapped);
        return true;
      }
      // Card enter stops the previous word, then speaks the next one.
      // cancel() is already in flight; a second cancel drops the new utterance.
      if (cancelCooling && !utterance && !request) {
        var queued = {
          text: text,
          slow: slow,
          example: example,
          generation: generation,
          failedVoices: [],
          retried: false,
          started: false,
          waiting: false,
          dropRetries: 0,
          gesture: false,
        };
        request = queued;
        last = { text: text, slow: slow, example: example };
        schedule("speak", function () { begin(queued); }, CANCEL_GAP_MS);
        return true;
      }
      var cancelled = release(true, true) || cancelCooling;
      var req = {
        text: text,
        slow: slow,
        example: example,
        generation: generation,
        failedVoices: [],
        retried: false,
        started: false,
        waiting: false,
        dropRetries: 0,
        gesture: false,
      };
      request = req;
      last = { text: text, slow: slow, example: example };
      if (cancelled) schedule("speak", function () { begin(req); }, CANCEL_GAP_MS);
      else begin(req);
      return true;
    }

    function replay(opts) {
      if (!last) return false;
      var next = opts || {};
      return speak(last.text, {
        slow: Object.prototype.hasOwnProperty.call(next, "slow") ? !!next.slow : last.slow,
        example: Object.prototype.hasOwnProperty.call(next, "example") ? !!next.example : last.example,
      });
    }

    function setAccent(value) {
      if (value !== "en-GB" && value !== "en-US") return false;
      stop();
      accent = value;
      requestedId = "";
      selected = selectVoice(voices, accent, requestedId);
      persist();
      notify("ready", "");
      return true;
    }

    function setVoice(id) {
      id = String(id || "");
      var voice = null;
      if (id) {
        voice = voices.filter(function (v) {
          return isEnglish(v) && !NOVELTY.test(v.name || "") && (voiceId(v) === id || v.voiceURI === id);
        })[0] || null;
        if (!voice) return false;
      }
      stop();
      requestedId = voice ? voiceId(voice) : "";
      selected = selectVoice(voices, accent, requestedId);
      persist();
      notify("ready", "");
      return true;
    }

    function subscribe(fn) {
      if (typeof fn !== "function") return function () {};
      listeners.push(fn);
      try { fn(getState()); } catch (_) {}
      return function () {
        listeners = listeners.filter(function (item) { return item !== fn; });
      };
    }

    function destroy() {
      release(true, false);
      destroyed = true;
      Object.keys(timers).forEach(function (key) {
        if (clear) clear(timers[key]);
      });
      timers = {};
      if (synth && synth.removeEventListener) synth.removeEventListener("voiceschanged", refreshVoices);
      if (host.removeEventListener) host.removeEventListener("pagehide", onPageHide);
      listeners = [];
    }

    function onPageHide() { stop(); }

    if (supported) {
      if (synth.addEventListener) synth.addEventListener("voiceschanged", refreshVoices);
      refreshVoices();
      [250, 1000, 2500].forEach(function (ms) {
        schedule("voicePoll" + ms, refreshVoices, ms);
      });
    }
    if (host.addEventListener) host.addEventListener("pagehide", onPageHide);
    notify();

    return {
      speak: speak,
      replay: replay,
      stop: stop,
      setAccent: setAccent,
      setVoice: setVoice,
      getState: getState,
      subscribe: subscribe,
      destroy: destroy,
    };
  }

  return {
    create: create,
    selectVoice: selectVoice,
    describeVoice: describeVoice,
    voiceId: voiceId,
    WORD_RATE: WORD_RATE,
    EXAMPLE_RATE: EXAMPLE_RATE,
    SLOW_RATE: SLOW_RATE,
    STORAGE_KEY: STORAGE_KEY,
  };
});

/* Local read-aloud evidence. Recording is never pronunciation assessment.
 * No network requests, speech recognition, or audio persistence here.
 * The caller captures account/card ownership and owns replay object URLs.
 */
(function (root, factory) {
  var api = factory(root);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.QMOralOutput = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  var VERSION = 1;
  var MIN_DURATION_MS = 350;
  var MAX_DURATION_MS = 8000;
  var MAX_BYTES = 2 * 1024 * 1024;
  var MIME_TYPES = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm', 'audio/ogg;codecs=opus'];

  function object(value) { return !!value && typeof value === 'object' && !Array.isArray(value); }
  function copyObject(value) {
    var result = {};
    if (object(value)) Object.keys(value).forEach(function (key) {
      Object.defineProperty(result, key, { value: value[key], enumerable: true, writable: true, configurable: true });
    });
    return result;
  }
  function time(value) {
    var parsed = Date.parse(value || '');
    return Number.isFinite(parsed) ? parsed : 0;
  }
  function validId(value) {
    return typeof value === 'string' && /^[a-zA-Z0-9:_-]{1,120}$/.test(value)
      && !/^(?:__proto__|prototype|constructor)$/.test(value);
  }
  function makeAttempt(input) {
    input = input || {};
    var duration = Number(input.durationMs);
    if (!validId(input.id)) throw new Error('朗读记录缺少有效的记录编号。');
    if (!time(input.at)) throw new Error('朗读记录缺少有效的练习时间。');
    if (!Number.isFinite(duration) || duration < MIN_DURATION_MS || duration > MAX_DURATION_MS + 2000) {
      throw new Error('录音时长无效，请重新录制。');
    }
    var attempt = {
      id: input.id,
      at: new Date(time(input.at)).toISOString(),
      durationMs: Math.round(duration),
      mimeType: String(input.mimeType || '').slice(0, 80),
      status: 'recorded',
      assisted: !!input.assisted,
      referencePlayed: !!input.referencePlayed,
      audioCheck: input.audioCheck === 'signal_detected' ? 'signal_detected' : 'unchecked',
    };
    // Deliberately do not accept a supplied score, transcript, or passed flag.
    return typeof Object.freeze === 'function' ? Object.freeze(attempt) : attempt;
  }
  function appendAttempt(existing, attempt) {
    var clean = makeAttempt(attempt);
    var result = copyObject(existing);
    result.version = VERSION;
    result.attempts = copyObject(existing && existing.attempts);
    // A retry cannot replace the evidence stored for the same immutable id.
    if (!Object.prototype.hasOwnProperty.call(result.attempts, clean.id)) result.attempts[clean.id] = clean;
    return result;
  }
  function summarize(existing) {
    var attempts = object(existing && existing.attempts) ? existing.attempts : {};
    var rows = Object.keys(attempts).map(function (id) { return attempts[id]; }).filter(function (item) {
      return object(item) && validId(item.id) && item.status === 'recorded' && time(item.at)
        && Number(item.durationMs) >= MIN_DURATION_MS && Number(item.durationMs) <= MAX_DURATION_MS + 2000;
    });
    rows.sort(function (a, b) { return time(b.at) - time(a.at) || String(b.id).localeCompare(String(a.id)); });
    return {
      status: rows.length ? 'recorded' : 'unpracticed',
      label: rows.length ? '已录音 · 待验证' : '未练习',
      attemptCount: rows.length,
      lastAt: rows.length ? rows[0].at : '',
      lastAttempt: rows.length ? rows[0] : null,
    };
  }

  function createRecorder(options) {
    options = options || {};
    var host = options.window || root || {};
    var nav = options.navigator || host.navigator || {};
    var media = options.mediaDevices || nav.mediaDevices;
    var Recorder = options.MediaRecorder || host.MediaRecorder;
    var BlobType = options.Blob || host.Blob;
    var AudioContextType = Object.prototype.hasOwnProperty.call(options, 'AudioContext')
      ? options.AudioContext : (host.AudioContext || host.webkitAudioContext);
    var later = options.setTimeout || (host.setTimeout && host.setTimeout.bind(host));
    var clear = options.clearTimeout || (host.clearTimeout && host.clearTimeout.bind(host));
    var now = options.now || function () { return host.performance && host.performance.now ? host.performance.now() : Date.now(); };
    var supported = !!(media && typeof media.getUserMedia === 'function' && Recorder && BlobType && later && clear);
    var maxDuration = Math.max(1000, Math.min(MAX_DURATION_MS, Number(options.maxDurationMs) || MAX_DURATION_MS));
    var requestTimeout = Math.max(1000, Math.min(30000, Number(options.requestTimeoutMs) || 15000));
    var destroyed = false;
    var current = null;
    var status = supported ? 'idle' : 'unsupported';
    var message = supported ? '' : '此浏览器暂不支持录音，可继续其他练习。';
    var lastDuration = 0;

    function active(run) { return !destroyed && current === run && !run.cancelled; }
    function getState() {
      var elapsed = current && current.startedAt !== null
        ? Math.max(0, (current.stoppedAt === null ? now() : current.stoppedAt) - current.startedAt) : lastDuration;
      return {
        supported: supported && !destroyed,
        status: destroyed ? 'destroyed' : status,
        message: message,
        elapsedMs: Math.round(elapsed),
        maxDurationMs: maxDuration,
        canStart: supported && !destroyed && !current,
        canStop: !!(current && status === 'recording'),
      };
    }
    function notify(next, note) {
      if (next) status = next;
      if (note !== undefined) message = note;
      if (typeof options.onState === 'function') {
        try { options.onState(getState()); } catch (_) {}
      }
    }
    function stopTracks(stream) {
      try { if (stream) stream.getTracks().forEach(function (track) { try { track.stop(); } catch (_) {} }); } catch (_) {}
    }
    function releaseMonitor(run) {
      try { if (run.source) run.source.disconnect(); } catch (_) {}
      try { if (run.analyser) run.analyser.disconnect(); } catch (_) {}
      if (run.audioContext) {
        try {
          var closed = run.audioContext.close();
          if (closed && closed.catch) closed.catch(function () {});
        } catch (_) {}
      }
      run.source = run.analyser = run.audioContext = null;
    }
    function clearTimers(run) {
      Object.keys(run.timers).forEach(function (key) { clear(run.timers[key]); });
      run.timers = {};
    }
    function dispose(run, stopRecorder) {
      if (!run) return;
      run.cancelled = true;
      if (run.cancelRequest) { run.cancelRequest(null); run.cancelRequest = null; }
      clearTimers(run);
      var recorder = run.recorder;
      if (recorder) {
        recorder.ondataavailable = recorder.onstop = recorder.onerror = null;
        if (stopRecorder && recorder.state !== 'inactive') { try { recorder.stop(); } catch (_) {} }
      }
      stopTracks(run.stream);
      releaseMonitor(run);
      run.stream = run.recorder = null;
      run.chunks = [];
      if (current === run) current = null;
    }
    function report(run, code, note) {
      if (run && !active(run)) return;
      if (run) dispose(run, true);
      notify('error', note);
      if (typeof options.onError === 'function') {
        try { options.onError({ code: code, message: note }); } catch (_) {}
      }
    }
    function permissionError(error) {
      var name = error && error.name;
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError' || name === 'SecurityError') {
        return ['permission', '请允许麦克风权限后重试，也可以继续其他练习。'];
      }
      if (name === 'NotFoundError' || name === 'DevicesNotFoundError') return ['no_device', '没有找到麦克风，请检查设备后重试。'];
      if (name === 'NotReadableError' || name === 'TrackStartError') return ['device_busy', '麦克风暂不可用，请关闭其他录音后重试。'];
      return ['recording_failed', '录音暂不可用，请重试；其他练习可继续。'];
    }
    function sample(run) {
      if (!active(run) || status !== 'recording') return;
      if (run.analyser && run.audioContext && run.audioContext.state === 'running') {
        try {
          var sum = 0, index;
          if (typeof run.analyser.getFloatTimeDomainData === 'function') {
            var floats = new Float32Array(run.analyser.fftSize);
            run.analyser.getFloatTimeDomainData(floats);
            for (index = 0; index < floats.length; index++) sum += floats[index] * floats[index];
            sum = Math.sqrt(sum / floats.length);
          } else {
            var bytes = new Uint8Array(run.analyser.fftSize);
            run.analyser.getByteTimeDomainData(bytes);
            for (index = 0; index < bytes.length; index++) sum += Math.pow((bytes[index] - 128) / 128, 2);
            sum = Math.sqrt(sum / bytes.length);
          }
          run.sampleCount += 1;
          if (sum >= 0.004) run.signalCount += 1;
        } catch (_) { run.monitorFailed = true; releaseMonitor(run); }
      }
      notify();
      if (active(run) && status === 'recording') run.timers.sample = later(function () { sample(run); }, 100);
    }
    function monitor(run) {
      if (!AudioContextType) return;
      try {
        var context = new AudioContextType();
        run.audioContext = context;
        run.analyser = context.createAnalyser();
        run.analyser.fftSize = 1024;
        run.source = context.createMediaStreamSource(run.stream);
        run.source.connect(run.analyser);
        // Do not connect the microphone to speakers (no audible feedback).
        if (context.state === 'suspended' && typeof context.resume === 'function') {
          var resumed = context.resume();
          if (resumed && resumed.catch) resumed.catch(function () {});
        }
      } catch (_) { releaseMonitor(run); }
    }
    function finish(run) {
      if (!active(run)) return;
      var duration = Math.round(Math.max(0, (run.stoppedAt === null ? now() : run.stoppedAt) - run.startedAt));
      if (duration < MIN_DURATION_MS) { report(run, 'too_short', '录音太短，请完整读出单词后再停止。'); return; }
      if (duration > MAX_DURATION_MS + 2000) { report(run, 'too_long', '录音超时，请重新录制。'); return; }
      if (!run.bytes || !run.chunks.length) { report(run, 'empty', '没有录到声音，请再读一次。'); return; }
      if (!run.monitorFailed && run.sampleCount >= 3 && run.signalCount === 0) {
        report(run, 'silent', '没有检测到清晰声音，请靠近麦克风再读一次。'); return;
      }
      var type = String(run.recorder.mimeType || (run.chunks[0] && run.chunks[0].type) || run.mimeType || '');
      var blob;
      try { blob = new BlobType(run.chunks, type ? { type: type } : {}); }
      catch (_) { report(run, 'encoding', '录音格式暂不可用，请换一个浏览器重试。'); return; }
      if (!blob.size) { report(run, 'empty', '没有录到声音，请再读一次。'); return; }
      var result = { blob: blob, durationMs: duration, mimeType: type, audioCheck: run.signalCount > 0 ? 'signal_detected' : 'unchecked' };
      lastDuration = duration;
      dispose(run, false);
      notify('complete', '录音完成，发音尚待验证。');
      if (typeof options.onComplete === 'function') {
        try { options.onComplete(result); }
        catch (_) { report(null, 'completion_failed', '录音已完成，但练习记录未能保存，请重试。'); }
      }
    }
    function stop() {
      var run = current;
      if (!run || !active(run) || status !== 'recording') return false;
      run.stoppedAt = now();
      lastDuration = Math.max(0, run.stoppedAt - run.startedAt);
      if (run.timers.maximum) clear(run.timers.maximum);
      if (run.timers.sample) clear(run.timers.sample);
      notify('stopping', '正在整理录音…');
      if (!active(run)) return false;
      run.timers.finish = later(function () {
        report(run, 'stop_timeout', '录音未能完成，请重试；其他练习可继续。');
      }, 3000);
      try { run.recorder.stop(); }
      catch (_) { report(run, 'stop_failed', '录音未能完成，请重新录制。'); return false; }
      stopTracks(run.stream);
      return true;
    }
    async function start() {
      if (!supported || destroyed || current) {
        if (!supported && !destroyed) notify('unsupported', '此浏览器暂不支持录音，可继续其他练习。');
        return false;
      }
      lastDuration = 0;
      var run = {
        cancelled: false, stream: null, recorder: null, audioContext: null, analyser: null, source: null,
        timers: {}, chunks: [], bytes: 0, startedAt: null, stoppedAt: null, sampleCount: 0, signalCount: 0, mimeType: '',
      };
      current = run;
      notify('requesting', '请允许麦克风权限…');
      if (!active(run)) return false;
      var request;
      try { request = Promise.resolve(media.getUserMedia({ audio: true })); }
      catch (error) { var immediate = permissionError(error); report(run, immediate[0], immediate[1]); return false; }
      // Permission prompts cannot be canceled. Release a late stream immediately.
      request.then(function (stream) { if (!active(run)) stopTracks(stream); }, function () {});
      var timeout = new Promise(function (_, reject) {
        run.timers.permission = later(function () {
          var error = new Error('microphone permission timeout'); error.name = 'PermissionTimeout'; reject(error);
        }, requestTimeout);
      });
      try {
        var cancelled = new Promise(function (resolve) { run.cancelRequest = resolve; });
        var stream = await Promise.race([request, timeout, cancelled]);
        if (!active(run)) { stopTracks(stream); return false; }
        clear(run.timers.permission);
        delete run.timers.permission;
        run.stream = stream;
        var mimeType = '';
        if (typeof Recorder.isTypeSupported === 'function') {
          for (var index = 0; index < MIME_TYPES.length; index++) {
            if (Recorder.isTypeSupported(MIME_TYPES[index])) { mimeType = MIME_TYPES[index]; break; }
          }
        }
        run.mimeType = mimeType;
        try { run.recorder = mimeType ? new Recorder(stream, { mimeType: mimeType }) : new Recorder(stream); }
        catch (_) { report(run, 'format', '此浏览器的录音格式暂不可用，可继续其他练习。'); return false; }
        run.recorder.ondataavailable = function (event) {
          if (!active(run) || !event.data || !event.data.size) return;
          run.bytes += event.data.size;
          if (run.bytes > MAX_BYTES) { report(run, 'too_large', '录音过大，请重新录制。'); return; }
          run.chunks.push(event.data);
        };
        run.recorder.onstop = function () { finish(run); };
        run.recorder.onerror = function () { report(run, 'recording_failed', '录音中断，请重新录制。'); };
        monitor(run);
        run.startedAt = now();
        run.recorder.start(100);
        if (!active(run)) return false;
        notify('recording', '请读出单词，完成后点停止。');
        if (!active(run)) return false;
        run.timers.maximum = later(function () { if (active(run)) stop(); }, maxDuration);
        sample(run);
        return true;
      } catch (error) {
        if (!active(run)) return false;
        if (error && error.name === 'PermissionTimeout') report(run, 'permission_timeout', '等待麦克风权限超时，请允许权限后重试。');
        else { var mapped = permissionError(error); report(run, mapped[0], mapped[1]); }
        return false;
      }
    }
    function cancel() {
      if (current) dispose(current, true);
      lastDuration = 0;
      if (!destroyed) notify(supported ? 'idle' : 'unsupported', supported ? '' : '此浏览器暂不支持录音，可继续其他练习。');
    }
    function destroy() {
      destroyed = true;
      if (current) dispose(current, true);
      lastDuration = 0;
    }
    return { start: start, stop: stop, cancel: cancel, destroy: destroy, getState: getState };
  }

  return {
    version: VERSION,
    maxDurationMs: MAX_DURATION_MS,
    makeAttempt: makeAttempt,
    appendAttempt: appendAttempt,
    summarize: summarize,
    createRecorder: createRecorder,
  };
});

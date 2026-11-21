/* Explicit, authenticated pronunciation assessment. No work runs on load.
 * Audio leaves this page only through the configured QuizMario Edge Function.
 * The server owns the evaluator key, quota and result; this helper never scores.
 */
(function (root, factory) {
  var api = factory(root);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.QMOralAssessment = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  var ENDPOINT = 'https://cmainasvlfdynidabunp.supabase.co/functions/v1/word-pronunciation';
  var SAMPLE_RATE = 16000;
  var MIN_DURATION_MS = 350;
  var MAX_DURATION_MS = 10000;
  var MAX_BLOB_BYTES = 2 * 1024 * 1024;
  var MAX_RESPONSE_CHARS = 32768;
  var MODEL_VERSION = 'xfyun-ise-en-v1';
  var MESSAGES = {
    cancelled: '本次评测已取消，朗读记录已保留。',
    assessment_timeout: '评测等待超时，朗读记录已保留，可稍后查询本次结果。',
    conversion_timeout: '录音处理超时，请重新录制后再试。',
    audio_unsupported: '当前浏览器无法处理这段录音，请换用系统浏览器重试。',
    audio_invalid: '这段录音无法用于评测，请重新录制。',
    audio_too_short: '录音太短，请完整读出单词后再试。',
    audio_too_long: '录音过长，请重新录制，每次最多 8 秒。',
    service_unavailable: '发音评测暂未就绪，朗读记录已保留。',
    unauthorized: '登录状态已失效，请重新登录后评测。',
    forbidden: '当前账号暂不可使用发音评测，朗读记录已保留。',
    unsupported_target: '这个词条暂不支持自动评测，仍可录音回听。',
    quota_exhausted: '本时段评测额度已用完，朗读记录已保留，请稍后再练。',
    rate_limited: '评测请求较频繁，请稍等再试，朗读记录已保留。',
    assessment_pending: '本次评测仍在处理中，可稍后查询结果。',
    assessment_rejected: '这段录音暂时无法可靠评测，请靠近麦克风重新读一次。',
    upstream_unavailable: '评测服务暂时无法响应，朗读记录已保留。',
    result_unavailable: '本次评测结果暂不可用，朗读记录已保留。',
    attempt_conflict: '本次录音与评测记录不一致，请重新录制。',
    invalid_result: '收到的评测结果无法核对，准确度仍待验证。',
    missing_attempt: '朗读记录尚未保存，暂不能附加评测结果。',
  };

  function object(value) { return !!value && typeof value === 'object' && !Array.isArray(value); }
  function fail(code) {
    var known = Object.prototype.hasOwnProperty.call(MESSAGES, code) ? code : 'upstream_unavailable';
    var error = new Error(MESSAGES[known]);
    error.name = 'OralAssessmentError';
    error.code = known;
    return error;
  }
  function copyObject(value) {
    var result = {};
    if (object(value)) Object.keys(value).forEach(function (key) {
      Object.defineProperty(result, key, {value:value[key], enumerable:true, writable:true, configurable:true});
    });
    return result;
  }
  function validId(value, maximum) {
    return typeof value === 'string' && value.length <= maximum && /^[a-zA-Z0-9:_-]+$/.test(value)
      && !/^(?:__proto__|prototype|constructor)$/.test(value);
  }
  function validOwner(value) {
    return typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);
  }
  function expectedFields(input) {
    input = input || {};
    if (!validId(input.attemptId, 120) || !validOwner(input.owner) ||
        typeof input.cardKey !== 'string' || !input.cardKey.length || input.cardKey.length > 240 ||
        /[\u0000-\u001f\u007f]/.test(input.cardKey)) throw fail('attempt_conflict');
    if (typeof input.word !== 'string' || !input.word.length || input.word.length > 80 ||
        input.word !== input.word.trim() || /[\u0000-\u001f\u007f<>\[\]]/.test(input.word)) throw fail('unsupported_target');
    return {attemptId:input.attemptId, owner:input.owner, cardKey:input.cardKey, word:input.word};
  }
  function score(value) {
    if (value === null || value === undefined) return null;
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 100) throw fail('invalid_result');
    return value;
  }
  function validateAssessment(value, expected) {
    var context = expectedFields(expected);
    if (!object(value) || !validId(value.id, 200) || value.provider !== 'xfyun-ise' ||
        value.modelVersion !== MODEL_VERSION || value.status !== 'assessed' || value.scale !== 100 ||
        value.is_rejected === true || value.is_rejected === 'true' || value.rejected === true ||
        (value.except_info !== undefined && value.except_info !== null && value.except_info !== 0 && value.except_info !== '0') ||
        value.owner !== context.owner || value.attemptId !== context.attemptId ||
        value.cardKey !== context.cardKey || value.word !== context.word ||
        typeof value.at !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(value.at) ||
        !Number.isFinite(Date.parse(value.at))) throw fail('invalid_result');
    var accuracy = score(value.accuracyScore), total = score(value.totalScore);
    if (accuracy === null && total === null) throw fail('invalid_result');
    var clean = {
      id:value.id, attemptId:context.attemptId, owner:context.owner, cardKey:context.cardKey, word:context.word,
      provider:'xfyun-ise', at:new Date(value.at).toISOString(), scale:100,
      accuracyScore:accuracy, totalScore:total, status:'assessed', modelVersion:MODEL_VERSION,
    };
    return typeof Object.freeze === 'function' ? Object.freeze(clean) : clean;
  }
  function appendAssessment(existing, value, expected) {
    var clean = validateAssessment(value, expected);
    var attempts = existing && existing.attempts;
    if (!object(attempts) || !Object.prototype.hasOwnProperty.call(attempts, clean.attemptId) ||
        !object(attempts[clean.attemptId]) || attempts[clean.attemptId].id !== clean.attemptId ||
        attempts[clean.attemptId].status !== 'recorded') throw fail('missing_attempt');
    var next = copyObject(existing);
    if (next.version === undefined) next.version = 1;
    next.assessments = copyObject(existing && existing.assessments);
    if (!Object.prototype.hasOwnProperty.call(next.assessments, clean.id)) next.assessments[clean.id] = clean;
    return next;
  }
  function getAssessment(existing, attemptId, expected) {
    var rows = existing && existing.assessments;
    var attempts = existing && existing.attempts;
    if (!object(rows) || !object(attempts) || !Object.prototype.hasOwnProperty.call(attempts,attemptId) ||
        !object(attempts[attemptId]) || attempts[attemptId].id !== attemptId || attempts[attemptId].status !== 'recorded') return null;
    var context = copyObject(expected);
    context.attemptId = attemptId;
    var valid = [];
    Object.keys(rows).forEach(function (id) {
      if (!rows[id] || rows[id].id !== id || rows[id].attemptId !== attemptId) return;
      try { valid.push(validateAssessment(rows[id], context)); } catch (_) {}
    });
    valid.sort(function (a,b) { return Date.parse(b.at)-Date.parse(a.at) || b.id.localeCompare(a.id); });
    return valid.length ? valid[0] : null;
  }

  function validateSamples(samples, sampleRate) {
    if (!samples || !Number.isInteger(samples.length) || samples.length < 1 ||
        !Number.isFinite(sampleRate) || sampleRate < 8000 || sampleRate > 192000 ||
        samples.length > Math.ceil(sampleRate * MAX_DURATION_MS / 1000)) throw fail('audio_invalid');
    for (var index=0; index<samples.length; index++) {
      if (typeof samples[index] !== 'number' || !Number.isFinite(samples[index])) throw fail('audio_invalid');
    }
  }
  function mixToMono(channels, sampleRate) {
    if (!Array.isArray(channels) || channels.length < 1 || channels.length > 2) throw fail('audio_invalid');
    channels.forEach(function (channel) { validateSamples(channel, sampleRate); });
    var length = channels[0].length;
    if (channels.some(function (channel) { return channel.length !== length; })) throw fail('audio_invalid');
    var mono = new Float32Array(length);
    for (var i=0; i<length; i++) {
      var value=0;
      for (var c=0; c<channels.length; c++) value += channels[c][i] / channels.length;
      mono[i] = value;
    }
    return mono;
  }
  function resampleMono(samples, sourceRate) {
    validateSamples(samples, sourceRate);
    if (sourceRate === SAMPLE_RATE) return new Float32Array(samples);
    var ratio = sourceRate / SAMPLE_RATE;
    var length = Math.floor(samples.length / ratio);
    if (length < 1 || length > SAMPLE_RATE * MAX_DURATION_MS / 1000) throw fail('audio_invalid');
    var out = new Float32Array(length);
    if (ratio < 1) {
      for (var i=0; i<length; i++) {
        var position=i*ratio, first=Math.floor(position), fraction=position-first;
        out[i] = samples[first]*(1-fraction) + samples[Math.min(first+1,samples.length-1)]*fraction;
      }
      return out;
    }
    // Windowed-sinc low-pass before downsampling. A bounded phase bank avoids
    // computing trigonometry per output sample and suppresses aliased high tones.
    var radius=Math.ceil(16*ratio), cutoff=0.94/ratio, phases=512, kernels=[];
    function kernel(phase) {
      if (kernels[phase]) return kernels[phase];
      var weights=new Float64Array(radius*2+1), offset=phase/phases;
      for (var tap=-radius; tap<=radius; tap++) {
        var distance=tap-offset, normalized=distance/(radius+1);
        var window=0.42+0.5*Math.cos(Math.PI*normalized)+0.08*Math.cos(2*Math.PI*normalized);
        var argument=Math.PI*distance*cutoff;
        weights[tap+radius]=cutoff*(Math.abs(argument)<1e-12 ? 1 : Math.sin(argument)/argument)*window;
      }
      kernels[phase]=weights;
      return weights;
    }
    for (var n=0; n<length; n++) {
      var at=n*ratio, center=Math.floor(at), phase=Math.floor((at-center)*phases);
      var weights=kernel(phase), sum=0, weight=0;
      for (var t=-radius; t<=radius; t++) {
        var source=center+t;
        if (source<0 || source>=samples.length) continue;
        var w=weights[t+radius];
        sum += samples[source]*w; weight += w;
      }
      out[n] = Math.abs(weight)>1e-12 ? sum/weight : samples[Math.min(center,samples.length-1)];
    }
    return out;
  }
  function pcm16Bytes(samples) {
    validateSamples(samples, SAMPLE_RATE);
    var bytes=new Uint8Array(samples.length*2), view=new DataView(bytes.buffer);
    for (var i=0; i<samples.length; i++) {
      var value=Math.max(-1,Math.min(1,samples[i]));
      view.setInt16(i*2, Math.round(value*(value<0 ? 32768 : 32767)), true);
    }
    return bytes;
  }
  function bytesToBase64(bytes) {
    var alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/', parts=[];
    for (var i=0; i<bytes.length; i+=3) {
      var value=(bytes[i]<<16)|((bytes[i+1]||0)<<8)|(bytes[i+2]||0);
      parts.push(alphabet[(value>>>18)&63]+alphabet[(value>>>12)&63]+
        (i+1<bytes.length ? alphabet[(value>>>6)&63] : '=')+
        (i+2<bytes.length ? alphabet[value&63] : '='));
    }
    return parts.join('');
  }
  function encodeAudioBuffer(buffer) {
    if (!buffer || typeof buffer.getChannelData !== 'function' ||
        !Number.isInteger(buffer.numberOfChannels) || buffer.numberOfChannels<1 || buffer.numberOfChannels>2 ||
        !Number.isInteger(buffer.length) || buffer.length<1 ||
        !Number.isFinite(buffer.sampleRate) || buffer.sampleRate<8000 || buffer.sampleRate>192000) throw fail('audio_invalid');
    var duration=buffer.length/buffer.sampleRate*1000;
    if (duration<MIN_DURATION_MS) throw fail('audio_too_short');
    if (duration>MAX_DURATION_MS) throw fail('audio_too_long');
    var channels=[];
    for (var i=0; i<buffer.numberOfChannels; i++) {
      var channel=buffer.getChannelData(i);
      if (!channel || channel.length !== buffer.length) throw fail('audio_invalid');
      channels.push(channel);
    }
    var mono=resampleMono(mixToMono(channels,buffer.sampleRate),buffer.sampleRate), bytes=pcm16Bytes(mono);
    return {format:'pcm_s16le',sampleRate:SAMPLE_RATE,channels:1,data:bytesToBase64(bytes),
      durationMs:Math.round(mono.length/SAMPLE_RATE*1000),byteLength:bytes.length};
  }

  function scopeFor(input, maximum, timeoutCode) {
    var host=input.window || root || {}, Controller=host.AbortController || (root && root.AbortController);
    if (!Controller) throw fail('audio_unsupported');
    var controller=new Controller(), external=input.signal, timedOut=false;
    var set=host.setTimeout ? host.setTimeout.bind(host) : root.setTimeout.bind(root);
    var clear=host.clearTimeout ? host.clearTimeout.bind(host) : root.clearTimeout.bind(root);
    var duration=Number(input.timeoutMs);
    duration=Number.isFinite(duration) && duration>0 ? Math.max(100,Math.min(maximum,duration)) : maximum;
    function cancel() { controller.abort(); }
    if (external) {
      if (external.aborted) cancel();
      else external.addEventListener('abort',cancel,{once:true});
    }
    var timer=set(function () { timedOut=true; cancel(); },duration);
    return {signal:controller.signal,
      check:function () { if (controller.signal.aborted) throw fail(timedOut ? timeoutCode : 'cancelled'); },
      error:function () { return fail(timedOut ? timeoutCode : 'cancelled'); },
      end:function () { clear(timer); if (external) external.removeEventListener('abort',cancel); },
    };
  }
  function abortable(promise, signal) {
    return new Promise(function (resolve,reject) {
      var settled=false;
      function finish(error,value) {
        if (settled) return;
        settled=true;
        signal.removeEventListener('abort',cancel);
        if (error) reject(error); else resolve(value);
      }
      function cancel() { finish(fail('cancelled')); }
      if (signal.aborted) cancel();
      else signal.addEventListener('abort',cancel,{once:true});
      Promise.resolve(promise).then(function (value) { finish(null,value); },function (error) { finish(error); });
    });
  }
  function decode(context, bytes) {
    return new Promise(function (resolve,reject) {
      try {
        var result=context.decodeAudioData(bytes,resolve,reject);
        if (result && typeof result.then==='function') result.then(resolve,reject);
      } catch (error) { reject(error); }
    });
  }
  async function convertBlobToPcm(blob, options) {
    options=options || {};
    var host=options.window || root || {}, scope=scopeFor(options,8000,'conversion_timeout'), context=null;
    try {
      scope.check();
      if (!blob || !Number.isFinite(blob.size) || blob.size<=0 || blob.size>MAX_BLOB_BYTES || typeof blob.arrayBuffer!=='function') throw fail('audio_invalid');
      var Offline=host.OfflineAudioContext || host.webkitOfflineAudioContext;
      var Live=host.AudioContext || host.webkitAudioContext;
      if (Offline) { try { context=new Offline(1,1,SAMPLE_RATE); } catch (_) {} }
      if (!context && Live) {
        try { context=new Live({sampleRate:SAMPLE_RATE}); }
        catch (_) { try { context=new Live(); } catch (_) {} }
      }
      if (!context || typeof context.decodeAudioData!=='function') throw fail('audio_unsupported');
      var bytes=await abortable(blob.arrayBuffer(),scope.signal);
      scope.check();
      if (!bytes || bytes.byteLength!==blob.size || bytes.byteLength>MAX_BLOB_BYTES) throw fail('audio_invalid');
      var buffer=await abortable(decode(context,bytes),scope.signal);
      scope.check();
      return encodeAudioBuffer(buffer);
    } catch (error) {
      if (scope.signal.aborted) throw scope.error();
      if (error && error.name==='OralAssessmentError') throw error;
      throw fail('audio_invalid');
    } finally {
      scope.end();
      if (context && typeof context.close==='function') {
        try { var closing=context.close(); if (closing && closing.catch) closing.catch(function () {}); } catch (_) {}
      }
    }
  }

  function authHeaders(input) {
    if (input.endpoint !== ENDPOINT) throw fail('service_unavailable');
    if (typeof input.accessToken!=='string' || !/^[A-Za-z0-9._~-]{20,8192}$/.test(input.accessToken)) throw fail('unauthorized');
    // Only the publishable browser key is accepted. A server secret must never
    // be carried by this helper or confused with a student's access token.
    if (typeof input.publicKey!=='string' || !/^sb_publishable_[A-Za-z0-9_-]{4,200}$/.test(input.publicKey)) throw fail('service_unavailable');
    return {Authorization:'Bearer '+input.accessToken,apikey:input.publicKey,'Content-Type':'application/json'};
  }
  function remoteError(response, body) {
    var code=body && body.code;
    if (typeof code==='string' && Object.prototype.hasOwnProperty.call(MESSAGES,code)) return fail(code);
    if (response.status===401) return fail('unauthorized');
    if (response.status===403) return fail('forbidden');
    if (response.status===429) return fail('quota_exhausted');
    if (response.status===404 || response.status===503) return fail('service_unavailable');
    return fail('upstream_unavailable');
  }
  async function request(input, method) {
    input=input || {};
    var checking=method==='STATUS';
    if (checking && !validOwner(input.owner)) throw fail('unauthorized');
    var context=checking ? {owner:input.owner} : expectedFields(input), headers=authHeaders(input);
    var host=input.window || root || {}, fetcher=host.fetch ? host.fetch.bind(host) : root && root.fetch && root.fetch.bind(root);
    if (!fetcher) throw fail('service_unavailable');
    var scope=scopeFor(input,checking ? 8000 : 25000,'assessment_timeout');
    try {
      scope.check();
      var url=ENDPOINT, init={method:method==='POST' ? 'POST' : 'GET',headers:headers,signal:scope.signal,
        cache:'no-store',credentials:'omit',redirect:'error',referrerPolicy:'no-referrer'};
      if (method==='POST') {
        var pcm=await convertBlobToPcm(input.blob,{window:host,signal:scope.signal});
        scope.check();
        init.body=JSON.stringify({attemptId:context.attemptId,cardKey:context.cardKey,word:context.word,
          audio:{format:pcm.format,sampleRate:pcm.sampleRate,channels:pcm.channels,data:pcm.data}});
      } else if (!checking) url += '?attemptId='+encodeURIComponent(context.attemptId);
      var response=await abortable(fetcher(url,init),scope.signal);
      scope.check();
      var length=Number(response.headers && response.headers.get && response.headers.get('content-length'));
      if (Number.isFinite(length) && length>MAX_RESPONSE_CHARS*4) throw fail('invalid_result');
      var text=await abortable(response.text(),scope.signal);
      scope.check();
      if (text.length>MAX_RESPONSE_CHARS) throw fail('invalid_result');
      var body;
      try { body=JSON.parse(text); } catch (_) { throw fail('invalid_result'); }
      if (!response.ok || !body || body.ok!==true) throw remoteError(response,body);
      if (checking) {
        if (typeof body.ready!=='boolean' || body.provider!=='xfyun-ise') throw fail('invalid_result');
        return Object.freeze({ready:body.ready,provider:'xfyun-ise'});
      }
      return validateAssessment(body.assessment,context);
    } catch (error) {
      if (scope.signal.aborted) throw scope.error();
      if (error && error.name==='OralAssessmentError') throw error;
      throw fail('upstream_unavailable');
    } finally { scope.end(); }
  }
  function assess(input) { return request(input,'POST'); }
  function recover(input) { return request(input,'GET'); }
  function availability(input) { return request(input,'STATUS'); }

  return {endpoint:ENDPOINT,modelVersion:MODEL_VERSION,sampleRate:SAMPLE_RATE,
    mixToMono:mixToMono,resampleMono:resampleMono,pcm16Bytes:pcm16Bytes,encodeAudioBuffer:encodeAudioBuffer,
    convertBlobToPcm:convertBlobToPcm,assess:assess,recover:recover,availability:availability,
    validateAssessment:validateAssessment,appendAssessment:appendAssessment,getAssessment:getAssessment};
});

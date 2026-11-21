/* Fictional audio and account fixtures only; these tests never contact a provider. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const oral = require('../grok/oral-assessment.js');

const OWNER = '11111111-1111-4111-8111-111111111111';
const OTHER_OWNER = '22222222-2222-4222-8222-222222222222';
const CONTEXT = Object.freeze({attemptId:'fictional-oral-1',owner:OWNER,cardKey:'en:apple',word:'apple'});
const AUTH = Object.freeze({endpoint:oral.endpoint,publicKey:'sb_publishable_fictional_browser_key',accessToken:'fictional.student_access.token_for_unit_tests'});
const tests = [];
function test(name, fn) { tests.push({name,fn}); }
function row(extra = {}) {
  return {id:'fictional-assessment-1',...CONTEXT,provider:'xfyun-ise',at:'2026-11-20T10:00:00Z',
    scale:100,accuracyScore:84.5,totalScore:81,status:'assessed',modelVersion:'xfyun-ise-en-v1',...extra};
}
function record(id = CONTEXT.attemptId, extra = {}) {
  return {id,at:'2026-11-20T09:59:58Z',durationMs:1000,mimeType:'audio/webm',status:'recorded',assisted:true,...extra};
}
function saved(extra = {}) { return {version:1,attempts:{[CONTEXT.attemptId]:record()},...extra}; }
function expectCode(code) { return error => { assert.equal(error.name,'OralAssessmentError'); assert.equal(error.code,code); return true; }; }
async function flush() { for (let i=0; i<25; i++) await Promise.resolve(); }
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes,no) => { resolve=yes; reject=no; });
  return {promise,resolve,reject};
}
function clock() {
  let now=0, sequence=0;
  const pending=new Map();
  return {
    setTimeout(fn, delay) { const id=++sequence; pending.set(id,{fn,at:now+delay}); return id; },
    clearTimeout(id) { pending.delete(id); },
    size() { return pending.size; },
    advance(ms) {
      const end=now+ms;
      for (let limit=0; limit<10000; limit++) {
        const next=[...pending.entries()].filter(([,value])=>value.at<=end).sort((a,b)=>a[1].at-b[1].at || a[0]-b[0])[0];
        if (!next) { now=end; return; }
        now=next[1].at; pending.delete(next[0]); next[1].fn();
      }
      throw new Error('Timer loop');
    },
  };
}
function audioBuffer(options = {}) {
  const sampleRate=options.sampleRate || 48000;
  const length=options.length || Math.round((options.durationMs || 500)*sampleRate/1000);
  const channels=options.channels || [Float32Array.from({length},(_,i)=>0.25*Math.sin(2*Math.PI*1000*i/sampleRate))];
  return {sampleRate,length,numberOfChannels:channels.length,getChannelData(index) { return channels[index]; }};
}
function fixture(options = {}) {
  const time=clock(), contexts=[], calls=[], bytesCalls=[];
  const buffer=options.buffer || audioBuffer();
  function decoder(bytes, done, fail) {
    bytesCalls.push(bytes);
    if (options.decodeThrows) throw new Error('fictional decoder failure');
    if (options.decodeDeferred) return options.decodeDeferred.promise;
    if (options.decodeReject) return Promise.reject(new Error('fictional unsupported codec'));
    if (options.legacyDecode) { Promise.resolve().then(()=>done(buffer)); return; }
    return Promise.resolve(buffer);
  }
  class Offline {
    constructor(...args) {
      if (options.offlineThrows) throw new Error('fictional offline unavailable');
      this.kind='offline'; this.args=args; contexts.push(this);
    }
    decodeAudioData(...args) { return decoder(...args); }
  }
  class Live {
    constructor(...args) {
      if (options.liveOptionsThrows && args.length) throw new Error('fictional sample rate option unavailable');
      this.kind='live'; this.args=args; this.closed=0; contexts.push(this);
    }
    decodeAudioData(...args) { return decoder(...args); }
    close() { this.closed++; return options.closeReject ? Promise.reject(new Error('fictional close failure')) : Promise.resolve(); }
  }
  const host={AbortController,setTimeout:time.setTimeout,clearTimeout:time.clearTimeout,
    navigator:{mediaDevices:{getUserMedia() { throw new Error('Assessment must not request a microphone'); }}},
    localStorage:{getItem() { throw new Error('Assessment must not read localStorage'); }},
    fetch(url, init) {
      calls.push({url,init});
      if (options.fetchDeferred) return options.fetchDeferred.promise;
      if (options.fetchReject) return Promise.reject(new Error('fictional network failure'));
      if (options.response) return Promise.resolve(options.response);
      return Promise.resolve(new Response(JSON.stringify(options.body || {ok:true,assessment:row()}),{status:options.status || 200}));
    },
  };
  if (!options.liveOnly && !options.noAudio) host.OfflineAudioContext=Offline;
  if (!options.noAudio) host.AudioContext=Live;
  const blob=options.blob || new Blob(['fictional encoded sound'],{type:'audio/webm'});
  return {host,time,contexts,calls,bytesCalls,blob,buffer,
    input(extra = {}) { return {...CONTEXT,...AUTH,blob,window:host,...extra}; }};
}
function rms(samples, margin = 100) {
  let sum=0;
  for (let i=margin; i<samples.length-margin; i++) sum+=samples[i]*samples[i];
  return Math.sqrt(sum/(samples.length-margin*2));
}

test('loading the browser helper requests no network, microphone, storage, or audio context', () => {
  const activity=[];
  const sandbox={module:{exports:{}},fetch(){activity.push('fetch');},
    AudioContext:function(){activity.push('audio');},OfflineAudioContext:function(){activity.push('offline');},
    navigator:{mediaDevices:{getUserMedia(){activity.push('microphone');}}},
    localStorage:{getItem(){activity.push('storage');}},setTimeout(){activity.push('timer');}};
  vm.runInNewContext(fs.readFileSync(require.resolve('../grok/oral-assessment.js'),'utf8'),sandbox);
  assert.equal(typeof sandbox.QMOralAssessment.assess,'function');
  assert.equal(sandbox.module.exports,sandbox.QMOralAssessment);
  assert.deepEqual(activity,[]);
});

test('PCM output is clipped signed 16-bit little-endian, including genuine zero', () => {
  const bytes=oral.pcm16Bytes([-2,-1,-0.5,0,0.5,1,2]);
  assert.deepEqual([...bytes],[0,128,0,128,0,192,0,0,0,64,255,127,255,127]);
  const view=new DataView(bytes.buffer);
  assert.deepEqual(Array.from({length:7},(_,i)=>view.getInt16(i*2,true)),[-32768,-32768,-16384,0,16384,32767,32767]);
});

test('stereo downmix averages channels without mutating either input', () => {
  const left=new Float32Array([1,0.25,-0.5]),right=new Float32Array([-1,0.75,0.5]);
  const mixed=oral.mixToMono([left,right],16000);
  assert.deepEqual([...mixed],[0,0.5,0]);
  assert.deepEqual([...left],[1,0.25,-0.5]);
  assert.deepEqual([...right],[-1,0.75,0.5]);
  assert.notEqual(oral.mixToMono([left],16000),left);
});

test('invalid channels, nonfinite input, impossible rates, and excess samples fail closed', () => {
  for (const call of [
    ()=>oral.mixToMono([],16000),()=>oral.mixToMono([[1],[1],[1]],16000),
    ()=>oral.mixToMono([[1],[1,2]],16000),()=>oral.mixToMono([[NaN]],16000),
    ()=>oral.mixToMono([[Infinity]],16000),()=>oral.mixToMono([['1']],16000),
    ()=>oral.resampleMono([1],0),()=>oral.resampleMono([1],384000),
    ()=>oral.pcm16Bytes(new Float32Array(160001)),()=>oral.pcm16Bytes([]),
  ]) assert.throws(call,expectCode('audio_invalid'));
});

test('resampling preserves duration and a constant signal across common rates', () => {
  for (const rate of [8000,16000,22050,44100,48000,96000,192000]) {
    const input=new Float32Array(rate/2); input.fill(0.375);
    const output=oral.resampleMono(input,rate);
    assert.equal(output.length,8000);
    for (const value of output) assert.ok(Math.abs(value-0.375)<0.000001);
    assert.notEqual(output,input);
  }
});

test('the low-pass resampler retains a speech-band tone and suppresses aliased high tones', () => {
  for (const rate of [44100,48000]) {
    const low=Float32Array.from({length:rate/2},(_,i)=>0.5*Math.sin(2*Math.PI*1000*i/rate));
    const high=Float32Array.from({length:rate/2},(_,i)=>0.5*Math.sin(2*Math.PI*12000*i/rate));
    const pass=oral.resampleMono(low,rate),stop=oral.resampleMono(high,rate);
    assert.ok(Math.abs(rms(pass)-Math.SQRT1_2*0.5)<0.002,'speech-band amplitude retained');
    assert.ok(rms(stop)<0.001,'12 kHz energy must not alias into the 16 kHz signal');
    let error=0;
    for (let i=100;i<pass.length-100;i++) error+=Math.abs(pass[i]-0.5*Math.sin(2*Math.PI*1000*i/16000));
    assert.ok(error/(pass.length-200)<0.001,'time and phase remain aligned');
  }
});

test('encoded stereo audio has exactly one 16 kHz PCM channel and valid base64 bytes', () => {
  const left=new Float32Array(22050).fill(0.5),right=new Float32Array(22050).fill(-0.25);
  const result=oral.encodeAudioBuffer(audioBuffer({sampleRate:44100,length:22050,channels:[left,right]}));
  assert.equal(result.format,'pcm_s16le'); assert.equal(result.sampleRate,16000); assert.equal(result.channels,1);
  assert.equal(result.durationMs,500); assert.equal(result.byteLength,16000);
  const bytes=Buffer.from(result.data,'base64');
  assert.equal(bytes.length,16000); assert.equal(bytes.readInt16LE(500),4096);
});

test('recording length and decoded shape are bounded before transmission', () => {
  assert.throws(()=>oral.encodeAudioBuffer(audioBuffer({durationMs:349})),expectCode('audio_too_short'));
  assert.equal(oral.encodeAudioBuffer(audioBuffer({sampleRate:16000,durationMs:350})).durationMs,350);
  assert.throws(()=>oral.encodeAudioBuffer(audioBuffer({durationMs:10001})),expectCode('audio_too_long'));
  assert.throws(()=>oral.encodeAudioBuffer({...audioBuffer(),numberOfChannels:3}),expectCode('audio_invalid'));
  assert.throws(()=>oral.encodeAudioBuffer({...audioBuffer(),getChannelData(){return new Float32Array(1);}}),expectCode('audio_invalid'));
  assert.throws(()=>oral.encodeAudioBuffer({...audioBuffer(),sampleRate:Infinity}),expectCode('audio_invalid'));
});

test('Web Audio decoding prefers an offline context and never uses the microphone', async () => {
  const f=fixture();
  const result=await oral.convertBlobToPcm(f.blob,{window:f.host});
  assert.equal(result.sampleRate,16000); assert.equal(f.contexts.length,1);
  assert.equal(f.contexts[0].kind,'offline'); assert.deepEqual(f.contexts[0].args,[1,1,16000]);
  assert.equal(f.bytesCalls.length,1); assert.equal(f.calls.length,0); assert.equal(f.time.size(),0);
});

test('older callback-only decoders work and the live context closes after success', async () => {
  const f=fixture({liveOnly:true,legacyDecode:true});
  const result=await oral.convertBlobToPcm(f.blob,{window:f.host});
  assert.equal(result.durationMs,500); assert.deepEqual(f.contexts[0].args,[{sampleRate:16000}]);
  assert.equal(f.contexts[0].closed,1); assert.equal(f.time.size(),0);
});

test('an unavailable offline context and unsupported sample-rate options fall back safely', async () => {
  const f=fixture({offlineThrows:true,liveOptionsThrows:true});
  await oral.convertBlobToPcm(f.blob,{window:f.host});
  assert.equal(f.contexts.length,1); assert.equal(f.contexts[0].kind,'live');
  assert.deepEqual(f.contexts[0].args,[]); assert.equal(f.contexts[0].closed,1);
});

test('decoder failures close the context and leave the request unsubmitted', async () => {
  for (const options of [{decodeReject:true},{decodeThrows:true},{buffer:audioBuffer({durationMs:200})}]) {
    const f=fixture({...options,liveOnly:true,closeReject:true});
    await assert.rejects(oral.assess(f.input()),expectCode(options.buffer?'audio_too_short':'audio_invalid'));
    assert.equal(f.contexts[0].closed,1); assert.equal(f.calls.length,0); assert.equal(f.time.size(),0);
  }
});

test('unsupported browsers and empty or oversized blobs produce no HTTP request', async () => {
  const unsupported=fixture({noAudio:true});
  await assert.rejects(oral.assess(unsupported.input()),expectCode('audio_unsupported'));
  assert.equal(unsupported.calls.length,0);
  for (const blob of [new Blob([]),{size:2*1024*1024+1,arrayBuffer(){throw new Error('Must not read oversized audio');}},
    {size:4,arrayBuffer(){return Promise.resolve(new ArrayBuffer(2));}}]) {
    const f=fixture({blob});
    await assert.rejects(oral.assess(f.input()),expectCode('audio_invalid'));
    assert.equal(f.calls.length,0); assert.equal(f.time.size(),0);
  }
});

test('audio conversion has its own deadline, closes its context, and does not retry', async () => {
  const decoding=deferred(),f=fixture({decodeDeferred:decoding,liveOnly:true});
  const promise=oral.convertBlobToPcm(f.blob,{window:f.host});
  const rejected=assert.rejects(promise,expectCode('conversion_timeout'));
  await flush(); f.time.advance(8000); await rejected;
  assert.equal(f.contexts[0].closed,1); assert.equal(f.calls.length,0); assert.equal(f.time.size(),0);
  decoding.resolve(f.buffer); await flush(); assert.equal(f.calls.length,0);
});

test('cancelling while reading encoded bytes closes the context and prevents decoding', async () => {
  const bytes=deferred(),controller=new AbortController();
  const f=fixture({liveOnly:true,blob:{size:4,arrayBuffer(){return bytes.promise;}}});
  const rejected=assert.rejects(oral.assess(f.input({signal:controller.signal})),expectCode('cancelled'));
  await flush(); controller.abort(); await rejected;
  assert.equal(f.contexts[0].closed,1); assert.equal(f.bytesCalls.length,0); assert.equal(f.calls.length,0);
  bytes.resolve(new ArrayBuffer(4)); await flush(); assert.equal(f.calls.length,0); assert.equal(f.time.size(),0);
});

test('cancelling during decoding cannot submit a late result for another card or account', async () => {
  const decoding=deferred(),controller=new AbortController(),f=fixture({decodeDeferred:decoding,liveOnly:true});
  const input=f.input({signal:controller.signal});
  const rejected=assert.rejects(oral.assess(input),expectCode('cancelled'));
  await flush(); controller.abort(); input.owner=OTHER_OWNER; input.word='banana'; await rejected;
  decoding.resolve(f.buffer); await flush();
  assert.equal(f.calls.length,0); assert.equal(f.contexts[0].closed,1); assert.equal(f.time.size(),0);
});

test('a pre-cancelled request starts no decoder, request, or surviving timer', async () => {
  const controller=new AbortController(); controller.abort(); const f=fixture();
  await assert.rejects(oral.assess(f.input({signal:controller.signal})),expectCode('cancelled'));
  assert.equal(f.contexts.length,0); assert.equal(f.calls.length,0); assert.equal(f.time.size(),0);
});

test('one explicit assessment sends one authenticated bounded PCM request with no asserted owner', async () => {
  const f=fixture();
  const result=await oral.assess(f.input());
  assert.equal(f.calls.length,1); const request=f.calls[0],body=JSON.parse(request.init.body);
  assert.equal(request.url,oral.endpoint); assert.equal(request.init.method,'POST');
  assert.equal(request.init.headers.Authorization,'Bearer '+AUTH.accessToken);
  assert.equal(request.init.headers.apikey,AUTH.publicKey);
  assert.equal(request.init.headers['Content-Type'],'application/json');
  assert.equal(request.init.credentials,'omit'); assert.equal(request.init.redirect,'error');
  assert.equal(request.init.cache,'no-store'); assert.equal(request.init.referrerPolicy,'no-referrer');
  assert.deepEqual(Object.keys(body).sort(),['attemptId','audio','cardKey','word']);
  assert.deepEqual(Object.keys(body.audio).sort(),['channels','data','format','sampleRate']);
  assert.equal(body.audio.format,'pcm_s16le'); assert.equal(body.audio.sampleRate,16000); assert.equal(body.audio.channels,1);
  assert.equal(Buffer.from(body.audio.data,'base64').length,16000);
  assert.equal(result.owner,OWNER); assert.equal(result.accuracyScore,84.5);
  assert.equal(Object.isFrozen(result),true); assert.equal(f.time.size(),0);
});

test('request context and auth are captured before await and cannot be retargeted by mutation', async () => {
  const decoding=deferred(),f=fixture({decodeDeferred:decoding}),input=f.input();
  const resultPromise=oral.assess(input); await flush();
  Object.assign(input,{attemptId:'fictional-oral-other',owner:OTHER_OWNER,word:'banana',cardKey:'en:banana',
    accessToken:'fictional.other_account.token_for_tests',endpoint:'https://invalid.example/'});
  decoding.resolve(f.buffer); const result=await resultPromise;
  assert.equal(result.attemptId,CONTEXT.attemptId); assert.equal(result.owner,OWNER);
  const sent=JSON.parse(f.calls[0].init.body);
  assert.equal(sent.attemptId,CONTEXT.attemptId); assert.equal(sent.word,'apple');
  assert.equal(f.calls[0].init.headers.Authorization,'Bearer '+AUTH.accessToken); assert.equal(f.calls[0].url,oral.endpoint);
});

test('missing configuration, spoofed endpoints, and secret-looking keys fail before audio decoding', async () => {
  for (const change of [
    {endpoint:undefined},{endpoint:oral.endpoint+'?redirect=https://invalid.example'},
    {endpoint:oral.endpoint.replace('https:','http:')},{endpoint:oral.endpoint.replace('.supabase.co','.supabase.co.invalid.example')},
    {publicKey:'sb_secret_fictional_server_key'},{publicKey:undefined},
  ]) {
    const f=fixture(); await assert.rejects(oral.assess(f.input(change)),expectCode('service_unavailable'));
    assert.equal(f.contexts.length,0); assert.equal(f.calls.length,0); assert.equal(f.time.size(),0);
  }
  const f=fixture(); await assert.rejects(oral.assess(f.input({accessToken:'bad\nheader'})),expectCode('unauthorized'));
  assert.equal(f.contexts.length,0); assert.equal(f.calls.length,0);
});

test('invalid account or target bindings are rejected before transmission', async () => {
  for (const [change,code] of [
    [{owner:'not-an-account'},'attempt_conflict'],[{attemptId:'__proto__'},'attempt_conflict'],
    [{cardKey:'apple\nother'},'attempt_conflict'],[{word:''},'unsupported_target'],
    [{word:' apple'},'unsupported_target'],[{word:'[word]'},'unsupported_target'],
  ]) {
    const f=fixture(); await assert.rejects(oral.assess(f.input(change)),expectCode(code)); assert.equal(f.calls.length,0);
  }
});

test('cancelled network requests discard late responses and never retry', async () => {
  const pending=deferred(),controller=new AbortController(),f=fixture({fetchDeferred:pending});
  const rejected=assert.rejects(oral.assess(f.input({signal:controller.signal})),expectCode('cancelled'));
  await flush(); assert.equal(f.calls.length,1); controller.abort(); await rejected;
  assert.equal(f.calls[0].init.signal.aborted,true); assert.equal(f.time.size(),0);
  pending.resolve(new Response(JSON.stringify({ok:true,assessment:row()}))); await flush();
  assert.equal(f.calls.length,1);
});

test('the total request deadline is capped at 25 seconds with no automatic billing retry', async () => {
  const pending=deferred(),f=fixture({fetchDeferred:pending});
  const rejected=assert.rejects(oral.assess(f.input({timeoutMs:999999})),expectCode('assessment_timeout'));
  await flush(); assert.equal(f.calls.length,1); f.time.advance(24999); assert.equal(f.calls[0].init.signal.aborted,false);
  f.time.advance(1); await rejected; assert.equal(f.calls[0].init.signal.aborted,true); assert.equal(f.time.size(),0);
  f.time.advance(120000); assert.equal(f.calls.length,1);
  pending.reject(new Error('fictional late network error')); await flush();
});

test('response body reading remains cancellable and within the total deadline', async () => {
  const body=deferred(),f=fixture({response:{ok:true,status:200,headers:new Headers(),text(){return body.promise;}}});
  const rejected=assert.rejects(oral.assess(f.input({timeoutMs:100})),expectCode('assessment_timeout'));
  await flush(); assert.equal(f.calls.length,1); f.time.advance(100); await rejected;
  body.resolve(JSON.stringify({ok:true,assessment:row()})); await flush();
  assert.equal(f.calls.length,1); assert.equal(f.time.size(),0);
});

test('provider, quota, and pending failures remain errors without invented score or leaked messages', async () => {
  const codes=['unsupported_target','quota_exhausted','rate_limited','assessment_pending','assessment_rejected',
    'service_unavailable','upstream_unavailable','result_unavailable','attempt_conflict','unauthorized'];
  for (const code of codes) {
    const f=fixture({status:code==='quota_exhausted'?429:400,body:{ok:false,code,message:'fictional private provider diagnostic'}});
    await assert.rejects(oral.assess(f.input()),error=>{
      expectCode(code)(error); assert.equal(error.message.includes('private provider'),false);
      assert.equal('accuracyScore' in error,false); assert.equal('totalScore' in error,false); return true;
    });
    assert.equal(f.calls.length,1); assert.equal(f.time.size(),0);
  }
});

test('network failures and HTTP fallback errors do not perform retries', async () => {
  const failing=fixture({fetchReject:true});
  await assert.rejects(oral.assess(failing.input()),expectCode('upstream_unavailable'));
  assert.equal(failing.calls.length,1); assert.equal(failing.time.size(),0);
  for (const [status,code] of [[401,'unauthorized'],[403,'forbidden'],[429,'quota_exhausted'],[503,'service_unavailable']]) {
    const f=fixture({status,body:{ok:false}});
    await assert.rejects(oral.assess(f.input()),expectCode(code)); assert.equal(f.calls.length,1);
  }
});

test('malformed and oversized result bodies never become an assessment', async () => {
  for (const response of [
    new Response('<not json>'),new Response(' '.repeat(32769)),
    {ok:true,status:200,headers:new Headers({'content-length':'200000'}),text(){throw new Error('Must not read oversized body');}},
    new Response(JSON.stringify({ok:true,assessment:row({accuracyScore:null,totalScore:null})})),
  ]) {
    const f=fixture({response}); await assert.rejects(oral.assess(f.input()),expectCode('invalid_result'));
    assert.equal(f.calls.length,1); assert.equal(f.time.size(),0);
  }
});

test('all account, event, card, and word response bindings must match exactly', async () => {
  for (const change of [{owner:OTHER_OWNER},{attemptId:'fictional-oral-2'},{cardKey:'en:banana'},{word:'Apple'}]) {
    assert.throws(()=>oral.validateAssessment(row(change),CONTEXT),expectCode('invalid_result'));
    const f=fixture({body:{ok:true,assessment:row(change)}});
    await assert.rejects(oral.assess(f.input()),expectCode('invalid_result'));
  }
});

test('scores remain separate, missing accuracy stays unknown, and numeric zero is preserved', () => {
  for (const [accuracy,total] of [[0,null],[null,0],[0,0],[100,100],[null,88.2],[72.5,null]]) {
    const result=oral.validateAssessment(row({accuracyScore:accuracy,totalScore:total}),CONTEXT);
    assert.equal(result.accuracyScore,accuracy); assert.equal(result.totalScore,total);
    assert.equal('passed' in result,false); assert.equal('mastered' in result,false); assert.equal('score' in result,false);
  }
  const missing=row(); delete missing.accuracyScore;
  assert.equal(oral.validateAssessment(missing,CONTEXT).accuracyScore,null);
});

test('malformed, missing, nonfinite, and out-of-range scores fail validation', () => {
  for (const change of [
    {accuracyScore:null,totalScore:null},{accuracyScore:undefined,totalScore:undefined},
    {accuracyScore:'84'},{accuracyScore:NaN},{accuracyScore:Infinity},{accuracyScore:-1},
    {accuracyScore:100.1},{totalScore:false},{totalScore:'0'},
  ]) assert.throws(()=>oral.validateAssessment(row(change),CONTEXT),expectCode('invalid_result'));
});

test('wrong evaluator, scale, status, timestamps, and explicit provider rejection fail validation', () => {
  for (const change of [
    {provider:'made-up-ai'},{modelVersion:'unknown-v2'},{scale:5},{status:'passed'},
    {at:'yesterday'},{at:'2026-99-20T10:00:00Z'},{at:Infinity},{id:'__proto__'},
    {is_rejected:true},{is_rejected:'true'},{rejected:true},{except_info:28680},{except_info:'28673'},
  ]) assert.throws(()=>oral.validateAssessment(row(change),CONTEXT),expectCode('invalid_result'));
  assert.equal(oral.validateAssessment(row({except_info:0}),CONTEXT).status,'assessed');
});

test('validated results whitelist evidence fields and normalize their timestamp', () => {
  const result=oral.validateAssessment(row({at:'2026-11-20T18:00:00+08:00',passed:true,mastery:100,
    rawAudio:'fictional encoded audio',providerSecret:'fictional not a real secret'}),CONTEXT);
  assert.equal(result.at,'2026-11-20T10:00:00.000Z');
  for (const key of ['passed','mastery','rawAudio','providerSecret']) assert.equal(key in result,false);
  assert.equal(Object.isFrozen(result),true);
});

test('appending an assessment preserves the original recording and unrelated evidence', () => {
  const original=saved({futureMetadata:{preserve:true},assessments:{older:{id:'older',unknownFutureField:true}}});
  const before=structuredClone(original),next=oral.appendAssessment(original,row(),CONTEXT);
  assert.deepEqual(original,before); assert.notEqual(next,original); assert.equal(next.attempts,original.attempts);
  assert.equal(next.futureMetadata,original.futureMetadata); assert.notEqual(next.assessments,original.assessments);
  assert.equal(next.assessments.older,original.assessments.older);
  assert.equal(next.attempts[CONTEXT.attemptId].status,'recorded');
  assert.equal(next.assessments['fictional-assessment-1'].accuracyScore,84.5);
  assert.equal('accuracyScore' in next.attempts[CONTEXT.attemptId],false);
});

test('appending requires the exact original recorded attempt', () => {
  for (const existing of [undefined,{},saved({attempts:{}}),saved({attempts:{[CONTEXT.attemptId]:record('different-id')}}),
    saved({attempts:{[CONTEXT.attemptId]:record(CONTEXT.attemptId,{status:'pending'})}})]) {
    assert.throws(()=>oral.appendAssessment(existing,row(),CONTEXT),expectCode('missing_attempt'));
  }
});

test('stable assessment IDs are idempotent and cannot rewrite the original score', () => {
  const first=oral.appendAssessment(saved(),row(),CONTEXT);
  const retry=oral.appendAssessment(first,row({accuracyScore:99}),CONTEXT);
  assert.equal(Object.keys(retry.assessments).length,1); assert.equal(retry.assessments[row().id].accuracyScore,84.5);
  assert.equal(retry.assessments[row().id],first.assessments[row().id]);
});

test('assessment history is never truncated when subsequent readings are added', () => {
  let history=saved();
  for (let i=0;i<301;i++) history=oral.appendAssessment(history,row({id:'fictional-score-'+i}),CONTEXT);
  assert.equal(Object.keys(history.assessments).length,301);
  assert.equal(history.assessments['fictional-score-0'].accuracyScore,84.5);
  assert.equal(Object.keys(history.attempts).length,1);
});

test('lookup selects the latest valid result for that exact attempt, never the highest score', () => {
  let history=oral.appendAssessment(saved(),row({id:'old-high',accuracyScore:99}),CONTEXT);
  history=oral.appendAssessment(history,row({id:'recent-low',accuracyScore:40,at:'2026-11-20T10:01:00Z'}),CONTEXT);
  history.assessments['wrong-owner']=row({id:'wrong-owner',owner:OTHER_OWNER,at:'2026-11-20T10:02:00Z'});
  history.assessments['wrong-attempt']=row({id:'wrong-attempt',attemptId:'fictional-oral-2',at:'2026-11-20T10:03:00Z'});
  history.assessments['corrupt']=row({id:'corrupt',accuracyScore:'100',at:'2026-11-20T10:04:00Z'});
  assert.equal(oral.getAssessment(history,CONTEXT.attemptId,CONTEXT).id,'recent-low');
  assert.equal(oral.getAssessment(history,CONTEXT.attemptId,CONTEXT).accuracyScore,40);
  assert.equal(oral.getAssessment(history,'fictional-oral-2',CONTEXT),null);
  assert.equal(oral.getAssessment({...history,attempts:{}},CONTEXT.attemptId,CONTEXT),null);
  assert.equal(oral.getAssessment(history,CONTEXT.attemptId,{...CONTEXT,owner:'33333333-3333-4333-8333-333333333333'}),null);
});

test('recovery reads the cached result using authenticated GET without audio work or a new POST', async () => {
  const f=fixture({noAudio:true});
  const input=f.input(); delete input.blob;
  const result=await oral.recover(input);
  assert.equal(result.accuracyScore,84.5); assert.equal(f.contexts.length,0); assert.equal(f.calls.length,1);
  assert.equal(f.calls[0].url,oral.endpoint+'?attemptId='+CONTEXT.attemptId);
  assert.equal(f.calls[0].init.method,'GET'); assert.equal('body' in f.calls[0].init,false);
  assert.equal(f.calls[0].init.headers.Authorization,'Bearer '+AUTH.accessToken); assert.equal(f.time.size(),0);
});

test('availability uses an authenticated GET without audio or an attempt and keeps false distinct', async () => {
  for (const ready of [false,true]) {
    const f=fixture({noAudio:true,body:{ok:true,ready,provider:'xfyun-ise',limits:{rollingHours:24,global:400,perStudent:40}}});
    const result=await oral.availability({...AUTH,owner:OWNER,window:f.host});
    assert.deepEqual(result,{ready,provider:'xfyun-ise'});
    assert.equal(f.calls.length,1); assert.equal(f.calls[0].url,oral.endpoint);
    assert.equal(f.calls[0].init.method,'GET'); assert.equal('body' in f.calls[0].init,false);
    assert.equal(f.contexts.length,0); assert.equal(f.time.size(),0);
  }
});

test('availability rejects unverified owners, malformed flags, and waits no longer than eight seconds', async () => {
  const f=fixture({noAudio:true});
  await assert.rejects(oral.availability({...AUTH,owner:'',window:f.host}),expectCode('unauthorized'));
  assert.equal(f.calls.length,0);
  for (const change of [{ready:'true',provider:'xfyun-ise'},{ready:true,provider:'unknown'}]) {
    const malformed=fixture({body:{ok:true,...change}});
    await assert.rejects(oral.availability({...AUTH,owner:OWNER,window:malformed.host}),expectCode('invalid_result'));
  }
  const pending=deferred(),slow=fixture({fetchDeferred:pending});
  const rejected=assert.rejects(oral.availability({...AUTH,owner:OWNER,window:slow.host,timeoutMs:999999}),expectCode('assessment_timeout'));
  await flush(); slow.time.advance(8000); await rejected;
  assert.equal(slow.calls[0].init.signal.aborted,true); assert.equal(slow.time.size(),0); assert.equal(slow.calls.length,1);
  pending.resolve(new Response(JSON.stringify({ok:true,ready:true,provider:'xfyun-ise'}))); await flush();
});

// Exercise the actual page integration in a tiny DOM. Network/codec contracts
// above use the real helper; this harness isolates its caller's durability and
// stale-context boundaries without opening a browser or contacting a service.
function pageFixture(options = {}) {
  const source=fs.readFileSync(require.resolve('../grok/game.js'),'utf8');
  const start=source.indexOf('  // ---- Student read-aloud:');
  const end=source.indexOf('  // ---- pronunciation (',start);
  assert.ok(start>=0 && end>start);
  const time=clock(),events=[],calls=[],nodes=new Map();
  let owner=OWNER,disk=structuredClone(options.save || {cards:{[CONTEXT.cardKey]:{correct:3,wrong:2,interval:7}}}),writes=0;
  function node(id) {
    if (!nodes.has(id)) nodes.set(id,{hidden:false,disabled:false,textContent:'',dataset:{},
      classList:{contains(name){return id==='screen-play'&&name==='active';},toggle(){}},
      setAttribute(){},addEventListener(){}});
    return nodes.get(id);
  }
  function requireDurable(input) {
    const attempt=disk.cards[input.cardKey] && disk.cards[input.cardKey].oralOutput && disk.cards[input.cardKey].oralOutput.attempts[input.attemptId];
    assert.ok(attempt,'No assessment action may precede local recording durability.');
  }
  const assessmentApi={
    getAssessment:oral.getAssessment,appendAssessment:oral.appendAssessment,
    availability(input) { requireDurable(input); calls.push({method:'availability',input}); events.push('availability'); return Promise.resolve({ready:options.ready!==false,provider:'xfyun-ise'}); },
    assess(input) { requireDurable(input); calls.push({method:'POST',input}); events.push('POST'); return options.assessPromise || Promise.resolve(row(options.assessment)); },
    recover(input) { requireDurable(input); calls.push({method:'GET',input}); events.push('GET'); return Promise.resolve(row(options.assessment)); },
  };
  const host={AbortController,
    QuizMarioAccountStore:{owner(){return owner;}},
    QMOralOutput:require('../grok/oral-output.js'),
    QuizMarioCloud:{noteLocalFailure(){events.push('storage-error');}},
    QuizMarioCloudClient:{
      config(){return {SUPABASE_URL:oral.endpoint.split('/functions/')[0],SUPABASE_ANON_KEY:AUTH.publicKey};},
      client(){return {auth:{getSession(){events.push('auth');return options.authPromise || Promise.resolve({data:{session:{user:{id:options.sessionOwner || owner},access_token:AUTH.accessToken}}});}}};},
    },
  };
  const document={documentElement:{classList:{contains(name){return name==='session-ok';}}},
    createElement(){return {remove(){}};},
    head:{appendChild(script){events.push('load-helper');Promise.resolve().then(()=>{host.QMOralAssessment=assessmentApi;if(script.onload)script.onload();});}},
  };
  const context={window:host,document,AbortController,Promise,Date,URL:{createObjectURL(){return 'blob:fictional';},revokeObjectURL(){}},
    setTimeout:time.setTimeout,clearTimeout:time.clearTimeout,JSON,Number,
    oralGeneration:0,oralRecorder:null,oralAssessmentRun:null,oralLoaders:{},
    oralPlayback:null,oralUrl:'',oralVisible:true,oralPhase:'complete',oralMessage:'',oralElapsed:0,oralReferencePlayed:false,
    currentCard:{key:CONTEXT.cardKey,word:CONTEXT.word},save:structuredClone(disk),$:node,
    oralSession:{owner:OWNER,key:CONTEXT.cardKey,word:CONTEXT.word,id:CONTEXT.attemptId,generation:0,referencePlayed:false},
    peekProg(key){return context.save.cards[key] || null;},defaultCardProg(){return {};},
    writeLocalSave(next){writes++;if(options.failAtWrite===writes)throw new Error('fictional full storage');disk=structuredClone(next);events.push('write');},
    persist(){events.push('sync');},cancelSpeech(){},stopCustomVo(){},
  };
  vm.createContext(context); vm.runInContext(source.slice(start,end),context);
  return {context,host,events,calls,time,node,assessmentApi,
    disk(){return disk;},writeCount(){return writes;},setOwner(value){owner=value;},
    finish(){context.finishOralOutput(context.oralSession,{blob:new Blob(['fictional audio']),durationMs:900,mimeType:'audio/webm',audioCheck:'signal_detected'});},
  };
}

test('the actual page saves immutable recording evidence before loading or calling assessment', async () => {
  const f=pageFixture({assessment:{accuracyScore:0,totalScore:22}});
  f.finish(); await flush();
  assert.ok(f.events.indexOf('write')<f.events.indexOf('load-helper'));
  assert.ok(f.events.indexOf('write')<f.events.indexOf('auth'));
  assert.ok(f.events.indexOf('availability')<f.events.indexOf('POST'));
  assert.equal(f.calls.filter(call=>call.method==='POST').length,1);
  const card=f.disk().cards[CONTEXT.cardKey],evidence=card.oralOutput;
  assert.equal(evidence.attempts[CONTEXT.attemptId].status,'recorded');
  assert.equal('accuracyScore' in evidence.attempts[CONTEXT.attemptId],false);
  assert.equal(evidence.assessments[row().id].accuracyScore,0);
  assert.equal(card.correct,3); assert.equal(card.wrong,2); assert.equal(card.interval,7);
  assert.equal(f.node('oral-status').textContent,'已评测 · 参考分');
  assert.equal(f.node('oral-accuracy').textContent,'发音准确度 0 / 100');
  assert.equal(f.node('oral-assess').hidden,false); assert.equal(f.time.size(),0);
});

test('a page recording that cannot be saved triggers no helper load, authentication, or assessment', async () => {
  const f=pageFixture({failAtWrite:1}); f.finish(); await flush();
  assert.equal(f.calls.length,0); assert.equal(f.events.includes('load-helper'),false);
  assert.equal(f.events.includes('auth'),false); assert.equal(f.context.oralPhase,'error');
  assert.match(f.node('oral-note').textContent,/未能保存/);
  assert.equal(f.disk().cards[CONTEXT.cardKey].oralOutput,undefined);
});

test('unconfigured assessment leaves a replayable pending recording and uploads no audio', async () => {
  const f=pageFixture({ready:false}); f.finish(); await flush();
  assert.deepEqual(f.calls.map(call=>call.method),['availability']);
  assert.match(f.node('oral-note').textContent,/评测服务待开通/);
  assert.equal(f.node('oral-status').textContent,'已录音 · 待验证');
  assert.equal(f.node('oral-replay').hidden,false); assert.equal(f.node('oral-result').hidden,true);
  assert.equal(f.node('oral-assess').disabled,false);
  assert.equal(f.disk().cards[CONTEXT.cardKey].oralOutput.assessments,undefined);
});

test('phrases and numeric targets keep their recording without loading an assessment module', async () => {
  for (const word of ['according to','2026','a...']) {
    const f=pageFixture(); f.context.currentCard.word=word; f.context.oralSession.word=word;
    f.finish(); await flush();
    assert.equal(f.calls.length,0); assert.equal(f.events.includes('load-helper'),false);
    assert.match(f.node('oral-note').textContent,/只评测单个英文单词/);
    assert.ok(f.disk().cards[CONTEXT.cardKey].oralOutput.attempts[CONTEXT.attemptId]);
  }
});

test('a changed session owner cannot submit the previous account recording for assessment', async () => {
  const f=pageFixture({sessionOwner:OTHER_OWNER}); f.finish(); await flush();
  assert.equal(f.calls.length,0); assert.match(f.node('oral-note').textContent,/登录状态/);
  assert.equal(f.disk().cards[CONTEXT.cardKey].oralOutput.assessments,undefined);
});

test('cancelling the page during authentication discards the late credential result', async () => {
  const auth=deferred(),f=pageFixture({authPromise:auth.promise}); f.finish(); await flush();
  assert.equal(f.events.includes('auth'),true); f.context.cancelOralOutput({keepVisible:true});
  auth.resolve({data:{session:{user:{id:OWNER},access_token:AUTH.accessToken}}}); await flush();
  assert.equal(f.calls.length,0); assert.equal(f.time.size(),0);
  assert.equal(f.disk().cards[CONTEXT.cardKey].oralOutput.assessments,undefined);
});

test('late assessment results cannot cross a page generation, card, or account boundary', async () => {
  for (const boundary of ['card','owner']) {
    const result=deferred(),f=pageFixture({assessPromise:result.promise}); f.finish(); await flush();
    assert.equal(f.calls.filter(call=>call.method==='POST').length,1);
    f.context.cancelOralOutput({keepVisible:true});
    if (boundary==='card') f.context.currentCard={key:'en:banana',word:'banana'};
    else { f.setOwner(OTHER_OWNER); f.context.save={cards:{}}; }
    result.resolve(row()); await flush();
    assert.equal(f.calls.find(call=>call.method==='POST').input.signal.aborted,true);
    assert.equal(f.writeCount(),1);
    assert.equal(f.disk().cards[CONTEXT.cardKey].oralOutput.assessments,undefined);
    assert.equal(f.time.size(),0);
  }
});

test('failed local score storage keeps the recording and recovers through GET without another POST', async () => {
  const f=pageFixture({failAtWrite:2}); f.finish(); await flush();
  assert.match(f.node('oral-note').textContent,/本机保存失败/);
  assert.equal(f.disk().cards[CONTEXT.cardKey].oralOutput.assessments,undefined);
  assert.equal(f.node('oral-result').hidden,true);
  f.context.recoverOralAssessment(); await flush();
  assert.equal(f.calls.filter(call=>call.method==='POST').length,1);
  assert.equal(f.calls.filter(call=>call.method==='GET').length,1);
  assert.equal(f.disk().cards[CONTEXT.cardKey].oralOutput.assessments[row().id].accuracyScore,84.5);
});

test('recovery after reload loads on click and queries the latest saved attempt without audio', async () => {
  const f=pageFixture({save:{cards:{[CONTEXT.cardKey]:{oralOutput:saved()}}}});
  f.context.oralSession=null; f.context.paintOralOutput();
  assert.equal(f.events.length,0); assert.equal(f.host.QMOralAssessment,undefined);
  f.context.recoverOralAssessment(); await flush();
  assert.deepEqual(f.calls.map(call=>call.method),['GET']);
  assert.equal('blob' in f.calls[0].input,false); assert.equal(f.node('oral-result').hidden,false);
});

test('the unloaded page renders only a valid latest-attempt score without any helper request', () => {
  const old=row({accuracyScore:0,totalScore:null}),history=saved({assessments:{[old.id]:old}});
  const f=pageFixture({save:{cards:{[CONTEXT.cardKey]:{oralOutput:history}}}});
  f.context.paintOralOutput();
  assert.equal(f.node('oral-accuracy').textContent,'发音准确度 0 / 100');
  assert.equal(f.node('oral-total').hidden,true); assert.equal(f.events.length,0);
  f.context.save.cards[CONTEXT.cardKey].oralOutput.attempts.newest=record('newest',{at:'2026-11-20T11:00:00Z'});
  f.context.paintOralOutput(); assert.equal(f.node('oral-result').hidden,true);
  assert.equal(f.node('oral-status').textContent,'已录音 · 待验证');
  delete f.context.save.cards[CONTEXT.cardKey].oralOutput.attempts.newest;
  for (const change of [{owner:OTHER_OWNER},{word:'banana'},{accuracyScore:'100'},{totalScore:Infinity},{modelVersion:'unknown'},{is_rejected:true}]) {
    f.context.save.cards[CONTEXT.cardKey].oralOutput.assessments[old.id]={...old,...change};
    f.context.paintOralOutput(); assert.equal(f.node('oral-result').hidden,true);
  }
  f.context.save.cards[CONTEXT.cardKey].oralOutput.assessments[old.id]={...old,accuracyScore:null,totalScore:62};
  f.context.paintOralOutput();
  assert.equal(f.node('oral-accuracy').textContent,'发音准确度：暂无可靠分数');
  assert.equal(f.node('oral-total').textContent,'综合参考分 62 / 100');
  assert.equal(f.events.length,0);
});

(async () => {
  for (const {name,fn} of tests) { await fn(); console.log('PASS '+name); }
  console.log('Oral assessment contracts passed ('+tests.length+' tests).');
})().catch(error=>{ console.error(error); process.exitCode=1; });

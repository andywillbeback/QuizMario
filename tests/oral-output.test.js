/* Local recording evidence, permission races, and microphone cleanup. */
'use strict';
const assert = require('node:assert/strict');
const oral = require('../grok/oral-output.js');

function clock() {
  let now = 0, sequence = 0;
  const timers = new Map();
  return {
    now: () => now,
    setTimeout(fn, delay) { const id = ++sequence; timers.set(id, { at: now + delay, fn }); return id; },
    clearTimeout(id) { timers.delete(id); },
    advance(ms) {
      const until = now + ms;
      for (let limit = 0; limit < 10000; limit++) {
        const next = Array.from(timers.entries()).filter(([, item]) => item.at <= until).sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
        if (!next) { now = until; return; }
        now = next[1].at;
        timers.delete(next[0]);
        next[1].fn();
      }
      throw new Error('Unbounded timer loop');
    },
    size: () => timers.size,
  };
}
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function fixture(opts = {}) {
  const time = clock(), completions = [], errors = [], states = [], recorders = [], contexts = [];
  const track = { stops: 0, stop() { this.stops++; } };
  const stream = { getTracks() { return [track]; } };
  let requests = 0;
  class Recorder {
    static isTypeSupported(type) { return opts.noDeclaredTypes ? false : type === 'audio/webm;codecs=opus'; }
    constructor(input, config) {
      if (opts.constructorError) throw new Error('no encoder');
      this.stream = input;
      this.config = config;
      this.mimeType = config && config.mimeType || 'audio/webm';
      this.state = 'inactive';
      recorders.push(this);
    }
    start() { if (opts.startError) throw new Error('start failed'); this.state = 'recording'; }
    stop() {
      if (this.state === 'inactive') throw new Error('already stopped');
      this.state = 'inactive';
      if (opts.neverStop) return;
      const data = this.ondataavailable, stop = this.onstop;
      time.setTimeout(() => {
        if (data && !opts.empty) data({ data: new Blob(['fictional recorded bytes'], { type: this.mimeType }) });
        if (stop) stop();
      }, opts.stopDelay || 0);
    }
  }
  class Context {
    constructor() { this.state = opts.suspended ? 'suspended' : 'running'; this.closed = 0; contexts.push(this); }
    createAnalyser() {
      return { fftSize: 1024, getFloatTimeDomainData(buffer) { buffer.fill(opts.level || 0); }, disconnect() {} };
    }
    createMediaStreamSource() { return { connect() {}, disconnect() {} }; }
    close() { this.closed++; this.state = 'closed'; return Promise.resolve(); }
    resume() { if (!opts.suspended) this.state = 'running'; return Promise.resolve(); }
  }
  const recorder = oral.createRecorder({
    window: {},
    mediaDevices: { getUserMedia() { requests++; return opts.permission ? opts.permission.promise : Promise.resolve(stream); } },
    MediaRecorder: Recorder,
    Blob,
    AudioContext: opts.level !== undefined || opts.suspended ? Context : null,
    now: time.now,
    setTimeout: time.setTimeout,
    clearTimeout: time.clearTimeout,
    onComplete(result) { completions.push(result); if (opts.onComplete) opts.onComplete(result); },
    onError(error) { errors.push(error); },
    onState(state) { states.push(state); if (opts.onState) opts.onState(state); },
    requestTimeoutMs: opts.requestTimeoutMs,
    maxDurationMs: opts.maxDurationMs,
  });
  return { recorder, time, stream, track, completions, errors, states, recorders, contexts, requests: () => requests };
}

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }
function attempt(id, extra = {}) {
  return oral.makeAttempt({ id, at: '2026-11-20T13:00:00Z', durationMs: 1250, mimeType: 'audio/webm', assisted: true, ...extra });
}

test('recording creates evidence without accepting a fabricated score or verification', () => {
  const row = attempt('fictional-attempt-1', { status: 'passed', score: 100, transcript: 'apple', referencePlayed: true, audioCheck: 'signal_detected' });
  assert.equal(row.status, 'recorded');
  assert.equal(row.referencePlayed, true);
  assert.equal(row.audioCheck, 'signal_detected');
  assert.equal(row.assisted, true);
  assert.equal('score' in row, false);
  assert.equal('transcript' in row, false);
  assert.equal('referenceHeard' in row, false);
  assert.equal(Object.isFrozen(row), true);
});

test('attempts are immutable, idempotent, and do not overwrite other oral data', () => {
  const first = attempt('fictional-attempt-1');
  const saved = oral.appendAttempt({ futureMetadata: { preserve: true } }, first);
  const retry = oral.appendAttempt(saved, attempt(first.id, { durationMs: 2000 }));
  assert.deepEqual(saved.attempts[first.id], first);
  assert.equal(retry.attempts[first.id].durationMs, 1250);
  assert.equal(oral.summarize(retry).attemptCount, 1);
  assert.deepEqual(retry.futureMetadata, { preserve: true });
  const second = oral.appendAttempt(retry, attempt('fictional-attempt-2', { at: '2026-11-21T13:00:00Z' }));
  assert.equal(oral.summarize(second).attemptCount, 2);
  assert.equal(oral.summarize(saved).attemptCount, 1);
  assert.equal(oral.summarize(second).lastAttempt.id, 'fictional-attempt-2');
  assert.equal(oral.summarize(second).label, '已录音 · 待验证');
});

test('no history cap deletes earlier attempts', () => {
  let data;
  for (let i = 0; i < 300; i++) data = oral.appendAttempt(data, attempt('fictional-' + i));
  assert.equal(oral.summarize(data).attemptCount, 300);
  assert.ok(data.attempts['fictional-0']);
});

test('invalid metadata does not create a practice or mastery claim', () => {
  assert.equal(oral.summarize(null).status, 'unpracticed');
  assert.equal(oral.summarize({ attempts: { forged: { status: 'passed', score: 100 } } }).attemptCount, 0);
  assert.throws(() => attempt('__proto__'));
  assert.throws(() => attempt('bad-time', { at: 'not a time' }));
  assert.throws(() => attempt('short', { durationMs: 20 }));
});

test('valid recording yields a local Blob, pending assessment and stops all resources', async () => {
  const f = fixture({ level: 0.08 });
  assert.equal(await f.recorder.start(), true);
  assert.equal(f.recorder.getState().status, 'recording');
  f.time.advance(1200);
  assert.equal(f.recorder.stop(), true);
  assert.equal(f.recorder.getState().status, 'stopping');
  f.time.advance(0);
  assert.equal(f.completions.length, 1);
  assert.equal(f.completions[0].durationMs, 1200);
  assert.equal(f.completions[0].audioCheck, 'signal_detected');
  assert.ok(f.completions[0].blob instanceof Blob);
  assert.ok(f.completions[0].blob.size);
  assert.equal('score' in f.completions[0], false);
  assert.equal(f.recorder.getState().status, 'complete');
  assert.ok(f.track.stops >= 1);
  assert.equal(f.contexts[0].closed, 1);
  assert.equal(f.time.size(), 0);
});

test('without a usable audio analyser the recording remains explicitly unchecked', async () => {
  const f = fixture();
  await f.recorder.start();
  f.time.advance(800);
  f.recorder.stop(); f.time.advance(0);
  assert.equal(f.completions[0].audioCheck, 'unchecked');
});

test('a suspended audio context cannot masquerade as successful silence detection', async () => {
  const f = fixture({ suspended: true });
  await f.recorder.start();
  f.time.advance(800);
  f.recorder.stop(); f.time.advance(0);
  assert.equal(f.completions[0].audioCheck, 'unchecked');
});

test('silent input is not stored as a successful read-aloud attempt', async () => {
  const f = fixture({ level: 0 });
  await f.recorder.start();
  f.time.advance(800);
  f.recorder.stop(); f.time.advance(0);
  assert.equal(f.completions.length, 0);
  assert.equal(f.errors[0].code, 'silent');
  assert.ok(f.track.stops >= 1);
});

test('very short and empty recordings never complete', async () => {
  const short = fixture();
  await short.recorder.start(); short.time.advance(100); short.recorder.stop(); short.time.advance(0);
  assert.equal(short.errors[0].code, 'too_short');
  assert.equal(short.completions.length, 0);
  const empty = fixture({ empty: true });
  await empty.recorder.start(); empty.time.advance(800); empty.recorder.stop(); empty.time.advance(0);
  assert.equal(empty.errors[0].code, 'empty');
  assert.equal(empty.completions.length, 0);
});

test('the automatic eight-second limit records once and releases the microphone', async () => {
  const f = fixture();
  await f.recorder.start(); f.time.advance(10000);
  assert.equal(f.completions.length, 1);
  assert.equal(f.completions[0].durationMs, 8000);
  assert.ok(f.track.stops >= 1);
  assert.equal(f.time.size(), 0);
});

test('rapid repeated starts and stops cannot make duplicate attempts', async () => {
  const f = fixture();
  const started = f.recorder.start();
  assert.equal(await f.recorder.start(), false);
  assert.equal(await started, true);
  f.time.advance(800);
  assert.equal(f.recorder.stop(), true);
  assert.equal(f.recorder.stop(), false);
  f.time.advance(0);
  assert.equal(f.completions.length, 1);
  assert.equal(f.requests(), 1);
});

test('cancel during permission request resolves start false and releases a late stream', async () => {
  const permission = deferred(), f = fixture({ permission });
  const started = f.recorder.start();
  assert.equal(f.recorder.getState().status, 'requesting');
  f.recorder.cancel();
  assert.equal(await started, false);
  permission.resolve(f.stream);
  await Promise.resolve(); await Promise.resolve();
  assert.ok(f.track.stops >= 1);
  assert.equal(f.recorders.length, 0);
  assert.equal(f.completions.length, 0);
  assert.equal(f.errors.length, 0);
  assert.equal(f.time.size(), 0);
});

test('a previous canceled permission request cannot attach to a new recording', async () => {
  const permission = deferred(), f = fixture({ permission });
  const old = f.recorder.start(); f.recorder.cancel();
  assert.equal(await old, false);
  const newer = f.recorder.start();
  permission.resolve(f.stream);
  await newer;
  // A separate real getUserMedia call supplies a separate stream. This shared
  // fixture still proves only the latest request can construct a recorder.
  assert.equal(f.recorders.length, 1);
  f.recorder.cancel();
  assert.equal(f.completions.length, 0);
});

test('a late stop callback cannot complete after a card/account cancellation', async () => {
  const f = fixture({ stopDelay: 250 });
  await f.recorder.start(); f.time.advance(1000); f.recorder.stop();
  f.recorder.cancel(); f.time.advance(250);
  assert.equal(f.completions.length, 0);
  assert.equal(f.recorder.getState().status, 'idle');
  assert.equal(f.errors.length, 0);
});

test('cancellation inside a state callback cannot leave a timer that stops the next session', async () => {
  let cancelFirst = true;
  const f = fixture({ onState(state) {
    if (state.status === 'recording' && cancelFirst) { cancelFirst = false; f.recorder.cancel(); }
  } });
  assert.equal(await f.recorder.start(), false);
  f.time.advance(2000);
  assert.equal(await f.recorder.start(), true);
  f.time.advance(6000);
  assert.equal(f.recorder.getState().status, 'recording');
  assert.equal(f.completions.length, 0);
  f.recorder.cancel();
  assert.equal(f.time.size(), 1, 'only a captured fake stop event remains, with no active effect');
  f.time.advance(0);
  assert.equal(f.time.size(), 0);
  assert.equal(f.completions.length, 0);
});

test('permission timeout resolves predictably and cleans a subsequently granted stream', async () => {
  const permission = deferred(), f = fixture({ permission, requestTimeoutMs: 1000 });
  const started = f.recorder.start(); f.time.advance(1000);
  assert.equal(await started, false);
  assert.equal(f.errors[0].code, 'permission_timeout');
  permission.resolve(f.stream); await Promise.resolve();
  assert.ok(f.track.stops >= 1);
  assert.equal(f.completions.length, 0);
});

test('permission and device failures leave the recorder usable for a later retry', async () => {
  for (const [name, code] of [['NotAllowedError', 'permission'], ['NotFoundError', 'no_device'], ['NotReadableError', 'device_busy']]) {
    const permission = deferred(), f = fixture({ permission });
    const started = f.recorder.start(); const error = new Error(name); error.name = name; permission.reject(error);
    assert.equal(await started, false);
    assert.equal(f.errors[0].code, code);
    assert.equal(f.recorder.getState().canStart, true);
    assert.equal(f.time.size(), 0);
  }
});

test('unsupported encoding and a start failure release already granted microphone access', async () => {
  for (const opts of [{ constructorError: true }, { startError: true }]) {
    const f = fixture(opts);
    assert.equal(await f.recorder.start(), false);
    assert.ok(f.track.stops >= 1);
    assert.equal(f.completions.length, 0);
    assert.equal(f.errors.length, 1);
  }
});

test('a browser-selected recording format is allowed when no preferred type is reported', async () => {
  const f = fixture({ noDeclaredTypes: true });
  assert.equal(await f.recorder.start(), true);
  assert.equal(f.recorders[0].config, undefined);
  f.recorder.cancel();
});

test('a recorder that never finalizes is bounded by a stop timeout', async () => {
  const f = fixture({ neverStop: true });
  await f.recorder.start(); f.time.advance(800); f.recorder.stop(); f.time.advance(3000);
  assert.equal(f.completions.length, 0);
  assert.equal(f.errors[0].code, 'stop_timeout');
  assert.ok(f.track.stops >= 1);
  assert.equal(f.time.size(), 0);
});

test('destroy cancels pending work and permanently prevents microphone requests', async () => {
  const f = fixture();
  await f.recorder.start(); f.time.advance(800); f.recorder.destroy(); f.time.advance(10000);
  assert.equal(f.completions.length, 0);
  assert.equal(f.recorder.getState().status, 'destroyed');
  assert.equal(await f.recorder.start(), false);
  assert.equal(f.requests(), 1);
  assert.ok(f.track.stops >= 1);
});

test('missing browser recording APIs fail without blocking the caller', async () => {
  const recorder = oral.createRecorder({ window: {} });
  assert.equal(recorder.getState().supported, false);
  assert.equal(recorder.getState().status, 'unsupported');
  assert.equal(await recorder.start(), false);
  assert.equal(recorder.stop(), false);
  recorder.cancel(); recorder.destroy();
});

(async function () {
  for (const item of tests) {
    await item.fn();
    console.log('PASS ' + item.name);
  }
  console.log('Oral output: ' + tests.length + ' tests passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });

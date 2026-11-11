'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const read = name => fs.readFileSync(path.join(__dirname, '../grok', name), 'utf8');

function runtime({ reduced = false, idleSupported = true } = {}) {
  let draws = 0, next = 1;
  const frames = new Map(), timers = new Map(), idle = new Map(), docEvents = {}, events = {};
  const drawing = new Proxy({}, { get(target, key) {
    if (key in target) return target[key];
    if (key === 'clearRect') return () => { draws++; };
    if (key === 'createRadialGradient' || key === 'createLinearGradient') return () => ({ addColorStop() {} });
    return () => {};
  } });
  const canvas = { getContext: () => drawing, getBoundingClientRect: () => ({ width: 360, height: 270 }) };
  const document = { hidden: false, activeElement: { tagName: 'BODY' }, getElementById: () => canvas,
    addEventListener: (name, fn) => { docEvents[name] = fn; } };
  const ctx = { document, navigator: { hardwareConcurrency: 4 }, Math,
    matchMedia: query => ({ matches: query.includes('reduced-motion') ? reduced : true, addEventListener() {} }),
    requestAnimationFrame: fn => { const id = next++; frames.set(id, fn); return id; },
    cancelAnimationFrame: id => frames.delete(id),
    setTimeout: fn => { const id = next++; timers.set(id, fn); return id; },
    clearTimeout: id => timers.delete(id),
    addEventListener: (name, fn) => { events[name] = fn; },
  };
  if (idleSupported) ctx.requestIdleCallback = fn => { const id = next++; idle.set(id, fn); return id; };
  ctx.window = ctx;
  vm.runInNewContext(read('orb.js'), ctx);
  function run(queue) { const work = [...queue.values()]; queue.clear(); work.forEach(fn => fn()); }
  return { ctx, document, frames, events, get draws() { return draws; },
    start() { run(idleSupported ? idle : timers); },
    step(ts) { const work = [...frames.values()]; frames.clear(); work.forEach(fn => fn(ts)); },
    emit(name) { docEvents[name](); run(timers); },
  };
}

test('login controls load before decoration and do not depend on learning engines', () => {
  const scripts = [...read('login.html').matchAll(/<script\b[^>]*\bsrc="([^"]+)"[^>]*>/g)]
    .map(match => ({ src: match[1].split('?')[0], tag: match[0] }));
  const auth = scripts.findIndex(row => row.src === 'auth-page.js');
  const orb = scripts.findIndex(row => row.src === 'orb.js');
  assert.ok(auth >= 0 && orb > auth, 'authentication handlers are installed before the drawing script can execute');
  assert.ok(scripts.every(row => /\bdefer\b/.test(row.tag) && !/\basync\b/.test(row.tag)), 'dependent login scripts preserve ordered execution while downloading');
  assert.ok(!scripts.some(row => /(?:sync-core|words|tracks|exam-tracks|bank-|three|universe|performance)\./.test(row.src)),
    'login never waits for learning synchronization, vocabulary, universe or diagnostics code');
});

test('decoration yields its first drawing until idle time and caps a high-refresh phone', () => {
  const r = runtime();
  assert.equal(r.draws, 0); assert.equal(r.frames.size, 0, 'loading the script itself does not start expensive drawing');
  r.start();
  for (let ms = 0; ms < 1000; ms += 1000 / 120) r.step(ms);
  assert.ok(r.draws > 10 && r.draws <= 27, '120 Hz screens do not produce 120 expensive decoration frames');
  assert.ok(r.ctx.QuizMarioOrb.state().stars < 900);
  assert.equal(r.ctx.QuizMarioOrb.state().maxFps, 24);
});

test('typing, hidden tabs and page suspension stop drawing and restore it safely', () => {
  const r = runtime(); r.start();
  r.document.activeElement = { tagName: 'INPUT' }; r.emit('focusin');
  const beforeInput = r.draws;
  assert.equal(r.frames.size, 0);
  r.step(1000); assert.equal(r.draws, beforeInput, 'typing does not share the main thread with animation draws');
  r.document.activeElement = { tagName: 'BODY' }; r.emit('focusout'); assert.equal(r.frames.size, 1);
  r.document.hidden = true; r.emit('visibilitychange'); assert.equal(r.frames.size, 0);
  r.document.hidden = false; r.emit('visibilitychange'); assert.equal(r.frames.size, 1);
  r.events.pagehide({ persisted: true }); assert.equal(r.frames.size, 0);
  r.events.pageshow({ persisted: true }); assert.equal(r.frames.size, 1);
});

test('a page restored before its first idle draw still gets a decoration', () => {
  const r = runtime();
  r.events.pagehide({ persisted: true }); r.start();
  assert.equal(r.draws, 0);
  r.events.pageshow({ persisted: true }); r.start();
  assert.equal(r.draws, 1); assert.equal(r.frames.size, 1);
});

test('reduced motion stays still and browsers without idle callbacks still defer startup', () => {
  const reduced = runtime({ reduced: true }); reduced.start();
  assert.equal(reduced.draws, 1); assert.equal(reduced.frames.size, 0);
  const fallback = runtime({ idleSupported: false });
  assert.equal(fallback.draws, 0);
  fallback.start(); assert.equal(fallback.draws, 1); assert.equal(fallback.frames.size, 1);
});

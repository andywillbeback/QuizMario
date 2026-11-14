'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync(__dirname + '/../grok/sw.js', 'utf8');
const currentCache = 'juguang-shell-20261114-fast1';
function deferred() { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; }
async function drain() { for (let i = 0; i < 20; i++) await Promise.resolve(); await new Promise(setImmediate); }
function response(text) { const result = new Response(text); Object.defineProperty(result, 'type', { value: 'basic' }); return result; }

function harness(fetcher, hit, options = {}) {
  const events = {}, timers = new Map(), deleted = [], writes = [], lifetimes = [], requests = [];
  let id = 0, now = 0, cached = hit;
  const cache = {
    add: async () => {},
    async put(key, value) {
      writes.push(key);
      if (options.put) await options.put();
      cached = value.clone();
    },
    match: async () => cached && cached.clone(),
  };
  const ctx = { URL, Response, AbortController, Promise, Error,
    setTimeout(fn, ms) { timers.set(++id, { fn, at: now + ms }); return id; },
    clearTimeout: number => timers.delete(number),
    fetch(request, init) { requests.push({ request, init }); return fetcher(request, init); },
    caches: { open: async () => cache,
      keys: async () => ['juguang-shell-v1', 'juguang-shell-20261110-localsave', currentCache, 'another-app-cache'],
      delete: async name => deleted.push(name) },
    self: { location: { origin: 'https://example.test' }, addEventListener: (name, fn) => { events[name] = fn; },
      skipWaiting: async () => {}, clients: { claim: async () => {} } },
  };
  vm.runInNewContext(source, ctx);
  return { events, timers, deleted, writes, lifetimes, requests,
    cachedText: async () => cached && cached.clone().text(),
    fetch(url = 'https://example.test/QuizMario/grok/login.html?v=x', method = 'GET') {
      let result;
      events.fetch({ request: { url, method }, respondWith(promise) { result = promise; }, waitUntil(promise) { lifetimes.push(promise); } });
      return result;
    },
    async advance(ms) {
      await drain();
      const end = now + ms;
      for (;;) {
        const next = [...timers].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!next) break;
        const [key, timer] = next; timers.delete(key); now = timer.at; timer.fn(); await drain();
      }
      now = end; await drain();
    },
  };
}

test('a warm cache returns after 350 ms while its slow network refresh continues', async () => {
  const network = deferred();
  const h = harness(() => network.promise, new Response('cached'));
  const pending = h.fetch(); let finished = false;
  pending.then(() => { finished = true; });
  await h.advance(349); assert.equal(finished, false);
  await h.advance(1); assert.equal(await (await pending).text(), 'cached');
  assert.equal(h.requests[0].init.signal.aborted, false, 'the cached response does not cancel a potentially useful refresh');
  network.resolve(response('fresh')); await Promise.all(h.lifetimes);
  assert.equal(await h.cachedText(), 'fresh');
  assert.deepEqual(h.writes, ['https://example.test/QuizMario/grok/login.html']);
  assert.equal(h.timers.size, 0);
});

test('a hanging background refresh still aborts at its six-second deadline', async () => {
  const h = harness(() => new Promise(() => {}), new Response('cached'));
  const pending = h.fetch();
  await h.advance(350); assert.equal(await (await pending).text(), 'cached');
  await h.advance(5650); await Promise.all(h.lifetimes);
  assert.equal(h.requests[0].init.signal.aborted, true);
  assert.equal(h.timers.size, 0);
  assert.equal(h.writes.length, 0);
});

test('waitUntil covers cache.put after a cached response has already returned', async () => {
  const network = deferred(), put = deferred();
  const h = harness(() => network.promise, new Response('cached'), { put: () => put.promise });
  const pending = h.fetch();
  await h.advance(350); assert.equal(await (await pending).text(), 'cached');
  let lifetimeFinished = false;
  h.lifetimes[0].then(() => { lifetimeFinished = true; });
  network.resolve(response('updated')); await drain();
  assert.equal(h.writes.length, 1);
  assert.equal(lifetimeFinished, false, 'the worker must remain alive until the cache write finishes');
  put.resolve(); await Promise.all(h.lifetimes);
  assert.equal(lifetimeFinished, true);
  assert.equal(await h.cachedText(), 'updated');
});

test('a fresh response is returned without waiting for slow cache storage', async () => {
  const put = deferred();
  const h = harness(async () => response('fresh'), new Response('cached'), { put: () => put.promise });
  assert.equal(await (await h.fetch()).text(), 'fresh');
  assert.equal(h.timers.size, 0);
  put.resolve(); await Promise.all(h.lifetimes);
});

test('offline without cache returns an actionable 503 page', async () => {
  const h = harness(async () => { throw Error('offline'); });
  const result = await h.fetch();
  assert.equal(result.status, 503); assert.match(await result.text(), /恢复网络/);
  await Promise.all(h.lifetimes);
});

test('without cache the worker does not invent a page at the warm-cache deadline', async () => {
  const h = harness(() => new Promise(() => {}));
  const pending = h.fetch(); let finished = false;
  pending.then(() => { finished = true; });
  await h.advance(350); assert.equal(finished, false);
  await h.advance(5650); assert.equal((await pending).status, 503);
  await Promise.all(h.lifetimes);
});

test('activation removes old shell versions but preserves current and unrelated caches', async () => {
  const h = harness(async () => response('ok')); let pending;
  h.events.activate({ waitUntil(value) { pending = value; } }); await pending;
  assert.deepEqual(h.deleted, ['juguang-shell-v1', 'juguang-shell-20261110-localsave']);
});

test('auth callbacks, private requests, scripts and word banks are never intercepted', () => {
  const h = harness(() => { throw Error('must not fetch'); });
  const base = 'https://example.test/QuizMario/grok/';
  for (const url of [
    'https://project.supabase.co/auth/v1/token', 'https://project.supabase.co/rest/v1/user_progress',
    base + 'login.html?code=fixture-secret', base + 'index.html?access_token=fixture-secret',
    base + 'login.html?refresh_token=fixture-secret', base + 'login.html?error=fixture-error',
    base + 'index.html?error_description=fixture-error', base + 'user_progress',
    base + 'words.js', base + 'exam-tracks.js', base + 'bank-data/gaokao/unit-001.json',
    base + 'word-universe.html',
  ]) assert.equal(h.fetch(url), undefined, url);
  assert.equal(h.fetch(base + 'login.html', 'POST'), undefined);
  assert.equal(h.requests.length, 0); assert.equal(h.lifetimes.length, 0);
});

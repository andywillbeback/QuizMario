'use strict';

// No credentials or network: capture the custom fetch installed in createClient,
// then run it against deterministic fetch doubles and a virtual browser clock.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const SOURCE = fs.readFileSync(path.join(__dirname, '../grok/cloud-client.js'), 'utf8');
const PROXY = 'https://quizmario-supabase-proxy.juguang-qm.workers.dev';
const DIRECT = 'https://cmainasvlfdynidabunp.supabase.co';
const TOKEN = '/auth/v1/token?grant_type=password';
const PUBLIC_FIXTURE_KEY = 'test-only-public-key';
const never = () => new Promise(() => {});
const response = (body = { name: 'GoTrue' }, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

async function flush() {
  for (let i = 0; i < 40; i += 1) await Promise.resolve();
}

class Clock {
  constructor() {
    this.now = 0;
    this.nextId = 0;
    this.timers = new Map();
  }
  setTimeout(fn, delay = 0) {
    const id = ++this.nextId;
    this.timers.set(id, { at: this.now + Number(delay), fn });
    return id;
  }
  clearTimeout(id) {
    this.timers.delete(id);
  }
  async tick(milliseconds) {
    const until = this.now + milliseconds;
    for (;;) {
      const due = [...this.timers.entries()]
        .filter(([, timer]) => timer.at <= until)
        .sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
      if (!due) break;
      this.now = due[1].at;
      this.timers.delete(due[0]);
      due[1].fn();
      await flush();
    }
    this.now = until;
    await flush();
  }
}

function makeHarness(handler, overrides = {}) {
  const clock = new Clock();
  const calls = [];
  let sdkOptions;
  let sdkUrl;
  const fakeFetch = (input, init) => {
    const request = new Request(input, init);
    const call = {
      input,
      init,
      request,
      url: request.url,
      method: request.method,
      signal: (init && init.signal) || (input && input.signal),
      at: clock.now,
    };
    calls.push(call);
    try {
      return Promise.resolve(handler(call));
    } catch (error) {
      return Promise.reject(error);
    }
  };
  const window = {
    QUIZMARIO_CONFIG: {
      SUPABASE_URL: DIRECT,
      SUPABASE_ANON_KEY: PUBLIC_FIXTURE_KEY,
      SITE_URL: 'https://example.invalid/QuizMario/grok/',
      ...overrides,
    },
    QuizMarioMerge: { isCloudConfigured: () => true },
    supabase: {
      createClient(url, _key, options) {
        sdkUrl = url;
        sdkOptions = options;
        return { fixtureClient: true };
      },
    },
    fetch: fakeFetch,
    AbortController,
    Request,
    Headers,
    setTimeout: clock.setTimeout.bind(clock),
    clearTimeout: clock.clearTimeout.bind(clock),
  };
  const context = {
    window,
    setTimeout: window.setTimeout,
    clearTimeout: window.clearTimeout,
    AbortController,
    Request,
    Headers,
    URL,
    Date: { now: () => clock.now },
  };
  vm.runInNewContext(SOURCE, context, { filename: 'grok/cloud-client.js' });
  window.QuizMarioCloudClient.client();
  assert.ok(sdkOptions, 'the browser client must be constructed');
  const customFetch = sdkOptions.global && sdkOptions.global.fetch;
  return { clock, calls, fetch: customFetch, sdkOptions, sdkUrl };
}

function mutations(harness) {
  return harness.calls.filter(call => call.method !== 'GET' && call.method !== 'HEAD');
}
function isCode(code) {
  return error => Boolean(error && String(error.message).includes(code));
}
function observed(promise) {
  return promise.then(value => ({ value }), error => ({ error }));
}

test('student auth path has no fallback URL and no workers.dev proxy', () => {
  const files = [
    'grok/config.js',
    'grok/cloud-client.js',
    'grok/sync-merge.js',
    'grok/auth-page.js',
    'grok/login.html',
    'grok/sw.js',
  ];
  for (const file of files) {
    const src = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
    assert.equal(src.includes('SUPABASE_FALLBACK_URL'), false, file);
    assert.equal(src.includes('workers.dev'), false, file);
    assert.equal(src.includes('quizmario-supabase-proxy'), false, file);
  }
  const config = fs.readFileSync(path.join(__dirname, '../grok/config.js'), 'utf8');
  assert.match(config, /SUPABASE_URL:\s*"https:\/\/cmainasvlfdynidabunp\.supabase\.co"/);
  const root = fs.readFileSync(path.join(__dirname, '../config.js'), 'utf8');
  assert.equal(root.includes('SUPABASE_FALLBACK_URL'), false);
  assert.match(root, /SUPABASE_URL:\s*"https:\/\/cmainasvlfdynidabunp\.supabase\.co"/);
});

test('auth uses only the primary supabase.co host and does not probe a second route', async () => {
  const h = makeHarness(call => {
    assert.equal(call.url.startsWith(PROXY), false);
    assert.equal(new URL(call.url).pathname === '/auth/v1/health', false);
    return response({ fixture: 'auth-result' });
  });
  assert.equal(h.sdkUrl, DIRECT);
  assert.equal(typeof h.fetch, 'function');
  const first = await h.fetch(DIRECT + TOKEN, { method: 'POST', body: '{}' });
  assert.equal(first.status, 200);
  assert.equal(mutations(h).length, 1);
  assert.equal(mutations(h)[0].url, DIRECT + TOKEN);
  assert.equal(h.calls.length, 1, 'login must not send a health probe');

  await h.fetch(DIRECT + '/auth/v1/user', { method: 'GET' });
  assert.equal(h.calls.length, 2);
  assert.equal(h.calls.at(-1).url, DIRECT + '/auth/v1/user');
});

test('a stale fallback URL is ignored and never receives credentials', async () => {
  const h = makeHarness(call => {
    assert.equal(call.url.startsWith(PROXY), false);
    return response({ fixture: 'auth-result' });
  }, { SUPABASE_FALLBACK_URL: PROXY });
  assert.equal(h.sdkUrl, DIRECT);
  await h.fetch(DIRECT + TOKEN, { method: 'POST', body: '{}' });
  assert.equal(mutations(h).length, 1);
  assert.equal(mutations(h)[0].url, DIRECT + TOKEN);
});

test('a 5xx from the primary host is returned once and is not sent anywhere else', async () => {
  const h = makeHarness(() => response({ msg: 'unavailable' }, 503));
  const first = await h.fetch(DIRECT + TOKEN, { method: 'POST', body: '{}' });
  assert.equal(first.status, 503);
  await h.fetch(DIRECT + TOKEN, { method: 'POST', body: '{}' });
  assert.deepEqual(mutations(h).map(call => call.url), [DIRECT + TOKEN, DIRECT + TOKEN]);
});

test('wrong credentials are returned without replaying the POST', async () => {
  const h = makeHarness(() => response({ msg: 'invalid credentials' }, 400));
  await h.fetch(DIRECT + TOKEN, { method: 'POST', body: '{}' });
  await h.fetch(DIRECT + TOKEN, { method: 'POST', body: '{}' });
  assert.equal(h.calls.length, 2);
  assert.ok(mutations(h).every(call => call.url === DIRECT + TOKEN));
});

test('primary fetch preserves method, exact query, body, headers and request options', async () => {
  const body = JSON.stringify({ fixture: 'not-a-credential' });
  const h = makeHarness(() => response());
  const pathAndQuery = '/auth/v1/token?grant_type=password&fixture=a%2Bb%26c';
  await h.fetch(DIRECT + pathAndQuery, {
    method: 'POST',
    body,
    headers: {
      authorization: 'Bearer fake-test-token',
      apikey: PUBLIC_FIXTURE_KEY,
      'content-type': 'application/json',
      'x-client-info': 'fixture-client',
    },
    credentials: 'omit',
    cache: 'no-store',
  });
  const call = mutations(h)[0];
  assert.equal(call.url, DIRECT + pathAndQuery);
  assert.equal(call.method, 'POST');
  assert.equal(await call.request.clone().text(), body);
  assert.equal(call.request.headers.get('authorization'), 'Bearer fake-test-token');
  assert.equal(call.request.headers.get('apikey'), PUBLIC_FIXTURE_KEY);
  assert.equal(call.request.headers.get('content-type'), 'application/json');
  assert.equal(call.request.headers.get('x-client-info'), 'fixture-client');
  assert.equal(call.request.credentials, 'omit');
  assert.equal(call.request.cache, 'no-store');
});

test('Request input keeps its POST body, query and authorization on the primary host', async () => {
  const h = makeHarness(() => response());
  const input = new Request(DIRECT + '/auth/v1/token?grant_type=refresh_token', {
    method: 'POST',
    body: JSON.stringify({ fixture: 'fake-refresh-value' }),
    headers: { authorization: 'Bearer fake-test-token', 'content-type': 'application/json' },
  });
  await h.fetch(input);
  const call = mutations(h)[0];
  assert.equal(call.url, DIRECT + '/auth/v1/token?grant_type=refresh_token');
  assert.equal(call.method, 'POST');
  assert.equal(call.request.headers.get('authorization'), 'Bearer fake-test-token');
  assert.deepEqual(JSON.parse(await call.request.clone().text()), { fixture: 'fake-refresh-value' });
  assert.equal(mutations(h).length, 1);
});

test('caller abort is forwarded to the actual POST and never triggers another attempt', async () => {
  const h = makeHarness(() => never());
  const controller = new AbortController();
  const result = observed(h.fetch(DIRECT + TOKEN, { method: 'POST', body: '{}', signal: controller.signal }));
  await flush();
  assert.equal(mutations(h).length, 1);
  const sent = mutations(h)[0];
  assert.ok(sent.signal);
  assert.equal(sent.signal.aborted, false);
  controller.abort();
  const outcome = await result;
  assert.equal(outcome.error && outcome.error.name, 'AbortError');
  assert.equal(sent.signal.aborted, true);
  await h.clock.tick(30000);
  assert.equal(mutations(h).length, 1);
});

test('an already aborted caller signal prevents any credential-bearing request', async () => {
  const h = makeHarness(() => {
    assert.fail('an aborted request must not reach native fetch');
  });
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    h.fetch(DIRECT + TOKEN, { method: 'POST', body: '{}', signal: controller.signal }),
    error => Boolean(error && error.name === 'AbortError')
  );
  assert.equal(mutations(h).length, 0);
  assert.equal(h.calls.length, 0);
});

test('class-board REST and RPC reads are not cut off by the 15s auth deadline', async () => {
  const paths = [
    ['/rest/v1/learner_events?select=learner_id,created_at&order=created_at.asc', 'GET'],
    ['/rest/v1/user_progress?select=user_id,save,updated_at', 'GET'],
    ['/rest/v1/rpc/teacher_directory', 'POST'],
  ];
  for (const [suffix, method] of paths) {
    const h = makeHarness(call => new Promise((resolve, reject) => {
      const abort = () => {
        const error = new Error('aborted');
        error.name = 'AbortError';
        reject(error);
      };
      if (call.signal && call.signal.aborted) abort();
      else if (call.signal) call.signal.addEventListener('abort', abort, { once: true });
    }));
    const controller = new AbortController();
    let settled = false;
    const pending = observed(h.fetch(DIRECT + suffix, {
      method,
      body: method === 'POST' ? '{}' : undefined,
      signal: controller.signal,
    })).then((outcome) => {
      settled = true;
      return outcome;
    });
    await flush();
    assert.equal(h.calls.length, 1, suffix);
    assert.equal(h.calls[0].signal, controller.signal, suffix);
    await h.clock.tick(15000);
    assert.equal(settled, false, suffix);
    assert.equal(controller.signal.aborted, false, suffix);
    await h.clock.tick(120000);
    assert.equal(settled, false, suffix);
    controller.abort();
    const outcome = await pending;
    assert.equal(outcome.error && outcome.error.name, 'AbortError', suffix);
    assert.equal(String(outcome.error && outcome.error.message).includes('QM_AUTH_TIMEOUT'), false, suffix);
    assert.equal(h.calls.length, 1, suffix);
  }
});

test('an auth POST timeout is bounded at 15 seconds and is never replayed, including refresh/signup/recovery', async () => {
  for (const suffix of [
    '/auth/v1/token?grant_type=refresh_token',
    '/auth/v1/signup',
    '/auth/v1/recover',
  ]) {
    const h = makeHarness(() => never());
    const result = observed(h.fetch(DIRECT + suffix, { method: 'POST', body: '{}' }));
    await flush();
    assert.equal(mutations(h).length, 1);
    await h.clock.tick(14999);
    assert.equal(mutations(h)[0].signal.aborted, false);
    await h.clock.tick(1);
    const outcome = await result;
    assert.ok(isCode('QM_AUTH_TIMEOUT')(outcome.error), suffix);
    assert.equal(mutations(h)[0].signal.aborted, true);
    await h.clock.tick(30000);
    assert.equal(mutations(h).length, 1, 'a timed-out mutation may already have taken effect');
  }
});

test('network rejection after sending an auth POST does not retry that mutation', async () => {
  const h = makeHarness(() => {
    throw new TypeError('simulated connection loss after the request may have been sent');
  });
  await assert.rejects(h.fetch(DIRECT + TOKEN, { method: 'POST', body: '{}' }), /simulated connection loss/);
  await h.clock.tick(30000);
  assert.equal(mutations(h).length, 1);
  assert.equal(mutations(h)[0].url, DIRECT + TOKEN);
});

test('concurrent auth calls each send their mutation once on the primary host', async () => {
  const h = makeHarness(() => response());
  await Promise.all([
    h.fetch(DIRECT + TOKEN, { method: 'POST', body: '{"fixture":1}' }),
    h.fetch(DIRECT + '/auth/v1/recover', { method: 'POST', body: '{"fixture":2}' }),
  ]);
  assert.equal(mutations(h).length, 2);
  assert.ok(mutations(h).every(call => call.url.startsWith(DIRECT + '/auth/v1/')));
  assert.equal(h.calls.length, 2);
});

test('unrelated or lookalike hosts do not install a fetch wrapper or receive credentials', () => {
  const unsupported = [
    { SUPABASE_URL: PROXY },
    { SUPABASE_URL: 'https://another-project.supabase.co' },
    { SUPABASE_URL: DIRECT + '.attacker.invalid' },
    { SUPABASE_URL: DIRECT + '/auth/v1' },
    { SUPABASE_URL: PROXY + '.attacker.invalid' },
    { SUPABASE_URL: '' },
  ];
  for (const config of unsupported) {
    const h = makeHarness(() => assert.fail('unsupported hosts must never be fetched by the wrapper'), config);
    assert.equal(h.fetch, undefined);
    assert.equal(h.calls.length, 0);
    assert.equal(h.sdkUrl, String(config.SUPABASE_URL).trim().replace(/\/+$/, ''));
  }
});

test('requests outside the exact primary origin are passed through without URL rewriting', async () => {
  const h = makeHarness(() => response({ fixture: 'passed-through' }));
  const unrelated = DIRECT + '.attacker.invalid/auth/v1/token?fixture=1';
  const init = { method: 'POST', body: 'fixture', headers: { 'x-fixture': 'present' } };
  await h.fetch(unrelated, init);
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].url, unrelated);
  assert.equal(h.calls[0].init, init);
});

test('auth headers with a stalled partial JSON body still abort at the 15 second deadline without replay', async () => {
  let bodyAborted = false;
  const h = makeHarness(call => {
    let bodyController;
    const body = new ReadableStream({
      start(controller) {
        bodyController = controller;
        controller.enqueue(new TextEncoder().encode('{"fixture":"partial-json'));
      },
    });
    call.signal.addEventListener('abort', () => {
      bodyAborted = true;
      bodyController.error(new DOMException('Fixture body aborted', 'AbortError'));
    }, { once: true });
    return new Response(body, {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  });
  let settled = false;
  const result = observed(h.fetch(DIRECT + TOKEN, { method: 'POST', body: '{}' }));
  result.then(() => { settled = true; });
  await flush();
  assert.equal(mutations(h).length, 1);
  const sent = mutations(h)[0];
  await h.clock.tick(14999);
  assert.equal(settled, false, 'receiving headers must not clear the body deadline');
  assert.equal(sent.signal.aborted, false);
  await h.clock.tick(1);
  const outcome = await result;
  assert.ok(isCode('QM_AUTH_TIMEOUT')(outcome.error));
  assert.equal(sent.signal.aborted, true);
  assert.equal(bodyAborted, true);
  await h.clock.tick(30000);
  assert.equal(mutations(h).length, 1, 'a partial response must never cause a replayed auth POST');
});

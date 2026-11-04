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
const HEALTH = '/auth/v1/health';
const TOKEN = '/auth/v1/token?grant_type=password';
const PUBLIC_FIXTURE_KEY = 'test-only-public-key';
const never = () => new Promise(() => {});
const response = (body = { name: 'GoTrue' }, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

async function flush() {
  // VM promises, health JSON parsing, route selection and request dispatch all
  // intentionally remain asynchronous, just as in the browser.
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
      SUPABASE_URL: PROXY,
      SUPABASE_FALLBACK_URL: DIRECT,
      SUPABASE_ANON_KEY: PUBLIC_FIXTURE_KEY,
      SITE_URL: 'https://example.invalid/QuizMario/grok/',
      ...overrides,
    },
    QuizMarioMerge: { isCloudConfigured: () => true },
    supabase: {
      createClient(_url, _key, options) {
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
  return { clock, calls, fetch: customFetch, sdkOptions };
}

function probes(harness) {
  return harness.calls.filter(call => new URL(call.url).pathname === HEALTH);
}
function mutations(harness) {
  return harness.calls.filter(call => call.method !== 'GET' && call.method !== 'HEAD');
}
function isCode(code) {
  return error => Boolean(error && String(error.message).includes(code));
}
function observed(promise) {
  // Attach rejection handling immediately so virtual-clock expiration cannot
  // accidentally be reported as an unhandled rejection by node:test.
  return promise.then(value => ({ value }), error => ({ error }));
}


test('dead proxy and healthy direct route: probe only safe health GET, cache winner for the page', async () => {
  const h = makeHarness(call => {
    if (call.url === PROXY + HEALTH) return never();
    if (call.url === DIRECT + HEALTH) return response();
    return response({ fixture: 'auth-result' });
  });
  assert.equal(typeof h.fetch, 'function');
  const first = await h.fetch(PROXY + TOKEN, { method: 'POST', body: '{}' });
  assert.equal(first.status, 200);
  assert.equal(probes(h).length, 2);
  assert.ok(probes(h).every(call => call.method === 'GET'));
  assert.ok(probes(h).every(call => call.request.headers.get('apikey') === PUBLIC_FIXTURE_KEY));
  assert.ok(probes(h).every(call => !call.request.headers.has('authorization')));
  assert.ok(probes(h).every(call => call.request.body === null));
  assert.equal(mutations(h).length, 1);
  assert.equal(mutations(h)[0].url, DIRECT + TOKEN);

  await h.fetch(PROXY + '/auth/v1/user', { method: 'GET' });
  assert.equal(probes(h).length, 2, 'a second request must reuse the winning route');
  assert.equal(h.calls.at(-1).url, DIRECT + '/auth/v1/user');
});


test('healthy proxy and dead direct route: credentials go to the proxy once', async () => {
  const h = makeHarness(call => {
    if (call.url === DIRECT + HEALTH) return never();
    if (call.url === PROXY + HEALTH) return response();
    return response({ fixture: 'auth-result' });
  });
  await h.fetch(PROXY + TOKEN, { method: 'POST', body: '{}' });
  assert.equal(probes(h).length, 2);
  assert.equal(mutations(h).length, 1);
  assert.equal(mutations(h)[0].url, PROXY + TOKEN);
});

test('direct primary can use the exact same-project proxy fallback', async () => {
  const h = makeHarness(call => call.url === DIRECT + HEALTH ? never() : response(), {
    SUPABASE_URL: DIRECT, SUPABASE_FALLBACK_URL: PROXY,
  });
  await h.fetch(DIRECT + TOKEN, { method: 'POST', body: '{}' });
  assert.equal(mutations(h)[0].url, PROXY + TOKEN);
});

test('a healthy route with a failing POST cools down for the next explicit retry', async () => {
  const h = makeHarness(call => {
    if (new URL(call.url).pathname === HEALTH) return response();
    if (call.url.startsWith(PROXY)) throw new TypeError('Failed to fetch');
    return response();
  });
  await assert.rejects(h.fetch(PROXY + TOKEN, { method:'POST', body:'{}' }), /Failed to fetch/);
  await h.fetch(PROXY + TOKEN, { method:'POST', body:'{}' });
  assert.deepEqual(mutations(h).map(x=>x.url), [PROXY + TOKEN,DIRECT + TOKEN]);
  assert.equal(probes(h).length,3);
});

test('wrong credentials are returned without changing routes or replaying the POST', async () => {
  const h = makeHarness(call => new URL(call.url).pathname === HEALTH ? response() : response({msg:'invalid credentials'},400));
  await h.fetch(PROXY + TOKEN,{method:'POST',body:'{}'});
  await h.fetch(PROXY + TOKEN,{method:'POST',body:'{}'});
  assert.equal(probes(h).length,2);
  assert.ok(mutations(h).every(c=>c.url===PROXY + TOKEN));
});


test('both health routes hanging: fail within the 8 second probe budget and never send auth POST', async () => {
  const h = makeHarness(() => never());
  let settled = false;
  const result = observed(h.fetch(PROXY + TOKEN, { method: 'POST', body: '{}' }));
  result.then(() => { settled = true; });
  await flush();
  assert.equal(probes(h).length, 2);
  await h.clock.tick(7999);
  assert.equal(settled, false);
  await h.clock.tick(1);
  const outcome = await result;
  assert.ok(isCode('QM_AUTH_NETWORK')(outcome.error));
  assert.equal(mutations(h).length, 0);
  assert.ok(probes(h).every(call => call.signal && call.signal.aborted));
});


test('HTTP errors and a different health service cannot win the route race', async () => {
  const h = makeHarness(call => {
    if (call.url === PROXY + HEALTH) return response({ name: 'GoTrue' }, 503);
    if (call.url === DIRECT + HEALTH) return response({ name: 'unrelated-service' });
    assert.fail('no credential-bearing request may be issued without a healthy GoTrue route');
  });
  await assert.rejects(h.fetch(PROXY + TOKEN, { method: 'POST', body: '{}' }), isCode('QM_AUTH_NETWORK'));
  assert.equal(mutations(h).length, 0);
});


test('fallback preserves method, exact query, body, headers and request options', async () => {
  const body = JSON.stringify({ fixture: 'not-a-credential' });
  const h = makeHarness(call => call.url === PROXY + HEALTH ? never() : response());
  const pathAndQuery = '/auth/v1/token?grant_type=password&fixture=a%2Bb%26c';
  await h.fetch(PROXY + pathAndQuery, {
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


test('Request input is rebased without losing its POST body, query or authorization', async () => {
  const h = makeHarness(call => call.url === PROXY + HEALTH ? never() : response());
  const input = new Request(PROXY + '/auth/v1/token?grant_type=refresh_token', {
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


test('caller abort is forwarded to the actual POST and never triggers another route attempt', async () => {
  const h = makeHarness(call => {
    if (call.url === PROXY + HEALTH) return never();
    if (call.url === DIRECT + HEALTH) return response();
    return never(); // deliberately ignore the signal; the wrapper must still settle
  });
  const controller = new AbortController();
  const result = observed(h.fetch(PROXY + TOKEN, { method: 'POST', body: '{}', signal: controller.signal }));
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


test('caller abort during a hanging health race promptly cancels the logical request without a POST', async () => {
  const h = makeHarness(() => never());
  const controller = new AbortController();
  let outcome;
  observed(h.fetch(PROXY + TOKEN, { method: 'POST', body: '{}', signal: controller.signal }))
    .then(value => { outcome = value; });
  await flush();
  assert.equal(probes(h).length, 2);
  controller.abort();
  await flush();
  assert.ok(outcome, 'caller cancellation must not wait for the 8 second health deadline');
  assert.equal(outcome.error && outcome.error.name, 'AbortError');
  assert.equal(mutations(h).length, 0);
  // Health work may be shared by other callers; it need not be cancelled, but
  // completing it later must never revive this aborted logical request.
  await h.clock.tick(8000);
  assert.equal(mutations(h).length, 0);
});


test('an already aborted caller signal prevents any credential-bearing request', async () => {
  const h = makeHarness(call => {
    if (new URL(call.url).pathname === HEALTH) return response();
    assert.fail('an aborted request must not reach native fetch');
  });
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(h.fetch(PROXY + TOKEN, { method: 'POST', body: '{}', signal: controller.signal }),
    error => Boolean(error && error.name === 'AbortError'));
  assert.equal(mutations(h).length, 0);
});


test('an auth POST timeout is bounded at 15 seconds and is never replayed, including refresh/signup/recovery', async () => {
  for (const suffix of [
    '/auth/v1/token?grant_type=refresh_token',
    '/auth/v1/signup',
    '/auth/v1/recover',
  ]) {
    const h = makeHarness(call => {
      if (new URL(call.url).pathname === HEALTH) return response();
      return never();
    });
    const result = observed(h.fetch(PROXY + suffix, { method: 'POST', body: '{}' }));
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


test('network rejection after sending an auth POST does not retry that mutation on the healthy fallback', async () => {
  const h = makeHarness(call => {
    if (new URL(call.url).pathname === HEALTH) return response();
    throw new TypeError('simulated connection loss after the request may have been sent');
  });
  await assert.rejects(h.fetch(PROXY + TOKEN, { method: 'POST', body: '{}' }), /simulated connection loss/);
  await h.clock.tick(30000);
  assert.equal(mutations(h).length, 1);
});


test('concurrent auth calls share health probes but each explicit mutation is sent only once', async () => {
  const h = makeHarness(call => call.url === PROXY + HEALTH ? never() : response());
  await Promise.all([
    h.fetch(PROXY + TOKEN, { method: 'POST', body: '{"fixture":1}' }),
    h.fetch(PROXY + '/auth/v1/recover', { method: 'POST', body: '{"fixture":2}' }),
  ]);
  assert.equal(probes(h).length, 2, 'route selection must be shared within the browser client');
  assert.equal(mutations(h).length, 2);
  assert.ok(mutations(h).every(call => call.url.startsWith(DIRECT + '/auth/v1/')));
});


test('a failed health selection is discarded so a later explicit user retry can re-probe', async () => {
  let healthy = false;
  const h = makeHarness(call => {
    if (new URL(call.url).pathname === HEALTH) {
      return healthy ? response() : Promise.reject(new TypeError('fixture offline'));
    }
    return response({ fixture: 'retried-by-user' });
  });
  await assert.rejects(h.fetch(PROXY + TOKEN, { method: 'POST', body: '{}' }), isCode('QM_AUTH_NETWORK'));
  assert.equal(mutations(h).length, 0);
  healthy = true;
  await h.fetch(PROXY + TOKEN, { method: 'POST', body: '{}' });
  assert.equal(probes(h).length, 4);
  assert.equal(mutations(h).length, 1);
});


test('unrelated or lookalike fallback URLs do not install route racing or receive credentials', () => {
  const unsupported = [
    { SUPABASE_FALLBACK_URL: 'https://another-project.supabase.co' },
    { SUPABASE_FALLBACK_URL: DIRECT + '.attacker.invalid' },
    { SUPABASE_FALLBACK_URL: DIRECT + '/auth/v1' },
    { SUPABASE_URL: PROXY + '.attacker.invalid' },
    { SUPABASE_FALLBACK_URL: '' },
  ];
  for (const config of unsupported) {
    const h = makeHarness(() => assert.fail('unsupported routes must never be probed'), config);
    assert.equal(h.fetch, undefined);
    assert.equal(h.calls.length, 0);
  }
});


test('requests outside the exact primary origin are passed through without health probes or URL rewriting', async () => {
  const h = makeHarness(() => response({ fixture: 'passed-through' }));
  const unrelated = PROXY + '.attacker.invalid/auth/v1/token?fixture=1';
  const init = { method: 'POST', body: 'fixture', headers: { 'x-fixture': 'present' } };
  await h.fetch(unrelated, init);
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].url, unrelated);
  assert.equal(h.calls[0].init, init);
  assert.equal(probes(h).length, 0);
});


test('auth headers with a stalled partial JSON body still abort at the 15 second deadline without replay', async () => {
  let bodyAborted = false;
  const h = makeHarness(call => {
    if (new URL(call.url).pathname === HEALTH) return response();
    let bodyController;
    const body = new ReadableStream({
      start(controller) {
        bodyController = controller;
        controller.enqueue(new TextEncoder().encode('{"fixture":"partial-json'));
        // Deliberately leave the real response body open after sending headers.
      },
    });
    call.signal.addEventListener('abort', () => {
      bodyAborted = true;
      // Model native fetch aborting an in-progress response body as well as
      // its request. Closing both tee branches prevents leaked stream work.
      bodyController.error(new DOMException('Fixture body aborted', 'AbortError'));
    }, { once: true });
    return new Response(body, {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  });
  let settled = false;
  const result = observed(h.fetch(PROXY + TOKEN, { method: 'POST', body: '{}' }));
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


test('a late health result from a failed attempt cannot poison the next user-initiated route race', async () => {
  let releaseOldProxy;
  let releaseNewDirect;
  const oldProxy = new Promise(resolve => { releaseOldProxy = resolve; });
  const newDirect = new Promise(resolve => { releaseNewDirect = resolve; });
  let proxyProbes = 0;
  let directProbes = 0;
  let posted = 0;
  const h = makeHarness(call => {
    if (call.url === PROXY + HEALTH) {
      proxyProbes += 1;
      return proxyProbes === 1 ? oldProxy : never();
    }
    if (call.url === DIRECT + HEALTH) {
      directProbes += 1;
      return directProbes === 1 ? response() : newDirect;
    }
    posted += 1;
    if (posted === 1) throw new TypeError('fixture first POST connection lost');
    return response({ fixture: 'second explicit request completed' });
  });

  await assert.rejects(h.fetch(PROXY + TOKEN, { method: 'POST', body: '{}' }), /first POST connection lost/);
  assert.equal(mutations(h).length, 1);
  assert.equal(mutations(h)[0].url, DIRECT + TOKEN);

  await h.clock.tick(60001); // retry after the failed-route cooldown
  let outcome;
  observed(h.fetch(PROXY + TOKEN, { method: 'POST', body: '{}' }))
    .then(value => { outcome = value; });
  await flush();
  assert.equal(probes(h).length, 4, 'the explicit retry starts a new health race');
  releaseOldProxy(response());
  await flush();
  releaseNewDirect(response());
  await flush();

  assert.ok(outcome, 'a stale probe must not steal selected and leave the current route promise unresolved');
  assert.ifError(outcome.error);
  assert.equal(mutations(h).length, 2, 'only the two explicit user requests may POST');
  assert.equal(mutations(h)[1].url, DIRECT + TOKEN, 'the current race must determine the new route');
});

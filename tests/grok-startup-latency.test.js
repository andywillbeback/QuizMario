'use strict';

// Exercise the real guard + sync boundary with delayed auth/data responses.
// No real accounts, credentials, network, or wall-clock sleeps are used.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const createStore = require('../grok/account-store');

const clone = value => JSON.parse(JSON.stringify(value));
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
async function settle() { for (let i = 0; i < 100; i++) await Promise.resolve(); }
function storage() {
  const values = new Map();
  return {
    getItem: key => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key),
    key: i => [...values.keys()][i] || null,
    get length() { return values.size; },
  };
}
function snapshot(points, name = '测试甲') {
  return { cards: {}, points, profile: { name, cls: '测试班' }, track: 'gaokao', updatedAt: '2026-11-08T00:00:00.000Z' };
}
function session(id = 'test-A') {
  return { access_token: 'test-only-token', expires_at: 4102444800, user: { id, email: id + '@example.test' } };
}
function harness({ disk = storage(), authResult, read, owner = 'test-A' } = {}) {
  let current = owner, state = null, now = Date.parse('2026-11-08T01:00:00Z'), nextTimer = 1;
  const calls = [], writes = [], redirects = [], statuses = [], authHandlers = [], classes = new Set(), timers = new Map();
  const listeners = {}, docListeners = {}, elements = {};
  disk.setItem('quizmario-auth', JSON.stringify(session(current)));
  const client = {
    auth: {
      getSession() { calls.push({ kind: 'auth', owner: current }); return authResult || Promise.resolve({ data: { session: session(current) } }); },
      onAuthStateChange(fn) { authHandlers.push(fn); },
      async signOut() { calls.push({ kind: 'signOut' }); current = ''; },
    },
    from(table) {
      const filters = [], q = {
        select() { return q; }, eq(key, value) { filters.push([key, value]); return q; },
        maybeSingle() { return q; }, abortSignal() { return q; },
        then(resolve, reject) {
          const id = (filters.find(([key]) => key === 'user_id') || [])[1];
          calls.push({ kind: 'read', table, owner: id });
          return Promise.resolve().then(() => read ? read(id) : { data: null }).then(resolve, reject);
        },
      };
      return q;
    },
  };
  function getElementById(id) {
    if (!['auth-hold', 'sync-status', 'login-link', 'login-cta', 'btn-logout', 'wipe-label'].includes(id)) return null;
    return elements[id] || (elements[id] = { textContent: '', hidden: false, classList: { toggle() {} }, addEventListener() {} });
  }
  class TestDate extends Date { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } }
  const context = {
    console, Promise, Object, Array, Set, Math, JSON, Date: TestDate, Number, String, crypto, AbortController,
    localStorage: disk, navigator: { onLine: true },
    location: { search: '', hash: '', replace: value => redirects.push(value) },
    document: {
      visibilityState: 'visible', getElementById,
      documentElement: { classList: { add: key => classes.add(key), remove: key => classes.delete(key), contains: key => classes.has(key) } },
      addEventListener: (type, fn) => (docListeners[type] || (docListeners[type] = [])).push(fn),
    },
    addEventListener: (type, fn) => (listeners[type] || (listeners[type] = [])).push(fn),
    dispatchEvent(event) {
      for (const fn of listeners[event.type] || []) fn(event);
    },
    CustomEvent: function (type, options) { this.type = type; this.detail = options && options.detail; },
    setTimeout(fn, ms = 0) { const id = nextTimer++; timers.set(id, { fn, at: now + ms }); return id; },
    clearTimeout: id => timers.delete(id),
    setInterval(fn, ms) { const id = nextTimer++; timers.set(id, { fn, at: now + ms, repeat: ms }); return id; },
    clearInterval: id => timers.delete(id),
    QuizMarioCloudClient: { client: () => client, isConfigured: () => true },
    __QM_ENTRY_STATUS(message, failed) { statuses.push({ phase: context.__QM_ENTRY_PHASE, message, failed }); getElementById('auth-hold').textContent = message; },
    __QM_EXPECT_SESSION: true,
  };
  context.window = context;
  vm.createContext(context);
  function load(file) { vm.runInContext(fs.readFileSync(path.join(__dirname, '../grok', file), 'utf8'), context, { filename: file }); }
  context.__QM_ENTRY_WATCHDOG = context.setTimeout(() => context.__QM_ENTRY_STATUS('页面加载较慢，请刷新重试。', true), 30000);
  load('account-store.js'); load('sync-core.js'); load('entry-guard.js');
  return {
    ctx: context, disk, calls, writes, redirects, statuses, classes, elements, timers,
    get state() { return state; },
    startApp() {
      context.__QM = {
        getSave: () => state,
        applyCloudSave(value) { state = clone(value); writes.push(clone(value)); },
        applySyncedSave(value) { state = clone(value); writes.push(clone(value)); },
        onSessionReady() {}, setProfile() {},
      };
      load('sync.js');
    },
    setAuthResult(result) { authResult = result; },
    changeAuth(id) {
      current = id;
      disk.setItem('quizmario-auth', JSON.stringify(id ? session(id) : null));
      for (const handler of authHandlers) handler(id ? 'SIGNED_IN' : 'SIGNED_OUT', id ? session(id) : null);
    },
    async advance(ms) {
      const end = now + ms;
      for (let i = 0; i < 10000; i++) {
        const item = [...timers].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!item) break;
        const [id, timer] = item;
        now = timer.at; timers.delete(id);
        if (timer.repeat) timers.set(id, { ...timer, at: now + timer.repeat });
        timer.fn(); await settle();
      }
      now = end; await settle();
    },
  };
}

(async () => {
  const disk = storage(), store = createStore(disk), remote = deferred();
  disk.setItem('vocabSpotlight_v1', JSON.stringify(snapshot(999, '旧版未归属记录')));
  store.set('vocabSpotlight_v1', JSON.stringify(snapshot(7)), 'test-A');
  store.set('vocabSpotlight_v1', JSON.stringify(snapshot(88, '测试乙')), 'test-B');
  const h = harness({ disk, read: () => remote.promise });
  await settle();
  assert.equal(h.calls.filter(c => c.kind === 'auth').length, 1);
  assert.equal(h.calls.filter(c => c.kind === 'read').length, 1, 'progress fetch starts before game scripts are ready');
  assert.equal(h.ctx.__QM_ENTRY_PHASE, 'content', 'successful auth stops claiming the session is still being checked');
  assert.ok(h.timers.has(h.ctx.__QM_ENTRY_WATCHDOG), 'auth success keeps the page-load watchdog while game scripts load');
  assert.ok(!h.classes.has('session-ok'), 'a neutral shell never opens learning');
  await h.advance(5000);
  h.startApp(); await settle();
  assert.equal(h.calls.filter(c => c.kind === 'auth').length, 1, 'sync shares the completed verification');
  assert.equal(h.calls.filter(c => c.kind === 'read').length, 1, 'sync consumes the in-flight read instead of restarting it');
  assert.equal(h.state.points, 7, 'fast entry applies only the verified account cache');
  assert.ok(h.statuses.some(status => status.phase === 'progress'));
  assert.ok(!h.timers.has(h.ctx.__QM_ENTRY_WATCHDOG), 'only account-owned ready state ends the page-load watchdog');
  assert.equal(h.ctx.QuizMarioCloud.syncState().ready, true);
  assert.equal(h.ctx.QuizMarioCloud.syncState().checking, true, 'fast entry still waits for the shared server baseline before uploads');
  assert.ok(h.classes.has('session-ok'), 'a verified owned cache keeps the existing immediate-learning path');
  assert.equal(h.ctx.__QM_ENTRY_PHASE, 'ready');
  assert.equal(h.ctx.QuizMarioCloud.syncState().lastAcknowledged, '', 'restoring cache is never a cloud acknowledgement');
  assert.ok(!/已自动同步/.test(h.elements['sync-status'].textContent));
  remote.resolve({ data: { save: snapshot(12), updated_at: 'cloud-v1' } }); await settle();
  assert.equal(h.state.points, 12);
  assert.ok(h.classes.has('session-ok'));
  assert.equal(h.ctx.QuizMarioCloud.syncState().lastAcknowledged, 'cloud-v1');
  assert.equal(h.ctx.QuizMarioCloud.syncState().checking, false);
  assert.equal(JSON.parse(disk.getItem('vocabSpotlight_v1')).points, 999, 'legacy unowned records remain preserved');
  assert.equal(JSON.parse(store.get('vocabSpotlight_v1', 'test-B')).points, 88, 'another account is untouched');

  const missingDisk = storage(), missingRemote = deferred();
  missingDisk.setItem('vocabSpotlight_v1', JSON.stringify(snapshot(999)));
  const first = harness({ disk: missingDisk, read: () => missingRemote.promise });
  await settle(); first.startApp(); await settle();
  assert.equal(first.ctx.__QM_ENTRY_PHASE, 'progress', 'unowned cache does not open a first device');
  assert.equal(first.state.points, undefined);
  assert.ok(!first.classes.has('session-ok'));
  await first.advance(20001);
  assert.ok(!first.classes.has('session-ok'), 'a timeout cannot reveal a fresh account with no owned cache');
  assert.equal(first.ctx.QuizMarioCloud.syncState().ready, false);
  assert.equal(first.redirects.length, 0, 'a slow progress service never signs the learner out');
  assert.ok(first.statuses.some(status => status.phase === 'progress' && status.failed));

  const timeoutDisk = storage(), timeoutStore = createStore(timeoutDisk);
  timeoutStore.set('vocabSpotlight_v1', JSON.stringify(snapshot(4)), 'test-A');
  const timeout = harness({ disk: timeoutDisk, read: () => new Promise(() => {}) });
  await settle(); timeout.startApp(); await settle();
  await timeout.advance(20001);
  assert.ok(timeout.classes.has('session-ok'), 'the existing offline owned-cache fallback still works');
  assert.equal(timeout.state.points, 4);
  assert.equal(timeout.ctx.QuizMarioCloud.syncState().lastAcknowledged, '', 'fallback is not a cloud acknowledgement');
  assert.equal(timeout.ctx.__QM_ENTRY_PHASE, 'ready');
  assert.ok(!/已自动同步/.test(timeout.elements['sync-status'].textContent));

  const failedDisk = storage();
  createStore(failedDisk).set('vocabSpotlight_v1', JSON.stringify(snapshot(6)), 'test-A');
  const failedEarly = harness({ disk: failedDisk, read: () => Promise.reject(new Error('test network unavailable')) });
  await settle(); // A prefetch may fail before its consumer script is loaded.
  failedEarly.startApp(); await settle();
  assert.equal(failedEarly.calls.filter(c => c.kind === 'read').length, 1, 'an already failed prefetch is observed once, not silently duplicated');
  assert.equal(failedEarly.state.points, 6);
  assert.ok(failedEarly.classes.has('session-ok'), 'observed failure can use the existing owned-cache fallback');
  assert.equal(failedEarly.ctx.QuizMarioCloud.syncState().lastAcknowledged, '');
  assert.ok(failedEarly.ctx.QuizMarioCloud.syncState().retrying, 'background retry remains scheduled');

  const invalid = harness({ authResult: Promise.resolve({ data: { session: { user: { id: 'test-A' } } } }) });
  await settle(); invalid.startApp(); await settle();
  assert.equal(invalid.calls.filter(c => c.kind === 'read').length, 0, 'invalid session never prefetches progress');
  assert.equal(invalid.writes.length, 0);
  assert.ok(!invalid.classes.has('session-ok'));
  assert.ok(invalid.redirects.every(url => url === 'login.html'));

  const changedRead = deferred(), switched = harness({ read: () => changedRead.promise });
  await settle(); switched.startApp(); await settle();
  switched.changeAuth('test-B');
  assert.ok(!switched.classes.has('session-ok'), 'account switch hides learning synchronously');
  const priorWrites = switched.writes.length;
  changedRead.resolve({ data: { save: snapshot(77), updated_at: 'late-A' } }); await settle();
  assert.equal(switched.writes.length, priorWrites, 'late response for A cannot repaint after switching to B');
  assert.ok(!switched.classes.has('session-ok'));

  const authWait = deferred(), authSwitch = harness({ authResult: authWait.promise });
  authSwitch.startApp(); await settle();
  authSwitch.changeAuth('test-B');
  authWait.resolve({ data: { session: session('test-A') } }); await settle();
  assert.equal(authSwitch.writes.length, 0, 'a stale initial verification cannot select the former account cache');
  assert.equal(authSwitch.calls.filter(c => c.kind === 'read').length, 0, 'a stale initial verification cannot start a former-account progress read');
  assert.ok(!authSwitch.classes.has('session-ok'));

  const guardAuth = deferred(), guardOnly = harness({ authResult: guardAuth.promise });
  await settle();
  guardOnly.disk.setItem('quizmario-auth', JSON.stringify(session('test-B')));
  guardAuth.resolve({ data: { session: session('test-A') } }); await settle();
  assert.equal(guardOnly.calls.filter(c => c.kind === 'read').length, 0, 'account changes fail closed even before sync.js and its auth listener have loaded');
  assert.ok(!guardOnly.classes.has('session-ok'));
  guardOnly.startApp(); await settle();
  assert.equal(guardOnly.writes.length, 0);

  // Logout can occur after the guard has verified A but before sync.js loads.
  const loggedOutDisk = storage();
  createStore(loggedOutDisk).set('vocabSpotlight_v1', JSON.stringify(snapshot(9)), 'test-A');
  const loggedOut = harness({ disk: loggedOutDisk });
  await settle(); loggedOut.changeAuth('');
  loggedOut.startApp(); await settle();
  assert.equal(loggedOut.writes.length, 0, 'a once-valid shared session cannot reopen A after logout');
  assert.ok(!loggedOut.classes.has('session-ok'));
  assert.equal(createStore(loggedOutDisk).get('vocabSpotlight_v1', 'test-A'), JSON.stringify(snapshot(9)), 'logout invalidates entry without deleting owned records');

  // Both the visible guard and its sync consumer stop waiting at the deadline.
  // The SDK may still settle later; that must not start a read or reveal cache.
  const stalledAuth = deferred(), stalledDisk = storage();
  createStore(stalledDisk).set('vocabSpotlight_v1', JSON.stringify(snapshot(5)), 'test-A');
  const stalled = harness({ disk: stalledDisk, authResult: stalledAuth.promise });
  stalled.startApp(); await settle();
  const storedAuth = stalledDisk.getItem('quizmario-auth');
  await stalled.advance(25001);
  assert.equal(stalled.calls.filter(call => call.kind === 'auth').length, 1);
  assert.equal(stalled.redirects.length, 0, 'a session timeout offers recovery without forcing a new login');
  assert.equal(stalled.calls.filter(call => call.kind === 'signOut').length, 0);
  assert.ok(stalled.statuses.at(-1).failed);
  assert.equal(stalled.statuses.at(-1).phase, 'session');
  assert.equal(stalledDisk.getItem('quizmario-auth'), storedAuth);
  assert.equal(stalled.writes.length, 0);
  stalledAuth.resolve({ data: { session: session() } }); await settle();
  assert.equal(stalled.calls.filter(call => call.kind === 'read').length, 0);
  assert.ok(!stalled.classes.has('session-ok'), 'late SDK success cannot revive a timed-out verification');

  const transient = harness({ authResult: Promise.resolve({ error: new Error('network unavailable') }) });
  await settle(); transient.startApp(); await settle();
  assert.equal(transient.redirects.length, 0, 'a transient auth error must not masquerade as a missing session');
  assert.equal(transient.writes.length, 0);
  assert.ok(transient.statuses.at(-1).failed);

  for (const error of [
    { name: 'AuthSessionMissingError' },
    { name: 'AuthApiError', status: 400, code: 'refresh_token_not_found' },
    { name: 'AuthApiError', status: 401, code: 'session_not_found' },
  ]) {
    const expired = harness({ authResult: Promise.resolve({ error }) });
    await settle(); expired.startApp(); await settle();
    assert.ok(expired.redirects.includes('login.html'), 'an explicitly invalid session returns to login');
    assert.equal(expired.writes.length, 0);
  }
  const unavailable = harness({ authResult: Promise.resolve({ error: { name: 'AuthRetryableFetchError', status: 503 } }) });
  await settle(); unavailable.startApp(); await settle();
  assert.equal(unavailable.redirects.length, 0, 'server errors do not revoke a session');
  const sdkRemoval = deferred(), removed = harness({ authResult: sdkRemoval.promise });
  await settle(); removed.changeAuth('');
  sdkRemoval.resolve({ error: { name: 'AuthApiError', status: 400, message: 'legacy invalid grant response' } });
  await settle(); removed.startApp(); await settle();
  assert.ok(removed.redirects.includes('login.html'), 'a permanent legacy SDK error is definitive after its SIGNED_OUT event and storage removal');

  const missingComponent = harness({ authResult: new Promise(() => {}) });
  missingComponent.ctx.QuizMarioCloudClient = null;
  missingComponent.startApp(); await settle();
  assert.equal(missingComponent.ctx.__QM_ENTRY_PHASE, 'session', 'missing components cannot claim an unverified learner is logged in');
  assert.ok(!missingComponent.classes.has('session-ok'));

  // The stored page must reverify on bfcache restore, with one fresh SDK call.
  // Repeated restores replace older checks; their late errors cannot hide the
  // newer verified interface or write another account's records.
  const restoredDisk = storage();
  createStore(restoredDisk).set('vocabSpotlight_v1', JSON.stringify(snapshot(3)), 'test-A');
  const restored = harness({ disk: restoredDisk });
  await settle(); restored.startApp(); await settle();
  assert.ok(restored.classes.has('session-ok'));
  const oldRestore = deferred(); restored.setAuthResult(oldRestore.promise);
  restored.ctx.dispatchEvent({ type: 'pageshow', persisted: true }); await settle();
  assert.ok(!restored.classes.has('session-ok'), 'a restored page stays hidden during its new verification');
  assert.equal(restored.calls.filter(call => call.kind === 'auth').length, 2);
  restored.setAuthResult(Promise.resolve({ data: { session: session() } }));
  restored.ctx.dispatchEvent({ type: 'pageshow', persisted: true }); await settle();
  assert.equal(restored.calls.filter(call => call.kind === 'auth').length, 3, 'guard and sync share each restored-page check');
  assert.ok(restored.classes.has('session-ok'));
  const latestStatus = restored.statuses.length;
  oldRestore.reject(new Error('late stale verification')); await settle();
  assert.ok(restored.classes.has('session-ok'));
  assert.equal(restored.statuses.length, latestStatus, 'stale rejection cannot replace a newer phase or failure state');
  assert.equal(restored.redirects.length, 0);

  // A page restored before its initial auth finishes must also resume sync.
  const initialWait = deferred(), initialRestore = harness({ authResult: initialWait.promise });
  initialRestore.startApp(); await settle();
  initialRestore.setAuthResult(Promise.resolve({ data: { session: session() } }));
  initialRestore.ctx.dispatchEvent({ type: 'pageshow', persisted: true }); await settle();
  assert.ok(initialRestore.classes.has('session-ok'));
  assert.equal(initialRestore.calls.filter(call => call.kind === 'auth').length, 2);
  initialWait.resolve({ data: { session: session('test-B') } }); await settle();
  assert.ok(initialRestore.classes.has('session-ok'));
  assert.equal(initialRestore.ctx.QuizMarioCloud.userId(), 'test-A');

  // Storage events cover account changes before sync's listeners exist.
  const changedStorage = harness(); await settle();
  changedStorage.disk.removeItem('quizmario-auth');
  changedStorage.ctx.dispatchEvent({ type: 'storage', key: 'quizmario-auth', newValue: null });
  changedStorage.startApp(); await settle();
  assert.ok(!changedStorage.classes.has('session-ok'));
  assert.equal(changedStorage.writes.length, 0);

  // A retry already in flight cannot apply A while a restored page verifies B,
  // even if the browser did not deliver an auth event while it was suspended.
  const retryRead = deferred(), nextAuth = deferred(); let readCount = 0;
  const restoringOther = harness({ read: () => ++readCount === 1 ? Promise.reject(new Error('temporary network failure')) : retryRead.promise });
  await settle(); restoringOther.startApp(); await settle(); await restoringOther.advance(2001);
  assert.equal(readCount, 2, 'the automatic retry is in flight before restoration');
  const beforeRestore = restoringOther.writes.length;
  restoringOther.disk.setItem('quizmario-auth', JSON.stringify(session('test-B')));
  restoringOther.setAuthResult(nextAuth.promise);
  restoringOther.ctx.dispatchEvent({ type: 'pageshow', persisted: true }); await settle();
  retryRead.resolve({ data: { save: snapshot(70), updated_at: 'late-A-retry' } }); await settle();
  assert.equal(restoringOther.writes.length, beforeRestore, 'old progress cannot apply while restored-page auth is unresolved');
  assert.ok(!restoringOther.classes.has('session-ok'));
  nextAuth.resolve({ data: { session: session('test-B') } }); await settle();
  assert.equal(restoringOther.writes.length, beforeRestore, 'new B verification cannot authorize a late A response');
  assert.ok(!restoringOther.classes.has('session-ok'));

  console.log('grok-startup-latency ok: one bounded session/read, owned-cache entry, staged loading, durable retry, account races and restored-page verification');
})().catch(error => { console.error(error); process.exitCode = 1; });

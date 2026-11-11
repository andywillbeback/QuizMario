'use strict';

// Exercise the actual early inline shell, before any deferred application code.
// Network slowness must not turn a stored session hint into a redirect or access.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const html = fs.readFileSync(path.join(__dirname, '..', 'grok', 'index.html'), 'utf8');
const inline = html.match(/<script\s*>([\s\S]*?)<\/script>/i);
assert.ok(inline, 'the initial document contains an early inline entry guard');
const fixtureSession = JSON.stringify({
  user: { id: 'fictional-shell-learner' },
  access_token: 'fictional-shell-access-token',
});

function shell({ auth = fixtureSession, search = '', hash = '', storageBlocked = false } = {}) {
  const foreign = JSON.stringify({ profile: { name: '其他账号测试名字' }, points: 98765 });
  const local = new Map([
    ['vocabSpotlight_v1:account:fictional-other-learner', foreign],
    ['vocabSpotlight_v1', JSON.stringify({ profile: { name: '未归属测试名字' } })],
  ]);
  if (auth !== null) local.set('quizmario-auth', auth);
  const original = new Map(local);
  const classes = new Set();
  const windows = new Map();
  const documents = new Map();
  const elements = new Map();
  const timers = new Map();
  const redirects = [];
  let now = 0, nextTimer = 0;
  function on(target, type, callback) {
    if (!target.has(type)) target.set(type, []);
    target.get(type).push(callback);
  }
  const context = {
    console,
    location: { search, hash, replace: value => redirects.push(value) },
    localStorage: {
      getItem(key) {
        if (storageBlocked) throw new Error('fixture storage denied');
        return local.has(key) ? local.get(key) : null;
      },
      setItem() { throw new Error('the loading shell must not rewrite learner records'); },
      removeItem() { throw new Error('the loading shell must not clear learner records'); },
    },
    document: {
      documentElement: {
        classList: { add: value => classes.add(value), remove: value => classes.delete(value), contains: value => classes.has(value) },
      },
      getElementById: id => elements.get(id) || null,
      addEventListener: (type, callback) => on(documents, type, callback),
    },
    addEventListener: (type, callback) => on(windows, type, callback),
    setTimeout(callback, delay) {
      const id = ++nextTimer;
      timers.set(id, { callback, at: now + Number(delay || 0) });
      return id;
    },
    clearTimeout: id => timers.delete(id),
  };
  context.window = context;
  vm.runInNewContext(inline[1], context, { filename: 'grok/index.html:early-shell' });
  function advance(milliseconds) {
    const end = now + milliseconds;
    for (;;) {
      const pending = [...timers.entries()].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at);
      if (!pending.length) break;
      const [id, timer] = pending[0];
      now = timer.at;
      timers.delete(id);
      timer.callback();
    }
    now = end;
  }
  function parseBody() {
    elements.set('auth-hold', { textContent: '正在确认登录…' });
    elements.set('startup-help', { hidden: true });
  }
  function domReady() {
    for (const callback of documents.get('DOMContentLoaded') || []) callback({ type: 'DOMContentLoaded' });
  }
  function pageshow(persisted) {
    for (const callback of windows.get('pageshow') || []) callback({ persisted });
  }
  function privateUntilVerified() {
    assert.equal(classes.has('session-ok'), false, 'the early shell cannot grant access from local hints or elapsed time');
    for (const element of elements.values()) {
      assert.doesNotMatch(element.textContent || '', /其他账号测试名字|未归属测试名字|98765/, 'loading messages cannot disclose foreign or unowned records');
    }
    assert.deepEqual(local, original, 'loading preserves every original local record');
  }
  return { context, classes, elements, redirects, local, advance, parseBody, domReady, pageshow, privateUntilVerified };
}

test('thirty seconds of slow startup preserve the page and keep unverified learning hidden', () => {
  const app = shell();
  app.parseBody();
  app.advance(29999);
  assert.deepEqual(app.redirects, []);
  app.privateUntilVerified();
  app.advance(1);
  assert.deepEqual(app.redirects, [], 'slow resources are not evidence that the user signed out');
  assert.match(app.elements.get('auth-hold').textContent, /登录验证/);
  assert.doesNotMatch(app.elements.get('auth-hold').textContent, /已登录/);
  assert.equal(app.elements.get('startup-help').hidden, false, 'a stalled start offers a retry');
  app.advance(90000);
  assert.deepEqual(app.redirects, []);
  app.privateUntilVerified();
});

for (const [phase, expected] of [
  ['content', /已登录.*学习内容/],
  ['progress', /已登录.*学习进度/],
]) {
  test('the loading shell identifies a stalled ' + phase + ' phase without unlocking learning', () => {
    const app = shell();
    app.parseBody();
    // The verified-session and progress components own these phase transitions.
    app.context.__QM_ENTRY_PHASE = phase;
    app.advance(30000);
    assert.match(app.elements.get('auth-hold').textContent, expected);
    assert.doesNotMatch(app.elements.get('auth-hold').textContent, /登录验证|已自动同步|已完成/);
    assert.deepEqual(app.redirects, []);
    app.privateUntilVerified();
  });
}

test('a loading status issued before body parsing survives until the DOM is available', () => {
  const app = shell();
  app.context.__QM_ENTRY_PHASE = 'content';
  app.advance(30000);
  app.parseBody();
  app.domReady();
  assert.match(app.elements.get('auth-hold').textContent, /已登录.*学习内容/);
  assert.equal(app.elements.get('startup-help').hidden, false);
  app.context.__QM_ENTRY_STATUS('已登录，正在读取你的学习进度…', false);
  assert.equal(app.elements.get('startup-help').hidden, true, 'a recovered phase clears the obsolete retry hint');
  app.privateUntilVerified();
});

test('a completed application is not relabelled as stalled by an old shell timer', () => {
  const app = shell();
  app.parseBody();
  app.elements.get('auth-hold').textContent = 'completed fixture';
  app.classes.add('session-ok');
  app.advance(30000);
  assert.equal(app.elements.get('auth-hold').textContent, 'completed fixture');
  assert.equal(app.elements.get('startup-help').hidden, true);
  assert.deepEqual(app.redirects, []);
});

for (const [label, options] of [
  ['missing session', { auth: null }],
  ['malformed session', { auth: '{broken-json' }],
  ['user without a token', { auth: JSON.stringify({ user: { id: 'fictional-shell-learner' } }) }],
  ['inaccessible browser storage', { storageBlocked: true }],
]) {
  test(label + ' still redirects to login without exposing a cached learner', () => {
    const app = shell(options);
    app.parseBody();
    app.advance(30000);
    assert.deepEqual(app.redirects, ['login.html']);
    app.privateUntilVerified();
  });
}

test('pending sign-in callbacks retain query and fragment while session verification waits', () => {
  for (const [search, hash] of [
    ['?code=fictional-code&next=course', '#state=fictional-state'],
    ['', '#access_token=fictional-token&type=signup'],
    ['?error=fixture&error_description=slow%20network', '#state=fixture'],
  ]) {
    const app = shell({ auth: null, search, hash });
    app.parseBody();
    app.advance(30000);
    assert.deepEqual(app.redirects, [], 'a timeout must not discard a pending authentication callback');
    assert.equal(app.context.location.search, search);
    assert.equal(app.context.location.hash, hash);
    app.privateUntilVerified();
  }
});

test('password recovery keeps its complete query and fragment when routed to login', () => {
  const search = '?next=fixture';
  const hash = '#type=recovery&access_token=fictional-recovery-token';
  const app = shell({ auth: null, search, hash });
  assert.deepEqual(app.redirects, ['login.html' + search + hash]);
  app.privateUntilVerified();
});

test('a restored document with a removed session hides the previous account before redirecting', () => {
  const app = shell();
  app.classes.add('session-ok');
  app.local.delete('quizmario-auth');
  app.pageshow(true);
  assert.equal(app.classes.has('session-ok'), false);
  assert.deepEqual(app.redirects, ['login.html']);
  assert.equal(app.local.has('vocabSpotlight_v1:account:fictional-other-learner'), true, 'sign-out does not erase another account\'s records');
});

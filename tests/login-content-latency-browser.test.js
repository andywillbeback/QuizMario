'use strict';

// Hold the real script response, not window.fetch: script tags use the browser's
// resource loader. Auth and the own-account progress read must start before it.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { startServer, launchChrome, Cdp, earlyScript, SESSION } = require('./speech-browser.test');

const ownKey = 'vocabSpotlight_v1:account:' + SESSION.user.id;
const foreignKey = 'vocabSpotlight_v1:account:fictional-content-other';
const foreignSave = JSON.stringify({ profile: { name: '其他账号内容测试', cls: '虚构班级' }, points: 98765 });
const legacySave = JSON.stringify({ profile: { name: '未归属内容测试', cls: '虚构班级' }, points: 87654 });
const remoteProgress = {
  track: 'gaokao', points: 12, unlockedLevel: 1, levelStars: {},
  trackUnlock: { gaokao: 1 }, trackStars: { gaokao: {} }, cards: {},
  profile: { name: '内容测速甲', cls: '虚构速度班' },
  updatedAt: '2026-11-11T00:00:00.000Z',
};

function fixtureScript() {
  return earlyScript(remoteProgress) + `
  (() => {
    localStorage.removeItem(${JSON.stringify(ownKey)});
    localStorage.setItem(${JSON.stringify(foreignKey)}, ${JSON.stringify(foreignSave)});
    localStorage.setItem('vocabSpotlight_v1', ${JSON.stringify(legacySave)});
    window.__CONTENT_PROGRESS_REQUESTS = [];
    Math.random = () => 0.99;
    const previous = window.fetch.bind(window);
    window.fetch = function (input, init) {
      const url = typeof input === 'string' ? input : input.url;
      const method = ((init && init.method) || (input && input.method) || 'GET').toUpperCase();
      if (url.includes('/user_progress')) {
        window.__CONTENT_PROGRESS_REQUESTS.push({
          method, owner: new URL(url).searchParams.get('user_id'),
          startedAt: performance.now(), gameReady: !!window.__QM,
          phase: window.__QM_ENTRY_PHASE,
        });
      }
      return previous(input, init);
    };
  })();`;
}

async function main() {
  const server = await startServer();
  const normalResponse = server.listeners('request')[0];
  assert.equal(typeof normalResponse, 'function');
  let holdBanks = true;
  const held = [];
  const seen = [];
  server.removeAllListeners('request');
  server.on('request', (request, response) => {
    const pathname = (request.url || '').split('?')[0];
    seen.push(pathname);
    const bankFile = pathname === '/grok/words.js' || pathname === '/grok/exam-tracks.js'
      || /\/data\/banks\/20261113-set1\/.+\.json$/.test(pathname);
    if (bankFile && holdBanks) {
      held.push({ request, response, pathname });
      return;
    }
    normalResponse(request, response);
  });
  function release(match) {
    const keep = [];
    for (const item of held.splice(0)) {
      if (match(item.pathname)) {
        if (!item.response.destroyed) normalResponse(item.request, item.response);
      } else keep.push(item);
    }
    held.push(...keep);
  }

  const origin = 'http://127.0.0.1:' + server.address().port;
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'qm-content-latency-'));
  const artifactDir = path.join(os.tmpdir(), 'quizmario-test-artifacts', 'login-content-latency-browser.test.js');
  fs.mkdirSync(artifactDir, { recursive: true });
  let launched, ws;
  try {
    launched = launchChrome(profile);
    const port = await launched.port;
    const version = await (await fetch('http://127.0.0.1:' + port + '/json/version')).json();
    ws = new WebSocket(version.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { ws.addEventListener('open', resolve); ws.addEventListener('error', reject); });
    const cdp = new Cdp(ws);
    const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
    const send = (method, params) => cdp.send(method, params, sessionId);
    async function evaluate(expression) {
      const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
      return result.result?.value;
    }
    async function wait(expression, label, timeout = 15000) {
      const start = Date.now();
      while (Date.now() - start < timeout) {
        if (await evaluate(expression)) return;
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      throw new Error('Timed out: ' + label);
    }
    await send('Page.enable');
    await send('Runtime.enable');
    await send('Network.enable');
    await send('Network.setCacheDisabled', { cacheDisabled: true });
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await send('Page.addScriptToEvaluateOnNewDocument', { source: fixtureScript() });
    await send('Page.navigate', { url: origin + '/grok/index.html' });

    await wait(`window.__QM_ENTRY_AUTH_READY === true &&
      window.__CONTENT_PROGRESS_REQUESTS.some(r => r.method === 'GET') &&
      (window.__QM_ENTRY_PHASE === 'content' || window.__QM_ENTRY_PHASE === 'ready')`,
      'auth and own progress read without the full banks');
    await wait(`document.documentElement.classList.contains('session-ok') &&
      document.getElementById('screen-gate') && document.getElementById('screen-gate').classList.contains('active')`,
      'exam picker while set files are still withheld', 20000);
    assert.equal(seen.includes('/grok/words.js'), false, 'startup does not request words.js');
    assert.equal(seen.includes('/grok/exam-tracks.js'), false, 'startup does not request exam-tracks.js');
    const prefetchAt = Date.now();
    while (!held.some((item) => item.pathname.endsWith('.json')) && Date.now() - prefetchAt < 5000) {
      await new Promise((resolve) => setTimeout(resolve, 40));
    }
    assert.ok(held.some(item => item.pathname.endsWith('.json')), 'set files can still be in flight after the picker is visible');
    const before = await evaluate(`(() => {
      const hold = document.getElementById('auth-hold');
      const gate = document.getElementById('screen-gate');
      const zk = document.getElementById('btn-gate-zhongkao');
      const gs = getComputedStyle(gate);
      const zs = getComputedStyle(zk);
      return {
        path: location.pathname, phase: window.__QM_ENTRY_PHASE,
        sessionVisible: document.documentElement.classList.contains('session-ok'),
        holdText: hold.textContent,
        gateVisible: gs.display !== 'none' && gs.visibility !== 'hidden' && zs.display !== 'none',
        zk: zk.textContent.trim(),
        gameExists: !!window.__QM,
        text: document.body.innerText,
        requests: window.__CONTENT_PROGRESS_REQUESTS,
      };
    })()`);
    assert.equal(before.path, '/grok/index.html');
    assert.equal(before.phase, 'ready');
    assert.equal(before.sessionVisible, true, 'the exam picker opens before a full bank download');
    assert.equal(before.gateVisible, true);
    assert.equal(before.zk, '中考');
    assert.equal(before.gameExists, true);
    assert.doesNotMatch(before.text, /其他账号内容测试|未归属内容测试/);
    const earlyReads = before.requests.filter(row => row.method === 'GET');
    assert.equal(earlyReads.length, 1);
    assert.equal(earlyReads[0].owner, 'eq.' + SESSION.user.id, 'the early read names only the verified account');
    const loadingShot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(artifactDir, 'content-loading.png'), Buffer.from(loadingShot.data, 'base64'));

    await evaluate(`document.getElementById('btn-gate-zhongkao').click()`);
    await wait(`document.getElementById('screen-home').classList.contains('active')`, 'home before the withheld set file is released', 10000);
    await evaluate(`document.getElementById('btn-continue').click()`);
    const openedAt = Date.now();
    while (!held.some((item) => item.pathname.endsWith('/zhongkao/000.json')) && Date.now() - openedAt < 8000) {
      if (await evaluate(`document.getElementById('screen-play').classList.contains('active')`)) break;
      await new Promise((resolve) => setTimeout(resolve, 40));
    }
    release((pathname) => pathname.endsWith('/zhongkao/000.json'));
    await wait(`document.getElementById('screen-play').classList.contains('active') && document.getElementById('prompt-main').textContent.trim().length > 0`,
      'the first 中考 set opens from one set file', 15000);
    assert.ok(held.length > 0, 'the rest of the bank is still not required for the first set');
    holdBanks = false;
    release(() => true);
    const after = await evaluate(`({
      phase: window.__QM_ENTRY_PHASE, owner: QuizMarioCloud.userId(),
      save: __QM.getSave(), requests: window.__CONTENT_PROGRESS_REQUESTS,
      foreign: localStorage.getItem(${JSON.stringify(foreignKey)}),
      legacy: localStorage.getItem('vocabSpotlight_v1'),
      checking: QuizMarioCloud.syncState().checking,
    })`);
    assert.equal(after.phase, 'ready');
    assert.equal(after.owner, SESSION.user.id);
    assert.equal(after.save.points, remoteProgress.points);
    assert.equal(after.save.profile.name, remoteProgress.profile.name);
    assert.doesNotMatch(JSON.stringify(after.save), /其他账号内容测试|未归属内容测试/);
    assert.equal(after.foreign, foreignSave, 'another account\'s original cache remains untouched');
    assert.equal(after.legacy, legacySave, 'unowned legacy records remain quarantined and preserved');
    assert.equal(after.requests.filter(row => row.method === 'GET').length, 1, 'sync consumes the early read without a second startup fetch');
    assert.equal(after.checking, false);
    fs.writeFileSync(path.join(artifactDir, 'verification.json'), JSON.stringify({
      before, after,
      checks: ['picker before set files', 'no startup words.js or exam-tracks.js', 'first set opens from one json file',
        'early verified-account progress request', 'first-device own baseline', 'foreign and unowned records preserved', 'single startup progress GET'],
    }, null, 2));
    console.log('login-content-latency-browser ok: exam picker opened while set files were held; the first 中考 set did not wait for the rest of the bank');
  } finally {
    if (ws) ws.close();
    if (launched?.chrome.exitCode === null && launched.chrome.signalCode === null) {
      const closed = new Promise(resolve => launched.chrome.once('close', resolve));
      launched.chrome.kill('SIGKILL');
      await closed;
    }
    for (const { response } of held.splice(0)) response.destroy();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}

module.exports = { fixtureScript };
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });

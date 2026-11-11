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
  let holdWords = true, wordsRequests = 0;
  const held = [];
  server.removeAllListeners('request');
  server.on('request', (request, response) => {
    const pathname = (request.url || '').split('?')[0];
    if (pathname === '/grok/words.js' && holdWords) {
      wordsRequests++;
      held.push({ request, response });
      return;
    }
    normalResponse(request, response);
  });
  function releaseWords() {
    holdWords = false;
    for (const { request, response } of held.splice(0)) {
      if (!response.destroyed) normalResponse(request, response);
    }
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

    await wait(`window.__QM_ENTRY_AUTH_READY === true && window.__QM_ENTRY_PHASE === 'content' &&
      window.__CONTENT_PROGRESS_REQUESTS.some(r => r.method === 'GET')`, 'auth and own progress read while words.js is held');
    assert.ok(wordsRequests > 0 && held.length > 0, 'the real vocabulary script response is still withheld');
    const before = await evaluate(`(() => {
      const hold = document.getElementById('auth-hold');
      const gate = document.getElementById('screen-gate');
      return {
        path: location.pathname, phase: window.__QM_ENTRY_PHASE,
        sessionVisible: document.documentElement.classList.contains('session-ok'),
        holdText: hold.textContent,
        holdVisible: getComputedStyle(hold).visibility === 'visible' && hold.getClientRects().length > 0,
        gateHidden: getComputedStyle(gate).display === 'none' || getComputedStyle(gate).visibility === 'hidden',
        gameExists: !!window.__QM,
        text: document.body.innerText,
        requests: window.__CONTENT_PROGRESS_REQUESTS,
      };
    })()`);
    assert.equal(before.path, '/grok/index.html');
    assert.equal(before.phase, 'content');
    assert.equal(before.sessionVisible, false, 'a verified session cannot expose an uninitialised learner');
    assert.equal(before.holdVisible, true, 'the neutral loading shell paints before the stalled script');
    assert.equal(before.gateHidden, true);
    assert.equal(before.gameExists, false, 'the game has not run ahead of its deferred vocabulary dependency');
    assert.match(before.holdText, /登录已确认|已登录/);
    assert.match(before.holdText, /加载学习|学习内容/);
    assert.doesNotMatch(before.text, /其他账号内容测试|未归属内容测试/);
    const earlyReads = before.requests.filter(row => row.method === 'GET');
    assert.equal(earlyReads.length, 1);
    assert.equal(earlyReads[0].owner, 'eq.' + SESSION.user.id, 'the early read names only the verified account');
    assert.equal(earlyReads[0].gameReady, false);
    const loadingShot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(artifactDir, 'content-loading.png'), Buffer.from(loadingShot.data, 'base64'));

    releaseWords();
    await wait(`document.documentElement.classList.contains('session-ok') &&
      window.QuizMarioCloud && !QuizMarioCloud.syncState().checking`, 'own server baseline is applied after vocabulary arrives', 20000);
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
      wordsRequests, before, after,
      checks: ['real vocabulary response held', 'early verified-account progress request', 'visible neutral loading shell',
        'unverified learning hidden', 'first-device own baseline', 'foreign and unowned records preserved', 'single startup progress GET'],
    }, null, 2));
    console.log('login-content-latency-browser ok: verified-account progress started before held vocabulary; startup reused one read and preserved account isolation');
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

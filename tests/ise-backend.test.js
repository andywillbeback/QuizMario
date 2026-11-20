/* Fictional identities, synthetic PCM, and fake HTTP/WebSocket peers only.
 * These contracts do not make network calls or consume assessment quota.
 */
'use strict';
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const sense = require('../grok/sense-id.js');
const tests = [];
function test(name, fn) { tests.push({ name, fn }); }
let api;
const OWNER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const TOKEN = 'fictional.student.session_for_tests';
const OTHER_TOKEN = 'fictional.other.session_for_tests';
const NOW = Date.parse('2026-11-20T10:00:00Z');
const ENV = Object.freeze({
  SUPABASE_URL: 'https://fictional-project.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_fictional_test_key',
  SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_fictional_test_key',
  XFYUN_APP_ID: 'fictional123', XFYUN_API_KEY: 'fictional_api_key_123456789',
  XFYUN_API_SECRET: 'fictional_api_secret_123456789',
});
const CREDENTIALS = { appId: ENV.XFYUN_APP_ID, apiKey: ENV.XFYUN_API_KEY, apiSecret: ENV.XFYUN_API_SECRET };
function pcm(length = 16000) { return Uint8Array.from({ length }, (_, index) => index % 251); }
function input(extra = {}, bytes = pcm()) {
  return { attemptId: 'fictional-attempt-1', cardKey: '0::apple', word: 'apple',
    audio: { format: 'pcm_s16le', sampleRate: 16000, channels: 1, data: Buffer.from(bytes).toString('base64') }, ...extra };
}
function xml(attributes = 'accuracy_score="84.5" total_score="81" except_info="0" is_rejected="false"', content = '<word total_score="99"/>') {
  return '<?xml version="1.0" encoding="UTF-8"?><xml_result><read_word lan="en" type="study" version="fictional">' +
    '<rec_paper><read_word ' + attributes + '>' + content + '</read_word></rec_paper></read_word></xml_result>';
}
function finalFrame(document = xml()) {
  return { code: 0, sid: 'fictional-session-1', data: { status: 2, data: Buffer.from(document).toString('base64') } };
}
function code(expected) {
  return error => { assert.equal(error.name, 'AssessmentError'); assert.equal(error.code, expected); return true; };
}
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function socketFixture(behavior) {
  const instances = [], waits = [];
  class Socket {
    constructor(url) { this.url = url; this.frames = []; this.closed = 0; instances.push(this); queueMicrotask(() => this.onopen?.()); }
    send(text) { const frame = JSON.parse(text); this.frames.push(frame); behavior?.(this, frame); }
    emit(frame) { this.onmessage?.({ data: typeof frame === 'string' ? frame : JSON.stringify(frame) }); }
    close(code) { this.closed++; this.closeCode = code; this.onclose?.(); }
  }
  return { instances, waits, dependencies: { WebSocket: Socket, now: () => NOW, timeoutMs: 80,
    sleep: async milliseconds => { waits.push(milliseconds); } } };
}
function response(body, status = 200) { return new Response(JSON.stringify(body), { status }); }
function serverFixture(options = {}) {
  const rows = new Map(), calls = [], evaluations = [], completionBodies = [];
  let currentTime = NOW, lostCompletion = false, lostReservation = false;
  const keyOf = (owner, id) => owner + ':' + id;
  async function fetcher(rawUrl, init) {
    const url = new URL(rawUrl), headers = new Headers(init.headers);
    const body = init.body ? JSON.parse(init.body) : undefined;
    calls.push({ url, headers, body, method: init.method });
    if (url.pathname === '/auth/v1/user') {
      if (options.authFailure) return response({}, options.authFailure);
      const token = headers.get('authorization');
      if (![TOKEN, OTHER_TOKEN].some(value => token === 'Bearer ' + value)) return response({}, 401);
      return response({ id: token === 'Bearer ' + TOKEN ? OWNER : OTHER, is_anonymous: !!options.anonymous });
    }
    assert.equal(headers.get('apikey'), options.env?.SUPABASE_SERVICE_ROLE_KEY || ENV.SUPABASE_SERVICE_ROLE_KEY);
    if (url.pathname === '/rest/v1/rpc/word_pronunciation_reserve') {
      if (options.reserveFails) throw new Error('fictional database failure');
      if (options.reserveState) return response({ state: options.reserveState });
      const key = keyOf(body.p_owner_id, body.p_attempt_id), existing = rows.get(key);
      if (existing) {
        if (existing.request_hash !== body.p_request_hash) return response({ state: 'conflict' });
        if (existing.state === 'pending') return response({ state: 'pending', createdAt: existing.created_at });
        return response({ state: 'cached', outcome: existing.outcome, httpStatus: existing.http_status });
      }
      rows.set(key, { owner_id: body.p_owner_id, attempt_id: body.p_attempt_id, request_hash: body.p_request_hash,
        card_key: body.p_card_key, word: body.p_word, duration_ms: body.p_duration_ms,
        state: 'pending', created_at: new Date(currentTime).toISOString() });
      if (options.reservationLostAck && !lostReservation) { lostReservation = true; throw new Error('fictional lost reservation acknowledgement'); }
      return response({ state: 'reserved' });
    }
    if (url.pathname === '/rest/v1/rpc/word_pronunciation_finish') {
      completionBodies.push(structuredClone(body));
      if (options.completionFails) throw new Error('fictional completion failure');
      const row = rows.get(keyOf(body.p_owner_id, body.p_attempt_id)); assert.ok(row);
      if (row.state === 'pending') Object.assign(row, { state: body.p_outcome.ok ? 'succeeded' : 'failed',
        outcome: body.p_outcome, http_status: body.p_http_status });
      if (options.completionLostAck && !lostCompletion) { lostCompletion = true; throw new Error('fictional lost completion acknowledgement'); }
      return response({ state: 'cached', outcome: row.outcome, httpStatus: row.http_status });
    }
    if (url.pathname === '/rest/v1/word_pronunciation_attempts') {
      assert.equal(init.method, 'GET'); assert.equal(url.searchParams.get('limit'), '1');
      const row = rows.get(keyOf(url.searchParams.get('owner_id').slice(3), url.searchParams.get('attempt_id').slice(3)));
      return response(row ? [row] : []);
    }
    throw new Error('Unexpected test HTTP route');
  }
  const env = { ...ENV, ...(options.env || {}) };
  const handler = api.createHandler({ env, fetch: fetcher, now: () => currentTime,
    async evaluate(value, credentials) {
      evaluations.push({ value, credentials });
      const reservation = [...rows.values()].find(row => row.attempt_id === value.attemptId && row.state === 'pending');
      assert.equal(reservation?.state, 'pending', 'upstream work requires a durable prior reservation');
      if (options.evaluate) return options.evaluate(value);
      return { accuracyScore: 84.5, totalScore: 81 };
    } });
  return { rows, calls, evaluations, completionBodies, env, options,
    advance(milliseconds) { currentTime += milliseconds; },
    async request(body = input(), settings = {}) {
      const method = settings.method || 'POST';
      const headers = { origin: api.DEFAULT_ORIGIN, authorization: 'Bearer ' + TOKEN, 'content-type': 'application/json', ...settings.headers };
      for (const [key, value] of Object.entries(headers)) if (value === null) delete headers[key];
      const request = new Request('https://fictional-project.supabase.co/functions/v1/word-pronunciation' + (settings.query || ''), {
        method, headers, ...(method === 'POST' ? { body: settings.raw === undefined ? JSON.stringify(body) : settings.raw } : {}),
      });
      const result = await handler(request);
      return { status: result.status, headers: result.headers, body: result.status === 204 ? null : await result.json() };
    } };
}

test('the server accepts bounded little-endian PCM and rounds fractional millisecond lengths', () => {
  for (const length of [11200, 11202, 16000, 256000, 320000]) {
    const valid = api.validateInput(input({}, pcm(length)));
    assert.equal(valid.pcm.length, length); assert.equal(valid.durationMs, Math.round(length / 32));
    assert.equal(Number.isInteger(valid.durationMs), true);
  }
});

test('words and card keys bind to the exact existing sense contract', () => {
  for (const word of ['apple', 'Apple', 'may', 'May', 'MAY', 'March', 'march', 'Miss', 'miss', 'WHO', 'who', 'china', 'China', 'CHINA', "don't", 'well-known', 'Mr.']) {
    assert.equal(api.itemToken(word), sense.itemToken(word));
    for (const track of ['core', 'zhongkao', 'gaokao', 'ielts']) {
      const cardKey = sense.cardKeyFor(track, 19, word);
      assert.equal(api.validateInput(input({ word, cardKey })).cardKey, cardKey);
    }
  }
  for (const change of [{ word: 'dog' }, { cardKey: '0::may', word: 'May' }, { cardKey: 'unknown|0::apple' },
    { cardKey: '00::apple' }, { cardKey: '-1::apple' }, { cardKey: '0::Apple' }]) {
    assert.throws(() => api.validateInput(input(change)), code('invalid_request'));
  }
});

test('phrases, SSML, controls, and unvalidated target categories cannot consume an assessment', () => {
  for (const word of ['turn on', '123', 'B2', 'apple\nbanana', '<speak>apple</speak>', '[word]', 'word,', ' apple', 'word...', '苹果']) {
    assert.throws(() => api.validateInput(input({ word })), code('unsupported_target'));
  }
  for (const change of [{ attemptId: '__proto__' }, { attemptId: 'event\n2' }, { attemptId: 'x'.repeat(121) },
    { cardKey: 'x'.repeat(241) }, { word: 'a'.repeat(81) }, { word: '' }]) {
    assert.throws(() => api.validateInput(input(change)), code('invalid_request'));
  }
});

test('wrong codecs, malformed base64, silence, and unbounded PCM fail without a score', () => {
  for (const audioChange of [{ format: 'webm' }, { format: 'wav' }, { sampleRate: 48000 }, { channels: 2 }, { sampleRate: '16000' },
    { data: 'data:audio/pcm;base64,AAAA' }, { data: '%%%%' }, { data: input().audio.data + '\n' }]) {
    const body = input(); Object.assign(body.audio, audioChange);
    assert.throws(() => api.validateInput(body), code('invalid_request'));
  }
  for (const length of [11200 - 2, 11201, 320002]) assert.throws(() => api.validateInput(input({}, pcm(length))), code('invalid_request'));
  assert.throws(() => api.validateInput(input({}, new Uint8Array(16000))), code('assessment_rejected'));
  const body = input({}, pcm(11200));
  const data = body.audio.data;
  body.audio.data = data.slice(0, -3) + 'B=='; // Same decoded last byte, noncanonical padding bits.
  assert.throws(() => api.validateInput(body), code('invalid_request'));
});

test('the idempotence digest binds owner, attempt, target, and exact audio bytes', async () => {
  const value = api.validateInput(input()), hash = await api.requestHash(value, OWNER);
  assert.match(hash, /^[a-f0-9]{64}$/); assert.equal(await api.requestHash(value, OWNER), hash);
  const variants = [{ ...value, attemptId: 'fictional-other' }, { ...value, word: 'Apple' },
    { ...value, cardKey: '1::apple' }, { ...value, pcm: Uint8Array.from(value.pcm, (x, i) => i === 0 ? 200 : x) }];
  for (const variant of variants) assert.notEqual(await api.requestHash(variant, OWNER), hash);
  assert.notEqual(await api.requestHash(value, OTHER), hash);
});

test('HMAC signing matches an independent Node crypto computation', async () => {
  const result = new URL(await api.signedProviderUrl(CREDENTIALS, NOW));
  const date = new Date(NOW).toUTCString();
  const expected = crypto.createHmac('sha256', CREDENTIALS.apiSecret)
    .update('host: ise-api.xfyun.cn\ndate: ' + date + '\nGET /v2/open-ise HTTP/1.1').digest('base64');
  const authorization = Buffer.from(result.searchParams.get('authorization'), 'base64').toString();
  assert.equal(result.protocol, 'wss:'); assert.equal(result.host, 'ise-api.xfyun.cn'); assert.equal(result.pathname, '/v2/open-ise');
  assert.equal(result.searchParams.get('date'), date); assert.equal(result.searchParams.get('host'), result.host);
  assert.equal(authorization, 'api_key="' + CREDENTIALS.apiKey + '", algorithm="hmac-sha256", headers="host date request-line", signature="' + expected + '"');
});

test('the stream sends the documented task, 1280-byte PCM chunks, and a separate empty terminal frame', async () => {
  const fixture = socketFixture((socket, frame) => {
    if (frame.data.status === 0) socket.emit({ code: 0, data: null });
    else if (frame.data.status === 1) socket.emit({ code: 0, data: { status: 1, data: 'not-a-final-score' } });
    else socket.emit(finalFrame());
  });
  const value = api.validateInput(input({}, pcm(16002)));
  const result = await api.evaluateWithXfyun(value, CREDENTIALS, fixture.dependencies);
  assert.deepEqual(result, { accuracyScore: 84.5, totalScore: 81, providerRequestId: 'fictional-session-1' });
  const socket = fixture.instances[0], first = socket.frames[0], last = socket.frames.at(-1), chunks = socket.frames.slice(1, -1);
  assert.equal(first.common.app_id, CREDENTIALS.appId);
  assert.deepEqual(first.business, { sub: 'ise', ent: 'en_vip', category: 'read_word', cmd: 'ssb', text: '\uFEFF[word]\napple',
    tte: 'utf-8', ttp_skip: true, aue: 'raw', auf: 'audio/L16;rate=16000', rstcd: 'utf8',
    rst: 'entirety', ise_unite: '1', extra_ability: 'multi_dimension;syll_phone_err_msg' });
  assert.deepEqual(first.data, { status: 0 }); assert.equal(chunks.length, Math.ceil(value.pcm.length / 1280));
  for (let i = 0; i < chunks.length; i++) {
    assert.deepEqual(chunks[i].business, { cmd: 'auw', aus: i === 0 ? 1 : 2 }); assert.equal(chunks[i].data.status, 1);
    assert.ok(Buffer.from(chunks[i].data.data, 'base64').length <= 1280);
  }
  assert.deepEqual(Buffer.concat(chunks.map(frame => Buffer.from(frame.data.data, 'base64'))), Buffer.from(value.pcm));
  assert.deepEqual(last, { business: { cmd: 'auw', aus: 4 }, data: { status: 2, data: '' } });
  assert.deepEqual(fixture.waits, Array(chunks.length).fill(40)); assert.equal(socket.closed, 1); assert.equal(socket.closeCode, 1000);
  assert.equal(socket.onmessage, null); assert.equal(JSON.stringify(result).includes(CREDENTIALS.apiKey), false);
});

test('the XML parser chooses only the assessment read_word beneath rec_paper', () => {
  const document = xml().replace('lan="en"', 'lan="en" accuracy_score="1" total_score="2"');
  assert.deepEqual(api.parseAssessmentXml(document), { accuracyScore: 84.5, totalScore: 81 });
  assert.deepEqual(api.parseAssessmentXml(xml('accuracy_score="0" total_score="0"')), { accuracyScore: 0, totalScore: 0 });
  assert.deepEqual(api.parseAssessmentXml(xml('total_score="77.25"')), { accuracyScore: null, totalScore: 77.25 });
  assert.deepEqual(api.parseAssessmentXml(xml('accuracy_score="100.000000"')), { accuracyScore: 100, totalScore: null });
  assert.throws(() => api.parseAssessmentXml(xml('accuracy_socre="88"', '<word accuracy_score="99" total_score="99"/>')), code('upstream_unavailable'));
});

test('rejection and low-quality audio never become zero or a trustworthy high score', () => {
  for (const suffix of ['is_rejected="true"', 'is_rejected="1"', 'except_info="28673"', 'except_info="28680" is_rejected="false"',
    'except_info="28676"', 'except_info="28690"', 'except_info="28689"', 'except_info="99999"']) {
    assert.throws(() => api.parseAssessmentXml(xml('accuracy_score="99" total_score="98" ' + suffix)), code('assessment_rejected'));
  }
  for (const suffix of ['is_rejected="unknown"', 'is_rejected=""', 'except_info=""', 'except_info="NaN"', 'except_info="-1"']) {
    assert.throws(() => api.parseAssessmentXml(xml('accuracy_score="80" ' + suffix)), code('upstream_unavailable'));
  }
  assert.throws(() => api.parseAssessmentXml(xml().replace('lan="en"', 'lan="en" is_rejected="true"')), code('assessment_rejected'));
});

test('malformed, empty, nonfinite, or out-of-range numeric fields are unavailable', () => {
  for (const score of ['', 'NaN', 'Infinity', '-1', '100.001', '1e2', '88points', '0x10', 'false']) {
    assert.throws(() => api.parseAssessmentXml(xml('accuracy_score="' + score + '" total_score="80"')), code('upstream_unavailable'));
  }
  assert.throws(() => api.parseAssessmentXml(xml('', '<word total_score="100"/>')), code('upstream_unavailable'));
});

test('malformed or ambiguous XML, entities, external documents, and oversized trees fail closed', () => {
  const variants = [
    xml().replace('</rec_paper>', '</wrong>'), xml().replace('lan="en"', 'lan="cn"'),
    xml().replace('accuracy_score="84.5"', 'accuracy_score="84.5" accuracy_score="99"'),
    xml().replace('<rec_paper>', '<rec_paper/><rec_paper>'),
    xml().replace('</rec_paper>', '<read_word accuracy_score="99"/></rec_paper>'),
    xml().replace('version="fictional"', 'version="&unknown;"'),
    xml().replace('version="fictional"', 'version="&missing"'),
    xml().replace('version="fictional"', 'version="<bad"'),
    xml().replace('version="fictional"', 'version="&#0;"'),
    xml().replace('version="fictional"', 'version="&#X41;"'),
    xml().replace('version="fictional"', 'version="\0"'),
    xml().replace('version="fictional"', 'version="\uD800"'),
    xml().replace('version="fictional"', 'version="x"\u00A0extra="no"'),
    xml().replace('version="1.0" encoding="UTF-8"', 'bogus'),
    xml().replace('version="1.0"', 'VERSION="1.0"'),
    '<!DOCTYPE xml_result [<!ENTITY injected SYSTEM "file:///fictional">]>' + xml(),
    xml() + '<another/>', xml('', ']]>'), xml('', '<!-- invalid--comment -->'),
    xml('', '<node>'.repeat(33) + '</node>'.repeat(33)), xml('', 'x'.repeat(131072)),
  ];
  for (const document of variants) assert.throws(() => api.parseAssessmentXml(document), code('upstream_unavailable'));
  const harmless = xml('accuracy_score="0" total_score="80"', '<word content="fish &amp; chips &quot;&gt;&apos;&#65;&#x42;"/><!-- comment --><![CDATA[<word accuracy_score="100"/>]]>');
  assert.deepEqual(api.parseAssessmentXml(harmless), { accuracyScore: 0, totalScore: 80 });
});

test('only a complete final frame after the audio terminal frame can produce an assessment', async () => {
  const early = socketFixture((socket, frame) => { if (frame.data.status === 0) socket.emit(finalFrame()); });
  await assert.rejects(api.evaluateWithXfyun(api.validateInput(input()), CREDENTIALS, early.dependencies), code('upstream_unavailable'));
  assert.equal(early.instances[0].frames.length, 1);
  const intermediate = socketFixture(socket => socket.emit({ ...finalFrame(), data: { ...finalFrame().data, status: 1 } }));
  await assert.rejects(api.evaluateWithXfyun(api.validateInput(input()), CREDENTIALS, { ...intermediate.dependencies, timeoutMs: 10 }), code('upstream_unavailable'));
  assert.equal(intermediate.instances[0].closed, 1);
  const incomplete = socketFixture((socket, frame) => {
    if (frame.data.status === 0) socket.emit({ code: 0 });
    else if (frame.data.status === 1) socket.emit({ code: 0, data: { status: 1, data: Buffer.from(xml().slice(0, 100)).toString('base64') } });
    else socket.emit(finalFrame(xml().slice(100)));
  });
  await assert.rejects(api.evaluateWithXfyun(api.validateInput(input()), CREDENTIALS, incomplete.dependencies), code('upstream_unavailable'));
});

test('provider errors, malformed frames, and invalid UTF-8 are errors without fabricated scores', async () => {
  for (const [providerCode, expected] of [[11200, 'service_unavailable'], [10313, 'service_unavailable'], [11201, 'quota_exhausted'],
    [42306, 'quota_exhausted'], [10200, 'upstream_unavailable'], [10114, 'upstream_unavailable']]) {
    const fixture = socketFixture((socket, frame) => { if (frame.data.status === 0) socket.emit({ code: providerCode, message: CREDENTIALS.apiSecret }); });
    await assert.rejects(api.evaluateWithXfyun(api.validateInput(input()), CREDENTIALS, fixture.dependencies), error => {
      code(expected)(error); assert.equal(error.message.includes(CREDENTIALS.apiSecret), false); return true;
    });
  }
  for (const bad of ['{', { code: '0', data: {} }, { code: 0, data: { status: 9 } },
    { code: 0, data: { status: 2, data: '%%%' } }, { code: 0, data: { status: 2, data: Buffer.from([0xff, 0xfe]).toString('base64') } }]) {
    const fixture = socketFixture((socket, frame) => { if (frame.data.status === 2) socket.emit(bad); });
    await assert.rejects(api.evaluateWithXfyun(api.validateInput(input()), CREDENTIALS, fixture.dependencies), code('upstream_unavailable'));
  }
});

test('CORS accepts only the exact application origin and preflight makes no external request', async () => {
  const fixture = serverFixture();
  const preflight = await fixture.request(null, { method: 'OPTIONS' });
  assert.equal(preflight.status, 204); assert.equal(preflight.headers.get('access-control-allow-origin'), api.DEFAULT_ORIGIN);
  assert.equal(fixture.calls.length, 0);
  for (const origin of ['https://evil.example', api.DEFAULT_ORIGIN + '.evil.example', 'http://andywillbeback.github.io', 'null']) {
    const result = await fixture.request(input(), { headers: { origin } });
    assert.equal(result.status, 403); assert.equal(result.body.code, 'forbidden');
    assert.equal(result.headers.get('access-control-allow-origin'), null);
  }
  assert.equal(fixture.calls.length, 0); assert.equal(fixture.evaluations.length, 0);
});

test('authentication is verified through Supabase Auth before ownership or quota decisions', async () => {
  for (const headers of [{ authorization: null }, { authorization: 'Bearer not_known_test_token' }]) {
    const fixture = serverFixture(), result = await fixture.request(input(), { headers });
    assert.equal(result.status, 401); assert.equal(fixture.rows.size, 0); assert.equal(fixture.evaluations.length, 0);
  }
  for (const options of [{ anonymous: true }, { authFailure: 401 }]) {
    const fixture = serverFixture(options), result = await fixture.request();
    assert.equal(result.status, 401); assert.equal(fixture.rows.size, 0);
  }
  const failing = serverFixture({ authFailure: 503 });
  assert.equal((await failing.request()).body.code, 'service_unavailable');
  const fixture = serverFixture(), result = await fixture.request(input({ owner: OTHER, accuracyScore: 100, totalScore: 100 }));
  assert.equal(result.body.assessment.owner, OWNER); assert.equal(result.body.assessment.accuracyScore, 84.5);
  const auth = fixture.calls[0]; assert.equal(auth.url.pathname, '/auth/v1/user');
  assert.equal(auth.headers.get('authorization'), 'Bearer ' + TOKEN); assert.equal(auth.headers.get('apikey'), ENV.SUPABASE_ANON_KEY);
  const reserve = fixture.calls.find(call => call.url.pathname.endsWith('/word_pronunciation_reserve'));
  assert.equal(reserve.body.p_owner_id, OWNER); assert.equal(reserve.headers.get('authorization'), null);
  assert.equal(reserve.headers.get('apikey'), ENV.SUPABASE_SERVICE_ROLE_KEY);
});

test('readiness, missing configuration, and invalid requests never reserve quota or call the evaluator', async () => {
  for (const env of [{ XFYUN_APP_ID: '' }, { XFYUN_API_KEY: '' }, { XFYUN_API_SECRET: '' }, { SUPABASE_SERVICE_ROLE_KEY: '' }]) {
    const fixture = serverFixture({ env });
    const ready = await fixture.request(null, { method: 'GET' }); assert.equal(ready.body.ready, false);
    const post = await fixture.request(); assert.equal(post.body.code, 'service_unavailable');
    assert.equal(fixture.rows.size, 0); assert.equal(fixture.evaluations.length, 0);
  }
  const fixture = serverFixture(), ready = await fixture.request(null, { method: 'GET' });
  assert.deepEqual(ready.body.limits, { rollingHours: 24, global: 400, perStudent: 40 }); assert.equal(ready.body.ready, true);
  for (const settings of [{ raw: '{' }, { raw: 'x'.repeat(450001) }, { headers: { 'content-type': 'audio/webm' } },
    { headers: { 'content-length': '450001' } }]) {
    const bad = await fixture.request(input(), settings); assert.equal(bad.body.code, 'invalid_request');
  }
  assert.equal((await fixture.request(input({ word: 'turn on' }))).body.code, 'unsupported_target');
  assert.equal((await fixture.request(input({}, new Uint8Array(16000)))).body.code, 'assessment_rejected');
  assert.equal(fixture.rows.size, 0); assert.equal(fixture.evaluations.length, 0);
});

test('the durable success envelope is source-bound and contains no credentials, audio, or signed URL', async () => {
  const fixture = serverFixture(), result = await fixture.request();
  assert.equal(result.status, 200); assert.equal(result.body.ok, true);
  const score = result.body.assessment;
  assert.deepEqual(Object.keys(score).sort(), ['accuracyScore', 'at', 'attemptId', 'cardKey', 'id', 'modelVersion', 'owner',
    'provider', 'scale', 'status', 'totalScore', 'word'].sort());
  assert.equal(score.owner, OWNER); assert.equal(score.attemptId, input().attemptId); assert.equal(score.cardKey, '0::apple');
  assert.equal(score.provider, 'xfyun-ise'); assert.equal(score.scale, 100); assert.equal(score.status, 'assessed');
  assert.equal(score.modelVersion, 'xfyun-ise-en-v1'); assert.equal(score.at, new Date(NOW).toISOString());
  const row = [...fixture.rows.values()][0]; assert.equal(row.state, 'succeeded'); assert.deepEqual(row.outcome, result.body);
  assert.equal(score.id, 'ise_' + row.request_hash.slice(0, 40)); assert.equal(fixture.evaluations.length, 1);
  const publicData = JSON.stringify({ result: result.body, rows: [...fixture.rows.values()], completion: fixture.completionBodies });
  for (const privateValue of [TOKEN, ENV.XFYUN_API_KEY, ENV.XFYUN_API_SECRET, ENV.SUPABASE_SERVICE_ROLE_KEY, input().audio.data, 'wss://']) {
    assert.equal(publicData.includes(privateValue), false);
  }
  assert.equal(result.headers.get('cache-control'), 'no-store');
});

test('zero and missing accuracy remain distinct in the saved assessment', async () => {
  for (const scores of [{ accuracyScore: 0, totalScore: 0 }, { accuracyScore: null, totalScore: 88 }, { accuracyScore: 0, totalScore: null }]) {
    const fixture = serverFixture({ evaluate: () => scores }), result = await fixture.request();
    assert.equal(result.body.assessment.accuracyScore, scores.accuracyScore);
    assert.equal(result.body.assessment.totalScore, scores.totalScore);
  }
  for (const scores of [{ accuracyScore: null, totalScore: null }, { accuracyScore: NaN, totalScore: 88 },
    { accuracyScore: '88', totalScore: 88 }, { accuracyScore: 101, totalScore: 88 }, { totalScore: 88 }]) {
    const fixture = serverFixture({ evaluate: () => scores }), result = await fixture.request();
    assert.equal(result.body.ok, false); assert.equal(result.body.code, 'upstream_unavailable');
    assert.equal('assessment' in result.body, false); assert.equal([...fixture.rows.values()][0].state, 'failed');
  }
});

test('same-attempt retries return the identical stored outcome without another provider call', async () => {
  const fixture = serverFixture(), first = await fixture.request(); fixture.advance(5000);
  const second = await fixture.request(); assert.deepEqual(second.body, first.body); assert.equal(fixture.evaluations.length, 1);
  assert.equal(fixture.rows.size, 1); assert.equal(fixture.completionBodies.length, 1);
  for (const change of [{ word: 'Apple' }, { cardKey: '1::apple' }, { word: 'banana', cardKey: '0::banana' }]) {
    const conflict = await fixture.request(input(change)); assert.equal(conflict.status, 409); assert.equal(conflict.body.code, 'attempt_conflict');
  }
  const bytes = pcm(); bytes[0] = 129;
  assert.equal((await fixture.request(input({}, bytes))).body.code, 'attempt_conflict');
  assert.equal(fixture.evaluations.length, 1);
});

test('concurrent duplicates share a single reservation and cannot make two provider calls', async () => {
  const pending = deferred(), started = deferred();
  const fixture = serverFixture({ evaluate: () => { started.resolve(); return pending.promise; } });
  const first = fixture.request(); await started.promise;
  const second = await fixture.request(); assert.equal(second.status, 202); assert.equal(second.body.code, 'assessment_pending');
  assert.equal(fixture.rows.size, 1); assert.equal(fixture.evaluations.length, 1);
  pending.resolve({ accuracyScore: 70, totalScore: 71 }); const completed = await first;
  assert.equal(completed.status, 200); assert.deepEqual((await fixture.request()).body, completed.body);
  assert.equal(fixture.evaluations.length, 1);
});

test('quota, burst throttles, and reservation failures stop before upstream work', async () => {
  for (const [reserveState, expected, status] of [['quota', 'quota_exhausted', 429], ['throttled', 'rate_limited', 429], ['pending', 'assessment_pending', 202]]) {
    const fixture = serverFixture({ reserveState }), result = await fixture.request();
    assert.equal(result.status, status); assert.equal(result.body.code, expected); assert.equal(fixture.evaluations.length, 0);
  }
  const fixture = serverFixture({ reserveFails: true }); assert.equal((await fixture.request()).body.code, 'service_unavailable');
  assert.equal(fixture.evaluations.length, 0); assert.equal(fixture.rows.size, 0);
});

test('a lost reservation acknowledgement cannot trigger a provider retry or reopen an old attempt', async () => {
  const fixture = serverFixture({ reservationLostAck: true });
  assert.equal((await fixture.request()).body.code, 'service_unavailable'); assert.equal(fixture.rows.size, 1);
  assert.equal((await fixture.request()).body.code, 'assessment_pending'); assert.equal(fixture.evaluations.length, 0);
  fixture.advance(120001);
  assert.equal((await fixture.request()).body.code, 'result_unavailable');
  const recovered = await fixture.request(null, { method: 'GET', query: '?attemptId=fictional-attempt-1' });
  assert.equal(recovered.body.code, 'result_unavailable'); assert.equal(fixture.evaluations.length, 0);
});

test('provider failures are durably retained as failures, consume their reservation, and never become zero', async () => {
  for (const [errorCode, status] of [['assessment_rejected', 422], ['quota_exhausted', 429], ['upstream_unavailable', 503]]) {
    const fixture = serverFixture({ evaluate: () => { throw new api.AssessmentError(errorCode, status); } });
    const first = await fixture.request(); assert.equal(first.status, status); assert.equal(first.body.code, errorCode);
    assert.equal('assessment' in first.body, false); assert.equal('accuracyScore' in first.body, false);
    assert.equal([...fixture.rows.values()][0].state, 'failed');
    assert.deepEqual((await fixture.request()).body, first.body); assert.equal(fixture.evaluations.length, 1);
  }
});

test('a lost completion acknowledgement retries only the immutable completion write', async () => {
  const fixture = serverFixture({ completionLostAck: true }), result = await fixture.request();
  assert.equal(result.status, 200); assert.equal(fixture.evaluations.length, 1); assert.equal(fixture.completionBodies.length, 2);
  assert.deepEqual(fixture.completionBodies[0], fixture.completionBodies[1]);
  assert.equal([...fixture.rows.values()][0].state, 'succeeded');
});

test('unconfirmed result persistence cannot expose a numeric score or call the provider again', async () => {
  const fixture = serverFixture({ completionFails: true }), first = await fixture.request();
  assert.equal(first.status, 503); assert.equal(first.body.code, 'result_unavailable'); assert.equal('assessment' in first.body, false);
  assert.equal(fixture.evaluations.length, 1); assert.equal(fixture.completionBodies.length, 2);
  assert.equal([...fixture.rows.values()][0].state, 'pending');
  assert.equal((await fixture.request()).body.code, 'assessment_pending'); assert.equal(fixture.evaluations.length, 1);
});

test('GET recovery is owner-scoped, free of provider calls, and survives a disabled provider configuration', async () => {
  const fixture = serverFixture(), first = await fixture.request();
  fixture.env.XFYUN_API_SECRET = '';
  const own = await fixture.request(null, { method: 'GET', query: '?attemptId=fictional-attempt-1' });
  assert.deepEqual(own.body, first.body); assert.equal(fixture.evaluations.length, 1);
  const other = await fixture.request(null, { method: 'GET', query: '?attemptId=fictional-attempt-1', headers: { authorization: 'Bearer ' + OTHER_TOKEN } });
  assert.equal(other.status, 404); assert.equal(other.body.code, 'not_found'); assert.equal(fixture.evaluations.length, 1);
  const lastRead = fixture.calls.at(-1); assert.equal(lastRead.url.searchParams.get('owner_id'), 'eq.' + OTHER);
  assert.equal((await fixture.request(null, { method: 'GET' })).body.ready, false);
});

test('separate verified accounts can reuse an attempt ID without sharing any outcome', async () => {
  const fixture = serverFixture(), first = await fixture.request();
  const second = await fixture.request(input(), { headers: { authorization: 'Bearer ' + OTHER_TOKEN } });
  assert.equal(second.body.assessment.owner, OTHER); assert.notEqual(first.body.assessment.id, second.body.assessment.id);
  assert.equal(fixture.evaluations.length, 2); assert.equal(fixture.rows.size, 2);
});

test('legacy and new server key injection stay server-side and use the proper headers', async () => {
  const legacy = 'eyJfictional_service_role.test_signature';
  const fixture = serverFixture({ env: { SUPABASE_SERVICE_ROLE_KEY: legacy } });
  assert.equal((await fixture.request()).status, 200);
  assert.equal(fixture.calls.find(call => call.url.pathname.includes('/rpc/')).headers.get('authorization'), 'Bearer ' + legacy);
  const injected = serverFixture({ env: { SUPABASE_PUBLISHABLE_KEYS: JSON.stringify({ default: ENV.SUPABASE_ANON_KEY }),
    SUPABASE_SECRET_KEYS: JSON.stringify({ default: ENV.SUPABASE_SERVICE_ROLE_KEY }), SUPABASE_ANON_KEY: '' } });
  assert.equal((await injected.request()).status, 200);
  assert.equal(injected.calls[0].headers.get('apikey'), ENV.SUPABASE_ANON_KEY);
  const local = serverFixture({ env: { SUPABASE_PUBLISHABLE_KEY: ENV.SUPABASE_ANON_KEY,
    SUPABASE_SECRET_KEY: ENV.SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY: '' } });
  assert.equal((await local.request()).status, 200);
});

test('the SQL source preserves owned immutable evidence and reserves the conservative quota atomically', () => {
  // Static migration review complements the fake HTTP tests; it does not claim
  // a PostgreSQL migration was applied or a real provider was contacted.
  const sql = fs.readFileSync(path.join(__dirname, '../grok/supabase/pronunciation_assessment.sql'), 'utf8');
  assert.match(sql, /primary key \(owner_id, attempt_id\)/i);
  assert.match(sql, /enable row level security/i); assert.match(sql, /for select to authenticated using \(\(select auth\.uid\(\)\) = owner_id\)/i);
  assert.match(sql, /grant select on table public\.word_pronunciation_attempts to authenticated/i);
  assert.doesNotMatch(sql, /grant\s+(?:all|insert|update|delete|execute)\b[^;]*\bto\s+(?:authenticated|anon|public)\b/i);
  assert.doesNotMatch(sql, /security definer|disable row level security|create role|alter role/i);
  assert.doesNotMatch(sql, /on delete cascade/i);
  assert.match(sql, /pg_advisory_xact_lock\(710314177, 101\)/);
  assert.match(sql, /v_global >= 400 or v_student >= 40/); assert.match(sql, /v_minute >= 5/);
  assert.match(sql, /interval '24 hours'/); assert.match(sql, /interval '1 minute'/);
  assert.match(sql, /request_hash is distinct from p_request_hash/);
  assert.match(sql, /old\.state <> 'pending' and new is distinct from old/);
  assert.match(sql, /grant execute on function public\.word_pronunciation_reserve\([^;]*\) to service_role/i);
  assert.match(sql, /grant execute on function public\.word_pronunciation_finish\([^;]*\) to service_role/i);
  for (const match of sql.matchAll(/(?:alter table|update|insert into|delete from)\s+public\.([a-z_]+)/gi)) {
    assert.equal(match[1], 'word_pronunciation_attempts');
  }
  const schema = sql.slice(sql.indexOf('create table'), sql.indexOf('create index'));
  assert.doesNotMatch(schema, /audio|token|api_key|api_secret|signed_url/i);
});

(async () => {
  api = await import('../grok/supabase/functions/word-pronunciation/core.mjs');
  for (const { name, fn } of tests) { await fn(); console.log('PASS ' + name); }
  console.log('ISE backend contracts passed (' + tests.length + ' tests; no live provider calls).');
})().catch(error => { console.error(error); process.exitCode = 1; });

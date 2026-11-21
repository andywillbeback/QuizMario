/* Server-only Xfyun ISE bridge. No audio, credentials or signed URLs are logged,
 * persisted, or returned. The durable reservation precedes every upstream call.
 * Pure exports are also exercised by the repository's Node release checks.
 */
export const PROVIDER = 'xfyun-ise';
export const MODEL_VERSION = 'xfyun-ise-en-v1';
export const DEFAULT_ORIGIN = 'https://andywillbeback.github.io';
const PROVIDER_URL = 'wss://ise-api.xfyun.cn/v2/open-ise';
const MIN_AUDIO_BYTES = 11200; // 350 ms of 16 kHz, signed 16-bit mono PCM.
const MAX_AUDIO_BYTES = 320000; // 10 s hard bound; the recorder normally stops at 8 s.
const MAX_BODY_BYTES = 450000;
const MAX_XML_BYTES = 131072;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ID = /^[A-Za-z0-9:_-]{1,120}$/;
const messages = {
  unauthorized: '请重新登录后再评测。',
  forbidden: '这个页面暂时不能使用评测服务。',
  invalid_request: '这次录音信息不完整，请重新录制。',
  unsupported_target: '这个词条暂不支持单词评测，朗读记录已保留。',
  service_unavailable: '发音评测服务尚未就绪，朗读记录已保留。',
  quota_exhausted: '最近 24 小时的免费评测额度已用完，朗读记录已保留。',
  rate_limited: '评测操作较频繁，请稍等片刻。朗读记录已保留。',
  attempt_conflict: '本次录音编号与已有记录不一致，请重新录制。',
  assessment_pending: '这次评测还在处理，稍后可以查看结果。',
  assessment_rejected: '这段录音暂时无法可靠评测，请在安静环境中重新读一次。',
  upstream_unavailable: '评测暂时没有完成，朗读记录已保留，请稍后再试。',
  result_unavailable: '评测结果暂时无法确认，朗读记录已保留。',
  not_found: '还没有这次录音的评测结果。',
};

export class AssessmentError extends Error {
  constructor(code, status = 503) {
    super(messages[code] || messages.service_unavailable);
    this.name = 'AssessmentError'; this.code = code; this.status = status;
  }
}
function fail(code, status) { throw new AssessmentError(code, status); }
function object(value) { return !!value && typeof value === 'object' && !Array.isArray(value); }
function errorOutcome(error) {
  const known = error instanceof AssessmentError ? error : new AssessmentError('service_unavailable');
  return { ok: false, code: known.code, message: known.message };
}
function validId(id) { return typeof id === 'string' && ID.test(id) && !/^(?:__proto__|prototype|constructor)$/.test(id); }

// Must stay aligned with grok/sense-id.js; tested against its public contract.
export function itemToken(word) {
  const lower = word.toLowerCase();
  if (lower === 'may') return word === 'May' ? 'may:month' : 'may';
  if (lower === 'march') return word === 'March' ? 'march:month' : 'march';
  if (lower === 'miss') return word === 'Miss' ? 'miss:title' : 'miss:verb';
  if (lower === 'who') return word === 'WHO' ? 'who:abbr' : 'who';
  if (lower === 'china') return word === 'china' ? 'china:ware' : 'china:country';
  return lower;
}

export function bytesToBase64(bytes) {
  let text = '';
  for (let index = 0; index < bytes.length; index += 8192) text += String.fromCharCode(...bytes.subarray(index, index + 8192));
  return btoa(text);
}
function decodeBase64(value, maximum) {
  if (typeof value !== 'string' || value.length === 0 || value.length > Math.ceil(maximum / 3) * 4 ||
      value.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) fail('invalid_request', 400);
  let text;
  try { text = atob(value); } catch (_) { fail('invalid_request', 400); }
  const bytes = Uint8Array.from(text, character => character.charCodeAt(0));
  if (bytes.length > maximum || bytesToBase64(bytes) !== value) fail('invalid_request', 400);
  return bytes;
}

export function validateInput(body) {
  if (!object(body) || !validId(body.attemptId) || typeof body.cardKey !== 'string' || body.cardKey.length > 240 ||
      typeof body.word !== 'string' || body.word.length > 80 || !body.word.length) fail('invalid_request', 400);
  // [word] splits whitespace. Phrase/numeric tasks need a separate, validated
  // assessment category and must not silently be scored as a single word.
  if (!/^[A-Za-z][A-Za-z.'-]*$/.test(body.word) || !/[A-Za-z]/.test(body.word) || /[.'-]{3}/.test(body.word)) {
    fail('unsupported_target', 422);
  }
  const key = /^(?:(?:zhongkao|gaokao|ielts)\|)?(?:0|[1-9]\d{0,3})::(.+)$/.exec(body.cardKey);
  if (!key || key[1] !== itemToken(body.word)) fail('invalid_request', 400);
  const audio = body.audio;
  if (!object(audio) || audio.format !== 'pcm_s16le' || audio.sampleRate !== 16000 || audio.channels !== 1) fail('invalid_request', 400);
  const pcm = decodeBase64(audio.data, MAX_AUDIO_BYTES);
  if (pcm.length < MIN_AUDIO_BYTES || pcm.length % 2 !== 0) fail('invalid_request', 400);
  // A bytewise-zero PCM buffer is known silence, not a low pronunciation score.
  if (!pcm.some(byte => byte !== 0)) fail('assessment_rejected', 422);
  return { attemptId: body.attemptId, cardKey: body.cardKey, word: body.word, pcm, durationMs: Math.round(pcm.length / 32) };
}

export async function requestHash(input, owner, cryptoApi = globalThis.crypto) {
  const prefix = new TextEncoder().encode([owner, input.attemptId, input.cardKey, input.word, 'pcm_s16le:16000:1'].join('\0') + '\0');
  const bytes = new Uint8Array(prefix.length + input.pcm.length);
  bytes.set(prefix); bytes.set(input.pcm, prefix.length);
  const digest = await cryptoApi.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function signedProviderUrl(credentials, now = Date.now(), cryptoApi = globalThis.crypto) {
  const date = new Date(now).toUTCString();
  const source = 'host: ise-api.xfyun.cn\ndate: ' + date + '\nGET /v2/open-ise HTTP/1.1';
  const key = await cryptoApi.subtle.importKey('raw', new TextEncoder().encode(credentials.apiSecret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = bytesToBase64(new Uint8Array(await cryptoApi.subtle.sign('HMAC', key, new TextEncoder().encode(source))));
  const authorization = 'api_key="' + credentials.apiKey + '", algorithm="hmac-sha256", headers="host date request-line", signature="' + signature + '"';
  const url = new URL(PROVIDER_URL);
  url.searchParams.set('authorization', bytesToBase64(new TextEncoder().encode(authorization)));
  url.searchParams.set('date', date); url.searchParams.set('host', 'ise-api.xfyun.cn');
  return url.toString();
}

export function initialFrame(appId, word) {
  return { common: { app_id: appId }, business: {
    sub: 'ise', ent: 'en_vip', category: 'read_word', cmd: 'ssb', text: '\uFEFF[word]\n' + word,
    tte: 'utf-8', ttp_skip: true, aue: 'raw', auf: 'audio/L16;rate=16000', rstcd: 'utf8',
    rst: 'entirety', ise_unite: '1', extra_ability: 'multi_dimension;syll_phone_err_msg',
  }, data: { status: 0 } };
}

function xmlText(value) {
  return value.replace(/&([^;]*);|&/g, (all, entity) => {
    const known = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
    if (Object.prototype.hasOwnProperty.call(known, entity)) return known[entity];
    const hex = /^#x([0-9a-fA-F]+)$/.exec(entity || ''), dec = /^#([0-9]+)$/.exec(entity || '');
    if (!hex && !dec) fail('upstream_unavailable');
    const point = parseInt(hex ? hex[1] : dec[1], hex ? 16 : 10);
    if (!Number.isFinite(point) || !([9, 10, 13].includes(point) || point >= 32 && point <= 0xD7FF ||
        point >= 0xE000 && point <= 0xFFFD || point >= 0x10000 && point <= 0x10FFFF)) fail('upstream_unavailable');
    return String.fromCodePoint(point);
  });
}

/* Strict, bounded XML reader for the documented result tree. No DTD, entity
 * declarations, external resolution, namespaces, regex-based score searching,
 * or execution. Reject malformed/ambiguous trees instead of inventing a score.
 */
export function parseXml(xml) {
  if (typeof xml !== 'string' || xml.length > MAX_XML_BYTES || /<!DOCTYPE|<!ENTITY/i.test(xml)) fail('upstream_unavailable');
  for (const character of xml) {
    const point = character.codePointAt(0);
    if (!(point === 9 || point === 10 || point === 13 || point >= 32 && point <= 0xD7FF ||
      point >= 0xE000 && point <= 0xFFFD || point >= 0x10000 && point <= 0x10FFFF)) fail('upstream_unavailable');
  }
  xml = xml.replace(/^\uFEFF/, '');
  const stack = [], roots = [];
  let offset = 0, count = 0;
  while (offset < xml.length) {
    if (xml[offset] !== '<') {
      const end = xml.indexOf('<', offset), text = xml.slice(offset, end < 0 ? xml.length : end);
      if (text.includes(']]>') || !stack.length && /[^ \t\r\n]/.test(text)) fail('upstream_unavailable');
      xmlText(text); offset = end < 0 ? xml.length : end; continue;
    }
    if (xml.startsWith('<!--', offset)) {
      const end = xml.indexOf('-->', offset + 4);
      if (end < 0 || xml.slice(offset + 4, end).includes('--')) fail('upstream_unavailable');
      offset = end + 3; continue;
    }
    if (/^<\?xml[ \t\r\n]/.test(xml.slice(offset, offset + 6))) {
      const end = xml.indexOf('?>', offset + 6);
      const declaration = xml.slice(offset, end + 2);
      if (end < 0 || offset !== 0 || !/^<\?xml[ \t\r\n]+version[ \t\r\n]*=[ \t\r\n]*(['"])1\.0\1(?:[ \t\r\n]+encoding[ \t\r\n]*=[ \t\r\n]*(['"])[Uu][Tt][Ff]-8\2)?(?:[ \t\r\n]+standalone[ \t\r\n]*=[ \t\r\n]*(['"])(?:yes|no)\3)?[ \t\r\n]*\?>$/.test(declaration)) fail('upstream_unavailable');
      offset = end + 2; continue;
    }
    if (xml.startsWith('<![CDATA[', offset)) {
      const end = xml.indexOf(']]>', offset + 9);
      if (end < 0 || !stack.length) fail('upstream_unavailable');
      offset = end + 3; continue;
    }
    if (xml.startsWith('<!', offset) || xml.startsWith('<?', offset)) fail('upstream_unavailable');
    let end = offset + 1, quote = '';
    for (; end < xml.length; end += 1) {
      const character = xml[end];
      if (quote) { if (character === quote) quote = ''; }
      else if (character === '"' || character === "'") quote = character;
      else if (character === '>') break;
      else if (character === '<') fail('upstream_unavailable');
    }
    if (end >= xml.length || quote) fail('upstream_unavailable');
    const inside = xml.slice(offset + 1, end);
    offset = end + 1;
    if (inside[0] === '/') {
      const closing = /^\/([A-Za-z_][A-Za-z0-9_.-]*)[ \t\r\n]*$/.exec(inside);
      if (!closing || !stack.length || stack.pop().name !== closing[1]) fail('upstream_unavailable');
      continue;
    }
    const selfClosing = inside.endsWith('/'), source = selfClosing ? inside.slice(0, -1) : inside;
    const name = /^([A-Za-z_][A-Za-z0-9_.-]*)/.exec(source);
    if (!name) fail('upstream_unavailable');
    const node = { name: name[1], attributes: Object.create(null), children: [] };
    let rest = source.slice(name[0].length);
    while (rest.length) {
      if (!/^[ \t\r\n]/.test(rest)) fail('upstream_unavailable');
      rest = rest.replace(/^[ \t\r\n]+/, '');
      if (!rest.length) break;
      const attribute = /^([A-Za-z_][A-Za-z0-9_.-]*)[ \t\r\n]*=[ \t\r\n]*(["'])([^]*?)\2/.exec(rest);
      if (!attribute || attribute[3].includes('<') || Object.prototype.hasOwnProperty.call(node.attributes, attribute[1])) fail('upstream_unavailable');
      node.attributes[attribute[1]] = xmlText(attribute[3]);
      rest = rest.slice(attribute[0].length);
    }
    if (++count > 10000 || stack.length >= 32) fail('upstream_unavailable');
    if (stack.length) stack[stack.length - 1].children.push(node);
    else { if (roots.length) fail('upstream_unavailable'); roots.push(node); }
    if (!selfClosing) stack.push(node);
  }
  if (stack.length || roots.length !== 1) fail('upstream_unavailable');
  return roots[0];
}

function oneChild(node, name) {
  const matching = node.children.filter(child => child.name === name);
  if (matching.length !== 1) fail('upstream_unavailable');
  return matching[0];
}
function scoreField(attributes, key) {
  if (!Object.prototype.hasOwnProperty.call(attributes, key)) return null;
  const text = attributes[key].trim();
  if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(text)) fail('upstream_unavailable');
  const number = Number(text);
  if (!Number.isFinite(number) || number < 0 || number > 100) fail('upstream_unavailable');
  return number;
}
export function parseAssessmentXml(xml) {
  const root = parseXml(xml);
  if (root.name !== 'xml_result') fail('upstream_unavailable');
  const wrapper = oneChild(root, 'read_word');
  if (wrapper.attributes.lan !== 'en') fail('upstream_unavailable');
  const paper = oneChild(wrapper, 'rec_paper'), result = oneChild(paper, 'read_word');
  for (const node of [wrapper, paper, result]) {
    if ('is_rejected' in node.attributes) {
      const rejected = node.attributes.is_rejected.toLowerCase();
      if (rejected === 'true' || rejected === '1') fail('assessment_rejected', 422);
      if (rejected !== 'false' && rejected !== '0') fail('upstream_unavailable');
    }
    if ('except_info' in node.attributes) {
      if (!/^\d+$/.test(node.attributes.except_info)) fail('upstream_unavailable');
      if (Number(node.attributes.except_info) !== 0) fail('assessment_rejected', 422);
    }
  }
  const accuracyScore = scoreField(result.attributes, 'accuracy_score');
  const totalScore = scoreField(result.attributes, 'total_score');
  if (accuracyScore === null && totalScore === null) fail('upstream_unavailable');
  return { accuracyScore, totalScore };
}

export async function evaluateWithXfyun(input, credentials, dependencies = {}) {
  const now = dependencies.now || Date.now;
  const Socket = dependencies.WebSocket || globalThis.WebSocket;
  const sleep = dependencies.sleep || (milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)));
  const url = await signedProviderUrl(credentials, now(), dependencies.crypto || globalThis.crypto);
  return new Promise((resolve, reject) => {
    let socket, settled = false, sentFinal = false, providerRequestId = '';
    const timer = setTimeout(() => finish(new AssessmentError('upstream_unavailable')), dependencies.timeoutMs || 18000);
    function finish(error, result) {
      if (settled) return; settled = true; clearTimeout(timer);
      if (socket) {
        socket.onopen = socket.onmessage = socket.onerror = socket.onclose = null;
        try { socket.close(1000); } catch (_) {}
      }
      error ? reject(error) : resolve({ ...result, providerRequestId });
    }
    try { socket = new Socket(url); } catch (_) { finish(new AssessmentError('upstream_unavailable')); return; }
    socket.onopen = async () => {
      try {
        if (settled) return;
        socket.send(JSON.stringify(initialFrame(credentials.appId, input.word)));
        for (let offset = 0; offset < input.pcm.length; offset += 1280) {
          if (settled) return;
          socket.send(JSON.stringify({ business: { cmd: 'auw', aus: offset === 0 ? 1 : 2 },
            data: { status: 1, data: bytesToBase64(input.pcm.subarray(offset, offset + 1280)) } }));
          await sleep(40);
        }
        if (!settled) {
          sentFinal = true;
          socket.send(JSON.stringify({ business: { cmd: 'auw', aus: 4 }, data: { status: 2, data: '' } }));
        }
      } catch (_) { finish(new AssessmentError('upstream_unavailable')); }
    };
    socket.onmessage = event => {
      if (settled) return;
      try {
        if (typeof event.data !== 'string' || event.data.length > 200000) fail('upstream_unavailable');
        const frame = JSON.parse(event.data);
        if (frame.code !== 0) {
          if (frame.code === 11201 || frame.code === 42306) fail('quota_exhausted', 429);
          if (frame.code === 11200 || frame.code === 10313) fail('service_unavailable');
          fail('upstream_unavailable');
        }
        if (typeof frame.sid === 'string' && /^[A-Za-z0-9@._:-]{1,120}$/.test(frame.sid)) providerRequestId = frame.sid;
        if (frame.data == null) return; // The provider may acknowledge setup without a result payload.
        if (!object(frame.data) || ![0, 1, 2].includes(frame.data.status)) fail('upstream_unavailable');
        if (frame.data.status !== 2) return; // Official API uses the final frame's complete XML.
        if (!sentFinal) fail('upstream_unavailable');
        let bytes;
        try { bytes = decodeBase64(frame.data.data, MAX_XML_BYTES); }
        catch (_) { fail('upstream_unavailable'); }
        let xml;
        try { xml = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
        catch (_) { fail('upstream_unavailable'); }
        finish(null, parseAssessmentXml(xml));
      } catch (error) {
        finish(error instanceof AssessmentError ? error : new AssessmentError('upstream_unavailable'));
      }
    };
    socket.onerror = () => finish(new AssessmentError('upstream_unavailable'));
    socket.onclose = () => finish(new AssessmentError('upstream_unavailable'));
  });
}

async function bounded(promise, milliseconds, onTimeout) {
  let timer;
  const timeout = new Promise((_, reject) => { timer = setTimeout(() => {
    try { if (onTimeout) onTimeout(); } catch (_) {}
    reject(new AssessmentError('service_unavailable'));
  }, milliseconds); });
  try { return await Promise.race([promise, timeout]); } finally { clearTimeout(timer); }
}
async function readJson(request) {
  if (!request.body || !/application\/json(?:\s*;|$)/i.test(request.headers.get('content-type') || '')) fail('invalid_request', 400);
  const length = Number(request.headers.get('content-length') || 0);
  if (!Number.isFinite(length) || length < 0 || length > MAX_BODY_BYTES) fail('invalid_request', 413);
  const reader = request.body.getReader();
  const task = (async () => {
    let length = 0; const chunks = [];
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      length += value.byteLength;
      if (length > MAX_BODY_BYTES) { await reader.cancel(); fail('invalid_request', 413); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(length); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
    catch (_) { fail('invalid_request', 400); }
  })();
  return bounded(task, 5000, () => reader.cancel().catch(() => {}));
}

function envValue(env, name) { return String(typeof env === 'function' ? env(name) || '' : env[name] || '').trim(); }
function injectedKey(env, dictName, fallbackNames) {
  const raw = envValue(env, dictName);
  if (raw) { try { const values = JSON.parse(raw); if (typeof values.default === 'string' && values.default) return values.default; } catch (_) {} }
  for (const name of fallbackNames) { const value = envValue(env, name); if (value) return value; }
  return '';
}
function configuration(env) {
  const supabaseUrl = envValue(env, 'SUPABASE_URL').replace(/\/+$/, '');
  const publicKey = injectedKey(env, 'SUPABASE_PUBLISHABLE_KEYS', ['SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_ANON_KEY']);
  const secretKey = injectedKey(env, 'SUPABASE_SECRET_KEYS', ['SUPABASE_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY']);
  const appId = envValue(env, 'XFYUN_APP_ID'), apiKey = envValue(env, 'XFYUN_API_KEY'), apiSecret = envValue(env, 'XFYUN_API_SECRET');
  const databaseReady = /^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(supabaseUrl) && !!publicKey && !!secretKey;
  const ready = databaseReady &&
    /^[A-Za-z0-9]{6,64}$/.test(appId) && /^[A-Za-z0-9_-]{16,128}$/.test(apiKey) && /^[A-Za-z0-9_-]{16,128}$/.test(apiSecret);
  return { supabaseUrl, publicKey, secretKey, databaseReady, ready, credentials: { appId, apiKey, apiSecret } };
}

export function createHandler(options = {}) {
  const getEnvironment = options.env || {};
  const fetcher = options.fetch || globalThis.fetch, now = options.now || Date.now, cryptoApi = options.crypto || globalThis.crypto;
  async function jsonRequest(url, init, milliseconds = 4000) {
    const controller = new AbortController();
    return bounded((async () => {
      const response = await fetcher(url, { ...init, redirect: 'error', signal: controller.signal });
      const text = await response.text();
      if (text.length > 262144) fail('service_unavailable');
      let data; try { data = text ? JSON.parse(text) : null; } catch (_) { fail('service_unavailable'); }
      return { response, data };
    })(), milliseconds, () => controller.abort());
  }
  async function authenticate(request, config) {
    const header = request.headers.get('authorization') || '';
    if (!/^Bearer [A-Za-z0-9._-]{10,8192}$/.test(header)) fail('unauthorized', 401);
    if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(config.supabaseUrl) || !config.publicKey) fail('service_unavailable');
    const { response, data } = await jsonRequest(config.supabaseUrl + '/auth/v1/user', {
      method: 'GET', headers: { authorization: header, apikey: config.publicKey },
    });
    if (response.status === 401 || response.status === 403) fail('unauthorized', 401);
    if (!response.ok) fail('service_unavailable');
    if (!object(data) || !UUID.test(data.id || '') || data.is_anonymous === true) fail('unauthorized', 401);
    return data.id.toLowerCase();
  }
  function serviceHeaders(config) {
    const headers = { apikey: config.secretKey, 'content-type': 'application/json' };
    // New secret keys are not JWTs. The legacy service-role key still needs its
    // Authorization header; neither type ever reaches the learner browser.
    if (config.secretKey.startsWith('eyJ')) headers.authorization = 'Bearer ' + config.secretKey;
    return headers;
  }
  async function rpc(config, name, body) {
    const { response, data } = await jsonRequest(config.supabaseUrl + '/rest/v1/rpc/' + name, {
      method: 'POST', headers: serviceHeaders(config), body: JSON.stringify(body),
    });
    if (!response.ok || !object(data)) fail('service_unavailable');
    return data;
  }
  async function stored(config, owner, attemptId) {
    const url = new URL(config.supabaseUrl + '/rest/v1/word_pronunciation_attempts');
    url.searchParams.set('owner_id', 'eq.' + owner); url.searchParams.set('attempt_id', 'eq.' + attemptId);
    url.searchParams.set('select', 'state,outcome,http_status,created_at'); url.searchParams.set('limit', '1');
    const { response, data } = await jsonRequest(url.toString(), { method: 'GET', headers: serviceHeaders(config) });
    if (!response.ok || !Array.isArray(data)) fail('service_unavailable');
    if (!data.length) fail('not_found', 404);
    return { state: data[0].state === 'pending' ? 'pending' : 'cached', outcome: data[0].outcome,
      httpStatus: data[0].http_status, createdAt: data[0].created_at };
  }
  function reservedOutcome(row) {
    if (row.state === 'cached' && object(row.outcome) && Number.isInteger(row.httpStatus)) return { body: row.outcome, status: row.httpStatus };
    if (row.state === 'pending') {
      // A worker that disappeared must never cause a second provider call. A
      // stale reservation means unknown outcome, not endless live processing.
      if (Number.isFinite(Date.parse(row.createdAt)) && now() - Date.parse(row.createdAt) > 120000) fail('result_unavailable');
      fail('assessment_pending', 202);
    }
    if (row.state === 'conflict') fail('attempt_conflict', 409);
    if (row.state === 'quota') fail('quota_exhausted', 429);
    if (row.state === 'throttled') fail('rate_limited', 429);
    if (row.state !== 'reserved') fail('service_unavailable');
    return null;
  }
  async function complete(config, owner, input, outcome, status) {
    // Safe retry of the exact completion write, never of the provider call.
    for (let index = 0; index < 2; index += 1) {
      try {
        const row = await rpc(config, 'word_pronunciation_finish', {
          p_owner_id: owner, p_attempt_id: input.attemptId, p_outcome: outcome, p_http_status: status,
        });
        if (row.state !== 'cached' || !object(row.outcome) || !Number.isInteger(row.httpStatus)) fail('result_unavailable');
        return { body: row.outcome, status: row.httpStatus };
      } catch (_) { if (index === 1) fail('result_unavailable'); }
    }
  }
  return async function handle(request) {
    const origin = request.headers.get('origin'), headers = {
      'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store',
      'x-content-type-options': 'nosniff', vary: 'Origin',
    };
    if (origin === DEFAULT_ORIGIN) headers['access-control-allow-origin'] = origin;
    function reply(body, status = 200) { return new Response(status === 204 ? null : JSON.stringify(body), { status, headers }); }
    try {
      if (origin && origin !== DEFAULT_ORIGIN) fail('forbidden', 403);
      if (request.method === 'OPTIONS') {
        headers['access-control-allow-methods'] = 'GET, POST, OPTIONS';
        headers['access-control-allow-headers'] = 'authorization, apikey, content-type, x-client-info';
        headers['access-control-max-age'] = '600';
        return reply(null, 204);
      }
      if (request.method !== 'GET' && request.method !== 'POST') return reply({ ok: false, code: 'method_not_allowed', message: '不支持此请求方式。' }, 405);
      const config = configuration(getEnvironment), owner = await authenticate(request, config);
      const attemptId = new URL(request.url).searchParams.get('attemptId');
      if (request.method === 'GET' && !attemptId) return reply({ ok: true, ready: config.ready, provider: PROVIDER, limits: { rollingHours: 24, global: 400, perStudent: 40 } });
      if (request.method === 'GET') {
        if (!config.databaseReady) fail('service_unavailable');
        if (!validId(attemptId)) fail('invalid_request', 400);
        const found = reservedOutcome(await stored(config, owner, attemptId));
        return reply(found.body, found.status);
      }
      if (!config.ready) fail('service_unavailable');
      const input = validateInput(await readJson(request)), hash = await requestHash(input, owner, cryptoApi);
      const reservation = await rpc(config, 'word_pronunciation_reserve', {
        p_owner_id: owner, p_attempt_id: input.attemptId, p_request_hash: hash, p_card_key: input.cardKey,
        p_word: input.word, p_duration_ms: input.durationMs,
      });
      const cached = reservedOutcome(reservation);
      if (cached) return reply(cached.body, cached.status);
      let outcome, status;
      try {
        const scored = await (options.evaluate || evaluateWithXfyun)(input, config.credentials, {
          now, crypto: cryptoApi, WebSocket: options.WebSocket, sleep: options.sleep, timeoutMs: options.providerTimeoutMs,
        });
        // Keep the boundary strict even if a test or another adapter is supplied.
        for (const field of ['accuracyScore', 'totalScore']) {
          if (scored[field] !== null && (!Number.isFinite(scored[field]) || scored[field] < 0 || scored[field] > 100)) fail('upstream_unavailable');
        }
        if (scored.accuracyScore === null && scored.totalScore === null) fail('upstream_unavailable');
        outcome = { ok: true, assessment: { id: 'ise_' + hash.slice(0, 40), attemptId: input.attemptId, owner,
          cardKey: input.cardKey, word: input.word, provider: PROVIDER, at: new Date(now()).toISOString(), scale: 100,
          accuracyScore: scored.accuracyScore, totalScore: scored.totalScore, status: 'assessed', modelVersion: MODEL_VERSION } };
        status = 200;
      } catch (error) {
        const known = error instanceof AssessmentError ? error : new AssessmentError('upstream_unavailable');
        outcome = errorOutcome(known); status = known.status;
      }
      const completed = await complete(config, owner, input, outcome, status);
      return reply(completed.body, completed.status);
    } catch (error) {
      const known = error instanceof AssessmentError ? error : new AssessmentError('service_unavailable');
      return reply(errorOutcome(known), known.status);
    }
  };
}

'use strict';

/*
 * Real /grok/ page at phone width, with fictional auth/cloud data and simulated
 * microphone/MediaRecorder. This verifies UI, ownership and persistence, not
 * real microphones, acoustic accuracy or iPhone/Android hardware compatibility.
 * No student recordings or credentials are used or sent to any external API.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const {spawn} = require('node:child_process');
const SRS = require('../grok/srs-rules.js');
if (typeof WebSocket === 'undefined') global.WebSocket = require('ws');

const root = path.resolve(__dirname, '..');
const OWNER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const SAVE_KEY = 'vocabSpotlight_v1:account:' + OWNER;
const session = {
  access_token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMTExMTExMS0xMTExLTQxMTEtODExMS0xMTExMTExMTExMTEiLCJyb2xlIjoiYXV0aGVudGljYXRlZCIsImV4cCI6MTk5OTk5OTk5OX0.test-only',
  refresh_token: 'fictional-oral-browser-refresh',
  token_type: 'bearer', expires_in: 3600, expires_at: 1999999999,
  user: {id: OWNER, aud: 'authenticated', role: 'authenticated', email: 'oral-browser@example.test',
    app_metadata: {provider: 'email', providers: ['email']}, user_metadata: {},
    created_at: '2026-01-01T00:00:00.000Z', email_confirmed_at: '2026-01-01T00:00:00.000Z'}
};
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

function setupBrowser(session, saveKey) {
  localStorage.setItem('quizmario-auth', JSON.stringify(session));
  sessionStorage.setItem('qm-phase', 'signed');
  const initial = {cards: {}, points: 0, track: 'zhongkao',
    profile: {name: '口语测试甲', cls: '自动化测试班'}, updatedAt: '2026-11-01T00:00:00.000Z'};
  if (!localStorage.getItem(saveKey)) localStorage.setItem(saveKey, JSON.stringify(initial));
  let cloud = JSON.parse(localStorage.getItem('__oral_test_cloud') || 'null') || initial;
  let revision = 0, version = '2026-11-01T00:00:00.000Z';
  const realFetch = window.fetch.bind(window);
  window.__oralTest = {micCalls: 0, mode: 'normal', stopped: 0, recorders: [], pending: [],
    replayCalls: 0, requests: [], stopDelay: 10};
  const test = window.__oralTest;
  function reply(status, body) {
    return Promise.resolve(new Response(JSON.stringify(body), {status, headers: {'content-type': 'application/json'}}));
  }
  window.fetch = function (input, init) {
    const url = typeof input === 'string' ? input : input.url;
    const method = String(init && init.method || input && input.method || 'GET').toUpperCase();
    test.requests.push({url, method});
    if (!/supabase\.co/.test(url)) {
      if (new URL(url, location.href).origin !== location.origin) {
        return Promise.reject(new Error('External network is disabled in this test.'));
      }
      return realFetch(input, init);
    }
    if (url.includes('/user_progress')) {
      if (method === 'GET' || method === 'HEAD') return reply(200, [{save: cloud, updated_at: version}]);
      const expected = new URL(url).searchParams.get('updated_at');
      if (method === 'PATCH' && expected && expected !== 'eq.' + version) return reply(406, {code: 'PGRST116'});
      const payload = JSON.parse(init.body || '{}');
      cloud = (Array.isArray(payload) ? payload[0] : payload).save;
      version = new Date(Date.now() + (++revision)).toISOString();
      localStorage.setItem('__oral_test_cloud', JSON.stringify(cloud));
      return reply(200, {user_id: session.user.id, save: cloud, updated_at: version});
    }
    if (url.includes('/learner_events')) return reply(200, []);
    if (url.includes('/auth/v1/user')) return reply(200, session.user);
    if (url.includes('/token') || url.includes('/signup')) return reply(200, session);
    return reply(200, {});
  };
  function stream() {
    const track = {kind: 'audio', readyState: 'live', enabled: true,
      stop() { if (this.readyState !== 'ended') test.stopped++; this.readyState = 'ended'; },
      addEventListener() {}, removeEventListener() {}};
    return {active: true, getTracks() {return [track];}, getAudioTracks() {return [track];}};
  }
  test.resolveMicrophone = function () { const resolve = test.pending.shift(); if (resolve) resolve(stream()); };
  Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {configurable: true, value: function () {
    test.micCalls++;
    if (test.mode === 'reject') return Promise.reject(new DOMException('Test permission denied', 'NotAllowedError'));
    if (test.mode === 'pending') return new Promise(resolve => test.pending.push(resolve));
    return Promise.resolve(stream());
  }});
  class Recorder extends EventTarget {
    constructor(media, options) {
      super(); this.stream = media; this.mimeType = options && options.mimeType || 'audio/webm';
      this.state = 'inactive'; test.recorders.push(this);
    }
    static isTypeSupported(type) { return /^audio\/(webm|mp4|ogg)/.test(type); }
    emit(type, data) {
      const ev = new Event(type);
      if (data) Object.assign(ev, data);
      if (typeof this['on' + type] === 'function') this['on' + type](ev);
      this.dispatchEvent(ev);
    }
    start() { this.state = 'recording'; setTimeout(() => this.emit('start'), 0); }
    requestData() { this.emit('dataavailable', {data: new Blob([new Uint8Array(512)], {type: this.mimeType})}); }
    stop() {
      if (this.state === 'inactive') return;
      this.state = 'inactive';
      setTimeout(() => { this.requestData(); this.emit('stop'); }, test.stopDelay);
    }
  }
  window.MediaRecorder = Recorder;
  class Context {
    constructor() {this.state = 'running'; this.currentTime = 0; this.destination = {};}
    resume() {this.state = 'running'; return Promise.resolve();}
    close() {this.state = 'closed'; return Promise.resolve();}
    createMediaStreamSource() {return {connect() {}, disconnect() {}};}
    createAnalyser() {
      return {fftSize: 2048, frequencyBinCount: 1024,
        getFloatTimeDomainData(data) {for (let i=0;i<data.length;i++) data[i]=Math.sin(i/8)*0.1;},
        getByteTimeDomainData(data) {for (let i=0;i<data.length;i++) data[i]=128+Math.round(Math.sin(i/8)*20);},
        disconnect() {}};
    }
    createGain() {return {gain:{value:1,setValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){},disconnect(){}};}
    createOscillator() {return {frequency:{value:440,setValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){},start(){},stop(){}};}
  }
  window.AudioContext = Context;
  window.webkitAudioContext = Context;
  const synthesis = {speaking:false,pending:false,paused:false,
    getVoices() {return [{name:'Test English',lang:'en-GB',voiceURI:'test-en',localService:true}];},
    speak(u) {this.speaking=true;setTimeout(()=>{if(u.onstart)u.onstart();setTimeout(()=>{this.speaking=false;if(u.onend)u.onend();},20);},0);},
    cancel(){this.speaking=false;},pause(){},resume(){},addEventListener(){},removeEventListener(){}};
  Object.defineProperty(window, 'speechSynthesis', {configurable:true,value:synthesis});
  window.SpeechSynthesisUtterance = function(text){this.text=text;};
  HTMLMediaElement.prototype.play = function () {
    if (String(this.src).startsWith('blob:')) test.replayCalls++;
    setTimeout(() => this.dispatchEvent(new Event('ended')), 20);
    return Promise.resolve();
  };
}

class CDP {
  constructor(ws) {
    this.ws=ws;this.next=0;this.jobs=new Map();
    ws.addEventListener('message',ev=>{
      const msg=JSON.parse(ev.data),job=this.jobs.get(msg.id);
      if(!job)return;this.jobs.delete(msg.id);
      msg.error?job.reject(new Error(msg.error.message)):job.resolve(msg.result||{});
    });
  }
  send(method,params={},sessionId) {
    return new Promise((resolve,reject)=>{
      const id=++this.next;this.jobs.set(id,{resolve,reject});
      this.ws.send(JSON.stringify({id,method,params,sessionId}));
    });
  }
}
const SNAP = "(" + function () {
  function shown(id) {
    const el=document.getElementById(id);
    return !!(el&&!el.hidden&&!el.closest('[hidden]')&&getComputedStyle(el).display!=='none'&&el.getBoundingClientRect().width);
  }
  const api=window.__QM,save=api?.getSave?.(),q=api?.questionSnapshot?.(),test=window.__oralTest;
  const promptBox=document.getElementById('prompt-box'),playScreen=document.getElementById('screen-play');
  const moving=element=>!!element&&element.getAnimations().some(animation=>
    animation.playState==='running'||animation.pending);
  const all={};
  if(save)for(const [key,row]of Object.entries(save.cards||{}))if(row.oralOutput)all[key]=row.oralOutput;
  return {href:location.href,ready:!!(document.documentElement?.classList.contains('session-ok')&&api&&test&&
      document.getElementById('screen-home')&&playScreen&&document.getElementById('prompt-main')&&
      document.getElementById('prompt-label')&&window.QuizMarioAccountStore?.owner),
    timeOrigin:performance.timeOrigin,
    home:!!document.getElementById('screen-home')?.classList.contains('active'),
    play:!!document.getElementById('screen-play')?.classList.contains('active'),
    oral:shown('oral-output'),record:shown('oral-record'),replay:shown('oral-replay'),
    status:document.getElementById('oral-status')?.textContent||'',
    note:document.getElementById('oral-note')?.textContent||'',
    recordText:document.getElementById('oral-record')?.textContent||'',
    label:document.getElementById('prompt-label')?.textContent||'',
    prompt:document.getElementById('prompt-main')?.textContent||'',
    key:q?.item_id,all,card:q&&save?.cards?.[q.item_id],loaded:!!window.QMOralOutput,
    learning:save&&{points:save.points,streak:save.streak,bestStreak:save.bestStreak,practice:save.practice},
    mic:test?.micCalls??0,stopped:test?.stopped??0,replays:test?.replayCalls??0,
    pending:test?.pending?.length??0,recording:test?.recorders?.some(r=>r.state==='recording')??false,
    scriptLoads:performance.getEntriesByType('resource').filter(e=>/oral-output\.js/.test(e.name)).length,
    width:innerWidth,scrollWidth:document.documentElement?.scrollWidth??0,
    cardAnimating:!!promptBox&&(/(?:^|\s)card-(?:enter|exit)(?:\s|$)/.test(promptBox.className)||moving(promptBox)||moving(playScreen)),
    owner:window.QuizMarioAccountStore?.owner?.(),continue:shown('btn-feedback-continue')};
}.toString() + ")()";

function evidence(card) {
  // Sync prunes untouched card shells. Missing and explicitly stored defaults
  // have the same SRS meaning; every non-default field and counter still matters.
  const result=Object.assign(SRS.defaultCardProg(),JSON.parse(JSON.stringify(card||{})));
  delete result.oralOutput;return result;
}
function attemptCount(all) {
  return Object.values(all||{}).reduce((sum,row)=>sum+Object.keys(row.attempts||{}).length,0);
}

async function main() {
  const server=http.createServer((req,res)=>{
    const pathname=new URL(req.url,'http://localhost').pathname;
    const file=path.resolve(root,'.'+decodeURIComponent(pathname));
    if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
    fs.readFile(file,(error,bytes)=>{
      if(error){res.writeHead(404);res.end();return;}
      const types={'.html':'text/html;charset=utf-8','.js':'text/javascript;charset=utf-8','.css':'text/css',
        '.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.webmanifest':'application/manifest+json'};
      res.writeHead(200,{'content-type':types[path.extname(file)]||'application/octet-stream','cache-control':'no-store'});res.end(bytes);
    });
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin='http://127.0.0.1:'+server.address().port;
  const profile=fs.mkdtempSync(path.join(os.tmpdir(),'qm-oral-browser-'));
  const artifacts=process.env.QM_ORAL_SCREENSHOT_DIR||path.join(os.tmpdir(),'quizmario-test-artifacts');
  const chromePath=process.env.CHROME_BIN||['/usr/bin/google-chrome','/usr/bin/chromium'].find(f=>fs.existsSync(f));
  assert.ok(chromePath,'A real Chrome/Chromium browser is required.');
  const chrome=spawn(chromePath,['--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
    '--disable-extensions','--mute-audio','--no-first-run','--remote-debugging-port=0','--remote-allow-origins=*',
    '--user-data-dir='+profile,'about:blank'],{stdio:['ignore','pipe','pipe']});
  let socket;
  try {
    const port=await new Promise((resolve,reject)=>{
      let output='';const timer=setTimeout(()=>reject(new Error('No browser debugging port.')),20000);
      chrome.stderr.on('data',chunk=>{output+=chunk;const match=output.match(/DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)\//);
        if(match){clearTimeout(timer);resolve(Number(match[1]));}});
      chrome.once('exit',code=>{clearTimeout(timer);reject(new Error('Browser exited: '+code));});
    });
    const version=await(await fetch('http://127.0.0.1:'+port+'/json/version')).json();
    socket=new WebSocket(version.webSocketDebuggerUrl);
    await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve);socket.addEventListener('error',reject);});
    const cdp=new CDP(socket),target=await cdp.send('Target.createTarget',{url:'about:blank'});
    const {sessionId}=await cdp.send('Target.attachToTarget',{targetId:target.targetId,flatten:true});
    await cdp.send('Page.enable',{},sessionId);
    await cdp.send('Runtime.enable',{},sessionId);
    await cdp.send('Emulation.setDeviceMetricsOverride',{width:375,height:812,deviceScaleFactor:1,mobile:true},sessionId);
    await cdp.send('Page.addScriptToEvaluateOnNewDocument',{
      source:'('+setupBrowser.toString()+')('+JSON.stringify(session)+','+JSON.stringify(SAVE_KEY)+');'
    },sessionId);
    async function run(expression) {
      const result=await cdp.send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true},sessionId);
      if(result.exceptionDetails)throw new Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text);
      return result.result?.value;
    }
    const snap=()=>run(SNAP);
    async function screenshot(name) {
      fs.mkdirSync(artifacts,{recursive:true});
      const result=await cdp.send('Page.captureScreenshot',{format:'png'},sessionId);
      fs.writeFileSync(path.join(artifacts,name+'.png'),Buffer.from(result.data,'base64'));
    }
    async function diagnoseOverflow() {
      try {
        const details=await run('('+function () {
          const width=innerWidth,round=value=>Math.round(value*100)/100;
          const bounds=element=>{
            const rect=element.getBoundingClientRect(),css=getComputedStyle(element);
            return {tag:element.tagName,id:element.id,classes:String(element.className).slice(0,160),
              parent:element.parentElement&&(element.parentElement.id||element.parentElement.tagName),
              rect:{left:round(rect.left),right:round(rect.right),top:round(rect.top),bottom:round(rect.bottom),width:round(rect.width),height:round(rect.height)},
              scrollWidth:element.scrollWidth,clientWidth:element.clientWidth,
              css:{display:css.display,position:css.position,width:css.width,minWidth:css.minWidth,maxWidth:css.maxWidth,
                overflowX:css.overflowX,whiteSpace:css.whiteSpace,flex:css.flex,transform:css.transform,
                animation:css.animationName,boxSizing:css.boxSizing,padding:css.padding},
              text:(element.textContent||'').replace(/\s+/g,' ').trim().slice(0,80)};
          };
          const overflowing=Array.from(document.body.querySelectorAll('*')).filter(element=>{
            const rect=element.getBoundingClientRect(),css=getComputedStyle(element);
            return rect.width>0&&rect.height>0&&css.display!=='none'&&css.visibility!=='hidden'&&!element.closest('[hidden]')&&
              (rect.right>width+1||rect.left< -1||element.scrollWidth>element.clientWidth+1);
          }).map(bounds);
          overflowing.sort((a,b)=>Math.max(b.rect.right-width,-b.rect.left)-Math.max(a.rect.right-width,-a.rect.left));
          return {width,height:innerHeight,scrollX,scrollY,
            visualViewport:window.visualViewport&&{width:visualViewport.width,height:visualViewport.height,scale:visualViewport.scale},
            root:bounds(document.documentElement),body:bounds(document.body),
            prompt:bounds(document.getElementById('prompt-box')),
            overflowingCount:overflowing.length,overflowing:overflowing.slice(0,20)};
        }.toString()+')()');
        console.error('QM_ORAL_OVERFLOW_DIAGNOSTIC '+JSON.stringify(details));
        const shot=await cdp.send('Page.captureScreenshot',{format:'jpeg',quality:40,fromSurface:true,captureBeyondViewport:false},sessionId);
        fs.mkdirSync(artifacts,{recursive:true});
        fs.writeFileSync(path.join(artifacts,'oral-output-overflow-375.jpg'),Buffer.from(shot.data,'base64'));
        console.error('QM_ORAL_OVERFLOW_JPEG_BASE64_BEGIN\n'+shot.data+'\nQM_ORAL_OVERFLOW_JPEG_BASE64_END');
      } catch(error) {
        console.error('QM_ORAL_OVERFLOW_DIAGNOSTIC_ERROR '+(error.stack||error));
      }
    }
    async function until(predicate,label,timeout=12000) {
      const start=Date.now();let last;
      while(Date.now()-start<timeout){last=await snap();if(await predicate(last))return last;await pause(70);}
      throw new Error('Timed out '+label+': '+JSON.stringify(last));
    }
    async function click(id) {await run("document.getElementById("+JSON.stringify(id)+").click()");}
    async function home() {
      await click('btn-quit');await until(s=>s.home,'home');
      await run("if(!document.getElementById('must-gate').hidden)document.getElementById('btn-must-later').click()");
    }
    async function begin() {await click('btn-continue');return until(s=>s.play&&s.key&&s.record,'meaning card');}

    await cdp.send('Page.navigate',{url:origin+'/grok/index.html'},sessionId);
    await until(s=>s.ready,'authenticated page',30000);
    await click('btn-gate-zhongkao');
    await until(s=>s.home,'course home',20000);
    let state=await begin();
    // Product cardEnter translates +40px for 400ms and clears its class at
    // 420ms; cardExit lasts 280ms. Inspect the settled layout, without disabling
    // animations or changing the horizontal-overflow acceptance threshold.
    await until(s=>!s.cardAnimating,'card entry animation settled');
    await run('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(true))))');
    state=await snap();
    assert.equal(state.loaded,false,'Recording module is not loaded at startup.');
    assert.equal(state.scriptLoads,0,'No eager recording script request.');
    assert.equal(state.mic,0,'No microphone request before a student action.');
    assert.equal(state.width,375);
    if(state.scrollWidth>377)await diagnoseOverflow();
    assert.ok(state.scrollWidth<=377,'The phone page must not scroll horizontally (viewport '+state.width+', scrollWidth '+state.scrollWidth+').');
    assert.match(state.status,/未练/);
    const before=state.card,key=state.key,learningBefore=state.learning;
    await click('oral-record');
    await until(s=>s.recording,'recording started');
    await pause(700);
    await click('oral-record');
    state=await until(s=>attemptCount(s.all)===1,'recording saved');
    assert.match(state.status,/待验证/,'Recording completion must remain unverified.');
    assert.equal(state.replay,true,'Current recording can be replayed.');
    assert.deepEqual(evidence(state.card),evidence(before),'Recording must not change spelling, meaning or SRS evidence.');
    assert.deepEqual(state.learning,learningBefore,'Recording gives no answer counts, points or streak.');
    const attempt=Object.values(state.all[key].attempts)[0];
    assert.equal(attempt.status,'recorded');
    assert.ok(attempt.durationMs>=300&&attempt.durationMs<=9000);
    assert.ok(!('score'in attempt)&&!('accuracy'in attempt),'No fabricated pronunciation score.');
    const disk=await run('JSON.parse(localStorage.getItem('+JSON.stringify(SAVE_KEY)+'))');
    assert.equal(Object.keys(disk.cards[key].oralOutput.attempts).length,1,'Recording metadata is persisted under its owner.');
    assert.ok(!JSON.stringify(disk.cards[key].oralOutput).includes('data:audio'),'Raw audio is not added to cloud progress.');
    await screenshot('oral-output-recorded-375');
    await click('oral-replay');
    await until(s=>s.replays>0,'local replay');
    assert.equal((await snap()).mic,1,'Replay does not request a new recording or assessment.');

    await run("window.__oralTest.mode='reject'");
    await click('oral-record');
    await until(s=>s.mic===2&&!s.recording,'permission denied');
    await pause(120);
    state=await snap();
    assert.equal(attemptCount(state.all),1,'Permission failure cannot create a completed attempt.');
    assert.deepEqual(evidence(state.card),evidence(before),'Permission failure does not lower mastery.');
    assert.deepEqual(state.learning,learningBefore,'Permission failure does not change answer counts or rewards.');
    assert.ok(/麦克风|权限|录音/.test(state.note),'Permission error is visible.');

    await run("window.__oralTest.mode='pending'");
    await click('oral-record');
    await until(s=>s.pending===1,'pending permission before cancel');
    await click('oral-record');
    await run('window.__oralTest.resolveMicrophone()');
    await until(s=>s.pending===0&&s.stopped>=2,'cancelled microphone released');
    state=await snap();
    assert.equal(state.recording,false,'Cancel also handles a permission request that resolves late.');
    assert.equal(attemptCount(state.all),1,'A cancelled permission request creates no attempt.');

    await run("window.__oralTest.mode='pending'");
    await click('oral-record');
    await until(s=>s.pending===1,'pending permission before leaving');
    await home();
    await run('window.__oralTest.resolveMicrophone()');
    await until(s=>s.pending===0&&s.stopped>=3,'late microphone released');
    assert.equal(attemptCount((await snap()).all),1,'Leaving the card invalidates a late recording request.');

    await run("window.__oralTest.mode='normal'");
    state=await begin();
    await click('oral-record');await until(s=>s.recording,'second recording started');
    await pause(700);
    await run('window.__oralTest.stopDelay=1500');
    await click('oral-record');await click('btn-unknown');
    await until(s=>s.continue,'answer revealed');
    await click('btn-feedback-continue');
    await until(s=>s.play&&s.key&&s.key!==state.key,'next card');
    await pause(1600);
    assert.equal(attemptCount((await snap()).all),1,'Late onstop cannot attach the old audio to a new word.');
    await run('window.__oralTest.stopDelay=10');

    await home();await click('btn-spelling');
    state=await until(s=>s.play&&/拼写/.test(s.label),'spelling prompt');
    assert.equal(state.oral,false,'Oral controls must not expose the answer before spelling recall.');
    await screenshot('oral-output-spelling-hidden-375');
    await click('btn-unknown');
    state=await until(s=>s.continue&&s.oral,'spelling answer revealed');
    assert.equal(state.record,true);
    await home();await click('btn-must-practice');
    state=await until(s=>s.play&&/中文/.test(s.label)&&!/拼写/.test(s.label),'Chinese-to-English recall');
    assert.equal(state.oral,false,'Chinese-to-English recall also hides oral controls before reveal.');
    await click('btn-unknown');
    await until(s=>s.continue&&s.oral,'Chinese-to-English answer revealed');

    const recordedBeforeReload=(await snap()).all;
    const oldTimeOrigin=(await snap()).timeOrigin;
    await cdp.send('Page.reload',{},sessionId);
    await until(s=>s.timeOrigin!==oldTimeOrigin&&s.ready,'reloaded authenticated page',30000);
    await click('btn-gate-zhongkao');
    await until(s=>s.home,'reloaded course home',20000);
    state=await begin();
    assert.deepEqual(state.all,recordedBeforeReload,'Recorded metadata survives a reload without duplicate attempts.');
    assert.equal(state.replay,false,'Local-only audio is not presented as available after a reload.');
    assert.equal(state.loaded,false,'Saved recording metadata does not eagerly load the recorder.');
    assert.equal(state.mic,0,'Reloading does not request a microphone.');

    await home();await run("window.__oralTest.mode='pending'");await begin();await click('oral-record');
    await until(s=>s.pending===1,'pending microphone before account change');
    const beforeOther=await run('localStorage.getItem('+JSON.stringify('vocabSpotlight_v1:account:'+OTHER)+')');
    await run('window.QuizMarioAccountStore.activate('+JSON.stringify(OTHER)+');document.documentElement.classList.remove("session-ok");window.__oralTest.resolveMicrophone()');
    await pause(200);
    state=await snap();
    assert.equal(attemptCount(state.all),1,'A pending recording cannot write after its owner changes.');
    assert.equal(await run('localStorage.getItem('+JSON.stringify('vocabSpotlight_v1:account:'+OTHER)+')'),beforeOther,'No record is assigned to the next account.');
    assert.equal(state.recording,false);
    assert.equal(state.replay,false,'Previous account audio is hidden immediately.');

    console.log('PASS oral-output browser: lazy entry, 375px layout, metadata-only persistence, unverified status, replay, permission errors, card/account races and recall gates (simulated audio).');
  } finally {
    if(socket)socket.close();
    chrome.kill('SIGTERM');
    await new Promise(resolve=>server.close(resolve));
    await pause(150);
    fs.rmSync(profile,{recursive:true,force:true,maxRetries:5,retryDelay:100});
  }
}
main().catch(error=>{console.error(error.stack||error);process.exitCode=1;});

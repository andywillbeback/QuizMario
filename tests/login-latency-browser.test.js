'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {startServer,launchChrome,Cdp,earlyScript,SESSION}=require('./speech-browser.test');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const local={track:'gaokao',unlockedLevel:3,levelStars:{1:2},trackUnlock:{gaokao:3},trackStars:{gaokao:{1:2}},profile:{name:'测速同学',cls:'虚构测速班'},cards:{'gaokao|0::evidence':{correct:7,wrong:1,reps:3,state:'review',interval:2,mastery:2}},updatedAt:'2026-11-09T08:00:00Z'};
const remote={...local,track:'ielts',unlockedLevel:1,levelStars:{},trackUnlock:{gaokao:4,ielts:1},trackStars:{gaokao:{1:3}},cards:{'gaokao|0::evidence':{...local.cards['gaokao|0::evidence'],correct:9}},updatedAt:'2026-11-09T08:01:00Z'};
const extra=`(() => {
 const key='vocabSpotlight_v1:account:'+${JSON.stringify(SESSION.user.id)};
 if(sessionStorage.getItem('latency-first-device'))localStorage.removeItem(key);
 else if(!localStorage.getItem(key))localStorage.setItem(key,${JSON.stringify(JSON.stringify(local))});
 localStorage.setItem('vocabSpotlight_v1:account:foreign-fixture',JSON.stringify({profile:{name:'其他测试账号',cls:'虚构班级'},points:99999}));
 window.__LATENCY_RELEASE=null;window.__LATENCY_WRITES=[];window.__LATENCY_REQUEST_AT=null;
 Math.random=()=>.99;
 const native=window.fetch.bind(window);let held=false;
 window.fetch=function(input,init){
  const url=typeof input==='string'?input:input.url,method=(init&&init.method||'GET').toUpperCase();
  if(url.includes('/user_progress')&&['POST','PATCH'].includes(method))window.__LATENCY_WRITES.push(JSON.parse(init.body));
  if(url.includes('/user_progress')&&method==='GET'&&!held){
   held=true;window.__LATENCY_REQUEST_AT=performance.now();
   return new Promise((resolve,reject)=>{window.__LATENCY_RELEASE=()=>native(input,init).then(resolve,reject);});
  }
  return native(input,init);
 };
})();`;
(async()=>{
 const server=await startServer(),origin='http://127.0.0.1:'+server.address().port;
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'qm-login-latency-')),launched=launchChrome(profile);
 let ws;const artifacts=path.join(os.tmpdir(),'quizmario-test-artifacts','login-latency-browser.test.js');fs.mkdirSync(artifacts,{recursive:true});
 try{
  const port=await launched.port,version=await(await fetch('http://127.0.0.1:'+port+'/json/version')).json();
  ws=new WebSocket(version.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.addEventListener('open',r);ws.addEventListener('error',j);});
  const cdp=new Cdp(ws),{targetId}=await cdp.send('Target.createTarget',{url:'about:blank'});
  const {sessionId}=await cdp.send('Target.attachToTarget',{targetId,flatten:true});
  const send=(m,p)=>cdp.send(m,p,sessionId);
  async function evaluate(expression){const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result?.value;}
  async function wait(expr,label,timeout=20000){const start=Date.now();while(Date.now()-start<timeout){if(await evaluate(expr))return;await sleep(50);}throw Error('Timed out: '+label);}
  const click=id=>evaluate(`document.getElementById(${JSON.stringify(id)}).click()`);
  await send('Page.enable');await send('Runtime.enable');await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await send('Page.addScriptToEvaluateOnNewDocument',{source:earlyScript(remote)+extra});
  await send('Page.navigate',{url:origin+'/grok/index.html'});
  await wait(`typeof __LATENCY_RELEASE==='function'`,'held first progress read');
  await wait(`document.documentElement.classList.contains('session-ok')`,'owned cache becomes usable without the server response',2000);
  const timing=await evaluate(`({unblockedMs:performance.now()-__LATENCY_REQUEST_AT,checking:QuizMarioCloud.syncState().checking,label:document.getElementById('sync-status').textContent})`);
  assert.equal(timing.checking,true);assert.ok(!timing.label.includes('已自动同步'));
  assert.equal(await evaluate(`__QM.getSave().cards['gaokao|0::evidence'].correct`),7);
  assert.equal(await evaluate(`__LATENCY_WRITES.length`),0);
  const screenshot=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(artifacts,'fast-entry-checking.png'),Buffer.from(screenshot.data,'base64'));
  await evaluate('__LATENCY_RELEASE()');await wait(`!QuizMarioCloud.syncState().checking`,'background baseline');
  assert.equal(await evaluate('__QM.track'),'gaokao','background read keeps the visible course');
  assert.equal(await evaluate('__QM.getSave().unlockedLevel'),4,'unlock belongs to the visible course, not the remote-selected IELTS course');
  assert.equal(await evaluate(`__QM.getSave().cards['gaokao|0::evidence'].correct`),9);

  // Actual IELTS answers remain usable and durable while a new baseline waits.
  await send('Page.navigate',{url:origin+'/grok/index.html'});
  await wait(`typeof __LATENCY_RELEASE==='function'&&document.documentElement.classList.contains('session-ok')`,'returning session');
  await click('btn-gate-ielts');await wait(`__QM.track==='ielts'&&document.getElementById('screen-home').classList.contains('active')`,'IELTS home during background check');
  await click('btn-continue');await wait(`document.querySelectorAll('#choices .choice').length===4`,'IELTS question');
  for(let attempt=0;attempt<3;attempt++){
   assert.ok(await evaluate(`(() => {const word=document.getElementById('prompt-main').textContent.trim(),card=__QM.levels.flat().find(c=>c.word===word);const b=card&&[...document.querySelectorAll('#choices .choice')].find(b=>b.textContent===card.meaning_zh);if(!b)return false;b.click();return true;})()`));
   await sleep(100);if(await evaluate(`!!document.getElementById('btn-rate-good')`))break;
  }
  await wait(`!!document.getElementById('btn-rate-good')`,'collocation completed');await click('btn-rate-good');
  const learned=await evaluate(`Object.entries(__QM.getSave().cards).filter(([k,c])=>k.startsWith('ielts|')&&(c.correct>0||c.collocationEvidence?.correct>0)).map(([k,c])=>({key:k,correct:c.correct||0,collocationCorrect:c.collocationEvidence?.correct||0}))`);
  assert.ok(learned.length>=2);assert.ok(await evaluate('QuizMarioCloud.syncState().pending'));
  assert.equal(await evaluate('__LATENCY_WRITES.length'),0,'progress upload cannot race the missing baseline');
  await evaluate('__LATENCY_RELEASE()');
  await wait(`!QuizMarioCloud.syncState().checking&&!QuizMarioCloud.syncState().pending&&__LATENCY_WRITES.length>0`,'durable practice rebased and acknowledged');
  assert.equal(await evaluate('__QM.track'),'ielts');assert.ok(await evaluate(`document.getElementById('screen-play').classList.contains('active')`),'background sync keeps the ongoing exercise');
  for(const row of learned){
   assert.equal(await evaluate(`__QM.getSave().cards[${JSON.stringify(row.key)}].correct||0`),row.correct);
   assert.equal(await evaluate(`__QM.getSave().cards[${JSON.stringify(row.key)}].collocationEvidence?.correct||0`),row.collocationCorrect);
  }
  assert.equal(await evaluate(`__QM.getSave().cards['gaokao|0::evidence'].correct`),9);
  const delivered=await evaluate('__LATENCY_WRITES.at(-1).save');
  for(const row of learned){assert.equal(delivered.cards[row.key].correct||0,row.correct);assert.equal(delivered.cards[row.key].collocationEvidence?.correct||0,row.collocationCorrect);}

  // First device: a foreign cache cannot replace the absent own baseline.
  await evaluate(`sessionStorage.setItem('latency-first-device','1')`);await send('Page.navigate',{url:origin+'/grok/index.html'});
  await wait(`typeof __LATENCY_RELEASE==='function'`,'first-device read');await sleep(200);
  assert.equal(await evaluate(`document.documentElement.classList.contains('session-ok')`),false);
  assert.ok(!(await evaluate(`JSON.stringify(__QM.getSave())`)).includes('其他测试账号'));
  await evaluate('__LATENCY_RELEASE()');await wait(`document.documentElement.classList.contains('session-ok')`,'first-device validated baseline');
  fs.writeFileSync(path.join(artifacts,'verification.json'),JSON.stringify({timing,learned,checks:['cached entry before baseline','truthful pending status','course-specific unlock','IELTS answers during baseline read','no premature progress upload','exact acknowledged counts','exercise continuity','foreign cache rejection','first-device baseline gate']},null,2));
  console.log('login-latency-browser ok: owned-cache gate opened '+Math.round(timing.unblockedMs)+' ms after the held request; background reconciliation and first-device isolation passed');
 }finally{
  if(ws)ws.close();if(launched.chrome.exitCode===null&&launched.chrome.signalCode===null){const closed=new Promise(r=>launched.chrome.once('close',r));launched.chrome.kill('SIGKILL');await closed;}
  server.closeAllConnections();await new Promise(r=>server.close(r));fs.rmSync(profile,{recursive:true,force:true,maxRetries:5,retryDelay:100});
 }
})().catch(e=>{console.error(e);process.exitCode=1;});

'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {startServer,launchChrome,Cdp,earlyScript,SESSION}=require('./speech-browser.test');
const bank=require('../grok/data/ielts-v1/bank.json');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const fixture={track:'gaokao',unlockedLevel:3,levelStars:{1:2},profile:{name:'',cls:''},cards:{'gaokao|0::evidence':{state:'review',reps:3,correct:7,wrong:1,interval:2,mastery:2}},trackUnlock:{gaokao:3},trackStars:{gaokao:{1:2}},updatedAt:'2026-11-09T00:00:00Z'};
const extra=`(() => {
  const storageKey='vocabSpotlight_v1:account:'+${JSON.stringify(SESSION.user.id)};
  if(!localStorage.getItem(storageKey))localStorage.setItem(storageKey,${JSON.stringify(JSON.stringify(fixture))});
  window.__IELTS_UPLOADS=[];window.__IELTS_REQUESTS=0;window.__IELTS_HOLD=true;window.__IELTS_RELEASE=null;
  Math.random=()=>.99;
  const original=window.fetch.bind(window);
  window.fetch=function(input,init){
    const url=typeof input==='string'?input:input.url;
    const method=(init&&init.method||'GET').toUpperCase();
    if(url.includes('/user_progress')&&['POST','PATCH'].includes(method))window.__IELTS_UPLOADS.push(JSON.parse(init.body));
    if(url.includes('data/banks/20261113-set1/ielts/000.json') || url.includes('ielts-v1/bank.json')){
      window.__IELTS_REQUESTS++;
      if(window.__IELTS_HOLD)return new Promise((resolve,reject)=>{window.__IELTS_RELEASE=()=>original(input,init).then(resolve,reject);});
    }
    return original(input,init);
  };
})();`;

(async()=>{
  const server=await startServer(),origin='http://127.0.0.1:'+server.address().port;
  const launched=launchChrome(fs.mkdtempSync(path.join(os.tmpdir(),'qm-ielts-')));
  let cdp,ws;
  const artifacts=path.join(os.tmpdir(),'quizmario-test-artifacts','ielts-browser.test.js');fs.mkdirSync(artifacts,{recursive:true});
  try{
    const port=await launched.port,version=await(await fetch('http://127.0.0.1:'+port+'/json/version')).json();
    ws=new WebSocket(version.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.addEventListener('open',r);ws.addEventListener('error',j);});cdp=new Cdp(ws);
    const created=await cdp.send('Target.createTarget',{url:'about:blank'});
    const {sessionId}=await cdp.send('Target.attachToTarget',{targetId:created.targetId,flatten:true});
    const send=(method,params)=>cdp.send(method,params,sessionId);
    const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result?.value;};
    async function wait(expression,label,ms=20000){const start=Date.now();let last;while(Date.now()-start<ms){last=await evaluate(expression);if(last)return last;await sleep(80);}throw Error('Timed out: '+label+'; last='+JSON.stringify(last));}
    async function shot(name){const r=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(artifacts,name+'.png'),Buffer.from(r.data,'base64'));}
    const click=id=>evaluate(`document.getElementById(${JSON.stringify(id)}).click()`);
    const home=()=>wait(`document.getElementById('screen-home').classList.contains('active')`,'home');
    await send('Page.enable',{});await send('Runtime.enable',{});
    await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
    await send('Page.addScriptToEvaluateOnNewDocument',{source:earlyScript(fixture)+extra});
    await send('Page.navigate',{url:origin+'/grok/index.html'});
    await wait(`window.__QM&&document.documentElement.classList.contains('session-ok')`,'account ready');
    assert.equal(await evaluate('window.__IELTS_REQUESTS'),0,'school entry does not fetch IELTS content');
    await click('btn-gate-ielts');
    await wait(`document.getElementById('profile-name-gate')&&!document.getElementById('profile-name-gate').hidden`,'IELTS identity guard');
    assert.equal(await evaluate('window.__IELTS_REQUESTS'),0,'profile guard precedes IELTS download');
    await evaluate(`document.getElementById('profile-name-input').value='验收同学';document.getElementById('profile-class-input').value='虚构雅思班';document.getElementById('profile-name-form').requestSubmit()`);
    await wait(`document.getElementById('profile-name-gate').hidden`,'profile saved');
    await evaluate(`window.__savedIeltsLoader=window.QuizMarioIelts;window.QuizMarioIelts=null;window.__savedBanks=window.QuizMarioBanks;window.QuizMarioBanks=null`);
    assert.equal(await evaluate(`__QM.switchTrack('ielts')`),false,'a missing component cannot fall back to school data');
    assert.equal(await evaluate(`__QM.track`),'gaokao');
    assert.ok((await evaluate(`document.getElementById('gate-load-status').textContent`)).includes('组件未加载'));
    await evaluate(`window.QuizMarioIelts=window.__savedIeltsLoader;window.QuizMarioBanks=window.__savedBanks`);
    await send('Emulation.setDeviceMetricsOverride',{width:1366,height:900,deviceScaleFactor:1,mobile:false});await sleep(300);await shot('desktop-gate');
    assert.ok(await evaluate(`[...document.querySelectorAll('.gate-actions button')].every(b=>{const r=b.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.bottom<=innerHeight})`),'desktop gate fits');
    await send('Emulation.setDeviceMetricsOverride',{width:375,height:667,deviceScaleFactor:1,mobile:true});await sleep(300);await shot('compact-gate');
    assert.ok(await evaluate(`[...document.querySelectorAll('.gate-actions button')].every(b=>{const r=b.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.bottom<=innerHeight})`),'compact phone gate fits');
    await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await sleep(200);
    await shot('mobile-gate');

    // A slow IELTS selection cannot override a later school selection.
    await click('btn-gate-ielts');await wait(`typeof window.__IELTS_RELEASE==='function'`,'deferred bank request');
    await click('btn-gate-gaokao');await home();
    await evaluate(`window.__IELTS_HOLD=false;window.__IELTS_RELEASE()`);
    await wait(`window.QuizMarioIelts.track.loaded`,'bank loaded');
    assert.equal(await evaluate('__QM.track'),'gaokao','late completion cannot select IELTS after a later click');
    await click('btn-back-gate');await click('btn-gate-ielts');await home();
    assert.equal(await evaluate('__QM.track'),'ielts');
    assert.equal(await evaluate('__QM.levels.length'),bank.sets.length);
    assert.equal(await evaluate(`Object.keys(__QM.getSave().cards).filter(k=>k.startsWith('ielts|')).length`),0,'opening IELTS does not store an untouched card for every entry');
    assert.equal(String(await evaluate(`document.getElementById('sync-status').textContent`)).includes('本机保存失败'),false);
    assert.equal(await evaluate('__IELTS_REQUESTS'),1,'loaded bank is reused');
    assert.equal(await evaluate(`__QM.getSave().cards['gaokao|0::evidence'].correct`),7,'school progress survives');
    assert.equal(await evaluate(`__QM.getSave().trackUnlock.gaokao`),3);
    assert.equal(await evaluate(`document.getElementById('btn-polysemy').hidden`),false);
    await shot('mobile-home');

    // Actual choice -> collocation -> SRS rating, on the same shared game.
    await click('btn-continue');
    await wait(`document.querySelectorAll('#choices .choice').length===4`,'meaning choices');
    for(let i=0;i<3;i++){
      const graded=await evaluate(`(() => {
        const prompt=document.getElementById('prompt-main').textContent.trim();
        const card=__QM.levels.flat().find(c=>c.word===prompt);if(!card)return false;
        const b=[...document.querySelectorAll('#choices .choice')].find(x=>x.textContent===card.meaning_zh);if(!b)return false;b.click();return true;
      })()`);assert.ok(graded,'the displayed card has one exact correct option');
      await sleep(120);
      if(await evaluate(`!!document.getElementById('btn-rate-good')`))break;
    }
    await wait(`!!document.getElementById('btn-rate-good')`,'SRS rating after collocation');await shot('mobile-answer');
    await click('btn-rate-good');await sleep(150);await click('btn-quit');await home();
    const practiced=await evaluate(`Object.entries(__QM.getSave().cards).filter(([k,c])=>k.startsWith('ielts|')&&(c.correct||c.wrong||c.collocationEvidence)).map(([k,c])=>[k,c.correct||0,c.wrong||0,c.collocationEvidence])`);
    assert.ok(practiced.length>=2,'lemma and collocation evidence both recorded');
    assert.ok(practiced.some(r=>r[1]>0),'recognition answer counted');

    // Two real typed misses on the same deterministic new card -> notebook.
    let missWord;
    for(let turn=0;turn<2;turn++){
      await click('btn-spelling');await wait(`!document.getElementById('type-row').hidden&&!document.getElementById('answer-input').disabled`,'typed IELTS spelling');
      if(turn===0){
        const entered=await evaluate(`document.getElementById('prompt-main').textContent`);
        await sleep(1100);
        assert.equal(await evaluate(`document.getElementById('prompt-main').textContent`),entered,'feedback from a departed session cannot skip a card in the new session');
      }
      const word=await evaluate(`(() => {const gloss=document.getElementById('prompt-main').textContent.trim();const hint=document.getElementById('prompt-hint').textContent;return __QM.levels[0].find(c=>c.meaning_zh===gloss&&hint.includes(QuizMarioCloze.blankExample(c.example_en,c.word)))?.word;})()`);
      assert.ok(word,'typed question resolves to its source card');if(missWord)assert.equal(word,missWord);else missWord=word;
      await evaluate(`document.getElementById('answer-input').value='deliberatelywrong';document.getElementById('btn-check-spelling').click()`);
      await wait(`!!document.getElementById('btn-feedback-continue')`,'spelling feedback');
      await click('btn-quit');await home();
    }
    const wrong=await evaluate(`Object.values(__QM.getSave().wrongBook).find(r=>r.track==='ielts'&&r.lemma===${JSON.stringify(missWord)})`);
    assert.ok(wrong&&wrong.active,'repeated IELTS errors automatically enter the personal notebook');

    // Manual additions remain notes rather than manufactured wrong answers.
    await click('btn-notebook');
    const wrongBefore=await evaluate(`Object.values(__QM.getSave().cards).reduce((n,c)=>n+(c.wrong||0)+(c.spelling?.wrong||0),0)`);
    await evaluate(`document.getElementById('notebook-word').value='resilience';document.getElementById('notebook-note').value='仅用于自动验收的虚构笔记';document.getElementById('notebook-form').requestSubmit()`);
    assert.ok(await evaluate(`Object.values(__QM.getSave().wrongBook).some(r=>r.track==='ielts'&&r.lemma==='resilience'&&r.note==='仅用于自动验收的虚构笔记')`));
    assert.equal(await evaluate(`Object.values(__QM.getSave().cards).reduce((n,c)=>n+(c.wrong||0)+(c.spelling?.wrong||0),0)`),wrongBefore);
    assert.ok((await evaluate(`document.getElementById('notebook-list').textContent`)).includes('雅思'));
    await shot('mobile-notebook');await click('notebook-close');
    await click('btn-must-practice');await wait(`document.getElementById('screen-play').classList.contains('active')&&document.querySelectorAll('#choices .choice').length===4`,'IELTS due/notebook queue');
    await click('btn-quit');await home();
    await click('btn-polysemy');await wait(`document.getElementById('prompt-hint').textContent.includes('一词多义')&&document.querySelectorAll('#choices .choice').length===4`,'IELTS polysemy');
    await sleep(750);await shot('mobile-polysemy');
    const sense=await evaluate(`(() => {
      const word=document.getElementById('prompt-main').textContent.trim();
      for(let i=0;i<__QM.levels.length;i++){
        const card=__QM.levels[i].find(c=>c.word===word);if(!card)continue;
        const key='ielts|'+i+'::'+word,p=__QM.getSave().cards[key]||{};
        return {key,correct:QuizMarioPolysemy.optionSet(card).correct,before:p.polysemy?.correct||0,srs:JSON.stringify([p.reps,p.interval,p.due,p.mastery])};
      }
    })()`);
    assert.ok(sense,'polysemy context resolves to an anchored source sense');
    assert.ok(await evaluate(`(() => {const b=[...document.querySelectorAll('#choices .choice')].find(x=>x.textContent===${JSON.stringify(sense.correct)});if(!b)return false;b.click();return true;})()`));
    await wait(`!!document.getElementById('btn-rate-good')`,'polysemy feedback');await click('btn-rate-good');
    assert.equal(await evaluate(`__QM.getSave().cards[${JSON.stringify(sense.key)}].polysemy.correct`),sense.before+1,'polysemy has its own evidence');
    assert.equal(await evaluate(`(() => {const p=__QM.getSave().cards[${JSON.stringify(sense.key)}];return JSON.stringify([p.reps,p.interval,p.due,p.mastery]);})()`),sense.srs,'polysemy cannot advance recognition clearance or its SRS');
    await click('btn-quit');await home();
    await click('btn-challenge');await wait(`document.getElementById('screen-play').classList.contains('active')`,'challenge');
    assert.equal(await evaluate('__QM.challengeMs'),720000);assert.ok(await evaluate('__QM.debugExpireChallenge()'));
    await wait(`document.getElementById('screen-fail').classList.contains('active')`,'challenge expiry');await click('btn-fail-home');await home();
    await wait(`window.__IELTS_UPLOADS.some(r=>r.save&&Object.keys(r.save.cards||{}).some(k=>k.startsWith('ielts|'))&&r.save.wrongBook&&Object.values(r.save.wrongBook).some(n=>n.track==='ielts'))`,'IELTS save delivered to backend transport');
    assert.ok(await evaluate(`window.__QM_AUDIO.some(x=>/01_first_blood/.test(x))`),'original kill voice is requested');
    assert.ok(await evaluate(`window.__QM_SPOKEN.some(x=>x.text)`),'shared teaching pronunciation is used');
    assert.ok(await evaluate(`document.documentElement.scrollWidth<=innerWidth+1`),'mobile home has no horizontal overflow');
    const recorded=await evaluate(`({track:__QM.track,uploads:__IELTS_UPLOADS.length,streakAudio:__QM_AUDIO,spellingMiss: ${JSON.stringify(missWord)}})`);

    // New document, own saved evidence, explicit IELTS unit membership.
    await send('Page.navigate',{url:origin+'/grok/word-universe.html?track=ielts&set=1&view=list'});
    await wait(`typeof window.__IELTS_RELEASE==='function'`,'universe lazy load');await evaluate(`window.__IELTS_HOLD=false;window.__IELTS_RELEASE()`);
    await wait(`window.QuizMarioWordUniverse.currentGraph&&QuizMarioWordUniverse.currentGraph()?.trackId==='ielts'`,'IELTS universe');
    const graph=await evaluate(`({track:QuizMarioWordUniverse.currentGraph().trackId,count:QuizMarioWordUniverse.currentGraph().stats.bankLemmas})`);
    assert.equal(graph.count,bank.sets[0].length);await shot('mobile-universe');
    assert.ok(await evaluate(`document.documentElement.scrollWidth<=innerWidth+1`),'universe fits mobile');
    fs.writeFileSync(path.join(artifacts,'verification.json'),JSON.stringify({recorded,graph,checks:['lazy load','profile gate','selection race','school progress','recognition','collocation','SRS','typed spelling','automatic notebook','manual notebook','review queue','polysemy','challenge','speech','kill audio','backend payload','universe']},null,2));
    console.log('ielts-browser ok: shared flows, component failure and three viewport sizes passed; artifacts '+artifacts);
  }finally{if(ws)ws.close();launched.chrome.kill('SIGKILL');server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

/* Account-owned durable progress journals, retry and compare-and-swap cloud saves.
 * A network acknowledgement, not a timer, determines 已同步.
 */
(function () {
  'use strict';
  var CLIENT=window.QuizMarioCloudClient, CORE=window.QuizMarioSyncCore, STORE=window.QuizMarioAccountStore;
  var SAVE_KEY='vocabSpotlight_v1', JOURNAL='quizmario-progress-pending-v2';
  var user=null, ready=false, epoch=0, stopped=false, running=false, booting=false;
  var observedAuthOwner;
  var timer=null, retry=0, journal=null, remote=null, localBase=null, lastAck='', networkBootPending=true, hadOwnedCache=false;
  var writer=CORE && CORE.id(), writeSeq=0, heartbeat=null, storageError='', storageFailures={};
  function savedLocally(kind,error){if(error)storageFailures[kind]=String(error.message||error);else delete storageFailures[kind];storageError=Object.keys(storageFailures).map(function(k){return storageFailures[k];}).join('; ');}
  function $(id){return document.getElementById(id);}
  function owned(id,token){return !stopped && user && user.id===id && token===epoch &&
    (!window.__QM_ENTRY_SESSION||(window.__QM_ENTRY_AUTH_READY&&window.__QM_ENTRY_OWNER===id));}
  function startupStatus(phase,message,failed){
    if(stopped||window.__QM_ENTRY_REDIRECTING)return;
    window.__QM_ENTRY_PHASE=phase;
    if(window.__QM_ENTRY_STATUS)window.__QM_ENTRY_STATUS(message,failed);
    else{var hold=$('auth-hold');if(hold)hold.textContent=message;}
  }
  function hideApp(){
    window.__QM_SYNC_READY=false;window.__QM_ENTRY_PROGRESS=null;
    document.documentElement.classList.remove('session-ok');
  }
  function setStatus(text,detail){var el=$('sync-status');if(!el)return;el.textContent=text;el.title=detail||'';el.classList.toggle('is-error',/失败|待恢复|空间不足/.test(text));}
  function renderStatus(){
    if(!user)return;
    var ev=window.QuizMarioLearnerEvents, signals=ev&&ev.syncState?ev.syncState():{};
    var pending=!!(journal&&journal.desired), n=signals.pending||0;
    var localDetail=storageError||signals.localError||'';
    var cloudTrouble=!!(retry||(signals.error&&signals.error!==signals.localError));
    if(localDetail){
      var acknowledged=ready&&!networkBootPending&&!pending&&!n&&!running&&!!lastAck&&!cloudTrouble;
      if(acknowledged){setStatus('已自动同步'+(lastAck?' · '+new Date(lastAck).toLocaleTimeString():'')+' · 本机未再写入',localDetail);return;}
      if(!navigator.onLine){setStatus('进度在本页 · 请保持页面打开，联网后自动同步',localDetail);return;}
      setStatus('进度已保留 · 正在同步到云端',localDetail);return;
    }
    if(!navigator.onLine){setStatus('离线 · 本机保留，联网后自动补传',user.email||'');return;}
    if(!ready){setStatus('正在读取本账号进度 · 自动重试中',user.email||'');return;}
    if(retry||signals.error){setStatus('自动同步待恢复 · 记录已保留',signals.error||'连接恢复后自动重试');return;}
    if(networkBootPending){setStatus('本机记录已恢复 · 正在核对后台',user.email||'');return;}
    if(pending||n||running){setStatus('自动同步中'+(n?' · '+n+' 条学习记录待确认':''),user.email||'');return;}
    setStatus('已自动同步'+(lastAck?' · '+new Date(lastAck).toLocaleTimeString():''),user.email||'');
  }
  function revealApp(){
    if(!user||stopped||window.__QM_ENTRY_REDIRECTING)return;
    if(window.__QM_ENTRY_SESSION&&(!window.__QM_ENTRY_AUTH_READY||window.__QM_ENTRY_OWNER!==user.id))return;
    window.__QM_SYNC_READY=true;clearTimeout(window.__QM_ENTRY_WATCHDOG);
    startupStatus('ready','学习页面已就绪。',false);
    document.documentElement.classList.add('session-ok');
    try{window.dispatchEvent(new CustomEvent('quizmario:session-ready'));}catch(_){}
  }
  function sendToLogin(){hideApp();window.__QM_ENTRY_REDIRECTING=true;location.replace('login.html'+(window.__QM_AUTH_PENDING?((location.search||'')+(location.hash||'')):''));}
  function renderAccount(){var out=$('btn-logout'),wipe=$('wipe-label'),link=$('login-link'),cta=$('login-cta');if(out)out.hidden=!user;if(wipe)wipe.hidden=!user;if(link)link.hidden=!!user;if(cta)cta.hidden=true;}
  function readJSON(key){try{return JSON.parse(STORE.raw.getItem(key)||'null');}catch(_){return null;}}
  function reclaimOwnCache(){
    if(!user||!STORE||!CORE)return false;
    var raw;
    try{raw=STORE.get(SAVE_KEY,user.id);}catch(_){return false;}
    if(!raw||raw.length<100000)return false;
    try{
      var small=JSON.stringify(CORE.compact(JSON.parse(raw)));
      if(!small||small.length>=raw.length)return false;
      STORE.set(SAVE_KEY,small,user.id);
      return true;
    }catch(_){return false;}
  }
  function putAccount(base,value,id){
    try{STORE.set(base,value,id);return;}
    catch(first){
      if(reclaimOwnCache()){try{STORE.set(base,value,id);return;}catch(second){throw second;}}
      throw first;
    }
  }
  function putRaw(key,value){
    try{STORE.raw.setItem(key,value);return;}
    catch(first){
      if(reclaimOwnCache()){try{STORE.raw.setItem(key,value);return;}catch(second){throw second;}}
      throw first;
    }
  }
  function cache(save,id){try{putAccount(SAVE_KEY,JSON.stringify(CORE.compact(save)),id);savedLocally('cache');}catch(e){savedLocally('cache',e);}}
  function persistJournal(j){
    j.touched=Date.now();
    try{putRaw(STORE.key(JOURNAL,j.owner)+':'+j.writer,JSON.stringify(j));savedLocally('journal');}
    catch(e){savedLocally('journal',e);}
  }
  function dropJournal(j){try{STORE.raw.removeItem(STORE.key(JOURNAL,j.owner)+':'+j.writer);}catch(_){} }
  function recordDesired(save){
    if(!user||!ready||stopped)return;
    var target=CORE.compact(save||window.__QM.getSave());
    var merge=window.QuizMarioMerge, profile=target.profile||{};
    if(merge && merge.isBlank(target) && !(profile.name && profile.cls))return;
    if(!journal){journal={v:2,owner:user.id,writer:writer,seq:writeSeq,base:CORE.clone(localBase||target),desired:target};}
    else journal.desired=target;
    persistJournal(journal);cache(target,user.id);renderStatus();schedule(1200);
  }
  function onLocalSave(save){recordDesired(save);}
  function schedule(ms){if(timer||stopped||!user)return;timer=setTimeout(function(){timer=null;flushNow();},ms);}
  function client(){return CLIENT&&CLIENT.client();}
  async function readRemote(owner){
    var early=window.__QM_ENTRY_PROGRESS,res;
    if(early&&early.owner===owner&&!early.used){
      early.used=true;
      var outcome=await early.promise;
      if(window.__QM_ENTRY_PROGRESS===early)window.__QM_ENTRY_PROGRESS=null;
      if(outcome.error)throw outcome.error;
      res=outcome.response;
    }else res=await CORE.request(client().from('user_progress').select('save,updated_at').eq('user_id',owner).maybeSingle());
    if(!res||typeof res!=='object')throw new Error('后台进度响应未通过校验');
    if(res.error)throw res.error;return res.data||null;
  }
  function receipt(row,j){var receipts=row&&row.save&&row.save._syncReceipts;return !!(j.attempt&&receipts&&Number(receipts[j.writer])>=j.attempt.seq);}
  async function commitJournal(j,token){
    var owner=j.owner;
    if(!j.attempt){j.seq=(j.seq||0)+1;if(j.writer===writer)writeSeq=j.seq;j.attempt={seq:j.seq,base:CORE.clone(j.base||{}),target:CORE.clone(j.desired)};persistJournal(j);}
    var row=remote&&remote.owner===owner?remote.row:await readRemote(owner);
    for(var tries=0;tries<6;tries++){
      if(!owned(owner,token))throw new Error('account_changed');
      if(receipt(row,j))return row;
      var payload=CORE.reconcile(j.attempt.base,j.attempt.target,row&&row.save||{});
      payload._syncReceipts=Object.assign({},row&&row.save&&row.save._syncReceipts||{});
      payload._syncReceipts[j.writer]=j.attempt.seq;
      var query;
      if(row){query=client().from('user_progress').update({save:payload}).eq('user_id',owner).eq('updated_at',row.updated_at).select('save,updated_at').maybeSingle();}
      else query=client().from('user_progress').insert({user_id:owner,save:payload}).select('save,updated_at').maybeSingle();
      var result=await CORE.request(query);
      if(result.error&&result.error.code!=='23505')throw result.error;
      if(result.data&&!result.error){
        if(Array.isArray(result.data) || !result.data.save || typeof result.data.save!=='object' || Array.isArray(result.data.save) || !result.data.updated_at || !receipt(result.data,j))throw new Error('后台确认格式未通过校验，待传记录已保留');
        return result.data;
      }
      row=await readRemote(owner);
    }
    throw new Error('其他页面也在同步，记录已保留并将自动重试');
  }
  async function finishJournal(j,row,token,isCurrent){
    if(!owned(j.owner,token))return;
    remote={owner:j.owner,row:row};
    var latest=isCurrent?journal:(readJSON(STORE.key(JOURNAL,j.owner)+':'+j.writer)||j);
    if(!isCurrent && latest && !latest.attempt)latest.attempt=j.attempt;
    if(!latest||!latest.attempt)return;
    var desired=CORE.reconcile(latest.attempt.target,latest.desired,row.save||{});
    var clean=CORE.equal(CORE.compact(desired),CORE.compact(row.save));
    latest.base=CORE.compact(row.save);latest.desired=desired;delete latest.attempt;
    if(isCurrent){
      localBase=CORE.compact(row.save);
      if(window.__QM&&typeof window.__QM.applySyncedSave==='function')window.__QM.applySyncedSave(desired);
      cache(window.__QM.getSave(),j.owner);
      if(clean){dropJournal(latest);journal=null;}else persistJournal(latest);
    }else{
      if(clean)dropJournal(latest);else persistJournal(latest);
      if(ready && !journal){localBase=CORE.compact(row.save);if(window.__QM.applySyncedSave)window.__QM.applySyncedSave(row.save);cache(window.__QM.getSave(),j.owner);}
    }
    lastAck=row.updated_at;retry=0;
  }
  async function recover(owner,token){
    var keys=STORE.keys(JOURNAL,owner);
    for(var i=0;i<keys.length;i++){
      var old=readJSON(keys[i]);
      if(!old||old.owner!==owner||old.writer===writer||!old.desired)continue;
      // A live page refreshes its lease every 10s. Do not steal a live writer.
      if(!old.released && Date.now()-Number(old.touched||0)<45000)continue;
      var result=await commitJournal(old,token);
      await finishJournal(old,result,token,false);
    }
  }
  async function flushNow(){
    if(stopped||!user||running)return;
    if(timer){clearTimeout(timer);timer=null;}
    if(!navigator.onLine){renderStatus();return;}
    if(!ready || networkBootPending){return boot();}
    running=true;renderStatus();var owner=user.id,token=epoch;
    try{
      if(journal){var current=journal;var result=await commitJournal(current,token);await finishJournal(current,result,token,true);}
      await recover(owner,token);
      retry=0;
    }catch(e){
      if(owned(owner,token)){remote=null;retry=Math.min(retry+1,5);schedule(Math.min(30000,1000*Math.pow(2,retry)));}
    }finally{
      running=false;
      if(owned(owner,token)){renderStatus();if(journal&&!timer)schedule(1200);}
    }
  }
  function stampIdentity(cloud){
    var api=window.QuizMarioProfileName,qm=window.__QM;
    if(!api||!user||!qm||!api.pickProfile)return;
    var picked=api.pickProfile(qm.getSave(),cloud,user),cur=api.readProfile(qm.getSave());
    if((picked.name||cur.name)!==cur.name||(picked.cls||cur.cls)!==cur.cls)qm.setProfile(picked.name||cur.name,picked.cls||cur.cls);
  }
  async function boot(){
    if(booting||stopped)return;booting=true;
    var token=epoch;
    try{
      if(!CORE||!STORE||!CLIENT||!CLIENT.isConfigured()||!client()||!window.__QM){startupStatus(window.__QM_ENTRY_AUTH_READY?'content':'session','页面组件尚未完整加载，请刷新重试。',true);return;}
      if(!user){
        var verification=window.__QM_ENTRY_SESSION;
        var res=await (verification||client().auth.getSession());if(res.error)throw res.error;
        if(stopped||token!==epoch||window.__QM_ENTRY_REDIRECTING||verification!==window.__QM_ENTRY_SESSION)return;
        var nextUser=res.data&&res.data.session&&res.data.session.user;
        if(!nextUser||(observedAuthOwner!==undefined&&observedAuthOwner!==nextUser.id)){sendToLogin();return;}
        user=nextUser;
        // A delayed session result must not reopen an identity replaced in another tab.
        var hintedOwner=STORE.owner();
        if(hintedOwner && hintedOwner!==user.id){suspend();return;}
        STORE.activate(user.id);renderAccount();
        var ownCache=STORE.get(SAVE_KEY,user.id), parsed=null;
        try{parsed=ownCache?JSON.parse(ownCache):null;}catch(_){}
        hadOwnedCache=!!(parsed && typeof parsed==='object' && !Array.isArray(parsed));
        localBase=hadOwnedCache?CORE.compact(parsed):{};
        window.__QM.applyCloudSave(localBase);
        startupStatus('progress','登录已确认，正在读取本账号进度…',false);
        // Auth and the explicit owner are established. Restore only this cache;
        // a slow remote baseline must not block practice. New work stays in its
        // durable journal and cannot upload until that baseline is reconciled.
        if(hadOwnedCache){
          ready=true;
          var cachedEvents=window.QuizMarioLearnerEvents;
          if(cachedEvents&&cachedEvents.bindUser)cachedEvents.bindUser(user).catch(function(){});
          if(user)revealApp();
          if(window.__QM.onSessionReady)window.__QM.onSessionReady();
        }
      }
      renderStatus();var owner=user.id;
      var row=await readRemote(owner);if(!owned(owner,token))return;
      remote={owner:owner,row:row};
      await recover(owner,token);if(!owned(owner,token))return;
      row=remote&&remote.row||row;
      // On initial online load the server/recovered journal supplies the baseline.
      if(!ready || !journal){
        localBase=CORE.compact(row&&row.save||{});
        if(ready)window.__QM.applySyncedSave(localBase);else window.__QM.applyCloudSave(localBase);
        cache(window.__QM.getSave(),owner);
      }
      else if(journal){remote={owner:owner,row:row};}
      ready=true;networkBootPending=false;retry=0;lastAck=row&&row.updated_at||'';
      var events=window.QuizMarioLearnerEvents;
      if(events&&events.bindUser)events.bindUser(user).catch(function(){});
      if (user) revealApp();stampIdentity(row&&row.save);
      if(window.__QM.onSessionReady)window.__QM.onSessionReady();
      renderStatus();if(journal)schedule(0);
    }catch(e){
      if(stopped||token!==epoch||window.__QM_ENTRY_REDIRECTING)return;
      if(verification&&verification!==window.__QM_ENTRY_SESSION)return;
      if(user&&!owned(user.id,token))return;
      if(user){
        networkBootPending=true;retry=Math.min(retry+1,5);var cached=hadOwnedCache && STORE.get(SAVE_KEY,user.id);
        if(cached){ready=true;if(window.QuizMarioLearnerEvents)window.QuizMarioLearnerEvents.bindUser(user).catch(function(){});if (user) revealApp();}
        if(!ready)startupStatus('progress','本账号进度暂时无法读取，连接恢复后会自动重试，也可以刷新页面。',true);
        schedule(Math.min(30000,1000*Math.pow(2,retry)));renderStatus();
      }else if(e&&(e.code==='QM_AUTH_SESSION'||e.code==='QM_AUTH_CHANGED'))sendToLogin();
      else startupStatus('session','暂时无法确认登录状态，请检查网络后刷新重试。',true);
    }finally{booting=false;}
  }
  function suspend(){
    if(stopped)return;stopped=true;epoch++;ready=false;window.__QM_SYNC_READY=false;
    if(timer)clearTimeout(timer);if(heartbeat)clearInterval(heartbeat);
    hideApp();
    if(window.QuizMarioLearnerEvents&&window.QuizMarioLearnerEvents.unbindUser)window.QuizMarioLearnerEvents.unbindUser();
    location.replace('index.html');
  }
  async function logout(opts){
    opts=opts||{};
    if(opts.wipe&&!window.confirm('退出并清除本账号的本机缓存？云端进度和待补传记录会保留。'))return;
    var owner=user&&user.id;
    try{await Promise.race([Promise.all([flushNow(),window.QuizMarioLearnerEvents&&window.QuizMarioLearnerEvents.flush()]),new Promise(function(r){setTimeout(r,2000);})]);}catch(_){}
    stopped=true;epoch++;ready=false;if(timer)clearTimeout(timer);if(heartbeat)clearInterval(heartbeat);
    if(window.QuizMarioLearnerEvents&&window.QuizMarioLearnerEvents.unbindUser)window.QuizMarioLearnerEvents.unbindUser();
    if(opts.wipe&&owner)STORE.remove(SAVE_KEY,owner);
    try{await client().auth.signOut();}catch(_){}
    user=null;window.__QM_EXPECT_SESSION=false;hideApp();location.replace('login.html');
  }
  window.QuizMarioCloud={onLocalSave:onLocalSave,flushNow:flushNow,loggedIn:function(){return !!user&&!stopped;},userId:function(){return user&&!stopped?user.id:'';},noteLocalFailure:function(e){savedLocally('cache',e);renderStatus();},logout:logout,syncState:function(){return{ready:ready,checking:networkBootPending,pending:!!journal,retrying:retry>0,lastAcknowledged:lastAck};}};
  window.addEventListener('pageshow',function(ev){if(ev.persisted&&user&&journal){suspend();return;}if(ev.persisted&&!stopped){
    var token=epoch,verification=window.__QM_ENTRY_SESSION;
    Promise.resolve(verification||client().auth.getSession()).then(function(r){
      if(stopped||token!==epoch||window.__QM_ENTRY_REDIRECTING||verification!==window.__QM_ENTRY_SESSION)return;
      var u=r.data&&r.data.session&&r.data.session.user;
      if(r.error||!u||(user&&u.id!==user.id))suspend();else if(!user)boot();else{if(ready)revealApp();flushNow();}
    }).catch(function(){if(!stopped&&token===epoch&&verification===window.__QM_ENTRY_SESSION&&!window.__QM_ENTRY_REDIRECTING){hideApp();startupStatus('session','暂时无法确认登录状态，请检查网络后刷新重试。',true);}});
  }});
  document.addEventListener('visibilitychange',function(){if(document.visibilityState==='hidden')flushNow();else{if(journal && Date.now()-Number(journal.touched||0)>=45000){suspend();return;}if(user)flushNow();}});
  window.addEventListener('pagehide',function(){if(journal){journal.released=true;persistJournal(journal);}flushNow();});
  window.addEventListener('online',function(){retry=0;flushNow();if(window.QuizMarioLearnerEvents)window.QuizMarioLearnerEvents.flush();});
  window.addEventListener('offline',renderStatus);
  window.addEventListener('quizmario:sync-state',renderStatus);
  window.addEventListener('storage',function(ev){if(ev.key==='quizmario-auth'&&user){var s;try{s=JSON.parse(ev.newValue||'null');}catch(_){}if(!s||!s.user||s.user.id!==user.id)suspend();}});
  var button=$('btn-logout');if(button)button.addEventListener('click',function(){var wipe=$('wipe-local');logout({wipe:!!(wipe&&wipe.checked)});});
  if(CLIENT&&CLIENT.client()){
    var auth=CLIENT.client().auth;
    if(auth.onAuthStateChange)auth.onAuthStateChange(function(event,session){
      observedAuthOwner=session&&session.user?session.user.id:'';
      if(user&&(!session||!session.user||session.user.id!==user.id)){stopped=true;epoch++;ready=false;hideApp();if(window.QuizMarioLearnerEvents&&window.QuizMarioLearnerEvents.unbindUser)window.QuizMarioLearnerEvents.unbindUser();setTimeout(function(){location.replace(session&&session.user?'index.html':'login.html');},0);}
    });
  }
  heartbeat=setInterval(function(){if(journal&&!stopped)persistJournal(journal);if(user&&!stopped){if(journal||retry||!ready)flushNow();else recover(user.id,epoch).catch(function(){retry=1;renderStatus();});}},10000);
  boot();
})();

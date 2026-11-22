/* Read the current student's ALS training history with the existing authenticated client. */
(function () {
  'use strict';
  var home = document.getElementById('screen-home');
  if (!home) return;
  var details = document.createElement('details');
  var title = document.createElement('summary');
  title.textContent = 'ALS 练习记录';
  var mode = document.createElement('select');
  mode.setAttribute('aria-label', 'ALS 记录类型');
  [['results','五阶段成绩'],['activity','课堂活动与我的作答']].forEach(function(pair) {
    var option=document.createElement('option');
    option.value=pair[0]; option.textContent=pair[1]; mode.append(option);
  });
  var status = document.createElement('p');
  var list = document.createElement('ul');
  var previous = document.createElement('button');
  var next = document.createElement('button');
  previous.type = next.type = 'button';
  previous.textContent = '上一页';
  next.textContent = '下一页';
  details.append(title, mode, status, list, previous, next);
  home.append(details);
  var active = '', generation = 0, page = 0;
  var stages = {Recognize:'辨认', Repair:'改错', Rebuild:'自主重建', Vary:'变换情境', Transfer:'段落迁移'};

  var authOwner = '';
  function owner() {
    var cloud = window.QuizMarioCloud;
    return cloud && cloud.userId ? (cloud.userId() === authOwner ? authOwner : '') : authOwner;
  }
  function reset() {
    generation++;
    active = '';
    page = 0;
    list.replaceChildren();
    status.textContent = '';
    previous.disabled = next.disabled = true;
  }
  async function read() {
    var who = owner();
    if (active !== who) reset();
    active = who;
    var seq = ++generation;
    list.replaceChildren();
    previous.disabled = next.disabled = true;
    status.textContent = '正在读取…';
    try {
      if (!who) {status.textContent = '请先登录聚光账号。'; return;}
      var client = window.QuizMarioCloudClient.client();
      var activity=mode.value==='activity';
      var query = activity ? client.from('als_student_activity')
        .select('owner_id,record_id,recorded_at,title,details').eq('owner_id',who).eq('removed',false)
        .order('recorded_at',{ascending:false}).order('record_id',{ascending:false}) :
        client.from('als_training_results').select('learner_id,user_id,created_at,headword,payload')
        .eq('source', 'als').eq('event_type', 'als.training_result').eq('learner_id', who).eq('user_id', who)
        .order('created_at', {ascending:false}).order('event_id', {ascending:false});
      var response=await query.range(page*30,page*30+30);
      if (seq !== generation || owner() !== who) return;
      if (response.error || !Array.isArray(response.data)) throw Error();
      var rows = response.data;
      previous.disabled = page === 0;
      next.disabled = rows.length <= 30;
      status.textContent = rows.length ? '第 '+(page+1)+' 页' : (activity?'暂无课堂活动。登录这台课堂的 ALS 后，会在这里看到自己的记录。':'此页暂无 ALS 练习记录。');
      rows.slice(0,30).forEach(function(row) {
        if (activity) {
          if (row.owner_id!==who) return;
          var entry=document.createElement('li');
          var item=document.createElement('details');
          var heading=document.createElement('summary');
          heading.textContent=new Date(row.recorded_at).toLocaleString()+' · '+row.title;
          item.append(heading);
          Object.entries(row.details||{}).forEach(function(pair) {
            var line=document.createElement('p');
            var value=pair[1];
            if(Array.isArray(value)) value=value.join(' ／ ');
            if(typeof value==='boolean') value=value?'是':'否';
            if(typeof value!=='string' && typeof value!=='number') return;
            line.textContent=pair[0]+'：'+value;
            item.append(line);
          });
          entry.append(item); list.append(entry); return;
        }
        if (row.learner_id !== who || row.user_id !== who || !row.payload) return;
        var p = row.payload;
        var result = p.status==='verified' ? (p.passed?'通过':'未通过') : (p.status==='skipped'?'跳过':'待复核');
        var text = [new Date(row.created_at).toLocaleString(), row.headword, stages[p.stage], result];
        if (p.revision>0) text.push('教师复核');
        var li = document.createElement('li');
        li.textContent = text.filter(Boolean).join(' · ');
        list.append(li);
      });
    } catch (_) {
      if (seq !== generation || owner() !== who) return;
      status.textContent = '记录暂时无法读取，重新打开可重试。';
      previous.disabled = page === 0;
    }
  }
  mode.addEventListener('change',function(){page=0;read();});
  details.addEventListener('toggle', function () { if(details.open) read(); else reset(); });
  previous.addEventListener('click',function(){if(page>0){page--;read();}});
  next.addEventListener('click',function(){page++;read();});
  window.addEventListener('quizmario:session-ready',function(){reset();if(details.open) read();});
  window.addEventListener('pagehide', reset);
  window.addEventListener('pageshow',function(){if(details.open) read();});
  var client = window.QuizMarioCloudClient && window.QuizMarioCloudClient.client();
  if (client && client.auth) client.auth.onAuthStateChange(function(_, session) {
    var observed=session && session.user && session.user.id || '';
    if (observed===authOwner) return;
    authOwner=observed;
    reset();
    // A later task keeps PostgREST calls outside the auth callback's lock.
    if (details.open) setTimeout(read,0);
  });
})();

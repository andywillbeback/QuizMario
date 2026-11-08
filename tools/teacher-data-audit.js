/* Read-only capture for a teacher already signed in to /grok/teacher.html.
 * Queries use that teacher's existing RLS permissions. No auth tokens are exported.
 * The capture is checked for concurrent updates; it is not a database transaction.
 * Also require()-able for offline verification.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.QuizMarioTeacherAudit = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  var SAVE_KEYS = ['track','profile','cards','wrongBook','daily','studyDaily','practice','points','streak','bestStreak','updatedAt'];
  var EVENT_FIELDS = 'event_id,learner_id,user_id,event_type,created_at,item_id,headword,evidence_kind,task_direction,payload';

  function safeSave(value) {
    var src;
    try { src = typeof value === 'string' ? JSON.parse(value) : value || {}; }
    catch (_) { return {audit_invalid_save:true}; }
    if (!src || typeof src!=='object' || Array.isArray(src)) return {audit_invalid_save:true};
    var out = {};
    SAVE_KEYS.forEach(function (key) { if (src[key] !== undefined) out[key] = src[key]; });
    if (out.profile) out.profile = {name:typeof out.profile.name === 'string' ? out.profile.name : '',cls:typeof out.profile.cls === 'string' ? out.profile.cls : ''};
    return out;
  }

  async function pages(query, pageSize, maxPages) {
    var rows = [];
    for (var page = 0; page < (maxPages || 1000); page++) {
      var result = await query().range(page * pageSize, (page + 1) * pageSize - 1);
      if (result.error) throw result.error;
      if (!Array.isArray(result.data)) throw new Error('数据格式不正确，停止导出');
      rows = rows.concat(result.data);
      if (result.data.length < pageSize) return rows;
    }
    throw new Error('超过核对页数上限，未把不完整数据当成完整导出');
  }

  function versions(rows) {
    return rows.map(function (r) { return [r.user_id,r.updated_at || '']; }).sort(function (a,b) {
      return String(a[0]).localeCompare(String(b[0]));
    });
  }

  function dataIssues(progress, events) {
    var byId={};
    function add(id, message) { (byId[id] || (byId[id]=[])).push(message); }
    function counter(id, value, label, integer) {
      if (value == null) return;
      if (typeof value === 'boolean' || !Number.isFinite(Number(value)) || Number(value)<0 || (integer && !Number.isInteger(Number(value)))) add(id,'invalid-counter:'+label);
    }
    (progress || []).forEach(function (r) {
      var save=safeSave(r.save), id=r.user_id;
      if (save.audit_invalid_save || (r.save && r.save.audit_invalid_save)) {add(id,'invalid-save');return;}
      Object.keys(save.cards || {}).forEach(function (key) {
        var card=save.cards[key];
        if (!card || typeof card!=='object' || Array.isArray(card)) { add(id,'invalid-card:'+key);return; }
        ['correct','wrong','unknown','reps','lapses'].forEach(function (field) {counter(id,card[field],'card.'+field,true);});
        ['interval','due','mastery'].forEach(function (field) {counter(id,card[field],'card.'+field,false);});
        if (Number(card.mastery)>3) add(id,'invalid-mastery-range');
        ['spelling','polysemy'].forEach(function (mode) {
          var values=card[mode] || {};
          [values,values.typed || {},values.mc || {}].forEach(function (v) {
            ['correct','wrong','unknown'].forEach(function (field) {counter(id,v[field],mode+'.'+field,true);});
          });
        });
      });
      Object.keys(save.daily || {}).forEach(function (day) {
        var value=save.daily[day];
        if (!value || typeof value!=='object' || Array.isArray(value)) {add(id,'invalid-daily-bucket');return;}
        ['c','w','unk','rc','rw','n'].forEach(function (field) {counter(id,value[field],'daily.'+field,true);});
      });
      Object.keys(save.practice || {}).forEach(function (mode) {
        var value=save.practice[mode] || {};
        counter(id,value.n,'practice.n',true);counter(id,value.good,'practice.good',true);
        if (Number(value.good)>Number(value.n)) add(id,'practice-good-exceeds-total');
      });
      Object.keys(save.studyDaily || {}).forEach(function (day) {counter(id,save.studyDaily[day],'studyDaily',false);});
    });
    (events || []).forEach(function (e) {
      if (e.learner_id && e.user_id && e.learner_id!==e.user_id) add(e.learner_id,'event-owner-conflict');
    });
    return byId;
  }

  async function collect(client, options) {
    options = options || {};
    var auth = await client.auth.getUser();
    if (auth.error) throw auth.error;
    var user = auth.data && auth.data.user;
    if (!user || !user.app_metadata || user.app_metadata.role !== 'teacher') throw new Error('请先用教师账号登录教师看板');
    var started = options.now || new Date().toISOString();
    var since = new Date(Date.parse(started) - 14 * 86400000).toISOString();
    function eventQuery() {
      return client.from('learner_events').select(EVENT_FIELDS)
        .gte('created_at',since).lte('created_at',started)
        .order('created_at').order('event_id');
    }
    async function eventCount() {
      var result = await client.from('learner_events').select('event_id',{count:'exact',head:true})
        .gte('created_at',since).lte('created_at',started);
      if (result.error) throw result.error;
      if (typeof result.count !== 'number') throw new Error('无法确认事件总数，不生成完整性声明');
      return result.count;
    }
    var before = await pages(function () {
      return client.from('user_progress').select('user_id,updated_at').order('user_id');
    },100);
    var countBefore = await eventCount();
    var progress = await pages(function () {
      return client.from('user_progress').select('user_id,save,updated_at').order('user_id');
    },5);
    var events = await pages(eventQuery,500);
    var rpcStarted = new Date().toISOString();
    var rpc = await client.rpc('teacher_class_board');
    var rpcCompleted = new Date().toISOString();
    if (rpc.error) throw rpc.error;
    var payload = typeof rpc.data === 'string' ? JSON.parse(rpc.data) : rpc.data;
    if (!payload || !Array.isArray(payload.progress) || !Array.isArray(payload.events)) throw new Error('班级汇总格式不正确');
    var countAfter = await eventCount();
    var after = await pages(function () {
      return client.from('user_progress').select('user_id,updated_at').order('user_id');
    },100);
    var warnings = [];
    if (JSON.stringify(versions(before)) !== JSON.stringify(versions(after)) ||
        JSON.stringify(versions(before)) !== JSON.stringify(versions(progress))) warnings.push('读取期间存档有更新，需要重采样受影响的学员');
    if (progress.some(function (r) { return Date.parse(r.updated_at) > Date.parse(started); })) warnings.push('有存档更新时间晚于事件截点，需要重采样');
    if (countBefore !== countAfter || countAfter !== events.length) warnings.push('读取期间事件有变化或分页不完整，不能认定逐条一致');
    if (new Set(events.map(function (e) { return e.event_id; })).size !== events.length) warnings.push('事件分页含重复编号，需要重采样');
    var live = options.metrics || (typeof globalThis !== 'undefined' && globalThis.QMTeacher);
    var commonSince = new Date(Math.max(Date.parse(since),Date.parse(payload.generated_at || rpcCompleted)-14*86400000)).toISOString();
    var cutoffEvents = payload.events.filter(function (e) {
      var at = Date.parse(e.created_at); return at >= Date.parse(commonSince) && at <= Date.parse(started);
    });
    var loadedBoard = live && live.buildBoard ? live.buildBoard(payload.progress,cutoffEvents,payload.directory || [],new Date(started)) : null;
    return {
      schema:'quizmario-teacher-audit-v1',
      collector_version:'2026-11-08.1',
      captured_at:started, completed_at:new Date().toISOString(),
      timezone: options.timezone || (typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : ''),
      event_window:{since:since,until:started,days:14},
      comparison_window:{since:commonSince,until:started,rpc_started_at:rpcStarted,rpc_completed_at:rpcCompleted},
      consistency:{stable:warnings.length===0,warnings:warnings,event_count_before:countBefore,event_count_after:countAfter,
        method:'paginated read-only requests with before/after checks; not an atomic database snapshot'},
      raw:{progress:progress.map(function (r) { return {user_id:r.user_id,updated_at:r.updated_at,save:safeSave(r.save)}; }),events:events},
      board_payload:{progress:payload.progress,events:cutoffEvents,directory:payload.directory || [],generated_at:payload.generated_at || ''},
      displayed:loadedBoard ? loadedBoard.students : [],
      html:loadedBoard && live.studentReportHtml ? loadedBoard.students.map(function (s) {
        return {id:s.id,html:live.studentReportHtml(s,started)};
      }) : [],
      rendered:options.rendered || null,
    };
  }

  function compare(capture, metrics) {
    if (!capture || capture.schema !== 'quizmario-teacher-audit-v1') throw new Error('不是聚光教师核对文件');
    var when = new Date(capture.captured_at);
    var window = capture.comparison_window || capture.event_window;
    var comparableEvents = capture.raw.events.filter(function (e) {
      var at = Date.parse(e.created_at);return at >= Date.parse(window.since) && at <= Date.parse(window.until);
    });
    var raw = metrics.buildBoard(capture.raw.progress,comparableEvents,capture.board_payload.directory || [],when);
    var slim = metrics.buildBoard(capture.board_payload.progress,capture.board_payload.events,capture.board_payload.directory || [],when);
    var fields = ['trackLabel','touched','learned','mastery','bookActive','weakCount','weak','answers7','practice7',
      'answerEvents7','wrongBookEvents7','masteryBins','abilities','minutes','forget','inventory','summary','sourceUpdatedAt'];
    var byId = {};
    slim.students.forEach(function (s) { byId[s.id] = s; });
    var displayed = {};
    (capture.displayed || []).forEach(function (s) { displayed[s.id] = s; });
    var reports = {};
    (capture.html || []).forEach(function (r) { reports[r.id] = r.html; });
    var visible = {};
    ((capture.rendered && capture.rendered.roster) || []).forEach(function (r) { visible[r.id]=r; });
    var issues=dataIssues(capture.raw.progress,capture.raw.events);
    var results = raw.students.map(function (s) {
      var report = byId[s.id];
      var sourceDifferences = !report ? ['missing-student'] : fields.filter(function (key) {
        return JSON.stringify(s[key]) !== JSON.stringify(report[key]);
      });
      var old = displayed[s.id];
      var displayedDifferences = !old ? ['not-captured'] : fields.filter(function (key) {
        return JSON.stringify(s[key]) !== JSON.stringify(old[key]);
      });
      var missingEvidence=old ? displayedDifferences.filter(function (key) {return old[key]===undefined;}) : ['not-captured'];
      var metricKeys=['touched','learned','mastery','bookActive','weakCount','answers7','practice7','masteryBins','abilities','minutes','forget'];
      var metricValueDifferences=displayedDifferences.filter(function (key) {return missingEvidence.indexOf(key)<0 && metricKeys.indexOf(key)>=0;});
      var expectedHtml = metrics.studentReportHtml(s,capture.captured_at);
      var htmlDifferences = !reports[s.id] ? ['not-captured'] : (reports[s.id] === expectedHtml ? [] : ['report-content-or-presentation']);
      var shown=visible[s.id];
      var visibleDifferences=[];
      if (shown) {
        if (shown.trackLabel!==s.trackLabel) visibleDifferences.push('trackLabel');
        if (Number(shown.touched)!==s.touched) visibleDifferences.push('touched');
        if (Number(shown.due)!==metrics.reviewDueCount(s.forget)) visibleDifferences.push('due');
        if (Number(shown.weakCount)!==s.weakCount) visibleDifferences.push('weakCount');
      }
      return {id:s.id,name:s.name,sourceDifferences:sourceDifferences,displayedDifferences:displayedDifferences,htmlDifferences:htmlDifferences,
        visibleDifferences:visibleDifferences,visibleChecked:!!shown,
        dataIssues:issues[s.id] || [],
        metricValueDifferences:metricValueDifferences,missingEvidence:missingEvidence,
        note:'HTML content/presentation changes and newly missing metadata are not, by themselves, proof that a learner numeric total is wrong.',
        track:s.trackLabel,touchedCards:s.touched,answers7:s.answers7,practiceEvents7:s.practice7,
        due:metrics.reviewDueCount(s.forget),verified:sourceDifferences.length===0 && displayedDifferences.length===0 && htmlDifferences.length===0 && visibleDifferences.length===0 && !(issues[s.id] || []).length && capture.consistency.stable};
    });
    slim.students.forEach(function (s) { if (!raw.students.some(function (r) { return r.id===s.id; })) results.push({id:s.id,name:s.name,sourceDifferences:['extra-student'],displayedDifferences:[],verified:false}); });
    return {captured_at:capture.captured_at,consistency:capture.consistency,students:results,
      total:results.length,verified:results.filter(function (r) { return r.verified; }).length,
      limit:'Checks recorded data and projection/render consistency; does not prove that a learner completed the practice personally or validate teaching-score thresholds.'};
  }

  async function runInPage() {
    if (typeof location === 'undefined' || location.origin !== 'https://andywillbeback.github.io' || !/\/QuizMario\/grok\/teacher\.html$/.test(location.pathname)) {
      throw new Error('请在已登录的聚光教师看板运行此书签');
    }
    var cloud = globalThis.QuizMarioCloudClient;
    var client = cloud && cloud.client && cloud.client();
    if (!client) throw new Error('教师看板还没有连接云端');
    if (globalThis.__QM_AUDIT_RUNNING) throw new Error('核对导出仍在读取，请等待完成');
    globalThis.__QM_AUDIT_RUNNING = true;
    try {
      alert('开始只读核对导出。请保持页面打开，完成后将下载 JSON；不会更改学生记录。');
      var roster=Array.from(document.querySelectorAll('#student-body tr[data-id]')).map(function (r) {
        var cells=Array.from(r.querySelectorAll('td')).map(function (td) {return td.textContent.trim();});
        return {id:r.getAttribute('data-id'),name:cells[1],trackLabel:cells[2],touched:cells[3],due:cells[5],weakCount:cells[6],updatedAt:cells[8]};
      });
      var status=document.getElementById('cloud-status');
      var capture = await collect(client,{rendered:{url:location.href,status:status ? status.textContent : '',roster:roster}});
      var blob = new Blob([JSON.stringify(capture)],{type:'application/json'});
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      var localDate = new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
      a.href=url; a.download='聚光全班核对-'+localDate+'.json';
      document.body.appendChild(a);a.click();a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); },30000);
      alert('已导出 '+capture.raw.progress.length+' 份存档和 '+capture.raw.events.length+' 条近14天事件。'+
        (capture.consistency.stable ? '读取前后计数与版本检查通过。' : capture.consistency.warnings.join('；'))+
        '文件含学生学习数据，请只用于本次核对。');
    } finally { globalThis.__QM_AUDIT_RUNNING=false; }
  }
  return {collect:collect,compare:compare,pages:pages,runInPage:runInPage,safeSave:safeSave,dataIssues:dataIssues};
});

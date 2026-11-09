/* Personal wrong-word notebook. Manual entries are not answer errors. */
(function(root,factory){
  var api=factory();
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  if(root)root.QuizMarioNotebook=api;
  if(root&&root.document&&root.__QM)install(root,api);
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  function clean(v,max){return String(v==null?'':v).replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,max);}
  function errors(p){p=p||{};var s=p.spelling||{};return Number(p.wrong||0)+Number(s.wrong!=null?s.wrong:Number((s.typed||{}).wrong||0)+Number((s.mc||{}).wrong||0))+Number((p.polysemy||{}).wrong||0)+Number((p.collocationEvidence||{}).wrong||0);}
  function put(book,input,now){
    var word=clean(input.word,120).replace(/\s+/g,' ');
    if(!/[a-z]/i.test(word))throw Error('请填写英文单词或词组。');
    var gloss=clean(input.gloss,240),note=String(input.note||'').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g,'').replace(/\r\n?/g,'\n').trim().slice(0,2000),track=input.track||'core';
    var sense=typeof globalThis!=='undefined'&&globalThis.QuizMarioSense;
    var key=input.key||(sense?sense.lemmaKey(track,word):track+'::'+word.toLowerCase());
    var row=book[key],created=!row;
    if(!row)row=book[key]={lemmaKey:key,lemma:word,track:track,active:true,streak:0,priority:0,wrongAtGrad:0,createdAt:now,source:'manual'};
    row.gloss_zh=gloss;row.note=note;row.updatedAt=now;row.manualAddedAt=row.manualAddedAt||now;
    if(input.pointer){row.levelIdx=input.pointer.levelIdx;row.cardKey=input.pointer.cardKey;row.inWordBank=true;}
    return{key:key,row:row,created:created};
  }
  function archive(book,key,wrong,now){var row=book[key];if(!row)return;row.active=false;row.streak=0;row.wrongAtGrad=Number(wrong||0);row.updatedAt=now;}
  function rows(book,opts){opts=opts||{};var term=String(opts.search||'').toLowerCase();return Object.keys(book||{}).map(function(key){return Object.assign({key:key},book[key]);}).filter(function(r){return(!opts.track||r.track===opts.track)&&(opts.archived||r.active)&&(!term||[r.lemma,r.gloss_zh,r.note].join(' ').toLowerCase().indexOf(term)>=0);}).sort(function(a,b){return Number(b.updatedAt||b.lastMissAt||0)-Number(a.updatedAt||a.lastMissAt||0)||String(a.lemma).localeCompare(String(b.lemma));});}
  return{put:put,archive:archive,rows:rows,errors:errors,clean:clean};
});
function install(root,api){
  'use strict';var doc=root.document,qm=root.__QM,editing='';
  function $(id){return doc.getElementById(id);}
  var dialog=$('word-notebook');if(!dialog)return;
  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function note(text){$('notebook-status').textContent=text||'';}
  function pointer(word,track){return qm.notebookWord?qm.notebookWord(word,track):null;}
  function reset(){editing='';$('notebook-form').reset();$('notebook-word').readOnly=false;$('notebook-submit').textContent='加入笔记本';$('notebook-cancel-edit').hidden=true;}
  function render(){
    if(!dialog.open)return;
    var save=qm.getSave(),selected=$('notebook-scope').value;
    var list=api.rows(save.wrongBook||{},{track:selected==='all'?'':qm.track,search:$('notebook-search').value,archived:$('notebook-archived').checked});
    $('notebook-count').textContent=list.length+' 条';
    $('notebook-list').innerHTML=list.length?list.map(function(r){
      var known=pointer(r.lemma,r.track),gloss=r.gloss_zh||(known&&known.gloss)||'';
      return '<article class="notebook-entry"><div><strong>'+esc(r.lemma)+'</strong><span class="notebook-tag">'+esc(r.track==='ielts'?'雅思':r.track==='gaokao'?'高考':r.track==='zhongkao'?'中考':r.track)+'</span><span class="notebook-tag">'+(r.active?'待巩固':'已移出')+'</span></div><p>'+esc(gloss||'待补充释义')+'</p>'+(r.note?'<p class="notebook-note">'+esc(r.note)+'</p>':'')+'<small>'+(r.source==='manual'?'手动加入':r.source==='self_report'?'标记不会':'自动收集')+(known?' · 可在今日必练巩固':' · 词库外笔记')+'</small><div class="btn-row"><button type="button" class="ghost" data-notebook-edit="'+esc(r.key)+'">编辑笔记</button><button type="button" class="ghost" data-notebook-toggle="'+esc(r.key)+'">'+(r.active?'移出待巩固':'重新巩固')+'</button></div></article>';
    }).join(''):'<p class="sub">还没有条目。累计答错两次会自动收集，也可以在上方手动添加。</p>';
  }
  $('btn-notebook').addEventListener('click',function(){reset();note('');if(dialog.showModal)dialog.showModal();else dialog.setAttribute('open','');render();});
  $('notebook-close').addEventListener('click',function(){if(dialog.close)dialog.close();else dialog.removeAttribute('open');});
  $('notebook-cancel-edit').addEventListener('click',function(){reset();note('');});
  $('notebook-form').addEventListener('submit',function(e){
    e.preventDefault();var entered=false;
    try{
      qm.updateNotebook(function(book){
        var old=editing&&book[editing],track=old?old.track:qm.track,word=$('notebook-word').value,known=pointer(word,track);
        var result=api.put(book,{key:editing||undefined,word:word,track:track,gloss:$('notebook-gloss').value||(known&&known.gloss)||'',note:$('notebook-note').value,pointer:known},Date.now());entered=result.created;
        if(entered&&root.QuizMarioLearnerEvents)root.QuizMarioLearnerEvents.record({event_type:'vocab.notebook_add',headword:result.row.lemma,track:track,item_id:result.row.cardKey||'',gloss_zh:result.row.gloss_zh});
      });reset();note(entered?'已加入，正在自动同步。':'笔记已保存，正在自动同步。');render();
    }catch(error){note(error.message||'保存失败，请重试。');}
  });
  $('notebook-list').addEventListener('click',function(e){
    var edit=e.target.closest('[data-notebook-edit]'),toggle=e.target.closest('[data-notebook-toggle]');
    if(edit){editing=edit.getAttribute('data-notebook-edit');var r=(qm.getSave().wrongBook||{})[editing];if(!r)return;var known=pointer(r.lemma,r.track);$('notebook-word').value=r.lemma;$('notebook-word').readOnly=true;$('notebook-gloss').value=r.gloss_zh||(known&&known.gloss)||'';$('notebook-note').value=r.note||'';$('notebook-submit').textContent='保存笔记';$('notebook-cancel-edit').hidden=false;$('notebook-note').focus();note('');}
    if(toggle){var key=toggle.getAttribute('data-notebook-toggle');qm.updateNotebook(function(book){var r=book[key];if(!r)return;if(r.active){api.archive(book,key,api.errors((qm.getSave().cards||{})[r.cardKey]),Date.now());}else{r.active=true;r.streak=0;r.updatedAt=Date.now();if(root.QuizMarioLearnerEvents)root.QuizMarioLearnerEvents.record({event_type:'vocab.notebook_add',headword:r.lemma,track:r.track,item_id:r.cardKey||'',gloss_zh:r.gloss_zh||''});}});render();note('已保存，正在自动同步。');}
  });
  ['notebook-search','notebook-scope','notebook-archived'].forEach(function(id){$(id).addEventListener('input',render);$(id).addEventListener('change',render);});
  root.addEventListener('quizmario:progress',render);
}

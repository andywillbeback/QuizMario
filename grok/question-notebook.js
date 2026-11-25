/* Account-owned question snapshots. Collection never creates learning evidence. */
(function(root,factory){
  var api=factory();
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  if(root)root.QuizMarioQuestionNotebook=api;
  if(root&&root.document&&root.__QM)installQuestionNotebook(root,api);
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  function text(value,max){var s=String(value==null?'':value);if(s.length>max)throw Error('本题内容过长，尚未收藏，请先保存原文。');return s;}
  function snapshot(input){
    if(!input||!input.item_id||!input.prompt)throw Error('当前没有可收藏的题目。');
    return {track:text(input.track,100),item_id:text(input.item_id,500),mode:text(input.mode,100),label:text(input.label,300),prompt:text(input.prompt,8000),context:text(input.context,8000),hint:text(input.hint,8000),
      choices:(input.choices||[]).map(function(v){return text(v,2000);}),answer:text(input.answer,8000),outcome:['correct','wrong','unknown'].indexOf(input.outcome)>=0?input.outcome:'unanswered',feedback:text(input.feedback,16000)};
  }
  function key(input){var s=snapshot(input);return 'q1:'+JSON.stringify([s.track,s.item_id,s.mode,s.label,s.prompt,s.context]);}
  function put(book,input,opts){
    opts=opts||{};var s=snapshot(input),id=key(s),now=opts.now||Date.now(),row=book[id];
    if(!row&&!opts.manual)throw Error('请先手动收藏本题。');
    if(!row)row=book[id]={id:id,track:s.track,item_id:s.item_id,mode:s.mode,title:s.prompt,createdAt:now,updatedAt:now,archived:false,history:{}};
    if(opts.manual){row.favorite=true;row.archived=false;}
    if(s.outcome==='wrong')row.hasWrong=true;
    var equal=Object.keys(row.history||{}).some(function(k){return JSON.stringify(row.history[k].snapshot)===JSON.stringify(s);});
    if(!equal){
      var unique=(typeof crypto!=='undefined'&&crypto.randomUUID)?crypto.randomUUID():now.toString(36)+'-'+Math.random().toString(36).slice(2);
      while(row.history[unique])unique+='x';
      row.history[unique]={at:now,snapshot:s};
    }
    row.updatedAt=now;return row;
  }
  function rows(book,opts){opts=opts||{};var query=String(opts.search||'').toLowerCase();return Object.keys(book||{}).map(function(k){return book[k];}).filter(function(r){return r&&r.history&&(!r.archived||opts.archived)&&(!opts.track||r.track===opts.track)&&(!query||JSON.stringify(r).toLowerCase().includes(query));}).sort(function(a,b){return b.updatedAt-a.updatedAt;});}
  function history(row){return Object.keys(row.history||{}).map(function(k){return row.history[k];}).sort(function(a,b){return a.at-b.at;});}
  return {key:key,snapshot:snapshot,put:put,rows:rows,history:history};
});
function installQuestionNotebook(root,api){
  'use strict';var doc=root.document,qm=root.__QM,dialog=doc.getElementById('question-notebook'),busy=false;
  if(!dialog)return;
  function $(id){return doc.getElementById(id);}
  function owner(){return root.QuizMarioAccountStore&&root.QuizMarioAccountStore.owner();}
  function ready(){return !!owner()&&doc.documentElement.classList.contains('session-ok');}
  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function status(message){$('question-notebook-status').textContent=message||'';var small=$('question-bookmark-status');if(small)small.textContent=message||'';}
  function current(){return ready()&&qm.questionSnapshot?qm.questionSnapshot():null;}
  function saved(){var s=current();return s&&(qm.getSave().questionNotebook||{})[api.key(s)];}
  function refreshButton(){var button=$('btn-bookmark-question'),s=current(),row=saved();if(button){button.disabled=!s;button.textContent=row&&!row.archived?'★ 已收入错题本':'☆ 收藏本题';button.setAttribute('aria-pressed',String(!!(row&&!row.archived)));}}
  function update(input,opts){var id=owner();qm.updateQuestionNotebook(function(book){api.put(book,input,opts);},id);}
  function missFor(row){
    try{
      var book=root.QuizMarioNotebook;
      if(!book||typeof book.missBand!=='function'||typeof book.errors!=='function')return null;
      var id=String(row&&row.item_id||'').split('::collocation::')[0];
      var card=id&&((qm.getSave().cards)||{})[id];
      if(!card)return null;
      var band=book.missBand(book.errors(card));
      if(!band||(band.tone!=='green'&&band.tone!=='yellow'&&band.tone!=='red'))return null;
      return band;
    }catch(e){return null;}
  }
  function snapshotHtml(s,band){
    var prompt=band?'<p class="question-notebook-prompt miss-word miss-'+band.tone+'">'+esc(s.prompt)+'</p>':'<p class="question-notebook-prompt">'+esc(s.prompt)+'</p>';
    return '<p class="question-notebook-label">'+esc(s.label)+'</p>'+prompt+(s.hint?'<p class="question-notebook-copy">'+esc(s.hint)+'</p>':'')+(s.choices.length?'<ol>'+s.choices.map(function(c){return '<li>'+esc(c)+'</li>';}).join('')+'</ol>':'')+'<p><b>我的作答：</b>'+esc(s.answer||'尚未作答')+' <small>'+esc({correct:'当时判定：答对',wrong:'当时判定：答错',unknown:'当时标记：不会',unanswered:'尚未提交'}[s.outcome])+'</small></p>'+(s.feedback?'<details open><summary>当时已展示的讲解</summary><p class="question-notebook-copy">'+esc(s.feedback)+'</p></details>':'<p class="sub">尚未展示讲解；收藏不会提前显示答案。</p>');
  }
  function render(){
    refreshButton();if(!dialog.open||!ready())return;
    var list=api.rows(qm.getSave().questionNotebook||{},{track:$('question-notebook-scope').value==='all'?'':qm.track,search:$('question-notebook-search').value,archived:$('question-notebook-archived').checked});
    $('question-notebook-count').textContent=list.length+' 题';
    $('question-notebook-list').innerHTML=list.map(function(row){
      var h=api.history(row),last=h[h.length-1],band=missFor(row);
      var title=band?'<strong class="miss-word miss-'+band.tone+'">'+esc(row.title)+'</strong><span class="miss-label miss-'+band.tone+'">'+esc(band.label)+'</span>':'<strong>'+esc(row.title)+'</strong>';
      return '<article class="notebook-entry"><div>'+title+'<span class="notebook-tag">'+'手动收藏 · '+esc({gaokao:'高考',zhongkao:'中考',ielts:'雅思',core:'核心词库'}[row.track]||'其他词库')+'</span></div>'+snapshotHtml(last.snapshot,band)+(h.length>1?'<details><summary>查看原题及此前记录（'+(h.length-1)+'份）</summary>'+h.slice(0,-1).map(function(item){return '<section class="question-notebook-history">'+snapshotHtml(item.snapshot,null)+'</section>';}).join('')+'</details>':'')+'<button class="ghost" type="button" data-question-archive="'+esc(row.id)+'">'+(row.archived?'恢复到错题本':'移出错题本')+'</button></article>';
    }).join('')||'<p class="sub">还没有收藏的题目。在题旁点“收藏本题”，即可留在这里。</p>';
  }
  function close(){if(dialog.close)dialog.close();else dialog.removeAttribute('open');}
  ['btn-question-notebook','btn-play-question-notebook'].forEach(function(id){var button=$(id);if(button)button.addEventListener('click',function(){if(!ready())return;status('');if(dialog.showModal)dialog.showModal();else dialog.setAttribute('open','');render();});});
  $('question-notebook-close').addEventListener('click',close);
  $('btn-bookmark-question').addEventListener('click',function(){try{var s=current();if(!s)throw Error('当前没有可收藏的题目。');update(s,{manual:true});status('已收藏，保留原题、作答和已展示讲解；同步状态见账号栏。');render();}catch(e){status(e.message||'收藏未保存，请重试。');}});
  $('question-notebook-list').addEventListener('click',function(e){var button=e.target.closest('[data-question-archive]');if(!button||!ready())return;try{var id=button.getAttribute('data-question-archive');qm.updateQuestionNotebook(function(book){if(book[id]){book[id].archived=!book[id].archived;book[id].updatedAt=Date.now();}},owner());status('已保存；原记录仍保留，不改变复习安排。');render();}catch(err){status(err.message||'保存失败，请重试。');}});
  ['question-notebook-search','question-notebook-scope','question-notebook-archived'].forEach(function(id){$(id).addEventListener('input',render);$(id).addEventListener('change',render);});
  root.addEventListener('quizmario:question-snapshot',function(){
    if(busy||!ready())return;var s=current();if(!s){refreshButton();return;}var row=saved();
    // Update only a question the learner explicitly collected. No new auto collection.
    if(row&&!row.archived&&s.outcome!=='unanswered'){
      busy=true;try{update(s,{});}catch(e){status(e.message||'错题记录尚未保存，请重试。');}finally{busy=false;}
    }
    refreshButton();
  });
  root.addEventListener('quizmario:progress',render);
  new MutationObserver(function(){if(!ready()){close();$('question-notebook-list').replaceChildren();status('');}refreshButton();}).observe(doc.documentElement,{attributes:true,attributeFilter:['class']});
  refreshButton();
}

/* Public, hash-pinned word banks load only for the chosen course. */
(function(root,factory){
  if(typeof module!=='undefined'&&module.exports)module.exports=factory;
  if(root&&root.document)root.QuizMarioCourses=factory(root);
})(typeof window!=='undefined'?window:globalThis,function(host){
  'use strict';
  var catalog=host.QM_COURSE_CATALOG||[],pending=Object.create(null);
  var tracks=catalog.map(function(t){return Object.assign({},t,{sets:[],titles:[],lazy:true,loaded:false})});
  host.VOCAB_TRACKS=tracks;host.VOCAB_LEVELS=[];
  host.VOCAB_EXAM_TRACKS=tracks.filter(function(t){return t.id==='zhongkao'||t.id==='gaokao'});
  async function validate(text,meta){
    if(host.crypto&&host.crypto.subtle&&host.TextEncoder){
      var digest=await host.crypto.subtle.digest('SHA-256',new host.TextEncoder().encode(text));
      var hex=Array.from(new Uint8Array(digest)).map(function(b){return b.toString(16).padStart(2,'0')}).join('');
      if(hex!==meta.sha256)throw Error('词库校验失败，请刷新重试。');
    }
    var data=JSON.parse(text),count=0;
    if(data.id!==meta.id||data.version!==meta.version||!Array.isArray(data.sets)||data.sets.length!==meta.set_count||
      !Array.isArray(data.titles)||data.titles.length!==meta.set_count)throw Error('词库版本不完整，请重试。');
    data.sets.forEach(function(set){
      if(!Array.isArray(set)||!set.length)throw Error('词库分组不完整。');
      set.forEach(function(card){if(!card||typeof card.word!=='string'||!card.word.trim()||typeof card.meaning_zh!=='string')throw Error('词条不完整。');count++});
    });
    if(count!==meta.entry_count||data.entry_count!==count)throw Error('词库数量校验失败。');
    return data;
  }
  function ensure(id){
    var track=tracks.find(function(t){return t.id===id});
    if(!track)return Promise.reject(Error('未找到这个课程。'));
    if(track.loaded)return Promise.resolve(track);
    if(pending[id])return pending[id];
    var controller=host.AbortController?new host.AbortController():null,timer;
    var deadline=new Promise(function(_,reject){timer=host.setTimeout(function(){if(controller)controller.abort();reject(Error(track.name+'词库加载超时，请重试；学习记录保留。'))},20000)});
    var request=Promise.resolve().then(function(){return host.fetch(track.url,{signal:controller?controller.signal:undefined})})
      .then(function(res){if(!res||!res.ok)throw Error('词库暂时无法读取，请重试。');return res.text()})
      .then(function(text){return validate(text,track)});
    pending[id]=Promise.race([request,deadline]).then(function(data){
      Object.assign(track,data,{lazy:true,loaded:true});
      if(id==='core')host.VOCAB_LEVELS=track.sets;
      try{host.dispatchEvent(new host.CustomEvent('quizmario:course-loaded',{detail:{id:id}}))}catch(_){}
      return track;
    }).finally(function(){host.clearTimeout(timer);delete pending[id]});
    return pending[id];
  }
  return {ensure:ensure,tracks:tracks,validate:validate};
});

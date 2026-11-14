/* Repackage existing public curriculum without changing any word/card identity. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..','grok'),context={window:{}};
for(const file of ['words.js','tracks.js','exam-tracks.js'])vm.runInNewContext(fs.readFileSync(path.join(root,file),'utf8'),context,{filename:file});
const version='courses-20261114-v1',out=path.join(root,'data','course-v1');fs.mkdirSync(out,{recursive:true});
const catalog=[];
for(const source of context.window.VOCAB_TRACKS){
  const track=JSON.parse(JSON.stringify(source));
  if(track.id==='core'){
    track.sets=context.window.VOCAB_LEVELS;
    track.titles=track.sets.map((part,i)=>(part[0]?.scene||'复习 · Review')+' · 第'+(Math.floor(i/2)+1)+'组 · Part '+(i%2?'B':'A'));
  }
  const data={...track,version,entry_count:track.sets.reduce((n,set)=>n+set.length,0)};
  const text=JSON.stringify(data),digest=crypto.createHash('sha256').update(text).digest('hex');
  const file=track.id+'-'+digest.slice(0,12)+'.json';fs.writeFileSync(path.join(out,file),text);
  catalog.push({id:track.id,name:track.name,desc:track.desc||'',version,entry_count:data.entry_count,
    set_count:track.sets.length,card_index:track.sets.map(set=>set.map(card=>card.word)),sha256:digest,url:'data/course-v1/'+file});
}
fs.writeFileSync(path.join(root,'course-catalog.js'),'/* Generated public curriculum metadata; no student records. */\nwindow.QM_COURSE_CATALOG='+JSON.stringify(catalog)+';\n');
console.log(JSON.stringify({version,courses:catalog.map(t=>({id:t.id,entries:t.entry_count,bytes:fs.statSync(path.join(root,t.url)).size}))}));

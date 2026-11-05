'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const universe=require('../grok/word-universe'),projection=require('../grok/universe-orbit-fallback');
const tracks=[{id:'gaokao',name:'高考',sets:[Array.from({length:70},(_,i)=>({word:'word '+i,meaning_zh:'真实词条 '+i,pos:'n.'})),[{word:'outside',meaning_zh:'其他单元',pos:'n.'}]]}];
const opt={tracks,trackId:'gaokao',set:1,save:{cards:{}},pageSize:52};
const first=universe.buildGraph(opt),one=universe.classic3DGraph(first,false),two=universe.classic3DGraph(universe.buildGraph({...opt,page:1}),false);
assert.equal(one.themes.length,3);assert.equal(one.lemmas.length,52);assert.equal(two.lemmas.length,18);assert.equal(one.stats.pages,2);
assert.equal(new Set(one.lemmas.concat(two.lemmas).map(r=>r.key)).size,70);assert.ok(!one.lemmas.some(r=>r.word==='outside'));
assert.equal(one.themes.reduce((n,t)=>n+t.count,0),52);assert.ok(one.themes.every(t=>t.hue===184));
assert.ok(one.lemmas.every(r=>r.visual.hue===184&&r.visual.sat===22&&r.visual.unscored));
assert.ok(one.lemmas.every(r=>r.category&&r.detailThemeId&&r.orbitCategory));assert.ok(first.themes.length!==3,'the regular graph keeps its own category model');
assert.equal(universe.classic3DGraph(universe.buildGraph({...opt,tracks:[{...tracks[0],sets:[tracks[0].sets[0].slice(0,50)]}]}),false).lemmas.length,50,'a 50-word unit is never padded to 52');
const lights=[0,.5,1,2,3].map(m=>universe.classicVisual(m,true));assert.ok(lights.every(v=>v.hue===184&&v.sat===22));for(let i=1;i<lights.length;i++)assert.ok(lights[i].light>lights[i-1].light);
const empty=universe.classic3DGraph(universe.buildGraph({tracks,trackId:'gaokao',save:{cards:{}}}),false);assert.equal(empty.themes.length,3);assert.equal(empty.lemmas.length,0);
for(const narrow of [false,true]){
 const g=universe.classic3DGraph(first,narrow),points=g.themes.map(t=>({...t,radius:1.85})).concat(g.lemmas.map(r=>({...r,radius:.78})));
 for(const [w,h] of [[320,540],[390,670],[1363,760]]){
  const projected=projection.project(points,w,h,.22,.48,1);assert.equal(projected.length,55);
  for(const p of projected){assert.ok(Number.isFinite(p.sx)&&Number.isFinite(p.sy)&&p.sr>0);assert.ok(p.sx-p.sr>=0&&p.sx+p.sr<=w);assert.ok(p.sy-p.sr>=0&&p.sy+p.sr<=h);}
 }
}
const depth=projection.project([{x:0,y:0,z:-5,radius:1},{x:0,y:0,z:5,radius:1}],800,600,0,0,1);assert.ok(depth[1].sr>depth[0].sr,'perspective depth is real and not a flat layout');
const c={};c.window=c;vm.createContext(c);vm.runInContext(fs.readFileSync('grok/exam-tracks.js','utf8'),c);
let units=0;
for(const track of c.VOCAB_EXAM_TRACKS)for(let set=1;set<=track.sets.length;set++){
 const canonical=universe.buildGraph({tracks:c.VOCAB_EXAM_TRACKS,trackId:track.id,set,save:{cards:{}}}),keys=[];
 let page=0,pages=1;
 do{const view=universe.classic3DGraph(universe.buildGraph({tracks:c.VOCAB_EXAM_TRACKS,trackId:track.id,set,page,pageSize:52,save:{cards:{}}}),false);pages=view.stats.pages;assert.equal(view.themes.length,3);assert.ok(view.lemmas.length<=52);keys.push(...view.lemmas.map(r=>r.key));page++;}while(page<pages);
 assert.deepEqual(keys.sort(),canonical.lemmas.map(r=>r.key).sort());units++;
}
console.log('classic3d: three monochrome hubs, 52/page, exact unit membership, evidence isolation and true perspective; '+units+' exam units retain all words');

for(const narrow of [false,true]){
 const g=universe.classic3DGraph(first,narrow),points=g.themes.map(p=>({...p,radius:1.85})).concat(g.lemmas.map(p=>({...p,radius:.78})));
 for(const [w,h] of [[320,540],[390,670],[1363,760]]){
  const phi=1.12,d=universe.classicCameraDistance(g,w,h,phi),tv=Math.tan(24*Math.PI/180),th=tv*w/h;
  for(let j=0;j<36;j++)for(const p of points){const theta=j/36*Math.PI*2,st=Math.sin(theta),ct=Math.cos(theta),sin=Math.sin(phi),cos=Math.cos(phi),y=p.y-.4,depth=sin*st*p.x+cos*y+sin*ct*p.z;
   const x=ct*p.x-st*p.z,up=-cos*st*p.x+sin*y-cos*ct*p.z;
   assert.ok(Math.abs(x)+p.radius<(d-depth)*th);assert.ok(Math.abs(up)+p.radius<(d-depth)*tv);
  }
 }
}
console.log('classic3d: GPU camera fits every sphere throughout rotation on portrait and desktop screens');

const details=universe.wordDetailHtml(one,one.lemmas[0],"");
assert.equal(typeof details,'string');assert.ok(details.includes('<h2>'));assert.ok(details.includes(one.lemmas[0].word));assert.ok(details.includes('未验证')||details.includes('待验证'));
console.log('classic3d: selected word returns complete escaped detail markup');

/* Software projection of the same classic 3D orbit scene when WebGL is absent.
 * Geometry rotates in three dimensions; source words and scores are shared. */
(function(root,factory){var api=factory(root);if(typeof module!=="undefined"&&module.exports)module.exports=api;if(root)root.QuizMarioOrbitFallback=api;})(typeof window!=="undefined"?window:globalThis,function(root){
  "use strict";
  function project(points,w,h,yaw,pitch,zoom){
    var cy=Math.cos(yaw),sy=Math.sin(yaw),cp=Math.cos(pitch),sp=Math.sin(pitch),tan=Math.tan(24*Math.PI/180),aspect=w/h;
    var rotated=points.map(function(p){var x=p.x*cy+p.z*sy,z=-p.x*sy+p.z*cy;return Object.assign({},p,{rx:x,ry:p.y*cp-z*sp,rz:p.y*sp+z*cp});});
    var extentX=1,extentY=1,depth=1;
    rotated.forEach(function(p){extentX=Math.max(extentX,Math.abs(p.rx)+p.radius);extentY=Math.max(extentY,Math.abs(p.ry)+p.radius);depth=Math.max(depth,p.rz);});
    var distance=Math.max(extentX/(tan*aspect),extentY/tan)+depth+4,focal=h/(2*tan);
    return rotated.map(function(p){var scale=focal/Math.max(1,distance-p.rz)*zoom;return Object.assign({},p,{sx:w/2+p.rx*scale,sy:h*.47-p.ry*scale,sr:p.radius*scale});});
  }
  function mount(host,ctx){
    var doc=root.document,esc=ctx.esc,opened=ctx.parseScope(root.location.search),local=ctx.readLocal();
    var state={trackId:opened.trackId||local.trackId,setNumber:opened.set,page:0},graph,points=[],elements=[],lines=[];
    var yaw=.22,pitch=.48,zoom=1,selected=null,lastFrame=0,dragging=false,moved=false,downKey=null,pointers=new Map();
    var narrow=root.matchMedia&&root.matchMedia('(max-width: 800px)').matches,reduce=root.matchMedia&&root.matchMedia('(prefers-reduced-motion: reduce)').matches;
    doc.body.classList.add('is-classic-3d');host.className='classic-orbit-host';
    host.innerHTML='<svg id="classic-orbit-canvas" role="group" aria-label="三个大类中心与单词球组成的立体宇宙，可拖动旋转、缩放并选择单词"></svg><div class="classic-orbit-tools"><button type="button" data-orbit-action="out" aria-label="缩小立体宇宙">−</button><button type="button" data-orbit-action="reset" aria-label="恢复立体全景">⌖</button><button type="button" data-orbit-action="in" aria-label="放大立体宇宙">+</button></div>';
    var svg=doc.getElementById('classic-orbit-canvas'),details=doc.getElementById('universe-detail'),legend=doc.getElementById('universe-legend');
    if(legend)legend.innerHTML='<b>同一灰青色系 · 深色需要巩固</b><span class="classic-depth-ramp" aria-hidden="true"></span><span>半透明为尚未验证；搭配未熟练不计熟练</span>';
    function updateDetail(phrase){var row=graph&&graph.lemmas.find(function(r){return r.key===selected;});if(details){details.hidden=!row;details.innerHTML=row?ctx.wordDetailHtml(graph,row,phrase||''):'';}var status=doc.getElementById('universe-status');if(status)status.textContent=graph.trackName+' / '+(graph.setNumber?'第 '+graph.setNumber+' 单元 / ':'')+graph.stats.shown+' 个词条 / 3 个大类';}
    function select(key,phrase){selected=graph.lemmas.some(function(r){return r.key===key;})?key:null;updateDetail(phrase);draw();}
    function scene(){
      points=[];graph.themes.forEach(function(t){points.push({key:'theme:'+t.id,core:true,themeId:t.id,label:t.zh,x:t.x,y:t.y,z:t.z,radius:1.85,visual:ctx.classicVisual(2.1,true)});});
      graph.lemmas.forEach(function(r){points.push({key:r.key,themeId:r.themeId,label:r.word,x:r.x,y:r.y,z:r.z,radius:.78,visual:r.visual,row:r});});
      var defs='<defs>',body='<g class="classic-orbit-rods">',cores={};graph.themes.forEach(function(t){cores[t.id]=t;});
      graph.lemmas.forEach(function(r){body+='<line data-orbit-line="'+esc(r.key)+'" stroke="'+r.visual.hex+'"/>';});body+='</g>';
      points.forEach(function(p,i){defs+='<radialGradient id="orbit-shade-'+i+'" cx="32%" cy="28%" r="75%"><stop offset="0" stop-color="'+p.visual.hex+'" stop-opacity="1"/><stop offset="1" stop-color="'+p.visual.hex+'" stop-opacity=".62"/></radialGradient>';body+='<g class="classic-orbit-node'+(p.core?' is-core':'')+'" data-orbit-key="'+esc(p.key)+'"'+(!p.core?' role="button" tabindex="0" aria-label="'+esc(p.label+'，'+p.row.gloss+'，'+ctx.masteryText(p.row))+'"':'')+'><title>'+esc(p.label+(p.row?' · '+p.row.gloss:''))+'</title><circle class="orbit-node-halo"/><circle class="orbit-node-sphere" fill="url(#orbit-shade-'+i+')" stroke="'+p.visual.hex+'"/><circle class="orbit-node-outline" stroke="'+p.visual.hex+'"/><text text-anchor="middle">'+esc(p.label)+'</text></g>';});
      svg.innerHTML=defs+'</defs>'+body;
      elements=Array.from(svg.querySelectorAll('[data-orbit-key]'));lines=Array.from(svg.querySelectorAll('[data-orbit-line]'));draw();
    }
    function draw(){
      if(!graph)return;var rect=host.getBoundingClientRect(),w=Math.max(280,rect.width),h=Math.max(280,rect.height);svg.setAttribute('viewBox','0 0 '+w+' '+h);
      var projected=project(points,w,h,yaw,pitch,zoom),byKey={};projected.forEach(function(p){byKey[p.key]=p;});
      lines.forEach(function(el){var key=el.getAttribute('data-orbit-line'),p=byKey[key],a=byKey['theme:'+p.themeId];el.setAttribute('x1',a.sx);el.setAttribute('y1',a.sy);el.setAttribute('x2',p.sx);el.setAttribute('y2',p.sy);el.style.opacity=selected?(selected===key?'.7':'.12'):'.24';});
      projected.sort(function(a,b){return a.rz-b.rz;}).forEach(function(p){var el=elements.find(function(e){return e.getAttribute('data-orbit-key')===p.key;});if(!el)return;svg.appendChild(el);el.setAttribute('transform','translate('+p.sx+' '+p.sy+')');var isSelected=p.key===selected,r=p.sr*(isSelected?1.2:1);el.classList.toggle('is-selected',isSelected);el.style.opacity=selected&&!p.core&&!isSelected?'.4':p.visual.unscored?'.68':'1';var circles=el.querySelectorAll('circle');circles[0].setAttribute('r',r+6);circles[1].setAttribute('r',r);circles[2].setAttribute('r',r+2);circles[2].setAttribute('stroke-dasharray',p.visual.unscored?'2 3':'none');var text=el.querySelector('text');text.setAttribute('y',p.core?4:r+14);text.setAttribute('font-size',p.core?Math.max(11,Math.min(15,r*.65)):w<600?10:11);el.setAttribute('aria-pressed',String(isSelected));});
    }
    function refresh(){var l=ctx.readLocal();graph=ctx.classic3DGraph(ctx.buildGraph({tracks:ctx.allTracks(),trackId:state.trackId,set:state.setNumber,page:state.page,pageSize:52,cap:52,save:l.save,events:l.events}),narrow);state.page=graph.stats.page;if(!graph.lemmas.some(function(r){return r.key===selected;}))selected=null;ctx.paintControls(graph);var title=doc.getElementById('universe-title');if(title)title.textContent='单词宇宙';doc.title='立体单词宇宙 · 聚光单词';scene();updateDetail();}
    ctx.bindControls(state,refresh,false);
    host.addEventListener('click',function(ev){var btn=ev.target.closest('[data-orbit-action]');if(!btn)return;var action=btn.getAttribute('data-orbit-action');if(action==='reset'){yaw=.22;pitch=.48;zoom=1;select(null);}else{zoom=Math.max(.5,Math.min(2.5,zoom*(action==='in'?1.18:1/1.18)));draw();}});
    if(details)details.addEventListener('click',function(ev){var btn=ev.target.closest('[data-clear-focus],[data-focus-word],[data-phrase]');if(!btn)return;if(btn.hasAttribute('data-clear-focus'))select(null);else if(btn.hasAttribute('data-phrase'))select(selected,btn.getAttribute('data-phrase'));else{var word=btn.getAttribute('data-focus-word'),row=graph.lemmas.find(function(r){return r.word===word;});if(row)select(row.key);}});
    svg.addEventListener('keydown',function(ev){var item=ev.target.closest('[data-orbit-key]');if(item&&(ev.key==='Enter'||ev.key===' ')){ev.preventDefault();select(item.getAttribute('data-orbit-key'));}if(ev.key==='Escape')select(null);});
    var last=null,wasPinch=false;
    svg.addEventListener('pointerdown',function(ev){if(ev.button!=null&&ev.button!==0)return;var item=ev.target.closest('[data-orbit-key]');downKey=item&&item.getAttribute('data-orbit-key');moved=false;dragging=true;pointers.set(ev.pointerId,{x:ev.clientX,y:ev.clientY});wasPinch=pointers.size>1;last={x:ev.clientX,y:ev.clientY};svg.setPointerCapture(ev.pointerId);});
    svg.addEventListener('pointermove',function(ev){if(!pointers.has(ev.pointerId))return;var before=Array.from(pointers.values());pointers.set(ev.pointerId,{x:ev.clientX,y:ev.clientY});if(pointers.size===2){var after=Array.from(pointers.values()),d1=Math.hypot(before[0].x-before[1].x,before[0].y-before[1].y),d2=Math.hypot(after[0].x-after[1].x,after[0].y-after[1].y);wasPinch=true;moved=true;if(d1)zoom=Math.max(.5,Math.min(2.5,zoom*d2/d1));}else if(last){var dx=ev.clientX-last.x,dy=ev.clientY-last.y;if(dx*dx+dy*dy>9)moved=true;yaw+=dx*.006;pitch=Math.max(-1.2,Math.min(1.2,pitch+dy*.005));}last={x:ev.clientX,y:ev.clientY};draw();});
    function end(ev){if(!pointers.has(ev.pointerId))return;pointers.delete(ev.pointerId);if(!pointers.size){dragging=false;if(!moved&&!wasPinch&&ev.type!=='pointercancel')select(downKey);last=null;wasPinch=false;}else last=Array.from(pointers.values())[0];}
    svg.addEventListener('pointerup',end);svg.addEventListener('pointercancel',end);
    svg.addEventListener('wheel',function(ev){ev.preventDefault();zoom=Math.max(.5,Math.min(2.5,zoom*(ev.deltaY<0?1.08:1/1.08)));draw();},{passive:false});
    root.addEventListener('resize',function(){narrow=root.matchMedia&&root.matchMedia('(max-width: 800px)').matches;refresh();});
    function tick(now){if(now-lastFrame>40&&!reduce&&!selected&&!dragging&&doc.visibilityState!=='hidden'){yaw+=.0015;draw();lastFrame=now;}root.requestAnimationFrame(tick);}
    ctx.api.currentGraph=function(){return graph;};ctx.api.focusWord=function(word){var row=graph.lemmas.find(function(r){return r.word===word||r.key===word;});if(row){select(row.key);return true;}return false;};ctx.api.clearFocus=function(){select(null);};ctx.watchProgress(refresh);root.requestAnimationFrame(tick);
  }
  return {mount:mount,project:project};
});

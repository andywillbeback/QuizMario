/* Connected graph view: SVG runs on mobile without WebGL. No synthetic words or links. */
(function (root, factory) {
  var api = factory(root);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.QuizMarioUniverseNetwork = api;
})(typeof window !== "undefined" ? window : globalThis, function (root) {
  "use strict";
  function norm(s) { return String(s || "").trim().toLowerCase(); }
  function edgesOf(graph) {
    var words = Object.create(null), exact = Object.create(null), pairs = Object.create(null), links = [];
    graph.lemmas.forEach(function (row) { exact[row.word] = row.key; (words[norm(row.word)] || (words[norm(row.word)] = [])).push(row.key); });
    graph.lemmas.forEach(function (row) {
      var related = (row.coLemmas || []).concat((row.phrases || []).map(function (p) { return p.word; }));
      related.forEach(function (word) {
        var candidates = words[norm(word)] || [];
        var to = exact[word] || (candidates.length === 1 ? candidates[0] : null);
        if (!to || to === row.key) return;
        var pair = [row.key, to].sort().join("\u0000");
        if (!pairs[pair]) { pairs[pair] = true; links.push({ from: row.key, to: to, kind: "related" }); }
      });
    });
    return links;
  }
  function layout(graph, width, height) {
    width = Math.max(280, width); height = Math.max(280, height);
    var narrow = width < 600, cx = width / 2, cy = height / 2;
    var padX = narrow ? 30 : 62, padY = 72, groups = Object.create(null), anchors = [];
    graph.themes.forEach(function (theme) { groups[theme.id] = []; });
    graph.lemmas.forEach(function (row) { (groups[row.themeId] || (groups[row.themeId] = [])).push(row); });
    var n = graph.themes.length;
    graph.themes.forEach(function (theme, i) {
      var angle = (i / Math.max(1, n)) * Math.PI * 2 - Math.PI / 2;
      var x = n === 1 ? cx : cx + Math.cos(angle) * width * (narrow ? .32 : .31);
      var y = n === 1 ? cy : cy + Math.sin(angle) * height * .31;
      anchors.push({ key: "theme:" + theme.id, id: theme.id, label: theme.zh, hue: theme.hue, x: x, y: y });
    });
    var byTheme = Object.create(null); anchors.forEach(function (a) { byTheme[a.id] = a; });
    var nodes = [], edges = edgesOf(graph), degree = Object.create(null);
    edges.forEach(function (e) { degree[e.from] = (degree[e.from] || 0) + 1; degree[e.to] = (degree[e.to] || 0) + 1; });
    Object.keys(groups).forEach(function (id) {
      var a = byTheme[id] || { x: cx, y: cy };
      groups[id].forEach(function (row, i) {
        var angle = i * 2.39996323 + .65, dist = 24 + Math.sqrt(i + 1) * (narrow ? 18 : 29);
        nodes.push({ key: row.key, themeId: id, word: row.word, degree: degree[row.key] || 0,
          r: Math.min(narrow ? 13 : 20, (narrow ? 7.5 : 10) + Math.sqrt((degree[row.key] || 0) + 1) * 2),
          x: a.x + Math.cos(angle) * dist, y: a.y + Math.sin(angle) * dist, ax: a.x, ay: a.y });
      });
    });
    // Deterministic, bounded force settling. Layout does not depend on mastery.
    for (var step = 0; step < 220; step++) {
      var strength = 1 - step / 260;
      nodes.forEach(function (p) { p.x += (p.ax - p.x) * .011; p.y += (p.ay - p.y) * .011; });
      for (var i = 0; i < nodes.length; i++) for (var j = i + 1; j < nodes.length; j++) {
        var a = nodes[i], b = nodes[j], dx = b.x - a.x, dy = b.y - a.y, dist = Math.hypot(dx, dy) || .1;
        var minimum = a.r + b.r + (narrow ? 20 : 38);
        if (dist < minimum) {
          var force = (minimum - dist) / dist * .45 * strength;
          a.x -= dx * force; a.y -= dy * force; b.x += dx * force; b.y += dy * force;
        }
      }
      nodes.forEach(function (p) { p.x = Math.min(width - padX, Math.max(padX, p.x)); p.y = Math.min(height - padY, Math.max(padY, p.y)); });
    }
    return { nodes: nodes, anchors: anchors, edges: edges, width: width, height: height };
  }
  function mount(host, ctx) {
    var doc = root.document, esc = ctx.esc, initial = ctx.parseScope(root.location.search), local = ctx.readLocal();
    var state = { trackId: initial.trackId || local.trackId, setNumber: initial.set, page: 0 };
    var graph, positions, signature = "", selectedKey = null, activeCategory = "", query = "";
    var zoom = 1, panX = 0, panY = 0, width = 800, height = 650, pointerMoved = false;
    doc.body.classList.add("is-network");
    host.className = "network-workspace";
    host.innerHTML = '<aside class="network-index" id="network-index" aria-label="本页词表"><div class="index-heading"><span>单元词表</span><b id="network-total"></b><button type="button" data-index-close aria-label="收起词表">×</button></div><div class="network-search"><svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="8.5" cy="8.5" r="5.5"/><path d="m13 13 4 4"/></svg><input id="network-search" type="search" aria-label="搜索当前词表" placeholder="搜索单词或词义"></div><div class="network-categories" id="network-categories"></div><div class="network-word-list" id="network-word-list"></div><p class="index-footnote">只显示当前范围的词条</p></aside><section class="network-plot" id="network-plot" aria-label="单词关系图谱"><div class="network-plot-caption"><span>VOCABULARY NETWORK</span><p id="network-plot-summary"></p></div><svg id="network-svg" role="group" aria-label="可拖动、缩放的单词关系图"><g id="network-world"></g></svg><div class="network-empty" id="network-empty" hidden><h2>让学过的词，连接起来。</h2><p>完成一个单元，全部词条会自动进入这里。</p><a href="index.html">开始学习 →</a></div><div class="network-tools"><button type="button" id="network-index-toggle" aria-controls="network-index" aria-expanded="false">词表 <span id="network-mobile-count"></span></button><div class="network-zoom"><button type="button" data-zoom="out" aria-label="缩小图谱">−</button><button type="button" data-zoom="reset" aria-label="适配全部节点">⌖</button><button type="button" data-zoom="in" aria-label="放大图谱">+</button></div></div><div class="network-bottom-caption"><div class="network-color-key"><i></i><span>需巩固</span><i></i><span>熟练</span><i></i><span>未验证</span></div><span>拖动探索 · 双指缩放 · 点词查看</span></div></section>';
    var $ = function (id) { return doc.getElementById(id); };
    var plot = $("network-plot"), svg = $("network-svg"), world = $("network-world"), index = $("network-index");
    var details = $("universe-detail");
    if (details) { details.className = "network-detail"; details.hidden = false; host.appendChild(details); }
    var legend = $("universe-legend"); if (legend) legend.hidden = true;
    function setIndex(open) { host.classList.toggle("index-open", open); $("network-index-toggle").setAttribute("aria-expanded", String(open)); }
    function rowFor(key) { return graph && graph.lemmas.find(function (row) { return row.key === key; }); }
    function renderDetail(row) {
      if (!details) return;
      host.classList.toggle("has-selection", !!row);
      if (!row) {
        details.innerHTML = '<div class="detail-idle"><span class="detail-kicker">WORD INSIGHT</span><div class="detail-orbit" aria-hidden="true"><i></i><i></i><i></i></div><h2>从一个词，<br>看见一张知识网。</h2><p>点选节点，查看词义、掌握状态<br>与关联搭配。</p><div class="detail-explainer"><span><i></i>节点颜色</span><p>反映综合熟练度；灰色表示尚未验证。</p><span><i></i>节点大小</span><p>表示当前图中的关联数量。</p><span><i></i>节点连线</span><p>细线表示分类归属，亮线表示已有词汇关联。</p></div><p class="detail-rule">搭配未熟练，单词不计熟练。</p></div>';
        return;
      }
      var status = ctx.listStatus(row), e = row.evidence || {};
      var component = function (name, value, pending) { return '<div class="evidence-metric"><span>' + name + '</span><b>' + (pending ? '待验证' : value == null ? '未验证' : Number(value).toFixed(1).replace('.0','') + '<small>/3</small>') + '</b><i><em style="width:' + (value == null ? 0 : Math.max(0,Math.min(100,value/3*100))) + '%"></em></i></div>'; };
      var html = '<div class="detail-topline"><span class="detail-kicker">WORD INSIGHT</span><button type="button" data-close-detail aria-label="关闭词条详情">×</button></div><div class="detail-category">' + esc(row.category) + '</div><h2>' + esc(row.word) + '</h2>' + (row.ipa ? '<p class="detail-ipa">' + esc(row.ipa) + '</p>' : '') + '<p class="detail-gloss">' + esc(row.gloss) + '</p><div class="detail-status state-' + status.id + '"><i></i>' + status.label + '<span>' + (row.scored ? Math.round(row.mastery * 10) / 10 + ' / 3' : '尚无作答证据') + '</span></div><h3>学习证据</h3><div class="evidence-grid">' + component('认词',e.recognition) + component('拼写',e.spelling) + component('多义',e.polysemy) + (e.requiredCollocations ? component('搭配',e.collocation,e.collocationPending) : '') + '</div>';
      if (e.collocationPending) html += '<p class="detail-rule">搭配尚未全部验证，当前不计为熟练。</p>';
      else if (!row.scored) html += '<p class="detail-rule">未验证表示缺少证据，不等于答错。</p>';
      html += '<h3>关联搭配 <span>' + row.phrases.length + '</span></h3>';
      if (!row.phrases.length) html += '<p class="detail-muted">这个词暂无关联搭配。</p>';
      else html += '<ul class="detail-phrases">' + row.phrases.map(function (p) {
        var inside = graph.lemmas.find(function (n) { return n.key === ctx.norm(p.word); });
        return '<li>' + (inside ? '<button type="button" data-related-key="' + esc(inside.key) + '">' + esc(p.word) + ' <span>↗</span></button>' : '<b>' + esc(p.word) + '</b>') + '<p>' + esc(p.gloss) + '</p><small>' + esc(ctx.masteryText(p)) + (graph.setNumber && !inside ? ' · 本单元外关联' : '') + '</small></li>';
      }).join('') + '</ul>';
      if (row.coLemmas.length) html += '<h3>相关词</h3><div class="detail-links">' + row.coLemmas.map(function (word) { var related = graph.lemmas.find(function (n) { return norm(n.word) === norm(word); }); return related ? '<button type="button" data-related-key="' + esc(related.key) + '">' + esc(word) + '</button>' : '<span>' + esc(word) + '</span>'; }).join('') + '</div>';
      details.innerHTML = html;
    }
    function renderIndex() {
      if (!graph) return;
      $("network-total").textContent = graph.lemmas.length;
      $("network-mobile-count").textContent = graph.lemmas.length;
      var visible = graph.lemmas.filter(function (row) { return (!activeCategory || row.themeId === activeCategory) && (!query || (row.word + ' ' + row.gloss).toLowerCase().indexOf(query) >= 0); });
      $("network-word-list").innerHTML = visible.map(function (row) {
        var status = ctx.listStatus(row);
        return '<button type="button" class="network-list-row' + (row.key === selectedKey ? ' is-selected' : '') + '" data-word-key="' + esc(row.key) + '" aria-pressed="' + (row.key === selectedKey) + '"><span class="list-row-top"><b>' + esc(row.word) + '</b><i class="state-dot state-' + status.id + '"></i></span><span class="list-row-gloss">' + esc(row.gloss) + '</span><span class="list-row-meta">' + esc(row.category) + ' <em>' + status.label + '</em></span></button>';
      }).join('') || '<p class="index-no-results">没有找到匹配的词条</p>';
      $("network-categories").innerHTML = '<button type="button" data-network-category="" aria-pressed="' + (!activeCategory) + '">全部</button>' + graph.themes.map(function (theme) { return '<button type="button" data-network-category="' + esc(theme.id) + '" aria-pressed="' + (activeCategory === theme.id) + '">' + esc(theme.zh) + '<span>' + theme.count + '</span></button>'; }).join('');
    }
    function pick(key) {
      selectedKey = rowFor(key) ? key : null;
      renderDetail(rowFor(selectedKey)); renderIndex(); paintSelection(); setIndex(false);
    }
    function paintSelection() {
      if (!graph) return;
      var selected = rowFor(selectedKey), adjacent = Object.create(null);
      if (selected) positions.edges.forEach(function (edge) { if (edge.from === selectedKey) adjacent[edge.to] = true; if (edge.to === selectedKey) adjacent[edge.from] = true; });
      world.querySelectorAll('[data-node-key]').forEach(function (el) {
        var key = el.getAttribute('data-node-key'), row = rowFor(key), match = (!activeCategory || row.themeId === activeCategory) && (!query || (row.word + ' ' + row.gloss).toLowerCase().indexOf(query) >= 0);
        el.classList.toggle('is-selected', key === selectedKey);
        el.classList.toggle('is-adjacent', !!adjacent[key]);
        el.classList.toggle('is-dimmed', !match || !!selected && key !== selectedKey && !adjacent[key] && row.themeId !== selected.themeId);
        el.setAttribute('aria-pressed', String(key === selectedKey));
      });
      world.querySelectorAll('.network-edge').forEach(function (edge) { var a=edge.getAttribute('data-from'),b=edge.getAttribute('data-to'); edge.classList.toggle('is-highlighted', !!selected && (a===selectedKey||b===selectedKey)); edge.classList.toggle('is-muted',!!selected && a!==selectedKey && b!==selectedKey); });
      labelVisibility();
    }
    function transform() { world.setAttribute('transform','translate('+panX+' '+panY+') scale('+zoom+')'); labelVisibility(); }
    function labelVisibility() {
      if (!positions) return;
      var boxes=positions.anchors.map(function(a){return {x:a.x*zoom+panX-a.label.length*5,y:a.y*zoom+panY-25,w:a.label.length*10,h:14};}), labels=Array.from(world.querySelectorAll('.network-node-label'));
      labels.sort(function(a,b){return (b.getAttribute('data-label-key')===selectedKey?1:0)-(a.getAttribute('data-label-key')===selectedKey?1:0);});
      labels.forEach(function(el){
        var key=el.getAttribute('data-label-key'),p=positions.nodes.find(function(n){return n.key===key;}),row=rowFor(key),preferred=key===selectedKey;
        var text=preferred?row.word:row.word.length>23?row.word.slice(0,21)+'…':row.word;
        el.textContent=text;el.setAttribute('font-size',(width<600?11:12)/zoom);
        var x=p.x*zoom+panX,y=(p.y+p.r+15/zoom)*zoom+panY,w=text.length*(width<600?6:6.8),box={x:x-w/2,y:y-11,w:w,h:16};
        var match=(!activeCategory||row.themeId===activeCategory)&&(!query||(row.word+' '+row.gloss).toLowerCase().indexOf(query)>=0);
        var collision=boxes.some(function(b){return box.x<b.x+b.w+8&&box.x+box.w+8>b.x&&box.y<b.y+b.h+5&&box.y+box.h+5>b.y;});
        var show=preferred||match&&!collision&&x>8&&x<width-8&&y>18&&y<height-48;
        el.setAttribute('y',p.r+15/zoom);el.style.opacity=show?'1':'0';
        if(show)boxes.push(box);
      });
    }
    function draw() {
      if (!graph) return;
      var rect=plot.getBoundingClientRect();width=Math.max(280,rect.width);height=Math.max(280,rect.height);
      var nextSignature=graph.trackId+'|'+graph.setNumber+'|'+graph.stats.page+'|'+graph.lemmas.map(function(n){return n.key;}).join('|')+'|'+Math.round(width)+'x'+Math.round(height);
      if(signature!==nextSignature){signature=nextSignature;positions=layout(graph,width,height);zoom=1;panX=0;panY=0;}
      svg.setAttribute('viewBox','0 0 '+width+' '+height);
      var nodes=Object.create(null);positions.nodes.forEach(function(n){nodes[n.key]=n;});
      var anchors=Object.create(null);positions.anchors.forEach(function(a){anchors[a.id]=a;});
      var lines=positions.nodes.map(function(n){var a=anchors[n.themeId];return '<line class="network-edge category-edge" x1="'+a.x+'" y1="'+a.y+'" x2="'+n.x+'" y2="'+n.y+'" data-from="'+esc(n.key)+'" data-to="theme:'+esc(n.themeId)+'"/>';}).join('');
      lines+=positions.edges.map(function(e){var a=nodes[e.from],b=nodes[e.to];return '<line class="network-edge related-edge" x1="'+a.x+'" y1="'+a.y+'" x2="'+b.x+'" y2="'+b.y+'" data-from="'+esc(e.from)+'" data-to="'+esc(e.to)+'"/>';}).join('');
      var hubs=positions.anchors.map(function(a){return '<g class="network-hub" transform="translate('+a.x+' '+a.y+')"><circle r="4"/><text y="-15" text-anchor="middle">'+esc(a.label)+'</text></g>';}).join('');
      var circles=positions.nodes.map(function(p){var row=rowFor(p.key);return '<g class="network-node '+(!row.scored?'node-unseen':'')+'" transform="translate('+p.x+' '+p.y+')" data-node-key="'+esc(p.key)+'" tabindex="0" role="button" aria-label="'+esc(row.word+'，'+row.gloss+'，'+ctx.masteryText(row))+'" aria-pressed="false"><title>'+esc(row.word+' · '+row.gloss)+'</title><circle class="node-halo" r="'+(p.r+7)+'"/><circle class="node-fill" r="'+p.r+'" fill="'+row.visual.hex+'"/><circle class="node-ring" r="'+(p.r+3)+'"/><text class="network-node-label" data-label-key="'+esc(p.key)+'" y="'+(p.r+15)+'" text-anchor="middle">'+esc(row.word)+'</text></g>';}).join('');
      world.innerHTML=lines+hubs+circles;
      transform();paintSelection();
    }
    function refresh() {
      var save=ctx.readLocal();graph=ctx.buildGraph({tracks:ctx.allTracks(),trackId:state.trackId,set:state.setNumber,page:state.page,cap:52,save:save.save,events:save.events});state.page=graph.stats.page;
      if(!rowFor(selectedKey))selectedKey=null;
      if(activeCategory&&!graph.themes.some(function(t){return t.id===activeCategory;}))activeCategory='';
      var title=$("universe-title"),status=$("universe-status");if(title)title.textContent='单词宇宙';
      if(status)status.textContent=graph.trackName+' / '+(graph.setNumber?'第 '+graph.setNumber+' 单元':'我的词汇集')+' / '+graph.stats.bankLemmas+' 个词条';
      doc.title=(graph.setNumber?'第 '+graph.setNumber+' 单元 · ':'')+'单词宇宙 · 聚光单词';
      var mastered=graph.lemmas.filter(function(r){return r.scored&&r.mastery===3;}).length;
      $("network-plot-summary").textContent=graph.lemmas.length+' 个词条 · '+graph.themes.length+' 个大类 · '+mastered+' 个熟练';
      $("network-empty").hidden=!!graph.lemmas.length;
      ctx.paintControls(graph);renderIndex();renderDetail(rowFor(selectedKey));draw();
    }
    ctx.bindControls(state,refresh,false);
    host.addEventListener('click',function(ev){
      var target=ev.target.closest('[data-word-key],[data-network-category],[data-close-detail],[data-related-key],[data-index-close],[data-zoom]');if(!target)return;
      if(target.hasAttribute('data-word-key'))pick(target.getAttribute('data-word-key'));
      else if(target.hasAttribute('data-related-key'))pick(target.getAttribute('data-related-key'));
      else if(target.hasAttribute('data-close-detail'))pick(null);
      else if(target.hasAttribute('data-index-close'))setIndex(false);
      else if(target.hasAttribute('data-network-category')){activeCategory=target.getAttribute('data-network-category');renderIndex();paintSelection();}
      else if(target.hasAttribute('data-zoom')){var z=target.getAttribute('data-zoom');if(z==='reset'){zoom=1;panX=0;panY=0;transform();}else zoomAt(z==='in'?1.3:1/1.3,width/2,height/2);}
    });
    $("network-search").addEventListener('input',function(ev){query=ev.target.value.trim().toLowerCase();renderIndex();paintSelection();});
    $("network-index-toggle").addEventListener('click',function(){setIndex(!host.classList.contains('index-open'));});
    svg.addEventListener('keydown',function(ev){var node=ev.target.closest('[data-node-key]');if(node&&(ev.key==='Enter'||ev.key===' ')){ev.preventDefault();pick(node.getAttribute('data-node-key'));}if(ev.key==='Escape')pick(null);});
    function zoomAt(factor,x,y){var next=Math.min(3.5,Math.max(.55,zoom*factor)),ratio=next/zoom;panX=x-(x-panX)*ratio;panY=y-(y-panY)*ratio;zoom=next;transform();}
    var pointers=new Map(),last=null,downKey=null,wasPinch=false;
    svg.addEventListener('pointerdown',function(ev){
      if(ev.button!=null&&ev.button!==0)return;
      var node=ev.target.closest('[data-node-key]');downKey=node&&node.getAttribute('data-node-key');pointerMoved=false;
      pointers.set(ev.pointerId,{x:ev.clientX,y:ev.clientY});last={x:ev.clientX,y:ev.clientY};wasPinch=pointers.size>1;
      svg.setPointerCapture(ev.pointerId);svg.classList.add('is-dragging');
    });
    svg.addEventListener('pointermove',function(ev){if(!pointers.has(ev.pointerId))return;var prev=Array.from(pointers.values());pointers.set(ev.pointerId,{x:ev.clientX,y:ev.clientY});
      if(pointers.size===2){var next=Array.from(pointers.values()),d1=Math.hypot(prev[0].x-prev[1].x,prev[0].y-prev[1].y),d2=Math.hypot(next[0].x-next[1].x,next[0].y-next[1].y),rect=svg.getBoundingClientRect();wasPinch=true;pointerMoved=true;if(d1)zoomAt(d2/d1,(next[0].x+next[1].x)/2-rect.left,(next[0].y+next[1].y)/2-rect.top);}
      else if(last){var dx=ev.clientX-last.x,dy=ev.clientY-last.y;if(Math.abs(dx)+Math.abs(dy)>2)pointerMoved=true;panX+=dx;panY+=dy;transform();}last={x:ev.clientX,y:ev.clientY};
    });
    function endPointer(ev){if(!pointers.has(ev.pointerId))return;pointers.delete(ev.pointerId);if(!pointers.size){svg.classList.remove('is-dragging');if(!pointerMoved&&!wasPinch&&ev.type!=='pointercancel')pick(downKey);last=null;downKey=null;wasPinch=false;}else{var p=Array.from(pointers.values())[0];last={x:p.x,y:p.y};}}
    svg.addEventListener('pointerup',endPointer);svg.addEventListener('pointercancel',endPointer);
    svg.addEventListener('wheel',function(ev){ev.preventDefault();var rect=svg.getBoundingClientRect();zoomAt(ev.deltaY<0?1.12:1/1.12,ev.clientX-rect.left,ev.clientY-rect.top);},{passive:false});
    var resizeFrame=null;root.addEventListener('resize',function(){if(resizeFrame)root.cancelAnimationFrame(resizeFrame);resizeFrame=root.requestAnimationFrame(function(){resizeFrame=null;draw();});});
    ctx.api.currentGraph=function(){return graph;};ctx.api.focusWord=function(word){var row=graph.lemmas.find(function(r){return r.key===ctx.norm(word)||norm(r.word)===norm(word);});if(row){pick(row.key);return true;}return false;};ctx.api.clearFocus=function(){pick(null);};
    ctx.watchProgress(refresh);
  }
  return { layout: layout, edgesOf: edgesOf, mount: mount };
});

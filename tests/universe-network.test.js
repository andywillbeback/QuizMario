'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const network=require('../grok/universe-network.js'),universe=require('../grok/word-universe.js');
const c={};c.window=c;vm.createContext(c);vm.runInContext(fs.readFileSync('grok/exam-tracks.js','utf8'),c);
const graph=universe.buildGraph({tracks:c.VOCAB_EXAM_TRACKS,trackId:'gaokao',set:87,save:{cards:{}}});
for(const [w,h] of [[320,502],[390,665],[800,700]]){
 const layout=network.layout(graph,w,h);assert.equal(layout.nodes.length,graph.lemmas.length);
 assert.equal(new Set(layout.nodes.map(n=>n.key)).size,graph.lemmas.length);
 for(const p of layout.nodes){assert.ok(Number.isFinite(p.x)&&Number.isFinite(p.y));assert.ok(p.x>=30&&p.x<=w-30&&p.y>=72&&p.y<=h-72);}
 assert.deepEqual(layout,network.layout(graph,w,h),'layout is deterministic and stable under progress-only refreshes');
 const scored=JSON.parse(JSON.stringify(graph));scored.lemmas.forEach(n=>{n.mastery=3;n.scored=true});assert.deepEqual(network.layout(scored,w,h),layout,'mastery never moves the learner’s nodes');
}
const sample={themes:[{id:'x',zh:'类别',hue:30}],lemmas:[
 {key:'May',word:'May',themeId:'x',coLemmas:['may','outside'],phrases:[]},
 {key:'may',word:'may',themeId:'x',coLemmas:['May'],phrases:[]},
 {key:'take',word:'take',themeId:'x',coLemmas:[],phrases:[{word:'take care'}]},
 {key:'take care',word:'take care',themeId:'x',coLemmas:['take'],phrases:[]}
]};
const edges=network.edgesOf(sample);assert.equal(edges.length,2,'only existing, deduplicated in-scope associations appear');
assert.ok(edges.some(e=>[e.from,e.to].includes('May')&&[e.from,e.to].includes('may')));
assert.ok(edges.every(e=>e.from!=='outside'&&e.to!=='outside'));
assert.equal(network.layout({themes:[],lemmas:[]},320,600).nodes.length,0);
// Production dispatcher uses SVG before checking WebGL on the actual page host.
let mounted=false,passed;const host={getAttribute:k=>k==='data-layout'?'network':null,setAttribute(){}};
const els={'universe-root':host,'universe-status':{},'universe-title':{},'universe-legend':{textContent:'legend'}};
const document={getElementById:id=>els[id]||null};const root={document,location:{search:'?track=gaokao&set=87'},localStorage:{getItem(){return null}},QuizMarioUniverseNetwork:{mount(h,ctx){mounted=h===host;passed=ctx}}};root.window=root;vm.createContext(root);
for(const f of ['sense-id.js','related-links.js','universe-progress.js','word-universe.js'])vm.runInContext(fs.readFileSync('grok/'+f,'utf8'),root);
assert.equal(mounted,true,'SVG graph works with no THREE or WebGL');assert.equal(typeof passed.watchProgress,'function');assert.equal(typeof passed.buildGraph,'function');
console.log('universe-network: exact membership, bounded mobile layout, stable mastery refresh, existing edges, case-sensitive senses and no-WebGL dispatch passed');
// Mount the production graph controller with a DOM fixture and actual learner scoring.
class El{constructor(id){this.id=id;this.attrs={};this.listeners={};this.innerHTML='';this.textContent='';this.style={};this.classes=new Set;this.classList={add:v=>this.classes.add(v),remove:v=>this.classes.delete(v),contains:v=>this.classes.has(v),toggle:(v,on)=>on?this.classes.add(v):this.classes.delete(v)}}getAttribute(k){return this.attrs[k]||null}setAttribute(k,v){this.attrs[k]=String(v)}appendChild(){}querySelectorAll(){return[]}addEventListener(k,fn){this.listeners[k]=fn}getBoundingClientRect(){return{left:0,top:0,width:390,height:665}}}
const els2=new Map,doc2={body:new El('body'),getElementById(id){if(!els2.has(id))els2.set(id,new El(id));return els2.get(id)}};
const app={document:doc2,location:{search:'?track=gaokao&set=1'},addEventListener(){}};app.window=app;vm.createContext(app);vm.runInContext(fs.readFileSync('grok/universe-network.js','utf8'),app);
let saved={cards:{'gaokao|0::life':{state:'learning',mastery:.5,reps:1,scheduledAt:1}}},refreshNetwork;const graphApi={};
const tracks=[{id:'gaokao',name:'高考',sets:[[{word:'life',meaning_zh:'生活',pos:'n.'},{word:'advantage',meaning_zh:'优势',pos:'n.'}]]}];
app.QuizMarioUniverseNetwork.mount(doc2.getElementById('universe-root'),{api:graphApi,esc:s=>String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;'),norm:s=>String(s).toLowerCase(),parseScope:universe.parseScope,readLocal:()=>({save:saved,events:[],trackId:'gaokao'}),buildGraph:universe.buildGraph,allTracks:()=>tracks,listStatus:row=>({id:row.scored?(row.mastery===3?'mastered':'learning'):'unseen',label:row.scored?'待巩固':'未验证'}),masteryText:universe.masteryText,paintControls(){},bindControls(){},watchProgress(fn){refreshNetwork=fn;fn()}});
assert.equal(graphApi.currentGraph().lemmas.length,2);assert.equal((doc2.getElementById('network-world').innerHTML.match(/class="network-node /g)||[]).length,2);
assert.equal(graphApi.focusWord('life'),true);assert.ok(doc2.getElementById('universe-detail').innerHTML.includes('生活'));
saved.cards['gaokao|0::life'].mastery=0;refreshNetwork();assert.equal(graphApi.currentGraph().lemmas.find(n=>n.word==='life').mastery,0);assert.ok(doc2.getElementById('universe-detail').innerHTML.includes('life'),'selected word survives a live refresh');
console.log('universe-network controller: mobile-size SVG, exact word count and selected evidence refresh passed');

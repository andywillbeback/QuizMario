// Execute production mount/rebuild with mock rendering primitives, not GPU pixels.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const tracks=[{id:'gaokao',name:'高考',sets:[[{word:'advantage',meaning_zh:'优势'},{word:'life',meaning_zh:'生活'}]]}];
function makeRuntime(storage){
 class Emitter{constructor(){this.listeners={};this.attrs={};this.style={};this.children=[];this.clientWidth=1000;this.clientHeight=800;this.textContent='';}
  addEventListener(t,f){(this.listeners[t]??=[]).push(f)}dispatchEvent(e){for(const f of this.listeners[e.type]||[])f(e)}
  getAttribute(k){return this.attrs[k]??null}setAttribute(k,v){this.attrs[k]=String(v)}appendChild(x){this.children.push(x)}
  getContext(t){return t==='2d'?{clearRect(){},strokeText(){},fillText(){}}:{}}
  getBoundingClientRect(){return{left:0,top:0,width:1000,height:800}}
 }
 class Vec{constructor(x=0,y=0,z=0){this.set(x,y,z)}set(x,y,z){this.x=x;this.y=y;this.z=z;return this}setScalar(v){return this.set(v,v,v)}
  copy(v){return this.set(v.x,v.y,v.z)}add(v){this.x+=v.x;this.y+=v.y;this.z+=v.z;return this}multiplyScalar(v){this.x*=v;this.y*=v;this.z*=v;return this}
  subVectors(a,b){return this.set(a.x-b.x,a.y-b.y,a.z-b.z)}length(){return Math.hypot(this.x,this.y,this.z)}clone(){return new Vec(this.x,this.y,this.z)}normalize(){return this.multiplyScalar(1/(this.length()||1))}}
 class Obj{constructor(){this.children=[];this.position=new Vec;this.scale=new Vec(1,1,1);this.rotation={y:0};this.userData={};this.quaternion={setFromUnitVectors(){}}}
  add(x){this.children.push(x);x.parent=this;return this}remove(x){this.children=this.children.filter(c=>c!==x);x.parent=null}clear(){this.children=[]}traverse(fn){fn(this);for(const c of this.children)c.traverse(fn)}lookAt(){}updateProjectionMatrix(){}}
 class Geo{setAttribute(){}dispose(){}}
 class Mat{constructor(opts){Object.assign(this,opts);this.userData={}}dispose(){}}
 class Mesh extends Obj{constructor(geometry,material){super();this.geometry=geometry;this.material=material}}
 class Sprite extends Mesh{constructor(material){super(null,material)}}
 class Renderer{constructor(){this.domElement=new Emitter}setPixelRatio(){}setClearColor(){}setSize(){}render(){}}
 const host=new Emitter,els={'universe-root':host,'universe-status':new Emitter,'universe-detail':new Emitter,'universe-legend':new Emitter,'universe-title':new Emitter};
 const document=new Emitter;document.getElementById=id=>els[id]||null;document.createElement=()=>new Emitter;document.querySelectorAll=()=>[];document.visibilityState='visible';
 const ctx=new Emitter;Object.assign(ctx,{document,localStorage:{getItem(k){return storage[k]??null}},location:{search:'?track=gaokao&set=1'},matchMedia(){return{matches:false}},devicePixelRatio:1,
  VOCAB_EXAM_TRACKS:tracks,frames:[],requestAnimationFrame(f){ctx.frames.push(f)},THREE:{WebGLRenderer:Renderer,Scene:Obj,PerspectiveCamera:Obj,AmbientLight:Obj,HemisphereLight:Obj,DirectionalLight:Obj,
  BufferGeometry:Geo,BufferAttribute:Geo,Points:Mesh,PointsMaterial:Mat,Group:Obj,Color:class{constructor(v){this.value=v}},CanvasTexture:class{dispose(){}},MeshStandardMaterial:Mat,MeshBasicMaterial:Mat,SpriteMaterial:Mat,
  SphereGeometry:Geo,CylinderGeometry:Geo,Mesh,Sprite,Vector3:Vec,Vector2:Vec,Raycaster:class{setFromCamera(){}intersectObjects(){return[]}}}});
 ctx.window=ctx;vm.createContext(ctx);
 for(const path of ['grok/sense-id.js','grok/related-links.js','grok/universe-progress.js','grok/word-universe.js'])vm.runInContext(fs.readFileSync(path,'utf8'),ctx,{filename:path});
 return ctx;
}

const storage={vocabSpotlight_v1:JSON.stringify({cards:{'gaokao|0::advantage':{state:'learning',mastery:0.5,reps:1,scheduledAt:1}}})};
const ctx=makeRuntime(storage),get=()=>ctx.QuizMarioWordUniverse.currentGraph().lemmas.find(n=>n.word==='advantage');
assert.equal(get().mastery,0.5);
assert.equal(ctx.QuizMarioWordUniverse.currentGraph().themes.length,3);
assert.ok(ctx.QuizMarioWordUniverse.currentGraph().lemmas.every(r=>r.visual.hue===184));
storage.vocabSpotlight_v1=JSON.stringify({cards:{'gaokao|0::advantage':{state:'learning',mastery:1,reps:2,scheduledAt:2}}});
ctx.dispatchEvent({type:'storage',key:'vocabSpotlight_v1'});
assert.equal(get().mastery,1);
storage.vocabSpotlight_v1=JSON.stringify({cards:{'gaokao|0::advantage':{state:'learning',mastery:0,wrong:1,scheduledAt:3}}});
ctx.dispatchEvent({type:'quizmario:progress'});assert.equal(get().mastery,0);
console.log('universe-renderer: mounted 3D scene data refreshes on storage and progress events');

import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
class Element {
  constructor(){this.children=[];this.handlers={};this.textContent='';}
  append(...v){this.children.push(...v);}
  replaceChildren(){this.children=[];}
  addEventListener(key,fun){this.handlers[key]=fun;}
}
const home=new Element(), root=new Element(), first='a', second='b';
let owner=first, auth, pending=[], timers=[];
const query={select(){return this;},eq(){return this;},order(){return this;},
  range(){return new Promise(resolve=>pending.push(resolve));}};
root.QuizMarioCloud={userId:()=>owner};
root.QuizMarioCloudClient={client:()=>({from:()=>query,auth:{onAuthStateChange:f=>auth=f}})};
vm.runInNewContext(fs.readFileSync(new URL('../grok/als-learning-history.js',import.meta.url),'utf8'),
 {document:{getElementById:id=>id==='screen-home'?home:null,createElement:()=>new Element()},window:root,setTimeout:f=>timers.push(f)});
const panel=home.children[0],list=panel.children[2];
const row=id=>({learner_id:id,user_id:id,headword:'test',created_at:new Date().toISOString(),payload:{status:'verified',stage:'Repair',passed:false}});
auth('INITIAL_SESSION',{user:{id:first}});panel.open=true;panel.handlers.toggle();
owner=second;auth('',{user:{id:second}});
pending.shift()({data:[row(first)]});
await new Promise(r=>setImmediate(r));
assert.equal(list.children.length,0);
timers.shift()();
pending.shift()({data:[row(first),row(second)]});
await new Promise(r=>setImmediate(r));
assert.equal(list.children.length,1);assert.match(list.children[0].textContent,/未通过/);
auth('',null);
assert.equal(list.children.length,0);
console.log('Student view enforces ownership after switches, late replies and logout.');

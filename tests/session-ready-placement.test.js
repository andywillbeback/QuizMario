'use strict';
const assert=require('assert'),vm=require('vm'),fs=require('fs'),path=require('path');
const src=fs.readFileSync(path.join(__dirname,'../game.js'),'utf8');
const callback=src.slice(src.indexOf('  window.__QM.onSessionReady = function () {'),src.indexOf('  function markMust(',src.indexOf('  window.__QM.onSessionReady = function () {')));
function run({play,home,needsPlacement}){const calls=[];const ctx={window:{__QM:{}},sessionKind:'placement',playGen:0,currentNeedsPlacement:()=>needsPlacement,
 $:id=>({classList:{contains:()=>id==='screen-play'?play:home}}),stopChallenge:()=>calls.push('stop'),hidePlacementNote:()=>calls.push('hide'),showScreen:name=>calls.push(name),refreshHomeQueues:()=>calls.push('queues'),dismissMustGate:()=>calls.push('dismiss')};
 vm.createContext(ctx);vm.runInContext(callback,ctx);ctx.window.__QM.onSessionReady();return calls;}
assert.ok(!run({play:false,home:false,needsPlacement:false}).includes('home'),'a delayed login callback cannot dismiss the completed starting-set offer');
assert.ok(run({play:true,home:false,needsPlacement:false}).includes('home'),'an obsolete running probe still stops when cloud placement is already complete');
assert.ok(!run({play:true,home:false,needsPlacement:true}).includes('home'),'an incomplete probe remains in progress');
assert.ok(run({play:false,home:true,needsPlacement:false}).includes('queues'),'home queue refresh still runs');
console.log('session-ready-placement ok: late sync preserves completed placement results');

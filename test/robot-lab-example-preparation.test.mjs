// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
import test from 'node:test';import assert from 'node:assert/strict';import{readFileSync}from'node:fs';
const source=readFileSync(new URL('../overlay/scratch-gui/src/components/tw-pseudocode/sim-lab-pane.jsx',import.meta.url),'utf8');
const method=source.slice(source.indexOf('    async openShipped ('),source.indexOf('    /** The gallery uses'));
const openShipped=new Function('fetch','modelKey',`return ({${method}}).openShipped;`)(async()=>({ok:true,text:async()=> 'model text'}),m=>m.file);
const make=(mat=null)=>{
 const builds=[],events=[],busy=[],entry={file:'example.ldr',mat:'wall',example:'example.bw',title:{en:'Example'}};
 const p={lib:{MODELS:[entry]},state:{mat,status:'ready'},session:{worker:true},locale:'en',props:{onSetProjectTitle:t=>events.push(t)},pause(){events.push('pause');},setState(next,done){Object.assign(this.state,next);queueMicrotask(()=>done?.());},
  async openText(_text,_name,_key,options){busy.push(Boolean(options?.programLoading));builds.push(this.state.mat);this.session={worker:true};this.state.status='ready';},
  async loadExample(){events.push('program');if(this.state.mat!==entry.mat){this.state.mat=entry.mat;await this.openText();}},text:{exampleOffer:'offer'},withIntro:x=>x,shippedModel:()=>entry,spikeLoaded:()=>true};
 return{p,builds,events,busy};
};
test('dropdown prepares the example mat before one model build and program import',async()=>{
 const{p,builds,events,busy}=make();await openShipped.call(p,'example.ldr',{includeProgram:true,updateTitle:true});assert.deepEqual(builds,['wall'],'no transient model on the wrong mat or second worker teardown after Blocks load');assert.deepEqual(events,['pause','program','Example']);assert.deepEqual(busy,[true],'keep controls busy across model preparation and Blocks import');
});
test('model-only API load preserves the caller mat and leaves its program alone',async()=>{
 const{p,builds,events}=make('line-oval');await openShipped.call(p,'example.ldr');assert.deepEqual(builds,['line-oval']);assert.deepEqual(events,[]);
});
test('an automatic example mat change ends the challenge on the previous mat',async()=>{
 const {p,builds}=make('sumo');p.state.challenge='sumo-stay';p.lib.CHALLENGES=[{id:'sumo-stay',mat:'sumo'}];let ended=0;
 p.endChallenge=()=>{ended++;p.state.challenge=null;};
 await openShipped.call(p,'example.ldr',{includeProgram:true});assert.equal(ended,1);assert.equal(p.state.challenge,null);assert.deepEqual(builds,['wall']);
});

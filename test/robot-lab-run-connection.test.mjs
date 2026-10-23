// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../overlay/scratch-gui/src/components/tw-pseudocode/sim-lab-pane.jsx',import.meta.url),'utf8');
const method=(start,end,name)=>new Function('window','HUB_EXTENSIONS',`return ({${source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start)))}}).${name}`)({},{});
const methods={bt:method('    async runBt (','    /** A blocks example','runBt'),radio:method('    async runRadioHub (','    componentWillUnmount','runRadioHub'),spike:method('    async run ({','    /** Puts the current model','run')};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject};};
const fixture=(kind,connect=async()=>{})=>{
 const events=[],commits=[];let pending=false;
 const p={session:{},state:{status:'ready'},hub:{setSimulationEnabled(){}},spikeScene:()=>true,spikeLoaded:()=>true,
  robotLabLoaded:()=>false,rcxHub:()=>null,radioHub:()=>null,btProfile:()=>kind==='bt'?'ev3':null,
  hubExtension:()=> 'legopoweredup',stopClock(){events.push('stopClock')},startClock(){events.push('startClock')},
  props:{vm:{extensionManager:{isExtensionLoaded:()=>true},runtime:{peripheralExtensions:{}},greenFlag(){events.push('greenFlag')}}},
  setState(next,done){commits.push({next,done});if(!pending){pending=true;setImmediate(()=>{
   pending=false;const batch=commits.splice(0);for(const {next}of batch)Object.assign(p.state,next);
   for(const {done}of batch)done?.();
  });}},
  lib:{EV3_PERIPHERAL_ID:'virtual-ev3',async connectVirtualHub(){events.push('connect');await connect()},
   async connectVirtualSpike(){events.push('connect');await connect()}},
  async connectRadioHub(){events.push('connect');await connect()},
  text:{},t:(_key,{error}={})=>error};
 return {p,events,run:options=>kind==='radio'?methods[kind].call(p,{},options):methods[kind].call(p,options)};
};
for(const kind of ['bt','radio','spike']){
 test(`${kind}: a fast connection starts clock and program after the actual React commit`,async()=>{
  const {p,events,run}=fixture(kind);await run();await tick();
  assert.equal(p.state.status,'running');assert.deepEqual(events,['stopClock','connect','startClock','greenFlag']);
 });
 test(`${kind}: greenFlag false starts only the clock`,async()=>{
  const {events,run}=fixture(kind);await run({greenFlag:false});await tick();
  assert.deepEqual(events,['stopClock','connect','startClock']);
 });
 for(const replacement of [false,true])test(`${kind}: ${replacement?'model replacement':'Stop'} during connection cannot revive the run`,async()=>{
  const d=deferred(),{p,events,run}=fixture(kind,()=>d.promise),operation=run();await tick();await tick();
  assert.ok(events.includes('connect'));
  if(replacement)p.session={};else p.setState({status:'paused'});
  await tick();d.resolve();await operation;await tick();
  assert.ok(!events.includes('startClock'));assert.ok(!events.includes('greenFlag'));
 });
 test(`${kind}: Stop before the running commit prevents connection and startup`,async()=>{
  const {p,events,run}=fixture(kind),operation=run();p.setState({status:'paused'});await operation;await tick();
  assert.equal(p.state.status,'paused');assert.deepEqual(events,['stopClock']);
 });
 test(`${kind}: a replaced model cannot receive an old connection error`,async()=>{
  const d=deferred(),{p,events,run}=fixture(kind,()=>d.promise),operation=run();await tick();await tick();
  p.session={};p.state.message='new scene';d.reject(Error('old connection failed'));await operation;await tick();
  assert.equal(p.state.message,'new scene');assert.ok(!events.includes('startClock'));assert.ok(!events.includes('greenFlag'));
 });
 test(`${kind}: a current connection failure preserves the established route behavior`,async()=>{
  const {p,events,run}=fixture(kind,async()=>{throw Error('connection refused')});await run();await tick();
  assert.equal(p.state.message,'connection refused');
  assert.equal(events.includes('startClock'),kind==='bt');assert.equal(events.includes('greenFlag'),kind==='bt');
 });
}

for(const kind of ['bt','radio','spike']){
 test(`${kind}: a newer Run owns startup even after an older connection completes`,async()=>{
  const d=deferred();let calls=0;
  const {p,events,run}=fixture(kind,()=>++calls===1?d.promise:Promise.resolve()),old=run();
  await tick();await tick();p.setState({status:'paused'});await tick();
  await run();await tick();assert.equal(events.filter(e=>e==='greenFlag').length,1);
  d.resolve();await old;await tick();
  assert.equal(events.filter(e=>e==='greenFlag').length,1);assert.equal(events.filter(e=>e==='startClock').length,1);
 });
 test(`${kind}: manual Drive cannot be replaced by a pending program connection`,async()=>{
  const d=deferred(),{p,events,run}=fixture(kind,()=>d.promise),operation=run();
  await tick();await tick();p.setState({status:'running',manualOverride:true});await tick();
  d.resolve();await operation;await tick();
  assert.ok(!events.includes('startClock'));assert.ok(!events.includes('greenFlag'));
 });
 test(`${kind}: model replacement before the React commit prevents connection`,async()=>{
  const {p,events,run}=fixture(kind),operation=run();p.session={};await operation;await tick();
  assert.deepEqual(events,['stopClock']);
 });
}

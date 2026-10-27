// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';import {createHash} from 'node:crypto';
import {qualificationContracts,QUALIFICATION_JUDGES,disconnectedSource,issueKeys,actuatorState,assertFinalHold} from '../scripts/lib/robot-lab-qualification.mjs';
import {HUBLESS_DISCONNECTION_LOSSES} from '../scripts/lib/sim-lab-hubless-judges.mjs';
import {toggleLeverLawErrorDeg} from '../scripts/lib/sim-lab-toggle-thirdline-judge.mjs';
import {batch2DisconnectionLoss} from '../scripts/lib/sim-lab-batch2-judges.mjs';
import {catalogFrom,prepareModel,MODELS} from '../overlay/scratch-gui/src/lib/bw-sim/sim-session.js';
import {runRobotLabProgram} from './helpers/robot-lab-direct-vm.mjs';import {observeAddon} from '../scripts/lib/sim-lab-addon-judge.mjs';
import Creator from '../overlay/scratch-gui/src/lib/sb3-creator-register-art.js';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8'),lab='overlay/scratch-gui/static/sim-lab/',catalog=catalogFrom(JSON.parse(read('overlay/scratch-gui/src/lib/bw-sim/part-meta/parts.json')));
const selected=process.env.BW_MODEL_QUALIFY_MODELS?.split(',');
test('qualification refuses unknown principles, missing models and incomplete disconnections',()=>{
 assert.throws(()=>qualificationContracts(['invented-pass']));assert.throws(()=>qualificationContracts([]));assert.throws(()=>disconnectedSource('0 model\n',['missing']));
});
const run=async(c,modelText,autoPorts,label=autoPorts===false?'strict':'ordinary')=>{
 const errors=[];let hooked=false;const r=await runRobotLabProgram(read(lab+'programs/'+c.id+'.bw'),{...c,modelText,autoPorts,observeFrame:({session,vm,hub})=>{
  if(!hooked){vm.runtime.on('ERROR',e=>errors.push(String(e)));vm.runtime.on('BLOCKS_ERROR',e=>errors.push(String(e)));hooked=true;}
  for(const b of vm.runtime.targets.flatMap(t=>Object.values(t.blocks._blocks))){const literal=Object.keys(b.fields||{}).length===1&&Object.keys(b.inputs||{}).length===0;assert.ok(b.opcode in vm.runtime._primitives||b.opcode in vm.runtime._hats||literal,'actual registered opcode: '+b.opcode);}
  return{variables:Object.fromEntries(vm.runtime.targets.flatMap(t=>Object.values(t.variables||{}).map(v=>[v.name,v.value]))),modes:hub.motors._controllers.map(c=>c.mode),actuators:actuatorState(session),sessionFailed:session.failed?String(session.failed):null,...(c.observeAir?{air:session.core.airState?session.core.airState():[]}:{})};
 }});if(process.env.BW_MODEL_QUALIFY_EVIDENCE_DIR){const dir=process.env.BW_MODEL_QUALIFY_EVIDENCE_DIR;mkdirSync(dir,{recursive:true});writeFileSync(dir+'/'+c.id+'-'+label+'.json',JSON.stringify(r)+'\n');}assert.deepEqual(errors,[]);assert.ok(r.track.every(f=>!f.extra.sessionFailed));return r;
};
for(const c of qualificationContracts(selected).filter(c=>!c.nativeSuite)){
 const source=read(lab+'models/'+c.id+'.ldr'),program=read(lab+'programs/'+c.id+'.bw'),judge=r=>QUALIFICATION_JUDGES[c.judge](r,{native:true,contract:c});
 test(c.id+': exact source, licence, topology, compiler, unassisted equality and complete registration',()=>{
  const dir='test/fixtures/model-files/'+c.id+'-source/',provenance=JSON.parse(read(dir+'provenance.json'));
  for(const [file,hash]of Object.entries(provenance.files))assert.equal(createHash('sha256').update(read(dir+file)).digest('hex'),hash);
  assert.equal(source,read(dir+(c.id==='quartermaster'?'quartermaster.ldr':'models/'+c.id+'.ldr')));assert.equal(program,read(dir+(c.id==='quartermaster'?'quartermaster.bw':'programs/'+c.id+'.bw')));
  assert.match(source,/^0 Author: CrispStrobe$/m);assert.match(read(lab+'licenses/'+c.id+'.txt'),/BSD 3-Clause License/);
  const entry=MODELS.find(m=>m.file===c.id+'.ldr');assert.ok(entry);assert.equal(entry.example,c.id+'.bw');if(c.motorless)assert.equal(entry.manualJog,undefined,'nothing to jog');else assert.ok(entry.manualJog);
  const p=prepareModel(source,catalog),strict=prepareModel(source,catalog,{autoPorts:false});assert.deepEqual(p,strict);assert.deepEqual(issueKeys(p.issues),issueKeys(c.expectedIssues||[]));assert.equal(p.model.parts.length,c.parts);assert.deepEqual(p.mechanism.actuators.map(a=>a.port).sort(),c.ports);
  const creator=new Creator();creator.parse(program);assert.deepEqual(creator.errors||[],[]);assert.deepEqual(creator.warnings||[],[]);
 });
 for(const autoPorts of [undefined,false])test(c.id+': '+(autoPorts===false?'strict':'ordinary')+' real VM, passive laws, frozen-output and world-drift controls',async t=>{
  const r=await run(c,source,autoPorts);t.diagnostic(JSON.stringify({id:c.id,result:judge(r)}));
  const last=r.track.at(-1);assertFinalHold(c,last);assert.equal(r.hubId===null,Boolean(c.hubless),'hubless exactly when the model has no hub');
  const frozen=structuredClone(r),body=r.mechanism.bodies.find(b=>b.parts.includes(c.frozenOutput));for(const f of frozen.track)f.bodies[body.id]=structuredClone(frozen.track[0].bodies[body.id]);assert.throws(()=>judge(frozen),'a stationary output cannot pass');
  const shifted=structuredClone(r);for(const b of Object.values(shifted.track.at(-1).bodies))b.position[0]+=.01;assert.throws(()=>judge(shifted),/stationary chassis/,'relative output laws do not hide world drift');
 });
 test(c.id+': physical disconnection destroys the intended output while the real input still completes',async t=>{
  const r=await run(c,disconnectedSource(source,c.disconnect),false,'disconnected'),o=observeAddon(r,c.observeBase??'hub'),input=c.motorless?null:r.mechanism.joints.find(j=>j.motor?.port===c.ports[0]),travel=input?Math.max(...r.track.map(f=>Math.abs(f.joints[input.id].angle)))*180/Math.PI:0;
  assert.ok(r.finishedAt>0);if(!c.motorless)assert.ok(travel>(c.disconnectInputDeg??(c.id==='sine-shuttle'?1070:1430)),'input genuinely still turns');
  let motion;
  if(c.id==='sine-shuttle'){
   const v=o.initial('guide_x_-100',[20,0,0]).map((x,i)=>x-o.initial('guide_x_-100')[i]),len=Math.hypot(...v),axis=v.map(x=>x/len),dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0);
   const points=r.track.map(f=>dot(o.point(f,c.frozenOutput).map((x,i)=>x-o.point(f,'crank')[i]),axis)*1000);
   motion=Math.max(...points)-Math.min(...points);
   // A detached carriage can drift or hit something. The causal requirement is
   // loss of the declared 31..33 mm cosine stroke, not an invented frozen pose.
   assert.ok(motion<31,'disconnection loses the original minimum useful stroke');
   assert.ok(Math.max(...r.track.map((f,i)=>Math.abs(points[i]-16*Math.cos(f.joints[input.id].angle))))>.5,'the original cosine-law bound rejects the disconnected mechanism');
  }
  // A detached yoke, link and lever form a free chain that can drift; the causal requirement is
  // loss of the declared closure law (within 2.5° when connected), not an invented frozen pose.
  else if(c.id==='toggle-lever'){motion=toggleLeverLawErrorDeg(r);assert.ok(motion>5,'without the crank pin the lever leaves the toggle closure law');}
  else if(c.id==='thirdline'){const un=a=>{let p=a[0],s=p;return a.map(v=>{s+=Math.atan2(Math.sin(v-p),Math.cos(v-p));p=v;return s;});},din=un(r.track.map(f=>o.angle(f,'input_arm',[0,1,0],[1,0,0]))),dru=un(r.track.map(f=>o.angle(f,c.frozenOutput,[0,1,0],[1,0,0])));motion=Math.max(...r.track.map((f,i)=>Math.abs((dru[i]-dru[0])-(din[i]-din[0])/3)))*180/Math.PI;assert.ok(motion>.5,'without the marked joint the ruler leaves the one-third law');}
  // Second batch: each law has its own measured loss (see sim-lab-batch2-judges.mjs for the thresholds).
  // Hubless and motorless models: the judge module measures each law's own loss (sim-lab-hubless-judges.mjs).
  else if(c.disconnectLaw&&Object.hasOwn(HUBLESS_DISCONNECTION_LOSSES,c.id)){const loss=HUBLESS_DISCONNECTION_LOSSES[c.id](r);motion=loss.value;assert.ok(loss.lost,'disconnection loses the law: '+JSON.stringify(loss));}
  else if(c.disconnectMeasure){const loss=batch2DisconnectionLoss(c.id,r);motion=loss.value;assert.ok(loss.lost,'disconnection loses the law: '+loss.metric+' '+loss.value);}
  else{const j=r.mechanism.joints.find(j=>!j.motor&&j.body2===o.body(c.frozenOutput).id);const angles=r.track.map(f=>o.angle(f,c.frozenOutput,j.axis,[0,0,1]));motion=(Math.max(...angles)-Math.min(...angles))*180/Math.PI;assert.ok(motion<1,'wheel loses indexing without the roller');}
  assert.throws(()=>judge(r));t.diagnostic(JSON.stringify({id:c.id,inputTravelDeg:travel,disconnectedOutputMotion:motion}));
 });
}

// Negative controls for the hubless/motorless path: the new branches still refuse broken models.
const frame=(actuators,busy={},modes=[])=>({busy,extra:{actuators,modes}});
test('hubless hold check reads the lab-direct controller and refuses an unheld, busy or hub-driven model',()=>{
 const hubless={id:'x',hubless:true,ports:['A']},hubbed={id:'y',ports:['A']},motorless={id:'z',motorless:true,ports:[]};
 assert.doesNotThrow(()=>assertFinalHold(hubless,frame({driver:'lab-direct',modes:{A:'hold'},busy:{A:false}})));
 for(const mode of ['brake','coast','position','speed','power'])assert.throws(()=>assertFinalHold(hubless,frame({driver:'lab-direct',modes:{A:mode},busy:{A:false}})),/held/);
 assert.throws(()=>assertFinalHold(hubless,frame({driver:'lab-direct',modes:{A:'hold'},busy:{A:true}})),/finished/);
 assert.throws(()=>assertFinalHold(hubless,frame({driver:'hub'},{A:false},['hold'])),/lab-direct/,'a hub reading never stands in for lab-direct');
 assert.throws(()=>assertFinalHold(hubless,frame({driver:'lab-direct',modes:{A:'hold',B:'hold'},busy:{A:false,B:false}})),/exactly the contract ports/);
 assert.throws(()=>assertFinalHold(hubless,frame(undefined)),/actuator state/);
 // Hub models keep exactly their reviewed check.
 assert.doesNotThrow(()=>assertFinalHold(hubbed,frame({driver:'hub'},{A:false},['hold'])));
 assert.throws(()=>assertFinalHold(hubbed,frame({driver:'hub'},{A:false},['idle'])));
 assert.throws(()=>assertFinalHold(hubbed,frame({driver:'hub'},{A:true},['hold'])));
 assert.throws(()=>assertFinalHold(hubbed,frame({driver:'lab-direct',modes:{A:'hold'},busy:{A:false}},{A:false},['hold'])),/not driven by lab-direct/);
 assert.doesNotThrow(()=>assertFinalHold(motorless,frame({driver:'hub'})));
 assert.throws(()=>assertFinalHold(motorless,frame({driver:'hub'},{A:false})),/no driven port/);
});
test('actuatorState reads the session lab-direct controller, not an assumed hub',()=>{
 const motors=new Map([['A',{mode:'hold'}]]),waiters=new Map();
 assert.deepEqual(actuatorState({hubs:[{profile:'lab-direct',hub:{motors,waiters}}]}),{driver:'lab-direct',modes:{A:'hold'},busy:{A:false}});
 waiters.set('A',{});assert.equal(actuatorState({hubs:[{profile:'lab-direct',hub:{motors,waiters}}]}).busy.A,true);
 assert.deepEqual(actuatorState({hubs:[{profile:'spike-prime',hub:{}}]}),{driver:'hub'});assert.deepEqual(actuatorState({hubs:[]}),{driver:'none'});
});
test('contract validation refuses undeclared hubless or motorless shapes',()=>{
 const data=JSON.parse(read('docs/data/robot-lab-qualification.json'));
 for(const c of data.models.filter(c=>!c.hubless&&!c.motorless)){assert.equal(c.observeBase,undefined);assert.ok(c.ports.length>=1,'existing models keep a driven port');}
 const pv=data.models.find(c=>c.id==='pivot-exchange');assert.ok(pv?.motorless&&pv.ports.length===0&&!pv.hubless);
 assert.deepEqual(pv.expectedIssues,[{code:'no-motor',parts:[]}]);for(const c of data.models.filter(c=>!c.motorless))assert.ok(!(c.expectedIssues||[]).some(i=>i.code==='no-motor'));
});
// The hubless path end to end on the real experimental Phasor Twin (not promoted: its bytes fail the
// established construction gate). The hub reading that misjudged it stays wrong; the lab-direct reading holds.
const PHASOR={id:'phasor-twin',judge:'stirling-quadrature-v1',ports:['A'],hubless:true,observeBase:'base_cross_60',coldMs:500,timeLimitMs:60000,afterMs:500,frameMs:20,frozenOutput:'pistonrod_B',disconnect:['conrod_B','wristpin_B']};
if(!selected)test('hubless path: experimental Phasor Twin passes its law and hold, and its disconnection is refused',async t=>{
 const source=read(lab+'models/phasor-twin.ldr'),r=await run(PHASOR,source,false,'hubless-experimental'),last=r.track.at(-1);
 assert.equal(r.hubId,null);const result=QUALIFICATION_JUDGES[PHASOR.judge](r,{native:true});assertFinalHold(PHASOR,last);
 assert.notEqual(last.extra.modes[0],'hold','the hub controller reading never sees the lab-direct hold');
 assert.throws(()=>assertFinalHold({...PHASOR,hubless:undefined},last),/not driven by lab-direct/);
 const d=await run(PHASOR,disconnectedSource(source,PHASOR.disconnect),false,'hubless-experimental-disconnected'),loss=HUBLESS_DISCONNECTION_LOSSES[PHASOR.id](d);
 assert.ok(loss.lost,JSON.stringify(loss));assert.throws(()=>QUALIFICATION_JUDGES[PHASOR.judge](d,{native:true}));
 t.diagnostic(JSON.stringify({result,disconnected:loss}));
});

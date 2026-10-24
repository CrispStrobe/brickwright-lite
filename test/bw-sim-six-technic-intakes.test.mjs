// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {gzipSync} from 'node:zlib';
import {runReviewedIntake} from './helpers/robot-lab-reviewed-intake.mjs';
import {runRobotLabProgram} from './helpers/robot-lab-direct-vm.mjs';
import {judgeReviewedIntake} from '../scripts/lib/sim-lab-six-intake-judge.mjs';
import {SIX_INTAKES,intakeRead,intakeHash} from '../scripts/lib/sim-lab-six-intake-contracts.mjs';
import {catalogFrom,prepareModel,MODELS} from '../overlay/scratch-gui/src/lib/bw-sim/sim-session.js';
import {solidOverlaps} from '../overlay/scratch-gui/src/lib/bw-sim/editor/overlap.js';
import {buildSteps} from '../overlay/scratch-gui/src/lib/bw-sim/instructions/steps.js';
import {adaptedTechnicProgram} from '../scripts/adapt-six-technic-models.mjs';
import {compactAtlasProgram,assertAtlasFinalSettling,ATLAS_FINAL_SETTLING_MS} from '../scripts/lib/sim-lab-atlas-program.mjs';
import Creator from '../overlay/scratch-gui/src/lib/sb3-creator-register-art.js';
const selected=process.env.BW_MODEL_QUALIFY_MODELS?.split(','),catalog=catalogFrom(JSON.parse(intakeRead('overlay/scratch-gui/src/lib/bw-sim/part-meta/parts.json')));
const counts={'rod-ratio':167,'vernier-drive':176,'line-turner':145,'dune-strider':202,'atlas-six':676,oblique:291};
for(const id of SIX_INTAKES.filter(id=>!selected||selected.includes(id))){
 test(id+': exact provenance, supported parts, retained structure and connected construction',()=>{
  const prefix='test/fixtures/model-files/'+id+'-source/',provenance=JSON.parse(intakeRead(prefix+'provenance.json'));
  assert.equal(provenance.license,'BSD-3-Clause');for(const [file,hash]of Object.entries(provenance.files))assert.equal(intakeHash(intakeRead(prefix+file)),hash,file);
  const source=intakeRead('overlay/scratch-gui/static/sim-lab/models/'+id+'.ldr').toString(),original=intakeRead(prefix+'models/'+id+'.ldr').toString();
  let expected=original.replace('see ../LICENSE.txt','see ../licenses/'+id+'.txt').replace('see ../LICENSE','see ../licenses/'+id+'.txt');
  if(id==='rod-ratio')for(const x of [100,300])for(const y of [60,80])expected=expected.replace(`0 !BW ID long_post_pin_${x}_${y}\n1 1 ${x} ${y} 185 0 1 0 0 0 1 1 0 0 6558.dat`,`0 !BW ID long_post_pin_${x}_${y}\n1 1 ${x} ${y} 190 0 1 0 0 0 1 1 0 0 6558.dat`);
  if(id==='oblique')expected=expected.replace('1 72 -160 -280 -120 0 0 1 0 1 0 -1 0 0 32524.dat','1 72 -170 -275 -120 0 0 1 0 1 0 -1 0 0 32063.dat');
  assert.equal(source,expected,'only the declared pin-collar, brace and licence-pointer adaptations');
  assert.equal(intakeRead('overlay/scratch-gui/static/sim-lab/programs/'+id+'.bw').toString(),adaptedTechnicProgram(id),'Only the declared program adaptation is admitted');
  const ordinary=prepareModel(source,catalog),strict=prepareModel(source,catalog,{autoPorts:false});assert.deepEqual(ordinary,strict);assert.deepEqual(strict.issues,[]);assert.equal(strict.model.parts.length,counts[id]);
  const ports=id==='atlas-six'?[...'ABCDEF']:id==='oblique'?['A','B']:['A'];assert.deepEqual(strict.mechanism.actuators.map(a=>a.port).sort(),ports);
  for(const part of strict.model.parts)assert.deepEqual(solidOverlaps(strict.model,catalog,part),[],part.id);
  if(id==='atlas-six'){
   const originalMeta=JSON.parse(intakeRead(prefix+'validation/catalog-admission.json')).entries.find(e=>e.part==='32195a.dat').meta,current=catalog.get('32195a.dat');
   assert.equal(current.massGrams,originalMeta.massGrams);assert.deepEqual(current.connectors,originalMeta.connectors,'all original physical socket and bore definitions remain');
   const socket=strict.model.parts.find(p=>p.id==='base_socket_a'),insert=strict.model.parts.find(p=>p.id==='base_socket_a_insert');
   const throughWall={...insert,position:insert.position.map((v,k)=>v+15*socket.rotation[k*3])};
   const wrong={...strict.model,parts:strict.model.parts.map(p=>p.id===insert.id?throughWall:p)};
   assert.ok(solidOverlaps(wrong,catalog,throughWall).some(h=>h.part===socket.id),'the fork walls remain solid when an insert moves out of its real opening');
   const bush={id:'open-end-probe',part:'3713.dat',color:0,rotation:socket.rotation,position:socket.position.map((v,k)=>v+55*socket.rotation[k*3+2])};
   assert.deepEqual(solidOverlaps({...strict.model,parts:[socket,bush]},catalog,bush),[],'the two separate stock eye ends do not invent a central crossbar');
  }
  if(id==='oblique'){
   const brace=strict.model.parts.find(p=>p.id==='gantry_-1_-120_roof_extension'),old={...brace,part:'32524.dat',position:[-160,-280,-120]};
   const wrong={...strict.model,parts:strict.model.parts.map(p=>p.id===brace.id?old:p)};
   assert.ok(solidOverlaps(wrong,catalog,old).some(h=>h.part==='motor_B'),'restoring the overhanging brace reproduces the original motor-clearance failure');
  }
  const plan=buildSteps(strict.model,catalog);assert.equal(new Set(plan.steps.flatMap(s=>s.parts)).size,counts[id]);assert.ok(plan.steps.every(s=>!s.loose));
  const entry=MODELS.find(m=>m.file===id+'.ldr');assert.equal(entry.example,id+'.bw');assert.deepEqual(Object.keys(entry.manualJog).sort(),ports);
 });
 for(const [label,frameMs,autoPorts]of [['ordinary',25,undefined],['browser-cadence',1000/30,false]])test(id+': '+label+' real VM, original full native gates and frozen-output control',async t=>{
  const {record,contract}=await runReviewedIntake(id,{frameMs,autoPorts});
  const directory=process.env.BW_MODEL_QUALIFY_EVIDENCE_DIR;
  if(directory){mkdirSync(directory,{recursive:true});writeFileSync(directory+'/'+id+'-'+label+'.json.gz',gzipSync(Buffer.from(JSON.stringify(record))));}
  const metrics=await judgeReviewedIntake(id,record,{native:true,contract});t.diagnostic(JSON.stringify({id,label,metrics}));
  if(id==='atlas-six')assertAtlasFinalSettling(record);
  assert.ok(record.track.every(f=>!f.extra.sessionFailed));assert.ok(Object.values(record.track.at(-1).extra.modes).every(mode=>mode==='hold'));
  // The original per-model observers also exercise physical internal comparisons.
  // Freeze every genuinely moving output body together in a copied observation:
  // the unchanged real run must be distinguishable from a stationary machine.
  const frozen=structuredClone(record);let changed=0;
  for(const b of record.mechanism.bodies.filter(b=>b.parts.length)){
   const first=record.track[0].bodies[b.id],last=record.track.at(-1).bodies[b.id];
   if(!first||!last)continue;
   const travels=record.track.some(f=>Math.hypot(...f.bodies[b.id].position.map((v,k)=>v-first.position[k]))>.001||f.bodies[b.id].rotation.some((v,k)=>Math.abs(v-first.rotation[k])>.01));
   if(travels){for(const f of frozen.track)f.bodies[b.id]=structuredClone(first);changed++;}
  }
  assert.ok(changed>0,'actual moving bodies were observed');await assert.rejects(()=>judgeReviewedIntake(id,frozen,{native:true,contract}));
 });
}
if(!selected||selected.includes('atlas-six'))test('Atlas Six compaction preserves original stages and motion receivers while halving compiled blocks',async t=>{
 const original=intakeRead('test/fixtures/model-files/atlas-six-source/programs/atlas-six.bw').toString(),compacted=adaptedTechnicProgram('atlas-six');
 assert.throws(()=>compactAtlasProgram(original.replace('targetA to 239.826764405','targetA to 239.826764406')),/reviewed original/);
 assert.equal(compacted.slice(compacted.indexOf('WHEN I receive "move all six":')),original.slice(original.indexOf('WHEN I receive "move all six":')),'All six feedback receivers, fail-all and watchdog remain byte-identical');
 const stages=source=>[...source.matchAll(/^  set (?:stage|target[A-F]|settled|completed|failed) to .+$/gm)].map(m=>m[0]);
 assert.deepEqual(stages(compacted),stages(original),'Every ordered stage, target, join/settled and terminal assignment remains');
 assert.equal((compacted.match(/^  broadcast "prepare all six" and wait$/gm)||[]).length,27);
 const counts=[];
 for(const source of [original,compacted]){
  const creator=new Creator();creator.parse(source);await creator.generateSB3();
  assert.equal(creator.validate().isValid,true);assert.deepEqual(creator.warnings||[],[]);assert.deepEqual(creator.unparsed||[],[]);
  counts.push(creator.project.targets.reduce((n,target)=>n+Object.keys(target.blocks||{}).length,0));
 }
 assert.ok(counts[1]<=counts[0]/2,'The saved graph must contain at most half as many compiled blocks');
 t.diagnostic(JSON.stringify({originalBlocks:counts[0],compactedBlocks:counts[1]}));
});
if(!selected||selected.includes('atlas-six'))test('Atlas Six completion requires a real final settling second on every held port',()=>{
 assert.equal(ATLAS_FINAL_SETTLING_MS,1000);
 const events=[...'ABCDEF'].map((port,i)=>({name:'stopMotor',args:[port,'hold'],t:100+i*5}));
 assert.doesNotThrow(()=>assertAtlasFinalSettling({apiEvents:events,finishedAt:1125}));
 assert.throws(()=>assertAtlasFinalSettling({apiEvents:events,finishedAt:1100}),/settling second/);
 assert.throws(()=>assertAtlasFinalSettling({apiEvents:events.slice(0,5),finishedAt:1125}),/six real motors/);
 assert.throws(()=>assertAtlasFinalSettling({apiEvents:events.map(e=>({...e,args:[e.args[0],'coast']})),finishedAt:1125}),/six real motors/);
});
if(!selected||selected.includes('line-turner'))test('native API observer preserves every actual body and joint trajectory',async()=>{
 const {record}=await runReviewedIntake('line-turner',{frameMs:25,autoPorts:false});
 const plain=await runRobotLabProgram(intakeRead('overlay/scratch-gui/static/sim-lab/programs/line-turner.bw').toString(),{
  modelText:intakeRead('overlay/scratch-gui/static/sim-lab/models/line-turner.ldr').toString(),autoPorts:false,frameMs:25,coldMs:1000,afterMs:1000,timeLimitMs:70000});
 const physical=r=>r.track.map(({t,phase,bodies,joints})=>({t,phase,bodies,joints}));
 assert.deepEqual(physical(record),physical(plain),'observer reads never change native motion or VM command timing');
});

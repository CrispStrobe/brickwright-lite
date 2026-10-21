// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
import {test} from 'node:test';
import Creator from '../overlay/scratch-gui/src/lib/sb3-creator-register-art.js';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {catalogFrom,prepareModel} from '../overlay/scratch-gui/src/lib/bw-sim/sim-session.js';
import {parseModel,serializeModel} from '../overlay/scratch-gui/src/lib/bw-sim/model/ldraw-model.js';
import {buildSteps,STEP_MAX} from '../overlay/scratch-gui/src/lib/bw-sim/instructions/steps.js';
import {solidOverlaps} from '../overlay/scratch-gui/src/lib/bw-sim/editor/overlap.js';
import {runOnSimLab} from './helpers/sim-lab-vm.mjs';
import {runRobotLabProgram} from './helpers/robot-lab-direct-vm.mjs';
import {judgeSevenMachinesRun} from '../scripts/lib/sim-lab-seven-machines-judge.mjs';
const root=new URL('../',import.meta.url),read=p=>readFileSync(new URL(p,root),'utf8');
const C=catalogFrom(JSON.parse(read('overlay/scratch-gui/src/lib/bw-sim/part-meta/parts.json')));
const machines=[['mean-machine',212,2,'mean_pointer'],['stepworks',240,1,'pallet_rung_front'],['stride-lab',75,1,'coupler'],['twinpoint',117,2,'hingeP'],['butterfly',224,1,'wing_left_spine'],['tempo-loop',85,1,'outputCrank'],['tilt-lab',161,2,'maze_ball'],['axis-plotter',256,3,'z_pen_proxy']];
for(const [id,pieces,motors,marker]of machines){
 const source=read(`overlay/scratch-gui/static/sim-lab/models/${id}.ldr`);
 test(`${id}: connected clear original assembly, ports, complete instructions and flat/MPD preservation`,()=>{
  const p=prepareModel(source,C,{mat:'plain'});assert.ok(p.issues.every(i=>id==='butterfly'&&i.code==='locked-hinges'));assert.equal(p.model.parts.length,pieces);assert.equal(p.model.decor?.length||0,0);assert.equal(p.mechanism.actuators.length,motors);
  assert.match(source,/Author: CrispStrobe/);assert.match(source,/BSD-3-Clause/);for(const part of p.model.parts)assert.deepEqual(solidOverlaps(p.model,C,part),[],part.id);
  for(const text of [serializeModel(p.model),`0 FILE root.mpd\n1 16 0 0 0 1 0 0 0 1 0 0 0 1 child.ldr\n0 FILE child.ldr\n${source}\n0 NOFILE\n`]){
   const again=parseModel(text,{catalog:C});assert.deepEqual(again.refusals,[]);assert.deepEqual(again.model.parts,p.model.parts);
  }
  const original=parseModel(read(`test/fixtures/model-files/${id}-source/original.ldr`),{catalog:C}).model;
  assert.equal(original.parts.length,id==='butterfly'?225:id==='stride-lab'?76:id==='tilt-lab'?139:pieces);for(const a of p.model.parts){
   if(a.id.startsWith('guard_')||(id==='twinpoint'&&['linkBP','linkCP'].includes(a.id))||a.id==='guide_top_tie'||(id==='stride-lab'&&a.id==='footBasePin80_0'))continue;const b=original.parts.find(p=>p.id===a.id);assert.ok(b,a.id);assert.equal(a.part,b.part);assert.equal(a.color,b.color);
   for(const key of ['position','rotation'])assert.ok(a[key].every((v,k)=>Math.abs(v-b[key][k])<=.000000501),'six-decimal source geometry retained');
  }
  const plan=buildSteps(p.model,C);assert.ok(plan.steps.every(s=>s.parts.length<=STEP_MAX));assert.deepEqual(plan.steps.flatMap(s=>s.parts).sort(),p.model.parts.map(p=>p.id).sort());
  const payload=new Set(p.model.parts.filter(p=>p.load).map(p=>p.id));for(const s of plan.steps)if(s.loose)assert.ok(s.parts.every(id=>payload.has(id)),'only declared free payload can have a placement step');
 });
 test(`${id}: native program produces measured physical output; frozen output is rejected`,async t=>{
  const r=await (id==='axis-plotter'?runRobotLabProgram:runOnSimLab)(read(`overlay/scratch-gui/static/sim-lab/programs/${id}.bw`),{modelText:source,mat:'plain',timeLimitMs:id==='axis-plotter'?110000:id==='butterfly'?40000:id==='twinpoint'?90000:50000});
  const result={...r,unsupported:r.unsupported||r.run.unsupported};t.diagnostic(JSON.stringify(judgeSevenMachinesRun(id,result)));
  const b=r.mechanism.bodies.find(b=>b.parts.includes(marker));assert.ok(b,marker);
  const track=r.track.map(f=>({...f,bodies:{...f.bodies,[b.id]:r.track[0].bodies[b.id]}}));assert.throws(()=>judgeSevenMachinesRun(id,{...result,track}),/physical|free pallet|free ball|wings/);
 });
}
test('explicit round-bore slide annotation preserves existing hinge defaults and rejects keyed/missing bores',()=>{
 const source=read('overlay/scratch-gui/static/sim-lab/models/butterfly.ldr'),p=prepareModel(source,C);
 assert.equal(p.mechanism.joints.filter(j=>j.type==='slider').length,1);
 const unmarked=prepareModel(source.replaceAll('0 !BW SLIDE h0\n',''),C);assert.equal(unmarked.mechanism.joints.filter(j=>j.type==='slider').length,0);
 for(const text of [source.replace('0 !BW SLIDE h0','0 !BW SLIDE missing'),source.replace('0 !BW SLIDE h0','0 !BW SLIDE')])assert.ok(prepareModel(text,C).issues.some(i=>i.code==='bad-slide'));
 const wrong=source.replace('0 !BW ID input_axle','0 !BW SLIDE a\n0 !BW ID input_axle');assert.ok(prepareModel(wrong,C).issues.some(i=>i.code==='bad-slide'));
});

test('free retained pivots fold only circular coaxial collars on genuinely free shaft bodies',async()=>{
 const {freePinWelds}=await import('../overlay/scratch-gui/src/lib/bw-sim/mech/free-pins.js');
 const identity=[1,0,0,0,1,0,0,0,1];
 const shaft={connectors:[{id:'a',type:'axle',axis:[0,0,1],position:[0,0,0],length:60}],colliders:[{shape:'cylinder',radius:3,halfHeight:30}]};
 const collar={connectors:[{id:'h',type:'axlehole',axis:[0,0,1],position:[0,0,0],length:10}],colliders:[{shape:'cylinder',radius:9,halfHeight:5,rotation:[Math.SQRT1_2,0,0,Math.SQRT1_2]}]};
 const node=(meta,position=[0,0,0])=>({meta,placed:{rotation:identity,position}});
 const make=()=>({nodes:new Map([['shaft',node(structuredClone(shaft))],['collar',node(structuredClone(collar))]]),islands:{bodies:[{id:'pivot'}],nodeToBody:new Map([['shaft','pivot'],['collar','pivot']])},joints:[{type:'hinge',body1:'pivot',body2:'a',axis:[0,0,-1],point:[0,0,0]},{type:'hinge',body1:'pivot',body2:'b',axis:[0,0,-1],point:[0,0,.008]},{type:'slider',body1:'a',body2:'b',axis:[1,0,0],point:[.01,0,0]}]});
 const run=r=>freePinWelds(r.nodes,r.islands,r.joints);
 assert.deepEqual(run(make()),[['pivot','a']]);
 for(const mutate of [
  r=>r.nodes.get('collar').placed.position=[5,0,0],
  r=>r.nodes.get('collar').meta.colliders=[{shape:'box',halfExtents:[9,9,5]}],
  r=>r.nodes.get('collar').meta.gear={teeth:16,type:'spur'},
  r=>r.nodes.get('collar').meta.connectors[0].axis=[1,0,0],
  r=>r.joints[0].frictionNm=.01,
  r=>r.joints[0].motor={port:'A'},
  r=>r.joints[0].limits=[-1,1],
  r=>r.joints[0].type='slider',
  r=>r.nodes.delete('shaft'),
  r=>r.joints.pop(),
  r=>r.joints.at(-1).type='hinge'
 ]){const r=make();mutate(r);assert.deepEqual(run(r),[]);}
});

test('Tilt Lab physical startup stops prevent the original unpowered over-tilt',async()=>{
 const p=parseModel(read('overlay/scratch-gui/static/sim-lab/models/tilt-lab.ldr')).model;
 p.parts=p.parts.filter(p=>!p.id.startsWith('guard_'));
 const r=await runOnSimLab(read('overlay/scratch-gui/static/sim-lab/programs/tilt-lab.bw'),{modelText:serializeModel(p),mat:'plain',timeLimitMs:2500});
 const j=r.mechanism.joints.find(j=>j.motor?.port==='A');assert.ok(Math.max(...r.track.map(f=>Math.abs(f.joints[j.id].angle)))>12*Math.PI/180,'removing actual support parts reproduces startup excursion');
});
for(const preset of ['original-curves','original-pixel-costume'])test(`Axis Plotter ${preset}: original optional native drawing completes with distinct physical strokes`,async t=>{
 const name=preset==='original-curves'?'axis-plotter-curves':'axis-plotter-pixel-costume';
 const r=await runRobotLabProgram(read(`overlay/scratch-gui/static/sim-lab/programs/${name}.bw`),{modelText:read('overlay/scratch-gui/static/sim-lab/models/axis-plotter.ldr'),timeLimitMs:preset==='original-curves'?150000:400000});
 assert.ok(r.finishedAt,'all native scripts complete');t.diagnostic(JSON.stringify(judgeSevenMachinesRun('axis-plotter',{...r,preset})));
});


test('Axis Plotter automatic calibration program has a compact, warning-free native block graph', () => {
 const creator=new Creator();creator.parse(read('overlay/scratch-gui/static/sim-lab/programs/axis-plotter.bw'));
 assert.deepEqual(creator.warnings,[]);
 const blocks=creator.project.targets.flatMap(t=>Object.values(t.blocks));
 assert.ok(blocks.length<250, `example loads ${blocks.length} blocks instead of 6153 expanded blocks`);
 assert.ok(blocks.some(b=>b.opcode==='control_repeat'));
 assert.equal(blocks.filter(b=>b.opcode==='event_whenbroadcastreceived').length,3);
});

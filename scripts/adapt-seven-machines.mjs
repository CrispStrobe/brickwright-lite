#!/usr/bin/env node
// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
// Reviewed data only: never executes source-archive generators/controllers.
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {parseModel,serializeModel} from '../overlay/scratch-gui/src/lib/bw-sim/model/ldraw-model.js';
import {catalogFrom,prepareModel} from '../overlay/scratch-gui/src/lib/bw-sim/sim-session.js';
import {solidOverlaps} from '../overlay/scratch-gui/src/lib/bw-sim/editor/overlap.js';
const hashes={"axis-plotter":"2a67c5cddeed7b7480635cf4f593ff4ceea215a356e99a2064d576b8eb6dc934","tilt-lab":"7d1f72ce0f877fcd9d88e402e3e1b2905fa88fe61fce2c13979a62a942239b46","tempo-loop":"2502e4c259854123d2cf3fb6806ffc2d483f6ccb332bcab2c826c0f902660693","mean-machine": "569e9e9661d1f4900a4528abc685577554d48abd397edf37f6fb1cd21484512d", "stepworks": "3e7474b2c83f14414f5f05e7763f76c9d80fc0ef5e7aeca3f9fc661f8a1a394c", "stride-lab": "a7b53fd9965ecf113d7fda4138434cbb03af743f28d1fa43acc7b04e49d776f7", "twinpoint": "266de2d4580f3ea253d40c11eefe8dd74062e80bf3a4182b1ac13dc1e8eca6b0", "butterfly": "c9ff4305b5cc57a92edc0f2186e8ac80bd5e9be93d15323429d6b45f5380fef4"};
const titles={'axis-plotter':'AXIS PLOTTER — coordinated Cartesian drawing','tilt-lab':'TILT LAB — powered two-axis marble maze','tempo-loop':'TEMPO LOOP — changing speed within each turn','mean-machine':'MEAN MACHINE — a physical two-input average',stepworks:'STEPWORKS — walking-beam transfer conveyor','stride-lab':'STRIDE LAB — approximate straight-line working stroke',twinpoint:'TWINPOINT — a parallel five-bar positioner',butterfly:'BUTTERFLY — guided crosshead and flapping wings'};
const [id,source,output]=process.argv.slice(2);
if(!hashes[id]||!source||!output)throw Error('Usage: adapt-seven-machines.mjs model-id original.ldr output.ldr');
const bytes=readFileSync(source);if(createHash('sha256').update(bytes).digest('hex')!==hashes[id])throw Error('Source differs from reviewed input');
const C=catalogFrom(JSON.parse(readFileSync(new URL('../overlay/scratch-gui/src/lib/bw-sim/part-meta/parts.json',import.meta.url))));
const {model,refusals}=parseModel(bytes.toString('utf8').replaceAll('45601c01.dat','45601.dat'),{catalog:C});
if(refusals.length||model.decor?.length)throw Error(JSON.stringify(refusals));
model.attribution={author:'CrispStrobe',license:`BSD-3-Clause : see ../licenses/${id}.txt`};delete model.steps;
if(id==='tilt-lab'){
 // Paired fixed towers support the unpowered gimbal near its intended tilt
 // envelope. These are actual parts and collision contacts, not angle clamps.
 const put=(id,part,color,position,rotation)=>model.parts.push({id,part,color,position,rotation});
 const upright=[0,1,0,0,0,1,1,0,0],floorPin=[0,-1,0,1,0,0,0,0,1];
 for(const z of [-140,140]){
  for(const x of [-140,-100]){
   const mountX=x+20, mounting=[-1,0,0,0,1,0,0,0,-1];
   put(`guard_post_${x}_${z}`,'32525.dat',0,[x,160,z],upright);
   put(`guard_foot_${x}_${z}`,'15100.dat',72,[mountX,260,z],mounting);
   put(`guard_floor_pin_${x}_${z}`,'2780.dat',0,[mountX,270,z],floorPin);
   put(`guard_head_${x}_${z}`,'15100.dat',72,[mountX,60,z],mounting);
   put(`guard_head_pin_${x}_${z}`,'2780.dat',0,[mountX,50,z],floorPin);
  }
  put(`guard_contact_${z}`,'32316.dat',4,[-120,40,z],[0,0,1,0,1,0,-1,0,0]);
 }
}
if(id==='twinpoint')for(const p of model.parts)if(['linkBP','linkCP'].includes(p.id))p.part='4586.dat';
if(id==='stride-lab'){
 model.parts=model.parts.filter(p=>p.id!=='hubMountPin80_0');
 const pin=model.parts.find(p=>p.id==='footBasePin80_0');pin.part='6558.dat';pin.position[1]=220;
}
if(id==='stepworks')for(const p of model.parts)if(p.id.startsWith('pallet_'))p.load=true;
if(id==='butterfly'){
 for(const p of model.parts)if(p.id.startsWith('moving_guide_'))p.slides=['h0'];
 // Replace two individual top collars with one keyed tie. The two guide
 // axles now form one braced mount, fixed by their separated round bearings.
 model.parts=model.parts.filter(p=>!['guide_retainer_left_top','guide_retainer_right_top'].includes(p.id));
 model.parts.push({id:'guide_top_tie',part:'11478.dat',color:4,position:[0,-15,-50],rotation:[0,0,1,0,1,0,-1,0,0]});
}
const text=serializeModel(model,{name:id+'.ldr',title:titles[id]}).replaceAll('\r\n','\n');
const p=prepareModel(text,C,{mat:'plain'});if(p.issues.some(i=>i.code!=='locked-hinges')||(id!=='butterfly'&&p.issues.length))throw Error(JSON.stringify(p.issues));
for(const part of model.parts)if(solidOverlaps(model,C,part).length)throw Error('Overlap: '+part.id);
writeFileSync(output,text);process.stdout.write(`${id}: ${model.parts.length} pieces / ${p.mechanism.actuators.length} motors\n`);

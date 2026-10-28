// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import JSZip from 'jszip';
import {judgeCrossRatio} from './sim-lab-cross-ratio-judge.mjs';
import {observeAddon} from './sim-lab-addon-judge.mjs';
import {bindSixBrowserSource} from './sim-lab-six-browser-judge.mjs';
import {captureIntakeProject,replayIntakeProject} from './sim-lab-intake-roundtrip.mjs';
import {readIntakeReceipt,intakeIdentity} from './sim-lab-intake-receipt.mjs';
export function judgeCrossRatioBrowser(record){
 const binding=bindSixBrowserSource('cross-ratio',record);
 assert.ok(record.track.length>=100,'actual browser observations');
 let previous=-Infinity;
 for(const f of record.track){
  assert.ok(Number.isFinite(f.t)&&f.t>previous,'increasing actual browser time');previous=f.t;
  for(const b of Object.values(f.bodies)){
   assert.ok([...b.position,...b.rotation].every(Number.isFinite));
   assert.ok(Math.abs(Math.hypot(...b.rotation)-1)<=1e-5);
  }
 }
 const metrics=judgeCrossRatio(record),observer=observeAddon(record,'motor_rail_-40_-140');
 const closureMm=Math.max(...record.track.map(f=>observer.gap(f)));
 const axisDeg=Math.max(...record.track.map(f=>observer.axisGap(f)));
 assert.ok(closureMm<=.5&&axisDeg<=1,'actual browser hinges close and align');
 console.log('PASS cross-ratio: actual browser passive law '+JSON.stringify({...metrics,closureMm,axisDeg,sourceBinding:binding.sourceBinding}));
 return {...metrics,closureMm,axisDeg,sourceBinding:binding.sourceBinding,scope:'Actual Chromium law and closure; native cold cases are separate'};
}
export async function crossRatioRoundtrip(page,opts){
 const id='cross-ratio',receiptPath=await captureIntakeProject(page,opts,id);
 const receipt=readIntakeReceipt(receiptPath,{id,identity:intakeIdentity(id,opts.buildDir)});
 const bytes=readFileSync(receipt.project);
 assert.ok(bytes.length>0&&bytes.length<=8*1024*1024,'bounded actual saved project');
 const zip=await JSZip.loadAsync(bytes,{checkCRC32:true});
 const sidecar=zip.file('brickwright/state.json'),project=zip.file('project.json');
 assert.ok(sidecar&&project,'actual model sidecar and Scratch project');
 const [stateText,projectText]=await Promise.all([sidecar.async('text'),project.async('text')]);
 assert.ok(Buffer.byteLength(stateText)<=2*1024*1024&&Buffer.byteLength(projectText)<=2*1024*1024);
 assert.deepEqual(JSON.parse(stateText).state.simLab,receipt.record,'exported bytes preserve exact saved model before real reopen');
 const targets=JSON.parse(projectText).targets.map(t=>{
  const counts={};for(const b of Object.values(t.blocks||{}))if(!b.shadow&&typeof b.opcode==='string')counts[b.opcode]=(counts[b.opcode]||0)+1;
  return{name:t.name,operations:Object.entries(counts).sort(([a],[b])=>a.localeCompare(b))};
 }).sort((a,b)=>a.name.localeCompare(b.name));
 assert.deepEqual(targets,receipt.program,'actual saved program before real reopen');
 console.log('PASS cross-ratio: actual SB3 CRC, model content and program checked BEFORE real fresh-context reopen');
 await replayIntakeProject(page.context().browser(),{...opts,extendedObservations:true},id,(_,r)=>judgeCrossRatioBrowser(r),receiptPath);
 console.log('PASS cross-ratio: actual fresh-context saved-project replay and passive law');
}

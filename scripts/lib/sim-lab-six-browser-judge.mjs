// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
import assert from 'node:assert/strict';
import {isDeepStrictEqual} from 'node:util';
import {serializeModel} from '../../overlay/scratch-gui/src/lib/bw-sim/model/ldraw-model.js';
import {catalogFrom,prepareModel} from '../../overlay/scratch-gui/src/lib/bw-sim/sim-session.js';
import {evaluateReviewedIntake} from './sim-lab-six-intake-judge.mjs';
import {reviewedIntakeContract,intakeRead} from './sim-lab-six-intake-contracts.mjs';
import {curatedStockAudit} from './sim-lab-curated-stock-audit.mjs';
import {judgeJansen} from '../../test/fixtures/model-files/dune-strider-source/tools/judge-native.mjs';
import {judgeAtlas} from '../../test/fixtures/model-files/atlas-six-source/tools/judge-native.mjs';
import {judgeNative as judgeOblique} from './sim-lab-oblique-native-judge.mjs';

// Browser observations cover the complete ordinary Run, actual API events,
// passive output, finite completion and hold. Full unpowered startup and exact
// compiler/source identity belong to the original native suite and import gate.
// This boundary is declared before browser trials; no physical limit is widened.
const NATIVE_ONLY=new Set(['recording-completed','native-record-completed','selected-runtime-checkout','compiler','registered-compiler-and-primitives',
 'exact-model-and-program-bytes','exact-contract-bytes','unpowered-startup-drift','unpowered-cold-duration','unpowered-cold-platform-position',
 'unpowered-cold-platform-orientation','unpowered-cold-encoder-drift','cold-duration','cold-angle-stability']);
const nativeOnly=name=>NATIVE_ONLY.has(name)||name.startsWith('frozen-');
const structure=m=>JSON.parse(JSON.stringify({bodies:m.bodies.map(b=>({id:b.id,parts:b.parts,position:b.position,rotation:b.rotation,com:b.com,massKg:b.massKg,colliders:b.colliders})),joints:m.joints,couplings:m.couplings}));
const compareStructure=(actual,expected,path='mechanism')=>{
 // JS engines may round trigonometry differently. This is a source-binding
 // tolerance, far below any physical gate: 1e-10 in the compiled SI units.
 if(typeof expected==='number'){assert.ok(Number.isFinite(actual)&&Math.abs(actual-expected)<=1e-10*Math.max(1,Math.abs(expected)),path);return;}
 if(expected&&typeof expected==='object'){
  assert.equal(Array.isArray(actual),Array.isArray(expected),path);
  assert.deepEqual(Object.keys(actual||{}).sort(),Object.keys(expected).sort(),path);
  for(const key of Object.keys(expected))compareStructure(actual[key],expected[key],path+'.'+key);
 }else assert.equal(actual,expected,path);
};

// The app project writer stores twelve decimal places. Bind replay to that exact,
// deterministic derivative of the reviewed source, never to arbitrary observed
// input or a wider geometric tolerance. Both compiled variants keep the same
// numerical source-binding and physical acceptance limits.
export function bindSixBrowserSource(id,record){
 const source=intakeRead('overlay/scratch-gui/static/sim-lab/models/'+id+'.ldr').toString(),catalog=catalogFrom(JSON.parse(intakeRead('overlay/scratch-gui/src/lib/bw-sim/part-meta/parts.json')));
 const prepare=(text,autoPorts)=>{const p=prepareModel(text,catalog,{mat:'plain',...(autoPorts===undefined?{}:{autoPorts})});return {issues:p.issues,model:p.model,runModel:p.runModel,mechanism:p.mechanism};};
 const original=prepare(source,false),saved=serializeModel(original.model,{precision:12});
 const variants=[{name:'reviewed-source',text:source,prepared:original},{name:'canonical-project-save',text:saved,prepared:prepare(saved,false)}];
 const variant=variants.find(v=>isDeepStrictEqual(record.model,v.prepared.model));
 assert.ok(variant,'actual model is exactly the reviewed source or its canonical project serialization');
 assert.deepEqual(record.runModel,variant.prepared.runModel,'actual simulation placements match the bound input');
 compareStructure(structure(record.mechanism),structure(variant.prepared.mechanism));
 const ordinaryPrepared=prepare(variant.text,undefined);
 const unassisted={issues:variant.prepared.issues,mechanism:variant.prepared.mechanism},ordinary={issues:ordinaryPrepared.issues,mechanism:ordinaryPrepared.mechanism};
 return {ordinary,unassisted,sourceBinding:variant.name};
}

export async function judgeSixBrowser(id,record){
 assert.ok(Number.isFinite(record.finishedAt),'actual VM finishes');
 assert.deepEqual(record.issues,[]);assert.ok(record.track.length>=500);
 const last=record.track.at(-1),variables=last.extra.variables;
 assert.equal(Number(variables.completed),1);assert.equal(Number(variables.failed),0);
 assert.ok(Object.values(last.busy).every(busy=>busy===false));
 assert.ok(Object.values(last.extra.modes).every(mode=>mode==='hold'),'every actual native motor holds at completion');
 const {ordinary,unassisted,sourceBinding}=bindSixBrowserSource(id,record);
 const initialWorldErrorMm=Math.max(...record.mechanism.bodies.filter(b=>b.parts.length&&b.motion==='dynamic').map(b=>Math.hypot(...record.track[0].bodies[b.id].position.map((v,k)=>v-b.position[k]))*1000));
 assert.ok(initialWorldErrorMm<=.5,'initial saved world datum within0.5mm; the chassis remains free during the experiment');
 if(['rod-ratio','vernier-drive','line-turner'].includes(id)){
  const result=await evaluateReviewedIntake(id,record,{native:false});assert.deepEqual(result.failures,[]);
  return {scope:'Actual browser program, complete mechanical laws and hold; full unpowered startup qualified natively',sourceBinding,initialWorldErrorMm,...result.metrics};
 }
 const contract=reviewedIntakeContract(id),start=record.start;
 const r={...record,finishedAt:record.finishedAt-start,
  track:record.track.map(f=>({...f,t:f.t-start})),apiEvents:record.apiEvents.map(e=>({...e,t:e.t-start,...(Number.isFinite(e.resolvedAt)?{resolvedAt:e.resolvedAt-start}:{})})),
  // These source-byte/compiler fields are explicitly unobserved here. Their
  // gates remain mandatory in the separate native suite and file roundtrip.
  inputs:{model:{},program:{}},timing:{frameMs:1000/30,physicsStepMs:5,coldMs:0,afterMs:1000,timeLimitMs:id==='atlas-six'?490000:id==='oblique'?98000:90000},
  preparationComparison:{ordinary,unassisted},...(id==='atlas-six'?{catalogAugmentation:curatedStockAudit(['32195a.dat'])}:{})};
 const result=id==='dune-strider'?judgeJansen(r,contract,{includeSamples:false}):id==='atlas-six'?judgeAtlas(r,contract,{includeSamples:false}):judgeOblique(r,contract);
 const excluded=result.gates.filter(g=>nativeOnly(g.name)||(id==='oblique'&&g.name==='native-control-program'));
 const gates=result.gates.filter(g=>!excluded.includes(g));
 if(id==='oblique'){
  // The aggregate native-control verdict includes the unavailable compiler
  // receipt; independently keep every actual scheduling/arrival/hold gate.
  gates.push(...result.controls.gates.filter(g=>!nativeOnly(g.name)));
 }
 assert.deepEqual(gates.filter(g=>g.status!=='PASS'),[],'Every declared browser-observable physical and API gate');
 return {scope:'Actual browser mechanics and API events; native-only startup/compiler/source gates qualified separately',
  sourceBinding,initialWorldErrorMm,checkedGates:gates.length,nativeOnlyNotEvaluated:excluded.map(g=>g.name),metrics:result.metrics||result.measurements};
}

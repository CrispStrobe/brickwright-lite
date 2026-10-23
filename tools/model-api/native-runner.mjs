// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
import {createRequire} from 'node:module';import {readFileSync} from 'node:fs';
import Creator from '../../overlay/scratch-gui/src/lib/sb3-creator-register-art.js';
import {solidOverlaps} from '../../overlay/scratch-gui/src/lib/bw-sim/editor/overlap.js';
import {catalogFrom,prepareModel} from '../../overlay/scratch-gui/src/lib/bw-sim/sim-session.js';
import {runRobotLabProgram} from '../../test/helpers/robot-lab-direct-vm.mjs';
import {validateSubmission,ApiError,LIMITS} from './lib/protocol.mjs';import {sha256} from './lib/crypto.mjs';import {createBatchObserver,summarize} from './lib/observations.mjs';
const root=new URL('../../',import.meta.url),catalog=catalogFrom(JSON.parse(readFileSync(new URL('overlay/scratch-gui/src/lib/bw-sim/part-meta/parts.json',root))));
const readerHash=sha256(readFileSync(new URL('overlay/scratch-gui/src/lib/bw-sim/measurements/readings.js',root)));
const JSZip=createRequire(new URL('packages/scratch-gui/package.json',root))('jszip');
const allowedOpcode=op=>/^(?:event_|control_|operator_|data_|procedures_|argument_)/.test(op)||['looks_say','looks_sayforsecs','looks_think','looks_thinkforsecs','sensing_timer','sensing_resettimer'].includes(op)||(/^robotlab_/.test(op)&&!['robotlab_loadModel','robotlab_resetSimulation','robotlab_stopSimulation'].includes(op));
export async function measureSubmission(raw,{runtimeRevision='local',measurementRevision='PR1255'}={}){
 const input=validateSubmission(raw),started=process.hrtime.bigint(),source=input.program?.text??'DEVICE SPIKE\nWHEN flag clicked:\n  wait 1000 seconds\n';
 const prepared=prepareModel(input.model.text,catalog,{mat:'plain',autoPorts:false}),m=prepared.mechanism;
 if(prepared.model.parts.some(p=>p.id.length>128))throw new ApiError(422,'part-id-limit','Part identifiers must fit 128 characters');
 if(prepared.model.parts.length>LIMITS.parts||m.bodies.filter(b=>b.motion==='dynamic').length>LIMITS.dynamicBodies||m.joints.length>LIMITS.joints)throw new ApiError(422,'topology-limit','Model exceeds the bounded worker topology');
 if(prepared.issues.some(i=>i.severity==='error'))throw new ApiError(422,'model-refused','The model has compile errors',{issues:prepared.issues});
 if(Object.keys(m.solver||{}).length)throw new ApiError(422,'solver-override','Custom solver parameters are not accepted');
 const overlapMap=new Map();for(const part of prepared.model.parts)for(const hit of solidOverlaps(prepared.model,catalog,part)){const ids=[part.id,hit.part].sort();if(!overlapMap.has(ids.join('|')))overlapMap.set(ids.join('|'),{parts:ids,depthLdu:hit.depth});}
 const savedOverlaps=[...overlapMap.values()];
 const creator=new Creator();creator.parse(source);if(creator.errors?.length||creator.warnings?.length)throw new ApiError(422,'program-refused','Program has compiler errors or warnings',{errors:creator.errors||[],warnings:creator.warnings||[]});
 const zip=await JSZip.loadAsync(Buffer.from(await(await creator.generateSB3()).arrayBuffer())),project=JSON.parse(await zip.file('project.json').async('string'));
 if((project.extensions||[]).some(id=>id!=='robotlab'))throw new ApiError(422,'unsupported-extension','Only the fixed Robot Lab runtime is allowed');
 const opcodes=[...new Set(project.targets.flatMap(t=>Object.values(t.blocks||{}).map(b=>b.opcode)))];
 if(opcodes.some(op=>!allowedOpcode(op)&&!['math_number','text','colour_picker'].includes(op)))throw new ApiError(422,'unsupported-opcode','Program uses a command outside the data-only worker profile');
 let observer,frame=0,columns=[],lastRows=[],vmHooked=false;const errors=[],samples=[];
 const stride=Math.max(1,Math.ceil(input.settings.sampleMs/25),Math.ceil((input.settings.programMs+input.settings.coldMs+input.settings.afterMs)/25/LIMITS.recordedSamples));
 const result=await runRobotLabProgram(source,{modelText:input.model.text,autoPorts:false,frameMs:25,timeLimitMs:input.settings.programMs,coldMs:input.settings.coldMs,afterMs:input.settings.afterMs,
  observeFrame:({session,vm})=>{
   if(!observer)observer=createBatchObserver(session,input.measurements,name=>vm.runtime.targets.flatMap(t=>Object.values(t.variables||{})).find(v=>v.name===name)?.value);
   if(!vmHooked){vm.runtime.on('ERROR',e=>errors.push(String(e)));vm.runtime.on('BLOCKS_ERROR',e=>errors.push(String(e)));vmHooked=true;
    for(const b of vm.runtime.targets.flatMap(t=>Object.values(t.blocks._blocks))){const literal=Object.keys(b.fields||{}).length===1&&!Object.keys(b.inputs||{}).length;if(!(b.opcode in vm.runtime._primitives)&&!(b.opcode in vm.runtime._hats)&&!literal)throw new ApiError(422,'unregistered-opcode','Actual compiled opcode is not registered');}
   }
   lastRows=observer.read();if(frame%stride===0){
    if(!columns.length)columns=lastRows.map(({id,kind,label,unit,source})=>({id,kind,label,unit,source}));
    samples.push({elapsedMs:frame*25,timeMs:session.time,values:lastRows.map(r=>r.available?Math.round(r.value*1e9)/1e9:null)});
   }frame++;return{};
  }});
 if(lastRows.length&&(samples.at(-1)?.elapsedMs!==(frame-1)*25))samples.push({elapsedMs:(frame-1)*25,timeMs:result.track.at(-1).t,values:lastRows.map(r=>r.available?Math.round(r.value*1e9)/1e9:null)});
 for(const sample of samples)sample.phase=result.track[Math.round(sample.elapsedMs/25)]?.phase??'unknown';
 for(const f of result.track)for(const p of Object.values(f.bodies))if(![...p.position,...p.rotation].every(Number.isFinite))throw new ApiError(422,'nonfinite-physics','Physics produced a nonfinite body pose');
 return{version:1,status:errors.length?'failed':'completed',qualification:{status:'not-evaluated',reason:'Measurements do not grant mechanism or library admission'},
  runtime:{revision:runtimeRevision,measurementRevision,measurementReaderSha256:readerHash,node:process.version,engine:'Jolt',physicsStepMs:5,vmFrameMs:25,actualSampleMs:stride*25,wallMs:Number(process.hrtime.bigint()-started)/1e6},
  input:{modelName:input.model.name,modelSha256:sha256(input.model.text),programName:input.program?.name??null,programSha256:input.program?sha256(input.program.text):null,executedProgramSha256:sha256(source)},
  completion:{programFinished:!!result.finishedAt,finishedAtMs:result.finishedAt,reason:result.finishedAt?'program-finished':'requested-time-budget',sceneTimeMs:result.track.at(-1)?.t??0},
  topology:{parts:prepared.model.parts.length,bodyCount:m.bodies.length,bodies:m.bodies.map(b=>({id:b.id,motion:b.motion,parts:b.parts,configuredMassG:b.massKg*1000})),dynamicBodies:m.bodies.filter(b=>b.motion==='dynamic').length,joints:m.joints.map(j=>({id:j.id,type:j.type,port:j.motor?.port??null,body1:j.body1,body2:j.body2})),actuators:m.actuators.map(a=>({port:a.port,joint:a.joint})),configuredAssemblyMassG:m.bodies.filter(b=>b.parts?.some(id=>prepared.model.parts.some(p=>p.id===id))).reduce((s,b)=>s+b.massKg*1000,0)},
  construction:{scope:'Saved-pose native solid primitives only; no complete mesh, swept clearance or retention admission',overlapCount:savedOverlaps.length,overlaps:savedOverlaps.slice(0,128),truncated:savedOverlaps.length>128},issues:result.issues,programErrors:errors,columns,samples,summary:summarize(columns,samples),availability:lastRows.map(({id,available,reason})=>({id,available,reason})),
  provenance:{configuredMass:'Compiled rigid-body configured mass; not weighed hardware or solver-adjusted inertia',forces:'Only existing rope tension and rolling-load diagnostics; no invented motor torque or general contact force',coordinates:'world: Jolt axes, millimetres; reference marker: current authored part axes; marker offsets: LDraw units',signedAngles:'Observed rotation unwrapped at 25 ms; use native joint angles for mechanisms beyond that sampling bandwidth',sceneLifecycle:'Fresh fixed model, already running; start is idempotent; load/reset/pause are refused',scope:'Headless native program and observations; no browser rendering or physical build claim'}};
}

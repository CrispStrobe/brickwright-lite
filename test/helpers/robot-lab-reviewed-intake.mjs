// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
// Observe the existing real VM/session runner. No output pose or solver setting
// is supplied by this adapter. API wrappers preserve arguments, receiver and result.
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
import Creator from '../../overlay/scratch-gui/src/lib/sb3-creator-register-art.js';
import {catalogFrom,prepareModel} from '../../overlay/scratch-gui/src/lib/bw-sim/sim-session.js';
import {runRobotLabProgram} from './robot-lab-direct-vm.mjs';
import {intakeRead,intakeHash,INTAKE_ROOT,reviewedIntakeContract} from '../../scripts/lib/sim-lab-six-intake-contracts.mjs';
import {curatedStockAudit} from '../../scripts/lib/sim-lab-curated-stock-audit.mjs';

export async function runReviewedIntake(id,{frameMs=1000/30,autoPorts=false}={}){
 const source=intakeRead('overlay/scratch-gui/static/sim-lab/models/'+id+'.ldr'),program=intakeRead('overlay/scratch-gui/static/sim-lab/programs/'+id+'.bw');
 const contract=reviewedIntakeContract(id,{frameMs}),contractBytes=Buffer.from(JSON.stringify(contract));
 const catalog=catalogFrom(JSON.parse(intakeRead('overlay/scratch-gui/src/lib/bw-sim/part-meta/parts.json')));
 const creator=new Creator();creator.parse(program.toString());await creator.generateSB3();
 const compiler={validation:creator.validate(),warnings:creator.warnings||[],unparsed:creator.unparsed||[],opcodes:[...new Set(creator.project.targets.flatMap(t=>Object.values(t.blocks||{}).map(b=>b.opcode)))].sort()};
 assert.equal(compiler.validation.isValid,true);assert.deepEqual(compiler.warnings,[]);assert.deepEqual(compiler.unparsed,[]);
 assert.deepEqual(compiler.opcodes.filter(op=>/^robotlab_(loadModel|resetSimulation|stopSimulation|setTimeScale|camera)$/i.test(op)||/^spikeprime_/.test(op)),[],'Retain the original fixed-session producer opcode boundary');
 const timeLimitMs=id==='atlas-six'?490000:id==='oblique'?98000:id==='dune-strider'?90000:contract.recording.timeLimitMs,coldMs=1000,afterMs=id==='oblique'?1100:1000;
 const apiEvents=[],refusals=[],apiMethodCounts={};let model,controlledMotors,installed=false,lastVariables;
 const observeFrame=({vm,session,hub,prepared})=>{
  const api=vm.runtime.robotLab;
  const variables=()=>vm.runtime.targets.map(t=>({name:t.getName(),variables:Object.fromEntries(Object.values(t.variables||{}).map(v=>[v.name,v.value]))}));
  const flat=()=>Object.assign({},...variables().map(t=>t.variables));
  if(!installed){
   installed=true;model=prepared.model;controlledMotors=api.motors();
   compiler.missingRobotlabPrimitives=compiler.opcodes.filter(op=>op.startsWith('robotlab_')&&!op.includes('_menu_')&&typeof vm.runtime._primitives[op]!=='function');
   for(const name of ['start','stopMotor','runMotorDegrees','setMotorPower','setMotorSpeed','motorAngle','motorSpeed']){
    const original=api[name];
    api[name]=function(...args){
     apiMethodCounts[name]=(apiMethodCounts[name]||0)+1;
     const event=name==='motorAngle'||name==='motorSpeed'?null:{name,args,t:session.time,variables:flat(),...(name==='runMotorDegrees'?{encoderAtCall:api.encoder(args[0])}:{})};
     if(event)apiEvents.push(event);
     const observe=result=>{
      if(result?.ok===false||(name==='runMotorDegrees'&&result!=='completed'))refusals.push({t:session.time,name,args,result});
      if(event)Object.assign(event,{resolvedAt:session.time,result,...(name==='runMotorDegrees'?{encoderAtResolution:api.encoder(args[0])}:{})});
     };
     const result=original.apply(this,args);
     if(result&&typeof result.then==='function')result.then(observe,error=>refusals.push({t:session.time,name,args,error:String(error)}));else observe(result);
     return result;
    };
   }
  }
  lastVariables=variables();return {variables:flat(),variableTargets:lastVariables,encoder:Object.fromEntries(controlledMotors.map(m=>[m.port,api.encoder(m.port)])),modes:Object.fromEntries(session.mechanism.actuators.map(a=>[a.port,hub.motors._controllers[a.port.charCodeAt(0)-65].mode])),sessionFailed:session.failed?String(session.failed):null};
 };
 const run=await runRobotLabProgram(program.toString(),{modelText:source.toString(),catalog,autoPorts,frameMs,timeLimitMs,coldMs,afterMs,observeFrame});
 const prep=autoPorts=>{const p=prepareModel(source.toString(),catalog,{mat:'plain',...(autoPorts===undefined?{}:{autoPorts})});return{issues:p.issues,mechanism:p.mechanism};};
 const record={...run,model,recordingStatus:'completed',timing:{frameMs,physicsStepMs:5,coldMs,afterMs,timeLimitMs},runtime:{node:process.version,checkout:execFileSync('git',['rev-parse','HEAD'],{cwd:INTAKE_ROOT,encoding:'utf8'}).trim()},
  inputs:{model:{sha256:intakeHash(source)},program:{sha256:intakeHash(program)},contract:{sha256:intakeHash(contractBytes)}},controlledMotors,compiler,apiEvents,refusals,apiMethodCounts,programVariables:lastVariables,preparationComparison:{ordinary:prep(undefined),unassisted:prep(false)},
  track:run.track.map(f=>({...f,encoder:f.extra.encoder,variables:f.extra.variableTargets})),...(id==='atlas-six'?{catalogAugmentation:curatedStockAudit(['32195a.dat'])}:{})};
 return {record,contract};
}

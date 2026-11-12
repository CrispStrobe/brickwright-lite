// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
export const repo=fileURLToPath(new URL('../../',import.meta.url));
const addon=resolve(repo,'overlay/scratch-gui/static/sim-lab');
const fromRepo=p=>pathToFileURL(resolve(repo,p));
const {runRobotLabProgram}=await import(fromRepo('test/helpers/robot-lab-direct-vm.mjs'));
const {default:Creator}=await import(fromRepo('overlay/scratch-gui/src/lib/sb3-creator-register-art.js'));
const require=createRequire(fromRepo('package.json'));
const sha=s=>createHash('sha256').update(s).digest('hex');

/** Execute exported files through the unmodified real parser/VM/controller/physics harness. */
export async function runTwistspan(variant,{autoPorts,modelText:providedModel,coldMs=2000,afterMs=3000,timeLimitMs=43000,frameMs=1000/60}={}){
 const modelText=providedModel??readFileSync(resolve(addon,'models',variant+'.ldr'),'utf8');
 const program=readFileSync(resolve(addon,'programs/twistspan.bw'),'utf8');
 const creator=new Creator();creator.parse(program);
 const bytes=Buffer.from(await(await creator.generateSB3()).arrayBuffer());
 const zip=await require('jszip').loadAsync(bytes),project=JSON.parse(await zip.file('project.json').async('string'));
 const setup={},errors=[],commands=[];
 const r=await runRobotLabProgram(program,{modelText,autoPorts,timeLimitMs,coldMs,afterMs,frameMs,
  observeSetup:({session,vm,hub,prepared})=>{
   const body=id=>prepared.mechanism.bodies.find(b=>b.parts.includes(id));
   for(const [name,id] of [['payload','payload_bar'],['base','hub'],['upper','upper_bar']]){
    setup[name+'Dynamics']=session.core.bodyDynamics(body(id).id);
    setup[name+'Pose']=session.core.bodyPose(body(id).id);
   }
   setup.gravity=prepared.mechanism.gravity;
   setup.bodyIds={payload:body('payload_bar').id,base:body('hub').id,upper:body('upper_bar').id};
   setup.explicitHubIdentity=session.hubs[0].hub.hubState===hub;
   setup.frozenBodies=prepared.mechanism.bodies.filter(b=>b.motion!=='dynamic'&&b.parts.length).map(b=>b.id);
   const blocks=vm.runtime.targets.flatMap(target=>Object.values(target.blocks._blocks));
   const literal=block=>Object.keys(block.fields||{}).length===1&&Object.keys(block.inputs||{}).length===0;
   setup.missingOpcodes=[...new Set(blocks.filter(block=>!(block.opcode in vm.runtime._primitives)&&!(block.opcode in vm.runtime._hats)&&!literal(block)).map(block=>block.opcode))];
   vm.runtime.on('ERROR',e=>errors.push(String(e)));
   vm.runtime.on('BLOCKS_ERROR',e=>errors.push(String(e)));vm.on('BLOCKS_ERROR',e=>errors.push(String(e)));
   // Observation wrappers only: every call delegates to the real method unchanged.
   for(const name of ['runMotorDegrees','setMotorSpeed','setMotorPower','stopMotor']){
    const original=vm.runtime.robotLab[name];
    vm.runtime.robotLab[name]=function(...args){
     const event={t:session.time,name,args};commands.push(event);
     const result=original.apply(this,args);
     if(result&&typeof result.then==='function')result.then(value=>{event.doneAt=session.time;event.result=value;});
     else event.result=result;
     return result;
    };
   }
  },
  observeFrame:({session,vm,hub,prepared})=>{
   const variables=Object.fromEntries(vm.runtime.targets.flatMap(t=>Object.values(t.variables||{}).map(v=>[v.name,v.value])));
   const motor=prepared.mechanism.joints.find(j=>j.motor?.port==='A');
   return {...variables,variables,motorAngleDeg:session.core.jointState(motor.id).angle*180/Math.PI,
    ropes:session.core.ropeState(),controllerMode:hub.motors._controllers[0].mode,sessionFailed:session.failed?String(session.failed):null};
  }
 });
 r.setup=setup;r.vmErrors=errors;r.commandEvents=commands;r.programSha256=sha(program);
 r.provenance={modelFilename:variant+'.ldr',modelSha256:sha(modelText),programFilename:'twistspan.bw',programSha256:sha(program),
  node:process.version,sourceRole:'current qualification candidate; see qualification source fingerprint',autoPorts:autoPorts===false?false:'ordinary',
  frameMs,physicsStepHz:200,coldMs,afterMs,timeLimitMs,
  compilerWarnings:creator.warnings||[],compilerErrors:creator.errors||[],
  compilerBlockCount:project.targets.reduce((n,t)=>n+Object.keys(t.blocks||{}).length,0),extensions:project.extensions,
  opcodes:[...new Set(project.targets.flatMap(t=>Object.values(t.blocks||{}).map(b=>b.opcode)))]};
 return r;
}

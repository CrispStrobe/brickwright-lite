// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
import {readFileSync,existsSync,statSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
export const repo=resolve(process.env.BW_REPO_ROOT||'');
export const addon=resolve(process.env.BW_ADDON_ROOT||fileURLToPath(new URL('../',import.meta.url)));
const expectedBaseline='e4ad97aaa7c84f387ee7fe314d782844abcc9722';
// Read Git's checked-out identity without launching a subprocess. This also
// works in the restricted native harness and with linked Git worktrees.
function checkedOutCommit(root){
 let dir=resolve(root,'.git');
 if(!statSync(dir).isDirectory()){
  const m=readFileSync(dir,'utf8').trim().match(/^gitdir: (.+)$/);
  if(!m)throw new Error('Unrecognized Git directory reference');
  dir=resolve(root,m[1]);
 }
 const head=readFileSync(resolve(dir,'HEAD'),'utf8').trim();
 if(/^[0-9a-f]{40}$/.test(head))return head;
 const ref=head.match(/^ref: (refs\/.+)$/)?.[1];
 if(!ref)throw new Error('Unrecognized Git HEAD');
 const common=existsSync(resolve(dir,'commondir'))?resolve(dir,readFileSync(resolve(dir,'commondir'),'utf8').trim()):dir;
 for(const base of new Set([dir,common])){
  if(existsSync(resolve(base,ref)))return readFileSync(resolve(base,ref),'utf8').trim();
  const packed=resolve(base,'packed-refs');
  if(existsSync(packed)){
   const row=readFileSync(packed,'utf8').split(/\r?\n/).find(x=>x.endsWith(' '+ref));
   if(row)return row.split(' ')[0];
  }
 }
 throw new Error(`Cannot resolve checked-out ref ${ref}`);
}
const baseline=checkedOutCommit(repo);
if(baseline!==expectedBaseline)throw new Error(`Tipline requires baseline ${expectedBaseline}; found ${baseline}`);
const fromRepo=p=>pathToFileURL(resolve(repo,p));
const {runRobotLabProgram}=await import(fromRepo('test/helpers/robot-lab-direct-vm.mjs'));
const {default:Creator}=await import(fromRepo('overlay/scratch-gui/src/lib/sb3-creator-register-art.js'));
const require=createRequire(fromRepo('package.json'));
const sha=s=>createHash('sha256').update(s).digest('hex');

/** Execute actual exported bytes; hooks observe and delegate unchanged. */
export async function runTipline(variant,{autoPorts,source,coldMs=2000,afterMs=3000,timeLimitMs=65000}={}){
 const modelText=readFileSync(resolve(addon,'models',variant+'.ldr'),'utf8');
 const program=source??readFileSync(resolve(addon,'programs/tipline.bw'),'utf8');
 const creator=new Creator();creator.parse(program);
 const bytes=Buffer.from(await(await creator.generateSB3()).arrayBuffer());
 const zip=await require('jszip').loadAsync(bytes),project=JSON.parse(await zip.file('project.json').async('string'));
 const setup={},errors=[],commands=[];
 let bodyIds;
 const r=await runRobotLabProgram(program,{modelText,autoPorts,timeLimitMs,coldMs,afterMs,frameMs:1000/60,
  observeSetup:({session,vm,hub,prepared})=>{
   const body=id=>prepared.mechanism.bodies.find(b=>b.parts.includes(id));
   bodyIds={base:body('hub').id,deck:body('deck_tile_-80').id,left:body('left_load_base').id,right:body('right_load_base').id};
   setup.bodyIds=bodyIds;
   setup.bodyDynamics=Object.fromEntries(Object.values(bodyIds).map(id=>[id,session.core.bodyDynamics(id)]));
   setup.bodyPoses=Object.fromEntries(Object.values(bodyIds).map(id=>[id,session.core.bodyPose(id)]));
   setup.gravity=prepared.mechanism.gravity;
   setup.explicitHubIdentity=session.hubs[0].hub.hubState===hub;
   setup.frozenBodies=prepared.mechanism.bodies.filter(b=>b.motion!=='dynamic'&&b.parts.length).map(b=>b.id);
   vm.runtime.on('BLOCKS_ERROR',e=>errors.push(String(e)));vm.on('BLOCKS_ERROR',e=>errors.push(String(e)));
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
   const velocities=Object.fromEntries([bodyIds.left,bodyIds.right].map(id=>[id,{linear:session.core.bodyLinearVelocity(id),angular:session.core.bodyAngularVelocity(id)}]));
   return {...variables,variables,motorAngleDeg:session.core.jointState(motor.id).angle*180/Math.PI,
    controllerMode:hub.motors._controllers[0].mode,drive:session.hubs[0].hub.readDrives().find(d=>d.port==='A'),motorDynamics:session.core.jointDynamics(motor.id),
    velocities,contacts:session.core.currentContactPairs(),sessionFailed:session.failed?String(session.failed):null};
  }
 });
 r.setup=setup;r.vmErrors=errors;r.commandLog=commands;r.commandEvents=commands;r.programSha256=sha(program);
 r.provenance={modelFilename:variant+'.ldr',modelSha256:sha(modelText),programFilename:source?'development-source':'tipline.bw',programSha256:sha(program),
  node:process.version,baseline,autoPorts:autoPorts===false?false:'ordinary',
  frameMs:1000/60,physicsStepHz:200,coldMs,afterMs,timeLimitMs,
  compilerWarnings:creator.warnings||[],compilerErrors:creator.errors||[],
  compilerBlockCount:project.targets.reduce((n,t)=>n+Object.keys(t.blocks||{}).length,0),extensions:project.extensions,
  opcodes:[...new Set(project.targets.flatMap(t=>Object.values(t.blocks||{}).map(b=>b.opcode)))]};
 return r;
}

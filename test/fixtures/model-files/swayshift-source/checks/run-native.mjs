// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
// Runs the exported program and model through the real VM, SPIKE transport,
// ordinary native import, hub controller and Jolt. Hooks only record and delegate.
import {readFileSync,writeFileSync,existsSync,statSync,mkdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {gzipSync} from 'node:zlib';

if(!process.env.BW_REPO_ROOT)throw new Error('Set BW_REPO_ROOT to the pinned brickwright-lite checkout');
export const repo=resolve(process.env.BW_REPO_ROOT);
export const addon=resolve(process.env.BW_ADDON_ROOT||fileURLToPath(new URL('../',import.meta.url)));
const expectedBaseline='e4ad97aaa7c84f387ee7fe314d782844abcc9722';
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
  if(existsSync(resolve(base,'packed-refs'))){
   const row=readFileSync(resolve(base,'packed-refs'),'utf8').split(/\r?\n/).find(x=>x.endsWith(' '+ref));
   if(row)return row.split(' ')[0];
  }
 }
 throw new Error(`Cannot resolve checked-out ref ${ref}`);
}
const baseline=checkedOutCommit(repo);
if(baseline!==expectedBaseline)throw new Error(`SwayShift requires baseline ${expectedBaseline}; found ${baseline}`);
const fromRepo=p=>pathToFileURL(resolve(repo,p));
const {runRobotLabProgram}=await import(fromRepo('test/helpers/robot-lab-direct-vm.mjs'));
const {default:Creator}=await import(fromRepo('overlay/scratch-gui/src/lib/sb3-creator-register-art.js'));
const require=createRequire(fromRepo('package.json'));
const sha=s=>createHash('sha256').update(s).digest('hex');
const runtimeFiles=[
 'overlay/scratch-gui/src/lib/bw-sim/sim-session.js',
 'overlay/scratch-gui/src/lib/bw-sim/mech/compile.js',
 'overlay/scratch-gui/src/lib/bw-sim/physics/jolt-core.js',
 'overlay/scratch-gui/src/lib/bw-sim/physics/actuators.js',
 'overlay/scratch-gui/src/lib/bw-sim/hub-bridge.js',
 'overlay/scratch-gui/src/lib/bw-sim/hubs/spike/spike-virtual-hub.js',
 'overlay/scratch-gui/src/lib/bw-sim/hubs/spike/spike-motor-controller.js',
 'overlay/scratch-gui/src/lib/spike-sim/independent-backend.js'
];

/** The `source`/`modelText` options are explicitly labelled development inputs. */
export async function runSwayShift(mode='tuned',{
 autoPorts,source,modelText:providedModel,coldMs=2000,afterMs=2000,timeLimitMs=30000,frameMs=1000/60
}={}){
 if(!['tuned','in-phase'].includes(mode))throw new Error('Mode must be tuned or in-phase');
 const modelText=providedModel??readFileSync(resolve(addon,'models/swayshift.ldr'),'utf8');
 const programFilename=mode==='tuned'?'swayshift.bw':'swayshift-in-phase.bw';
 const program=source??readFileSync(resolve(addon,'programs',programFilename),'utf8');
 const creator=new Creator();creator.parse(program);
 const bytes=Buffer.from(await(await creator.generateSB3()).arrayBuffer());
 const zip=await require('jszip').loadAsync(bytes),project=JSON.parse(await zip.file('project.json').async('string'));
 const setup={},errors=[],commandLog=[],nativeCommandLog=[],nativeCompletionLog=[];
 let bodyIds,motorJoint,passiveJoint,dynamicIds;
 const r=await runRobotLabProgram(program,{
  modelText,autoPorts,timeLimitMs,coldMs,afterMs,frameMs,withSpike:true,
  observeSetup:({session,vm,hub,prepared})=>{
   const owner=id=>prepared.mechanism.bodies.find(b=>b.parts.includes(id));
   motorJoint=prepared.mechanism.joints.find(j=>j.motor?.port==='A');
   if(!motorJoint)throw new Error('No native A motor hinge');
   bodyIds={base:owner('hub').id,trolley:owner('rack').id,pendulum:owner('pendulum_upper').id,
    motorHousing:motorJoint.body1,motorRotor:motorJoint.body2,output:owner('pinion').id};
   passiveJoint=prepared.mechanism.joints.find(j=>j.type==='hinge'&&!j.motor&&[j.body1,j.body2].includes(bodyIds.pendulum));
   if(!passiveJoint)throw new Error('No native passive pendulum hinge');
   dynamicIds=prepared.mechanism.bodies.filter(b=>b.motion==='dynamic').map(b=>b.id);
   setup.bodyIds=bodyIds;
   setup.passiveJointId=passiveJoint.id;
   setup.bodyDynamics=Object.fromEntries(dynamicIds.map(id=>[id,session.core.bodyDynamics(id)]));
   setup.bodyPoses=Object.fromEntries(dynamicIds.map(id=>[id,session.core.bodyPose(id)]));
   setup.gravity=prepared.mechanism.gravity;
   setup.explicitHubIdentity=session.hubs[0].hub.hubState===hub;
   setup.frozenBodies=prepared.mechanism.bodies.filter(b=>b.motion!=='dynamic'&&b.parts.length).map(b=>b.id);
   const blocks=vm.runtime.targets.flatMap(t=>Object.values(t.blocks._blocks));
   const literal=b=>!(b.opcode in vm.runtime._primitives)&&Object.keys(b.fields||{}).length===1&&!Object.keys(b.inputs||{}).length;
   setup.missingOpcodes=[...new Set(blocks.filter(b=>!(b.opcode in vm.runtime._primitives)&&!(b.opcode in vm.runtime._hats)&&!literal(b)).map(b=>b.opcode))];
   vm.runtime.on('ERROR',e=>errors.push(String(e)));
   vm.runtime.on('BLOCKS_ERROR',e=>errors.push(String(e)));vm.on('BLOCKS_ERROR',e=>errors.push(String(e)));
   const clock=()=>({t:session.time,nativeTime:session.core.time,hubTime:session.hubs[0].hub.timeMs/1000});
   const variables=()=>Object.fromEntries(vm.runtime.targets.flatMap(t=>Object.values(t.variables||{}).map(v=>[v.name,v.value])));
   const motorSnapshot=()=>({nativeJointAngleDeg:session.core.jointState(motorJoint.id).angle*180/Math.PI,
    hubPositionFieldDeg:hub.data.motors[0].position,measuredDegPerSec:hub.data.motors[0].measuredDegPerSec,
    mode:hub.motors._controllers[0].mode,targetDeg:hub.motors._controllers[0].target,busy:hub.motors.busy('A'),
    defaultStopAction:hub.motors._controllers[0].defaultStopAction});
   for(const name of ['runMotorDegrees','setMotorSpeed','setMotorPower','stopMotor']){
    const original=vm.runtime.robotLab[name];
    vm.runtime.robotLab[name]=function(...args){
     const event={...clock(),name,args:structuredClone(args),variables:variables(),busyBefore:hub.motors.busy('A'),before:motorSnapshot()};commandLog.push(event);
     const result=original.apply(this,args);
     if(result&&typeof result.then==='function')result.then(value=>{event.doneAt=session.time;event.nativeDoneAt=session.core.time;event.hubDoneAt=session.hubs[0].hub.timeMs/1000;event.result=value;event.after=motorSnapshot();});
     else{event.result=result;event.after=motorSnapshot();}
     return result;
    };
   }
   // These wrappers leave arguments, return values, clock ownership and controller
   // logic unchanged. They distinguish actual hub events from VM resume times.
   for(const name of ['runForDegrees','runToPosition','runAtSpeed','runAtPower','stop','setStopAction']){
    const original=hub.motors[name];
    if(typeof original!=='function')continue;
    hub.motors[name]=function(...args){
     const event={...clock(),name,args:structuredClone(args),busyBefore:hub.motors.busy('A'),before:motorSnapshot()};nativeCommandLog.push(event);
     const result=original.apply(this,args);
     event.after=motorSnapshot();
     if(result&&typeof result.then==='function')result.then(value=>{event.doneAt=session.time;event.nativeDoneAt=session.core.time;event.hubDoneAt=session.hubs[0].hub.timeMs/1000;event.result=value;});
     return result;
    };
   }
   const complete=hub.motors._complete;
   hub.motors._complete=function(controller,result){
    const event={...clock(),port:this._controllers.indexOf(controller),result:result??'completed',before:motorSnapshot()};
    const value=complete.call(this,controller,result);
    event.after=motorSnapshot();nativeCompletionLog.push(event);return value;
   };
  },
  observeFrame:({session,vm,hub})=>{
   const variables=Object.fromEntries(vm.runtime.targets.flatMap(t=>Object.values(t.variables||{}).map(v=>[v.name,v.value])));
   const motorDynamics=session.core.jointDynamics(motorJoint.id);
   return {...variables,variables,nativeTime:motorDynamics?.t??session.core.time,coreTime:session.core.time,hubTime:session.hubs[0].hub.timeMs/1000,motorAngleDeg:session.core.jointState(motorJoint.id).angle*180/Math.PI,
    controllerMode:hub.motors._controllers[0].mode,controllerTargetDeg:hub.motors._controllers[0].target,
    defaultStopAction:hub.motors._controllers[0].defaultStopAction,
    drive:session.hubs[0].hub.readDrives().find(d=>d.port==='A'),motorDynamics,
    passiveDynamics:session.core.jointDynamics(passiveJoint.id),
    velocities:Object.fromEntries(dynamicIds.map(id=>[id,{linear:session.core.bodyLinearVelocity(id),angular:session.core.bodyAngularVelocity(id)}])),
    contacts:session.core.currentContactPairs(),sessionFailed:session.failed?String(session.failed):null};
  }
 });
 r.setup=setup;r.vmErrors=[...new Set([...errors,...(r.vmErrors||[])])];r.commandLog=commandLog;r.commandEvents=commandLog;
 r.nativeCommandLog=nativeCommandLog;r.nativeCompletionLog=nativeCompletionLog;r.programSha256=sha(program);
 r.provenance={modelFilename:providedModel?'development-source':'swayshift.ldr',modelSha256:sha(modelText),
  programFilename:source?'development-source':programFilename,programSha256:sha(program),mode,
  node:process.version,baseline,autoPorts:autoPorts===false?false:'ordinary',withSpike:true,
  clockUnits:{
   'track[].t':'milliseconds','finishedAt':'milliseconds',
   'commandLog[].t, commandLog[].doneAt':'milliseconds',
   'nativeCommandLog[].t, nativeCommandLog[].doneAt, nativeCompletionLog[].t':'milliseconds',
   'track[].extra.nativeTime, track[].extra.coreTime, track[].extra.hubTime':'seconds',
   'commandLog[].nativeTime, commandLog[].nativeDoneAt, commandLog[].hubTime, commandLog[].hubDoneAt':'seconds',
   'nativeCommandLog[].nativeTime, nativeCommandLog[].nativeDoneAt, nativeCommandLog[].hubTime, nativeCommandLog[].hubDoneAt':'seconds',
   'nativeCompletionLog[].nativeTime, nativeCompletionLog[].hubTime':'seconds',
   'motorDynamics.t, passiveDynamics.t, stepSeconds':'seconds',
   'program timer and exported first_start/first_end/second_start/second_end/observe_start/observe_end/return_start/return_end':'seconds'
  },
  frameMs,physicsStepHz:200,coldMs,afterMs,timeLimitMs,
  runtimeSourceSha256:Object.fromEntries(runtimeFiles.map(p=>[p,sha(readFileSync(resolve(repo,p)))])),
  compilerWarnings:creator.warnings||[],compilerErrors:creator.errors||[],
  compilerBlockCount:project.targets.reduce((n,t)=>n+Object.keys(t.blocks||{}).length,0),extensions:project.extensions,
  opcodes:[...new Set(project.targets.flatMap(t=>Object.values(t.blocks||{}).map(b=>b.opcode)))]};
 return r;
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const [mode='tuned',output]=process.argv.slice(2);
 if(!output)throw new Error('Usage: run-native.mjs tuned|in-phase OUTPUT.json[.gz]');
 const result=await runSwayShift(mode),out=resolve(output),json=JSON.stringify(result)+'\n';
 mkdirSync(dirname(out),{recursive:true});writeFileSync(out,out.endsWith('.gz')?gzipSync(json,{level:9}):json);
 console.log(JSON.stringify({output:out,mode,frames:result.track.length,finishedAt:result.finishedAt,issues:result.issues,
  compilerErrors:result.provenance.compilerErrors,vmErrors:result.vmErrors,finalVariables:result.track.at(-1)?.extra.variables}));
}

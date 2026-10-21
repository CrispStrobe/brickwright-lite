// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
// Real parser, Scratch VM, bundled Robot Lab extension and API. Only the clock
// is simulated, following spike-arena-vm.mjs; all motor completion is feedback.
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {VM,FakeClock,HubState} from './spike-arena-vm.mjs';
import Creator from '../../overlay/scratch-gui/src/lib/sb3-creator-register-art.js';
import {loadExtensionClass,bundledExtensionIds,VM_SRC} from './bw-extensions.mjs';
import {catalogFrom,prepareModel,SimSession,hubBodyOf} from '../../overlay/scratch-gui/src/lib/bw-sim/sim-session.js';
import {loadJolt} from '../../overlay/scratch-gui/src/lib/bw-sim/physics/jolt-core.js';
import {createRobotLabApi} from '../../overlay/scratch-gui/src/lib/bw-sim/api/robot-lab-api.js';
const CATALOG=catalogFrom(JSON.parse(readFileSync(new URL('../../overlay/scratch-gui/src/lib/bw-sim/part-meta/parts.json',import.meta.url))));
const Timer=createRequire(import.meta.url)(VM_SRC+'/util/timer.js');
export async function runRobotLabProgram(source,{modelText,timeLimitMs,catalog=CATALOG}){
 const p=prepareModel(modelText,catalog,{mat:'plain'}),J=await loadJolt(),hub=new HubState();hub.setSimulationEnabled(true);
 const session=new SimSession({...p,hubState:hub,catalog,mat:'plain',J}),vm=new VM(),clock=new FakeClock(1.7e12);
 const api=createRobotLabApi({getSession:()=>session,getStatus:()=> 'running',start:async()=>{},locale:()=> 'en'});vm.runtime.robotLab=api;
 let finishedAt=null,clockInstalled=false;const track=[];
 try{
  const creator=new Creator();creator.parse(source);const data=Buffer.from(await(await creator.generateSB3()).arrayBuffer());
  const manager=vm.extensionManager,original=manager.loadExtensionURL.bind(manager);
  manager.loadExtensionURL=id=>{if(id!=='robotlab')return original(id);const Cls=loadExtensionClass(bundledExtensionIds().get(id)),ext=new Cls(vm.runtime);manager._loadedExtensions.set(id,manager._registerInternalExtension(ext));return Promise.resolve();};
  await vm.loadProject(data);vm.setCompatibilityMode(true);vm.runtime.currentStepTime=1000/30;
  clock.install();clockInstalled=true;let budget=0;vm.runtime.sequencer.timer=new Timer({now:()=>budget++});vm.greenFlag();
  for(let i=0;i<Math.ceil(timeLimitMs/(1000/30));i++){
   await clock.advance(1000/30);vm.runtime._step();for(let j=0;j<5;j++)await Promise.resolve();
   session.tick(1000/30);await session.idle();
   track.push({t:session.time,bodies:Object.fromEntries(p.mechanism.bodies.filter(b=>b.motion==='dynamic').map(b=>[b.id,session.core.bodyPose(b.id)])),joints:Object.fromEntries(p.mechanism.joints.filter(j=>['hinge','slider'].includes(j.type)).map(j=>[j.id,session.core.jointState(j.id)])),busy:Object.fromEntries(p.mechanism.actuators.map(a=>[a.port,hub.motors.busy(a.port)]))});
   if(i>5&&!vm.runtime.threads.some(t=>t.status!==4)){finishedAt=session.time;break;}
  }
  return {track,mechanism:p.mechanism,issues:p.issues,hubId:hubBodyOf(p.model,p.mechanism,catalog),unsupported:[],finishedAt};
 }finally{api.dispose();vm.stopAll();vm.quit();if(clockInstalled)clock.uninstall();session.dispose();}
}

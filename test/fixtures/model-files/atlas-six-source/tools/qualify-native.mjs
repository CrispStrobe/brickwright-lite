// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
// Native fixed-session qualification recorder. Uses Brickwright's actual parser,
// Scratch VM, shipped robotlab extension, controller and Jolt physics. The fake
// clock/VM stepping follows test/helpers/robot-lab-direct-vm.mjs at the recorded
// checkout revision; no mechanism output poses are assigned by this recorder.
import {readFileSync, writeFileSync, mkdirSync, statSync} from 'node:fs';
import path from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {augmentNativeCatalog} from './catalog-native.mjs';

const argv = process.argv.slice(2), options = {};
const positional = [];
for (let i=0;i<argv.length;i++) {
  if (argv[i].startsWith('--')) options[argv[i].slice(2)] = argv[++i];
  else positional.push(argv[i]);
}
if (positional.length < 3) throw new Error('Usage from the selected repo: node --import ./scripts/lib/register-gui-scope.mjs /path/qualify-native.mjs MODEL.ldr PROGRAM.bw OUTPUT.json [--repo PATH] [--contract PATH] [--ldraw-extra PATH] [--ldraw-provenance FILE.json] [--limit MS] [--cold MS] [--after MS] [--frame MS] [--auto-ports false|true]');
const [modelFile, programFile, outputFile] = positional.map(p=>path.resolve(p));
const repo = path.resolve(options.repo || process.cwd());
const imp = rel => import(pathToFileURL(path.join(repo,rel)).href);
const read = rel => readFileSync(path.join(repo,rel),'utf8');
const gitPath=path.join(repo,'.git');
const gitDir=statSync(gitPath).isDirectory()?gitPath:path.resolve(repo,readFileSync(gitPath,'utf8').trim().replace(/^gitdir:\s*/,''));
const gitHead=readFileSync(path.join(gitDir,'HEAD'),'utf8').trim();
const readRevision=()=>{
  if(!gitHead.startsWith('ref: '))return gitHead;
  const ref=gitHead.slice(5);
  try{return readFileSync(path.join(gitDir,ref),'utf8').trim();}catch(error){
    const packed=readFileSync(path.join(gitDir,'packed-refs'),'utf8').split('\n').find(line=>line.endsWith(' '+ref));
    if(!packed)throw error;return packed.split(' ')[0];
  }
};
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const modelBytes=readFileSync(modelFile), programBytes=readFileSync(programFile);
const source = programBytes.toString('utf8');
const frameMs = Number(options.frame || 1000/30), coldMs=Number(options.cold || 1000), afterMs=Number(options.after || 1000), timeLimitMs=Number(options.limit || 210000);
if (![frameMs,coldMs,afterMs,timeLimitMs].every(Number.isFinite) || frameMs<=0 || timeLimitMs<=0 || coldMs<0 || afterMs<0) throw new Error('Non-finite or invalid timing option.');
const prepareOptions = {mat:'plain', ...(options['auto-ports']===undefined?{}:{autoPorts:options['auto-ports']==='true'})};
const record = {
  schema:'brickwright-native-record/v1',
  scope:'Native fixed-session VM and physics; no browser or hardware qualification',
  createdAt:new Date().toISOString(),
  inputs:{model:{filename:path.basename(modelFile),bytes:modelBytes.length,sha256:sha256(modelBytes)},program:{filename:path.basename(programFile),bytes:programBytes.length,sha256:sha256(programBytes)}},
  runtime:{node:process.version,checkout:readRevision(),integratedRoot:process.env.BW_INTEGRATED_ROOT || path.join(repo,'packages/scratch-gui'),rootLockSha256:sha256(read('package-lock.json'))},
  timing:{frameMs,physicsStepMs:5,coldMs,afterMs,timeLimitMs},
  prepareOptions,
  apiMethodCounts:{}, apiEvents:[], refusals:[], extensionLoads:[],
  track:[], finishedAt:null
};
record.runtime.recorderSha256=sha256(readFileSync(fileURLToPath(import.meta.url)));
record.runtime.catalogAdapterSha256=sha256(readFileSync(new URL('./catalog-native.mjs',import.meta.url)));
if(options.contract){const bytes=readFileSync(path.resolve(options.contract));record.inputs.contract={filename:path.basename(options.contract),bytes:bytes.length,sha256:sha256(bytes)};}
const save = () => {mkdirSync(path.dirname(outputFile),{recursive:true});writeFileSync(outputFile,JSON.stringify(record));};
let session, vm, api, clock, clockInstalled=false;
try {
  const [{VM,FakeClock,HubState},{loadExtensionClass,bundledExtensionIds,VM_SRC},{catalogFrom,prepareModel,SimSession,hubBodyOf},{loadJolt},{createRobotLabApi},{default:Creator}] = await Promise.all([
    imp('test/helpers/spike-arena-vm.mjs'),imp('test/helpers/bw-extensions.mjs'),imp('overlay/scratch-gui/src/lib/bw-sim/sim-session.js'),imp('overlay/scratch-gui/src/lib/bw-sim/physics/jolt-core.js'),imp('overlay/scratch-gui/src/lib/bw-sim/api/robot-lab-api.js'),imp('overlay/scratch-gui/src/lib/sb3-creator-register-art.js')
  ]);
  const catalogText=read('overlay/scratch-gui/src/lib/bw-sim/part-meta/parts.json'),catalog=catalogFrom(JSON.parse(catalogText));
  record.runtime.catalogSha256=sha256(catalogText);
  record.catalogAugmentation=await augmentNativeCatalog({repo,catalog,modelText:modelBytes.toString('utf8'),extraRoot:options['ldraw-extra'],provenanceFile:options['ldraw-provenance']});
  record.runtime.guiLockSha256=sha256(readFileSync(path.join(record.runtime.integratedRoot,'package-lock.json')));
  record.runtime.compilerRegisterSha256=sha256(read('overlay/scratch-gui/src/lib/sb3-creator-register-art.js'));
  const {supportsWasmSimd}=await imp('overlay/scratch-gui/src/lib/bw-sim/physics/wasm-simd.js');
  const joltPackage=path.join(record.runtime.integratedRoot,'node_modules/jolt-physics'),joltManifest=JSON.parse(readFileSync(path.join(joltPackage,'package.json'))),simd=supportsWasmSimd();
  const joltModule=simd?'dist/jolt-physics.simd.wasm-compat.js':'dist/jolt-physics.wasm-compat.js';
  record.runtime.physics={name:joltManifest.name,version:joltManifest.version,license:joltManifest.license,simd,module:joltModule,moduleSha256:sha256(readFileSync(path.join(joltPackage,joltModule)))};
  const req=createRequire(path.join(repo,'test/helpers/robot-lab-direct-vm.mjs'));
  const Timer=req(VM_SRC+'/util/timer.js');
  const prepared=prepareModel(modelBytes.toString('utf8'),catalog,prepareOptions);
  record.effectivePreparation={mat:'plain',autoPorts:prepareOptions.autoPorts===undefined?!/^0 Author: (?:Brickwright|CrispStrobe)\s*$/m.test(modelBytes.toString('utf8')):prepareOptions.autoPorts,breakLoops:true};
  Object.assign(record,{model:prepared.model,runModel:prepared.runModel,mechanism:prepared.mechanism,issues:prepared.issues});
  record.preparationComparison=Object.fromEntries([['ordinary',undefined],['unassisted',false]].map(([mode,autoPorts])=>{
    const p=prepareModel(modelBytes.toString('utf8'),catalog,{mat:'plain',...(autoPorts===undefined?{}:{autoPorts})});
    return [mode,{issues:p.issues,mechanism:p.mechanism}];
  }));
  if (!prepared.mechanism) throw new Error('No mechanism was prepared.');
  const creator=new Creator();
  creator.parse(source);
  const sb3=Buffer.from(await(await creator.generateSB3()).arrayBuffer());
  record.compiler={validation:creator.validate(),warnings:creator.warnings || [],unparsed:creator.unparsed || [],sb3Sha256:sha256(sb3),opcodes:[...new Set(creator.project.targets.flatMap(t=>Object.values(t.blocks || {}).map(b=>b.opcode)))].sort()};
  if (!record.compiler.validation.isValid || record.compiler.unparsed.length) throw new Error('The registered compiler refused this program.');
  const forbidden=record.compiler.opcodes.filter(op=>/^robotlab_(loadModel|resetSimulation|stopSimulation|setTimeScale|camera)$/i.test(op) || /^spikeprime_/.test(op));
  if(forbidden.length) throw new Error('This fixed-session recorder does not wire these program features: '+forbidden.join(', '));
  const J=await loadJolt(),hub=new HubState();hub.setSimulationEnabled(true);
  session=new SimSession({...prepared,hubState:hub,catalog,mat:'plain',J});
  vm=new VM();clock=new FakeClock(1.7e12);
  let status='ready';
  api=createRobotLabApi({getSession:()=>session,getStatus:()=>status,start:async()=>{status='running';},ensureRunning:()=>{status='running';},locale:()=> 'en'});
  record.controlledMotors=api.motors();record.hubId=hubBodyOf(prepared.model,prepared.mechanism,catalog);
  const vmVariables=()=>Object.assign({},...vm.runtime.targets.map(t=>Object.fromEntries(Object.values(t.variables || {}).map(v=>[v.name,v.value]))));
  const recordResult=(name,args,result,event)=>{
    if(result && typeof result==='object' && result.ok===false) record.refusals.push({t:session.time,name,args,result});
    if(name==='runMotorDegrees' && result!=='completed') record.refusals.push({t:session.time,name,args,result});
    if(event) Object.assign(event,{resolvedAt:session.time,result,...(name==='runMotorDegrees'?{encoderAtResolution:api.encoder(args[0])}:{})});
    return result;
  };
  for(const name of ['start','stopMotor','runMotorDegrees','setMotorPower','setMotorSpeed','motorAngle','motorSpeed']){
    const original=api[name];
    api[name]=(...args)=>{
      record.apiMethodCounts[name]=(record.apiMethodCounts[name] || 0)+1;
      const event=name==='motorAngle'||name==='motorSpeed'?null:{name,args,t:session.time,variables:vmVariables(),...(name==='runMotorDegrees'?{encoderAtCall:api.encoder(args[0])}:{})};
      if(event)record.apiEvents.push(event);
      const result=original.apply(api,args);
      return result && typeof result.then==='function'?result.then(r=>recordResult(name,args,r,event)):recordResult(name,args,result,event);
    };
  }
  vm.runtime.robotLab=api;
  const manager=vm.extensionManager,originalLoader=manager.loadExtensionURL.bind(manager);
  manager.loadExtensionURL=id=>{
    record.extensionLoads.push(id);
    if(id!=='robotlab')return originalLoader(id);
    const Cls=loadExtensionClass(bundledExtensionIds().get(id)),ext=new Cls(vm.runtime);
    manager._loadedExtensions.set(id,manager._registerInternalExtension(ext));
    return Promise.resolve();
  };
  await vm.loadProject(sb3);
  record.compiler.missingRobotlabPrimitives=record.compiler.opcodes.filter(op=>op.startsWith('robotlab_')&&!op.includes('_menu_')&&typeof vm.runtime._primitives[op]!=='function');
  if(record.compiler.missingRobotlabPrimitives.length)throw new Error('Robotlab primitives are missing: '+record.compiler.missingRobotlabPrimitives.join(', '));
  vm.setCompatibilityMode(true);vm.runtime.currentStepTime=1000/30;
  clock.install();clockInstalled=true;let budget=0;vm.runtime.sequencer.timer=new Timer({now:()=>budget++});
  const snapshot=phase=>record.track.push({
    t:session.time,phase,
    variables:vm.runtime.targets.map(t=>({name:t.getName(),variables:Object.fromEntries(Object.values(t.variables || {}).map(v=>[v.name,v.value]))})),
    bodies:Object.fromEntries(prepared.mechanism.bodies.filter(b=>b.motion==='dynamic').map(b=>[b.id,session.core.bodyPose(b.id)])),
    joints:Object.fromEntries(prepared.mechanism.joints.filter(j=>['hinge','slider'].includes(j.type)).map(j=>[j.id,session.core.jointState(j.id)])),
    busy:Object.fromEntries(prepared.mechanism.actuators.map(a=>[a.port,hub.motors.busy(a.port)])),
    encoder:Object.fromEntries(record.controlledMotors.map(m=>[m.port,api.encoder(m.port)]))
  });
  snapshot('cold');
  for(let ms=0;ms<coldMs;ms+=frameMs){await clock.advance(frameMs);session.tick(frameMs);await session.idle();snapshot('cold');}
  vm.greenFlag();
  for(let i=0;i<Math.ceil(timeLimitMs/frameMs);i++){
    await clock.advance(frameMs);vm.runtime._step();for(let n=0;n<5;n++)await Promise.resolve();
    session.tick(frameMs);await session.idle();snapshot('program');
    if(i>5&&!vm.runtime.threads.some(t=>t.status!==4)){record.finishedAt=session.time;break;}
  }
  if(record.finishedAt!==null)for(let ms=0;ms<afterMs;ms+=frameMs){await clock.advance(frameMs);session.tick(frameMs);await session.idle();snapshot('after');}
  record.programVariables=vm.runtime.targets.map(t=>({name:t.getName(),variables:Object.fromEntries(Object.values(t.variables || {}).map(v=>[v.name,v.value]))}));
  record.endThreads=vm.runtime.threads.map(t=>({status:t.status,topBlock:t.topBlock}));
  record.summary={sampleCount:record.track.length,finishedAt:record.finishedAt,dynamicBodies:prepared.mechanism.bodies.filter(b=>b.motion==='dynamic').length,jointTypes:Object.fromEntries([...new Set(prepared.mechanism.joints.map(j=>j.type))].map(type=>[type,prepared.mechanism.joints.filter(j=>j.type===type).length])),couplings:prepared.mechanism.couplings,issues:record.issues,refusals:record.refusals,finalEncoders:record.track.at(-1)?.encoder,finalBusy:record.track.at(-1)?.busy};
  record.recordingStatus='completed';save();
  process.stdout.write(JSON.stringify(record.summary,null,2)+'\n');
} catch(error) {
  if(error.catalogAudit)record.catalogAugmentation=error.catalogAudit;
  record.recordingStatus='failed';record.error={name:error.name,message:error.message,stack:error.stack};save();
  process.stderr.write(error.stack+'\n');process.exitCode=1;
} finally {
  api?.dispose();if(vm){vm.stopAll();vm.quit();}if(clockInstalled)clock.uninstall();session?.dispose();
}

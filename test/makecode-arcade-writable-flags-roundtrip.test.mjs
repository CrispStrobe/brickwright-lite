import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {writableFlagProfiles} from './fixtures/arcade-writable-flags-roundtrip.mjs';
import {VM_SRC} from './helpers/bw-extensions.mjs';
import {runProgram,stepFrames,clearStrayTimers} from './helpers/bw-vm.mjs';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
const require=createRequire(import.meta.url),codec=require(VM_SRC+'/util/bw-values.js'),dispatch=require(VM_SRC+'/dispatch/central-dispatch.js');
const sample=run=>Object.fromEntries(run.vm.runtime.targets.flatMap(t=>Object.values(t.variables)).map(v=>[v.name.replace(/^(?:Game_)+/,''),codec.decode(v.value)]));
const originalSample=out=>Object.fromEntries(Object.entries(out).map(([key,value])=>[key.replace(/^(?:Game_)+/,''),value]));
function compare(observed,expected,label){for(const[key,value]of Object.entries(expected))assert.ok(Object.is(observed[key],value),`${label} ${key}: ${String(observed[key])} expected ${String(value)}`);}
for(const profile of writableFlagProfiles)test(`writable flags ${profile.name}: native/Code/same+fresh SB3/original export/reimport`,async()=>{
 const files={'main.ts':profile.source,'pxt.json':JSON.stringify({name:'owned-flags-'+profile.name,dependencies:{device:'*'},files:['main.ts']})};
 // Previously completed unchanged original probes are not rerun merely to read
 // their observations. New compound/primitive probes use the actual original.
 if(profile.needsOriginal)compare(originalSample(await runPxtArcade(files,{fakeClock:true})),profile.expected,'source original');
 const imported=arcadeToPseudocode(files);assert.deepEqual(imported.unsupported,[]);assert.match(imported.code,/arcade set flags of/);
 const boot=async run=>{
  if(!profile.timed)return;
  run.vm.stopAll();let now=0;const runtime=run.vm.runtime;
  const adapter=dispatch.services[run.vm.extensionManager._loadedExtensions.get('arcade')];
  assert.equal(dispatch.services.runtime,runtime,'the process dispatcher belongs to this active VM');
  assert.equal(adapter._inst._runtime,runtime,'registered extension uses the actual active runtime');
  assert.equal(runtime._arcadeFramePhase.ext,adapter._inst,'phase driver and registered primitive service share the same extension');
  assert.equal(runtime._arcadeFramePhase.disposed,false,'a successfully loaded project has an active phase driver');
  assert.equal(runtime.listenerCount('ARCADE_FRAME'),1,'actual SB3 reload has only one Arcade physical-frame listener');
  runtime.bwArcadeProgramClock={now:()=>now};runtime.updateCurrentMSecs=()=>{runtime.currentMSecs=now;};runtime.currentMSecs=0;runtime.ioDevices.clock.resetProjectTimer();
  const initialCalls=run.calls.get('arcade_spriteProperty')||0;
  run.vm.greenFlag();await stepFrames(run.vm,1,0);
  const bootCalls=run.calls.get('arcade_spriteProperty')||0;
  assert.equal(bootCalls-initialCalls,1,'the original pause is pending after the initial x read at boot0');
  assert.equal(sample(run).before,200);
  const physicalAtBoot=Object.values(runtime.bwArcadeDeviceState.sprites).map(s=>s.x);
  assert.deepEqual(physicalAtBoot,[200],'no physical clamping occurs during original boot0');
  now=20;await stepFrames(run.vm,1,20);
  assert.equal((run.calls.get('arcade_spriteProperty')||0)-bootCalls,2,'due20 continuation reads x and flags before physics; saved globals cannot fake completion');
 };
 const runs=[],check=(run,label)=>{assert.deepEqual(run.errors,[],label+' errors');assert.deepEqual(run.creator.warnings,[],label+' warnings');compare(sample(run),profile.expected,label);};
 try{
  const native=await runProgram(imported.code,{frames:profile.timed?0:100,storage:true,uploads:imported.costumes});runs.push(native);await boot(native);check(native,'native');
  const archive=Buffer.from(await(await native.vm.saveProjectSb3()).arrayBuffer());const service=native.vm.extensionManager._loadedExtensions.get('arcade'),adapter=dispatch.services[service];await native.vm.loadProject(archive);assert.equal(native.vm.extensionManager._loadedExtensions.get('arcade'),service,'same SB3 keeps the existing native service');assert.equal(dispatch.services[service],adapter,'same SB3 keeps the existing extension instance');if(profile.timed)await boot(native);else{native.vm.greenFlag();await stepFrames(native.vm,100);}check(native,'same SB3');
  // Scratch central dispatch is process-global: reload the original VM before
  // constructing the next one, as one browser document does in production.
  native.vm.quit();
  const code=await runProgram(native.creator.decompile(),{frames:profile.timed?0:100,storage:true,uploads:imported.costumes});runs.push(code);await boot(code);check(code,'Code');
  code.vm.quit();
  const fresh=await runProgram('SPRITE Placeholder:\nWHEN flag clicked:\n  hide',{frames:0,storage:true});runs.push(fresh);fresh.vm.stopAll();await fresh.vm.loadProject(archive);if(profile.timed)await boot(fresh);else{fresh.vm.greenFlag();await stepFrames(fresh.vm,100);}check(fresh,'fresh SB3');fresh.vm.quit();
  const exported=projectToArcade(native.creator.project,{costumeSvg:(t,c)=>native.creator.assets.get(c.assetId)?.data});assert.deepEqual(exported.unsupported,[]);
  compare(originalSample(await runPxtArcade(exported.files,{fakeClock:true})),profile.expected,'export original');
  const again=arcadeToPseudocode(exported.files);assert.deepEqual(again.unsupported,[]);const reimport=await runProgram(again.code,{frames:profile.timed?0:100,storage:true,uploads:again.costumes});runs.push(reimport);await boot(reimport);check(reimport,'reimport');
 }finally{for(const run of runs)run.vm.quit();clearStrayTimers();}
});

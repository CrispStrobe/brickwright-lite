import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {writableFlagProfiles} from './fixtures/arcade-writable-flags-roundtrip.mjs';
import {VM_SRC} from './helpers/bw-extensions.mjs';
import {runProgram,stepFrames,clearStrayTimers} from './helpers/bw-vm.mjs';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
const require=createRequire(import.meta.url),codec=require(VM_SRC+'/util/bw-values.js');
const sample=run=>Object.fromEntries(run.vm.runtime.targets.flatMap(t=>Object.values(t.variables)).map(v=>[v.name.replace(/^(?:Game_)+/,''),codec.decode(v.value)]));
const originalSample=out=>Object.fromEntries(Object.entries(out).map(([key,value])=>[key.replace(/^(?:Game_)+/,''),value]));
function compare(observed,expected,label){for(const[key,value]of Object.entries(expected))assert.ok(Object.is(observed[key],value),`${label} ${key}: ${String(observed[key])} expected ${String(value)}`);}
for(const profile of writableFlagProfiles)test(`writable flags ${profile.name}: native/Code/same+fresh SB3/original export/reimport`,async()=>{
 const files={'main.ts':profile.source,'pxt.json':JSON.stringify({name:'owned-flags-'+profile.name,dependencies:{device:'*'},files:['main.ts']})};
 // Previously completed unchanged original probes are not rerun merely to read
 // their observations. New compound/primitive probes use the actual original.
 if(profile.needsOriginal)compare(originalSample(await runPxtArcade(files,{fakeClock:true})),profile.expected,'source original');
 const imported=arcadeToPseudocode(files);assert.deepEqual(imported.unsupported,[]);assert.match(imported.code,/arcade set flags of/);
 const runs=[],check=(run,label)=>{assert.deepEqual(run.errors,[],label+' errors');assert.deepEqual(run.creator.warnings,[],label+' warnings');compare(sample(run),profile.expected,label);};
 try{
  const native=await runProgram(imported.code,{frames:100,storage:true,uploads:imported.costumes});runs.push(native);check(native,'native');
  const code=await runProgram(native.creator.decompile(),{frames:100,storage:true,uploads:imported.costumes});runs.push(code);check(code,'Code');
  const archive=Buffer.from(await(await native.vm.saveProjectSb3()).arrayBuffer());await native.vm.loadProject(archive);native.vm.greenFlag();await stepFrames(native.vm,100);check(native,'same SB3');
  const fresh=await runProgram('SPRITE Placeholder:\nWHEN flag clicked:\n  hide',{frames:0,storage:true});runs.push(fresh);fresh.vm.stopAll();await fresh.vm.loadProject(archive);fresh.vm.greenFlag();await stepFrames(fresh.vm,100);check(fresh,'fresh SB3');
  const exported=projectToArcade(native.creator.project,{costumeSvg:(t,c)=>native.creator.assets.get(c.assetId)?.data});assert.deepEqual(exported.unsupported,[]);
  compare(originalSample(await runPxtArcade(exported.files,{fakeClock:true})),profile.expected,'export original');
  const again=arcadeToPseudocode(exported.files);assert.deepEqual(again.unsupported,[]);const reimport=await runProgram(again.code,{frames:100,storage:true,uploads:again.costumes});runs.push(reimport);check(reimport,'reimport');
 }finally{for(const run of runs)run.vm.quit();clearStrayTimers();}
});

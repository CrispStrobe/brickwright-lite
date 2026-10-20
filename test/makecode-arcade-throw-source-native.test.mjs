import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {runProgram,clearStrayTimers,stepFrames} from './helpers/bw-vm.mjs';
import {createRequire} from 'node:module';
import {VM_SRC} from './helpers/bw-extensions.mjs';
const require=createRequire(import.meta.url),BW=require(VM_SRC+'/util/bw-values.js');
const value=(run,name)=>BW.decode(run.vm.runtime.targets.flatMap(target=>Object.values(target.variables)).find(variable=>variable.name===name)?.value);
// This native source test requires the explicit private, sealed candidate dialect
// projection until the canonical word is qualified and normally adopted.
test('ordinary source Throw CALL preserves preceding effects and aborts later effects',async()=>{
 const imported=arcadeToPseudocode('let entered=0;let after=0;function fail(value){entered=1;throw value}fail(20);after=1;',{throwPrototype:true});
 assert.deepEqual(imported.unsupported,[]);let run;
 try{run=await runProgram(imported.code,{frames:40});assert.deepEqual(run.creator.warnings,[]);assert.equal(value(run,'entered'),1);assert.equal(value(run,'after'),0);assert.equal(run.creator.project.targets.flatMap(target=>Object.values(target.blocks)).filter(block=>block.opcode==='arcade_throwValue').length,1);assert.ok(run.errors.some(error=>/20/.test(String(error.message||error))));}
 finally{if(run){run.vm.stopAll();run.vm.quit();}clearStrayTimers();}
});
test('untaken source Throw keeps normal branch completion and effects',async()=>{
 const imported=arcadeToPseudocode('let entered=0;let after=0;function maybe(value){if(value)throw "failure";return 7}let result=maybe(false);after=1;',{throwPrototype:true});assert.deepEqual(imported.unsupported,[]);let run;
 try{run=await runProgram(imported.code,{frames:40});assert.deepEqual(run.creator.warnings,[]);assert.deepEqual(run.errors,[]);assert.equal(value(run,'result'),7);assert.equal(value(run,'after'),1);await stepFrames(run.vm,2);assert.equal(value(run,'after'),1);}
 finally{if(run){run.vm.stopAll();run.vm.quit();}clearStrayTimers();}
});
const exceptions=require(VM_SRC+'/util/bw-arcade-exceptions.js');
test('full candidate source Throw preserves seven actual primitive values',async()=>{
 for(const [expression,expected] of [['20',20],['"20"','20'],['false',false],['0',0],['""',''],['null',null],['undefined',undefined]]){
  const imported=arcadeToPseudocode(`let entered=0;let after=0;entered=1;throw ${expression};after=1;`,{throwPrototype:true});assert.deepEqual(imported.unsupported,[]);let run;
  try{run=await runProgram(imported.code,{frames:0});const signals=[];run.vm.runtime.on('BLOCKS_ERROR',error=>signals.push(error));await stepFrames(run.vm,8);assert.equal(signals.length,1,expression);const actual=exceptions.diagnostic(run.vm.runtime,signals[0]);assert.ok(actual,expression);assert.equal(actual.value,expected,expression);assert.equal(value(run,'entered'),1);assert.equal(value(run,'after'),0);}
  finally{if(run){run.vm.stopAll();run.vm.quit();}clearStrayTimers();}
 }
});
test('source Throw preserves actual Code and same/fresh SB3 execution boundaries',async()=>{
 const imported=arcadeToPseudocode('let entered=0;let after=0;function fail(){entered=1;throw 20}fail();after=1;',{throwPrototype:true});assert.deepEqual(imported.unsupported,[]);const runs=[];
 const check=async run=>{const signals=[];run.vm.runtime.on('BLOCKS_ERROR',error=>signals.push(error));await stepFrames(run.vm,10);assert.deepEqual(run.creator.warnings,[]);assert.equal(value(run,'entered'),1);assert.equal(value(run,'after'),0);assert.equal(signals.length,1);assert.equal(exceptions.diagnostic(run.vm.runtime,signals[0]).value,20);};
 try{
  const first=await runProgram(imported.code,{frames:0});runs.push(first);await check(first);
  const code=await runProgram(first.creator.decompile(JSON.parse(first.vm.toJSON())),{frames:0});runs.push(code);await check(code);
  const bytes=Buffer.from(await(await first.vm.saveProjectSb3()).arrayBuffer());first.vm.stopAll();await first.vm.loadProject(bytes);first.vm.greenFlag();await check(first);
  const fresh=await runProgram('DEVICE ARCADE\nSPRITE Game:\nWHEN arcade source starts:\n  hide',{frames:0});runs.push(fresh);fresh.vm.stopAll();await fresh.vm.loadProject(bytes);fresh.vm.greenFlag();await check(fresh);
 }finally{for(const run of runs){run.vm.stopAll();run.vm.quit();}clearStrayTimers();}
});
test('actual static controller handler Throw aborts its own continuation',async()=>{
 const imported=arcadeToPseudocode('let entered=0;let after=0;controller.A.onEvent(ControllerButtonEvent.Pressed,()=>{entered=1;throw "button";after=1});',{throwPrototype:true});assert.deepEqual(imported.unsupported,[]);let run;
 try{run=await runProgram(imported.code,{frames:3});const signals=[];run.vm.runtime.on('BLOCKS_ERROR',error=>signals.push(error));run.vm.postIOData('keyboard',{key:' ',isDown:true});await stepFrames(run.vm,8);run.vm.postIOData('keyboard',{key:' ',isDown:false});assert.equal(value(run,'entered'),1);assert.equal(value(run,'after'),0);assert.equal(signals.length,1);assert.equal(exceptions.diagnostic(run.vm.runtime,signals[0]).value,'button');}
 finally{if(run){run.vm.stopAll();run.vm.quit();}clearStrayTimers();}
});

test('current physical Throw edit exports and reimports the actual edited Number',async()=>{
 const imported=arcadeToPseudocode('let entered=0;let after=0;function fail(){entered=1;throw 20}fail();after=1;',{throwPrototype:true});assert.deepEqual(imported.unsupported,[]);const runs=[];
 try{
  const first=await runProgram(imported.code,{frames:0});runs.push(first);first.vm.stopAll();
  const candidates=first.vm.runtime.targets.flatMap(target=>Object.values(target.blocks._blocks).filter(block=>block.opcode==='math_number'&&String(block.fields.NUM?.value)==='20').map(block=>({target,block})));assert.equal(candidates.length,1);
  const {target,block}=candidates[0];target.blocks.changeBlock({id:block.id,element:'field',name:'NUM',value:'30'});
  const current=JSON.parse(first.vm.toJSON()),exported=projectToArcade(current);assert.deepEqual(exported.unsupported,[]);assert.match(exported.ts,/throw .*30/);
  const reimport=arcadeToPseudocode(exported.files,{throwPrototype:true});assert.deepEqual(reimport.unsupported,[]);
  const replay=await runProgram(reimport.code,{frames:0});runs.push(replay);const signals=[];replay.vm.runtime.on('BLOCKS_ERROR',error=>signals.push(error));await stepFrames(replay.vm,10);assert.deepEqual(replay.creator.warnings,[]);assert.equal(signals.length,1);assert.equal(exceptions.diagnostic(replay.vm.runtime,signals[0]).value,30);assert.equal(value(replay,'entered'),1);assert.equal(value(replay,'after'),0);
 }finally{for(const run of runs){run.vm.stopAll();run.vm.quit();}clearStrayTimers();}
});

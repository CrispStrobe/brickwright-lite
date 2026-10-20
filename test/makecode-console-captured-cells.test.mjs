import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {runArcadeSourceCode} from './helpers/arcade-source-program.mjs';
import {stepFrames,clearStrayTimers} from './helpers/bw-vm.mjs';

const source='let observed="";let capturedCount=0;function install(label:string,initial:number){let count=initial;let unrelated=image.create(1,1);game.onUpdate(function(){count+=1;capturedCount=count;observed=console.inspect(label+count);unrelated.setPixel(0,0,1)})}install("tick ",2);';
const values=run=>Object.fromEntries(run.vm.runtime.targets.flatMap(target=>Object.values(target.variables)).map(value=>[value.name,value.value]));
async function tick(run){await stepFrames(run.vm,1,0);await stepFrames(run.vm,4,20);assert.deepEqual(run.errors,[]);assert.equal(values(run).observed,'tick '+values(run).capturedCount);assert.ok(values(run).capturedCount>2);}

test('actual registered captured siblings retain primitive mutation through Code and portable current graphs',async()=>{
 const imported=arcadeToPseudocode(source);assert.deepEqual(imported.unsupported,[]);const runs=[];
 const execute=async code=>{const run=await runArcadeSourceCode(code,{frames:0});runs.push(run);await tick(run);return run;};
 try{const run=await execute(imported.code);await execute(run.creator.decompile());const saved=Buffer.from(await(await run.vm.saveProjectSb3()).arrayBuffer());run.vm.stopAll();await run.vm.loadProject(saved);run.vm.runtime.bwArcadeFrameAuthority='manual';run.vm.greenFlag();await tick(run);const fresh=await runArcadeSourceCode('SPRITE Empty:\nWHEN flag clicked:\n  hide',{frames:0});runs.push(fresh);await fresh.vm.loadProject(saved);fresh.vm.runtime.bwArcadeFrameAuthority='manual';fresh.vm.greenFlag();await tick(fresh);
 const project=JSON.parse(run.vm.toJSON()),exported=projectToArcade(project);assert.deepEqual(exported.unsupported,[]);const again=arcadeToPseudocode(exported.files);assert.deepEqual(again.unsupported,[],exported.ts);await execute(again.code);
 for(const mutation of ['opaque','dynamic','duplicateHat','foreignHat','duplicateRegistration','unknownCaptures']){
  const edited=structuredClone(project),target=edited.targets.find(target=>Object.values(target.blocks||{}).some(block=>block.opcode==='arcade_inspectValue')),blocks=target.blocks;
  const registration=Object.values(blocks).find(block=>block.opcode==='arcade_registerUpdateHandler'),hat=Object.values(blocks).find(block=>block.opcode==='arcade_whenRegisteredUpdate');
  if(mutation==='opaque'||mutation==='dynamic'){
   const writer=Object.values(blocks).find(block=>block.opcode==='arcade_setCaptured');assert.ok(writer);
   if(mutation==='opaque'){blocks.opaque={opcode:'arcade_createImage',fields:{},inputs:{WIDTH:[1,[4,'1']],HEIGHT:[1,[4,'1']]}};writer.inputs.VALUE=[2,'opaque'];}
   else{blocks.dynamicName={opcode:'operator_join',fields:{},inputs:{STRING1:[1,[10,'cou']],STRING2:[1,[10,'nt']]}};writer.inputs.NAME=[2,'dynamicName'];}
  }
  if(mutation==='duplicateHat')blocks.duplicateHat={...hat,inputs:structuredClone(hat.inputs)};
  if(mutation==='foreignHat'){const foreign=structuredClone(target);foreign.name='Foreign';edited.targets.push(foreign);}
  if(mutation==='duplicateRegistration'){const id=Object.keys(blocks).find(id=>blocks[id]===registration),duplicate=structuredClone(registration);registration.next='duplicateRegistration';duplicate.parent=id;blocks.duplicateRegistration=duplicate;}
  if(mutation==='unknownCaptures'){blocks.dynamicCaptures={opcode:'operator_join',fields:{},inputs:{STRING1:[1,[10,'co']],STRING2:[1,[10,'unt']]}};registration.inputs.CAPTURES=[2,'dynamicCaptures'];}
  assert.ok(projectToArcade(edited).unsupported.some(value=>value.includes('inspection export')),mutation);
 }
 }finally{for(const run of runs){run.vm.stopAll();run.vm.quit();}clearStrayTimers();}
});

test('captured initialization is proved at actual closure allocation and every later writer remains constrained',()=>{
 const positive='function install(){let value=2;game.onUpdate(function(){let text=console.inspect(value)})}install();';
 assert.deepEqual(arcadeToPseudocode(positive).unsupported,[]);
 assert.deepEqual(arcadeToPseudocode('function install(flag:boolean){let value;if(flag)value=2;game.onUpdate(function(){let text=console.inspect(value)})}install(true);').unsupported,[],'actual declaration initializes Undefined, which remains a primitive alternative');
 for(const source of [
  'function install(){game.onUpdate(function(){let text=console.inspect(value)});let value=2}install();',
  'function install(flag:boolean){let value:any;if(flag)value=image.create(1,1);game.onUpdate(function(){let text=console.inspect(value)})}install(true);',
  'function install(){let value:any=2;game.onUpdate(function(){let text=console.inspect(value)});value=image.create(1,1)}install();',
  'function install(){let value=2;game.onUpdate(function(){let text=console.inspect(value)});function replace(){value=image.create(1,1) as any}replace()}install();'
 ])assert.ok(arcadeToPseudocode(source).unsupported.length,source);
});

test('nested actual registrations retain inherited cells and stop/restart creates fresh captured state',async()=>{
 const source='let observed="";let nestedReady=false;let currentLeft=0;function install(){let left=1;let right=2;game.onUpdate(function(){if(!nestedReady){nestedReady=true;game.onUpdate(function(){left+=1;currentLeft=left;observed=console.inspect(left+right)})}})}install();';
 const imported=arcadeToPseudocode(source);assert.deepEqual(imported.unsupported,[]);let run;
 try{run=await runArcadeSourceCode(imported.code,{frames:0});const check=async()=>{await stepFrames(run.vm,1,0);await stepFrames(run.vm,8,20);assert.deepEqual(run.errors,[]);const result=values(run);assert.equal(result.nestedReady,true);assert.ok(result.currentLeft>1);assert.equal(result.observed,String(result.currentLeft+2));return result;};
  const first=await check(),current=JSON.parse(run.vm.toJSON());assert.deepEqual(projectToArcade(current).unsupported,[]);
  run.vm.stopAll();const stopped=values(run);await stepFrames(run.vm,4,20);assert.deepEqual(values(run),stopped);run.vm.greenFlag();const restarted=await check();assert.equal(restarted.currentLeft,first.currentLeft,'restart allocates a new invocation cell rather than resuming the old capture');
 }finally{if(run){run.vm.stopAll();run.vm.quit();}clearStrayTimers();}
});

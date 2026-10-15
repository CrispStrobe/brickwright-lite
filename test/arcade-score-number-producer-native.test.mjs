import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {importProjectFiles} from '../overlay/scratch-gui/src/lib/bw-makecode/index.js';
import {runProgram,stepFrames,clearStrayTimers} from './helpers/bw-vm.mjs';
import {VM_SRC} from './helpers/bw-extensions.mjs';
const require=createRequire(import.meta.url),dispatch=require(VM_SRC+'/dispatch/central-dispatch'),BW=require(VM_SRC+'/util/bw-values.js');
const source='let entered=0;let seen=0;let after=0;function receive(value:number){entered+=1;seen=value;}info.setScore(35);receive(info.score());after+=1;';
const imported=s=>importProjectFiles({'main.ts':s},{target:'arcade'});
const values=run=>Object.fromEntries(run.vm.runtime.targets.flatMap(t=>Object.values(t.variables)).map(v=>[v.name,BW.decode(v.value)]));
const finish=run=>{run.vm.stopAll();run.vm.quit();clearStrayTimers();};
const instance=run=>{const name=run.vm.extensionManager._loadedExtensions.get('arcade'),adapter=dispatch.services[name];assert.equal(adapter._inst._runtime,run.vm.runtime);return adapter._inst;};
const observed=(t,run)=>{const facts={values:values(run),errors:[...run.errors],warnings:[...run.creator.warnings]};t.diagnostic(JSON.stringify(facts));return facts;};
const refused=(t,run)=>{const facts=observed(t,run);assert.equal(facts.values.entered,0);assert.equal(facts.values.seen,0);assert.equal(facts.values.after,0);assert.equal(facts.errors.length,1);assert.match(facts.errors[0],/inspection|constraint/i);};

test('actual default score Number producer reaches body once and remains valid after same VM reload',async t=>{
 const result=imported(source);assert.deepEqual(result.unsupported,[]);let run;try{run=await runProgram(result.code,{frames:10});let facts=observed(t,run);assert.deepEqual(facts.errors,[]);assert.equal(facts.values.entered,1);assert.equal(facts.values.seen,35);assert.equal(facts.values.after,1);const bytes=Buffer.from(await(await run.vm.saveProjectSb3()).arrayBuffer());run.vm.stopAll();await run.vm.loadProject(bytes);run.vm.greenFlag();await stepFrames(run.vm,10);facts=observed(t,run);assert.deepEqual(facts.errors,[]);assert.equal(facts.values.entered,1);assert.equal(facts.values.seen,35);}finally{if(run)finish(run);}
});

for(const mode of ['registered primitive','getter member','adapter delegate','registration metadata','private row owner','opcode lookup owner','nonNumber state','current graph','extra input','missing input'])test(`score Number ingress refuses ${mode} before constrained body effects`,async t=>{
 const input=mode==='nonNumber state'?source.replace('info.setScore(35);',''):source,result=imported(input);assert.deepEqual(result.unsupported,[]);let run,restore=()=>{};
 try{
  run=await runProgram(result.code,{frames:10});const baseline=observed(t,run);assert.deepEqual(baseline.errors,[]);assert.equal(baseline.values.entered,1);assert.equal(baseline.values.seen,mode==='nonNumber state'?0:35);assert.equal(baseline.values.after,1);run.vm.stopAll();run.vm.greenFlag();const runtime=run.vm.runtime,ext=instance(run);
  if(mode==='registered primitive'){const old=runtime._primitives.arcade_getPlayerScore;runtime._primitives.arcade_getPlayerScore=()=>35;restore=()=>{runtime._primitives.arcade_getPlayerScore=old;};}
  if(mode==='getter member'){ext.getPlayerScore=()=>35;restore=()=>{delete ext.getPlayerScore;};}
  if(mode==='adapter delegate'){const name=run.vm.extensionManager._loadedExtensions.get('arcade'),adapter=dispatch.services[name],old=adapter.getPlayerScore;adapter.getPlayerScore=()=>35;restore=()=>{adapter.getPlayerScore=old;};}
  if(mode==='private row owner'){const category=runtime._blockInfo.find(value=>value.id==='arcade'),entry=category.blocks.find(value=>value.json?.type==='arcade_getPlayerScore'),key=Object.getOwnPropertySymbols(entry.info).find(key=>String(key).includes('score declaration owner'));assert.ok(key);const old=entry.info[key];entry.info[key]={};restore=()=>{entry.info[key]=old;};}
  if(mode==='registration metadata'){const category=runtime._blockInfo.find(value=>value.id==='arcade'),entry=category.blocks.find(value=>value.json?.type==='arcade_getPlayerScore'),old=entry.info.func;entry.info.func=()=>35;restore=()=>{entry.info.func=old;};}
  if(mode==='opcode lookup owner'){const old=runtime.getOpcodeFunction;runtime.getOpcodeFunction=function(op){return old.call(this,op);};restore=()=>{runtime.getOpcodeFunction=old;};}
  if(mode==='nonNumber state'){runtime.bwArcadeDeviceState.players=[{score:'opaque score'}];}
  const target=runtime.targets.find(t=>Object.values(t.blocks._blocks).some(b=>b.opcode==='arcade_getPlayerScore')),score=Object.values(target.blocks._blocks).find(b=>b.opcode==='arcade_getPlayerScore');
  if(mode==='current graph')target.blocks._blocks[score.inputs.PLAYER.block].fields.NUM.value='2';
  if(mode==='extra input'||mode==='missing input'){
   run.vm.stopAll();const project=JSON.parse(run.vm.toJSON()),owner=project.targets.find(t=>Object.values(t.blocks).some(b=>b.opcode==='arcade_getPlayerScore')),node=Object.values(owner.blocks).find(b=>b.opcode==='arcade_getPlayerScore');
   if(mode==='extra input')node.inputs.EXTRA=[1,[4,'1']];else delete node.inputs.PLAYER;
   await run.vm.loadProject(project);run.vm.greenFlag();
  }
  await stepFrames(run.vm,10);refused(t,run);
 }finally{restore();if(run)finish(run);}
});

for(const fault of ['function','argument mutation'])test(`score Number cache ${fault} replacement is refused against the original registration after restart`,async t=>{
 const result=imported(source);let run;try{run=await runProgram(result.code,{frames:10});assert.deepEqual(run.errors,[]);run.vm.stopAll();run.vm.greenFlag();const runtime=run.vm.runtime,target=runtime.targets.find(t=>Object.values(t.blocks._blocks).some(b=>b.opcode==='arcade_getPlayerScore'));const operations=Object.values(target.blocks._cache._executeCached).flatMap(value=>value._ops||[]),scores=[...new Set(operations.filter(op=>op.opcode==='arcade_getPlayerScore'))];assert.equal(scores.length,1);if(fault==='function')scores[0]._blockFunction=()=>35;else scores[0]._argValues.mutation={changed:true};await stepFrames(run.vm,10);refused(t,run);}finally{if(run)finish(run);}
});

test('foreign actual inspector service cannot borrow a different live runtime caller',async t=>{
 const code='DEVICE ARCADE\nGLOBAL result\nSPRITE Game:\nWHEN flag clicked:\n  set result to (arcade inspect value (arcade player (1) score) limit (20))';let first,second;try{first=await runProgram(code,{frames:5});assert.deepEqual(observed(t,first).errors,[]);const foreign=instance(first)._consoleInspectValues;second=await runProgram(code,{frames:5});assert.deepEqual(observed(t,second).errors,[]);second.vm.stopAll();second.vm.greenFlag();const local=instance(second);local._consoleInspectValues=foreign;await stepFrames(second.vm,5);const facts=observed(t,second);assert.equal(facts.errors.length,1);assert.match(facts.errors[0],/owner|caller|runtime|foreign/i);}finally{if(second)finish(second);if(first)finish(first);}
});


test('disposed actual inspector service cannot survive project reload',async t=>{
 const code='DEVICE ARCADE\nGLOBAL result\nSPRITE Game:\nWHEN flag clicked:\n  set result to (arcade inspect value (arcade player (1) score) limit (20))';let run;try{run=await runProgram(code,{frames:5});assert.deepEqual(observed(t,run).errors,[]);const ext=instance(run),old=ext._consoleInspectValues,bytes=Buffer.from(await(await run.vm.saveProjectSb3()).arrayBuffer());run.vm.stopAll();await run.vm.loadProject(bytes);run.vm.greenFlag();assert.notEqual(ext._consoleInspectValues,old);ext._consoleInspectValues=old;await stepFrames(run.vm,5);const facts=observed(t,run);assert.equal(facts.errors.length,1);assert.match(facts.errors[0],/inactive native owner/);}finally{if(run)finish(run);}
});

test('adapter two-argument defaults and separate Array third-argument construction retain getInfo behavior',()=>{
 const {EventEmitter}=require('node:events'),makeExt=require(VM_SRC+'/extensions/crispstrobe/adapter'),ops=require(VM_SRC+'/util/bw-array-operations');
 const plain='Scratch.extensions.register(new class {getInfo(){return {id:"plain",name:"Plain",blocks:[]}}});';
 assert.equal(new(makeExt(plain))(null).getInfo().id,'plain');
 const source='Scratch.extensions.register(new class {getInfo(){return {id:"arrays",name:"Array constructor control",blocks:[],owned:!!Scratch.BWArrayOperations}}});';
 const runtime=new EventEmitter();runtime.targets=[];const array=new(makeExt(source,null,ops.registerSource(source)))(runtime);assert.equal(array.getInfo().id,'arrays');assert.equal(array.getInfo().owned,true);
});

// Production refresh prepares new wrapper closures from actual adapter getInfo.
// A matching current primitive alone must never issue the renewal certificate.
test('score Number actual refresh renews genuine metadata and remains valid after project reload',async t=>{
 const result=imported(source);let run;try{
  run=await runProgram(result.code,{frames:10});assert.deepEqual(observed(t,run).errors,[]);
  const runtime=run.vm.runtime,before=runtime.getOpcodeFunction('arcade_getPlayerScore');
  run.vm.stopAll();await run.vm.extensionManager.refreshBlocks({throwOnError:true});
  assert.notEqual(runtime.getOpcodeFunction('arcade_getPlayerScore'),before);
  run.vm.greenFlag();await stepFrames(run.vm,10);let facts=observed(t,run);assert.deepEqual(facts.errors,[]);assert.equal(facts.values.entered,1);assert.equal(facts.values.seen,35);assert.equal(facts.values.after,1);
  const bytes=Buffer.from(await(await run.vm.saveProjectSb3()).arrayBuffer());run.vm.stopAll();await run.vm.loadProject(bytes);await run.vm.extensionManager.refreshBlocks({throwOnError:true});run.vm.greenFlag();await stepFrames(run.vm,10);facts=observed(t,run);assert.deepEqual(facts.errors,[]);assert.equal(facts.values.entered,1);assert.equal(facts.values.seen,35);
 }finally{if(run)finish(run);}
});
for(const mode of ['replayed issuance','stale rows','foreign category','unissued replacement row','source getInfo replacement','adapter getInfo replacement'])test(`score Number refresh refuses ${mode} after genuine positive`,async t=>{
 const result=imported(source);let run,restore=()=>{};try{
  run=await runProgram(result.code,{frames:10});assert.deepEqual(observed(t,run).errors,[]);
  const runtime=run.vm.runtime,category=runtime._blockInfo.find(c=>c.id==='arcade'),oldRows=category.blocks,oldFunc=runtime.getOpcodeFunction('arcade_getPlayerScore');
  run.vm.stopAll();await run.vm.extensionManager.refreshBlocks({throwOnError:true});run.vm.greenFlag();await stepFrames(run.vm,10);assert.deepEqual(observed(t,run).errors,[]);run.vm.stopAll();run.vm.greenFlag();
  if(mode==='replayed issuance')runtime.emit('BLOCKSINFO_UPDATE',category);
  if(mode==='stale rows'){category.blocks=oldRows;runtime._primitives.arcade_getPlayerScore=oldFunc;runtime.emit('BLOCKSINFO_UPDATE',category);}
  if(mode==='foreign category')runtime.emit('BLOCKSINFO_UPDATE',{...category});
  if(mode==='unissued replacement row'){
   const entry=category.blocks.find(e=>e.json?.type==='arcade_getPlayerScore'),copy={...entry,info:{...entry.info,func:()=>35}};
   for(const key of Object.getOwnPropertySymbols(copy.info))if(String(key).includes('metadata issuance'))delete copy.info[key];
   category.blocks=category.blocks.map(e=>e===entry?copy:e);runtime._primitives.arcade_getPlayerScore=copy.info.func;runtime.emit('BLOCKSINFO_UPDATE',category);
  }
  if(mode==='source getInfo replacement'){const ext=instance(run),old=ext.getInfo;ext.getInfo=function(){return old.call(this);};restore=()=>{delete ext.getInfo;};}
  if(mode==='adapter getInfo replacement'){const name=run.vm.extensionManager._loadedExtensions.get('arcade'),adapter=dispatch.services[name],old=adapter.getInfo;adapter.getInfo=function(){return old.call(this);};restore=()=>{delete adapter.getInfo;};}
  await stepFrames(run.vm,10);refused(t,run);
 }finally{restore();if(run)finish(run);}
});

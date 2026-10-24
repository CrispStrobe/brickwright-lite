import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {INTEGRATED,importGuiDependency} from './helpers/bw-integrated.mjs';
const require=createRequire(import.meta.url),root=INTEGRATED+'/node_modules/scratch-vm/src';
const VM=(await importGuiDependency('scratch-vm/src/index.js')).default;
const ArraysCtor=require(root+'/extensions/crispstrobe/arrays/index.js');
const exceptions=require(root+'/util/bw-arcade-exceptions.js'),primitiveOwner=require(root+'/util/bw-primitive-owner.js');
const BW=require(root+'/util/bw-values.js');
for(const name of ['bw-array-operations.js','bw-arcade-exceptions.js'])
 assert.equal(readFileSync(root+'/util/'+name,'utf8'),readFileSync(new URL('../overlay/scratch-vm/src/util/'+name,import.meta.url),'utf8'),'actual current installed '+name);
assert.equal(readFileSync(root+'/extensions/crispstrobe/arrays/index.js','utf8'),readFileSync(new URL('../overlay/scratch-vm/src/extensions/crispstrobe/arrays/index.js',import.meta.url),'utf8'),'actual registered production carrier');

async function fixture(actualError,cleanupError,changedBooleanGuard=false){
 const booleanDescriptor=Object.getOwnPropertyDescriptor(globalThis,'Boolean');
 const restoreBoolean=()=>Object.defineProperty(globalThis,'Boolean',booleanDescriptor);
 const vm=new VM(),runtime=vm.runtime,errors=[];runtime.on('BLOCKS_ERROR',error=>errors.push(error));
 let owner,childId,child,actualArgs,actualUtil,coercions=0,cleanups=0;
 const arrays=new ArraysCtor(runtime),original=arrays.valueBinary;
 arrays.valueBinary=(args,util)=>{actualArgs=args;actualUtil=util;try{return original(args,util);}finally{if(changedBooleanGuard)restoreBoolean();}};
 const loaded=vm.extensionManager._registerInternalExtension(arrays);vm.extensionManager._loadedExtensions.set('arrays',loaded);
 const bridge={getInfo:()=>({id:'arcade',name:'Native computation caller',blocks:[{opcode:'callFunction',blockType:'command',text:'invoke'}]}),callFunction(args,util){
  child=runtime._pushThread(childId,util.target,{stackClick:false});
  owner.link(child,util.thread,()=>{cleanups++;if(cleanupError)throw cleanupError;});
  primitiveOwner.stepNested(util,args,child);
  const failure=owner.failure(child)||owner.failure(util.thread);if(failure)owner.rethrow(failure);
 }};
 const linked=vm.extensionManager._registerInternalExtension(bridge);vm.extensionManager._loadedExtensions.set('arcade',linked);
 const probe={getInfo:()=>({id:'throwprobe',name:'Native computation error',blocks:[{opcode:'value',blockType:'reporter',text:'value'}]}),value(){return {toString(){
  coercions++;
  const forged=new Error('public flag is not a private computation lease');forged.preserveOriginalError=true;
  assert.throws(()=>owner.rejectArrayOperation(actualArgs,actualUtil,forged,{preserveOriginalError:true}),/private.*lease/);
  assert.equal(exceptions.reported(runtime,forged),false);assert.deepEqual(errors,[]);
  if(changedBooleanGuard){
   const body=BW.arrayValue(runtime,runtime.getTargetForStage().variables.array.value);
   assert.deepEqual(body,[5]);body[0]=6;
   Object.defineProperty(globalThis,'Boolean',{...booleanDescriptor,value:()=>true});
   return '!';
  }
  throw actualError;
 }};}};
 const ps=vm.extensionManager._registerInternalExtension(probe);vm.extensionManager._loadedExtensions.set('throwprobe',ps);
 const blocks={},variables={array:['array',0],result:['result',-1],after:['after',0],ticks:['ticks',0]};let serial=0;
 const add=(opcode,parent,next=null,inputs={},fields={},shadow=false)=>{const id='f'+serial++;blocks[id]={opcode,parent,next,inputs,fields,shadow,topLevel:parent===null,...(parent===null?{x:0,y:0}:{})};return id;};
 const text=(value,parent)=>add('text',parent,null,{}, {TEXT:[value,null]},true);
 const hat=add('event_whenflagclicked',null),setup=add('data_setvariableto',hat,null,{}, {VARIABLE:['array','array']});blocks[hat].next=setup;
 const allocation=add('arrays_createReference',setup);blocks[setup].inputs.VALUE=[1,allocation];blocks[allocation].inputs.VALUES=[1,text('[5]',allocation)];
 const invoke=add('arcade_callFunction',setup);blocks[setup].next=invoke;
 const after=add('data_setvariableto',invoke,null,{VALUE:[1,[10,'1']]},{VARIABLE:['after','after']});blocks[invoke].next=after;
 childId=add('data_setvariableto',null,null,{}, {VARIABLE:['result','result']});
 const call=add('arrays_valueBinary',childId,null,{}, {OP:['+',null]});blocks[childId].inputs.VALUE=[1,call];
 const left=add('data_variable',call,null,{}, {VARIABLE:['array','array']}),right=add('throwprobe_value',call);blocks[call].inputs={LEFT:[1,left],RIGHT:[1,right]};
 const unrelated=add('event_whenflagclicked',null),forever=add('control_forever',unrelated);blocks[unrelated].next=forever;
 const tick=add('data_changevariableby',forever,null,{VALUE:[1,[4,'1']]},{VARIABLE:['ticks','ticks']});blocks[forever].inputs.SUBSTACK=[2,tick];
 const project={targets:[{isStage:true,name:'Stage',variables,lists:{},broadcasts:{},blocks,comments:{},costumes:[{assetId:'cd21514d0531fdffb22204e0ec5ed84a',name:'backdrop',dataFormat:'svg',md5ext:'cd21514d0531fdffb22204e0ec5ed84a.svg',rotationCenterX:240,rotationCenterY:180}],sounds:[],currentCostume:0,volume:100,layerOrder:0}],monitors:[],extensions:['arrays','arcade','throwprobe'],meta:{semver:'3.0.0',vm:'0.2.0',agent:''}};
 const step=async()=>{for(let i=0;i<4;i++){await runtime._step();await new Promise(resolve=>setImmediate(resolve));}};
 try{await vm.loadProject(JSON.stringify(project));owner=exceptions.create(runtime,args=>args.VALUE);runtime.currentStepTime=1000/30;vm.greenFlag();await step();}
 catch(error){restoreBoolean();vm.stopAll();vm.quit();throw error;}
 return {vm,runtime,errors,stage:runtime.getTargetForStage(),owner,get child(){return child;},get coercions(){return coercions;},get cleanups(){return cleanups;},step,close(){restoreBoolean();vm.stopAll();vm.quit();owner.dispose();}};
}

test('actual Array computation errors preserve frozen Error identity, subtype and cause through private lineage retirement',async()=>{
 for(const [index,Constructor]of [Error,TypeError,RangeError].entries()){
  const cause=Object.freeze({actualCause:index}),actual=Object.freeze(new Constructor('actual operand error '+index,{cause}));
  const descriptors=Object.getOwnPropertyDescriptors(actual),cleanup=index===1?Object.freeze(new Error('actual registered cleanup error')):null;
  const run=await fixture(actual,cleanup);
  try{
   assert.equal(run.errors.length,1);assert.equal(run.errors[0],actual);assert.ok(run.errors[0] instanceof Constructor);
   assert.equal(run.errors[0].cause,cause);assert.deepEqual(Object.getOwnPropertyDescriptors(actual),descriptors);
   assert.equal(run.owner.failure(run.child),actual);assert.equal(exceptions.reported(run.runtime,actual),true);
   assert.equal(run.stage.variables.result.value,-1);assert.equal(run.stage.variables.after.value,0);
   assert.equal(run.coercions,1);assert.equal(run.cleanups,1);assert.ok(run.stage.variables.ticks.value>0,'unrelated actual fiber continues');
   const diagnostic=exceptions.diagnostic(run.runtime,actual);assert.equal(diagnostic.kind,'array-computation');assert.equal(diagnostic.cleanupFailureCount,cleanup?1:0);
   const before=run.stage.variables.ticks.value;await run.step();assert.ok(run.stage.variables.ticks.value>before);
   assert.equal(run.coercions,1);assert.equal(run.cleanups,1);assert.deepEqual(run.errors,[actual]);
   assert.deepEqual(Object.getOwnPropertyDescriptors(actual),descriptors);
  }finally{run.close();}
 }

 const BooleanBefore=Object.getOwnPropertyDescriptor(globalThis,'Boolean');
 const guard=await fixture(null,null,true);
 try{
  assert.deepEqual(Object.getOwnPropertyDescriptor(globalThis,'Boolean'),BooleanBefore);
  assert.equal(guard.errors.length,1);
  const error=guard.errors[0];assert.ok(error instanceof Error);assert.ok(error.cause instanceof Error);
  assert.notEqual(error,error.cause);assert.match(error.message,/primitive backing changed/);
  assert.equal(exceptions.diagnostic(guard.runtime,error).kind,'array-constraint');
  assert.equal(guard.owner.failure(guard.child),error);assert.equal(exceptions.reported(guard.runtime,error),true);
  assert.equal(guard.stage.variables.result.value,-1);assert.equal(guard.stage.variables.after.value,0);
  assert.equal(guard.coercions,1);assert.equal(guard.cleanups,1);assert.ok(guard.stage.variables.ticks.value>0);
  const before=guard.stage.variables.ticks.value;await guard.step();assert.ok(guard.stage.variables.ticks.value>before);
  assert.equal(guard.coercions,1);assert.equal(guard.cleanups,1);assert.deepEqual(guard.errors,[error]);
 }finally{guard.close();}
});

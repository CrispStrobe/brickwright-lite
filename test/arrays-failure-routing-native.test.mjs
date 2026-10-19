import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {INTEGRATED,importGuiDependency} from './helpers/bw-integrated.mjs';
const require=createRequire(import.meta.url),root=INTEGRATED+'/node_modules/scratch-vm/src';
const VM=(await importGuiDependency('scratch-vm/src/index.js')).default;
const makeArrays=require(root+'/extensions/crispstrobe/adapter.js');
const BW=require(root+'/util/bw-values.js'),ops=require(root+'/util/bw-array-operations.js');
const exceptions=require(root+'/util/bw-arcade-exceptions.js');
const primitiveOwner=require(root+'/util/bw-primitive-owner.js');
const Module=require('node:module');
const currentNumberInput=require(root+'/util/bw-current-number-input.js');
const RegisteredArrays=require(root+'/extensions/crispstrobe/arrays/index.js');
assert.equal(readFileSync(root+'/extensions/crispstrobe/arrays/index.js','utf8'),readFileSync(new URL('../overlay/scratch-vm/src/extensions/crispstrobe/arrays/index.js',import.meta.url),'utf8'),'actual production carrier');
assert.ok(process.env.BW_ARRAY_NUMBER_VALUE_SOURCE,'Exact candidate supplier is mandatory');
const source=readFileSync(process.env.BW_ARRAY_NUMBER_VALUE_SOURCE,'utf8');
for(const name of ['bw-array-operations.js','bw-primitive-owner.js','bw-values.js','bw-current-number-input.js'])
 assert.equal(readFileSync(root+'/util/'+name,'utf8'),readFileSync(new URL('../overlay/scratch-vm/src/util/'+name,import.meta.url),'utf8'),'fresh installed '+name);

async function fixture(options={}){
 const vm=new VM(),runtime=vm.runtime,errors=[],effects=[];runtime.on('BLOCKS_ERROR',error=>errors.push(error));
 const ArraysCtor=options.registered?RegisteredArrays:makeArrays(source,null,options.unregistered?null:ops.registerSource(source));
 const arrays=new ArraysCtor(runtime);
 const original=arrays.valueBinary,originalAllocation=arrays.createReference;let saved;
 arrays.createReference=(args,util)=>{try{return originalAllocation(args,util);}finally{options.literalAfter?.();}};
 arrays.valueBinary=(args,util)=>{saved={args,util};options.before?.({args,util,runtime,arrays});
  try{return original(options.copyArgs?{...args}:args,options.copyUtil?{...util}:util);}
  finally{options.after?.();}};
 const loaded=vm.extensionManager._registerInternalExtension(arrays);vm.extensionManager._loadedExtensions.set('arrays',loaded);
 const probe={getInfo:()=>({id:'plusprobe',name:'Owned plus control',blocks:[{opcode:'prepare',blockType:'command',text:'prepare'},{opcode:'other',blockType:'reporter',text:'other'},{opcode:'literal',blockType:'reporter',text:'literal'}]}),
  prepare(_args,util){const stage=util.target,body=BW.arrayValue(runtime,stage.variables.array.value);
   if(options.arrayRight){stage.variables.right.value=stage.variables.array.value;options.prepare?.({runtime,stage,body,arrays,effects});}
   else options.prepare?.({runtime,stage,body,arrays,effects});},
  literal(){return options.literalRaw?options.literalRaw({runtime,effects}):{toString(){effects.push('literal-conversion');options.literalCoerce?.({runtime});return JSON.stringify(options.value??[5]);}};},
  other(){return {toString(){effects.push('other-conversion');options.coerce?.({runtime,body:BW.arrayValue(runtime,runtime.getTargetForStage().variables.array.value),effects,arrays,original,args:saved.args,util:saved.util});return options.otherText??'!';}};}};
 const ps=vm.extensionManager._registerInternalExtension(probe);vm.extensionManager._loadedExtensions.set('plusprobe',ps);
 const blocks={},variables={array:['array',0],result:['result','UNASSIGNED'],after:['after',0],ticks:['ticks',0],right:['right',0]};let serial=0;
 const add=(opcode,parent,next=null,inputs={},fields={},shadow=false)=>{const id='p'+serial++;blocks[id]={opcode,parent,next,inputs,fields,shadow,topLevel:parent===null,...(parent===null?{x:0,y:0}:{})};return id;};
 const text=(value,parent)=>add('text',parent,null,{}, {TEXT:[String(value),null]},true);
 const variable=parent=>add('data_variable',parent,null,{}, {VARIABLE:['array','array']});
 const hat=add('event_whenflagclicked',null),setup=add('data_setvariableto',hat,null,{}, {VARIABLE:['array','array']});blocks[hat].next=setup;
 const allocation=add('arrays_createReference',setup);blocks[setup].inputs.VALUE=[1,allocation];blocks[allocation].inputs.VALUES=[1,(options.literalCoerce||options.literalRaw)?add('plusprobe_literal',allocation):text(JSON.stringify(options.value??[5]),allocation)];
 const prepare=add('plusprobe_prepare',setup);blocks[setup].next=prepare;
 const assign=add('data_setvariableto',prepare,null,{}, {VARIABLE:['result','result']});blocks[prepare].next=assign;
 const call=add('arrays_valueBinary',assign,null,{}, {OP:[options.op??'+',null]});blocks[assign].inputs.VALUE=[1,call];
 const scalar=options.arrayRight?add('data_variable',call,null,{}, {VARIABLE:['right','right']}):options.coerce?add('plusprobe_other',call):options.number!==undefined?add('math_number',call,null,{}, {NUM:[String(options.number),null]},true):text(options.text??'',call);
 blocks[call].inputs={LEFT:[1,options.reverse?scalar:variable(call)],RIGHT:[1,options.reverse?variable(call):scalar]};
 const after=add('data_setvariableto',assign,null,{VALUE:[1,[10,'1']]},{VARIABLE:['after','after']});blocks[assign].next=after;
 const independent=add('event_whenflagclicked',null),forever=add('control_forever',independent);blocks[independent].next=forever;
 const tick=add('data_changevariableby',forever,null,{VALUE:[1,[4,'1']]},{VARIABLE:['ticks','ticks']});blocks[forever].inputs.SUBSTACK=[2,tick];
 const project={targets:[{isStage:true,name:'Stage',variables,lists:{},broadcasts:{},blocks,comments:{},costumes:[{assetId:'cd21514d0531fdffb22204e0ec5ed84a',name:'backdrop',dataFormat:'svg',md5ext:'cd21514d0531fdffb22204e0ec5ed84a.svg',rotationCenterX:240,rotationCenterY:180}],sounds:[],currentCostume:0,volume:100,layerOrder:0}],monitors:[],extensions:['arrays','plusprobe'],meta:{semver:'3.0.0',vm:'0.2.0',agent:''}};
 await vm.loadProject(JSON.stringify(project));exceptions.create(runtime,args=>args.VALUE);runtime.currentStepTime=1000/30;
 const step=async()=>{for(let i=0;i<4;i++){await runtime._step();await new Promise(resolve=>setImmediate(resolve));}};
 vm.greenFlag();await step();const stage=runtime.getTargetForStage();
 return {vm,runtime,stage,arrays,original,saved,errors,effects,call,body:BW.arrayValue(runtime,stage.variables.array.value),
  close(){vm.stopAll();vm.quit();}};
}
const clean=run=>{assert.deepEqual(run.errors,[]);assert.equal(run.stage.variables.after.value,'1');};
const refused=run=>{assert.equal(run.errors.length,1);assert.equal(run.stage.variables.result.value,'UNASSIGNED');assert.equal(run.stage.variables.after.value,0);assert.ok(run.stage.variables.ticks.value>0,'independent actual fiber continues');};

test('failure-only engine witness requires the exact original Array method and expires at return',async()=>{
 let captured,args,util;
 const run=await fixture({number:4,before:actual=>{
  args=actual.args;util=actual.util;
  assert.equal(primitiveOwner.captureFailureCall(actual.runtime,'arrays_referenceLength'),null);
  assert.equal(primitiveOwner.captureFailureCall({},'arrays_valueBinary'),null);
  captured=primitiveOwner.captureFailureCall(actual.runtime,'arrays_valueBinary');
  assert.ok(captured);assert.equal(Object.isFrozen(captured),true);
  assert.deepEqual(Reflect.ownKeys(captured),[]);assert.equal(captured.args,undefined);assert.equal(captured.util,undefined);
  assert.equal(primitiveOwner.isFailureActive(captured,actual.runtime,'arrays_valueBinary'),true);
  assert.equal(primitiveOwner.isFailureActive(captured,actual.runtime,'arrays_createReference'),false);
  assert.equal(primitiveOwner.current(captured,captured),null);
  assert.equal(currentNumberInput(actual.runtime,args,util,'arrays_valueBinary','RIGHT'),4);
  assert.equal(currentNumberInput(actual.runtime,{RIGHT:'4'},captured,'arrays_valueBinary','RIGHT'),'4');
  assert.equal(primitiveOwner.isActiveCall(captured,util,args),true);
  assert.equal(primitiveOwner.current({...util},args),null);
  assert.equal(primitiveOwner.current(util,{...args}),null);
 }});
 try{clean(run);assert.equal(run.stage.variables.result.value,'54');
  assert.equal(primitiveOwner.captureFailureCall(run.runtime,'arrays_valueBinary'),null);
  assert.equal(primitiveOwner.isActiveCall(captured,util,args),false);
  assert.equal(primitiveOwner.isFailureActive(captured,run.runtime,'arrays_valueBinary'),false);
  const late=new Error('returned witness');assert.throws(()=>primitiveOwner.dispatchArrayFailure(captured,late,{}),error=>error===late);
 }finally{run.close();}
});
test('copied current primitive arguments or utility reject with the original guard as cause exactly once',async()=>{
 for(const edit of ['copyArgs','copyUtil','inputBeforeBegin','cacheBeforeBegin','registrationBeforeBegin']){
  const options=edit==='copyUtil'?{copyUtil:true}:{copyArgs:true};
  if(edit.endsWith('BeforeBegin'))options.before=({args,util,runtime})=>{
   const container=util.thread.blockContainer,rootId=util.thread.peekStack();
   const operation=container._cache._executeCached[rootId]._ops.find(op=>op._argValues===args);
   assert.ok(operation);const block=container.getBlock(operation.id);
   if(edit==='inputBeforeBegin')block.inputs={...block.inputs};
   if(edit==='cacheBeforeBegin')operation._argValues={...args};
   if(edit==='registrationBeforeBegin')runtime._primitives.arrays_valueBinary=()=>99;
  };
  const run=await fixture(options);try{refused(run);
   assert.equal(run.errors[0].cause instanceof Error,true);
   assert.match(run.errors[0].cause.message,/tracked Array requires its current operation/);
   assert.equal(run.errors[0].message,run.errors[0].cause.message);
   assert.throws(()=>run.original(run.saved.args,run.saved.util),/current operation/);
   assert.equal(run.errors.length,1);
  }finally{run.close();}
 }
});
test('an arbitrary Error and public witness cannot forge the private Array rejection lease',async()=>{
 const thrown=new Error('ordinary caller Error');
 const run=await fixture({before:({args,util,runtime})=>{
  const witness=primitiveOwner.captureFailureCall(runtime,'arrays_valueBinary');assert.ok(witness);
  assert.deepEqual(Reflect.ownKeys(witness),[]);
  assert.equal(ops.consumeFailureLease(runtime,args,util,thrown,witness),false);
  assert.throws(()=>primitiveOwner.dispatchArrayFailure(witness,thrown,{}),/private.*lease/);
  assert.throws(()=>exceptions.rejectArrayOperation(runtime,args,util,thrown,witness),/private.*lease/);
 }});
 try{clean(run);assert.equal(run.stage.variables.result.value,'5');}finally{run.close();}
});
test('literal allocation guard failure retires only its original fiber and retains the actual cause',async()=>{
 const decode=BW.decode;
 const run=await fixture({literalCoerce:()=>{BW.decode=()=>[];},literalAfter:()=>{BW.decode=decode;}});
 try{refused(run);assert.equal(run.errors[0].cause instanceof Error,true);
  assert.match(run.errors[0].cause.message,/literal intrinsic\/value surface changed/);
  assert.equal(run.errors[0].message,run.errors[0].cause.message);assert.equal(BW.decode,decode);
 }finally{BW.decode=decode;run.close();}
});

test('changed WeakMap, freeze and module-loader ingress cannot observe private failure context or prevent retirement',async()=>{
 const get=Object.getOwnPropertyDescriptor(WeakMap.prototype,'get');
 const set=Object.getOwnPropertyDescriptor(WeakMap.prototype,'set');
 const freeze=Object.getOwnPropertyDescriptor(Object,'freeze'),load=Module._load;
 for(const mode of ['weak-map','throwing-freeze','module-loader']){
  let getCalls=0,setCalls=0,privateRows=0,freezeCalls=0,lateLoads=0;
  const actualFreezeFailure=new Error('changed Object.freeze must not receive private tokens');
  const inspect=value=>{
   if(value&&typeof value==='object'&&['args','util','record','actualCall','failureCall'].some(key=>Object.hasOwn(value,key)))privateRows++;
  };
  const restore=()=>{
   Object.defineProperty(WeakMap.prototype,'get',get);Object.defineProperty(WeakMap.prototype,'set',set);
   Object.defineProperty(Object,'freeze',freeze);Module._load=load;
  };
  const run=await fixture({copyArgs:true,before:()=>{
   if(mode==='weak-map'){
    Object.defineProperty(WeakMap.prototype,'get',{...get,value:function(key){getCalls++;const value=Reflect.apply(get.value,this,[key]);inspect(value);return value;}});
    Object.defineProperty(WeakMap.prototype,'set',{...set,value:function(key,value){setCalls++;inspect(value);return Reflect.apply(set.value,this,[key,value]);}});
    const probe=new WeakMap(),key={};probe.set(key,1);assert.equal(probe.get(key),1);
    assert.ok(getCalls>0&&setCalls>0,'real prototype hooks armed');getCalls=setCalls=0;
   }else if(mode==='throwing-freeze'){
    Object.defineProperty(Object,'freeze',{...freeze,value(){freezeCalls++;throw actualFreezeFailure;}});
    assert.throws(()=>Object.freeze({}),error=>error===actualFreezeFailure);freezeCalls=0;
   }else{
    Module._load=function(spec,parent,main){
     if(String(spec).includes('bw-arcade-exceptions')||String(spec).includes('bw-array-operations')){
      lateLoads++;return {rejectArrayOperation(...args){inspect({args});throw Error('foreign dispatcher received private context');},consumeFailureLease(...args){inspect({args});return false;}};
     }
     return Reflect.apply(load,this,[spec,parent,main]);
    };
    assert.equal(Module._load('node:path',undefined,false),require('node:path'),'real loader hook armed');
   }
  },after:restore});
  try{refused(run);assert.equal(run.errors[0].cause instanceof Error,true);
   assert.match(run.errors[0].cause.message,/tracked Array requires its current operation/);
   assert.equal(privateRows,0,'no actual engine context or private lease reaches a mutable hook');
   assert.equal(getCalls,0);assert.equal(setCalls,0);assert.equal(freezeCalls,0);assert.equal(lateLoads,0);
   assert.equal(WeakMap.prototype.get,get.value);assert.equal(WeakMap.prototype.set,set.value);
   assert.equal(Object.freeze,freeze.value);assert.equal(Module._load,load);
  }finally{restore();run.close();}
 }
});

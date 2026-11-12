import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {createContext,runInContext} from 'node:vm';
import {INTEGRATED,importGuiDependency} from './helpers/bw-integrated.mjs';
const require=createRequire(import.meta.url),root=INTEGRATED+'/node_modules/scratch-vm/src';
const VM=(await importGuiDependency('scratch-vm/src/index.js')).default;
const makeArrays=require(root+'/extensions/crispstrobe/adapter.js');
const BW=require(root+'/util/bw-values.js'),ops=require(root+'/util/bw-array-operations.js');
const exceptions=require(root+'/util/bw-arcade-exceptions.js');
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
 const original=arrays.valueBinary,originalAllocation=arrays.createReference;let saved,fault,poisonedReads=0;let restoreFault=()=>{};
 arrays.createReference=(args,util)=>{try{return originalAllocation(args,util);}finally{options.literalAfter?.();}};
 arrays.valueBinary=(args,util)=>{saved={args,util};options.before?.({args,util,runtime,arrays});
  try{return original(options.copyArgs?{...args}:args,options.copyUtil?{...util}:util);}
  finally{options.after?.();}};
 const loaded=vm.extensionManager._registerInternalExtension(arrays);vm.extensionManager._loadedExtensions.set('arrays',loaded);
 const probe={getInfo:()=>({id:'plusprobe',name:'Owned plus control',blocks:[{opcode:'prepare',blockType:'command',text:'prepare'},{opcode:'other',blockType:'reporter',text:'other'},{opcode:'literal',blockType:'reporter',text:'literal'},{opcode:'name',blockType:'reporter',text:'name'},{opcode:'poison',blockType:'reporter',text:'poison'}]}),
  prepare(_args,util){const stage=util.target,body=BW.arrayValue(runtime,stage.variables.array.value);
   if(options.arrayRight){stage.variables.right.value=stage.variables.array.value;options.prepare?.({runtime,stage,body,arrays,effects});}
   else options.prepare?.({runtime,stage,body,arrays,effects});},
  poison(){
   const field=options.poisonField,descriptor=Object.getOwnPropertyDescriptor(Object.prototype,field);
   Object.defineProperty(Object.prototype,field,{configurable:true,get(){poisonedReads++;return false;},set(){poisonedReads++;}});
   restoreFault=()=>{if(descriptor)Object.defineProperty(Object.prototype,field,descriptor);else delete Object.prototype[field];};
   return 'empty-derived';
  },
  name(){
   const originalOn=runtime.on,originalSet=Map.prototype.set,originalActive=runtime.isActiveThread;
   const onDescriptor=Object.getOwnPropertyDescriptor(runtime,'on'),activeDescriptor=Object.getOwnPropertyDescriptor(runtime,'isActiveThread');let armed=false;
   const restoreOn=()=>{if(onDescriptor)Object.defineProperty(runtime,'on',onDescriptor);else delete runtime.on;};
   const restoreActive=()=>{if(activeDescriptor)Object.defineProperty(runtime,'isActiveThread',activeDescriptor);else delete runtime.isActiveThread;};
   restoreFault=()=>{restoreOn();restoreActive();Map.prototype.set=originalSet;};
   if(options.lateSubstitution)runtime.isActiveThread=function(...args){
    const result=Reflect.apply(originalActive,this,args);
    if(fault&&!fault.lateFired){
     const frames=new Error().stack.split('\n'),index=frames.findIndex(row=>/\bat checkBody /.test(row));
     if(index>=0&&/\bat Object\.finish /.test(frames[index+1]||'')){
      fault.lateFired=true;restoreActive();
      Reflect.apply(originalSet,fault.heap,[fault.key,fault.replacement]);
     }
    }
    return result;
   };
   runtime.on=function(event,...args){
    const result=Reflect.apply(originalOn,this,[event,...args]);
    if(event==='PROJECT_START'&&!armed){
     armed=true;restoreOn();
     if(options.listenerError){fault={listener:true};throw options.listenerError;}
     Map.prototype.set=function(key,body){
      if(typeof key==='string'&&key.startsWith('array-reference:')){
       Map.prototype.set=originalSet;
       fault={requested:body,replacement:[],heap:this,key};
       return Reflect.apply(originalSet,this,[key,options.lateSubstitution?body:fault.replacement]);
      }
      return Reflect.apply(originalSet,this,[key,body]);
     };
    }
    return result;
   };
   return 'empty-derived';
  },
  literal(){return options.literalRaw?options.literalRaw({runtime,effects}):{toString(){effects.push('literal-conversion');options.literalCoerce?.({runtime});return JSON.stringify(options.value??[5]);}};},
  other(){return {toString(){effects.push('other-conversion');options.coerce?.({runtime,body:BW.arrayValue(runtime,runtime.getTargetForStage().variables.array.value),effects,arrays,original,args:saved.args,util:saved.util});return options.otherText??'!';}};}};
 const ps=vm.extensionManager._registerInternalExtension(probe);vm.extensionManager._loadedExtensions.set('plusprobe',ps);
 const blocks={},variables={array:['array',0],result:['result','UNASSIGNED'],after:['after',0],ticks:['ticks',0],right:['right',0]};let serial=0;
 const add=(opcode,parent,next=null,inputs={},fields={},shadow=false)=>{const id='p'+serial++;blocks[id]={opcode,parent,next,inputs,fields,shadow,topLevel:parent===null,...(parent===null?{x:0,y:0}:{})};return id;};
 const text=(value,parent)=>add('text',parent,null,{}, {TEXT:[String(value),null]},true);
 const variable=parent=>add('data_variable',parent,null,{}, {VARIABLE:['array','array']});
 const hat=add('event_whenflagclicked',null),setup=add('data_setvariableto',hat,null,{}, {VARIABLE:['array','array']});blocks[hat].next=setup;
 const allocation=add('arrays_namedReference',setup);blocks[setup].inputs.VALUE=[1,allocation];blocks[allocation].inputs.NAME=[1,(options.substituteBacking||options.listenerError||options.lateSubstitution)?add('plusprobe_name',allocation):text('empty-derived',allocation)];
 const named=add('arrays_createEmpty',hat);blocks[hat].next=named;blocks[named].next=setup;blocks[setup].parent=named;blocks[named].inputs.NAME=[1,options.poisonField?add('plusprobe_poison',named):text('empty-derived',named)];
 const prepare=add('plusprobe_prepare',setup);blocks[setup].next=prepare;
 if(options.populate!==undefined){
  const push=add('arrays_push',setup);blocks[setup].next=push;blocks[push].next=prepare;blocks[prepare].parent=push;
  blocks[push].inputs={NAME:[1,text('empty-derived',push)],VALUE:[1,add('math_number',push,null,{}, {NUM:[String(options.populate),null]},true)]};
 }
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
 vm.greenFlag();try{await step();}finally{restoreFault();}const stage=runtime.getTargetForStage();
 return {vm,runtime,stage,arrays,original,saved,errors,effects,call,fault,poisonedReads,body:BW.arrayValue(runtime,stage.variables.array.value),
  close(){vm.stopAll();vm.quit();}};
}

// This fixture follows the existing owned-plus real-VM journey, replacing only
// the allocation chain with connected createEmpty -> namedReference blocks.
test('actual named empty Array supports text addition in both operand orders',async()=>{
 for(const reverse of [false,true]){
  const run=await fixture({registered:true,reverse,text:'!'});
  try{
   assert.deepEqual(run.body,[],'the named factory really allocated an empty Array');
   assert.deepEqual(run.errors,[],'valid named allocation must support ordinary Array text conversion');
   assert.equal(run.stage.variables.result.value,'!');
   assert.equal(run.stage.variables.after.value,'1');
   assert.ok(run.stage.variables.ticks.value>0,'unrelated script continues');
  }finally{run.close();}
 }
});

test('actual named empty allocation retains text semantics after a connected named push',async()=>{
 for(const reverse of [false,true]){
  const run=await fixture({registered:true,reverse,populate:5,text:'!'});
  try{
   assert.deepEqual(run.body,[5]);assert.deepEqual(run.errors,[]);
   assert.equal(run.stage.variables.result.value,reverse?'!5':'5!');
   assert.equal(run.stage.variables.after.value,'1');
  }finally{run.close();}
 }
});

test('host-born named empty allocation cannot transfer backing ownership to another runtime',async()=>{
 const origin=await fixture({registered:true,text:'!'});
 try{
  assert.deepEqual(origin.errors,[]);
  const run=await fixture({registered:true,prepare:({runtime,stage})=>{
   stage.variables.array.value=BW.arrayReference(runtime,origin.body);
  }});
  try{
   assert.equal(run.errors.length,1);assert.match(run.errors[0].message,/foreign or stale/);
   assert.equal(run.stage.variables.result.value,'UNASSIGNED');
   assert.equal(run.stage.variables.after.value,0);
   assert.ok(run.stage.variables.ticks.value>0,'an unrelated real fiber remains live');
  }finally{run.close();}
 }finally{origin.close();}
});

test('registered and opt-in standalone named empty creation preserve the unqualified legacy path',()=>{
 for(const Ctor of [RegisteredArrays,makeArrays(source,null,ops.registerSource(source))]){
  const vm=new VM();
  try{
   const arrays=new Ctor(vm.runtime);
   assert.doesNotThrow(()=>arrays.createEmpty({NAME:'standalone-empty'}));
   const ref=arrays.namedReference({NAME:'standalone-empty'});
   assert.deepEqual(BW.arrayValue(vm.runtime,ref),[]);
  }finally{vm.quit();}
 }
});

test('actual first-reference heap callback cannot substitute a different backing for the selected named Array',async()=>{
 // heapOf calls the real runtime listener API while allocating its first heap.
 // The probe forwards that call, substitutes one ensuing heap insertion, and
 // restores Map before the host checks completion. No value/service is mocked.
 const run=await fixture({registered:true,substituteBacking:true});
 try{
  assert.ok(run.fault,'the real heap-listener callback and insertion must both run');
  assert.notEqual(run.fault.requested,run.fault.replacement);
  assert.deepEqual(run.fault.requested,[]);
  assert.equal(run.errors.length,1);
  assert.match(run.errors[0].message,/Named primitive reference\/body differs/);
  assert.equal(run.stage.variables.array.value,0,'the rejected reference is never assigned');
  assert.equal(run.stage.variables.result.value,'UNASSIGNED');
  assert.equal(run.stage.variables.after.value,0);
  assert.ok(run.stage.variables.ticks.value>0,'the independent actual fiber continues');
 }finally{run.close();}
});

test('actual first-reference listener Error preserves identity and retires only the failing named-reference script',async()=>{
 const cause=Object.freeze({source:'named-reference-listener'});
 const actual=Object.freeze(new TypeError('actual named-reference listener error',{cause}));
 const descriptors=Object.getOwnPropertyDescriptors(actual);
 const run=await fixture({registered:true,listenerError:actual});
 try{
  assert.equal(run.fault?.listener,true,'the actual heap callback must throw');
  assert.equal(run.errors.length,1);assert.equal(run.errors[0],actual);
  assert.ok(run.errors[0] instanceof TypeError);assert.equal(run.errors[0].cause,cause);
  assert.deepEqual(Object.getOwnPropertyDescriptors(actual),descriptors);
  assert.equal(run.stage.variables.array.value,0);
  assert.equal(run.stage.variables.result.value,'UNASSIGNED');
  assert.equal(run.stage.variables.after.value,0);
  assert.ok(run.stage.variables.ticks.value>0,'the unrelated actual fiber remains live');
 }finally{run.close();}
});

test('actual completion ownership callback cannot redirect a named reference after its backing check',async()=>{
 // Keep the actual first heap insertion intact. Inject redirection only from
 // the real direct completion ownership callback, forwarding its thread test.
 // The stack selects that callback rather than relying on a call-count ordinal.
 const run=await fixture({registered:true,lateSubstitution:true});
 try{
  assert.equal(run.fault?.lateFired,true,'the actual direct completion callback must run');
  assert.equal(run.errors.length,1);
  assert.match(run.errors[0].message,/Named primitive reference\/body differs/);
  assert.equal(run.stage.variables.array.value,0);
  assert.equal(run.stage.variables.result.value,'UNASSIGNED');
  assert.equal(run.stage.variables.after.value,0);
  assert.ok(run.stage.variables.ticks.value>0);
 }finally{run.close();}
});

test('new private allocation and selection fields never dispatch inherited context getters or setters',async()=>{
 for(const poisonField of ['emptyAttempted','emptyExpired','namedSelected','namedExpired']){
  const run=await fixture({registered:true,poisonField});
  try{
   assert.equal(run.poisonedReads,0,'private own-data fields bypass inherited callbacks');
   assert.equal(run.errors.length,1,'the changed intrinsic surface is refused');
   assert.equal(run.stage.variables.array.value,0);
   assert.equal(run.stage.variables.result.value,'UNASSIGNED');
   assert.equal(run.stage.variables.after.value,0);
   assert.ok(run.stage.variables.ticks.value>0);
  }finally{run.close();}
 }
});

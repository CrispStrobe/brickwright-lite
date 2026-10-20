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
// Candidate source through the actual adapter; canonical publication remains separate.
assert.ok(process.env.BW_ARRAY_NAMED_JSON_SOURCE,'Exact candidate supplier is mandatory');
const source=readFileSync(process.env.BW_ARRAY_NAMED_JSON_SOURCE,'utf8');
for(const name of ['bw-array-operations.js','bw-primitive-owner.js','bw-values.js','bw-current-number-input.js'])
 assert.equal(readFileSync(root+'/util/'+name,'utf8'),readFileSync(new URL('../overlay/scratch-vm/src/util/'+name,import.meta.url),'utf8'),'fresh installed '+name);

async function fixture(options={}){
 const vm=new VM(),runtime=vm.runtime,errors=[],effects=[],registry=options.birthFault?'json-derived':'empty-derived';runtime.on('BLOCKS_ERROR',error=>errors.push(error));
 const ArraysCtor=makeArrays(source,null,options.unregistered?null:ops.registerSource(source));
 const arrays=new ArraysCtor(runtime);
 const original=arrays.valueBinary,originalAllocation=arrays.createReference;let saved,fault,poisonedReads=0;let restoreFault=()=>{};
 arrays.createReference=(args,util)=>{try{return originalAllocation(args,util);}finally{options.literalAfter?.();}};
 arrays.valueBinary=(args,util)=>{saved={args,util};options.before?.({args,util,runtime,arrays});
  try{return original(options.copyArgs?{...args}:args,options.copyUtil?{...util}:util);}
  finally{options.after?.();}};
 const loaded=vm.extensionManager._registerInternalExtension(arrays);vm.extensionManager._loadedExtensions.set('arrays',loaded);
 const probe={getInfo:()=>({id:'plusprobe',name:'Owned plus control',blocks:[{opcode:'prepare',blockType:'command',text:'prepare'},{opcode:'other',blockType:'reporter',text:'other'},{opcode:'literal',blockType:'reporter',text:'literal'},{opcode:'name',blockType:'reporter',text:'name'},{opcode:'poison',blockType:'reporter',text:'poison'},{opcode:'json',blockType:'reporter',text:'json'},{opcode:'birth',blockType:'reporter',text:'birth'}]}),
  prepare(_args,util){const stage=util.target,body=BW.arrayValue(runtime,stage.variables.array.value);
   if(options.arrayRight){stage.variables.right.value=stage.variables.array.value;options.prepare?.({runtime,stage,body,arrays,effects});}
   else options.prepare?.({runtime,stage,body,arrays,effects});},
  birth(){
   const original=runtime.isActiveThread,descriptor=Object.getOwnPropertyDescriptor(runtime,'isActiveThread');
   const restore=()=>{if(descriptor)Object.defineProperty(runtime,'isActiveThread',descriptor);else delete runtime.isActiveThread;};
   restoreFault=restore;
   runtime.isActiveThread=function(...args){
    const active=Reflect.apply(original,this,args);
    const frames=new Error().stack.split('\n');
    if(!fault&&frames.some(row=>/\bat Object\.finish /.test(row))){
     // Restore BEFORE the real offthread borrower: it cannot recurse through
     // this hook, alter the active ticket, or enroll the not-yet-published body.
     restore();fault={phase:'finish-borrow',mutation:options.birthFault};
     const reference=arrays.namedReference({NAME:registry});
     const body=BW.arrayValue(runtime,reference);
     assert.ok(Array.isArray(body),'actual named registry must already hold the parsed body');
     fault.reference=reference;fault.body=body;fault.before=JSON.stringify(body);
     if(options.birthFault==='property')body[0]=99;
     else if(options.birthFault==='length')body.length=1;
     else if(options.birthFault==='prototype')Object.setPrototypeOf(body,null);
     else if(options.birthFault==='extensibility')Object.preventExtensions(body);
     else assert.equal(options.birthFault,'observe');
     fault.after=JSON.stringify(body);fault.extensible=Object.isExtensible(body);fault.prototype=Object.getPrototypeOf(body);
    }
    return active;
   };
   return registry;
  },
  json(){
   const original=JSON.parse;
   JSON.parse=function(value){try{effects.push({kind:'custom-parse',value});return Reflect.apply(original,JSON,[value]);}finally{JSON.parse=original;}};
   restoreFault=()=>{JSON.parse=original;};return options.json;
  },
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
 const allocation=add(options.serialize?'arrays_toJSON':'arrays_namedReference',setup);blocks[setup].inputs.VALUE=[1,allocation];blocks[allocation].inputs.NAME=[1,(options.substituteBacking||options.listenerError||options.lateSubstitution)?add('plusprobe_name',allocation):text(registry,allocation)];
 const named=add(options.factory||'arrays_create1D',hat);blocks[hat].next=named;blocks[named].next=setup;blocks[setup].parent=named;blocks[named].inputs.NAME=[1,options.birthFault?add('plusprobe_birth',named):options.poisonField?add('plusprobe_poison',named):text(registry,named)];blocks[named].inputs.JSON=[1,options.customParser?add('plusprobe_json',named):text(options.json??'[7,8]',named)];
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

test('actual named JSON factories preserve parsed primitive and nested text values in both orders',async()=>{
 for(const factory of ['arrays_create1D','arrays_create2D'])for(const reverse of [false,true]){
  const run=await fixture({factory,reverse,json:'[[1,2],[],[3,null],"word"]',text:'!'});
  try{
   assert.deepEqual(run.errors,[]);assert.deepEqual(run.body,[[1,2],[],[3,null],'word']);
   assert.equal(run.stage.variables.result.value,reverse?'!1,2,,3,,word':'1,2,,3,,word!');
   assert.equal(run.stage.variables.after.value,'1');assert.ok(run.stage.variables.ticks.value>0);
  }finally{run.close();}
 }
});

test('named JSON birth remains current after actual connected push and selected alias publication',async()=>{
 const run=await fixture({json:'[7,8]',populate:5,text:'!'});
 try{assert.deepEqual(run.errors,[]);assert.deepEqual(run.body,[7,8,5]);assert.equal(run.stage.variables.result.value,'7,8,5!');}
 finally{run.close();}
});

test('actual invalid JSON fallback and nonarray roots retain legacy binding values',async()=>{
 for(const [factory,json,expected] of [
  ['arrays_create1D','invalid','[]'],['arrays_create2D','invalid','[[]]'],
  ['arrays_create1D','3','3'],['arrays_create2D','{"x":1}','{"x":1}']]){
  const run=await fixture({factory,json,serialize:true,text:'!'});
  try{assert.deepEqual(run.errors,[]);assert.equal(run.stage.variables.array.value,expected);assert.equal(run.stage.variables.result.value,expected+'!');}
  finally{run.close();}
 }
});

test('a real custom parser is called once and never lends its returned allocation primitive authority',async()=>{
 const run=await fixture({json:'[7,8]',customParser:true,text:'!'});
 try{
  assert.equal(run.effects.filter(row=>row.kind==='custom-parse').length,1);
  assert.deepEqual(run.body,[7,8]);assert.equal(run.errors.length,1);
  assert.match(run.errors[0].message,/primitive backing proof/);
  assert.equal(run.stage.variables.result.value,'UNASSIGNED');assert.ok(run.stage.variables.ticks.value>0);
 }finally{run.close();}
});

test('JSON object elements retain their plain value and do not acquire encoded primitive authority',async()=>{
 const run=await fixture({json:'[{"bwUndefined":true}]',text:'!'});
 try{assert.deepEqual(run.body,[{bwUndefined:true}]);assert.equal(run.errors.length,1);assert.match(run.errors[0].message,/primitive backing proof/);assert.equal(run.stage.variables.result.value,'UNASSIGNED');}
 finally{run.close();}
});

test('a parsed named body cannot cross runtime ownership or remain usable after Stop',async()=>{
 const origin=await fixture({json:'[7,8]',text:'!'});
 try{
  assert.deepEqual(origin.errors,[]);
  const other=await fixture({prepare:({runtime,stage})=>{stage.variables.array.value=BW.arrayReference(runtime,origin.body);}});
  try{assert.equal(other.errors.length,1);assert.match(other.errors[0].message,/foreign or stale/);assert.equal(other.stage.variables.result.value,'UNASSIGNED');assert.ok(other.stage.variables.ticks.value>0);}
  finally{other.close();}
  origin.vm.stopAll();assert.throws(()=>origin.original.call(origin.arrays,origin.saved.args,origin.saved.util),/current operation/);
 }finally{origin.close();}
});

test('named parsed allocation keeps selected-body identity and original listener Error retirement',async()=>{
 const replaced=await fixture({json:'[7,8]',lateSubstitution:true});
 try{assert.ok(replaced.fault);assert.equal(replaced.errors.length,1);assert.match(replaced.errors[0].message,/Named primitive reference\/body differs/);assert.equal(replaced.stage.variables.array.value,0);assert.ok(replaced.stage.variables.ticks.value>0);}
 finally{replaced.close();}
 const cause=Object.freeze({cause:'original'}),failure=Object.freeze(new TypeError('native JSON named listener',{cause}));
 const run=await fixture({json:'[7,8]',listenerError:failure});
 try{assert.ok(run.fault);assert.equal(run.errors.length,1);assert.equal(run.errors[0],failure);assert.equal(run.errors[0].cause,cause);assert.equal(run.stage.variables.array.value,0);assert.ok(run.stage.variables.ticks.value>0);}
 finally{run.close();}
});


test('new named JSON private fields bypass inherited getters and setters under actual NAME evaluation',async()=>{
 for(const poisonField of ['jsonAttempted','jsonExpired','jsonEligible','jsonBody']){
  const run=await fixture({poisonField,json:'[7,8]'});
  try{assert.equal(run.poisonedReads,0);assert.equal(run.errors.length,1);assert.equal(run.stage.variables.result.value,'UNASSIGNED');assert.ok(run.stage.variables.ticks.value>0);}
  finally{run.close();}
 }
});


test('a real forwarding finish callback can borrow the parsed named body without enrolling or changing it',async()=>{
 const run=await fixture({birthFault:'observe',json:'[7,8]',text:'!'});
 try{
  assert.equal(run.fault?.phase,'finish-borrow');assert.equal(run.fault.before,'[7,8]');assert.equal(run.fault.after,'[7,8]');
  assert.equal(run.fault.body,run.body,'later selected reference resolves the same actual parsed body');
  assert.deepEqual(run.errors,[]);assert.equal(run.stage.variables.result.value,'7,8!');
  assert.equal(run.stage.variables.after.value,'1');assert.ok(run.stage.variables.ticks.value>0);
 }finally{run.close();}
});

test('actual finish callback mutation of a parsed body expires publication before the dependent assignment',async()=>{
 for(const birthFault of ['property','length','prototype','extensibility']){
  const run=await fixture({birthFault,json:'[7,8]',text:'!'});
  try{
   assert.equal(run.fault?.phase,'finish-borrow');assert.equal(run.fault.before,'[7,8]');
   if(birthFault==='property')assert.equal(run.fault.body[0],99);
   else if(birthFault==='length')assert.equal(run.fault.body.length,1);
   else if(birthFault==='prototype')assert.equal(run.fault.prototype,null);
   else assert.equal(run.fault.extensible,false);
   assert.equal(run.errors.length,1);assert.match(run.errors[0].message,/Named JSON allocation changed before enrollment/);
   assert.equal(run.stage.variables.array.value,0,'the rejected factory cannot reach namedReference assignment');
   assert.equal(run.stage.variables.result.value,'UNASSIGNED');assert.equal(run.stage.variables.after.value,0);
   assert.ok(run.stage.variables.ticks.value>0,'only the failing lineage retires');
  }finally{run.close();}
 }
});

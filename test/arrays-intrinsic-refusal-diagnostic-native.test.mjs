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

test('explicit intrinsic refusal records Function toString identity without calling it and restores the complete JSON surface',async()=>{
 const descriptor=Object.getOwnPropertyDescriptor(Function.prototype,'toString');
 const json=JSON,keys=Reflect.ownKeys(json),descriptors=Object.getOwnPropertyDescriptors(json),prototype=Object.getPrototypeOf(json);
 const globalDescriptor=Object.getOwnPropertyDescriptor(globalThis,'JSON');let calls=0,run;
 const restore=()=>{
  Object.defineProperty(Function.prototype,'toString',descriptor);
  Object.defineProperty(globalThis,'JSON',globalDescriptor);Object.setPrototypeOf(json,prototype);
  for(const key of Reflect.ownKeys(json))assert.equal(Reflect.deleteProperty(json,key),true);
  for(const key of keys)Object.defineProperty(json,key,descriptors[key]);
  assert.deepEqual(Reflect.ownKeys(json),keys);assert.deepEqual(Object.getOwnPropertyDescriptors(json),descriptors);
  assert.equal(Object.getPrototypeOf(json),prototype);assert.deepEqual(Object.getOwnPropertyDescriptor(globalThis,'JSON'),globalDescriptor);
  assert.deepEqual(Object.getOwnPropertyDescriptor(Function.prototype,'toString'),descriptor);
 };
 try{
  run=await fixture({registered:true,before(){
   // Full restoration must not reorder Node/browser-specific native JSON keys.
   for(const key of Reflect.ownKeys(json))assert.equal(Reflect.deleteProperty(json,key),true);
   for(const key of keys)Object.defineProperty(json,key,descriptors[key]);
   Object.defineProperty(Function.prototype,'toString',{...descriptor,value:function(){calls++;return Reflect.apply(descriptor.value,this,[]);}});
  },after:restore});
  refused(run);assert.equal(run.errors[0].message,'Array primitive intrinsic surface changed');assert.equal(calls,0);
  const error=Object.getOwnPropertyDescriptor(run.errors[0],'cause').value;
  const field=Object.getOwnPropertyDescriptor(error,'bwArrayIntrinsicMismatch');
  assert.equal(field.writable,false);assert.equal(field.configurable,false);assert.equal(field.enumerable,false);
  assert.deepEqual({...field.value},{rootIndex:10,rootLabel:'Function.prototype',keyKind:'string',key:'toString',symbolPosition:null,
   comparison:'descriptor-field',changedField:'value',actualType:'function',savedType:'function',actualFlag:null,savedFlag:null});
  assert.equal(Object.getPrototypeOf(field.value),null);assert.equal(Object.isFrozen(field.value),true);
 }finally{restore();run?.close();}
 const fresh=await fixture({registered:true});try{clean(fresh);}finally{fresh.close();}
});

test('descriptor flag refusal is exact and later graph or computation failures never inherit its diagnostic',async()=>{
 const descriptor=Object.getOwnPropertyDescriptor(Function.prototype,'toString');let run;
 try{
  run=await fixture({registered:true,before(){Object.defineProperty(Function.prototype,'toString',{...descriptor,enumerable:!descriptor.enumerable});},
   after(){Object.defineProperty(Function.prototype,'toString',descriptor);}});
  refused(run);const summary=run.errors[0].cause.bwArrayIntrinsicMismatch;
  assert.equal(summary.changedField,'enumerable');assert.equal(summary.actualFlag,!descriptor.enumerable);assert.equal(summary.savedFlag,descriptor.enumerable);
 }finally{Object.defineProperty(Function.prototype,'toString',descriptor);run?.close();}
 const graph=await fixture({registered:true,coerce({runtime,args}){runtime.getTargetForStage().blocks._blocks[graphCall(runtime)].fields.OP.value='-';}});
 try{refused(graph);assert.equal(Object.hasOwn(graph.errors[0],'bwArrayIntrinsicMismatch'),false);
  assert.equal(Object.hasOwn(graph.errors[0].cause,'bwArrayIntrinsicMismatch'),false);
 }finally{graph.close();}
 const original=Object.freeze(new TypeError('original computation fault'));
 const computation=await fixture({registered:true,coerce(){throw original;}});
 try{refused(computation);assert.equal(computation.errors[0],original);assert.equal(Object.hasOwn(original,'bwArrayIntrinsicMismatch'),false);}
 finally{computation.close();}
});
const graphCall=runtime=>Object.keys(runtime.getTargetForStage().blocks._blocks).find(key=>runtime.getTargetForStage().blocks._blocks[key].opcode==='arrays_valueBinary');

test('begin preserves a changed live Error factory and never annotates its returned original error',async()=>{
 const descriptor=Object.getOwnPropertyDescriptor(Function.prototype,'toString');
 const globalDescriptor=Object.getOwnPropertyDescriptor(globalThis,'Error');
 const original=Object.freeze(new TypeError('custom Error factory original'));
 const calls=[];let run;
 const restore=()=>{Object.defineProperty(globalThis,'Error',globalDescriptor);Object.defineProperty(Function.prototype,'toString',descriptor);};
 try{
  run=await fixture({registered:true,before(){
   Object.defineProperty(Function.prototype,'toString',{...descriptor,value:function(){return Reflect.apply(descriptor.value,this,[]);}});
   globalThis.Error=function(message){calls.push(message);return original;};
  },after:restore});
  refused(run);assert.equal(calls.filter(message=>message==='Array primitive intrinsic surface changed').length,1);
  assert.equal(run.errors[0].cause,original);assert.equal(Object.hasOwn(original,'bwArrayIntrinsicMismatch'),false);
  assert.equal(Object.hasOwn(run.errors[0],'bwArrayIntrinsicMismatch'),false);
 }finally{restore();run?.close();}
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {INTEGRATED,importGuiDependency} from './helpers/bw-integrated.mjs';
const require=createRequire(import.meta.url),root=INTEGRATED+'/node_modules/scratch-vm/src';
const VM=(await importGuiDependency('scratch-vm/src/index.js')).default;
const makeArrays=require(root+'/extensions/crispstrobe/adapter.js');
const BW=require(root+'/util/bw-values.js'),ops=require(root+'/util/bw-array-operations.js');
const RegisteredArrays=require(root+'/extensions/crispstrobe/arrays/index.js');
const Arcade=require(root+'/extensions/crispstrobe/arcade/index.js');
assert.equal(readFileSync(root+'/extensions/crispstrobe/arrays/index.js','utf8'),readFileSync(new URL('../overlay/scratch-vm/src/extensions/crispstrobe/arrays/index.js',import.meta.url),'utf8'),'actual production carrier');
assert.ok(process.env.BW_ARRAY_NUMBER_VALUE_SOURCE,'Exact candidate supplier is mandatory');
const source=readFileSync(process.env.BW_ARRAY_NUMBER_VALUE_SOURCE,'utf8');
for(const name of ['bw-array-operations.js','bw-primitive-owner.js','bw-values.js','bw-current-number-input.js'])
 assert.equal(readFileSync(root+'/util/'+name,'utf8'),readFileSync(new URL('../overlay/scratch-vm/src/util/'+name,import.meta.url),'utf8'),'fresh installed '+name);

async function fixture(options={}){
 const vm=new VM(),runtime=vm.runtime,errors=[],effects=[];runtime.on('BLOCKS_ERROR',error=>errors.push(error));
 const ArraysCtor=options.registered?RegisteredArrays:makeArrays(source,null,options.unregistered?null:ops.registerSource(source));
 let arcade,arrays;
 if(options.captureArrayStop){
  arcade=new Arcade(runtime);const descriptor=Object.getOwnPropertyDescriptor(runtime,'on'),originalOn=runtime.on,stops=[];
  runtime.on=function(event,listener){if(event==='PROJECT_STOP_ALL')stops.push(listener);return originalOn.call(this,event,listener);};
  try{arrays=new ArraysCtor(runtime);}finally{if(descriptor)Object.defineProperty(runtime,'on',descriptor);else delete runtime.on;}
  assert.equal(stops.length,1,'the Array constructor adds its sole actual binding stop listener to the existing core');
  options.captureArrayStop(stops[0]);
 }else{arrays=new ArraysCtor(runtime);arcade=new Arcade(runtime);}
 let saved;
 const original=arcade.sourceValueBinary;
 arcade.sourceValueBinary=(args,util)=>{saved={args,util};options.before?.({args,util,runtime,arrays,arcade});
  if(options.copyArgs||options.copyUtil)assert.throws(()=>original.call(arcade,
   options.copyArgs?{...args}:args,options.copyUtil?{...util}:util),/actual current primitive/);
  try{return original.call(arcade,args,util);}
  finally{options.after?.();}};
 for(const [id,extension]of [['arrays',arrays],['arcade',arcade]]){
  const loaded=vm.extensionManager._registerInternalExtension(extension);vm.extensionManager._loadedExtensions.set(id,loaded);
 }
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
 const call=add('arcade_sourceValueBinary',assign,null,{}, {OP:[options.op??'+',null]});blocks[assign].inputs.VALUE=[1,call];
 const scalar=options.arrayRight?add('data_variable',call,null,{}, {VARIABLE:['right','right']}):options.coerce?add('plusprobe_other',call):options.number!==undefined?add('math_number',call,null,{}, {NUM:[String(options.number),null]},true):text(options.text??'',call);
 blocks[call].inputs={LEFT:[1,options.reverse?scalar:variable(call)],RIGHT:[1,options.reverse?variable(call):scalar]};
 const after=add('data_setvariableto',assign,null,{VALUE:[1,[10,'1']]},{VARIABLE:['after','after']});blocks[assign].next=after;
 const independent=add('event_whenflagclicked',null),forever=add('control_forever',independent);blocks[independent].next=forever;
 const tick=add('data_changevariableby',forever,null,{VALUE:[1,[4,'1']]},{VARIABLE:['ticks','ticks']});blocks[forever].inputs.SUBSTACK=[2,tick];
 const project={targets:[{isStage:true,name:'Stage',variables,lists:{},broadcasts:{},blocks,comments:{},costumes:[{assetId:'cd21514d0531fdffb22204e0ec5ed84a',name:'backdrop',dataFormat:'svg',md5ext:'cd21514d0531fdffb22204e0ec5ed84a.svg',rotationCenterX:240,rotationCenterY:180}],sounds:[],currentCostume:0,volume:100,layerOrder:0}],monitors:[],extensions:['arrays','arcade','plusprobe'],meta:{semver:'3.0.0',vm:'0.2.0',agent:''}};
 await vm.loadProject(JSON.stringify(project));runtime.currentStepTime=1000/30;
 const step=async()=>{for(let i=0;i<4;i++){await runtime._step();await new Promise(resolve=>setImmediate(resolve));}};
 vm.greenFlag();await step();const stage=runtime.getTargetForStage();
 return {vm,runtime,stage,arrays,arcade,original,saved,errors,effects,call,body:BW.arrayValue(runtime,stage.variables.array.value),
  close(){vm.stopAll();vm.quit();}};
}
const clean=run=>{assert.deepEqual(run.errors,[]);assert.equal(run.stage.variables.after.value,'1');};
const refused=run=>{assert.equal(run.errors.length,1);assert.equal(run.stage.variables.result.value,'UNASSIGNED');assert.equal(run.stage.variables.after.value,0);assert.ok(run.stage.variables.ticks.value>0,'independent actual fiber continues');};


test('source Array arithmetic preserves opaque PXT coercion in both operand orders and with cyclic bodies',async()=>{
 for(const reverse of [false,true])for(const value of [[5],[],[null,1,true,'x'],[[2,3]]]){
  const run=await fixture({value,reverse,text:'!'});
  try{clean(run);assert.equal(run.stage.variables.result.value,reverse?'![object Object]':'[object Object]!');}
  finally{run.close();}
 }
 const cyclic=await fixture({text:'!',prepare:({runtime,body})=>body.push(BW.arrayReference(runtime,body))});
 try{clean(cyclic);assert.equal(cyclic.stage.variables.result.value,'[object Object]!');}finally{cyclic.close();}
 const numeric=await fixture({number:2});try{clean(numeric);assert.equal(numeric.stage.variables.result.value,'[object Object]2');}finally{numeric.close();}
});

test('source arithmetic accepts current canonical opaque resource Arrays without reading their bodies',async()=>{
 let reads=0;
 const run=await fixture({text:'!',prepare:({runtime,stage})=>{
  const body=[];Object.defineProperty(body,'0',{enumerable:true,configurable:true,get(){reads++;throw new Error('body getter must not run');}});
  stage.variables.array.value=BW.arrayReference(runtime,body);
 }});
 try{clean(run);assert.equal(run.stage.variables.result.value,'[object Object]!');assert.equal(reads,0);}
 finally{run.close();}
});

test('source arithmetic refuses foreign canonical Arrays and arbitrary objects before coercion effects',async()=>{
 const foreign=new VM();let calls=0;
 try{
  for(const value of [BW.arrayReference(foreign.runtime,[5]),{toString(){calls++;return 'surprise';}}]){
   const run=await fixture({text:'!',prepare:({stage})=>{stage.variables.array.value=value;}});
   try{refused(run);assert.equal(calls,0);}finally{run.close();}
  }
 }finally{foreign.stopAll();foreign.quit();}
});

test('source arithmetic requires the exact current registered operation and cached arguments',async()=>{
 for(const options of [{copyArgs:true},{copyUtil:true}]){
  const run=await fixture(options);try{clean(run);assert.equal(run.stage.variables.result.value,'[object Object]');}finally{run.close();}
 }
 const unsupported=await fixture({op:'&'});try{refused(unsupported);}finally{unsupported.close();}
 const run=await fixture({text:'!'});
 try{clean(run);assert.throws(()=>run.arcade.sourceValueBinary(run.saved.args,run.saved.util),/current|owner|operation|active/i);}
 finally{run.close();}
});

test('source arithmetic rechecks body generation after live owner callbacks retire the Array binding',async()=>{
 let ownerReads=0,retired=false,restore,retireArray;
 const run=await fixture({text:'!',captureArrayStop:listener=>{retireArray=listener;},before:({runtime})=>{
  const original=runtime.getOpcodeFunction;
  runtime.getOpcodeFunction=function(opcode){
   const value=original.call(this,opcode);
   if(opcode==='arrays_createReference'&&++ownerReads===2){retired=true;retireArray.call(runtime);}
   return value;
  };
  restore=()=>{runtime.getOpcodeFunction=original;};
 }});
 try{assert.equal(retired,true,'actual second registered Array owner lookup retires the current binding');refused(run);}
 finally{restore?.();run.close();}
});


test('source arithmetic refuses a late Boolean replacement before canonical decoding can call it',async()=>{
 const descriptor=Object.getOwnPropertyDescriptor(globalThis,'Boolean'),nativeBoolean=descriptor.value;
 let ownerReads=0,changed=false,coercions=0,restore=()=>{};
 const run=await fixture({text:'!',before:({runtime})=>{
  const original=runtime.getOpcodeFunction,reference=runtime.getTargetForStage().variables.array.value;
  runtime.getOpcodeFunction=function(opcode){
   const value=original.call(this,opcode);
   if(opcode==='arrays_createReference'&&++ownerReads===2){
    changed=true;
    Object.defineProperty(globalThis,'Boolean',{...descriptor,value:function(value){
     if(value===reference){coercions++;runtime.emit('PROJECT_STOP_ALL');}
     return nativeBoolean(value);
    }});
   }
   return value;
  };
  restore=()=>{Object.defineProperty(globalThis,'Boolean',descriptor);runtime.getOpcodeFunction=original;};
 },after:()=>restore()});
 try{assert.equal(changed,true,'actual owner lookup changes the live decoder dependency');refused(run);assert.equal(coercions,0,'replaced Boolean cannot observe a canonical operand');}
 finally{restore();run.close();assert.deepEqual(Object.getOwnPropertyDescriptor(globalThis,'Boolean'),descriptor);}
});

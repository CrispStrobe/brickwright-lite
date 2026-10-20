import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {INTEGRATED,importGuiDependency} from './helpers/bw-integrated.mjs';
import {importProjectFiles} from '../overlay/scratch-gui/src/lib/bw-makecode/index.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {runProgram,stepFrames,clearStrayTimers} from './helpers/bw-vm.mjs';
const require=createRequire(import.meta.url),root=INTEGRATED+'/node_modules/scratch-vm/src';
const VM=(await importGuiDependency('scratch-vm/src/index.js')).default;
const makeArrays=require(root+'/extensions/crispstrobe/adapter.js');
const BW=require(root+'/util/bw-values.js'),ops=require(root+'/util/bw-array-operations.js');
const primitiveOwner=require(root+'/util/bw-primitive-owner.js');
const RegisteredArrays=require(root+'/extensions/crispstrobe/arrays/index.js');
const Arcade=require(root+'/extensions/crispstrobe/arcade/index.js');
assert.equal(readFileSync(root+'/extensions/crispstrobe/arrays/index.js','utf8'),readFileSync(new URL('../overlay/scratch-vm/src/extensions/crispstrobe/arrays/index.js',import.meta.url),'utf8'),'actual production carrier');
assert.equal(readFileSync(root+'/extensions/crispstrobe/arcade/index.js','utf8'),readFileSync(new URL('../overlay/scratch-vm/src/extensions/crispstrobe/arcade/index.js',import.meta.url),'utf8'),'fresh installed Arcade');
assert.ok(process.env.BW_ARRAY_NUMBER_VALUE_SOURCE,'Exact candidate supplier is mandatory');
const source=readFileSync(process.env.BW_ARRAY_NUMBER_VALUE_SOURCE,'utf8');
for(const name of ['bw-array-operations.js','bw-primitive-owner.js','bw-arcade-exceptions.js','bw-values.js','bw-current-number-input.js'])
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
 const originals={};
 for(const method of ['sourceValueBinary','sourceValueUnary']){
  const original=originals[method]=arcade[method];
  arcade[method]=(args,util)=>{saved={args,util,method};options.before?.({args,util,runtime,arrays,arcade,method,effects});
   if(options.copyArgs||options.copyUtil)assert.throws(()=>original.call(arcade,
    options.copyArgs?{...args}:args,options.copyUtil?{...util}:util),/actual current primitive/);
   try{return original.call(arcade,args,util);}finally{options.after?.();}};
 }
 const original=originals[options.unary?'sourceValueUnary':'sourceValueBinary'];
 for(const [id,extension]of [['arrays',arrays],['arcade',arcade]]){
  const loaded=vm.extensionManager._registerInternalExtension(extension);vm.extensionManager._loadedExtensions.set(id,loaded);
 }
 const scalars=new Map();
 const probe={getInfo:()=>({id:'plusprobe',name:'Owned plus control',blocks:[{opcode:'prepare',blockType:'command',text:'prepare'},{opcode:'other',blockType:'reporter',text:'other'},{opcode:'literal',blockType:'reporter',text:'literal'},{opcode:'scalar',blockType:'reporter',text:'scalar [KEY]',arguments:{KEY:{type:'string'}}}]}),
  prepare(_args,util){const stage=util.target,body=BW.arrayValue(runtime,stage.variables.array.value);
   if(options.arrayRight){stage.variables.right.value=stage.variables.array.value;options.prepare?.({runtime,stage,body,arrays,effects});}
   else options.prepare?.({runtime,stage,body,arrays,effects});},
  literal(){return options.literalRaw?options.literalRaw({runtime,effects}):{toString(){effects.push('literal-conversion');options.literalCoerce?.({runtime});return JSON.stringify(options.value??[5]);}};},
  scalar(args){effects.push('scalar-'+args.KEY);return scalars.get(args.KEY);},
  other(){return {toString(){effects.push('other-conversion');options.coerce?.({runtime,body:BW.arrayValue(runtime,runtime.getTargetForStage().variables.array.value),effects,arrays,original,args:saved.args,util:saved.util});return options.otherText??'!';}};}};
 const ps=vm.extensionManager._registerInternalExtension(probe);vm.extensionManager._loadedExtensions.set('plusprobe',ps);
 const blocks={},variables={array:['array',0],result:['result','UNASSIGNED'],after:['after',0],ticks:['ticks',0],right:['right',0]};let serial=0;
 const add=(opcode,parent,next=null,inputs={},fields={},shadow=false)=>{const id='p'+serial++;blocks[id]={opcode,parent,next,inputs,fields,shadow,topLevel:parent===null,...(parent===null?{x:0,y:0}:{})};return id;};
 const text=(value,parent)=>add('text',parent,null,{}, {TEXT:[String(value),null]},true);
 const variable=parent=>add('data_variable',parent,null,{}, {VARIABLE:['array','array']});
 const hat=add('event_whenflagclicked',null),setup=add('data_setvariableto',hat,null,{}, {VARIABLE:['array','array']});blocks[hat].next=setup;
 const allocation=add('arrays_createReference',setup);blocks[setup].inputs.VALUE=[1,allocation];blocks[allocation].inputs.VALUES=[1,(options.literalCoerce||options.literalRaw)?add('plusprobe_literal',allocation):text(JSON.stringify(options.value??[5]),allocation)];
 const prepare=add('plusprobe_prepare',setup);blocks[setup].next=prepare;
 const cases=options.cases??[options],results=[],calls=[];let previous=prepare;
 for(let index=0;index<cases.length;index++){
  const spec=cases[index],result=cases.length===1?'result':'result'+index;
  if(cases.length!==1)variables[result]=[result,'UNASSIGNED'];results.push(result);
  const assign=add('data_setvariableto',previous,null,{}, {VARIABLE:[result,result]});blocks[previous].next=assign;
  const call=add(spec.unary?'arcade_sourceValueUnary':'arcade_sourceValueBinary',assign,null,{}, {OP:[spec.op??(spec.unary?'~':'+'),null]});
  calls.push(call);blocks[assign].inputs.VALUE=[1,call];
  let scalar;
  if(!spec.unary||spec.scalarUnary){
   if(spec.arrayRight)scalar=variable(call);
   else if(Object.hasOwn(spec,'scalarValue')){
    const key=String(index);scalars.set(key,spec.scalarValue);scalar=add('plusprobe_scalar',call);
    blocks[scalar].inputs.KEY=[1,text(key,scalar)];
   }else scalar=spec.coerce?add('plusprobe_other',call):spec.number!==undefined?add('math_number',call,null,{}, {NUM:[String(spec.number),null]},true):text(spec.text??'',call);
  }
  blocks[call].inputs=spec.unary?{VALUE:[1,spec.scalarUnary?scalar:variable(call)]}:
   {LEFT:[1,spec.reverse?scalar:variable(call)],RIGHT:[1,spec.reverse?variable(call):scalar]};
  if(!spec.unary&&Object.hasOwn(spec,'leftScalarValue')){
   const key='left'+index;scalars.set(key,spec.leftScalarValue);const input=add('plusprobe_scalar',call);
   blocks[input].inputs.KEY=[1,text(key,input)];blocks[call].inputs.LEFT=[1,input];
  }
  previous=assign;
 }
 const call=calls[0];
 const after=add('data_setvariableto',previous,null,{VALUE:[1,[10,'1']]},{VARIABLE:['after','after']});blocks[previous].next=after;
 const independent=add('event_whenflagclicked',null),forever=add('control_forever',independent);blocks[independent].next=forever;
 const tick=add('data_changevariableby',forever,null,{VALUE:[1,[4,'1']]},{VARIABLE:['ticks','ticks']});blocks[forever].inputs.SUBSTACK=[2,tick];
 const project={targets:[{isStage:true,name:'Stage',variables,lists:{},broadcasts:{},blocks,comments:{},costumes:[{assetId:'cd21514d0531fdffb22204e0ec5ed84a',name:'backdrop',dataFormat:'svg',md5ext:'cd21514d0531fdffb22204e0ec5ed84a.svg',rotationCenterX:240,rotationCenterY:180}],sounds:[],currentCostume:0,volume:100,layerOrder:0}],monitors:[],extensions:['arrays','arcade','plusprobe'],meta:{semver:'3.0.0',vm:'0.2.0',agent:''}};
 await vm.loadProject(JSON.stringify(project));runtime.currentStepTime=1000/30;
 const step=async()=>{for(let i=0;i<8;i++){await runtime._step();await new Promise(resolve=>setImmediate(resolve));}};
 vm.greenFlag();await step();const stage=runtime.getTargetForStage();
 return {vm,runtime,stage,arrays,arcade,original,saved,errors,effects,call,calls,results,body:BW.arrayValue(runtime,stage.variables.array.value),
  close(){vm.stopAll();vm.quit();}};
}
const clean=run=>{assert.deepEqual(run.errors,[]);assert.equal(run.stage.variables.after.value,'1');};
const refused=run=>{assert.equal(run.errors.length,1);assert.equal(run.stage.variables.result.value,'UNASSIGNED');assert.equal(run.stage.variables.after.value,0);assert.ok(run.stage.variables.ticks.value>0,'independent actual fiber continues');};


const bitwise=['&','|','^','<<','>>','>>>'];
const expectResults=(run,cases)=>{
 clean(run);assert.equal(run.results.length,cases.length);
 for(let i=0;i<cases.length;i++)assert.equal(run.stage.variables[run.results[i]].value,cases[i].expected,'case '+i+' '+JSON.stringify(cases[i].label));
};

test('source bitwise menus and unary execution have exact fixed selectors and one actual VALUE input',async()=>{
 const cases=[{op:'|',number:5,expected:5},{unary:true,expected:-1}],run=await fixture({cases});
 try{
  expectResults(run,cases);
  const info=run.arcade.getInfo();
  assert.equal(info.menus.sourceBinaryOperations.acceptReporters,false);
  assert.deepEqual(info.menus.sourceBinaryOperations.items,['+','-','*','/','%','**',...bitwise]);
  assert.deepEqual(info.menus.sourceUnaryOperations,{acceptReporters:false,items:['~']});
  assert.equal(primitiveOwner.permitsNumberInput('arcade_sourceValueUnary','VALUE'),true);
  assert.equal(primitiveOwner.permitsNumberInput('arcade_sourceValueUnary','RIGHT'),false);
  assert.equal(primitiveOwner.permitsNumberInput('arcade_sourceValueUnary','LEFT'),false);
  const metadata=info.blocks.find(block=>block.opcode==='sourceValueUnary');
  assert.deepEqual(Object.keys(metadata.arguments).sort(),['OP','VALUE']);
  const block=run.stage.blocks.getBlock(run.calls[1]);assert.deepEqual(Object.keys(block.inputs),['VALUE']);
  assert.deepEqual(block.fields.OP,{name:'OP',value:'~',id:null});
  const reference=run.stage.variables.array.value;
  assert.throws(()=>BW.binary(reference,'|',0),/Bitwise conversion requires primitive/);
  assert.throws(()=>BW.unary('~',reference),/Bitwise conversion requires primitive/);
 }finally{run.close();}
});

test('selected original PXT Array and primitive bitwise results agree in both actual input orders',async()=>{
 // Constants from the retained original 370-result specification, not Array
 // element coercion or a second implementation of the runtime operation.
 const rows=[
  {label:'number -3',number:-3,i32:-3,u32:4294967293,complement:2},
  {label:'string 5',scalarValue:'5',i32:5,u32:5,complement:-6},
  {label:'Boolean true',scalarValue:true,i32:1,u32:1,complement:-2},
  {label:'null',scalarValue:null,i32:0,u32:0,complement:-1},
  {label:'encoded undefined',scalarValue:BW.UNDEFINED,i32:0,u32:0,complement:-1}
 ];
 const cases=[];
 for(const row of rows){
  const input=Object.hasOwn(row,'number')?{number:row.number}:{scalarValue:row.scalarValue};
  for(const op of bitwise){
   cases.push({...input,op,label:[row.label,op,'Array left'],expected:op==='|'||op==='^'?row.i32:0});
   cases.push({...input,op,reverse:true,label:[row.label,op,'Array right'],expected:op==='&'?0:op==='>>>'?row.u32:row.i32});
  }
  cases.push({...input,unary:true,scalarUnary:true,label:[row.label,'unary'],expected:row.complement});
 }
 cases.push({unary:true,label:'Array unary',expected:-1});
 const run=await fixture({value:[5],cases});try{expectResults(run,cases);}finally{run.close();}
});

test('empty nested cyclic alias and SDK resource Array bodies are never traversed for source bitwise or unary',async()=>{
 for(const family of ['empty','nested','cycle','resource-getter']){
  let reads=0;
  const cases=[];
  for(const op of bitwise){
   cases.push({op,number:-3,expected:op==='|'||op==='^'?-3:0});
   cases.push({op,number:-3,reverse:true,expected:op==='&'?0:op==='>>>'?4294967293:-3});
   cases.push({op,arrayRight:true,expected:0});
  }
  cases.push({unary:true,expected:-1});
  const run=await fixture({value:family==='empty'?[]:[[2,3]],cases,prepare:({runtime,stage,body})=>{
   if(family==='cycle')body.push(BW.arrayReference(runtime,body));
   if(family==='resource-getter'){
    const resource=[];Object.defineProperty(resource,'0',{enumerable:true,configurable:true,get(){reads++;throw Error('Array element read');}});
    stage.variables.array.value=BW.arrayReference(runtime,resource);
   }
  }});
  try{expectResults(run,cases);assert.equal(reads,0);}finally{run.close();}
 }
});

test('source bitwise and unary refuse foreign canonical and unknown values before any coercion effect',async()=>{
 const foreign=new VM();let coercions=0;
 try{
  for(const unary of [false,true])for(const kind of ['foreign','unknown','malformed']){
   const run=await fixture({unary,op:unary?'~':'|',number:-3,prepare:({runtime,stage})=>{
    if(kind==='foreign')stage.variables.array.value=BW.arrayReference(foreign.runtime,[5]);
    if(kind==='unknown')stage.variables.array.value={toString(){coercions++;throw Error('must not coerce object');}};
    if(kind==='malformed'){
     const reference=BW.arrayReference(runtime,[]);reference.extra='not canonical';stage.variables.array.value=reference;
    }
   }});
   try{refused(run);assert.equal(coercions,0);}finally{run.close();}
  }
 }finally{foreign.stopAll();foreign.quit();}
});

test('unary and bitwise retain current cached caller and fixed selector refusal boundaries',async()=>{
 for(const options of [{unary:true,copyArgs:true},{unary:true,copyUtil:true},{op:'|',number:5,copyArgs:true}]){
  const run=await fixture(options);
  try{clean(run);assert.equal(run.stage.variables.result.value,options.unary?-1:5);}finally{run.close();}
 }
 const unsupported=await fixture({unary:true,op:'+'});try{refused(unsupported);}finally{unsupported.close();}
 const run=await fixture({unary:true});
 try{
  clean(run);assert.equal(run.stage.variables.result.value,-1);
  assert.throws(()=>run.arcade.sourceValueUnary(run.saved.args,run.saved.util),/current|owner|operation|active/i);
 }finally{run.close();}
});

test('source bitwise and unary recheck tracked generation after actual registered-owner callbacks',async()=>{
 for(const unary of [false,true]){
  let ownerReads=0,retired=false,retireArray,restore=()=>{};
  const run=await fixture({unary,op:unary?'~':'|',number:5,captureArrayStop:listener=>{retireArray=listener;},before:({runtime})=>{
   const descriptor=Object.getOwnPropertyDescriptor(runtime,'getOpcodeFunction'),original=runtime.getOpcodeFunction;
   runtime.getOpcodeFunction=function(opcode){const value=original.call(this,opcode);
    if(opcode==='arrays_createReference'&&++ownerReads===2){retired=true;retireArray.call(runtime);}return value;};
   restore=()=>{if(descriptor)Object.defineProperty(runtime,'getOpcodeFunction',descriptor);else delete runtime.getOpcodeFunction;};
  },after:()=>restore()});
  try{assert.equal(retired,true);refused(run);}finally{restore();run.close();}
 }
});

test('late Boolean dependency replacement is refused for bitwise and unary before canonical decoding',async()=>{
 for(const unary of [false,true]){
  const descriptor=Object.getOwnPropertyDescriptor(globalThis,'Boolean'),nativeBoolean=descriptor.value;
  let ownerReads=0,changed=false,coercions=0,restore=()=>{};
  const run=await fixture({unary,op:unary?'~':'|',number:5,before:({runtime})=>{
   const own=Object.getOwnPropertyDescriptor(runtime,'getOpcodeFunction'),original=runtime.getOpcodeFunction;
   const reference=runtime.getTargetForStage().variables.array.value;
   runtime.getOpcodeFunction=function(opcode){const value=original.call(this,opcode);
    if(opcode==='arrays_createReference'&&++ownerReads===2){
     changed=true;Object.defineProperty(globalThis,'Boolean',{...descriptor,value:function(value){
      if(value===reference)coercions++;return nativeBoolean(value);
     }});
    }return value;
   };
   restore=()=>{Object.defineProperty(globalThis,'Boolean',descriptor);
    if(own)Object.defineProperty(runtime,'getOpcodeFunction',own);else delete runtime.getOpcodeFunction;};
  },after:()=>restore()});
  try{assert.equal(changed,true);refused(run);assert.equal(coercions,0);}finally{restore();run.close();assert.deepEqual(Object.getOwnPropertyDescriptor(globalThis,'Boolean'),descriptor);}
 }
});

test('source unary keeps the full intrinsic descriptor fence without changing native primitive policy',async()=>{
 const descriptor=Object.getOwnPropertyDescriptor(Function.prototype,'toString'),original=descriptor.value;
 let changed=false;
 const restore=()=>Object.defineProperty(Function.prototype,'toString',descriptor);
 const run=await fixture({unary:true,before:()=>{
  changed=true;Object.defineProperty(Function.prototype,'toString',{...descriptor,value:function(){return Reflect.apply(original,this,[]);}});
 },after:restore});
 try{assert.equal(changed,true);refused(run);}finally{restore();run.close();assert.deepEqual(Object.getOwnPropertyDescriptor(Function.prototype,'toString'),descriptor);}
});

test('actual reporter inputs execute once in order and unary has no synthesized RIGHT dependency',async()=>{
 const cases=[{op:'|',leftScalarValue:-3,scalarValue:5,expected:-3},{unary:true,scalarUnary:true,scalarValue:true,expected:-2}];
 const run=await fixture({cases,before:({method,effects})=>{effects.push('call-'+method);}});
 try{
  expectResults(run,cases);
  assert.deepEqual(run.effects,['scalar-left0','scalar-0','call-sourceValueBinary','scalar-1','call-sourceValueUnary']);
  assert.deepEqual(Object.keys(run.stage.blocks.getBlock(run.calls[1]).inputs),['VALUE']);
 }finally{run.close();}
});


test('actual source bitwise and unary Number results compose with typeof and ordinary Number formals through export and reimport',async()=>{
 const input='let rows=[5];let seenBinary=99;let seenUnary=99;let typeBinary="";let typeUnary="";let entered=0;function receiveBinary(value:number){entered+=1;seenBinary=value;}function receiveUnary(value:number){entered+=1;seenUnary=value;}receiveBinary(rows&1);receiveUnary(~rows);typeBinary=typeof(rows|1);typeUnary=typeof(~rows);';
 const imported=importProjectFiles({'main.ts':input},{target:'arcade'});
 assert.deepEqual(imported.unsupported,[]);assert.deepEqual(imported.warnings,[]);
 let next=imported;
 for(const route of ['authored','exported and reimported']){
  let run;
  try{
   run=await runProgram(next.code,{frames:12,countExtensionCalls:false});
   assert.equal(run.extensionCallsObserved,false,'genuine production delegates, no counter observation');
   assert.deepEqual(run.errors,[],route);assert.deepEqual(run.creator.warnings,[],route);
   const observed=Object.fromEntries(run.vm.runtime.targets.flatMap(target=>Object.values(target.variables)).map(variable=>[variable.name,BW.decode(variable.value)]));
   assert.equal(observed.entered,2,route);assert.equal(observed.seenBinary,0,route);assert.equal(observed.seenUnary,-1,route);
   assert.equal(observed.typeBinary,'number',route);assert.equal(observed.typeUnary,'number',route);
   const project=JSON.parse(run.vm.toJSON()),blocks=project.targets.flatMap(target=>Object.values(target.blocks));
   assert.equal(blocks.filter(block=>block.opcode==='arcade_sourceValueBinary').length,2,route);
   assert.equal(blocks.filter(block=>block.opcode==='arcade_sourceValueUnary').length,2,route);
   assert.equal(blocks.filter(block=>block.opcode==='arcade_sourceTypeOf').length,2,route);
   assert.equal(blocks.filter(block=>block.opcode==='arcade_declareParameterConstraint'&&block.fields.TYPE[0]==='Number').length,2,route);
   if(route==='authored'){
    const exported=projectToArcade(project);assert.deepEqual(exported.unsupported,[]);assert.deepEqual(exported.warnings,[]);
    next=importProjectFiles(exported.files,{target:'arcade'});assert.deepEqual(next.unsupported,[]);assert.deepEqual(next.warnings,[]);
   }
  }finally{if(run){run.vm.stopAll();run.vm.quit();}clearStrayTimers();}
 }
});


test('owner-callback numeric setters cannot receive private source-operation rows before intrinsic refusal',async()=>{
 for(const unary of [false,true]){
  const key=unary?'0':'1',descriptor=Object.getOwnPropertyDescriptor(Array.prototype,key),define=Object.defineProperty,ownDescriptor=Object.getOwnPropertyDescriptor;
  let changed=false,ownerReads=0,privateRowEscaped=false,restore=()=>{};
  const run=await fixture({unary,op:unary?'~':'|',arrayRight:!unary,number:5,before:({runtime})=>{
   const own=ownDescriptor(runtime,'getOpcodeFunction'),original=runtime.getOpcodeFunction;
   runtime.getOpcodeFunction=function(opcode){const value=original.call(this,opcode);
    const trace=opcode==='arrays_createReference'?new Error().stack:'';
    if(opcode==='arrays_createReference'&&/\bat ownerCurrent\b/.test(trace)&&/\bat operand\b/.test(trace)&&++ownerReads===(unary?1:2)){
     changed=true;define(Array.prototype,key,{configurable:true,set(value){
      if(value&&typeof value==='object'&&ownDescriptor(value,'body')&&ownDescriptor(value,'saved')&&ownDescriptor(value,'identity'))privateRowEscaped=true;
      // Forward the normal assignment without retaining any received value.
      define(this,key,{value,writable:true,enumerable:true,configurable:true});
     }});
    }return value;
   };
   restore=()=>{if(descriptor)define(Array.prototype,key,descriptor);else delete Array.prototype[key];
    if(own)define(runtime,'getOpcodeFunction',own);else delete runtime.getOpcodeFunction;};
  },after:()=>restore()});
  try{
   assert.equal(changed,true,'actual last-operand ownerCurrent callback installs the setter after initial intrinsic admission');
   assert.equal(ownerReads,unary?1:2,'the last actual Array operand is the injection boundary');
   assert.equal(privateRowEscaped,false);refused(run);
   assert.match(String(run.errors[0]),/operand or operation changed during validation/);
  }finally{restore();run.close();assert.deepEqual(ownDescriptor(Array.prototype,key),descriptor);}
 }
});


// Real constructors/registration and the unchanged Creator-produced project.
// The forwarding lookup hook receives only public runtime/opcode metadata, never
// a copied utility, manufactured ticket, producer result or primitive args.
async function resultEvidenceFixture(sourceText,{mode}={}){
 const imported=importProjectFiles({'main.ts':sourceText},{target:'arcade'});assert.deepEqual(imported.unsupported,[]);assert.deepEqual(imported.warnings,[]);
 let seed,vm;
 try{
  seed=await runProgram(imported.code,{frames:0,countExtensionCalls:false});seed.vm.stopAll();seed.vm.quit();
  vm=new VM();vm.runtime.bwArcadeFrameAuthority='manual';const runtime=vm.runtime,errors=[],marker=new Error('source-only lookup throw'),facts={mode,fired:false,redirectCalls:0,other:0};
  runtime.on('BLOCKS_ERROR',error=>errors.push(String(error)));
  const ownLookup=Object.getOwnPropertyDescriptor(runtime,'getOpcodeFunction'),lookup=runtime.getOpcodeFunction;
  runtime.getOpcodeFunction=function(opcode){const value=Reflect.apply(lookup,this,[opcode]),trace=new Error().stack;
   if(!facts.fired&&mode==='proxy table capture'&&opcode==='arcade_sourceValueBinary'&&/\bat capture\b/.test(trace)){
    facts.fired=true;const table=runtime._primitives;facts.originalTable=table;
    runtime._primitives=new Proxy(table,{getOwnPropertyDescriptor(target,key){
     if(key==='arcade_sourceValueBinary'&&/\bat sourceNumber\b/.test(new Error().stack)){facts.trapFired=true;runtime.emit('EXTENSION_ADDED',runtime._blockInfo.find(value=>value.id==='arcade'));}
     return Reflect.getOwnPropertyDescriptor(target,key);
    }});
   }
   if(!facts.fired&&mode==='source lookup throw'&&opcode==='arcade_sourceValueUnary'&&/\bat capture\b/.test(trace)){facts.fired=true;facts.thrown=marker;throw marker;}
   if(!facts.fired&&opcode==='arcade_sourceValueBinary'&&/\bat sourceNumber\b/.test(trace)){
    const category=runtime._blockInfo.find(value=>value.id==='arcade');
    if(mode==='late duplicate'){facts.fired=true;runtime.emit('EXTENSION_ADDED',category);}
    if(mode==='late row removal'){facts.fired=true;facts.category=category;facts.index=category.blocks.findIndex(value=>value.json?.type===opcode);facts.row=category.blocks.splice(facts.index,1)[0];}
   }
   return value;
  };
  const arrays=new RegisteredArrays(runtime),arcade=new Arcade(runtime),manager=vm.extensionManager;
  const ownPrepare=Object.getOwnPropertyDescriptor(manager,'_prepareBlockInfo'),prepare=manager._prepareBlockInfo;
  if(mode==='redirect metadata'){
   arcade.metadataString=()=>{facts.redirectCalls++;return 'redirected String';};
   manager._prepareBlockInfo=function(service,info){if(info.opcode==='sourceValueBinary'){facts.fired=true;info.func='metadataString';}return Reflect.apply(prepare,this,[service,info]);};
  }
  for(const [id,extension]of [['arrays',arrays],['arcade',arcade]]){const service=manager._registerInternalExtension(extension);manager._loadedExtensions.set(id,service);}
  if(mode==='primitive ABA'){
   const original=runtime._primitives.arcade_sourceValueBinary;
   runtime._primitives.arcade_sourceValueBinary=function(){facts.fired=true;facts.redirectCalls++;runtime._primitives.arcade_sourceValueBinary=original;return 'foreign cached String';};
  }
  if(mode==='delegate ABA'){
   const original=arcade.sourceValueBinary;
   arcade.sourceValueBinary=function(){facts.fired=true;facts.redirectCalls++;arcade.sourceValueBinary=original;return 'restored after String';};
  }
  const project=seed.creator.project,stage=project.targets.find(target=>target.isStage),id='result_evidence_other';
  stage.variables[id]=['resultOtherTicks',0];
  stage.blocks.result_other_hat={opcode:'event_whenflagclicked',parent:null,next:'result_other_forever',inputs:{},fields:{},topLevel:true,shadow:false,x:500,y:10};
  stage.blocks.result_other_forever={opcode:'control_forever',parent:'result_other_hat',next:null,inputs:{SUBSTACK:[2,'result_other_tick']},fields:{},topLevel:false,shadow:false};
  stage.blocks.result_other_tick={opcode:'data_changevariableby',parent:'result_other_forever',next:null,inputs:{VALUE:[1,[4,'1']]},fields:{VARIABLE:['resultOtherTicks',id]},topLevel:false,shadow:false};
  const buffer=Buffer.from(await(await seed.creator.generateSB3()).arrayBuffer());
  await vm.loadProject(buffer);if(project.stc)runtime.stc=project.stc;runtime.currentStepTime=1000/30;vm.greenFlag();await stepFrames(vm,10);
  const observed=Object.fromEntries(runtime.targets.flatMap(target=>Object.values(target.variables)).map(variable=>[variable.name,BW.decode(variable.value)]));
  return {vm,errors,facts,observed,marker,close(){
   if(facts.row)facts.category.blocks.splice(facts.index,0,facts.row);
   if(facts.originalTable)runtime._primitives=facts.originalTable;
   if(ownPrepare)Object.defineProperty(manager,'_prepareBlockInfo',ownPrepare);else delete manager._prepareBlockInfo;
   if(ownLookup)Object.defineProperty(runtime,'getOpcodeFunction',ownLookup);else delete runtime.getOpcodeFunction;
   vm.stopAll();vm.quit();clearStrayTimers();
  }};
 }catch(error){if(vm){vm.stopAll();vm.quit();}throw error;}finally{if(seed){seed.vm.stopAll();seed.vm.quit();}clearStrayTimers();}
}

test('source Number result evidence refuses changed implementation, arithmetic plus and unknown selectors without lending Array input authority',async()=>{
 // Pure producer anchor/idempotence controls do not execute a VM or bless a
 // caller table; the real VM cases below require the installed actual hook.
 const producer=readFileSync(new URL('../scripts/apply-vm-overlay.mjs',import.meta.url),'utf8');
 const begin=producer.indexOf('function patchExtensionResultOrigins(source) {'),end=producer.indexOf("\nlet rt = readFileSync(runtimePath, 'utf8');",begin);
 assert.ok(begin>=0&&end>begin);
 const patch=new Function('return ('+producer.slice(begin,end)+'\n);')();
 const sample='class Runtime extends EventEmitter {\nconstructor(){super();\n        this._primitives = {};\n        this._blockInfo = [];\n}\nregister(categoryInfo){\n        this._blockInfo.push(categoryInfo);\n}\nfill(categoryInfo){\n        categoryInfo.blocks = [];\n}\n}\nmodule.exports = Runtime;';
 const patched=patch(sample);assert.equal(patch(patched),patched,'Runtime origin patch is exactly idempotent');
 for(const anchor of ['class Runtime extends EventEmitter {','        this._primitives = {};','        this._blockInfo = [];','        this._blockInfo.push(categoryInfo);','        categoryInfo.blocks = [];','module.exports = Runtime;'])
  assert.throws(()=>patch(sample.replace(anchor,'')),/origin anchor differs/);
 assert.throws(()=>patch(patched.replace('const bwResultPrimitiveTable = {};','')),/origin patch is incomplete/);
 const NativeRuntime=require(root+'/engine/runtime.js'),originProperty=Object.getOwnPropertyDescriptor(NativeRuntime,'sourceResultOrigins');
 assert.equal(originProperty.writable,false);assert.equal(originProperty.configurable,false);
 assert.equal(NativeRuntime.sourceResultOrigins({}),null,'no arbitrary runtime origin');
 const native=new VM();
 try{
  const fakeCategory=new Proxy({},{});
  native.runtime._fillExtensionCategory(fakeCategory,{id:'callerCategory',blocks:[],menus:{},customFieldTypes:{}});
  assert.equal(NativeRuntime.sourceResultOrigins(native.runtime,fakeCategory),null,'public fill cannot issue a caller-supplied category origin');
 }finally{native.stopAll();native.quit();clearStrayTimers();}
 const original='let rows=[5];let entered=0;let seen=99;function hold(value:number){entered+=1;seen=value;}hold(rows&1);';
 const imported=importProjectFiles({'main.ts':original},{target:'arcade'});assert.deepEqual(imported.unsupported,[]);assert.deepEqual(imported.warnings,[]);
 for(const mutation of ['changed primitive','arithmetic plus','unknown selector']){
  let run,restore=()=>{},changedCalls=0;
  try{
   run=await runProgram(imported.code,{frames:0,countExtensionCalls:false});
   const runtime=run.vm.runtime,stage=runtime.targets.find(target=>Object.values(target.blocks._blocks).some(block=>block.opcode==='arcade_sourceValueBinary'));
   const sourceBlock=Object.values(stage.blocks._blocks).find(block=>block.opcode==='arcade_sourceValueBinary');assert.ok(sourceBlock);
   run.vm.stopAll();
   if(mutation==='changed primitive'){
    const original=runtime._primitives.arcade_sourceValueBinary;assert.equal(typeof original,'function');
    runtime._primitives.arcade_sourceValueBinary=()=>{changedCalls++;return 0;};
    restore=()=>{runtime._primitives.arcade_sourceValueBinary=original;};
   }else{
    const project=JSON.parse(run.vm.toJSON()),target=project.targets.find(target=>Object.values(target.blocks).some(block=>block.opcode==='arcade_sourceValueBinary'));
    const operation=Object.values(target.blocks).find(block=>block.opcode==='arcade_sourceValueBinary');
    operation.fields.OP[0]=mutation==='arithmetic plus'?'+':'~';
    await run.vm.loadProject(JSON.stringify(project));if(run.creator.project.stc)runtime.stc=run.creator.project.stc;
   }
   run.errors.length=0;run.vm.greenFlag();
   await stepFrames(run.vm,8);
   const observed=Object.fromEntries(runtime.targets.flatMap(target=>Object.values(target.variables)).map(variable=>[variable.name,BW.decode(variable.value)]));
   assert.equal(observed.entered,0,mutation);assert.equal(observed.seen,99,mutation);assert.equal(run.errors.length,1,mutation);
   if(mutation==='changed primitive'){assert.equal(changedCalls,1);assert.match(run.errors[0],/connected input lacks complete primitive domain evidence/);}
   if(mutation==='arithmetic plus')assert.match(run.errors[0],/connected input lacks complete primitive domain evidence/);
   if(mutation==='unknown selector')assert.match(run.errors[0],/unsupported fixed binary operator/);
  }finally{restore();if(run){run.vm.stopAll();run.vm.quit();}clearStrayTimers();}
 }
 const input='let rows=[5];let entered=0;let seen=99;function hold(value:number){entered+=1;seen=value;}hold(rows&1);';
 for(const mode of ['redirect metadata','delegate ABA','primitive ABA','proxy table capture','late duplicate','late row removal']){
  const run=await resultEvidenceFixture(input,{mode});
  try{
   assert.equal(run.facts.fired,true,mode);if(['redirect metadata','delegate ABA','primitive ABA'].includes(mode))assert.equal(run.facts.redirectCalls,1,mode);
   if(mode==='proxy table capture')assert.notEqual(run.facts.trapFired,true,'replaced table is refused before its descriptor trap can run');
   assert.equal(run.observed.entered,0,mode);assert.equal(run.observed.seen,99,mode);assert.ok(run.observed.resultOtherTicks>0,mode);
   assert.equal(run.errors.length,1,mode);assert.match(run.errors[0],/connected input lacks complete primitive domain evidence/,mode);
  }finally{run.close();}
 }
 const score=await resultEvidenceFixture('let entered=0;let seen=99;info.setScore(35);function hold(value:number){entered+=1;seen=value;}hold(info.score());',{mode:'source lookup throw'});
 try{
  assert.equal(score.facts.fired,true);assert.equal(score.facts.thrown,score.marker);assert.deepEqual(score.errors,[]);
  assert.equal(score.observed.entered,1);assert.equal(score.observed.seen,35);assert.ok(score.observed.resultOtherTicks>0);
 }finally{score.close();}

});

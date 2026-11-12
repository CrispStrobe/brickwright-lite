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

test('actual owned Array addition renders primitive elements, holes and nested allocated bodies in both operand orders',async()=>{
 // Actual module/adapter sources load in a metadata realm without WeakRef.
 // Only that real module dependency is redirected; no service or ctor is mocked.
 const opsSource=readFileSync(root+'/util/bw-array-operations.js','utf8');
 const opsRequire=createRequire(root+'/util/bw-array-operations.js');
 const absentRealm=createContext({module:{exports:{}},require:opsRequire,WeakRef:undefined});
 runInContext(opsSource,absentRealm,{filename:'bw-array-operations.js'});
 const absentOps=absentRealm.module.exports;
 const adapterRequire=createRequire(root+'/extensions/crispstrobe/adapter.js');
 const adapterRealm=createContext({module:{exports:{}},WeakRef:undefined,require:specifier=>
  specifier==='../../util/bw-array-operations'?absentOps:adapterRequire(specifier)});
 runInContext(readFileSync(root+'/extensions/crispstrobe/adapter.js','utf8'),adapterRealm,{filename:'adapter.js'});
 const AbsentCtor=adapterRealm.module.exports(source,null,absentOps.registerSource(source));
 const absentMetadata=new AbsentCtor();assert.equal(absentMetadata.getInfo().id,'arrays');
 assert.throws(()=>absentMetadata.createReference({VALUES:'[5]'},{}),/permanently inert/);
 let getterCalls=0;const metadataBindings=[];
 for(const initial of [undefined,{}, {targets:[]}, Object.defineProperty({},'targets',{get(){getterCalls++;throw new Error('metadata getter');}})]){
  const metadata=new RegisteredArrays(initial);assert.equal(metadata.getInfo().id,'arrays');
  const service=ops.bind(initial,ops.registerSource(source),source,()=>metadata);
  for(const method of ['begin','access','primitive','finish'])assert.throws(()=>service[method](),/permanently inert/);
  metadataBindings.push({metadata,service});
 }
 const actual=await fixture({registered:true});try{
  clean(actual);assert.equal(actual.stage.variables.result.value,'5');
  const absentValidMetadata=new AbsentCtor(actual.runtime);assert.equal(absentValidMetadata.getInfo().id,'arrays');
  absentRealm.WeakRef=WeakRef;
  absentMetadata.runtime=actual.runtime;absentMetadata._inst._runtime=actual.runtime;
  for(const metadata of [absentMetadata,absentValidMetadata,new AbsentCtor(actual.runtime)]){
   assert.equal(metadata.getInfo().id,'arrays');
   assert.throws(()=>metadata.createReference({VALUES:'[5]'},actual.saved.util),/permanently inert/);
  }
  for(const {metadata,service} of metadataBindings){
   metadata.runtime=actual.runtime;metadata._inst._runtime=actual.runtime;
   assert.throws(()=>metadata.createReference({VALUES:'[5]'},actual.saved.util),/permanently inert/);
   for(const method of ['begin','access','primitive','finish'])assert.throws(()=>service[method](),/permanently inert/);
  }
 }finally{actual.close();}
 assert.equal(getterCalls,0,'metadata shape check does not invoke targets getter');
 for(const value of [[5],[],[null,1,true,'x'],[1,[2,null,[3]],4]])for(const reverse of [false,true]){
  const run=await fixture({value,reverse,text:'!'});try{clean(run);assert.equal(run.stage.variables.result.value,reverse?'!'+String(value):String(value)+'!');}finally{run.close();}
 }
 const legacy=await fixture({unregistered:true});try{clean(legacy);assert.equal(legacy.stage.variables.result.value,'[object Object]','default adapter retains its existing no-loan behavior');}finally{legacy.close();}
 const run=await fixture({value:[1,2,3],prepare:({body})=>{delete body[1];body[2]=BW.UNDEFINED;}});
 try{clean(run);assert.equal(run.stage.variables.result.value,'1,,');}finally{run.close();}
});
test('actual nested aliases and active-path cycles preserve JavaScript Array string semantics',async()=>{
 const run=await fixture({value:[[2,3]],prepare:({runtime,body})=>{const child=body[0];body.push(child);body.push(BW.arrayReference(runtime,body));}});
 try{clean(run);const ordinary=[[2,3]];ordinary.push(ordinary[0]);ordinary.push(ordinary);assert.equal(run.stage.variables.result.value,String(ordinary));}finally{run.close();}
 const copied=await fixture({prepare:({stage})=>{stage.variables.array.value=BW.decode(JSON.parse(JSON.stringify(stage.variables.array.value)));}});try{clean(copied);assert.equal(copied.stage.variables.result.value,'5');}finally{copied.close();}
 const special=await fixture({prepare:({body})=>{body.splice(0,body.length,NaN,Infinity,-Infinity,-0,Object.freeze({bwNumber:'NaN'}),Object.freeze({bwUndefined:true}));}});
 try{clean(special);assert.equal(special.stage.variables.result.value,String([NaN,Infinity,-Infinity,-0,NaN,undefined]));}finally{special.close();}
 const parsed=await fixture({value:[[{bwNumber:'NaN'},{bwUndefined:true}]]});
 try{clean(parsed);assert.equal(parsed.stage.variables.result.value,'NaN,');}finally{parsed.close();}
 // A real cache-miss branch of BW.decode returns the incoming copy. This
 // profile does not call that mutable unknown object native provenance.
 const missed=await fixture({prepare:({stage})=>{
  const raw=JSON.parse(JSON.stringify(stage.variables.array.value));
  const get=Object.getOwnPropertyDescriptor(Map.prototype,'get');let bypassed=false;
  Object.defineProperty(Map.prototype,'get',{...get,value:function(key){
   if(!bypassed&&key===JSON.stringify([raw.bwReference.scope,'array',raw.bwReference.id])){bypassed=true;return undefined;}
   return Reflect.apply(get.value,this,[key]);
  }});
  try{stage.variables.array.value=BW.decode(raw);assert.equal(stage.variables.array.value,raw);assert.equal(bypassed,true);}
  finally{Object.defineProperty(Map.prototype,'get',get);}
 }});
 try{refused(missed);assert.match(missed.errors[0].message,/mutable metadata.*native allocation/);}finally{missed.close();}
});
test('copied args or utility cannot acquire an Array primitive loan from a real cached call',async()=>{
 for(const key of ['copyArgs','copyUtil']){const run=await fixture({[key]:true});try{refused(run);assert.match(run.errors[0].message,/current operation|current cached/);}finally{run.close();}}
});
test('foreign, stale, malformed and unowned nested backing values refuse before publication',async()=>{
 const origin=await fixture();try{
  const foreign=origin.stage.variables.array.value;
  for(const prepare of [({body})=>body.push(foreign),({body})=>body.push({bwReference:{...foreign.bwReference,extra:1}}),({body})=>body.push([]),({body})=>body.push({bwNumber:'NaN',extra:1})]){
   const run=await fixture({prepare});try{refused(run);}finally{run.close();}
  }
  origin.vm.stopAll();const stale=await fixture({prepare:({body})=>body.push(foreign)});try{refused(stale);}finally{stale.close();}
 }finally{origin.close();}
 // The last raw reflection trap arms a native map hook. A closed lookup
 // consumes only primitive identity, so the hook must never substitute a body.
 for(const innerProxy of [false,true]){
  let hookCalls=0,armed=false;const get=Object.getOwnPropertyDescriptor(Map.prototype,'get');
  const run=await fixture({prepare:({stage,body})=>{
   const foreign={kind:'array',id:'foreign-array',scope:stage.variables.array.value.bwReference.scope};
   const arm=()=>{if(!armed){armed=true;Object.defineProperty(Map.prototype,'get',{...get,value:function(key){
    if(key==='foreign-array'){hookCalls++;Object.defineProperty(Map.prototype,'get',get);return body;}
    return Reflect.apply(get.value,this,[key]);
   }});}};
   const handler={isExtensible(target){arm();return Reflect.isExtensible(target);},ownKeys(target){arm();return Reflect.ownKeys(target);},getOwnPropertyDescriptor(target,key){arm();return Reflect.getOwnPropertyDescriptor(target,key);},getPrototypeOf(target){arm();return Reflect.getPrototypeOf(target);}};
   stage.variables.array.value=innerProxy?{bwReference:new Proxy(foreign,handler)}:new Proxy({bwReference:foreign},handler);
  },after:()=>Object.defineProperty(Map.prototype,'get',get)});
  try{refused(run);assert.equal(hookCalls,0,'no mutable heap get is used for a raw foreign identity');assert.equal(armed,true);}finally{Object.defineProperty(Map.prototype,'get',get);run.close();}
 }
 const unowned=await fixture({unregistered:true});try{
  const foreign=unowned.stage.variables.array.value,lookup=BW.arrayValue;let lookupCalls=0;
  const run=await fixture({prepare:({body,stage,runtime})=>{stage.variables.array.value=foreign;BW.arrayValue=(actual,raw)=>{if(actual===runtime&&raw===foreign){lookupCalls++;return body;}return lookup(actual,raw);};},after:()=>{BW.arrayValue=lookup;}});
  try{refused(run);assert.equal(lookupCalls,0,'mutable lookup does not run before refusal');}finally{BW.arrayValue=lookup;run.close();}
 }finally{unowned.close();}
});
test('accessors, custom prototypes and opaque resource elements never gain Array coercion effects',async()=>{
 let decodeCalls=0,speciesCalls=0;const foreign=[99],decode=BW.decode,some=Object.getOwnPropertyDescriptor(Array.prototype,'some'),constructor=Object.getOwnPropertyDescriptor(Array.prototype,'constructor');
 const decodeRun=await fixture({literalCoerce:()=>{Object.defineProperty(Array.prototype,'some',{...some,value:()=>false});BW.decode=()=>{decodeCalls++;BW.decode=decode;Object.defineProperty(Array.prototype,'some',some);return foreign;};},literalAfter:()=>{BW.decode=decode;Object.defineProperty(Array.prototype,'some',some);}});
 try{refused(decodeRun);assert.equal(decodeCalls,0,'temporary foreign decoder is not invoked');assert.deepEqual(foreign,[99]);assert.deepEqual(decodeRun.effects,['literal-conversion']);}finally{BW.decode=decode;Object.defineProperty(Array.prototype,'some',some);decodeRun.close();}
 const speciesRun=await fixture({literalCoerce:()=>Object.defineProperty(Array.prototype,'constructor',{...constructor,value:{[Symbol.species]:function(){speciesCalls++;Object.defineProperty(Array.prototype,'constructor',constructor);return foreign;}}}),literalAfter:()=>Object.defineProperty(Array.prototype,'constructor',constructor)});
 try{refused(speciesRun);assert.equal(speciesCalls,0,'no foreign species allocation');assert.deepEqual(foreign,[99]);}finally{Object.defineProperty(Array.prototype,'constructor',constructor);speciesRun.close();}
 for(const [object,key] of [[Map.prototype,'get'],[WeakMap.prototype,'get']]){
  const descriptor=Object.getOwnPropertyDescriptor(object,key),foreign=[99];let armed=false,calls=0;
  const run=await fixture({literalRaw:({effects})=>{
   const raw={toString(){effects.push('literal-conversion');armed=true;return '[[5]]';}};
   return new Proxy(raw,{ownKeys(target){
    if(armed)Object.defineProperty(object,key,{...descriptor,value:function(actual){
     calls++;Object.defineProperty(object,key,descriptor);return foreign;
    }});
    return Reflect.ownKeys(target);
   }});
  },literalAfter:()=>Object.defineProperty(object,key,descriptor)});
  try{refused(run);assert.equal(armed,true);assert.ok(calls<=1,'a transient hook cannot enroll its foreign result');assert.deepEqual(foreign,[99]);}
  finally{Object.defineProperty(object,key,descriptor);run.close();}
 }
 let inheritedCalls=0,ownGetterCalls=0,installed=false;
 const inherited=Object.getOwnPropertyDescriptor(Object.prototype,'value');
 const restoreInherited=()=>{if(inherited)Object.defineProperty(Object.prototype,'value',inherited);else delete Object.prototype.value;};
 const inheritedRun=await fixture({value:[[{bwNumber:'NaN'},{bwNumber:'NaN'}]],prepare:({body})=>{
  Object.defineProperty(body[0][1],'bwNumber',{get(){ownGetterCalls++;return 'NaN';},enumerable:true,configurable:true});
  body[0][0]=new Proxy(Object.freeze({bwNumber:'NaN'}),{getPrototypeOf(target){
   if(!installed){installed=true;Object.defineProperty(Object.prototype,'value',{configurable:true,get(){
    inheritedCalls++;restoreInherited();return 'NaN';
   }});}
   return Reflect.getPrototypeOf(target);
  }});
 },after:restoreInherited});
 try{refused(inheritedRun);assert.equal(installed,true);assert.equal(inheritedCalls,0,'an inherited descriptor value getter is never authority');assert.equal(ownGetterCalls,0,'actual accessor is not evaluated');}
 finally{restoreInherited();inheritedRun.close();}
 let invoked=0;
 for(const prepare of [({body})=>Object.defineProperty(body,'0',{get(){invoked++;return 5;},configurable:true}),({body})=>Object.setPrototypeOf(body,{}),({body})=>body.push({toString(){invoked++;return 'forged';}}),({body})=>body.push({bwReference:{kind:'image',scope:'foreign',id:'image'}}),({body})=>body.push({bwNumber:'NaN'}),({body})=>body.push({bwUndefined:true})]){
  const run=await fixture({prepare});try{refused(run);assert.equal(invoked,0);}finally{run.close();}
 }
});
test('other operand conversion runs once and the postcall fence refuses backing or graph changes',async()=>{
 for(const coerce of [({body})=>{body[0]=6;},({runtime})=>{const b=Object.values(runtime.getTargetForStage().blocks._blocks).find(b=>b.opcode==='arrays_valueBinary');b.fields.OP.value='-';}]){
  const run=await fixture({coerce});try{refused(run);assert.deepEqual(run.effects,['other-conversion']);assert.match(run.errors[0].message,/primitive backing changed|cached operation graph changed/);}finally{run.close();}
 }
 for(const [object,key,replacement] of [[WeakMap.prototype,'get',()=>undefined],[Object,'freeze',()=>({status:'throw'})],[Function.prototype,'call',()=>{throw new Error('foreign call');}],[WeakRef.prototype,'deref',()=>[]]]){
  const saved=Object.getOwnPropertyDescriptor(object,key);
  const run=await fixture({coerce:()=>Object.defineProperty(object,key,{...saved,value:replacement}),after:()=>Object.defineProperty(object,key,saved)});
  try{refused(run);assert.deepEqual(run.effects,['other-conversion']);assert.match(run.errors[0].message,/intrinsic surface changed/);}finally{Object.defineProperty(object,key,saved);run.close();}
 }
 for(const prepare of [({body})=>{Object.setPrototypeOf(body,{});},({body})=>{Object.setPrototypeOf(body[1],{});},({body})=>{Object.setPrototypeOf(body[1].bwReference,{});}]){
  const run=await fixture({prepare:({body,stage})=>body.push(BW.decode(JSON.parse(JSON.stringify(stage.variables.array.value)))),coerce:({body})=>prepare({body})});
  try{refused(run);assert.match(run.errors[0].message,/primitive backing changed/);}finally{run.close();}
 }
 const encoded=await fixture({prepare:({body})=>body.push(Object.freeze({bwNumber:'NaN'})),coerce:({body})=>Object.setPrototypeOf(body[1],{})});
 try{refused(encoded);assert.ok(encoded.errors[0] instanceof TypeError,'immutable box prototype cannot change');}finally{encoded.close();}
 // Initial rendering observes element 5. A later reflection of the raw
 // reference changes it to 6; the original render rows must expire.
 for(const trap of ['getOwnPropertyDescriptor','getPrototypeOf']){
  let fired=false,armed=false;
  const run=await fixture({coerce:()=>{armed=true;},prepare:({stage,body})=>{
   const reference=Object.freeze({bwReference:Object.freeze({...stage.variables.array.value.bwReference})});
   stage.variables.array.value=new Proxy(reference,{[trap](target,key){
    if(armed&&!fired){fired=true;body[0]=6;}
    return trap==='getPrototypeOf'?Reflect.getPrototypeOf(target):Reflect.getOwnPropertyDescriptor(target,key);
   }});
  }});
  try{refused(run);assert.equal(fired,true);}finally{run.close();}
 }
 // Right-reference reflection is still user-observable even when its own
 // shape is immutable. Mutate a left backing only on the later observation,
 // after both loans have rendered. The all-loan native barrier must catch it.
 let rightObservations=0,crossMutation=false;
 const cross=await fixture({arrayRight:true,prepare:({stage,body})=>{
  const tuple=Object.freeze({...stage.variables.right.value.bwReference});
  const right=Object.freeze({bwReference:tuple});
  stage.variables.right.value=new Proxy(right,{getPrototypeOf(target){
   rightObservations++;if(rightObservations===3){crossMutation=true;body[0]=6;}
   return Reflect.getPrototypeOf(target);
  }});
 }});
 try{refused(cross);assert.equal(crossMutation,true,'actual later right observation ran');assert.equal(cross.body[0],6);assert.match(cross.errors[0].message,/backing changed/);}finally{cross.close();}
 let encodedObservation=0,encodedMutation=false;
 const encodedCross=await fixture({value:[[{bwNumber:'NaN'}]],prepare:({stage,body})=>{
  const tuple=Object.freeze({...stage.variables.array.value.bwReference});
  const reference=Object.freeze({bwReference:tuple});
  body.push(new Proxy(reference,{getPrototypeOf(target){
   encodedObservation++;if(encodedObservation===2){encodedMutation=true;body[0][0].bwNumber='Infinity';}
   return Reflect.getPrototypeOf(target);
  }}));
 }});
 try{refused(encodedCross);assert.equal(encodedMutation,true,'later Proxy observation changed the earlier parsed box');assert.match(encodedCross.errors[0].message,/backing changed/);}finally{encodedCross.close();}
 const marker=new Error('exact other operand exception');const run=await fixture({coerce:()=>{throw marker;}});
 try{refused(run);assert.equal(run.errors[0],marker);assert.deepEqual(run.effects,['other-conversion']);}finally{run.close();}
});
test('returned or stopped args and reentrant direct calls do not retain primitive authority',async()=>{
 const run=await fixture();try{clean(run);const {args,util}=run.saved;assert.throws(()=>run.original(args,util),/current operation/);run.vm.stopAll();assert.throws(()=>run.original(args,util),/current operation/);}finally{run.close();}
 let attempts=0;const reentrant=await fixture({coerce:({original,args,util})=>{attempts++;original(args,util);}});
 try{refused(reentrant);assert.equal(attempts,1);assert.match(reentrant.errors[0].message,/reentered/);}finally{reentrant.close();}
});
test('explicit primitive traversal bounds refuse huge or deep bodies rather than generic fallback',async()=>{
 let deep=[1];for(let i=0;i<130;i++)deep=[deep];
 const depthRun=await fixture({value:deep});try{refused(depthRun);assert.match(depthRun.errors[0].message,/graph bound/);}finally{depthRun.close();}
 for(const prepare of [({body})=>{body.length=65537;},({body})=>{body[0]='x'.repeat(1024*1024+1);},({body})=>{body[0]=Object.freeze({bwUndefined:false});}]){
  const run=await fixture({prepare});try{refused(run);assert.match(run.errors[0].message,/bound|owned conversion/);}finally{run.close();}
 }
});

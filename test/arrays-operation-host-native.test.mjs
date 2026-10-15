import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {INTEGRATED,importGuiDependency} from './helpers/bw-integrated.mjs';
const require=createRequire(import.meta.url),root=INTEGRATED+'/node_modules/scratch-vm/src';
const VM=(await importGuiDependency('scratch-vm/src/index.js')).default;
const makeArrays=require(root+'/extensions/crispstrobe/adapter.js'),BW=require(root+'/util/bw-values.js'),ops=require(root+'/util/bw-array-operations.js'),exceptions=require(root+'/util/bw-arcade-exceptions.js'),primitiveOwner=require(root+'/util/bw-primitive-owner.js');
const source=readFileSync(process.env.BW_ARRAY_NUMBER_VALUE_SOURCE,'utf8');
for(const file of ['bw-array-operations.js','bw-primitive-owner.js','bw-arcade-exceptions.js'])assert.equal(readFileSync(root+'/util/'+file,'utf8'),readFileSync(new URL('../overlay/scratch-vm/src/util/'+file,import.meta.url),'utf8'));
async function fixture(mode='normal',options={}){
 const vm=new VM(),runtime=vm.runtime,errors=[],captures=[],refusals=[];runtime.on('BLOCKS_ERROR',error=>errors.push(error));
 let owner;const arrays=new(makeArrays(source,null,ops.registerSource(source)))(runtime);let saved;
 let reentryArgs,reentryUtil;const originalLength=arrays.length;arrays.length=(args,util)=>{reentryArgs=args;reentryUtil=util;return originalLength(args,util);};
 const original=arrays.referenceLength;
 arrays.referenceLength=(args,util)=>{saved={args,util};captures.push(args.ARRAY);if(options.copyArgs||options.copyUtil){try{original(options.copyArgs?{...args}:args,options.copyUtil?{...util}:util);assert.fail('copied operation accepted');}catch(error){assert.match(error.message,/current operation/);refusals.push(error);}}if(options.foreignSignal){assert.throws(()=>owner.rejectArrayOperation(args,util,options.foreignSignal,{}),error=>error===options.foreignSignal);}if(options.arbitraryFailure){assert.throws(()=>owner.rejectArrayOperation(args,util,new Error('arbitrary'),{}),/private.*lease|actual.*lease/);}return original(args,util);};
 let childId,cleanups=0;const bridge={getInfo:()=>({id:'arcade',name:'Native test invocation',blocks:[{opcode:'callFunction',blockType:'command',text:'invoke'}]}),callFunction(args,util){const child=runtime._pushThread(childId,util.target,{stackClick:false});owner.link(child,util.thread,()=>cleanups++);primitiveOwner.stepNested(util,args,child);const failure=owner.failure(child)||owner.failure(util.thread);if(failure)owner.rethrow(failure);}};const bs=vm.extensionManager._registerInternalExtension(bridge);vm.extensionManager._loadedExtensions.set('arcade',bs);
 const service=vm.extensionManager._registerInternalExtension(arrays);vm.extensionManager._loadedExtensions.set('arrays',service);
 const probe={getInfo:()=>({id:'hostprobe',name:'Host probe',blocks:[{opcode:'change',blockType:'command',text:'change'},{opcode:'name',blockType:'reporter',text:'name'}]}),name(){return{toString(){return arrays.length(reentryArgs,reentryUtil);}};},change(_args,util){const cell=util.target.variables.array;
  if(mode==='copy')cell.value=JSON.parse(JSON.stringify(cell.value));
  if(mode==='malformed'||mode==='nested')cell.value={bwReference:{...cell.value.bwReference,extra:1}};
  if(mode==='foreign')cell.value=typeof options.foreign==='function'?options.foreign(runtime):options.foreign;
 }};
 const ps=vm.extensionManager._registerInternalExtension(probe);vm.extensionManager._loadedExtensions.set('hostprobe',ps);
 const blocks={},variables={array:['array',0],result:['result',-1],after:['after',0],ticks:['ticks',0]};let serial=0;
 const add=(opcode,parent,next=null,inputs={},fields={},shadow=false)=>{const id='b'+serial++;blocks[id]={opcode,parent,next,inputs,fields,shadow,topLevel:parent===null,...(parent===null?{x:0,y:0}:{})};return id;};
 const text=(v,p)=>add('text',p,null,{}, {TEXT:[String(v),null]},true),variable=p=>add('data_variable',p,null,{}, {VARIABLE:['array','array']});
 const hat=add('event_whenflagclicked',null),setup=add('data_setvariableto',hat,null,{}, {VARIABLE:['array','array']});blocks[hat].next=setup;
 const create=add('arrays_createReference',setup);blocks[setup].inputs.VALUE=[1,create];blocks[create].inputs.VALUES=[1,text('[1,2]',create)];
 const change=add('hostprobe_change',setup);blocks[setup].next=change;
 const result=add('data_setvariableto',change,null,{}, {VARIABLE:['result','result']});blocks[change].next=result;
 const length=add('arrays_referenceLength',result);blocks[result].inputs.VALUE=[1,length];blocks[length].inputs.ARRAY=[1,variable(length)];
 if(mode==='reentry'){blocks[length].opcode='arrays_length';blocks[length].inputs={NAME:[1,add('hostprobe_name',length)]};}
 if(mode==='escape'){blocks[setup].opcode='arrays_create1D';blocks[setup].fields={};blocks[setup].inputs={NAME:[1,text('owned',setup)],JSON:[1,text('[1,2]',setup)]};blocks[length].opcode='arrays_map';blocks[length].inputs={NAME:[1,text('owned',length)],FUNC:[1,text('(value)=>{globalThis.__arrayEscapeRan=true;return value}',length)]};}
 const after=add('data_setvariableto',result,null,{}, {VARIABLE:['after','after']});blocks[result].next=after;blocks[after].inputs.VALUE=[1,text('1',after)];
 if(mode==='nested'){const call=add('arcade_callFunction',setup);blocks[setup].next=call;blocks[call].next=after;childId=change;blocks[change].parent=null;blocks[change].topLevel=true;blocks[result].next=null;}
 const independent=add('event_whenflagclicked',null),forever=add('control_forever',independent);blocks[independent].next=forever;
 const tick=add('data_changevariableby',forever,null,{}, {VARIABLE:['ticks','ticks']});blocks[forever].inputs.SUBSTACK=[2,tick];blocks[tick].inputs.VALUE=[1,text('1',tick)];
 const project={targets:[{isStage:true,name:'Stage',variables,lists:{},broadcasts:{},blocks,comments:{},costumes:[{assetId:'cd21514d0531fdffb22204e0ec5ed84a',name:'backdrop',dataFormat:'svg',md5ext:'cd21514d0531fdffb22204e0ec5ed84a.svg',rotationCenterX:240,rotationCenterY:180}],sounds:[],currentCostume:0,volume:100,layerOrder:0}],monitors:[],extensions:['arrays','hostprobe'],meta:{semver:'3.0.0',vm:'0.2.0',agent:''}};
 await vm.loadProject(JSON.stringify(project));owner=exceptions.create(runtime,args=>args.VALUE);runtime.currentStepTime=1000/30;
 const step=async()=>{for(let i=0;i<4;i++){await runtime._step();await new Promise(resolve=>setImmediate(resolve));}};
 vm.greenFlag();await step();const stage=runtime.getTargetForStage();
 return{vm,runtime,arrays,original,stage,errors,captures,refusals,get cleanups(){return cleanups;},get saved(){return saved;},step,project,get owner(){return owner;},async restartWith(value){mode='foreign';options.foreign=value;vm.greenFlag();await step();},async reload(){mode='normal';await vm.loadProject(JSON.stringify(project));owner=exceptions.create(runtime,args=>args.VALUE);vm.greenFlag();await step();},close(){vm.stopAll();vm.quit();owner.dispose();}};
}
test('trusted actual registered Array factories preserve genuine serialized aliases and reject cached access',async()=>{
 for(const mode of ['normal','copy']){const run=await fixture(mode);try{
  assert.deepEqual(run.errors,[]);assert.equal(run.stage.variables.result.value,2);assert.equal(run.stage.variables.after.value,'1');
  const body=BW.arrayValue(run.runtime,run.stage.variables.array.value);assert.deepEqual(body,[1,2]);
  assert.throws(()=>run.original(run.saved.args,run.saved.util),/current operation/);
  assert.throws(()=>run.original({...run.saved.args},run.saved.util),/current operation/);
  assert.throws(()=>run.original(run.saved.args,{...run.saved.util}),/current operation/);
 }finally{run.close();}}
});
test('malformed raw tracked references terminate only the failing real VM fiber before downstream effects',async()=>{
 const run=await fixture('malformed');try{assert.equal(run.errors.length,1);assert.match(run.errors[0].message,/exact raw shape/);assert.equal(run.stage.variables.after.value,0);assert.equal(run.stage.variables.result.value,-1);const ticks=run.stage.variables.ticks.value;await run.step();assert.ok(run.stage.variables.ticks.value>ticks);assert.equal(run.errors.length,1);}finally{run.close();}
});
test('copied current args or util cannot borrow tracked Array access authority',async()=>{
 for(const options of [{copyArgs:true},{copyUtil:true}]){const run=await fixture('normal',options);try{assert.equal(run.stage.variables.after.value,'1');assert.equal(run.refusals.length,1);assert.deepEqual(run.errors,[]);}finally{run.close();}}
});
test('foreign references and new-runtime aliases of the same backing body remain foreign',async()=>{
 const origin=await fixture();try{const ref=origin.stage.variables.array.value,body=BW.arrayValue(origin.runtime,ref);
  for(const foreign of [ref,runtime=>BW.arrayReference(runtime,body)]){const run=await fixture('foreign',{foreign});try{assert.equal(run.stage.variables.after.value,0);assert.ok(run.errors.some(e=>/foreign or stale/.test(e.message)));}finally{run.close();}}
 }finally{origin.close();}
});
test('Stop revokes tracked bodies and actual successful project load can renew only new bodies',async()=>{
 const run=await fixture();try{const ref=run.stage.variables.array.value;run.vm.stopAll();assert.throws(()=>run.original({ARRAY:ref},run.saved.util),/current operation/);run.vm.greenFlag();await run.step();assert.deepEqual(run.errors,[]);assert.notEqual(run.stage.variables.array.value.bwReference.id,ref.bwReference.id);await run.reload();assert.deepEqual(run.errors,[]);const stage=run.runtime.getTargetForStage();assert.equal(stage.variables.result.value,2);assert.equal(stage.variables.after.value,'1');}finally{run.close();}
});
test('trusted source registration is not a project-supplied token or source label',()=>{
 const vm=new VM();try{assert.throws(()=>new(makeArrays(source,null,{}))(vm.runtime),/registration\/source/);assert.throws(()=>new(makeArrays(source+'\n',null,ops.registerSource(source)))(vm.runtime),/registration\/source/);}finally{vm.quit();}
});

test('arbitrary Errors without a private lease cannot retire a genuine current Array operation',async()=>{const run=await fixture('normal',{arbitraryFailure:true});try{assert.deepEqual(run.errors,[]);assert.equal(run.stage.variables.result.value,2);assert.equal(run.stage.variables.after.value,'1');}finally{run.close();}});

test('legacy JavaScript callbacks cannot observe an owned named Array before escape rejection',async()=>{delete globalThis.__arrayEscapeRan;const run=await fixture('escape');try{assert.equal(run.errors.length,1);assert.match(run.errors[0].message,/legacy callback/);assert.equal(globalThis.__arrayEscapeRan,undefined);assert.equal(run.stage.variables.after.value,0);assert.ok(run.stage.variables.ticks.value>0);}finally{run.close();delete globalThis.__arrayEscapeRan;}});
test('actual nested invocation rejection retires its caller and invokes cleanup once while unrelated fiber continues',async()=>{const run=await fixture('nested');try{assert.equal(run.errors.length,1);assert.match(run.errors[0].message,/exact raw shape/);assert.equal(run.cleanups,1);assert.equal(run.stage.variables.after.value,0);assert.equal(run.stage.variables.result.value,-1);const before=run.stage.variables.ticks.value;await run.step();assert.ok(run.stage.variables.ticks.value>before);assert.equal(run.cleanups,1);}finally{run.close();}});

test('same-thread synchronous reentry rejects the genuine live Array operation and preserves failure cleanup',async()=>{const run=await fixture('reentry');try{assert.equal(run.errors.length,1);assert.match(run.errors[0].message,/cannot be reentered/);assert.equal(run.stage.variables.after.value,0);assert.equal(run.stage.variables.result.value,-1);assert.ok(run.stage.variables.ticks.value>0);}finally{run.close();}});
test('default two-argument adapter and opt-in facade without a coordinator preserve unowned legacy operations',()=>{for(const host of [false,true]){const vm=new VM();try{const arrays=new(makeArrays(source,null,host?ops.registerSource(source):null))(vm.runtime);const ref=arrays.createReference({VALUES:'[20,"20"]'});assert.deepEqual(BW.arrayValue(vm.runtime,ref),[20,'20']);assert.equal(arrays.referenceLength({ARRAY:ref}),2);assert.equal(arrays.referenceIndexOf({ARRAY:ref,VALUE:'20'}),1);assert.equal(arrays.referenceLength({ARRAY:'not a reference'}),0);}finally{vm.quit();}}});

test('a fresh genuine operation after Start cannot revive a previously tracked reference',async()=>{const run=await fixture();try{const old=run.stage.variables.array.value;run.vm.stopAll();run.stage.variables.after.value=0;run.stage.variables.result.value=-1;await run.restartWith(old);assert.equal(run.errors.length,1);assert.match(run.errors[0].message,/foreign or stale/);assert.equal(run.stage.variables.after.value,0);assert.equal(run.stage.variables.result.value,-1);assert.equal(run.captures.length,2);assert.equal(run.captures[1],old);const ticks=run.stage.variables.ticks.value;await run.step();assert.ok(run.stage.variables.ticks.value>ticks);}finally{run.close();}});
test('disposed facade ignores GreenFlag until an actual new project load renews its source-bound owner',async()=>{const run=await fixture();try{const old=run.stage.variables.array.value;run.vm.clear();assert.doesNotThrow(()=>run.vm.greenFlag());assert.throws(()=>run.original({ARRAY:old},run.saved.util),/current operation/);await run.reload();assert.equal(run.runtime.getTargetForStage().variables.result.value,2);assert.equal(run.errors.length,0);}finally{run.close();}});

test('another runtime issued failure cannot be adopted as this runtime Array failure',async()=>{const origin=await fixture('malformed');try{const signal=origin.errors[0],run=await fixture('normal',{foreignSignal:signal});try{assert.deepEqual(run.errors,[]);assert.equal(run.stage.variables.result.value,2);assert.equal(run.stage.variables.after.value,'1');assert.equal(exceptions.diagnostic(run.runtime,signal),null);}finally{run.close();}}finally{origin.close();}});

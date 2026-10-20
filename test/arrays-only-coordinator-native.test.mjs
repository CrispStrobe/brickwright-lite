import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {runProgram,VM,stepFrames,clearStrayTimers,quitStrandedVMs} from './helpers/bw-vm.mjs';
import {VM_SRC,loadExtensionClass} from './helpers/bw-extensions.mjs';
const require=createRequire(import.meta.url);
const BW=require(VM_SRC+'/util/bw-values.js');
const primitiveOwner=require(VM_SRC+'/util/bw-primitive-owner.js');
const exceptions=require(VM_SRC+'/util/bw-arcade-exceptions.js');
const Arrays=require(VM_SRC+'/extensions/crispstrobe/arrays/index.js');
const Arcade=loadExtensionClass('arcade');
for(const name of ['bw-arcade-exceptions.js','bw-array-operations.js'])
    assert.equal(readFileSync(VM_SRC+'/util/'+name,'utf8'),readFileSync(new URL('../overlay/scratch-vm/src/util/'+name,import.meta.url),'utf8'),'actual installed '+name);
const code=`DEVICE ARCADE
GLOBAL alias
GLOBAL result
GLOBAL reverse
GLOBAL after
GLOBAL ticks
SPRITE Game:
WHEN flag clicked:
  new array "only"
  set alias to (reference to named array ("only"))
  set result to (calculate value (alias) op "+" with ("!"))
  set reverse to (calculate value ("!") op "+" with (alias))
  set after to 1
WHEN flag clicked:
  set ticks to 0
  forever:
    change ticks by 1`;
const cell=(run,name)=>run.vm.runtime.targets.flatMap(t=>Object.values(t.variables)).find(v=>v.name===name)?.value;
const close=vm=>{vm.stopAll();vm.quit();};

test('actual Arrays-only authored project executes named aliases and both text orders without Arcade startup',async()=>{
    let run;
    try {
        run=await runProgram(code,{frames:12});
        assert.deepEqual(run.creator.project.extensions,['arrays']);
        assert.equal(run.loadedExtensions.has('arrays'),true);
        assert.equal(run.loadedExtensions.has('arcade'),false);
        assert.deepEqual(run.creator.errors,[]);assert.deepEqual(run.creator.warnings,[]);
        assert.deepEqual(run.creator.unparsed,[]);assert.deepEqual(run.errors,[]);
        assert.deepEqual(BW.arrayValue(run.vm.runtime,cell(run,'alias')),[]);
        assert.equal(BW.decode(cell(run,'result')),'!');assert.equal(BW.decode(cell(run,'reverse')),'!');
        assert.equal(BW.decode(cell(run,'after')),1);assert.ok(BW.decode(cell(run,'ticks'))>0);
        assert.equal(exceptions.arrayCoordinatorReady(run.vm.runtime),true);
        assert.ok(run.calls.get('arrays_createEmpty')>0);assert.equal(run.calls.get('arrays_valueBinary'),2);
    } finally {if(run)close(run.vm);quitStrandedVMs();clearStrayTimers();}
});

test('actual Arrays and Arcade constructors share one core in both load orders and retain duplicate Arcade refusal',()=>{
    for(const order of ['arrays-first','arcade-first']) {
        const vm=new VM(),runtime=vm.runtime;
        try {
            if(order==='arrays-first'){new Arrays(runtime);new Arcade(runtime);}
            else {new Arcade(runtime);new Arrays(runtime);}
            assert.equal(exceptions.arrayCoordinatorReady(runtime),false);
            runtime.emit('PROJECT_START');assert.equal(exceptions.arrayCoordinatorReady(runtime),true);
            assert.throws(()=>new Arcade(runtime),/already has an owner/);
            assert.equal(exceptions.arrayCoordinatorReady(runtime),true,'duplicate claim cannot cancel the current owner');
            runtime.emit('PROJECT_STOP_ALL');assert.equal(exceptions.arrayCoordinatorReady(runtime),false);
            runtime.emit('PROJECT_START');assert.equal(exceptions.arrayCoordinatorReady(runtime),true);
            // This calls the actual Arcade PROJECT_LOADED dispose/create pair,
            // on either side of the Array listener's registration order.
            runtime.emit('PROJECT_LOADED');assert.equal(exceptions.arrayCoordinatorReady(runtime),false);
            runtime.emit('PROJECT_START');assert.equal(exceptions.arrayCoordinatorReady(runtime),true);
            assert.throws(()=>new Arcade(runtime),/already has an owner/);
        } finally {close(vm);runtime.emit('RUNTIME_DISPOSED');clearStrayTimers();}
    }
});

test('retired Arcade facet cannot borrow a new claim or inspect capability arguments',()=>{
    const vm=new VM(),runtime=vm.runtime;let reads=0;
    try {
        new Arrays(runtime);
        const reader=()=>{reads++;throw Error('reader must not run outside a physical Throw');};
        const first=exceptions.create(runtime,reader);runtime.emit('PROJECT_START');
        first.dispose();const second=exceptions.create(runtime,reader);runtime.emit('PROJECT_START');
        const poison=new Proxy({}, {get(){reads++;throw Error('retired argument observed');}});
        for(const method of ['link','linkPhysicalUpdate','raise','rejectArrayOperation','rejectPrimitiveFault','rejectConditionWait','rejectConstraint'])
            assert.throws(()=>first[method](poison,poison,poison),/owner is disposed/);
        assert.equal(first.captureCaller(poison,poison),null);assert.equal(first.capture(poison),null);
        assert.equal(first.current(poison),false);first.releaseCaller(poison);
        assert.equal(first.arrayReady(),false);assert.equal(second.arrayReady(),true);
        first.dispose();assert.equal(second.arrayReady(),true,'old disposal must not cancel the replacement');
        assert.equal(reads,0);second.dispose();
    } finally {close(vm);runtime.emit('RUNTIME_DISPOSED');clearStrayTimers();}
});

test('Array core attachment does not multiply lifecycle listeners and runtime disposal retires every facet',()=>{
    const vm=new VM(),runtime=vm.runtime;
    try {
        const initial=runtime.listenerCount('PROJECT_START');
        new Arrays(runtime);const once=runtime.listenerCount('PROJECT_START');
        new Arrays(runtime);const twice=runtime.listenerCount('PROJECT_START');
        assert.equal(once-initial,2,'one shared core and one binding listener');
        assert.equal(twice-once,1,'second actual binding adds no second coordinator core');
        const facet=exceptions.create(runtime,()=>{throw Error('no Throw input');});runtime.emit('PROJECT_START');
        assert.equal(facet.arrayReady(),true);runtime.emit('RUNTIME_DISPOSED');
        assert.equal(exceptions.arrayCoordinatorReady(runtime),false);assert.equal(facet.arrayReady(),false);
        runtime.emit('PROJECT_START');assert.equal(exceptions.arrayCoordinatorReady(runtime),false);
        assert.equal(facet.capture({}),null);assert.throws(()=>facet.link({},{}),/owner is disposed/);
    } finally {close(vm);clearStrayTimers();}
});

test('Arrays-only project stop and genuine SB3 reload acquire fresh ownership without loading Arcade',async()=>{
    let run;
    try {
        run=await runProgram(code,{frames:8});const runtime=run.vm.runtime;
        assert.deepEqual(run.errors,[]);const old=cell(run,'alias');
        run.vm.stopAll();assert.equal(exceptions.arrayCoordinatorReady(runtime),false);
        await run.vm.loadProject(run.buffer);assert.equal(exceptions.arrayCoordinatorReady(runtime),false);
        run.vm.greenFlag();await stepFrames(run.vm,8);
        assert.equal(exceptions.arrayCoordinatorReady(runtime),true);
        assert.equal(run.vm.extensionManager.isExtensionLoaded('arcade'),false);
        assert.notEqual(cell(run,'alias'),old,'new project does not retain old reference identity');
        assert.deepEqual(BW.arrayValue(runtime,cell(run,'alias')),[]);
        assert.equal(BW.decode(cell(run,'result')),'!');assert.equal(BW.decode(cell(run,'after')),1);
        assert.deepEqual(run.errors,[]);
    } finally {if(run)close(run.vm);quitStrandedVMs();clearStrayTimers();}
});

test('claim replacement during an actual thread frame callback cannot issue an old-facet promise lease',async()=>{
    let run,restore=()=>{},restoreLease=()=>{};
    try {
        run=await runProgram(code,{frames:0});const runtime=run.vm.runtime;
        const thread=runtime.threads.find(t=>t.stack.length>0);assert.ok(thread,'actual green-flag thread');
        const first=exceptions.create(runtime,()=>{throw Error('no Throw input');});
        const priorActive=runtime.sequencer.activeThread,own=Object.getOwnPropertyDescriptor(thread,'peekStackFrame');
        const original=thread.peekStackFrame;let second,calls=0;
        restore=()=>{runtime.sequencer.activeThread=priorActive;if(own)Object.defineProperty(thread,'peekStackFrame',own);else delete thread.peekStackFrame;};
        runtime.sequencer.activeThread=thread;
        thread.peekStackFrame=function(){
            calls++;first.dispose();second=exceptions.create(runtime,()=>{throw Error('replacement reader');});
            runtime.emit('PROJECT_START');
            return Reflect.apply(original,this,[]);
        };
        assert.equal(first.capture(thread),null,'no lease may escape after callback replacement');
        restore();assert.equal(calls,1);assert.equal(first.current({}),false);
        assert.equal(second.arrayReady(),true);assert.equal(exceptions.arrayCoordinatorReady(runtime),true);
        first.dispose();assert.equal(second.arrayReady(),true);
        runtime.sequencer.activeThread=thread;
        const lease=second.capture(thread);assert.ok(lease,'actual active thread lease');
        const frames=thread.stackFrames,ownIncludes=Object.getOwnPropertyDescriptor(frames,'includes');let leaseCallbacks=0,third;
        restoreLease=()=>{if(ownIncludes)Object.defineProperty(frames,'includes',ownIncludes);else delete frames.includes;};
        frames.includes=function(){
            leaseCallbacks++;second.dispose();third=exceptions.create(runtime,()=>{throw Error('third reader');});
            runtime.emit('PROJECT_START');return true;
        };
        assert.equal(second.current(lease),false,'a final frame callback cannot renew an old generation');
        restoreLease();assert.equal(leaseCallbacks,1);assert.equal(exceptions.stale(runtime,thread,lease),true);
        assert.equal(third.arrayReady(),true);third.dispose();
    } finally {restoreLease();restore();if(run)close(run.vm);quitStrandedVMs();clearStrayTimers();}
});

// Uses actual registered Arrays, real nested threads and engine-owned leases.
async function retirementFixture(actualError,cleanupError,changedBooleanGuard=false){
 const booleanDescriptor=Object.getOwnPropertyDescriptor(globalThis,'Boolean');
 const restoreBoolean=()=>Object.defineProperty(globalThis,'Boolean',booleanDescriptor);
 const vm=new VM(),runtime=vm.runtime,errors=[];runtime.on('BLOCKS_ERROR',error=>errors.push(error));
 let owner,initialOwner,middleId,middle,childId,child,actualArgs,actualUtil,coercions=0,cleanups=0;const cleanupOrder=[];
 const arrays=new Arrays(runtime),original=arrays.valueBinary;
 arrays.valueBinary=(args,util)=>{actualArgs=args;actualUtil=util;try{return original(args,util);}finally{if(changedBooleanGuard)restoreBoolean();}};
 const loaded=vm.extensionManager._registerInternalExtension(arrays);vm.extensionManager._loadedExtensions.set('arrays',loaded);
 const bridge={getInfo:()=>({id:'arcade',name:'Native cancellation lineage',blocks:[{opcode:'callFunction',blockType:'command',text:'invoke'},{opcode:'middle',blockType:'command',text:'nested invoke'}]}),
 callFunction(args,util){
  middle=runtime._pushThread(middleId,util.target,{stackClick:false});
  owner.link(middle,util.thread,()=>{cleanups++;cleanupOrder.push('parent');});
  primitiveOwner.stepNested(util,args,middle);
  const failure=initialOwner.failure(middle)||initialOwner.failure(util.thread);if(failure)initialOwner.rethrow(failure);
 },
 middle(args,util){
  child=runtime._pushThread(childId,util.target,{stackClick:false});
  owner.link(child,util.thread,()=>{
   cleanups++;cleanupOrder.push('child');
   owner.dispose();owner=exceptions.create(runtime,()=>{throw Error('replacement Throw reader must not run');});
   throw cleanupError;
  });
  primitiveOwner.stepNested(util,args,child);
  const failure=initialOwner.failure(child)||initialOwner.failure(util.thread);if(failure)initialOwner.rethrow(failure);
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
 middleId=add('arcade_middle',null);
 childId=add('data_setvariableto',null,null,{}, {VARIABLE:['result','result']});
 const call=add('arrays_valueBinary',childId,null,{}, {OP:['+',null]});blocks[childId].inputs.VALUE=[1,call];
 const left=add('data_variable',call,null,{}, {VARIABLE:['array','array']}),right=add('throwprobe_value',call);blocks[call].inputs={LEFT:[1,left],RIGHT:[1,right]};
 const unrelated=add('event_whenflagclicked',null),forever=add('control_forever',unrelated);blocks[unrelated].next=forever;
 const tick=add('data_changevariableby',forever,null,{VALUE:[1,[4,'1']]},{VARIABLE:['ticks','ticks']});blocks[forever].inputs.SUBSTACK=[2,tick];
 const project={targets:[{isStage:true,name:'Stage',variables,lists:{},broadcasts:{},blocks,comments:{},costumes:[{assetId:'cd21514d0531fdffb22204e0ec5ed84a',name:'backdrop',dataFormat:'svg',md5ext:'cd21514d0531fdffb22204e0ec5ed84a.svg',rotationCenterX:240,rotationCenterY:180}],sounds:[],currentCostume:0,volume:100,layerOrder:0}],monitors:[],extensions:['arrays','arcade','throwprobe'],meta:{semver:'3.0.0',vm:'0.2.0',agent:''}};
 const step=async()=>{for(let i=0;i<4;i++){await runtime._step();await new Promise(resolve=>setImmediate(resolve));}};
 try{await vm.loadProject(JSON.stringify(project));owner=exceptions.create(runtime,args=>args.VALUE);initialOwner=owner;runtime.currentStepTime=1000/30;vm.greenFlag();await step();}
 catch(error){restoreBoolean();vm.stopAll();vm.quit();throw error;}
 return {vm,runtime,errors,stage:runtime.getTargetForStage(),initialOwner,cleanupOrder,get owner(){return owner;},get middle(){return middle;},get child(){return child;},get coercions(){return coercions;},get cleanups(){return cleanups;},step,close(){restoreBoolean();vm.stopAll();vm.quit();owner.dispose();}};
}


test('issued computation Error and all lineage cleanups survive claim replacement during retirement',async()=>{
 const cause=Object.freeze({original:'cause'}),error=Object.freeze(new TypeError('actual cancelled computation',{cause}));
 const cleanup=Object.freeze(new Error('actual child cleanup failure'));
 const run=await retirementFixture(error,cleanup);
 try {
  assert.deepEqual(run.errors,[error]);assert.equal(run.errors[0],error);assert.equal(error.cause,cause);
  assert.equal(run.coercions,1);assert.equal(run.cleanups,2);assert.deepEqual(run.cleanupOrder,['child','parent']);
  assert.equal(run.initialOwner.failure(run.child),error);assert.equal(run.initialOwner.failure(run.middle),error);
  assert.equal(run.owner.failure(run.child),null,'replacement claim has no old retirement maps');
  assert.equal(exceptions.reported(run.runtime,error),true);
  assert.equal(exceptions.diagnostic(run.runtime,error).cleanupFailureCount,1);
  assert.equal(run.stage.variables.after.value,0);assert.equal(run.stage.variables.result.value,-1);
  assert.ok(run.stage.variables.ticks.value>0,'unrelated actual thread continues');
  const before=run.stage.variables.ticks.value;await run.step();assert.ok(run.stage.variables.ticks.value>before);
  assert.deepEqual(run.errors,[error]);assert.equal(run.cleanups,2);
 } finally {run.close();clearStrayTimers();}
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {EventEmitter} from 'node:events';
import {loadExtensionClass,VM_SRC} from './helpers/bw-extensions.mjs';
import {createArcadeRuntimeMock} from './helpers/arcade-runtime-mock.mjs';
const require=createRequire(import.meta.url);
const Exceptions=require(VM_SRC+'/util/bw-arcade-exceptions.js');
const Primitive=require(VM_SRC+'/util/bw-primitive-owner.js');
const Activation=require('../overlay/scratch-vm/src/extensions/crispstrobe/arcade/sprite-update-activation.js');
const Phase=require('../overlay/scratch-vm/src/extensions/crispstrobe/arcade/frame-phase.js');
const flags=require('../overlay/scratch-vm/src/extensions/crispstrobe/arcade/scene-flags.js');
// Actual bundled methods through the normal adapter, without constructing a VM.
// The explicit component drivers below are not native guest qualification.
const Arcade=loadExtensionClass('arcade');
const metadataInstance=new Arcade(createArcadeRuntimeMock())._inst;
const prototype=Object.getPrototypeOf(metadataInstance);
const run=prototype._runTerrainGenerator,advance=prototype._advance;
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const settled=(pending,expected)=>pending.then(()=>assert.fail('original rejection must propagate'),error=>assert.equal(error,expected));
const context=()=>({_terrainEpoch:1});

test('actual terrain runner preserves synchronous return and effect order',()=>{
    const trace=[],owner=context();
    const result=run.call(owner,(function*(){trace.push('first');trace.push('second');return 17;})());
    assert.equal(result,17);assert.deepEqual(trace,['first','second']);
});
test('actual terrain runner awaits the same yielded operation before following effects',async()=>{
    const trace=[],wait=deferred(),owner=context();
    const pending=run.call(owner,(function*(){trace.push('before');yield wait.promise;trace.push('after');return 19;})());
    assert.deepEqual(trace,['before']);wait.resolve('not a substituted guest result');assert.equal(await pending,19);assert.deepEqual(trace,['before','after']);
});
test('successful yield keeps the existing next-without-value contract',async()=>{
    let received='not resumed';
    const result=await run.call(context(),(function*(){received=yield Promise.resolve(97);return 29;})());
    assert.equal(received,undefined);assert.equal(result,29);
});
test('rejected yielded work unwinds delegated finally once and preserves the original error',async()=>{
    const error=new Error('original child failure'),trace=[],owner=context();
    function* child(){try{trace.push('child');yield Promise.reject(error);trace.push('forbidden');}finally{trace.push('child-finally');}}
    const pending=run.call(owner,(function*(){try{yield* child();trace.push('forbidden-parent');}finally{trace.push('parent-finally');}})());
    await settled(pending,error);assert.deepEqual(trace,['child','child-finally','parent-finally']);
});
for(const value of [undefined,null,false,0,''])test('falsy yielded rejection remains exceptional: '+String(value),async()=>{
    let closed=0,after=0;
    await settled(run.call(context(),(function*(){try{yield Promise.reject(value);after++;}finally{closed++;}})()),value);
    assert.equal(closed,1);assert.equal(after,0);
});
test('actual generator catch can recover from the original rejection and yield further work',async()=>{
    const error=new Error('recoverable'),trace=[];
    const result=await run.call(context(),(function*(){try{yield Promise.reject(error);}catch(actual){assert.equal(actual,error);trace.push('caught');yield Promise.resolve();trace.push('cleanup-complete');}return 23;})());
    assert.equal(result,23);assert.deepEqual(trace,['caught','cleanup-complete']);
});
for(const failed of [false,true])test('epoch cancellation closes yielded finally without stale body: '+failed,async()=>{
    const owner=context(),wait=deferred(),trace=[],cleanup=deferred();
    const pending=run.call(owner,(function*(){try{yield wait.promise;trace.push('forbidden-body');}finally{trace.push('finally-start');yield cleanup.promise;trace.push('finally-end');}})());
    owner._terrainEpoch++;if(failed)wait.reject(new Error('stale guest'));else wait.resolve();
    await Promise.resolve();assert.deepEqual(trace,['finally-start']);cleanup.resolve();await pending;assert.deepEqual(trace,['finally-start','finally-end']);
});
test('cancellation cleanup rejection is retained and cannot resume ordinary body',async()=>{
    const owner=context(),wait=deferred(),error=new Error('cleanup failed');let after=0,closed=0;
    const pending=run.call(owner,(function*(){try{yield wait.promise;after++;}finally{try{yield Promise.reject(error);}finally{closed++;}}})());
    owner._terrainEpoch++;wait.resolve();await settled(pending,error);assert.equal(after,0);assert.equal(closed,1);
});
test('unexpected unbounded internal cancellation cleanup refuses instead of claiming completion',async()=>{
    const owner=context(),wait=deferred();let after=0;
    const pending=run.call(owner,(function*(){try{yield wait.promise;after++;}finally{for(let i=0;i<65;i++)yield Promise.resolve();}})());
    owner._terrainEpoch++;wait.resolve();await assert.rejects(pending,/cancelled iterator cleanup exceeded its finite step bound/);assert.equal(after,0);
});

function activation(){
    const runtime=new EventEmitter();runtime.targets=[];runtime.threads=[];
    const definition={id:'definition',opcode:'procedures_definition',next:'body'};
    const blocks={getProcedureDefinition:name=>name==='update body'?'definition':null,getBlock:id=>id==='definition'?definition:null};
    const target={blocks,isOriginal:true};runtime.targets.push(target);
    const scene={flags:0,sprites:{},frameDeltaTime:0.02},sprite={id:'arcade:1'};scene.sprites[sprite.id]=sprite;runtime.bwArcadeDeviceState=scene;
    const ext={_terrainEpoch:1,_runtime:runtime,_state:()=>scene,_sceneFlags:flags.create(),_spriteValues:new Map([[sprite.id,sprite]]),getInfo:()=>({blocks:[]}),_sdkObjectClasses:{matches:()=>false},
        _objectHeap:{inspect:()=>({className:'Actor'}),definition:()=>({intrinsic:'ExtendableSprite'}),method:()=>({procedure:'update body'})}};
    const phase=new Phase(runtime,ext),provider=Activation.create(ext);runtime._arcadeFramePhase=phase;ext._sdkSpriteUpdates={claim:provider.claim,hasSceneUpdates:provider.hasSceneUpdates};
    provider.register(sprite,{target},scene);ext._sceneFlags.register(scene,sprite);phase.active=true;phase.phaseContext={};
    function spawn(name,values,util){const args={NAME:name,ARGS:JSON.stringify(values),bwExceptionCaller:null},callUtil={target,sequencer:null};provider.prepareCall(name,values,util,args,callUtil);
        const thread={target,blockContainer:blocks,topBlock:'definition'};runtime.threads.push(thread);assert.ok(provider.consumeChild(thread,args,callUtil));}
    return {ext,phase,provider,scene,spawn};
}
test('real activation finally releases failed scene entry while concurrent reentry still refuses',async()=>{
    const r=activation(),wait=deferred(),error=new Error('managed root');
    try{
        r.ext._objectProcedure=(...args)=>{r.spawn(...args);return wait.promise;};
        const pending=run.call(r.ext,r.provider.steps(r.scene,function*(){}));
        assert.throws(()=>r.provider.steps(r.scene,function*(){}).next(),/iterator cannot reenter/);
        wait.reject(error);await settled(pending,error);
        r.ext._objectProcedure=(...args)=>{r.spawn(...args);};
        assert.equal(r.provider.steps(r.scene,function*(){}).next().done,true);
    }finally{r.phase.detach();}
});

function issuedSignal({publicationThrows=false}={}){
    const runtime=new EventEmitter(),events=[];runtime.targets=[];runtime.threads=[];
    runtime.on('BLOCKS_ERROR',error=>{events.push(error);if(publicationThrows)throw new Error('listener publication failed');});
    const block={id:'throw',opcode:'arcade_throwValue'},args={},operation={id:'throw',opcode:block.opcode,_argValues:args};
    const container={getBlock:id=>id==='throw'?block:null,_cache:{_executeCached:{throw:{_ops:[operation]}}}},target={blocks:container};runtime.targets.push(target);
    const thread={target,blockContainer:container,stack:['throw'],status:0,isKilled:false,constructor:{STATUS_DONE:4},peekStack:()=> 'throw'};runtime.threads.push(thread);
    runtime.sequencer={activeThread:thread,retireThread:t=>{t.isKilled=true;}};runtime.isActiveThread=t=>runtime.threads.includes(t);
    const util={runtime,thread},owner=Exceptions.create(runtime,()=> 'owned'),primitive=()=>owner.raise(args,util);operation._blockFunction=primitive;runtime.getOpcodeFunction=()=>primitive;
    runtime.emit('PROJECT_START');let signal;
    try{Primitive.invoke(runtime,thread,container,operation,args,util,primitive);assert.fail('private raise must reject');}catch(error){signal=error;}
    assert.equal(Exceptions.diagnostic(runtime,signal)?.value,'owned');return {runtime,events,signal,owner};
}
function frameContext(runtime,error){const scene={};return {_runtime:runtime,_terrainEpoch:1,_terrainStopped:false,_dialogs:[],_state:()=>scene,_sceneFrames:new WeakMap(),_pendingSceneSeconds:new WeakMap(),
    _runTerrainGenerator:run,_advanceFrameSteps:function*(){yield Promise.reject(error);}};}
test('only actual successfully published same-runtime exception suppresses duplicate frame reporting',async()=>{
    const r=issuedSignal();try{assert.equal(r.events.length,1);assert.equal(Exceptions.reported(r.runtime,r.signal),true);await advance.call(frameContext(r.runtime,r.signal),0.02);assert.equal(r.events.length,1);}finally{r.owner.dispose();}
});
test('unpublished private exception and copied or foreign values do not gain publication proof',async()=>{
    const r=issuedSignal({publicationThrows:true});try{
        assert.equal(Exceptions.reported(r.runtime,r.signal),false);
        assert.equal(Exceptions.reported({},r.signal),false);assert.equal(Exceptions.reported(r.runtime,new Error(r.signal.message)),false);
    }finally{r.owner.dispose();}
    for(const error of [new Error('Arcade uncaught thrown value: owned'),'ordinary failure',null,undefined,false,0]){
        const runtime=new EventEmitter(),events=[];runtime.on('BLOCKS_ERROR',e=>events.push(e));await advance.call(frameContext(runtime,error),0.02);assert.equal(events.length,1);assert.equal(events[0],error?.message??String(error));
    }
    const other=issuedSignal();try{const runtime=new EventEmitter(),events=[];runtime.on('BLOCKS_ERROR',e=>events.push(e));await advance.call(frameContext(runtime,other.signal),0.02);assert.deepEqual(events,[other.signal.message]);}finally{other.owner.dispose();}
});
test('cancelled prior frame cannot publish a late arbitrary error into a later epoch',async()=>{
    const runtime=new EventEmitter(),events=[],wait=deferred();runtime.on('BLOCKS_ERROR',e=>events.push(e));const ext=frameContext(runtime,null);ext._advanceFrameSteps=function*(){yield wait.promise;};
    const pending=advance.call(ext,0.02);ext._terrainEpoch++;wait.reject(new Error('late old guest'));await pending;assert.deepEqual(events,[]);
});

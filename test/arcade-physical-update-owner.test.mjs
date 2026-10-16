import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {EventEmitter} from 'node:events';
const require=createRequire(import.meta.url);
const Activation=require('../overlay/scratch-vm/src/extensions/crispstrobe/arcade/sprite-update-activation.js');
const Phase=require('../overlay/scratch-vm/src/extensions/crispstrobe/arcade/frame-phase.js');
const flags=require('../overlay/scratch-vm/src/extensions/crispstrobe/arcade/scene-flags.js');
const Exceptions=require('../overlay/scratch-vm/src/util/bw-arcade-exceptions.js');

// Component boundaries only: these controls do not substitute for real guest
// qualification. Production uses the actual _pushThread and extension owner.
function setup(){
    const runtime=new EventEmitter();runtime.targets=[];runtime.threads=[];
    const definition={id:'definition',opcode:'procedures_definition',next:'body'};
    const blocks={getProcedureDefinition:name=>name==='update body'?'definition':null,
        getBlock:id=>id==='definition'?definition:null};
    const target={isOriginal:true,blocks};runtime.targets.push(target);
    const scene={flags:0,sprites:{},frameDeltaTime:0.02};runtime.bwArcadeDeviceState=scene;
    const sprite={id:'arcade:1'};scene.sprites[sprite.id]=sprite;
    const ext={_runtime:runtime,_state:()=>scene,_sceneFlags:flags.create(),_spriteValues:new Map([[sprite.id,sprite]]),
        getInfo:()=>({blocks:[]}),_sdkObjectClasses:{matches:()=>false},
        _objectHeap:{inspect:()=>({className:'Actor'}),definition:()=>({intrinsic:'ExtendableSprite'}),
            method:()=>({procedure:'update body'})}};
    const phase=new Phase(runtime,ext);runtime._arcadeFramePhase=phase;
    const provider=Activation.create(ext);ext._sdkSpriteUpdates=Object.freeze({claim:provider.claim,hasSceneUpdates:provider.hasSceneUpdates});
    provider.register(sprite,{target},scene);ext._sceneFlags.register(scene,sprite);
    const owner=Exceptions.create(runtime,()=>0,(child,args,util)=>provider.consumeChild(child,args,util));
    const retired=[];runtime.sequencer={activeThread:null,retireThread:thread=>{retired.push(thread);thread.isKilled=true;}};
    runtime.emit('PROJECT_START');phase.active=true;phase.phaseContext={};
    function push(){const thread={target,blockContainer:blocks,topBlock:'definition',stack:['definition'],
        status:0,isKilled:false,constructor:{STATUS_DONE:4}};runtime.threads.push(thread);return thread;}
    function prepare(name,values,util){const args={NAME:name,ARGS:JSON.stringify(values),bwExceptionCaller:null},callUtil={target,sequencer:null};
        provider.prepareCall(name,values,util,args,callUtil);return {args,util:callUtil};}
    const iterate=()=>provider.steps(scene,function*(){}).next();
    const close=()=>{phase.detach();owner.dispose();};
    return {runtime,target,blocks,definition,scene,sprite,ext,phase,provider,owner,push,prepare,iterate,retired,close};
}

test('physical root consumes the genuine invocation once; public loan and copied arguments grant nothing',()=>{
    const r=setup();let child;
    try {
        r.ext._objectProcedure=(name,values,util)=>{
            const call=r.prepare(name,values,util);child=r.push();
            assert.throws(()=>r.owner.linkPhysicalUpdate(child,{...call.args},call.util,()=>{}),/private current entry/);
            const unlink=r.owner.linkPhysicalUpdate(child,call.args,call.util,()=>{});
            assert.equal(r.phase.sourceAuthority.get(child),r.phase.generation);
            assert.throws(()=>r.owner.linkPhysicalUpdate(child,call.args,call.util,()=>{}),/private current entry/);
            unlink();assert.throws(()=>r.owner.linkPhysicalUpdate(child,call.args,call.util,()=>{}),/private current entry/);
        };
        assert.equal(r.iterate().done,true);
        const arbitrary=r.push();r.phase.spriteUpdateLoan={target:r.target,definition:'definition',generation:r.phase.generation};
        r.phase.linkManagedCall(arbitrary);
        assert.equal(r.phase.sourceAuthority.has(arbitrary),false);
        assert.throws(()=>r.owner.link(arbitrary,null),/actual managed call/);
        assert.throws(()=>r.owner.linkPhysicalUpdate(arbitrary,{}, {target:r.target},()=>{}),/private current entry/);
    } finally {r.close();}
});

test('physical activation rejects copied utility, altered arguments and an old matching child',()=>{
    for(const variant of ['utility','name','arguments','old-child','false-caller','null-caller','zero-caller']){
        const r=setup();try {
            const old=r.push();
            r.ext._objectProcedure=(name,values,util)=>{
                const call=r.prepare(name,values,util),child=variant==='old-child'?old:r.push();
                if(variant==='name')call.args.NAME='other';
                if(variant==='arguments')call.args.ARGS='[]';
                if(variant==='false-caller')call.util.thread=false;
                if(variant==='null-caller')call.util.thread=null;
                if(variant==='zero-caller')call.util.thread=0;
                assert.throws(()=>r.owner.linkPhysicalUpdate(child,call.args,
                    variant==='utility'?{...call.util}:call.util,()=>{}),
                    variant.endsWith('caller')?/private current entry/:/differs/);
                assert.equal(r.phase.sourceAuthority.has(child),false);
                throw new Error('expected rejection retained');
            };
            assert.throws(r.iterate,/expected rejection retained/);
        } finally {r.close();}
    }
});

test('physical activation expires on phase, target, definition, scene and lifecycle changes before effects',()=>{
    for(const change of ['context','phase','target','container','definition','method','membership','Stop','load','dispose','StopStartPublicRestore']){
        const r=setup();try {
            r.ext._objectProcedure=(name,values,util)=>{
                const call=r.prepare(name,values,util),child=r.push();
                if(change==='context')r.phase.phaseContext={};
                if(change==='phase')r.runtime._arcadeFramePhase={};
                if(change==='target')r.runtime.targets=[];
                if(change==='container')r.target.blocks={};
                if(change==='definition')r.definition.next='changed';
                if(change==='method')r.ext._objectHeap.method=()=>({procedure:'other'});
                if(change==='membership')r.ext._spriteValues.set(r.sprite.id,{});
                if(change==='Stop')r.runtime.emit('PROJECT_STOP_ALL');
                if(change==='load')r.runtime.emit('PROJECT_LOADED');
                if(change==='dispose')r.runtime.emit('RUNTIME_DISPOSED');
                if(change==='StopStartPublicRestore'){
                    const generation=r.phase.generation,context=r.phase.phaseContext;
                    r.runtime.emit('PROJECT_STOP_ALL');r.runtime.emit('PROJECT_START');
                    r.phase.generation=generation;r.phase.phaseContext=context;r.phase.active=true;
                }
                assert.throws(()=>r.owner.linkPhysicalUpdate(child,call.args,call.util,()=>{}));
                assert.equal(r.phase.sourceAuthority.has(child),false);
                throw new Error('expired entry retained');
            };
            assert.throws(r.iterate,/expired entry retained/);
        } finally {r.close();}
    }
});

test('physical activation rejects foreign child and does not authorize arbitrary direct invocations',()=>{
    const r=setup();try {
        const forgedArgs={NAME:'update body',ARGS:'["arcade:1",20]'};
        r.provider.prepareCall('update body',['arcade:1',20],{target:r.target},forgedArgs,{target:r.target});
        assert.equal(r.provider.consumeChild(r.push(),forgedArgs,{target:r.target}),null);
        r.ext._objectProcedure=(name,values,util)=>{
            const call=r.prepare(name,values,util),child=r.push();child.target={blocks:r.blocks};
            assert.throws(()=>r.owner.linkPhysicalUpdate(child,call.args,call.util,()=>{}),/differs/);
            throw new Error('foreign child retained');
        };
        assert.throws(r.iterate,/foreign child retained/);
    } finally {r.close();}
});

test('normal managed parent checks stay strict while genuine nested descendants retain their parent',()=>{
    const r=setup();try {
        r.ext._objectProcedure=(name,values,util)=>{
            const call=r.prepare(name,values,util),parent=r.push();
            const rootUnlink=r.owner.linkPhysicalUpdate(parent,call.args,call.util,()=>{});
            const child=r.push();
            assert.throws(()=>r.owner.link(child,parent),/actual managed call/);
            r.runtime.sequencer.activeThread=parent;
            const unlink=r.owner.link(child,parent);r.phase.linkManagedCall(child,parent);
            assert.equal(r.phase.managedLinks.get(child).caller,parent);
            unlink();rootUnlink();
        };
        assert.equal(r.iterate().done,true);
    } finally {r.close();}
});

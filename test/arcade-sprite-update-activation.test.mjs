import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {EventEmitter} from 'node:events';
const require=createRequire(import.meta.url);
const flags=require('../overlay/scratch-vm/src/extensions/crispstrobe/arcade/scene-flags.js');
const Activation=require('../overlay/scratch-vm/src/extensions/crispstrobe/arcade/sprite-update-activation.js');
const Phase=require('../overlay/scratch-vm/src/extensions/crispstrobe/arcade/frame-phase.js');

test('scene update iterator uses the live array, including removal and append',()=>{
    const host=flags.create(),scene={flags:0},a={id:1},b={id:2},c={id:3},d={id:4};
    for(const item of [a,b,c])host.register(scene,item);
    const visited=[];
    for(const item of host.iterate(scene)){
        visited.push(item.id);
        if(item===a){host.remove(scene,a);host.register(scene,d);}
    }
    assert.deepEqual(visited,[1,3,4]);
});
test('scene update iterator retains the preceding render sort order',()=>{
    const host=flags.create(),scene={flags:0},a={id:1,z:5},b={id:2,z:0};
    host.register(scene,a);host.register(scene,b);host.order(scene,[a,b]);
    assert.deepEqual([...host.iterate(scene)],[b,a]);
});
function setup(){
    const runtime=new EventEmitter();runtime.targets=[];runtime.threads=[];
    const definition={id:'definition',opcode:'procedures_definition',next:'body'};
    const blocks={getProcedureDefinition:name=>name==='update body'?'definition':null,getBlock:id=>id==='definition'?definition:null};
    const target={blocks,isOriginal:true};runtime.targets.push(target);
    const scene={flags:0,sprites:{},frameDeltaTime:0.02};
    runtime.bwArcadeDeviceState=scene;
    const sprite={id:'arcade:1'};scene.sprites[sprite.id]=sprite;
    const ext={_runtime:runtime,_state:()=>scene,_sceneFlags:flags.create(),_spriteValues:new Map([[sprite.id,sprite]]),
        getInfo:()=>({blocks:[]}),_sdkObjectClasses:{matches:()=>false},
        _objectHeap:{inspect:()=>({className:'Actor'}),definition:()=>({intrinsic:'ExtendableSprite'}),method:()=>({procedure:'update body'})}};
    const phase=new Phase(runtime,ext);runtime._arcadeFramePhase=phase;
    ext._sdkSpriteUpdates=Activation.create(ext);ext._sdkSpriteUpdates.register(sprite,{target},scene);ext._sceneFlags.register(scene,sprite);
    const spawn=(name,values,util)=>{const args={NAME:name,ARGS:JSON.stringify(values),bwExceptionCaller:null},callUtil={target,sequencer:null};
        ext._sdkSpriteUpdates.prepareCall(name,values,util,args,callUtil);
        const thread={target,blockContainer:blocks,topBlock:'definition'};runtime.threads.push(thread);
        assert.ok(ext._sdkSpriteUpdates.consumeChild(thread,args,callUtil));return thread;};
    ext._objectProcedure=spawn;
    phase.active=true;phase.phaseContext={deadline:100};
    return {runtime,target,scene,sprite,ext,phase,spawn};
}
test('managed frame method receives one scoped activation even after base destruction',()=>{
    const r=setup();let thread;
    r.ext._objectProcedure=(...args)=>{assert.deepEqual(args.slice(0,2),['update body',['arcade:1',20]]);thread=r.spawn(...args);};
    const steps=r.ext._sdkSpriteUpdates.steps(r.scene,function*(sprite){delete r.scene.sprites[sprite.id];r.ext._sceneFlags.remove(r.scene,sprite);r.runtime.bwArcadeDeviceState={sprites:{}};});
    assert.deepEqual(steps.next(),{value:undefined,done:true});
    assert.equal(r.phase.sourceAuthority.get(thread),r.phase.generation);
    assert.equal(r.phase.spriteUpdateLoan,undefined);
    r.phase.detach();
});
test('observer, forged, foreign target, duplicate and stale activation are refused',()=>{
    const r=setup();
    assert.throws(()=>r.phase.withSpriteUpdate({},r.spawn),/stale or foreign/);
    r.phase.active=false;
    assert.throws(()=>r.ext._sdkSpriteUpdates.steps(r.scene,function*(){}).next(),/owned physical phase/);
    r.phase.active=true;
    r.ext._objectProcedure=(name,values,util)=>{const args={NAME:name,ARGS:JSON.stringify(values),bwExceptionCaller:null},callUtil={target:r.target,sequencer:null};
        r.ext._sdkSpriteUpdates.prepareCall(name,values,util,args,callUtil);
        const thread={target:{blocks:r.target.blocks},blockContainer:r.target.blocks,topBlock:'definition'};r.runtime.threads.push(thread);
        r.ext._sdkSpriteUpdates.consumeChild(thread,args,callUtil);};
    assert.throws(()=>r.ext._sdkSpriteUpdates.steps(r.scene,function*(){}).next(),/differs from its private invocation/);
    assert.equal(r.phase.spriteUpdateLoan,undefined);
    r.ext._objectProcedure=(...args)=>{r.spawn(...args);r.spawn(...args);};
    assert.throws(()=>r.ext._sdkSpriteUpdates.steps(r.scene,function*(){}).next(),/differs from its private entry/);
    assert.equal(r.phase.spriteUpdateLoan,undefined);
    r.ext._objectProcedure=r.spawn;
    assert.deepEqual(r.ext._sdkSpriteUpdates.steps(r.scene,function*(){r.phase.cancel();}).next(),{value:undefined,done:true});
    r.phase.detach();
});
test('nested managed calls retain the real caller rather than consuming another activation',()=>{
    const r=setup();let nested,parent;
    r.ext._objectProcedure=(...args)=>{parent=r.spawn(...args);nested={target:r.target};r.phase.linkManagedCall(nested,parent);};
    r.ext._sdkSpriteUpdates.steps(r.scene,function*(){}).next();
    assert.equal(r.phase.managedLinks.get(nested).caller,parent);
    assert.equal(r.phase.spriteUpdateLoan,undefined);r.phase.detach();
});
test('only actual registered custom-update slots activate native phase ownership',()=>{
    const r=setup();
    assert.equal(r.phase.hasSourceProject(),true);
    delete r.scene.sprites[r.sprite.id];assert.equal(r.phase.hasSourceProject(),false);
    r.scene.sprites[r.sprite.id]=r.sprite;r.target.isOriginal=false;assert.equal(r.phase.hasSourceProject(),false);
    r.target.isOriginal=true;r.ext._sdkObjectClasses.matches=()=>true;assert.equal(r.phase.hasSourceProject(),false);
    r.phase.detach();
});

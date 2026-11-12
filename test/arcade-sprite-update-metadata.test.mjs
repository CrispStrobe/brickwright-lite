import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createRequire} from 'node:module';
import {loadExtensionClass,probeExtension} from './helpers/bw-extensions.mjs';
const require=createRequire(import.meta.url);
const activation=require('../overlay/scratch-vm/src/extensions/crispstrobe/arcade/sprite-update-activation.js');
const events=['PROJECT_START','PROJECT_STOP_ALL','RUNTIME_DISPOSED','PROJECT_LOADED'];
const inert=service=>{
 assert.equal(Object.isFrozen(service),true);
 assert.equal(service.handles({id:'foreign'}),false);assert.equal(service.hasSceneUpdates(),false);
 assert.equal(service.consumeChild({},{},{}),null);
 for(const method of ['register','claim','prepareCall'])assert.throws(()=>service[method]({},{}),/originally bound runtime/);
 let baseCalls=0;assert.throws(()=>service.steps({},function *(){baseCalls++;}).next(),/originally bound runtime/);assert.equal(baseCalls,0);
};

test('metadata Sprite update services remain permanently inert for absent and invalid runtimes',()=>{
 let listeners=0;
 for(const runtime of [undefined,null,{}, {on:42,targets:[]},{on(){listeners++;}}])inert(activation.create({_runtime:runtime}));
 assert.equal(listeners,0,'invalid runtime does not install lifecycle listeners');
});

test('late runtime attachment and ABA cannot turn metadata into Sprite update authority',()=>{
 const ext={_runtime:null},service=activation.create(ext),runtime=new EventEmitter();runtime.targets=[];runtime.threads=[];
 let foreignReads=0;
 for(const name of ['_objectHeap','_sceneFlags','_spriteValues'])Object.defineProperty(ext,name,{get(){foreignReads++;throw Error('metadata must not inspect a later owner');}});
 for(const current of [runtime,null,runtime]){
  ext._runtime=current;inert(service);
  for(const event of events)assert.equal(runtime.listenerCount(event),0);
 }
 assert.equal(foreignReads,0);
});

test('the actual Arcade metadata constructor exposes real blocks without acquiring Sprite update authority',()=>{
 const Arcade=loadExtensionClass('arcade');
 for(const runtime of [undefined,null]){
  const probe=probeExtension(Arcade,runtime);assert.equal(probe.error,null);assert.equal(probe.id,'arcade');
  assert.ok(probe.opcodes.has('createCallable'));assert.ok(probe.opcodes.has('mutateSpriteImage'));assert.ok(probe.opcodes.has('spawnImageProjectile'));
  const owner=probe.instance._inst,late=new EventEmitter();late.targets=[];late.threads=[];
  assert.equal(owner._sdkSpriteUpdates.hasSceneUpdates(),false);
  assert.throws(()=>owner._sdkSpriteUpdates.claim({},{}),/originally bound runtime/);
  owner._runtime=late;
  assert.equal(owner._sdkSpriteUpdates.hasSceneUpdates(),false);
  assert.throws(()=>owner._sdkSpriteUpdates.claim({},{}),/originally bound runtime/);
  for(const event of events)assert.equal(late.listenerCount(event),0);
  owner._callableDispatch.dispose();owner._callableValues.dispose();
 }
});

test('a genuinely supplied runtime retains the original listener and target registration path',()=>{
 const runtime=new EventEmitter();runtime.targets=[];runtime.threads=[];
 const ext={_runtime:runtime,_objectHeap:{inspect:()=>({className:'Actual'}),definition:()=>({intrinsic:'ExtendableSprite'})}};
 const service=activation.create(ext);for(const event of events)assert.equal(runtime.listenerCount(event),1);
 const sprite={id:'sprite'},target={isOriginal:true,blocks:{}},scene={sprites:{sprite}};
 runtime.targets.push(target);runtime.bwArcadeDeviceState=scene;
 assert.equal(service.handles(sprite),false);service.register(sprite,{target},scene);assert.equal(service.handles(sprite),true);
 assert.throws(()=>service.register({id:'foreign'},{target:{isOriginal:true,blocks:{}}},scene),/actual original project target/);
 assert.throws(()=>service.claim({},{}),/stale or foreign/);
 for(const event of events)runtime.emit(event);
 for(const event of events)assert.equal(runtime.listenerCount(event),1,'no extra listener registration');
});

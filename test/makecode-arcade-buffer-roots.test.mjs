import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import path from 'node:path';
import {createRequire} from 'node:module';
import {loadExtensionClass,VM_SRC} from './helpers/bw-extensions.mjs';
const require=createRequire(import.meta.url),BWValues=require(path.join(VM_SRC,'util/bw-values.js'));
const {PxtBuffer}=require('../overlay/scratch-vm/src/extensions/crispstrobe/arcade/buffer.js');
const Arcade=loadExtensionClass('arcade');
const setup=()=>{const runtime=new EventEmitter();runtime.targets=[];runtime.threads=[];runtime.startHats=()=>[];return {runtime,native:new Arcade(runtime)};};
const id=value=>value.bwReference.id;
const sorted=values=>[...values].sort();

test('Buffer inventory counts backing stores once and does not treat the registry as roots',()=>{
    const {native}=setup(),owner=native._inst,backing=new ArrayBuffer(8);
    const a=owner._bufferReference(new PxtBuffer(backing,0,4)),b=owner._bufferReference(new PxtBuffer(backing,4,4));
    const discarded=native.createBuffer({SIZE:3}),empty=owner._bufferMemorySnapshot();
    assert.equal(empty.registeredBuffers,3);assert.equal(empty.registeredBytes,11);assert.equal(empty.rootedBytes,0);
    assert.deepEqual([...empty.rootedIds],[]);assert.equal(empty.collectionAllowed,false);
    const pinned=owner._bufferMemorySnapshot([a]);assert.equal(pinned.rootedBytes,8);
    assert.deepEqual(sorted(pinned.rootedIds),sorted([id(a),id(b)]));
    assert.equal(native.bufferLength({BUFFER:discarded}),3); // Observation never sweeps.
    const unrelated=owner._bufferMemorySnapshot([new Uint8Array(4)]);
    assert.equal(unrelated.rootedBytes,0);assert.equal(unrelated.observedByteStorage,4);
    assert.equal(unrelated.rootCoverageComplete,false);
});

test('variables and reachable scoped array cycles retain nested Buffers without rooting every array',()=>{
    const {runtime,native}=setup(),a=native.createBuffer({SIZE:2}),b=native.createBuffer({SIZE:3});
    const cycle=[],ref=BWValues.arrayReference(runtime,cycle);cycle.push(ref,a);
    BWValues.arrayReference(runtime,[b]); // An unrelated interned array is not a runtime root.
    const hidden={};Object.defineProperty(hidden,'held',{value:ref});hidden[Symbol('buffer')]=a;
    runtime.targets=[{variables:{v:{value:hidden}}}];
    const result=native._inst._bufferMemorySnapshot();
    assert.deepEqual([...result.rootedIds],[id(a)]);assert.equal(result.rootedBytes,2);assert.equal(result.traversalComplete,true);
});

test('frames, custom returns, callback captures and suspended scenes expose independent roots',()=>{
    const {runtime,native}=setup(),owner=native._inst;
    const refs=Array.from({length:8},()=>native.createBuffer({SIZE:1}));
    runtime.threads=[{stackFrames:[{reported:{input:refs[0]},params:{arg:refs[1]}}],justReported:refs[2],bwReturnValue:refs[3]}];
    owner._functionCalls.add({thread:{bwArcadeCaptures:{cell:{value:refs[4]}}},caller:{bwArcadeEvent:{value:refs[5]}}});
    owner._buttonHandlers.push({captures:{cell:{value:refs[6]}}});
    owner._sceneBundles.add({_updateHandlers:[{captures:{saved:refs[7]}}]});
    const result=owner._bufferMemorySnapshot();assert.deepEqual(sorted(result.rootedIds),sorted(refs.map(id)));
    assert.equal(result.rootedBytes,8);assert.equal(result.collectionAllowed,false);
});

test('serialized block and variable values retain valid tokens, including nested JSON text',()=>{
    const {runtime,native}=setup(),other=setup(),a=native.createBuffer({SIZE:2}),b=native.createBuffer({SIZE:3});
    const foreign=other.native.createBuffer({SIZE:7});
    runtime.targets=[{variables:{v:{value:JSON.stringify(JSON.stringify({args:[a]}))}},blocks:{_blocks:{call:{fields:{ARGS:{value:JSON.stringify([b,foreign])}}}}}}];
    const result=native._inst._bufferMemorySnapshot();assert.deepEqual(sorted(result.rootedIds),sorted([id(a),id(b)]));
    assert.equal(result.rootedBytes,5);assert.equal(result.traversalComplete,true);
    runtime.emit('PROJECT_START');assert.deepEqual([...native._inst._bufferMemorySnapshot().rootedIds],[]);
});

test('Buffer-backed native song storage is retained even when its Buffer token is not a variable',()=>{
    const {runtime,native}=setup(),buffer=native.bufferFromHex({HEX:'00780004080100'});
    native.songFromBuffer({BUFFER:buffer});
    const result=native._inst._bufferMemorySnapshot();assert.deepEqual([...result.rootedIds],[id(buffer)]);
    assert.equal(result.rootedBytes,7);assert.equal(result.collectionAllowed,false);
    runtime.emit('RUNTIME_DISPOSED');const cleared=native._inst._bufferMemorySnapshot();
    assert.equal(cleared.registeredBytes,0);assert.equal(cleared.rootedBytes,0);
});

test('incomplete traversal is explicit and bounded, never invokes accessors or authorizes collection',()=>{
    const {native}=setup(),owner=native._inst;let reads=0;
    const accessor={};Object.defineProperty(accessor,'bwReference',{get(){reads++;throw Error('getter executed');}});
    const result=owner._bufferMemorySnapshot([accessor,()=>{},new WeakMap(),'fragment bwReference']);
    assert.equal(reads,0);assert.equal(result.traversalComplete,false);assert.equal(result.collectionAllowed,false);
    for(const reason of ['accessor','closure','weak-container','reference-text-fragment'])assert.ok(result.reasons.includes(reason));
    assert.ok(owner._bufferMemorySnapshot([[1,2,3]],{maxNodes:2}).reasons.includes('node-limit'));
    assert.ok(owner._bufferMemorySnapshot(['long text'],{maxText:2}).reasons.includes('text-limit'));
});

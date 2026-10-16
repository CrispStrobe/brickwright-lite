import {createArcadeRuntimeMock} from './helpers/arcade-runtime-mock.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {createRequire} from 'node:module';
import {runProgram,stepFrames,clearStrayTimers} from './helpers/bw-vm.mjs';
import {loadExtensionClass,VM_SRC} from './helpers/bw-extensions.mjs';
const require=createRequire(import.meta.url),BWValues=require(path.join(VM_SRC,'util/bw-values.js'));
const Arcade=loadExtensionClass('arcade');
const setup=()=>{const runtime=createArcadeRuntimeMock(),errors=[];runtime.on('BLOCKS_ERROR',e=>errors.push(e));return {runtime,errors,native:new Arcade(runtime)};};

test('disposed Buffer owner refuses late allocations until successful project replacement',()=>{
    const {runtime,native,errors}=setup(),old=native.createBuffer({SIZE:8});
    runtime.emit('RUNTIME_DISPOSED');
    assert.equal(native.createBuffer({SIZE:4}),BWValues.UNDEFINED);
    assert.equal(native.bufferLength({BUFFER:old}),BWValues.UNDEFINED);
    assert.equal(native._inst._bufferHeap,null);
    runtime.emit('PROJECT_START');
    assert.equal(native.bufferFromHex({HEX:'0102'}),BWValues.UNDEFINED);
    assert.equal(native._inst._bufferHeap,null);
    assert.equal(errors.length,3);assert.ok(errors.every(e=>/disposed/i.test(e)));
    runtime.emit('PROJECT_LOADED');
    const fresh=native.createBuffer({SIZE:4});assert.ok(BWValues.isReference(fresh));
    assert.notEqual(fresh.bwReference.id,old.bwReference.id);assert.equal(native.bufferLength({BUFFER:fresh}),4);
    assert.equal(native.bufferLength({BUFFER:old}),BWValues.UNDEFINED);
});

test('independent Buffer owners in one runtime cannot resolve each other\'s issued IDs',()=>{
    const {runtime,native:a,errors}=setup(),b=new Arcade(runtime);
    const first=a.bufferFromHex({HEX:'0102'}),second=b.bufferFromHex({HEX:'030405'});
    assert.notEqual(first.bwReference.id,second.bwReference.id);
    assert.equal(a.bufferLength({BUFFER:first}),2);assert.equal(b.bufferLength({BUFFER:second}),3);
    assert.equal(a.bufferLength({BUFFER:second}),BWValues.UNDEFINED);assert.equal(b.bufferLength({BUFFER:first}),BWValues.UNDEFINED);
    assert.equal(errors.length,2);
    const soundA=a.tonePlayable({FREQUENCY:440,DURATION:100}),soundB=b.tonePlayable({FREQUENCY:880,DURATION:100});
    assert.notEqual(soundA.bwReference.id,soundB.bwReference.id);
    assert.equal(b.playMusic({PLAYABLE:soundA,MODE:'UntilDone'}),undefined);
    assert.equal(b._inst._musicHost.running,0);assert.equal(errors.length,3);
});

test('disposal releases Buffer-backed songs, cancels queued sound and settles paused callers',async()=>{
    const {runtime,native,errors}=setup(),bytes=native.bufferFromHex({HEX:'00780004080100'});
    const song=native.songFromBuffer({BUFFER:bytes});assert.ok(BWValues.isReference(song));
    const tone=native.tonePlayable({FREQUENCY:440,DURATION:100});
    const host=native._inst._musicHost,pending=native.playMusic({PLAYABLE:tone,MODE:'UntilDone'});
    assert.ok(host.running>0);assert.equal(native._inst._musicValues.size,2);
    runtime.emit('RUNTIME_DISPOSED');await pending;
    assert.equal(host.running,0);assert.equal(host.log.length,0);
    assert.equal(native._inst._musicHost,null);assert.equal(native._inst._musicValues.size,0);assert.equal(native._inst._musicIds.size,0);
    assert.equal(native._inst._bufferHeap,null);assert.deepEqual(errors,[]);
    // Existing sound-construction APIs may still be invoked before replacement;
    // their new registry cannot revive an old token in the unchanged scope.
    const fresh=native.tonePlayable({FREQUENCY:880,DURATION:100});
    assert.notEqual(fresh.bwReference.id,tone.bwReference.id);
    assert.equal(native.playMusic({PLAYABLE:tone,MODE:'UntilDone'}),undefined);
    assert.equal(native._inst._musicHost.running,0);assert.equal(errors.length,1);
});

 test('real VM clear and same-VM SB3 replacement reopen Buffer allocation without reviving old tokens',async()=>{
    try {
        const run=await runProgram('SPRITE Game:\nWHEN flag clicked:\n  set bytes to (arcade byte buffer from hex text "0102")\n  set byteCount to (arcade byte buffer bytes length)\n',{frames:20,storage:true});
        const values=()=>Object.fromEntries(run.vm.runtime.targets.flatMap(t=>Object.values(t.variables)).map(v=>[v.name.replace(/^Game_/,''),v.value]));
        assert.deepEqual(run.errors,[]);assert.equal(values().byteCount,2);
        const old=values().bytes,archive=Buffer.from(await(await run.vm.saveProjectSb3()).arrayBuffer());
        run.vm.clear();
        assert.equal(run.vm.runtime.getOpcodeFunction('arcade_createBuffer')({SIZE:4},{}),BWValues.UNDEFINED);
        await run.vm.loadProject(archive);run.vm.greenFlag();await stepFrames(run.vm,20);
        assert.equal(values().byteCount,2);assert.notEqual(values().bytes.bwReference.id,old.bwReference.id);
        assert.equal(run.vm.runtime.getOpcodeFunction('arcade_bufferLength')({BUFFER:old},{}),BWValues.UNDEFINED);
        assert.equal(run.errors.length,2);assert.match(String(run.errors[0]),/disposed/i);assert.match(String(run.errors[1]),/not available/i);
    }finally{clearStrayTimers();}
});

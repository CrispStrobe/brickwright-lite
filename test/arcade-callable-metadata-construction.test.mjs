import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {EventEmitter} from 'node:events';
import {loadExtensionClass} from './helpers/bw-extensions.mjs';
const require=createRequire(import.meta.url);
const values=require('../overlay/scratch-vm/src/util/bw-values.js');
const CallableValues=require('../overlay/scratch-vm/src/extensions/crispstrobe/arcade/callable-values.js');

test('Arcade metadata-only construction exposes its actual blocks without granting callable resources',()=>{
    const Arcade=loadExtensionClass('arcade');
    const extension=new Arcade();
    const info=extension.getInfo();
    const owner=extension._inst;
    assert.equal(info.id,'arcade');
    assert.ok(info.blocks.some(block=>block.opcode==='createCallable'));
    assert.throws(()=>extension.holdCallable('foreign'),/bound runtime/);
    assert.throws(()=>extension.invokeHeldCallable('foreign',[]),/bound runtime/);
    assert.throws(()=>owner._callableValues.declare({},{}),/bound runtime/);
    assert.throws(()=>owner._callableValues.create({},'body'),/bound runtime/);
    assert.doesNotThrow(()=>owner._callableDispatch.dispose());
    assert.doesNotThrow(()=>owner._callableValues.dispose());
});

test('inert callable service cannot acquire authority from later runtime attachment',()=>{
    for(const metadataRuntime of [undefined,{}]) {
        const service=new CallableValues(metadataRuntime,values);
        const runtime=new EventEmitter();runtime.targets=[];
        service.runtime=runtime;
        assert.throws(()=>service.declare({},{}),/bound runtime/);
        assert.throws(()=>service.create({},'body'),/bound runtime/);
        assert.throws(()=>service.invocation(values.UNDEFINED,[]),/bound runtime/);
        assert.doesNotThrow(()=>service.dispose());
    }
});

test('bound callable service preserves listener cleanup and rejects foreign or disposed resources',()=>{
    const runtime=new EventEmitter();runtime.targets=[];
    const service=new CallableValues(runtime,values);
    for(const event of ['PROJECT_START','PROJECT_STOP_ALL','PROJECT_LOADED','RUNTIME_DISPOSED'])assert.equal(runtime.listenerCount(event),1);
    assert.throws(()=>service.declare({},{}),/Unknown callable definition fields|Invalid callable definition/);
    assert.throws(()=>service.invocation(values.UNDEFINED,[]),/Stale or foreign callable/);
    service.dispose();
    for(const event of ['PROJECT_START','PROJECT_STOP_ALL','PROJECT_LOADED','RUNTIME_DISPOSED'])assert.equal(runtime.listenerCount(event),0);
    assert.throws(()=>service.invocation(values.UNDEFINED,[]),/Stale or foreign callable/);
});

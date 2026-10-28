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
    assert.equal(values.decode(extension.createCallable({NAME:'body'})),undefined);
    assert.equal(values.decode(extension.callCallable({CALLABLE:values.UNDEFINED,ARGS:'[]'})),undefined);
    assert.equal(owner._callableValues.resources.size,0);
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
    const events=['PROJECT_START','PROJECT_STOP_ALL','PROJECT_LOADED','RUNTIME_DISPOSED'];
    const foreignCalls=new Map(events.map(event=>[event,0]));
    const initial=new Map(events.map(event=>{
        runtime.on(event,()=>foreignCalls.set(event,foreignCalls.get(event)+1));
        return [event,runtime.listeners(event)];
    }));
    const service=new CallableValues(runtime,values);
    for(const event of events) {
        const listeners=runtime.listeners(event);
        assert.deepEqual(listeners.filter(listener=>initial.get(event).includes(listener)),initial.get(event));
        assert.equal(listeners.filter(listener=>listener===service.events.get(event)).length,1);
        assert.equal(new Set(listeners).size,listeners.length,'lifecycle handlers are not duplicated');
        const generation=service.generation;
        runtime.emit(event);
        assert.equal(service.generation,generation+1,'one callable reset per lifecycle event');
        assert.equal(foreignCalls.get(event),1);
    }
    assert.throws(()=>service.declare({},{}),/Unknown callable definition fields|Invalid callable definition/);
    assert.throws(()=>service.invocation(values.UNDEFINED,[]),/Stale or foreign callable/);
    service.dispose();
    for(const event of events)assert.deepEqual(runtime.listeners(event),initial.get(event));
    service.dispose();
    const generation=service.generation;
    for(const event of events) {
        assert.deepEqual(runtime.listeners(event),initial.get(event),'repeated disposal preserves foreign listeners');
        runtime.emit(event);
        assert.equal(foreignCalls.get(event),2);
    }
    assert.equal(service.generation,generation,'disposed service receives no later lifecycle events');
    assert.throws(()=>service.invocation(values.UNDEFINED,[]),/Stale or foreign callable/);
});

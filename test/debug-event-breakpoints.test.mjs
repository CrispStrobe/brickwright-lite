import test from 'node:test';
import assert from 'node:assert/strict';

import {
    compileEventBreakpoint,
    EventBreakpointEngine
} from '../overlay/scratch-gui/src/lib/bw-debug/event-breakpoints.js';

const capabilities = {
    eventKinds: ['instruction', 'memory', 'port', 'interrupt', 'register', 'signal'],
    addressSpaces: {ram: {passive: true}, device: {passive: false}},
    maxConditionReads: 4
};

test('arbitrates every match in creation and action order with one halt decision', () => {
    const engine = new EventBreakpointEngine(capabilities);
    engine.add({id: 'first', kind: 'execute', address: 0x100, actions: [{type: 'log'}, {type: 'halt'}]});
    engine.add({id: 'second', kind: 'execute', start: 0x100, end: 0x110,
        actions: [{type: 'checkpoint'}, {type: 'halt'}]});
    const plan = engine.evaluate({kind: 'instruction', pcBefore: 0x100});
    assert.deepEqual(plan.matchingIds, ['first', 'second']);
    assert.equal(plan.halt, true);
    assert.deepEqual(plan.actions.map(action => [action.breakpointId, action.type]), [
        ['first', 'log'], ['first', 'halt'], ['second', 'checkpoint'], ['second', 'halt']
    ]);
});

test('supports memory space/range/direction/change and port/interrupt/register/signal predicates', () => {
    const engine = new EventBreakpointEngine(capabilities);
    engine.add({id: 'mem', kind: 'memory', space: 'ram', start: 4, end: 8, direction: 'write', change: true});
    engine.add({id: 'port', kind: 'port', portAddress: 0x3f8, direction: 'write'});
    engine.add({id: 'irq', kind: 'interrupt', phase: 'acknowledge', vector: 8});
    engine.add({id: 'reg', kind: 'register', register: 'A', from: 1, to: 2, change: true});
    engine.add({id: 'pin', kind: 'signal', signal: 'irq', edge: 'rising'});
    assert.deepEqual(engine.evaluate({kind: 'memory', memory: {space: 'ram', address: 6,
        direction: 'write', before: 1, value: 2}}).matchingIds, ['mem']);
    assert.deepEqual(engine.evaluate({kind: 'port', port: {address: 0x3f8, direction: 'write'}}).matchingIds, ['port']);
    assert.deepEqual(engine.evaluate({kind: 'interrupt', phase: 'acknowledge', interrupt: {vector: 8}}).matchingIds, ['irq']);
    assert.deepEqual(engine.evaluate({kind: 'instruction', changes: {registers: {A: {before: 1, after: 2}}}}).matchingIds, ['reg']);
    assert.deepEqual(engine.evaluate({kind: 'signal', signal: {name: 'irq', before: 0, value: 1}}).matchingIds, ['pin']);
});

test('applies ignore, modulo and exact hit counts and disables one-shot breakpoints', () => {
    const engine = new EventBreakpointEngine(capabilities);
    engine.add({id: 'periodic', kind: 'execute', address: 7, ignoreCount: 1, modulo: 2});
    engine.add({id: 'third', kind: 'execute', address: 7, hitCount: 3, oneShot: true});
    const ids = Array.from({length: 5}, () => engine.evaluate({kind: 'instruction', pcBefore: 7}).matchingIds);
    assert.deepEqual(ids, [[], [], ['periodic', 'third'], [], ['periodic']]);
});

test('supports event, time and context count predicates', () => {
    const engine = new EventBreakpointEngine(capabilities);
    engine.add({id: 'any-port', kind: 'event', eventKind: 'port'});
    engine.add({id: 'deadline', kind: 'time', domain: 'oscillator', at: 20});
    engine.add({id: 'cycles', kind: 'count', counter: 'cycles', at: 9});
    assert.deepEqual(engine.evaluate({kind: 'port', time: {domain: 'oscillator', ticks: 20}},
        {counts: {cycles: 9}}).matchingIds, ['any-port', 'deadline', 'cycles']);
    assert.deepEqual(engine.evaluate({kind: 'instruction', time: {domain: 'oscillator', ticks: 21n}},
        {counts: {cycles: 0}}).matchingIds, ['deadline']);
});

test('conditions are delegated to a bounded evaluator and never evaluated as JavaScript', () => {
    let request;
    const evaluator = {compile(source, limits) {
        request = {source, limits};
        return {test: ({event}) => event.pcBefore === 5};
    }};
    const engine = new EventBreakpointEngine(capabilities, evaluator);
    assert.equal(engine.add({id: 'safe', kind: 'execute', address: 5, condition: 'pc = 5',
        conditionReads: [{space: 'ram', address: 1}]}).ok, true);
    assert.equal(request.limits.maxReads, 4);
    assert.deepEqual(engine.evaluate({kind: 'instruction', pcBefore: 5}).matchingIds, ['safe']);
});

test('compile refusals name unsupported events, spaces, destructive reads and writes', () => {
    assert.equal(compileEventBreakpoint({id: 'cycle', kind: 'event', eventKind: 'bus'},
        capabilities).refusal.code, 'unsupported-event-kind');
    assert.equal(compileEventBreakpoint({id: 'bad-space', kind: 'memory', space: 'rom'},
        capabilities).refusal.code, 'unsupported-address-space');
    const evaluator = {compile: () => ({test: () => true})};
    assert.equal(compileEventBreakpoint({id: 'destructive', kind: 'execute', address: 1,
        condition: 'x = 1', conditionReads: [{space: 'device', address: 2}]},
    capabilities, evaluator).refusal.code, 'destructive-read');
    assert.equal(compileEventBreakpoint({id: 'write', kind: 'execute', address: 1,
        actions: [{type: 'write'}]}, capabilities).refusal.code, 'write-action-disabled');
});

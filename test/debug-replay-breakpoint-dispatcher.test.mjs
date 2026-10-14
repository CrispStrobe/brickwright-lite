import test from 'node:test';
import assert from 'node:assert/strict';

import {EventBreakpointEngine} from '../overlay/scratch-gui/src/lib/bw-debug/event-breakpoints.js';
import {createEventBreakpointDispatcher} from
    '../overlay/scratch-gui/src/lib/bw-debug/event-breakpoint-dispatcher.js';

const capabilities = {
    eventKinds: ['instruction', 'memory', 'port'],
    addressSpaces: {mem: {passive: true}},
    allowBreakpointWrites: true
};
const event = (seq, fields) => ({schema: 1, seq, time: {ticks: seq + 1, domain: 'cpu'},
    cpuId: 'cpu0', fidelity: 'recorded', ...fields});

test('replay reconstruction defers interior counters in recorded order and suppresses external actions', () => {
    const engine = new EventBreakpointEngine(capabilities);
    const externalActions = ['log', 'checkpoint', 'write', 'halt'];
    assert.equal(engine.add({id: 'memory', kind: 'memory', space: 'mem', address: 0x20,
        oneShot: true, actions: [
            {type: 'counter', counter: 'hits', delta: 2},
            ...externalActions.map(type => ({type}))
        ]}).ok, true);
    assert.equal(engine.add({id: 'port', kind: 'port', port: 0x63, actions: [
        {type: 'counter', counter: 'hits', delta: 3},
        ...externalActions.map(type => ({type}))
    ]}).ok, true);
    assert.equal(engine.add({id: 'retire', kind: 'execute', address: 0x100, actions: [
        {type: 'counter', counter: 'hits', delta: 4},
        ...externalActions.map(type => ({type}))
    ]}).ok, true);

    const counters = new Map();
    const counterOrder = [];
    // This is intentionally the runner's replay dispatcher shape: only the
    // deterministic host action has a handler. External actions are absent,
    // so reconstruction cannot log, checkpoint, write, or halt.
    const dispatcher = createEventBreakpointDispatcher({engine, suppressedActions: externalActions, handlers: {
        counter: action => {
            const name = String(action.counter || action.breakpointId);
            const value = (counters.get(name) || 0) + action.delta;
            counters.set(name, value);
            counterOrder.push([action.breakpointId, action.triggerEventSeq, value]);
            return value;
        }
    }});
    const reconstruct = recorded => dispatcher.dispatch(recorded, {
        context: {event: recorded, counts: Object.fromEntries(counters)}
    });

    assert.equal(reconstruct(event(0, {kind: 'memory', memory: {
        space: 'mem', address: 0x20, value: 1, direction: 'write'
    }})).deferred, true);
    assert.equal(reconstruct(event(1, {kind: 'port', port: {
        address: 0x63, value: 2, direction: 'write'
    }})).deferred, true);
    assert.equal(counters.size, 0, 'interior-event host actions wait for the safe retire boundary');

    const retired = reconstruct(event(2, {kind: 'instruction', phase: 'retire',
        pcBefore: 0x100, pcAfter: 0x102}));
    assert.deepEqual(counterOrder, [['memory', 0, 2], ['port', 1, 5], ['retire', 2, 9]]);
    assert.equal(counters.get('hits'), 9);
    assert.equal(engine.list().find(item => item.id === 'memory').enabled, false,
        'deterministic one-shot predicate state advances during reconstruction');
    assert.deepEqual(retired.triggerEventSeqs, [0, 1, 2],
        'flush provenance includes the matching retire as well as interior triggers');
    assert.deepEqual(retired.outcome.failures, [],
        'explicitly suppressed external actions are not reported as handler failures');
    assert.deepEqual(new Set(retired.suppressedActions.map(action => action.type)),
        new Set(externalActions));
    assert.equal(retired.outcome.halted, false, 'an absent halt handler cannot pause replay');
    assert.equal(dispatcher.pending().plans, 0);
});

import test from 'node:test';
import assert from 'node:assert/strict';

import {
    compileEventBreakpoint,
    EventBreakpointEngine,
    executeBreakpointPlan
} from '../overlay/scratch-gui/src/lib/bw-debug/event-breakpoints.js';

const capabilities = {
    eventKinds: [
        'instruction', 'memory', 'port', 'interrupt', 'register', 'signal',
        'scheduler', 'device'
    ],
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

test('lifecycle summaries are defensive and expose no compiled predicates or action payloads', () => {
    const engine = new EventBreakpointEngine(capabilities, {compile: () => ({test: () => true})});
    const added = engine.add({id: 'safe', kind: 'execute', address: 7,
        condition: 'secret expression', actions: [{type: 'log', template: 'secret'}, {type: 'halt'}]});
    assert.equal(added.ok, true);
    assert.equal(typeof added.breakpoint.test, 'undefined');
    assert.deepEqual(added.breakpoint.actionTypes, ['log', 'halt']);
    assert.equal(Object.hasOwn(added.breakpoint, 'actions'), false);
    assert.equal(Object.hasOwn(added.breakpoint, 'condition'), false);

    added.breakpoint.actionTypes.push('write');
    added.breakpoint.requiredEventKinds.push('device');
    added.breakpoint.enabled = false;
    const listed = engine.list()[0];
    assert.deepEqual(listed.actionTypes, ['log', 'halt']);
    assert.deepEqual(listed.requiredEventKinds, ['instruction']);
    assert.equal(listed.enabled, true);
    assert.equal(typeof listed.test, 'undefined');
});

test('generation-safe lifecycle rejects stale controls when an id is reused', () => {
    const engine = new EventBreakpointEngine(capabilities);
    const first = engine.add({id: 'same', kind: 'execute', address: 1}).breakpoint;
    assert.equal(engine.add({id: 'same', kind: 'execute', address: 2}).refusal.code, 'duplicate-id');
    assert.equal(engine.disable('same', first.generation), true);
    assert.equal(engine.list()[0].enabled, false);
    assert.equal(engine.enable('same', first.generation), true);
    assert.equal(engine.enable('same', first.generation), false,
        'an idempotent control is not a new breakpoint generation');
    assert.equal(engine.remove('same', first.generation), true);

    const replacement = engine.add({id: 'same', kind: 'execute', address: 2}).breakpoint;
    assert.notEqual(replacement.generation, first.generation);
    assert.equal(engine.disable('same', first.generation), false);
    assert.equal(engine.setEnabled('same', false, first.generation), false);
    assert.equal(engine.remove('same', first.generation), false);
    assert.equal(engine.list()[0].enabled, true);
    assert.equal(engine.evaluate({kind: 'instruction', pcBefore: 2}).matchingIds[0], 'same');
});

test('clear returns its count, empties summaries, and never recycles generations', () => {
    const engine = new EventBreakpointEngine(capabilities);
    const first = engine.add({id: 'one', kind: 'execute', address: 1}).breakpoint;
    engine.add({id: 'two', kind: 'execute', address: 2});
    assert.equal(engine.clear(), 2);
    assert.deepEqual(engine.list(), []);
    assert.equal(engine.clear(), 0);
    const later = engine.add({id: 'one', kind: 'execute', address: 3}).breakpoint;
    assert.ok(later.generation > first.generation);
    assert.equal(engine.disable('one', first.generation), false);
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

test('supports source, block, task, scheduler, device and call predicates', () => {
    const engine = new EventBreakpointEngine(capabilities);
    engine.add({id: 'line', kind: 'source', file: 'main.c', line: 9});
    engine.add({id: 'block', kind: 'block', blockId: 'turn'});
    engine.add({id: 'task', kind: 'task', task: 'main', state: 'ready'});
    engine.add({id: 'switch', kind: 'scheduler', event: 'switch', task: 'worker'});
    engine.add({id: 'uart', kind: 'device', deviceId: 'uart0', event: 'tx-ready'});
    engine.add({id: 'return', kind: 'call', phase: 'return', depth: 1});

    assert.deepEqual(engine.evaluate({kind: 'instruction', source: {
        file: 'main.c', line: 9, blockId: 'turn', task: 'main', state: 'ready'
    }}).matchingIds, ['line', 'block', 'task']);
    assert.deepEqual(engine.evaluate({kind: 'scheduler', scheduler: {
        event: 'switch', task: 'worker', state: 'running'
    }}).matchingIds, ['switch']);
    assert.deepEqual(engine.evaluate({kind: 'device', device: {
        id: 'uart0', event: 'tx-ready'
    }}).matchingIds, ['uart']);
    assert.deepEqual(engine.evaluate({kind: 'instruction', instruction: {
        controlFlow: 'return', depth: 1
    }}).matchingIds, ['return']);
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

test('executes every ordered action before one halt and reports failures as data', () => {
    const calls = [];
    const errors = [];
    const plan = {
        matchingIds: ['a', 'b'],
        halt: true,
        actions: [
            {breakpointId: 'a', actionIndex: 0, type: 'log'},
            {breakpointId: 'a', actionIndex: 1, type: 'halt'},
            {breakpointId: 'b', actionIndex: 0, type: 'checkpoint'},
            {breakpointId: 'b', actionIndex: 1, type: 'capture'}
        ]
    };
    const outcome = executeBreakpointPlan(plan, {
        log: action => calls.push(action.type),
        checkpoint: action => calls.push(action.type),
        capture: () => { throw new Error('sink full'); },
        halt: cause => calls.push(`halt:${cause.matchingIds.join(',')}`),
        onActionError: failure => errors.push(failure)
    });
    assert.deepEqual(calls, ['log', 'checkpoint', 'halt:a,b']);
    assert.equal(outcome.halted, true);
    assert.equal(outcome.failures[0].code, 'breakpoint-action-failed');
    assert.equal(outcome.failures[0].message, 'sink full');
    assert.deepEqual(errors, outcome.failures);
});

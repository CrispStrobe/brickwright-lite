import test from 'node:test';
import assert from 'node:assert/strict';

import {createEventBreakpointDispatcher} from
    '../overlay/scratch-gui/src/lib/bw-debug/event-breakpoint-dispatcher.js';

const event = (overrides = {}) => ({
    schema: 1,
    seq: 4,
    time: {ticks: 9, domain: 'cpu', hz: 1_000_000},
    cpuId: 'cpu0',
    kind: 'instruction',
    phase: 'retire',
    fidelity: 'recorded',
    pcBefore: 0x100,
    pcAfter: 0x101,
    ...overrides
});

test('evaluates one canonical forward event and executes actions before one aggregate halt', () => {
    const calls = [];
    let evaluations = 0;
    let evaluatedEvent;
    const engine = {evaluate (canonical, context) {
        evaluations++;
        evaluatedEvent = canonical;
        calls.push(`evaluate:${context.token}`);
        return {
            matchingIds: ['first', 'second'],
            halt: true,
            actions: [
                {breakpointId: 'first', actionIndex: 0, type: 'log'},
                {breakpointId: 'first', actionIndex: 1, type: 'halt'},
                {breakpointId: 'second', actionIndex: 0, type: 'checkpoint'},
                {breakpointId: 'second', actionIndex: 1, type: 'halt'}
            ]
        };
    }};
    const dispatcher = createEventBreakpointDispatcher({engine, handlers: {
        log: (_action, context) => calls.push(`log:${context.token}`),
        checkpoint: (_action, context) => calls.push(`checkpoint:${context.token}`),
        halt: (cause, context) => calls.push(`halt:${cause.matchingIds.join(',')}:${context.token}`)
    }});

    const input = event({unknownOptionalFutureField: {large: 'payload'}});
    const result = dispatcher.dispatch(input, {context: {token: 'forward'}});
    assert.equal(evaluations, 1);
    assert.notEqual(evaluatedEvent, input);
    assert.equal(Object.hasOwn(evaluatedEvent, 'unknownOptionalFutureField'), false,
        'the engine receives the normalized canonical event');
    assert.deepEqual(calls, [
        'evaluate:forward', 'log:forward', 'checkpoint:forward', 'halt:first,second:forward'
    ]);
    assert.equal(result.suppressed, false);
    assert.equal(result.outcome.halted, true);
    assert.deepEqual(result.outcome.matchingIds, ['first', 'second']);
});

test('replay suppression occurs before validation, predicate state, and side effects', () => {
    let evaluations = 0;
    let sideEffects = 0;
    const dispatcher = createEventBreakpointDispatcher({
        engine: {evaluate () { evaluations++; return {matchingIds: [], halt: false, actions: []}; }},
        handlers: {log: () => { sideEffects++; }, halt: () => { sideEffects++; }}
    });

    const result = dispatcher.dispatch({not: 'a canonical event'}, {replay: true});
    assert.deepEqual(result, {
        suppressed: true, reason: 'replay', event: null, plan: null, outcome: null,
        clearedPendingPlans: 0
    });
    assert.equal(evaluations, 0);
    assert.equal(sideEffects, 0);
});

test('forward dispatch fails closed for malformed events and invalid replay flags', () => {
    let evaluations = 0;
    const dispatcher = createEventBreakpointDispatcher({engine: {
        evaluate () { evaluations++; return {matchingIds: [], halt: false, actions: []}; }
    }});
    assert.throws(() => dispatcher.dispatch({...event(), schema: 99}), /unsupported schema/);
    assert.throws(() => dispatcher.dispatch(event(), {replay: 'yes'}), /replay must be a boolean/);
    assert.equal(evaluations, 0);
});

test('defers in-instruction matches and flushes ordered actions with one halt at retire', () => {
    const calls = [];
    const engine = {evaluate (canonical) {
        const id = canonical.kind;
        return {
            matchingIds: [id],
            halt: true,
            actions: [
                {breakpointId: id, actionIndex: 0, type: 'log'},
                {breakpointId: id, actionIndex: 1, type: 'halt'}
            ]
        };
    }};
    const dispatcher = createEventBreakpointDispatcher({engine, handlers: {
        log: action => calls.push(action.breakpointId),
        halt: cause => calls.push(`halt:${cause.matchingIds.join(',')}`)
    }});
    const memory = dispatcher.dispatch(event({seq: 1, kind: 'memory', phase: undefined,
        memory: {space: 'ram', address: 2, value: 3}}));
    const port = dispatcher.dispatch(event({seq: 2, kind: 'port', phase: undefined,
        port: {address: 4, direction: 'write'}}));
    assert.equal(memory.deferred, true);
    assert.equal(port.deferred, true);
    assert.deepEqual(calls, []);
    assert.deepEqual(dispatcher.pending(), {plans: 2, maxPendingPlans: 1024});

    const retired = dispatcher.dispatch(event({seq: 3}));
    assert.equal(retired.flushedPlans, 2);
    assert.deepEqual(calls, ['memory', 'port', 'instruction', 'halt:memory,port,instruction']);
    assert.equal(retired.outcome.halted, true);
    assert.deepEqual(dispatcher.pending(), {plans: 0, maxPendingPlans: 1024});
    assert.deepEqual(retired.triggerEventSeqs, [1, 2, 3],
        'provenance includes the retire event that contributed its own decision');
});

test('suppressed replay actions are no-ops without concealing counter failures', () => {
    const dispatcher = createEventBreakpointDispatcher({
        engine: {evaluate: () => ({
            matchingIds: ['replay-state'],
            halt: true,
            actions: [
                {breakpointId: 'replay-state', actionIndex: 0, type: 'counter'},
                {breakpointId: 'replay-state', actionIndex: 1, type: 'log'},
                {breakpointId: 'replay-state', actionIndex: 2, type: 'halt'}
            ]
        })},
        suppressedActions: ['log', 'halt'],
        handlers: {counter: () => { throw new Error('counter reconstruction failed'); }}
    });

    const result = dispatcher.dispatch(event({seq: 12}));
    assert.deepEqual(result.suppressedActions.map(action => action.type), ['log', 'halt']);
    assert.equal(result.outcome.halted, false);
    assert.deepEqual(result.outcome.failures, [{
        code: 'breakpoint-action-failed',
        breakpointId: 'replay-state',
        actionIndex: 0,
        actionType: 'counter',
        message: 'counter reconstruction failed'
    }]);
    assert.equal(result.plan.actions.every(action => action.triggerEventSeq === 12), true,
        'historical plan retains complete per-action trigger provenance');
});

test('checkpoint arbitration captures actions declared after the checkpoint', () => {
    let counter = 0;
    const capturedCounters = [];
    const calls = [];
    const dispatcher = createEventBreakpointDispatcher({
        engine: {evaluate: () => ({
            matchingIds: ['boundary'],
            halt: true,
            actions: [
                {breakpointId: 'boundary', actionIndex: 0, type: 'checkpoint'},
                {breakpointId: 'boundary', actionIndex: 1, type: 'counter'},
                {breakpointId: 'boundary', actionIndex: 2, type: 'halt'}
            ]
        })},
        recordingSession: {
            status: () => ({active: true}),
            checkpoint: () => {
                calls.push('checkpoint');
                capturedCounters.push(counter);
                return {accepted: true};
            }
        },
        handlers: {
            counter: () => { calls.push('counter'); counter++; },
            halt: () => calls.push('halt')
        }
    });

    const result = dispatcher.dispatch(event({seq: 13}));
    assert.deepEqual(calls, ['counter', 'checkpoint', 'halt']);
    assert.deepEqual(capturedCounters, [1],
        'the checkpoint sees host state after every non-checkpoint boundary action');
    assert.deepEqual(result.plan.actions.map(action => action.type),
        ['checkpoint', 'counter', 'halt'], 'the historical plan retains declaration order');
    assert.deepEqual(result.outcome.results.map(item => item.actionType), ['counter', 'checkpoint']);
});

test('signal/device/scheduler decisions execute immediately without flushing queued plans', () => {
    const calls = [];
    const engine = {evaluate: canonical => ({
        matchingIds: [canonical.kind], halt: true,
        actions: [{breakpointId: canonical.kind, actionIndex: 0, type: 'halt'}]
    })};
    const dispatcher = createEventBreakpointDispatcher({engine, handlers: {
        halt: cause => calls.push(cause.matchingIds.join(','))
    }});
    dispatcher.dispatch(event({kind: 'interrupt', phase: 'acknowledge', interrupt: {vector: 1}}));
    for (const [seq, kind, details] of [
        [5, 'signal', {signal: {name: 'irq', value: 1}}],
        [6, 'device', {device: {id: 'uart'}}],
        [7, 'scheduler', {scheduler: {event: 'switch'}}]
    ]) dispatcher.dispatch(event({seq, kind, phase: undefined, ...details}));
    assert.deepEqual(calls, ['signal', 'device', 'scheduler']);
    assert.equal(dispatcher.pending().plans, 1);
});

test('replay clears deferred plans and bounded overflow is structured and side-effect free', () => {
    let effects = 0;
    const engine = {evaluate: canonical => ({
        matchingIds: [String(canonical.seq)], halt: true,
        actions: [{breakpointId: String(canonical.seq), actionIndex: 0, type: 'halt'}]
    })};
    const dispatcher = createEventBreakpointDispatcher({
        engine, maxPendingPlans: 1, handlers: {halt: () => { effects++; }}
    });
    dispatcher.dispatch(event({seq: 1, kind: 'memory', phase: undefined,
        memory: {space: 'ram', address: 0, value: 0}}));
    const overflow = dispatcher.dispatch(event({seq: 2, kind: 'port', phase: undefined,
        port: {address: 0, direction: 'read'}}));
    assert.deepEqual(overflow.failure, {
        code: 'breakpoint-pending-overflow', maxPendingPlans: 1, pendingPlans: 1
    });
    assert.equal(effects, 0);
    const replay = dispatcher.dispatch(null, {replay: true});
    assert.equal(replay.clearedPendingPlans, 1);
    assert.equal(dispatcher.pending().plans, 0);
    dispatcher.dispatch(event({seq: 3}));
    assert.equal(effects, 1, 'the retired forward event halts only for its own plan');
});

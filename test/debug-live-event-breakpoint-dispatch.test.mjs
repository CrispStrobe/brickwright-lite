import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

import {EventBreakpointEngine} from '../overlay/scratch-gui/src/lib/bw-debug/event-breakpoints.js';
import {I8086Machine, BLINK8086} from '../overlay/scratch-gui/src/lib/bw-board/i8086-machine.js';
import {createI8086DebugTarget} from '../overlay/scratch-gui/src/lib/bw-board/i8086-debug.js';
import {createDebugEventStream} from '../overlay/scratch-gui/src/lib/bw-debug/event-stream.js';

const loadDispatcher = async () => {
    const module = await import('../overlay/scratch-gui/src/lib/bw-debug/event-breakpoint-dispatcher.js');
    assert.equal(typeof module.createEventBreakpointDispatcher, 'function');
    return module.createEventBreakpointDispatcher;
};

const capabilities = {
    eventKinds: ['instruction', 'memory', 'port', 'interrupt'],
    addressSpaces: {mem: {passive: true}}
};
let sequence = 0;
const event = fields => ({schema: 1, seq: sequence++, time: {ticks: sequence, domain: 'cpu'},
    cpuId: 'cpu0', fidelity: 'recorded', ...fields});

test('live plans preserve creation/action order and aggregate one safe-boundary halt', async () => {
    const create = await loadDispatcher();
    const engine = new EventBreakpointEngine(capabilities);
    engine.add({id: 'first', kind: 'port', port: 0x63,
        actions: [{type: 'log'}, {type: 'halt'}]});
    engine.add({id: 'second', kind: 'port', port: 0x63,
        actions: [{type: 'capture'}, {type: 'halt'}]});
    const calls = [];
    const dispatcher = create({engine, recordingSession: {status: () => ({active: false})},
        handlers: {
            log: action => calls.push(`log:${action.breakpointId}`),
            capture: action => calls.push(`capture:${action.breakpointId}`),
            halt: cause => calls.push(`halt:${cause.matchingIds.join(',')}`)
        }});

    dispatcher.dispatch(event({kind: 'port', phase: 'access',
        port: {address: 0x63, direction: 'write'}}));
    assert.deepEqual(calls, [], 'an interior-event plan may be held for its safe retire boundary');
    dispatcher.dispatch(event({kind: 'instruction', phase: 'retire', pcBefore: 0x100, pcAfter: 0x102}));
    assert.deepEqual(calls, ['log:first', 'capture:second', 'halt:first,second'],
        'interior events defer and aggregate exactly one halt at a replayable retire boundary');
});

test('checkpoint actions run only during recording and failures remain observable', async () => {
    const create = await loadDispatcher();
    const engine = new EventBreakpointEngine(capabilities);
    engine.add({id: 'cp', kind: 'port', port: 1,
        actions: [{type: 'checkpoint'}, {type: 'capture'}]});
    let active = false;
    let checkpoints = 0;
    const failures = [];
    const dispatcher = create({engine, recordingSession: {
        status: () => ({active}),
        checkpoint: () => { checkpoints++; return {accepted: true}; }
    }, handlers: {
        capture: () => { throw new Error('capture sink full'); },
        onActionError: failure => failures.push(failure)
    }});

    dispatcher.dispatch(event({kind: 'port', port: {address: 1, direction: 'write'}}));
    const stopped = dispatcher.dispatch(event({kind: 'instruction', phase: 'retire',
        pcBefore: 0, pcAfter: 1})).outcome;
    assert.equal(checkpoints, 0);
    assert.deepEqual(stopped.failures.map(failure => failure.actionType), ['checkpoint', 'capture']);
    assert.deepEqual(failures, stopped.failures, 'action failures must reach an observable sink');

    active = true;
    dispatcher.dispatch(event({kind: 'port', port: {address: 1, direction: 'write'}}));
    const recording = dispatcher.dispatch(event({kind: 'instruction', phase: 'retire',
        pcBefore: 1, pcAfter: 2})).outcome;
    assert.equal(checkpoints, 1);
    assert.deepEqual(recording.failures.map(failure => failure.actionType), ['capture']);
});

test('replay suppresses evaluation, breakpoint state changes, actions, and pending halts', async () => {
    const create = await loadDispatcher();
    const engine = new EventBreakpointEngine(capabilities);
    engine.add({id: 'once', kind: 'port', port: 2, oneShot: true,
        actions: [{type: 'log'}, {type: 'halt'}]});
    const calls = [];
    const dispatcher = create({engine, recordingSession: {status: () => ({active: false})},
        handlers: {log: () => calls.push('log'), halt: () => calls.push('halt')}});

    assert.equal(dispatcher.dispatch(event({kind: 'port', port: {address: 2, direction: 'write'}}),
        {replay: true}).suppressed, true);
    dispatcher.dispatch(event({kind: 'instruction', phase: 'retire', pcBefore: 0, pcAfter: 1}),
        {replay: true});
    assert.deepEqual(calls, []);
    dispatcher.dispatch(event({kind: 'port', port: {address: 2, direction: 'write'}}));
    dispatcher.dispatch(event({kind: 'instruction', phase: 'retire', pcBefore: 0, pcAfter: 1}));
    assert.deepEqual(calls, ['log', 'halt'],
        'replay must not consume the one-shot breakpoint or manufacture a pending halt');
});

test('real 8086 port and memory matches halt only on their following retires', async () => {
    const create = await loadDispatcher();
    const machine = new I8086Machine(BLINK8086);
    machine.cpu.cs = 0;
    machine.cpu.ip = 0x100;
    // mov al,89h; out 63h,al; mov [0200h],al
    machine.mem.set([0xb0, 0x89, 0xe6, 0x63, 0xa2, 0x00, 0x02], 0x100);
    const target = createI8086DebugTarget({machine});
    const engine = new EventBreakpointEngine(capabilities);
    assert.equal(engine.add({id: 'port', kind: 'port', port: 0x63}).ok, true);
    assert.equal(engine.add({id: 'memory', kind: 'memory', space: 'mem', address: 0x200,
        direction: 'write'}).ok, true);
    const halts = [];
    const order = [];
    const dispatcher = create({engine, recordingSession: {status: () => ({active: false})},
        handlers: {halt: cause => {
            order.push('halt');
            halts.push({cause, pc: machine.cpu.pc});
        }}});
    const stream = createDebugEventStream();
    stream.onEvent(published => {
        order.push(published.kind);
        dispatcher.dispatch(published);
    });
    target.onDebugEvent(fact => stream.publish(fact));

    machine.step();
    machine.step();
    assert.deepEqual(halts.map(item => item.cause.matchingIds), [['port']]);
    assert.equal(halts[0].pc, 0x104, 'OUT halt is delivered after OUT retires');
    assert.deepEqual(order.slice(-3), ['port', 'instruction', 'halt']);
    machine.step();
    assert.deepEqual(halts.map(item => item.cause.matchingIds), [['port'], ['memory']]);
    assert.equal(halts[1].pc, 0x107, 'memory halt is delivered after MOV retires');
    assert.deepEqual(order.slice(-3), ['memory', 'instruction', 'halt']);
});

test('runner wires only published live events and brackets verified replay suppression', () => {
    const runner = readFileSync(new URL(
        '../overlay/scratch-gui/src/lib/bw-debug/debug-runner.js', import.meta.url), 'utf8');
    assert.match(runner, /createEventBreakpointDispatcher/);
    assert.match(runner, /subscribeDebugTargetEvents\(target, eventStream,\s*event => dispatchPublishedEvent\(event\)/);
    assert.match(runner, /eventBreakpointDispatcher\.dispatch\(event/);
    assert.match(runner, /replayingDebugHistory = true[\s\S]*instructionReplay\.reverseToEvent\(eventCursor\)[\s\S]*replayingDebugHistory = false/);
});

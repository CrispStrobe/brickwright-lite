import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

import {EventBreakpointEngine} from '../overlay/scratch-gui/src/lib/bw-debug/event-breakpoints.js';
import {I8086Machine, BLINK8086} from '../overlay/scratch-gui/src/lib/bw-board/i8086-machine.js';
import {createI8086DebugTarget} from '../overlay/scratch-gui/src/lib/bw-board/i8086-debug.js';
import {createZ80Adapter} from '../overlay/scratch-gui/src/lib/bw-board/z80-adapter.js';
import {createZ80DebugTarget} from '../overlay/scratch-gui/src/lib/bw-board/z80-debug.js';
import {createM6502Adapter} from '../overlay/scratch-gui/src/lib/bw-board/m6502-adapter.js';
import {createM6502DebugTarget} from '../overlay/scratch-gui/src/lib/bw-board/m6502-debug.js';
import {createDebugEventStream} from '../overlay/scratch-gui/src/lib/bw-debug/event-stream.js';
import {eventBreakpointCapabilities, normalizeDebugCapabilities} from
    '../overlay/scratch-gui/src/lib/bw-debug/debug-capabilities.js';
import {canRecordEventBreakpointHalt, dispatchEventBreakpointAtBoundary,
    eventBreakpointHaltOccurrence} from
    '../overlay/scratch-gui/src/lib/bw-debug/debug-runner.js';

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
    assert.deepEqual(stopped.failures.map(failure => failure.actionType), ['capture', 'checkpoint'],
        'checkpoint arbitration follows every other boundary action, including failures');
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

test('real Z80 port and memory plans halt after the following retire and replay stays inert', async () => {
    const create = await loadDispatcher();
    const adapter = createZ80Adapter({config: {clockHz: 4_000_000,
        regions: [{kind: 'ram', start: 0, end: 0xffff}], ports: []}});
    adapter.attachBoard({advanceTo() {}});
    const target = createZ80DebugTarget(adapter, {cpuId: 'cpu-z'});
    const capabilities = normalizeDebugCapabilities(target.capabilities(), {target: 'z80'});
    assert.equal(capabilities.extensions.eventBreakpointBoundary, 'instruction-retire');
    adapter.machine.mem.set([0x3e, 0x2a, 0xd3, 0x10, 0x32, 0x00, 0x20], 0);

    const engine = new EventBreakpointEngine(eventBreakpointCapabilities(capabilities));
    assert.equal(engine.add({id: 'port', kind: 'port', port: 0x2a10, oneShot: true,
        actions: [{type: 'counter', counter: 'hits'}, {type: 'log'}, {type: 'halt'}]}).ok, true);
    assert.equal(engine.add({id: 'memory', kind: 'memory', space: 'mem', address: 0x2000,
        direction: 'write'}).ok, true);
    const calls = [];
    let counter = 0;
    const dispatcher = create({engine, recordingSession: {status: () => ({active: false})}, handlers: {
        counter: () => { counter++; calls.push('counter'); },
        log: () => calls.push('log'),
        halt: cause => calls.push(`halt:${cause.matchingIds.join(',')}@${adapter.machine.cpu.pc}`)
    }});
    const facts = [];
    const stream = createDebugEventStream();
    stream.onEvent(event => {
        facts.push(event);
        dispatchEventBreakpointAtBoundary({capabilities, dispatcher, event,
            options: {context: {event, counts: {hits: counter}}}});
    });
    target.onDebugEvent(fact => stream.publish(fact));

    adapter.machine.step();
    adapter.machine.step();
    assert.deepEqual(calls, ['counter', 'log', 'halt:port@4']);
    adapter.machine.step();
    assert.deepEqual(calls, ['counter', 'log', 'halt:port@4', 'halt:memory@7']);

    const liveCalls = [...calls];
    for (const event of facts) {
        dispatchEventBreakpointAtBoundary({capabilities, dispatcher, event,
            options: {replay: true, context: {event, counts: {hits: counter}}}});
    }
    assert.deepEqual(calls, liveCalls, 'replay repeats no counter, log, or halt action');
    assert.equal(counter, 1);
    assert.equal(engine.list().find(item => item.id === 'port').enabled, false,
        'only the forward hit consumes the one-shot breakpoint');
    assert.equal(dispatcher.pending().plans, 0, 'replay leaves no deferred double-fire');
});

test('real 6502 RAM and VIA plans halt after their following retire and replay stays inert', async () => {
    const create = await loadDispatcher();
    const adapter = createM6502Adapter({config: {clockHz: 1_000_000,
        regions: [{kind: 'ram', start: 0, end: 0x5fff},
            {kind: 'ram', start: 0x6010, end: 0xffff}],
        chips: [{kind: 'via', name: 'via1', at: 0x6000}]}});
    adapter.attachBoard({advanceTo() {}, setPin() {}});
    const target = createM6502DebugTarget(adapter, {cpuId: 'cpu-6502'});
    const capabilities = normalizeDebugCapabilities(target.capabilities(), {target: 'eater6502'});
    assert.equal(capabilities.extensions.eventBreakpointBoundary, 'instruction-retire');
    assert.deepEqual(capabilities.spaces.mem,
        {read: true, write: true, passiveRead: false});
    assert.equal(canRecordEventBreakpointHalt(capabilities), true);
    // LDA #$2a; STA $10; LDA #$ff; STA $6002 (VIA DDRB); LDA #$55; STA $6000 (VIA ORB)
    adapter.machine.cpu.pc = 0x0200;
    adapter.machine.mem.set([
        0xa9, 0x2a, 0x85, 0x10, 0xa9, 0xff, 0x8d, 0x02, 0x60,
        0xa9, 0x55, 0x8d, 0x00, 0x60
    ], 0x0200);

    const engine = new EventBreakpointEngine(eventBreakpointCapabilities(capabilities),
        {compile: () => ({test: () => true})});
    assert.equal(engine.add({id: 'ram', kind: 'memory', space: 'mem', address: 0x10,
        direction: 'write', oneShot: true, actions: [{type: 'counter'}, {type: 'halt'}]}).ok, true);
    assert.equal(engine.add({id: 'via', kind: 'memory', space: 'mem', address: 0x6000,
        direction: 'write'}).ok, true);
    assert.equal(engine.add({id: 'condition', kind: 'memory', space: 'mem', address: 0x6000,
        condition: 'x', conditionReads: [{space: 'mem', address: 0x6000}]}).refusal.code,
    'destructive-read', 'MMIO sharing mem keeps condition reads fail-closed');
    let counter = 0;
    const calls = [];
    const dispatcher = create({engine, recordingSession: {status: () => ({active: false})}, handlers: {
        counter: () => { counter++; calls.push('counter'); },
        halt: cause => calls.push(`halt:${cause.matchingIds.join(',')}@${adapter.machine.cpu.pc.toString(16)}`)
    }});
    const facts = [];
    const stream = createDebugEventStream();
    stream.onEvent(event => {
        facts.push(event);
        dispatchEventBreakpointAtBoundary({capabilities, dispatcher, event,
            options: {context: {event, counts: {hits: counter}}}});
    });
    target.onDebugEvent(fact => stream.publish(fact));

    for (let i = 0; i < 6; i++) adapter.machine.step();
    assert.deepEqual(calls, ['counter', 'halt:ram@204', 'halt:via@20e']);
    for (const address of [0x10, 0x6002, 0x6000]) {
        const access = facts.findIndex(event => event.kind === 'memory' &&
            event.memory.direction === 'write' && event.memory.address === address);
        assert.ok(access >= 0 && facts[access + 1]?.kind === 'instruction' &&
            facts[access + 1]?.phase === 'retire', `write ${address.toString(16)} precedes its retire`);
    }

    const liveCalls = [...calls];
    for (const event of facts) dispatchEventBreakpointAtBoundary({capabilities, dispatcher, event,
        options: {replay: true, context: {event, counts: {hits: counter}}}});
    assert.deepEqual(calls, liveCalls);
    assert.equal(counter, 1);
    assert.equal(engine.list().find(item => item.id === 'ram').enabled, false,
        'replay does not consume one-shot state a second time');
    assert.equal(dispatcher.pending().plans, 0);
});

test('halt-ledger admission requires both retire boundary and checkpoint support', () => {
    const good = {recording: ['checkpoint', 'restore'],
        extensions: {eventBreakpointBoundary: 'instruction-retire'}};
    assert.equal(canRecordEventBreakpointHalt(good), true);
    for (const bad of [null, {}, {...good, recording: ['checkpoint']},
        {...good, extensions: {}}, {...good, extensions: {eventBreakpointBoundary: true}},
        {...good, extensions: {eventBreakpointBoundary: 'cycle'}}]) {
        assert.equal(canRecordEventBreakpointHalt(bad), false);
    }
    const result = {triggerEventSeqs: [17, 18], outcome: {halted: true, matchingIds: ['via']}};
    assert.deepEqual(eventBreakpointHaltOccurrence({capabilities: good, result,
        boundaryCursor: 19, generation: 3}), {
        boundaryCursor: 19,
        triggerEventSeq: 17,
        matchingIds: ['via'],
        generation: 3,
        stopSide: 'after',
        source: 'breakpoint-engine'
    });
    assert.equal(eventBreakpointHaltOccurrence({capabilities: {...good, recording: []}, result,
        boundaryCursor: 19, generation: 3}), null,
    'a target without truthful checkpoints cannot enter the replay halt ledger');
});

test('runner wires only published live events and brackets verified replay suppression', () => {
    const runner = readFileSync(new URL(
        '../overlay/scratch-gui/src/lib/bw-debug/debug-runner.js', import.meta.url), 'utf8');
    assert.match(runner, /createEventBreakpointDispatcher/);
    assert.match(runner, /subscribeDebugTargetEvents\(target, eventStream,\s*event => dispatchPublishedEvent\(event\)/);
    assert.match(runner, /dispatchEventBreakpointAtBoundary\(\{capabilities: capsNow\(\)/);
    assert.doesNotMatch(runner, /targetKind !== 'i8086' \|\| !eventBreakpointDispatcher/);
    assert.match(runner, /recordEventBreakpointHalt\(result\)[\s\S]*recordingSession\.status\(\)\.active[\s\S]*checkpointSummary\(\)[\s\S]*if \(!checkpoints\.length\) return;[\s\S]*eventBreakpointHaltOccurrence\(\{capabilities: capsNow\(\)/,
        'halt history requires active recording, a retained checkpoint, and current capabilities');
    const eventLedger = runner.slice(runner.indexOf('function recordEventBreakpointHalt'),
        runner.indexOf('function dispatchPublishedEvent'));
    assert.doesNotMatch(eventLedger,
        /targetKind\s*[!=]==?\s*['"](?:i8086|z80|eater6502)['"]/,
        'event halt history admission must not regress to a CPU-name list');
    assert.match(runner, /replayingDebugHistory = true[\s\S]*instructionReplay\.reverseToEvent\(eventCursor\)[\s\S]*replayingDebugHistory = false/);
});

import test from 'node:test';
import assert from 'node:assert/strict';

import {M6502Machine} from '../overlay/scratch-gui/src/lib/bw-board/m6502-machine.js';
import {createM6502Adapter} from '../overlay/scratch-gui/src/lib/bw-board/m6502-adapter.js';
import {createM6502DebugTarget} from '../overlay/scratch-gui/src/lib/bw-board/m6502-debug.js';
import {Z80Machine} from '../overlay/scratch-gui/src/lib/bw-board/z80-machine.js';
import {createZ80DebugTarget} from '../overlay/scratch-gui/src/lib/bw-board/z80-debug.js';
import {hashReplayValues} from '../overlay/scratch-gui/src/lib/bw-debug/recorder.js';
import {createDebugRecorder} from '../overlay/scratch-gui/src/lib/bw-debug/recorder.js';
import {createDebugEventStream} from '../overlay/scratch-gui/src/lib/bw-debug/event-stream.js';
import {createRecordingSession} from '../overlay/scratch-gui/src/lib/bw-debug/recording-session.js';
import {createInstructionReplayController} from '../overlay/scratch-gui/src/lib/bw-debug/instruction-replay.js';

const m6502Config = (clockHz = 1_000_000, chips = []) => ({
    clockHz, regions: [{kind: 'ram', start: 0, end: 0xffff}], chips
});
const z80Config = (clockHz = 4_000_000, ports = []) => ({
    clockHz, regions: [{kind: 'ram', start: 0, end: 0xffff}], ports
});

const run6502 = (machine, count) => {
    for (let i = 0; i < count; i++) machine.step();
    return hashReplayValues(machine.saveState());
};
const runZ80 = (machine, count) => {
    for (let i = 0; i < count; i++) machine.step();
    return hashReplayValues(machine.saveState());
};

test('6502 target checkpoints replay CPU, memory and paired VIA state deterministically', () => {
    const machine = new M6502Machine({
        clockHz: 1_000_000,
        regions: [
            {kind: 'ram', start: 0, end: 0x5fff},
            {kind: 'ram', start: 0x6010, end: 0xffff}
        ],
        chips: [{kind: 'via', name: 'via1', at: 0x6000}]
    });
    machine.mem.set([0xee, 0x00, 0x60, 0xee, 0x10, 0x00, 0x4c, 0x00, 0x02], 0x0200);
    machine.cpu.pc = 0x0200;
    const target = createM6502DebugTarget({machine});
    assert.deepEqual(target.capabilities().recording, ['checkpoint', 'restore']);
    assert.equal(target.capabilities().steps.includes('cycle'), false);
    assert.deepEqual(target.capabilities().reverse, undefined);

    run6502(machine, 4);
    const checkpoint = target.captureCheckpoint();
    const expected = run6502(machine, 12);
    assert.equal(target.restoreCheckpoint(checkpoint), undefined);
    assert.equal(run6502(machine, 12), expected);
});

test('Z80 target checkpoints replay CPU and memory deterministically', () => {
    const machine = new Z80Machine(z80Config());
    machine.mem.set([0x21, 0x00, 0x80, 0x34, 0xc3, 0x03, 0x00], 0);
    const target = createZ80DebugTarget({machine});
    assert.deepEqual(target.capabilities().recording, ['checkpoint', 'restore']);
    assert.equal(target.capabilities().steps.includes('cycle'), false);
    assert.deepEqual(target.capabilities().reverse, undefined);

    runZ80(machine, 3);
    const checkpoint = target.captureCheckpoint();
    const expected = runZ80(machine, 20);
    assert.equal(target.restoreCheckpoint(checkpoint), undefined);
    assert.equal(runZ80(machine, 20), expected);
});

test('classic targets reverse to a recorded instruction boundary with verified event replay', () => {
    const fixtures = [
        (() => {
            const machine = new M6502Machine(m6502Config());
            machine.mem.set([0xe8, 0xe8, 0x4c, 0x00, 0x02], 0x0200);
            machine.cpu.pc = 0x0200;
            return {machine, target: createM6502DebugTarget({machine})};
        })(),
        (() => {
            const machine = new Z80Machine(z80Config());
            machine.mem.set([0x3c, 0x3c, 0xc3, 0x00, 0x00], 0);
            return {machine, target: createZ80DebugTarget({machine})};
        })()
    ];
    for (const {machine, target} of fixtures) {
        const recorder = createDebugRecorder();
        const eventStream = createDebugEventStream();
        const session = createRecordingSession({recorder, eventStream, getTarget: () => target});
        target.onDebugEvent(event => eventStream.publish(event));
        eventStream.onEvent(event => session.appendBatch([event]));
        assert.equal(session.start().accepted, true);
        machine.step();
        const destination = machine.saveState();
        const eventCursor = eventStream.nextSequence();
        machine.step();
        session.stop();
        const logicalDomain = domain => domain.replace(/-reset-\d+$/, '');
        const replay = createInstructionReplayController({recorder, getTarget: () => target,
            restoreCheckpoint: checkpoint => session.restore(checkpoint.eventCursor),
            subscribeEvents: listener => eventStream.onEvent(listener),
            normalizeTimeDomain: logicalDomain,
            normalizeEvent: event => {
                const {schema, seq, inputCursor, ...fact} = event;
                return {...fact, time: {...fact.time, domain: logicalDomain(fact.time.domain)}};
            }});
        assert.equal(replay.canReverse().accepted, true);
        const result = replay.reverseToEvent(eventCursor);
        assert.equal(result.accepted, true, result.reason);
        assert.deepEqual(machine.saveState(), destination);
    }
});

test('classic replay writes do not leave a stale live watchpoint halt', () => {
    const m6502 = new M6502Machine(m6502Config());
    m6502.mem.set([0xee, 0x00, 0x60, 0xea], 0x0200);
    m6502.cpu.pc = 0x0200;
    const z80 = new Z80Machine(z80Config());
    z80.mem.set([0x32, 0x00, 0x80, 0x00], 0);
    for (const [target, address] of [
        [createM6502DebugTarget({machine: m6502}), 0x6000],
        [createZ80DebugTarget({machine: z80}), 0x8000]
    ]) {
        const breakpoint = target.setBreakpoint({kind: 'write', addr: address});
        assert.equal(target.replayInstruction().accepted, true);
        target.clearBreakpoint(breakpoint);
        target.run();
        assert.equal(target.runFor(1), 'budget');
    }
});

test('checkpoint restore fails closed on schema, topology and incomplete state', () => {
    const one = new M6502Machine(m6502Config());
    const other = new M6502Machine(m6502Config(2_000_000));
    const target = createM6502DebugTarget({machine: one});
    const checkpoint = target.captureCheckpoint();
    assert.equal(target.restoreCheckpoint({...checkpoint, schema: 99}).code,
        'CHECKPOINT_SCHEMA_MISMATCH');
    assert.equal(createM6502DebugTarget({machine: other}).restoreCheckpoint(checkpoint).code,
        'CHECKPOINT_TOPOLOGY_MISMATCH');
    const incomplete = structuredClone(checkpoint);
    delete incomplete.state.cpu.pc;
    assert.equal(target.restoreCheckpoint(incomplete).code, 'INVALID_CHECKPOINT');
});

test('stateful components without paired codecs suppress recording capabilities', () => {
    const m6502 = new M6502Machine({
        clockHz: 1_000_000,
        regions: [{kind: 'ram', start: 0, end: 0x6fff}, {kind: 'ram', start: 0x7001, end: 0xffff}],
        chips: [{kind: 'latch', name: 'lights', at: 0x7000}]
    });
    const mTarget = createM6502DebugTarget({machine: m6502});
    assert.deepEqual(mTarget.capabilities().recording, []);
    assert.equal(mTarget.captureCheckpoint().code, 'INCOMPLETE_CHECKPOINT_STATE');
    assert.match(mTarget.capabilities().extensions.checkpointRefusal[0], /lights/);

    const z80 = new Z80Machine(z80Config(4_000_000,
        [{kind: 'buffer', name: 'switches', at: 0x10}]));
    const zTarget = createZ80DebugTarget({machine: z80});
    assert.deepEqual(zTarget.capabilities().recording, []);
    assert.equal(zTarget.captureCheckpoint().code, 'INCOMPLETE_CHECKPOINT_STATE');
    assert.match(zTarget.capabilities().extensions.checkpointRefusal[0], /switches/);
});

test('host traps are refused because their closure-owned input state is outside Z80Machine', () => {
    const machine = new Z80Machine(z80Config());
    machine.pcTraps.set(5, () => 17);
    const target = createZ80DebugTarget({machine});
    assert.deepEqual(target.capabilities().recording, []);
    assert.match(target.captureCheckpoint().refused, /PC traps/);
});

test('Z80 snapshots include attached tape contents and 128K ROM slots', () => {
    const machine = new Z80Machine({
        ...z80Config(), zx128: true, ula: true
    });
    machine.loadRom128(0, Uint8Array.of(0x12));
    machine.insertTape(Uint8Array.of(3, 0, 0xff, 0x44, 0xbb));
    const target = createZ80DebugTarget({machine});
    assert.deepEqual(target.capabilities().recording, ['checkpoint', 'restore']);
    const checkpoint = target.captureCheckpoint();
    machine.roms[0][0] = 0x99;
    machine.tape.blocks[0].data[0] = 0x88;
    assert.equal(target.restoreCheckpoint(checkpoint), undefined);
    assert.equal(machine.roms[0][0], 0x12);
    assert.equal(machine.tape.blocks[0].data[0], 0x44);
});

test('recording capability is recalculated when an incomplete device attaches later', () => {
    const machine = new M6502Machine(m6502Config());
    const target = createM6502DebugTarget({machine});
    assert.deepEqual(target.capabilities().recording, ['checkpoint', 'restore']);
    machine.attachDevice('sensor', {advance() {}});
    assert.deepEqual(target.capabilities().recording, []);
    assert.match(target.captureCheckpoint().refused, /sensor/);
});

test('both classic targets start through the real recording-session checkpoint contract', () => {
    for (const target of [
        createM6502DebugTarget({machine: new M6502Machine(m6502Config())}),
        createZ80DebugTarget({machine: new Z80Machine(z80Config())})
    ]) {
        const recorder = createDebugRecorder();
        const eventStream = createDebugEventStream();
        const session = createRecordingSession({recorder, eventStream, getTarget: () => target});
        const started = session.start();
        assert.equal(started.accepted, true);
        assert.equal(typeof started.checkpoint.time.domain, 'string');
        assert.equal(started.checkpoint.time.hz > 0, true);
    }
});

test('restore opens a new event time domain even when replay rewinds cycles', () => {
    const machine = new Z80Machine(z80Config());
    machine.mem.set([0x00, 0xc3, 0x00, 0x00], 0);
    const target = createZ80DebugTarget({machine});
    const stream = createDebugEventStream();
    target.onDebugEvent(fact => stream.publish(fact));
    machine.step();
    const checkpoint = target.captureCheckpoint();
    machine.step();
    assert.equal(target.restoreCheckpoint(checkpoint), undefined);
    machine.step();
    const retires = stream.drain().filter(event => event.kind === 'instruction');
    assert.match(retires.at(-1).time.domain, /^z80-tstates-reset-1$/);
    assert.notEqual(retires[0].time.domain, retires.at(-1).time.domain);
});

test('checkpoint snapshots and component restore arguments are defensively owned', () => {
    const machine = new M6502Machine(m6502Config());
    let restored;
    machine.attachDevice('paired', {
        value: new Uint8Array([7]),
        getState() { return {value: this.value}; },
        setState(state) { restored = state; state.value[0] = 99; this.value = state.value.slice(); }
    });
    const target = createM6502DebugTarget({machine});
    const checkpoint = target.captureCheckpoint();
    machine.devices.paired.value[0] = 8;
    assert.equal(checkpoint.state.devices.paired.value[0], 7,
        'capture does not retain a device-owned typed array');
    const reusable = structuredClone(checkpoint);
    assert.equal(target.restoreCheckpoint(reusable), undefined);
    assert.equal(reusable.state.devices.paired.value[0], 7,
        'a component cannot mutate the reusable checkpoint passed to restore');
    assert.notEqual(restored, reusable.state.devices.paired);
});

test('checkpoint time must match captured machine cycles and target clock', () => {
    const target = createM6502DebugTarget({machine: new M6502Machine(m6502Config())});
    const checkpoint = target.captureCheckpoint();
    assert.equal(target.restoreCheckpoint({...checkpoint,
        time: {...checkpoint.time, ticks: checkpoint.time.ticks + 1}}).code,
    'INVALID_CHECKPOINT_TIME');
});

test('6502 checkpoint validation rejects every omitted machine, CPU, and VIA field atomically', () => {
    const machine = new M6502Machine({clockHz: 1_000_000,
        regions: [{kind: 'ram', start: 0, end: 0x5fff},
            {kind: 'ram', start: 0x6010, end: 0xffff}],
        chips: [{kind: 'via', name: 'via1', at: 0x6000}]});
    const target = createM6502DebugTarget({machine});
    machine.cpu.pc = 0x0200;
    machine.mem[0x0200] = 0xea;
    machine.step();
    const checkpoint = target.captureCheckpoint();
    const before = machine.saveState();
    const omissions = [];
    for (const key of Object.keys(checkpoint.state)) omissions.push(['state', key]);
    for (const key of Object.keys(checkpoint.state.cpu)) omissions.push(['cpu', key]);
    for (const key of Object.keys(checkpoint.state.chips.via1)) omissions.push(['via1', key]);
    for (const [group, key] of omissions) {
        const malformed = structuredClone(checkpoint);
        if (group === 'state') delete malformed.state[key];
        else if (group === 'cpu') delete malformed.state.cpu[key];
        else delete malformed.state.chips.via1[key];
        assert.equal(target.restoreCheckpoint(malformed).code, 'INVALID_CHECKPOINT', `${group}.${key}`);
        assert.deepEqual(machine.saveState(), before, `${group}.${key} mutated the machine`);
    }
});

test('6502 logged buttons and UART input replay to an identical checkpoint hash', () => {
    const config = {clockHz: 1_000_000,
        regions: [{kind: 'ram', start: 0, end: 0x4fff},
            {kind: 'ram', start: 0x5004, end: 0x5fff},
            {kind: 'ram', start: 0x6010, end: 0xffff}],
        chips: [{kind: 'via', name: 'via1', at: 0x6000},
            {kind: 'acia', name: 'acia1', at: 0x5000}]};
    const adapter = createM6502Adapter({config});
    adapter.attachBoard({advanceTo() {}, setPin() {}});
    const target = createM6502DebugTarget(adapter);
    adapter.machine.mem.set([0xea, 0x4c, 0x00, 0x02], 0x0200);
    adapter.machine.cpu.pc = 0x0200;
    const checkpoint = target.captureCheckpoint();
    const inputs = [];
    target.onDebugInput(input => inputs.push(input));
    assert.equal(target.setButtons(0x05), true);
    assert.equal(adapter.sendSerial(0x41), true);
    run6502(adapter.machine, 7);
    const expected = hashReplayValues(adapter.machine.saveState());

    assert.equal(target.restoreCheckpoint(checkpoint), undefined);
    for (const input of inputs) assert.equal(target.applyReplayInput(input), true);
    run6502(adapter.machine, 7);
    assert.equal(hashReplayValues(adapter.machine.saveState()), expected);
    assert.deepEqual(inputs.map(input => input.producer), ['m6502.buttons', 'm6502.serial']);
});

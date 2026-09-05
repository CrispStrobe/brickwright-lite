import {test} from 'node:test';
import assert from 'node:assert/strict';
import {I8086Machine} from '../overlay/scratch-gui/src/lib/bw-board/i8086-machine.js';
import {createI8086DebugTarget} from '../overlay/scratch-gui/src/lib/bw-board/i8086-debug.js';
import {normalizeDebugEvent} from '../overlay/scratch-gui/src/lib/bw-debug/event-stream.js';
import {normalizeDebugCapabilities} from '../overlay/scratch-gui/src/lib/bw-debug/debug-capabilities.js';

const CONFIG = {
    clockHz: 5_000_000,
    regions: [{kind: 'ram', start: 0, end: 0xfffff}],
    chips: []
};

const fixture = bytes => {
    const machine = new I8086Machine(CONFIG);
    machine.cpu.cs = 0;
    machine.cpu.ip = 0x100;
    machine.mem.set(bytes, 0x100);
    const target = createI8086DebugTarget({machine});
    const events = [];
    let seq = 0;
    const unsubscribe = target.onDebugEvent(fact => {
        events.push(normalizeDebugEvent({schema: 1, seq: seq++, ...fact}));
    });
    return {machine, target, events, unsubscribe};
};

test('8086 advertises instruction stepping and recorded events without claiming cycle stepping', () => {
    const machine = new I8086Machine(CONFIG);
    const caps = normalizeDebugCapabilities(createI8086DebugTarget({machine}).capabilities(), {target: 'i8086'});
    assert.deepEqual(caps.steps, ['insn', 'over', 'out']);
    assert.deepEqual(caps.events, ['instruction', 'memory', 'port', 'interrupt']);
    assert.equal(caps.fidelity.instruction, 'recorded');
    assert.equal(caps.fidelity.cycle, 'unsupported');
});

test('8086 publishes a true retire boundary with exact PCs, cost, and machine clock', () => {
    const {machine, target, events} = fixture(Uint8Array.of(0x90)); // NOP
    target.step('insn', 1);
    target.runFor(1_000);
    const retire = events.find(event => event.kind === 'instruction');
    assert.deepEqual(retire.time, {ticks: machine.cycles, domain: 'i8086-cycles', hz: 5_000_000});
    assert.equal(retire.pcBefore, 0x100);
    assert.equal(retire.pcAfter, 0x101);
    assert.equal(retire.instruction.cycles, machine.cycles);
    assert.equal(retire.phase, 'retire');
    assert.equal(retire.fidelity, 'recorded');
});

test('an instruction observer installed mid-instruction starts on the next boundary', () => {
    const machine = new I8086Machine(CONFIG);
    machine.cpu.cs = 0;
    machine.cpu.ip = 0x100;
    machine.mem.set([0x90, 0x90, 0x90], 0x100);
    const events = [];
    const read = machine.cpu.read;
    machine.cpu.read = address => {
        machine.hooks.onInstruction = event => events.push(event);
        return read(address);
    };

    machine.step();
    assert.deepEqual(events, [], 'the instruction already in flight is not half-observed');
    const cyclesBefore = machine.cycles;
    const cost = machine.step();
    assert.deepEqual(events[0], {
        pcBefore: 0x101,
        pcAfter: 0x102,
        cycles: cost,
        cyclesBefore,
        cyclesAfter: cyclesBefore + cost,
    });

    machine.cpu.read = read;
    machine.hooks.onInstruction = null;
    machine.step();
    assert.equal(events.length, 1, 'an unsubscribed observer receives no later retire');
});

test('8086 records program writes and OUT values without debugger-initiated reads', () => {
    // mov al,5a; mov [0200],al; out 20h,al
    const {target, events} = fixture(Uint8Array.of(0xb0, 0x5a, 0xa2, 0x00, 0x02, 0xe6, 0x20));
    target.step('insn', 3);
    target.runFor(10_000);
    assert.deepEqual(events.filter(e => e.kind === 'memory').map(e => e.memory), [
        {space: 'mem', address: 0x200, value: 0x5a, direction: 'write'}
    ]);
    assert.deepEqual(events.filter(e => e.kind === 'port').map(e => e.port), [
        {address: 0x20, direction: 'write', value: 0x5a}
    ]);
});

test('8086 interrupt evidence precedes the handler instruction and unsubscribe is quiet', () => {
    const {machine, target, events, unsubscribe} = fixture(Uint8Array.of(0xcd, 0x10));
    machine.cpu.ss = 0;
    machine.cpu.sp = 0x800;
    // Vector 10h -> 0000:0300, containing NOP.
    machine.mem[0x40] = 0x00;
    machine.mem[0x41] = 0x03;
    machine.mem[0x42] = 0x00;
    machine.mem[0x43] = 0x00;
    machine.mem[0x300] = 0x90;
    target.step('insn', 1);
    target.runFor(10_000);
    const interruptAt = events.findIndex(e => e.kind === 'interrupt');
    assert.ok(interruptAt >= 0);
    assert.deepEqual(events[interruptAt].interrupt, {vector: 0x10, source: 'int'});
    assert.equal(events[interruptAt + 1].kind, 'memory'); // INT's first stack write
    assert.equal(events.find(e => e.kind === 'instruction').pcBefore, 0x100);

    unsubscribe();
    const count = events.length;
    machine.step();
    assert.equal(events.length, count);
});

test('8086 preserves pre-existing machine observation hooks', () => {
    const observed = [];
    const machine = new I8086Machine(CONFIG, {onPortAccess: ev => observed.push(ev)});
    machine.cpu.cs = 0;
    machine.cpu.ip = 0x100;
    machine.mem.set([0xb0, 0x33, 0xe6, 0x20], 0x100);
    const target = createI8086DebugTarget({machine});
    const off = target.onDebugEvent(() => {});
    machine.step();
    machine.step();
    off();
    machine.cpu.ip = 0x102;
    machine.step();
    assert.deepEqual(observed.map(e => e.value), [0x33, 0x33]);
});

test('8086 starts a named time domain after restoring an older checkpoint', () => {
    const {machine, events} = fixture(Uint8Array.of(0x90, 0x90, 0x90));
    const saved = machine.saveState();
    machine.step();
    machine.step();
    machine.loadState(saved);
    machine.step();
    const retire = events.filter(e => e.kind === 'instruction');
    assert.equal(retire[0].time.domain, 'i8086-cycles');
    assert.equal(retire[2].time.domain, 'i8086-cycles-reset-1');
    assert.equal(retire[2].time.ticks, retire[0].time.ticks);
});

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {I8086} from '../overlay/scratch-gui/src/lib/bw-board/i8086.js';
import {I8086Machine} from '../overlay/scratch-gui/src/lib/bw-board/i8086-machine.js';
import {DOSBOX8086} from '../overlay/scratch-gui/src/lib/bw-board/i8086-dos.js';
import {createI8086DebugTarget} from '../overlay/scratch-gui/src/lib/bw-board/i8086-debug.js';

test('the 8086 runner uses its boundary step without rounding away tiny budgets', () => {
    const machine = new I8086Machine(DOSBOX8086);
    machine.cpu.cs = 0;
    machine.cpu.ip = 0x100;
    machine.mem[0x100] = 0x90;           // NOP
    const hardwareStep = machine.step.bind(machine);
    let injectedSteps = 0;
    machine.step = () => assert.fail('runFor bypassed the adapter boundary step');
    const target = createI8086DebugTarget({
        machine,
        step: () => { injectedSteps++; return hardwareStep(); },
    });

    target.run();
    assert.equal(target.runFor(1), 'budget'); // 1 ns = 0.005 cycle at 5 MHz
    assert.equal(injectedSteps, 1,
        'a positive sub-cycle budget still retires one whole instruction');
    assert.ok(machine.cycles > 0);
});

test('the shipped core physically fetches each prefix and opcode once', () => {
    const bytes = [0x26, 0x2e, 0x90];
    const reads = [];
    const cpu = new I8086({
        read: (a) => { reads.push(a); return bytes[a - 0x10000] ?? 0; },
        write: () => {},
    });
    cpu.cs = 0x1000;
    cpu.ip = 0;
    cpu.step();
    assert.deepEqual(reads, [0x10000, 0x10001, 0x10002]);
});

test('the shipped machine invalidates its cached chip schedule on attach', () => {
    const machine = new I8086Machine(DOSBOX8086);
    machine._advanceChips(4);
    let advanced = 0;
    machine.attachDevice('late', {advance: n => { advanced += n; }});
    machine._advanceChips(7);
    assert.equal(advanced, 7);
});

test('the shipped video path caches static output and revises changed output', () => {
    const machine = new I8086Machine(DOSBOX8086);
    const target = createI8086DebugTarget({machine});
    const first = target.video();
    assert.equal(target.video(), first);
    machine._write(0xb8000, 0x41);
    const changed = target.video();
    assert.notEqual(changed, first);
    assert.notEqual(changed.frame, first.frame);
    assert.equal(target.video(), changed);
});

test('the shipped machine dirties video for every bulk and bus mutation path', () => {
    const machine = new I8086Machine(DOSBOX8086);
    const initial = machine.displayRevision;

    machine._write(0x0100, 0x42);
    assert.equal(machine.displayRevision, initial, 'ordinary RAM stays off the render path');

    machine._write(0xb8000, 0x41);
    assert.equal(machine.displayRevision, initial + 1, 'video RAM dirties the display');

    machine._out(0x3d8, 0x09);
    assert.equal(machine.displayRevision, initial + 2, 'display control ports dirty the display');

    machine.loadRom(Uint8Array.of(0xaa), 0xa0000);
    assert.equal(machine.displayRevision, initial + 3, 'bulk video loads dirty the display');

    machine.loadState(machine.saveState());
    assert.equal(machine.displayRevision, initial + 4, 'state restore dirties the display');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import path from 'node:path';

import {M6502Machine} from '../overlay/scratch-gui/src/lib/bw-board/m6502-machine.js';
import {createM6502DebugTarget} from '../overlay/scratch-gui/src/lib/bw-board/m6502-debug.js';
import {Z80Machine} from '../overlay/scratch-gui/src/lib/bw-board/z80-machine.js';
import {createZ80DebugTarget} from '../overlay/scratch-gui/src/lib/bw-board/z80-debug.js';
import {createRunToCoordinator} from '../overlay/scratch-gui/src/lib/bw-debug/run-to.js';

const ram = [{kind: 'ram', start: 0, end: 0xffff}];

function settle(target) {
    for (let i = 0; i < 32 && target.state() === 'running'; i++) target.runFor(1_000_000);
    assert.equal(target.state(), 'halted', 'depth step did not halt');
}

function m6502Fixture() {
    const machine = new M6502Machine({clockHz: 1_000_000, regions: ram, chips: []});
    machine.mem.set([
        0x20, 0x08, 0x02, // $0200 JSR $0208
        0xa9, 0x11,       // $0203 LDA #$11
        0x4c, 0x05, 0x02, // $0205 JMP $0205
        0xa9, 0x22, 0x60  // $0208 LDA #$22; RTS
    ], 0x0200);
    machine.cpu.pc = 0x0200;
    return {machine, target: createM6502DebugTarget({machine})};
}

function z80Fixture() {
    const machine = new Z80Machine({clockHz: 4_000_000, regions: ram, ports: []});
    machine.mem.set([
        0xcd, 0x07, 0x00, // $0000 CALL $0007
        0x3e, 0x11,       // $0003 LD A,$11
        0x18, 0xfe,       // $0005 JR $0005
        0x3e, 0x22, 0xc9  // $0007 LD A,$22; RET
    ]);
    machine.cpu.pc = 0;
    return {machine, target: createZ80DebugTarget({machine})};
}

for (const [name, fixture, stack] of [
    ['6502', m6502Fixture, machine => machine.cpu.s],
    ['Z80', z80Fixture, machine => machine.cpu.sp]
]) {
    test(`${name} advertises its exact 16-bit code range and runs to a before boundary`, () => {
        const {machine, target} = fixture();
        assert.deepEqual(target.capabilities().runTo, [{kind: 'address', space: 'code',
            addressMin: 0, addressMax: 0xffff, stopSides: ['before'], installation: 'sync'}]);
        const address = name === '6502' ? 0x0208 : 7;
        const result = createRunToCoordinator({target, maxSlices: 8, sliceBudgetNs: 1_000_000})
            .runToAddress(address);
        assert.equal(result.accepted, true);
        assert.equal(machine.cpu.pc, address, 'temporary breakpoint stops before executing target opcode');
        assert.deepEqual(target.setBreakpoint({kind: 'code', addr: 0x10000}),
            {unsupported: 'code breakpoint addr must be in 0x0000..0xffff'});
    });

    test(`${name} step-over executes a real call and stops at its return site`, () => {
        const {machine, target} = fixture();
        const initialStack = stack(machine);
        assert.ok(target.capabilities().steps.includes('over'));
        assert.equal(target.step('over'), undefined);
        settle(target);
        assert.equal(machine.cpu.pc, name === '6502' ? 0x0203 : 3);
        assert.equal(machine.cpu.a, 0x22);
        assert.equal(stack(machine), initialStack, 'callee restored the caller stack depth');
    });

    test(`${name} step-out starts inside the callee and stops after its return`, () => {
        const {machine, target} = fixture();
        target.step('insn');
        settle(target);
        assert.equal(machine.cpu.pc, name === '6502' ? 0x0208 : 7);
        assert.ok(target.capabilities().steps.includes('out'));
        assert.equal(target.step('out'), undefined);
        settle(target);
        assert.equal(machine.cpu.pc, name === '6502' ? 0x0203 : 3);
        assert.equal(machine.cpu.a, 0x22);
    });
}

const root = path.resolve(import.meta.dirname, '..');
const wasmModule = path.join(root, 'overlay/scratch-gui/src/lib/emu8051/emu8051.js');
const debugModule = path.join(root, 'overlay/scratch-gui/src/lib/bw-board/emu8051-debug.js');
const have8051 = existsSync(wasmModule) && existsSync(debugModule);
const callHex = ':0A000000120007741180FE742222E2\n:00000001FF\n';

async function emu8051Fixture() {
    const {default: createEmu8051} = await import(wasmModule);
    const {createEmu8051DebugTarget} = await import(debugModule);
    const wasm = await createEmu8051();
    wasm._emu_init(1);
    wasm._emu_set_fosc(11_059_200);
    const target = createEmu8051DebugTarget(wasm, {clockHz: 11_059_200});
    wasm.ccall('emu_load_hex', 'number', ['string', 'number'], [callHex, callHex.length]);
    target.reset();
    return target;
}

test('8051 native step-over and step-out preserve real call-depth semantics', async () => {
    if (!have8051) return;
    let target = await emu8051Fixture();
    assert.ok(target.capabilities().steps.includes('over'));
    assert.equal(target.step('over'), undefined);
    settle(target);
    assert.equal(target.regs().pc, 3);
    assert.equal(target.regs().a, 0x22);
    target.destroy();

    target = await emu8051Fixture();
    target.step('insn');
    settle(target);
    assert.equal(target.regs().pc, 7);
    assert.ok(target.capabilities().steps.includes('out'));
    assert.equal(target.step('out'), undefined);
    settle(target);
    assert.equal(target.regs().pc, 3);
    assert.equal(target.regs().a, 0x22);
    target.destroy();
});

test('8051 advertises and executes synchronous run-to across its exact code range', async () => {
    if (!have8051) return;
    const target = await emu8051Fixture();
    assert.deepEqual(target.capabilities().runTo, [{kind: 'address', space: 'code',
        addressMin: 0, addressMax: 0xffff, stopSides: ['before'], installation: 'sync'}]);
    const result = createRunToCoordinator({target, maxSlices: 8, sliceBudgetNs: 1_000_000})
        .runToAddress(7);
    assert.equal(result.accepted, true);
    assert.equal(target.regs().pc, 7);
    assert.deepEqual(target.setBreakpoint({kind: 'code', addr: 0x10000}),
        {unsupported: 'code breakpoint addr must be in 0x0000..0xffff'});
    target.destroy();
});

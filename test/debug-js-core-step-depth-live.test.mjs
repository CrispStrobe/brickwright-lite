import test from 'node:test';
import assert from 'node:assert/strict';

import {createAvr8jsAdapter} from '../packages/scratch-gui/src/lib/bw-board/avr8js-adapter.js';
import {createAvr8jsDebugTarget} from '../packages/scratch-gui/src/lib/bw-board/avr8js-debug.js';
import {createRp2040jsAdapter, RAM_START} from
    '../packages/scratch-gui/src/lib/bw-board/rp2040js-adapter.js';
import {createRp2040jsDebugTarget} from '../packages/scratch-gui/src/lib/bw-board/rp2040js-debug.js';
import {createRunToCoordinator} from '../packages/scratch-gui/src/lib/bw-debug/run-to.js';

function settle(target) {
    for (let i = 0; i < 32 && target.state() === 'running'; i++) target.runFor(1_000_000);
    assert.equal(target.state(), 'halted', 'depth step did not halt');
}

function avrFixture() {
    // RCALL sub; LDI r16,$11; RJMP .; NOP; sub: LDI r16,$22; RET
    const program = Uint16Array.of(0xd003, 0xe101, 0xcfff, 0x0000, 0xe202, 0x9508);
    const adapter = createAvr8jsAdapter({program});
    return {adapter, target: createAvr8jsDebugTarget(adapter)};
}

test('real avr8js RCALL step-over stops at the caller with restored stack', () => {
    const {adapter, target} = avrFixture();
    const sp = target.regs().sp;
    assert.ok(target.capabilities().steps.includes('over'));
    assert.equal(target.step('over'), undefined);
    settle(target);
    assert.equal(target.regs().pc, 2, 'AVR debugger PCs are byte addresses');
    assert.equal(adapter.cpu.data[16], 0x22);
    assert.equal(target.regs().sp, sp);
});

test('real avr8js step-out entered through RCALL stops after RET', () => {
    const {adapter, target} = avrFixture();
    target.step('insn');
    settle(target);
    assert.equal(target.regs().pc, 8);
    const calleeSp = target.regs().sp;
    assert.ok(target.capabilities().steps.includes('out'));
    assert.equal(target.step('out'), undefined);
    settle(target);
    assert.equal(target.regs().pc, 2);
    assert.equal(adapter.cpu.data[16], 0x22);
    assert.ok(target.regs().sp > calleeSp);
});

test('avr8js advertises its exact flash range and runs to a before boundary', () => {
    const {adapter, target} = avrFixture();
    const addressMax = adapter.cpu.progMem.length * 2 - 2;
    assert.deepEqual(target.capabilities().runTo, [{kind: 'address', space: 'code',
        addressMin: 0, addressMax, stopSides: ['before'], installation: 'sync'}]);
    assert.equal(createRunToCoordinator({target, maxSlices: 8, sliceBudgetNs: 1_000_000})
        .runToAddress(8).accepted, true);
    assert.equal(target.regs().pc, 8);
    assert.ok(target.setBreakpoint({kind: 'code', addr: addressMax + 2}).unsupported);
});

function rp2040Fixture() {
    // BL sub; MOVS r0,$11; B .; sub: PUSH {lr}; MOVS r0,$22; POP {pc}
    const program = Uint16Array.of(0xf000, 0xf802, 0x2011, 0xe7fe, 0xb500, 0x2022, 0xbd00);
    const adapter = createRp2040jsAdapter({program});
    return {adapter, target: createRp2040jsDebugTarget(adapter)};
}

test('real rp2040js Thumb BL step-over stops at the link return address', () => {
    const {adapter, target} = rp2040Fixture();
    const sp = target.regs().sp;
    assert.ok(target.capabilities().steps.includes('over'));
    assert.equal(target.step('over'), undefined);
    settle(target);
    assert.equal(target.regs().pc, RAM_START + 4);
    assert.equal(adapter.core.registers[0], 0x22);
    assert.equal(target.regs().sp, sp);
});

test('real rp2040js step-out after a stack-frame prologue stops after POP {pc}', () => {
    const {adapter, target} = rp2040Fixture();
    target.step('insn', 2); // BL, then PUSH {lr}: stop inside the established frame
    settle(target);
    assert.equal(target.regs().pc, RAM_START + 10);
    const calleeSp = target.regs().sp;
    assert.ok(target.capabilities().steps.includes('out'));
    assert.equal(target.step('out'), undefined);
    settle(target);
    assert.equal(target.regs().pc, RAM_START + 4);
    assert.equal(adapter.core.registers[0], 0x22);
    assert.ok(target.regs().sp > calleeSp);
});

test('real rp2040js step-out also returns from a leaf function with unchanged SP', () => {
    // BL leaf; MOVS r0,$11; B .; leaf: MOVS r0,$22; BX lr
    const adapter = createRp2040jsAdapter({program:
        Uint16Array.of(0xf000, 0xf802, 0x2011, 0xe7fe, 0x2022, 0x4770)});
    const target = createRp2040jsDebugTarget(adapter);
    target.step('insn');
    settle(target);
    const calleeSp = target.regs().sp;
    assert.equal(target.step('out'), undefined);
    settle(target);
    assert.equal(target.regs().pc, RAM_START + 4);
    assert.equal(adapter.core.registers[0], 0x22);
    assert.equal(target.regs().sp, calleeSp, 'leaf return does not need a fabricated stack change');
});

test('rp2040js advertises its exact aligned address range and runs to a before boundary', () => {
    const {target} = rp2040Fixture();
    assert.deepEqual(target.capabilities().runTo, [{kind: 'address', space: 'code',
        addressMin: 0, addressMax: 0xfffffffe, stopSides: ['before'], installation: 'sync'}]);
    assert.equal(createRunToCoordinator({target, maxSlices: 8, sliceBudgetNs: 1_000_000})
        .runToAddress(RAM_START + 8).accepted, true);
    assert.equal(target.regs().pc, RAM_START + 8);
    assert.ok(target.setBreakpoint({kind: 'code', addr: 0x100000000}).unsupported);
});

import test from 'node:test';
import assert from 'node:assert/strict';

import {I8086Machine, BLINK8086} from
    '../overlay/scratch-gui/src/lib/bw-board/i8086-machine.js';
import {createI8086DebugTarget} from
    '../overlay/scratch-gui/src/lib/bw-board/i8086-debug.js';
import {createInstructionAtomicRunToCoordinator, createRunToCoordinator} from
    '../overlay/scratch-gui/src/lib/bw-debug/run-to.js';

const machineAt = bytes => {
    const machine = new I8086Machine(BLINK8086);
    machine.cpu.cs = 0;
    machine.cpu.ip = 0x100;
    machine.cpu.ss = 0;
    machine.cpu.sp = 0xfffe;
    machine.mem.set(bytes, 0x100);
    return machine;
};

test('8086 run-to-address stops before execution and cleans its temporary breakpoint', () => {
    const machine = machineAt([0xb0, 1, 0xb0, 2, 0x90]);
    const target = createI8086DebugTarget({machine});
    assert.deepEqual(target.capabilities().runTo, [{
        kind: 'address', space: 'code', addressMin: 0, addressMax: 0xfffff,
        stopSides: ['before'], installation: 'sync'
    }]);
    const runTo = createRunToCoordinator({target, maxSlices: 8, sliceBudgetNs: 100});
    const result = runTo.runToAddress(0x104);
    assert.equal(result.accepted, true);
    assert.equal(result.reason, 'address');
    assert.equal(target.state(), 'halted');
    assert.equal(target.regs().pc, 0x104);
    assert.equal(target.regs().ax & 0xff, 2);

    target.run();
    assert.equal(target.runFor(100), 'budget',
        'the owned breakpoint is removed after success rather than leaking into forward execution');
});

test('run-to-address classifies unrelated halts and exhausts bounds paused', () => {
    const interruptedMachine = machineAt([0x90, 0x90, 0x90]);
    const interruptedTarget = createI8086DebugTarget({machine: interruptedMachine});
    const existing = interruptedTarget.setBreakpoint({kind: 'code', addr: 0x101});
    const interrupted = createRunToCoordinator({target: interruptedTarget}).runToAddress(0x102);
    assert.equal(interrupted.code, 'run-to-interrupted');
    assert.equal(interrupted.haltCause.bp, existing);
    interruptedTarget.clearBreakpoint(existing);

    const loopingMachine = machineAt([0xeb, 0xfe]);
    const loopingTarget = createI8086DebugTarget({machine: loopingMachine});
    const exhausted = createRunToCoordinator({
        target: loopingTarget, maxSlices: 2, sliceBudgetNs: 1
    }).runToAddress(0x200);
    assert.equal(exhausted.code, 'run-to-budget-exhausted');
    assert.equal(loopingTarget.state(), 'halted');
});

test('incremental address run-to pumps one slice, cancels cleanly, and accepts a destination collision', () => {
    const machine = machineAt([0x90, 0x90, 0x90]);
    const target = createI8086DebugTarget({machine});
    const coordinator = createRunToCoordinator({target, maxSlices: 8, sliceBudgetNs: 1});
    const started = coordinator.startAddress(0x102);
    assert.equal(started.reason, 'started');
    assert.deepEqual(coordinator.status(), {active: true, generation: started.generation,
        address: 0x102, slices: 0, maxSlices: 8});
    const first = coordinator.pump();
    assert.equal(first.reason, 'running');
    assert.equal(first.slices, 1, 'one pump spends exactly one configured runFor slice');
    const cancelled = coordinator.cancel();
    assert.equal(cancelled.reason, 'cancelled');
    assert.equal(target.state(), 'halted');
    assert.equal(coordinator.status().active, false);

    const collisionMachine = machineAt([0x90, 0x90, 0x90]);
    const collisionTarget = createI8086DebugTarget({machine: collisionMachine});
    collisionTarget.setBreakpoint({kind: 'code', addr: 0x102});
    const collision = createRunToCoordinator({target: collisionTarget,
        sliceBudgetNs: 100}).runToAddress(0x102);
    assert.equal(collision.accepted, true);
    assert.equal(collision.reason, 'address');
    assert.equal(collisionTarget.regs().pc, 0x102,
        'an existing breakpoint at the owned destination still means the address was reached');
});

test('address run-to requires its explicit descriptor and reports cleanup failure', () => {
    const unsupported = {
        capabilities: () => ({breakpoints: ['code']}), setBreakpoint: () => 1,
        clearBreakpoint: () => {}, onHalt: () => () => {}, run: () => {},
        runFor: () => {}, state: () => 'halted', halt: () => {}, regs: () => ({pc: 0})
    };
    assert.equal(createRunToCoordinator({target: unsupported}).runToAddress(1).code,
        'run-to-address-unsupported');

    let listener;
    const brokenCleanup = {
        capabilities: () => ({runTo: [{kind: 'address', space: 'code',
            addressMin: 0, addressMax: 0xfffff,
            stopSides: ['before'], installation: 'sync'}]}),
        setBreakpoint: () => 7,
        clearBreakpoint: () => { throw new Error('remove failed'); },
        onHalt: cb => { listener = cb; return () => {}; },
        run: () => { listener({cause: 'breakpoint', bp: 7}); },
        runFor: () => 'halted',
        state: () => 'halted',
        halt: () => {},
        regs: () => ({pc: 1})
    };
    const result = createRunToCoordinator({target: brokenCleanup}).runToAddress(1);
    assert.equal(result.code, 'run-to-cleanup-failed');
    assert.equal(result.reason, 'remove failed');
    assert.equal(result.priorResult.accepted, true,
        'cleanup failure is explicit and retains the completed operation outcome');

    const boundedTarget = createI8086DebugTarget({machine: machineAt([0x90])});
    const outside = createRunToCoordinator({target: boundedTarget}).startAddress(0x100000);
    assert.deepEqual(outside, {accepted: false, code: 'run-to-address-out-of-range',
        reason: 'address is outside target code bounds', addressMin: 0, addressMax: 0xfffff});
});

test('8086 event/time run-to is explicitly instruction-atomic and bounded', () => {
    const eventMachine = machineAt([0xb0, 1, 0xb0, 2, 0x90]);
    const eventTarget = createI8086DebugTarget({machine: eventMachine});
    const eventRun = createInstructionAtomicRunToCoordinator({target: eventTarget});
    const eventResult = eventRun.runToEvent(observed =>
        observed.kind === 'instruction' && observed.pcAfter === 0x102);
    assert.equal(eventResult.accepted, true);
    assert.equal(eventResult.reason, 'event');
    assert.equal(eventResult.boundary, 'instruction');
    assert.equal(eventTarget.regs().pc, 0x102);

    const timeMachine = machineAt([0x90, 0x90, 0x90]);
    const timeTarget = createI8086DebugTarget({machine: timeMachine});
    const start = timeTarget.debugTime();
    const timeRun = createInstructionAtomicRunToCoordinator({target: timeTarget});
    const timeResult = timeRun.runToTime({...start, ticks: start.ticks + 1});
    assert.equal(timeResult.accepted, true);
    assert.equal(timeResult.reason, 'time');
    assert.equal(timeResult.boundary, 'instruction');
    assert.ok(timeResult.time.ticks >= start.ticks + 1,
        'instruction-atomic time run-to stops at-or-after, never claims an exact cycle');

    const failedMachine = machineAt([0x90]);
    const failedTarget = createI8086DebugTarget({machine: failedMachine});
    const failed = createInstructionAtomicRunToCoordinator({target: failedTarget})
        .runToEvent(() => { throw new Error('bad predicate'); });
    assert.equal(failed.code, 'run-to-predicate-failed');
    assert.equal(failedTarget.state(), 'halted');
});

test('8086 step-over and step-out stop at real CALL/RET boundaries', () => {
    // call 0106h; mov al,11h; nop; mov al,22h; ret
    const bytes = [0xe8, 3, 0, 0xb0, 0x11, 0x90, 0xb0, 0x22, 0xc3];
    const overMachine = machineAt(bytes);
    const over = createI8086DebugTarget({machine: overMachine});
    over.step('over');
    assert.equal(over.runFor(1_000_000), 'halted');
    assert.equal(over.regs().pc, 0x103);
    assert.equal(over.regs().ax & 0xff, 0x22);
    assert.equal(over.regs().sp, 0xfffe);

    const outMachine = machineAt(bytes);
    outMachine.step();
    assert.equal(outMachine.cpu.pc, 0x106);
    const out = createI8086DebugTarget({machine: outMachine});
    out.step('out');
    assert.equal(out.runFor(1_000_000), 'halted');
    assert.equal(out.regs().pc, 0x103);
    assert.equal(out.regs().ax & 0xff, 0x22);
    assert.equal(out.regs().sp, 0xfffe);
});

test('8086 step-over does not mistake an interrupt return for the call return', () => {
    const machine = machineAt([0xe8, 3, 0, 0xb0, 0x11, 0x90, 0xb0, 0x22, 0xc3]);
    machine.mem[2 * 4] = 0x00;
    machine.mem[2 * 4 + 1] = 0x02;
    machine.mem[2 * 4 + 2] = 0;
    machine.mem[2 * 4 + 3] = 0;
    machine.mem.set([0x90, 0xcf], 0x200); // nop; iret
    const target = createI8086DebugTarget({machine});
    machine.nmi();
    target.step('over');
    assert.equal(target.runFor(1_000_000), 'halted');
    assert.equal(target.regs().pc, 0x103);
    assert.equal(target.regs().ax & 0xff, 0x22);
    assert.equal(target.regs().sp, 0xfffe);
});

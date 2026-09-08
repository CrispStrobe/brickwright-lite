import {test} from 'node:test';
import assert from 'node:assert/strict';
import {I8086Machine} from '../overlay/scratch-gui/src/lib/bw-board/i8086-machine.js';
import {createI8086DebugTarget} from '../overlay/scratch-gui/src/lib/bw-board/i8086-debug.js';

function fixture(fastRun, onStep = () => {}) {
    const machine = new I8086Machine({clockHz: 5_000_000,
        regions: [{kind: 'ram', start: 0, end: 0xfffff}], chips: []});
    machine.cpu.cs = 0; machine.cpu.ip = 0x100;
    machine.mem.set([0x40, 0x43, 0xeb, 0xfc], 0x100); // INC AX; INC BX; JMP
    let steps = 0;
    const target = createI8086DebugTarget({machine, step: () => {
        machine.step(); onStep(target, machine, ++steps);
    }}, {fastRun});
    target.run();
    return {machine, target, steps: () => steps};
}

test('fast run matches reference across fractional budgets, wraps and tracing', () => {
    for (const tracing of [false, true]) {
        const pair = [false, true].map(fast => fixture(fast));
        for (const p of pair) { p.machine.cpu.ax = 0xffff; p.machine.cpu.busTrace = tracing ? [] : null; }
        for (const budget of [0, 0.1, 999, 1e6, 500, 1e6]) {
            assert.equal(pair[0].target.runFor(budget), pair[1].target.runFor(budget));
            assert.deepEqual(pair[0].target.regs(), pair[1].target.regs());
            assert.deepEqual(pair[0].machine.mem, pair[1].machine.mem);
            assert.deepEqual(pair[0].machine.cpu.busTrace, pair[1].machine.cpu.busTrace);
        }
    }
});

for (const action of ['breakpoint', 'step', 'listener']) {
    test(`a re-entrant service installing ${action} leaves the fast loop before the next instruction`, () => {
        const receipts = [false, true].map(fast => {
            const events = [];
            const p = fixture(fast, (target, machine, step) => {
                if (step !== 2) return;
                if (action === 'breakpoint') target.setBreakpoint({kind: 'code', addr: machine.cpu.pc});
                if (action === 'step') target.step('insn', 2);
                if (action === 'listener') target.onDebugEvent(event => events.push(event));
            });
            const outcome = p.target.runFor(10_000);
            return {outcome, registers: p.target.regs(), events, steps: p.steps()};
        });
        assert.deepEqual(receipts[0], receipts[1]);
    });
}

test('preinstalled code/write/event watches and instruction stepping use the reference semantics', () => {
    for (const kind of ['code', 'write', 'port', 'int', 'step']) {
        const pair = [false, true].map(fast => fixture(fast));
        for (const p of pair) {
            if (kind === 'step') p.target.step('insn', 3);
            else p.target.setBreakpoint({kind, addr: 0x101, port: 0x40, vector: 8});
        }
        assert.equal(pair[0].target.runFor(10000), pair[1].target.runFor(10000));
        assert.deepEqual(pair[0].target.regs(), pair[1].target.regs());
    }
});

import {test} from 'node:test';
import assert from 'node:assert/strict';

test('Pico target accepts raw XIP code breakpoints but rejects source breakpoints', async () => {
    const {createRp2040jsDebugTarget} = await import('../packages/scratch-gui/src/lib/bw-board/rp2040js-adapter.js');
    let observer = null;
    const adapter = {
        rp2040: {core: {pc: 0x10000000}},
        timeNs: () => 0n,
        stepInstruction: () => {},
        advanceNs: () => {},
        reset: () => {},
        setInstructionObserver: fn => { observer = fn; },
    };
    const target = createRp2040jsDebugTarget(adapter);
    const handle = target.setBreakpoint({kind: 'code', addr: 0x10000020});
    assert.equal(handle, 1);
    assert.deepEqual(target.setBreakpoint({kind: 'yield', task: 'main', state: 1}), {
        unsupported: 'Pico supports raw code-address breakpoints only.'
    });
    assert.deepEqual(target.setBreakpoint({kind: 'code', addr: 0x200}), {
        unsupported: 'Pico code breakpoint needs an integer XIP address >= 0x10000000.'
    });
    assert.equal(typeof observer, 'function');
    const halts = [];
    target.onHalt(why => halts.push(why));
    target.run();
    assert.equal(observer({pc: 0x10000020, timeNs: 0n, phase: 'before'}), false);
    assert.equal(target.state(), 'halted');
    assert.equal(halts[0].cause, 'breakpoint');
    target.clearBreakpoint(handle);
});

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {measureUnpacedTarget} from '../scripts/lib/i8086-unpaced-target.mjs';
import {I8086Machine} from 'bw-board/i8086-machine.js';
import {createI8086DebugTarget} from 'bw-board/i8086-debug.js';

test('unpaced production probe measures real progress and rejects an idle substitute', () => {
    const machine = new I8086Machine({clockHz: 5e6,
        regions: [{kind: 'ram', start: 0, end: 0xfffff}], chips: []});
    machine.cpu.cs = 0; machine.cpu.ds = 0; machine.cpu.ip = 0x100;
    // INC WORD [110h]; JMP 100h. Short budget cannot wrap the heartbeat.
    machine.mem.set([0xff,0x06,0x10,0x01,0xeb,0xfa], 0x100);
    const target = createI8086DebugTarget({machine});
    target.run();
    globalThis.window = {__benchTarget: target};
    try {
        const receipt = measureUnpacedTarget({guestNs: 1e6, repetitions: 3});
        assert.equal(receipt.samples.length, 3);
        assert.ok(receipt.samples.every(s => s.heartbeatDelta > 0 && s.realTimeRatio > 0));
        window.__benchTarget = {...target, runFor: () => 'budget'};
        assert.throws(() => measureUnpacedTarget(), /did not execute/);
        window.__benchTarget = null;
        assert.throws(() => measureUnpacedTarget(), /No running/);
    } finally { delete globalThis.window; }
});

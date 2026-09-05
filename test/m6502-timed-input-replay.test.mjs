import assert from 'node:assert/strict';
import test from 'node:test';

import {M6502Machine} from '../overlay/scratch-gui/src/lib/bw-board/m6502-machine.js';
import {createM6502DebugTarget} from '../overlay/scratch-gui/src/lib/bw-board/m6502-debug.js';
import {createHistoricalOutputGate, createTimedInputReplay} from
    '../overlay/scratch-gui/src/lib/bw-debug/timed-replay-io.js';

const machineFixture = () => {
    const machine = new M6502Machine({clockHz: 1_000_000,
        regions: [{kind: 'ram', start: 0, end: 0xffff}], chips: []});
    machine.mem[0xfffa] = 0x00;
    machine.mem[0xfffb] = 0x03;
    machine.cpu.pc = 0x0200;
    machine.cpu.waiting = true;
    return {machine, target: createM6502DebugTarget({machine})};
};

test('live W65C02 WAI advances external time, wakes on recorded NMI, and publishes one resync', () => {
    const {machine, target} = machineFixture();
    const output = [];
    const gate = createHistoricalOutputGate({publishState: (state, meta) => output.push({state, meta})});
    const replay = createTimedInputReplay({target, outputGate: gate, inputs: [{
        cursor: 0, producer: 'm6502.nmi', time: {domain: 'm6502-cycles', ticks: 1000}, payload: {}
    }]});

    assert.equal(replay.start().accepted, true);
    gate.emit({serial: 'historical'});
    const result = replay.replayNextBoundary();
    assert.equal(result.accepted, true, result.reason);
    assert.equal(machine.cycles, 1007, 'NMI is applied at tick 1000, then consumes its real seven cycles');
    assert.equal(machine.cpu.waiting, false);
    assert.equal(machine.cpu.pc, 0x0300);
    assert.deepEqual(output, [], 'historical effects stay behind the gate');

    assert.equal(replay.restoreAndResume({waiting: false, pc: 0x0300}).accepted, true);
    assert.deepEqual(output, [{state: {waiting: false, pc: 0x0300}, meta: {complete: true}}]);
    assert.equal(replay.restoreAndResume({waiting: true}).accepted, false);
    assert.equal(output.length, 1, 'resume cannot publish a second full output state');
});

test('live W65C02 STP and instruction overshoot refuse rather than approximating input time', () => {
    let fixture = machineFixture();
    fixture.machine.cpu.waiting = false;
    fixture.machine.cpu.stopped = true;
    assert.equal(fixture.target.replayToInputBoundary(
        {domain: 'm6502-cycles', ticks: 1}).code, 'stopped-before-input');

    fixture = machineFixture();
    fixture.machine.cpu.waiting = false;
    fixture.machine.mem[0x0200] = 0xea; // NOP consumes two cycles
    assert.equal(fixture.target.replayToInputBoundary(
        {domain: 'm6502-cycles', ticks: 1}).code, 'input-boundary-inexact');
});

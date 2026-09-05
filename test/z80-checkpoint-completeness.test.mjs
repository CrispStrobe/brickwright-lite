import test from 'node:test';
import assert from 'node:assert/strict';

import {Z80Machine} from '../overlay/scratch-gui/src/lib/bw-board/z80-machine.js';
import {createZ80DebugTarget} from '../overlay/scratch-gui/src/lib/bw-board/z80-debug.js';
import {hashReplayValues} from '../overlay/scratch-gui/src/lib/bw-debug/recorder.js';

const config = {clockHz: 3_500_000,
    regions: [{kind: 'ram', start: 0, end: 0xffff}], ports: [], ula: true};

function fixture() {
    const machine = new Z80Machine(config);
    // IN A,($FE); INC B; JP $0000. A=$FE selects keyboard rows through A8-A15.
    machine.mem.set([0x3e, 0xfe, 0xdb, 0xfe, 0x04, 0xc3, 0x00, 0x00]);
    machine.ula.setKeys(['caps', 'a', 'space']);
    machine.ula.setEarEdges([{tStates: 4, level: 0}, {tStates: 40, level: 1}]);
    return {machine, target: createZ80DebugTarget({machine})};
}

const advance = (machine, count) => {
    for (let i = 0; i < count; i++) machine.step();
    return hashReplayValues(machine.saveState());
};

test('Z80 checkpoint restores CPU, memory, ULA inputs/timing and deterministic replay', () => {
    const {machine, target} = fixture();
    assert.deepEqual(target.capabilities().recording, ['checkpoint', 'restore']);
    const checkpoint = target.captureCheckpoint();
    assert.equal(checkpoint.refused, undefined);
    assert.deepEqual(Array.from(checkpoint.state.chips.ula.rows), Array.from(machine.ula.rows));
    assert.deepEqual(checkpoint.state.chips.ula.earEdges, machine.ula._earEdges);

    const expected = advance(machine, 40);
    machine.ula.setKeys([]);
    machine.ula.clearEar();
    machine.mem[0x1234] = 0xaa;
    assert.equal(target.restoreCheckpoint(checkpoint), undefined);
    assert.deepEqual(Array.from(machine.ula.rows), Array.from(checkpoint.state.chips.ula.rows));
    assert.deepEqual(machine.ula._earEdges, checkpoint.state.chips.ula.earEdges);
    assert.equal(advance(machine, 40), expected);
});

test('omitting ULA input state refuses before mutating the machine', () => {
    const {machine, target} = fixture();
    advance(machine, 3);
    const checkpoint = target.captureCheckpoint();
    const broken = structuredClone(checkpoint);
    delete broken.state.chips.ula.rows;
    const before = hashReplayValues(machine.saveState());
    assert.equal(target.restoreCheckpoint(broken).code, 'INVALID_CHECKPOINT');
    assert.equal(hashReplayValues(machine.saveState()), before);
});

test('128K page/ROM omissions and wrong sizes are rejected before restore', () => {
    const machine = new Z80Machine({...config, ula: false, zx128: true});
    const target = createZ80DebugTarget({machine});
    const checkpoint = target.captureCheckpoint();
    for (const mutate of [
        state => state.zx128.pages.pop(),
        state => { state.zx128.pages[0] = new Uint8Array(1); },
        state => state.zx128.roms.pop(),
        state => delete state.zx128.bank.page
    ]) {
        const broken = structuredClone(checkpoint);
        mutate(broken.state);
        const before = hashReplayValues(machine.saveState());
        assert.equal(target.restoreCheckpoint(broken).code, 'INVALID_CHECKPOINT');
        assert.equal(hashReplayValues(machine.saveState()), before);
    }
});

test('checkpoint snapshots defensively own ULA arrays and edge records', () => {
    const {machine, target} = fixture();
    const checkpoint = target.captureCheckpoint();
    machine.ula.rows[0] = 0x1f;
    machine.ula._earEdges[0].level = 1;
    assert.notEqual(checkpoint.state.chips.ula.rows[0], machine.ula.rows[0]);
    assert.notEqual(checkpoint.state.chips.ula.earEdges[0].level, machine.ula._earEdges[0].level);
});

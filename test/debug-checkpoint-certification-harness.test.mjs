import test from 'node:test';
import assert from 'node:assert/strict';

import {certifyCheckpointReplay} from './helpers/checkpoint-certification.mjs';
import {M6502Machine} from '../overlay/scratch-gui/src/lib/bw-board/m6502-machine.js';
import {createM6502DebugTarget} from '../overlay/scratch-gui/src/lib/bw-board/m6502-debug.js';
import {Z80Machine} from '../overlay/scratch-gui/src/lib/bw-board/z80-machine.js';
import {createZ80DebugTarget} from '../overlay/scratch-gui/src/lib/bw-board/z80-debug.js';

const fixture = ({refuseMissing = true} = {}) => {
    const listeners = new Set();
    const state = {pc: 0, accumulator: 0, latch: 3};
    const target = {
        captureCheckpoint: () => ({schema: 1, target: 'fixture', state: structuredClone(state)}),
        restoreCheckpoint: snapshot => {
            if (snapshot?.schema !== 1) return {accepted: false, code: 'SCHEMA'};
            if (refuseMissing && !Object.hasOwn(snapshot.state, 'latch')) {
                return {accepted: false, code: 'INCOMPLETE'};
            }
            state.pc = snapshot.state.pc;
            state.accumulator = snapshot.state.accumulator;
            if (Object.hasOwn(snapshot.state, 'latch')) state.latch = snapshot.state.latch;
            return {accepted: true};
        }
    };
    return {target, state, listeners};
};

const options = extra => ({
    createFixture: () => fixture(extra),
    advance: (f, count) => {
        for (let i = 0; i < count; i++) {
            const before = f.state.pc;
            f.state.accumulator += f.state.latch;
            f.state.pc++;
            for (const listener of f.listeners) listener({kind: 'instruction',
                phase: 'retire', pcBefore: before, pcAfter: f.state.pc,
                accumulator: f.state.accumulator});
        }
    },
    observableState: f => structuredClone(f.state),
    subscribeEvents: (f, listener) => {
        f.listeners.add(listener);
        return () => f.listeners.delete(listener);
    },
    omitSensitiveState: snapshot => {
        delete snapshot.state.latch;
        return snapshot;
    }
});

test('checkpoint certification proves equality, event replay and atomic refusals', () => {
    assert.deepEqual(certifyCheckpointReplay(options({refuseMissing: true})), {
        accepted: true,
        snapshotEqual: true,
        replayEqual: true,
        schemaAtomic: true,
        omittedStateDetected: true,
        omittedStateRefused: true
    });
});

test('checkpoint certification detects accepted omitted functional state by replay sensitivity', () => {
    const configured = options({refuseMissing: false});
    configured.warmup = f => { f.state.latch = 5; };
    // Change the un-restored latch before the omission probe so a permissive
    // decoder cannot accidentally pass merely because its stale value matched.
    configured.perturbSensitiveState = f => { f.state.latch = 9; };
    const report = certifyCheckpointReplay(configured);
    assert.equal(report.omittedStateDetected, true);
    assert.equal(report.omittedStateRefused, false);
});

test('the same certification contract runs unchanged against real 6502 and Z80 targets', () => {
    const normalizeEvent = event => ({...event, time: {...event.time,
        domain: event.time.domain.replace(/-reset-\d+$/, '')}});
    const adapters = [
        () => {
            const machine = new M6502Machine({clockHz: 1_000_000,
                regions: [{kind: 'ram', start: 0, end: 0xffff}], chips: []});
            machine.mem.set([0xe6, 0x10, 0x4c, 0x00, 0x02], 0x0200); // inc $10; jmp $0200
            machine.cpu.pc = 0x0200;
            return {machine, target: createM6502DebugTarget({machine})};
        },
        () => {
            const machine = new Z80Machine({clockHz: 4_000_000,
                regions: [{kind: 'ram', start: 0, end: 0xffff}], ports: []});
            machine.mem.set([0x34, 0xc3, 0x00, 0x00], 0); // inc (hl); jp 0000
            machine.cpu.hl = 0x8000;
            return {machine, target: createZ80DebugTarget({machine})};
        }
    ];
    for (const createFixture of adapters) {
        const report = certifyCheckpointReplay({
            createFixture,
            advance: (f, count) => { for (let i = 0; i < count; i++) f.machine.step(); },
            observableState: f => f.machine.saveState(),
            subscribeEvents: (f, listener) => f.target.onDebugEvent(listener),
            normalizeEvent,
            omitSensitiveState: snapshot => {
                delete snapshot.state.cpu.pc;
                return snapshot;
            }
        });
        assert.equal(report.replayEqual, true);
        assert.equal(report.omittedStateRefused, true);
    }
});

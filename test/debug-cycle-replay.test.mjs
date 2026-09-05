import test from 'node:test';
import assert from 'node:assert/strict';
import {createCycleReplayController} from
    '../overlay/scratch-gui/src/lib/bw-debug/cycle-replay.js';

const event = (seq, value, fidelity = 'recorded') => ({schema: 1, seq,
    time: {ticks: seq + 1, domain: 'cpu', hz: 1_000_000}, cpuId: 'cpu0',
    kind: 'signal', phase: 'tick', fidelity, signals: {address: value}, inputCursor: 0});

const fixture = ({provider = {}, corruptAt = null} = {}) => {
    const expected = [event(0, 10), event(1, 11), event(2, 12)];
    const checkpoint = {id: 7, eventCursor: 0, inputCursor: 0,
        time: {ticks: 0, domain: 'cpu'}, snapshot: {tick: 0}};
    const recorder = {
        findCheckpoint: () => checkpoint,
        eventsFrom: () => expected.map(item => structuredClone(item)),
        inputsFrom: () => []
    };
    let tick = 9;
    let listener = null;
    const restored = [];
    const target = {
        capabilities: () => ({steps: ['cycle'], recording: ['checkpoint', 'restore']}),
        cycleProvider: () => ({schema: 1, engine: 'test', boundary: 'clock',
            timeDomain: 'cpu', fidelity: 'recorded', resumable: true, checkpoint: true,
            signals: ['address'], ...provider}),
        captureCheckpoint: () => ({tick}),
        restoreCheckpoint: snapshot => { tick = snapshot.tick; restored.push(tick); return true; },
        debugTime: () => ({ticks: tick, domain: 'cpu'}),
        applyReplayInput: () => true,
        onDebugEvent: callback => { listener = callback; return () => { listener = null; }; },
        replayCycle: () => {
            const seq = tick++;
            const value = seq === corruptAt ? 0xff : 10 + seq;
            listener(event(seq, value));
            return true;
        }
    };
    return {controller: createCycleReplayController({recorder, getTarget: () => target}),
        target, expected, restored, tick: () => tick};
};

test('cycle replay is gated by recorded resumable complete provider state', () => {
    for (const provider of [
        {fidelity: 'reconstructed'}, {fidelity: 'predicted'}, {resumable: false}, {checkpoint: false}
    ]) {
        const f = fixture({provider});
        assert.equal(f.controller.canReverse().accepted, false);
        assert.equal(f.controller.canReverse().code, 'unsupported-cycle-reverse');
    }
});

test('reverse restores a mid-instruction checkpoint and verifies every real cycle event', () => {
    const f = fixture();
    assert.deepEqual(f.controller.reverseToCycle(2), {accepted: true, boundary: 'cycle',
        eventCursor: 2, checkpointId: 7, replayedCycles: 2, replayedEvents: 2});
    assert.deepEqual(f.restored, [0]);
    assert.equal(f.tick(), 2, 'target remains exactly at the selected cycle boundary');
});

test('a complete mid-cycle checkpoint is itself a zero-replay destination', () => {
    const f = fixture();
    assert.deepEqual(f.controller.reverseToCycle(0), {accepted: true, boundary: 'cycle',
        eventCursor: 0, checkpointId: 7, replayedCycles: 0, replayedEvents: 0});
    assert.equal(f.tick(), 0);
});

test('divergence identifies the absolute event cursor and restores the original live state', () => {
    const f = fixture({corruptAt: 1});
    const result = f.controller.reverseToCycle(2);
    assert.equal(result.accepted, false);
    assert.equal(result.code, 'REPLAY_DIVERGED');
    assert.equal(result.divergence.cursor, 1);
    assert.deepEqual(f.restored, [0, 9], 'failed replay is transactional');
    assert.equal(f.tick(), 9);
});

test('non-cycle and reconstructed destination boundaries fail before target mutation', () => {
    for (const replacement of [
        {...event(1, 11), phase: 'edge'}, event(1, 11, 'reconstructed')
    ]) {
        const f = fixture();
        f.expected[1] = replacement;
        const result = f.controller.reverseToCycle(2);
        assert.equal(result.code, 'not-recorded-cycle-boundary');
        assert.deepEqual(f.restored, []);
        assert.equal(f.tick(), 9);
    }
});

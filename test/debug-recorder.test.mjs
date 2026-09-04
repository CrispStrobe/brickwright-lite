import test from 'node:test';
import assert from 'node:assert/strict';

import {
    RECORDER_SCHEMA,
    RecorderError,
    canonicalStringify,
    compareReplayHash,
    createDebugRecorder,
    hashReplayValues
} from '../overlay/scratch-gui/src/lib/bw-debug/recorder.js';

const input = (time, producer, payload = {}) => ({
    schema: RECORDER_SCHEMA,
    time: {ticks: BigInt(time), domain: 'oscillator'},
    producer,
    payload
});

const checkpoint = (eventCursor, inputCursor, byte) => ({
    schema: RECORDER_SCHEMA,
    time: {ticks: BigInt(eventCursor), domain: 'oscillator'},
    eventCursor,
    inputCursor,
    snapshot: {cpu: new Uint8Array([byte]), timer: {pending: byte}, prng: byte}
});

test('same-time external inputs retain append order and immutable absolute cursors', () => {
    const recorder = createDebugRecorder();
    const first = recorder.appendInput(input(12, 'keyboard', {key: 'A'}));
    const second = recorder.appendInput(input(12, 'serial0', {byte: 0x41}));

    assert.equal(first.cursor, 0);
    assert.equal(second.cursor, 1);
    assert.deepEqual(recorder.inputsFrom(0).map(({producer, order}) => ({producer, order})), [
        {producer: 'keyboard', order: 0},
        {producer: 'serial0', order: 1}
    ]);
});

test('restore lookup selects the newest checkpoint no later than the cursor', () => {
    const recorder = createDebugRecorder();
    recorder.createCheckpoint(checkpoint(0, 0, 1));
    recorder.appendEvent({schema: RECORDER_SCHEMA, seq: 0, kind: 'instruction'});
    recorder.appendEvent({schema: RECORDER_SCHEMA, seq: 1, kind: 'memory'});
    recorder.createCheckpoint(checkpoint(2, 0, 2));
    recorder.appendEvent({schema: RECORDER_SCHEMA, seq: 2, kind: 'instruction'});

    assert.equal(recorder.findCheckpoint(1).eventCursor, 0);
    assert.equal(recorder.findCheckpoint(3).eventCursor, 2);
    assert.deepEqual(recorder.eventsFrom(2).map(event => event.seq), [2]);
});

test('schema mismatches and invalid cursors fail closed with typed reasons', () => {
    const recorder = createDebugRecorder();
    assert.throws(() => recorder.appendInput({...input(0, 'key'), schema: 99}), error =>
        error instanceof RecorderError && error.code === 'SCHEMA_MISMATCH');
    assert.throws(() => recorder.createCheckpoint({...checkpoint(0, 0, 1), inputCursor: 1}), error =>
        error instanceof RecorderError && error.code === 'INVALID_CURSOR');

    recorder.createCheckpoint(checkpoint(0, 0, 1));
    assert.throws(() => recorder.inputsFrom(-1), error => error.code === 'INVALID_CURSOR');
    assert.throws(() => recorder.findCheckpoint(1), error => error.code === 'INVALID_CURSOR');
});

test('events require a restore point and strictly increasing sequence', () => {
    const recorder = createDebugRecorder();
    assert.throws(() => recorder.appendEvent({schema: RECORDER_SCHEMA, seq: 0}), error =>
        error.code === 'NO_RESTORE_POINT');
    recorder.createCheckpoint(checkpoint(0, 0, 1));
    recorder.appendEvent({schema: RECORDER_SCHEMA, seq: 5, kind: 'instruction'});
    assert.throws(() => recorder.appendEvent({schema: RECORDER_SCHEMA, seq: 5}), error =>
        error.code === 'INVALID_EVENT_SEQUENCE');
});

test('budget eviction happens at a checkpoint boundary and leaves no dangling ranges', () => {
    const recorder = createDebugRecorder({checkpointBudgetBytes: Infinity, eventBudgetBytes: 1});
    recorder.appendInput(input(0, 'reset'));
    recorder.createCheckpoint(checkpoint(0, 1, 1));
    recorder.appendEvent({schema: RECORDER_SCHEMA, seq: 0, kind: 'instruction', pcBefore: 0});
    recorder.appendEvent({schema: RECORDER_SCHEMA, seq: 1, kind: 'memory', address: 12});

    assert.equal(recorder.retention().overEventBudget, true,
        'crossing a budget between checkpoints must not evict a partial segment');
    assert.deepEqual(recorder.eventsFrom(0).map(event => event.seq), [0, 1]);

    recorder.appendInput(input(3, 'button'));
    recorder.createCheckpoint(checkpoint(2, 2, 2));
    assert.deepEqual(recorder.checkpoints().map(item => item.eventCursor), [2]);
    assert.deepEqual(recorder.eventsFrom(2), []);
    assert.deepEqual(recorder.inputsFrom(2), []);
    assert.equal(recorder.retention().inputBaseCursor, 2);
    assert.throws(() => recorder.eventsFrom(0), error => error.code === 'INVALID_CURSOR');
    assert.throws(() => recorder.inputsFrom(1), error => error.code === 'INVALID_CURSOR');
});

test('an irreducible segment reports over-budget rather than deleting its restore point', () => {
    const recorder = createDebugRecorder({checkpointBudgetBytes: 0, eventBudgetBytes: 0});
    recorder.createCheckpoint(checkpoint(0, 0, 7));
    recorder.appendEvent({schema: RECORDER_SCHEMA, seq: 0, kind: 'instruction'});
    const status = recorder.retention();
    assert.equal(status.overCheckpointBudget, true);
    assert.equal(status.overEventBudget, true);
    assert.equal(recorder.checkpoints().length, 1);
    assert.equal(recorder.eventsFrom(0).length, 1);
});

test('canonical replay hashes ignore object key order but detect omitted mutable state', () => {
    const complete = [{seq: 1, changes: {timer: 4, prng: 9}, time: {ticks: 2n}}];
    const reordered = [{time: {ticks: 2n}, changes: {prng: 9, timer: 4}, seq: 1}];
    const omittedTimer = [{seq: 1, changes: {prng: 9}, time: {ticks: 2n}}];
    const expected = hashReplayValues(complete);

    assert.equal(hashReplayValues(reordered), expected);
    assert.deepEqual(compareReplayHash(expected, reordered), {
        matches: true, expected, actual: expected, reason: null
    });
    const divergence = compareReplayHash(expected, omittedTimer);
    assert.equal(divergence.matches, false);
    assert.equal(divergence.reason, 'REPLAY_DIVERGED');
    assert.notEqual(divergence.actual, expected);
    assert.match(canonicalStringify(new Uint8Array([1, 2])), /Uint8Array/);
});

test('returned records are defensive clones of stored recording truth', () => {
    const recorder = createDebugRecorder();
    const source = checkpoint(0, 0, 4);
    const returned = recorder.createCheckpoint(source);
    source.snapshot.timer.pending = 99;
    returned.snapshot.timer.pending = 88;
    assert.equal(recorder.findCheckpoint(0).snapshot.timer.pending, 4);
});

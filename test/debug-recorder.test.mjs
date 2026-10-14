import test from 'node:test';
import assert from 'node:assert/strict';

import {
    RECORDER_SCHEMA,
    RecorderError,
    canonicalStringify,
    compareReplayHash,
    compareReplayValues,
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

test('events link to the input prefix applied at their boundary', () => {
    const recorder = createDebugRecorder();
    recorder.createCheckpoint(checkpoint(0, 0, 1));
    recorder.appendInput(input(0, 'key'));
    recorder.appendEvent({schema: RECORDER_SCHEMA, seq: 0, kind: 'instruction'});
    assert.equal(recorder.eventsFrom(0)[0].inputCursor, 1);
});

test('input time is monotonic per clock domain while cursor orders different producers', () => {
    const recorder = createDebugRecorder();
    recorder.appendInput(input(10, 'keyboard'));
    recorder.appendInput({...input(1, 'network'), time: {ticks: 1n, domain: 'wall'}});
    recorder.appendInput(input(10, 'serial'));
    assert.throws(() => recorder.appendInput(input(9, 'keyboard')), error =>
        error instanceof RecorderError && error.code === 'INVALID_INPUT_ORDER' &&
        error.details.previous === 10n && error.details.actual === 9n);
    assert.deepEqual(recorder.inputsFrom(0).map(item => item.cursor), [0, 1, 2]);
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

test('previous retire lookup is strict, snapshot-free and works inside an instruction group', () => {
    const recorder = createDebugRecorder();
    recorder.createCheckpoint(checkpoint(0, 0, 1));
    recorder.appendEvent({schema: RECORDER_SCHEMA, seq: 0, kind: 'memory'});
    recorder.appendEvent({schema: RECORDER_SCHEMA, seq: 1, kind: 'instruction', phase: 'retire'});
    recorder.appendEvent({schema: RECORDER_SCHEMA, seq: 2, kind: 'port'});
    recorder.appendEvent({schema: RECORDER_SCHEMA, seq: 3, kind: 'memory'});
    recorder.appendEvent({schema: RECORDER_SCHEMA, seq: 4, kind: 'instruction', phase: 'retire'});

    assert.equal(recorder.previousRetireCursor(0), null);
    assert.equal(recorder.previousRetireCursor(2), null,
        'a boundary equal to the query is the current boundary, not the previous one');
    assert.equal(recorder.previousRetireCursor(3), 2,
        'a cursor inside the next instruction resolves to the completed prior retire');
    assert.equal(recorder.previousRetireCursor(5), 2);
    assert.equal(recorder.previousInstructionBoundaryCursor(2), 0,
        'the first instruction reverses to its retained checkpoint anchor');
    assert.equal(recorder.previousInstructionBoundaryCursor(5), 2,
        'strict lookup skips the current retire boundary');
    assert.equal(recorder.checkpoints()[0].snapshot.cpu[0], 1,
        'lookup neither reads nor mutates the checkpoint snapshot');
});

test('retire index is trimmed atomically with checkpoint-boundary eviction', () => {
    const recorder = createDebugRecorder({eventBudgetBytes: 1});
    recorder.createCheckpoint(checkpoint(0, 0, 1));
    recorder.appendEvent({schema: RECORDER_SCHEMA, seq: 0, kind: 'instruction', phase: 'retire'});
    recorder.appendEvent({schema: RECORDER_SCHEMA, seq: 1, kind: 'memory'});
    recorder.createCheckpoint(checkpoint(2, 0, 2));
    recorder.appendEvent({schema: RECORDER_SCHEMA, seq: 2, kind: 'instruction', phase: 'retire'});

    assert.equal(recorder.previousRetireCursor(3), null,
        'the retire before the retained restore point must not remain addressable');
    assert.equal(recorder.previousInstructionBoundaryCursor(3), 2,
        'the retained checkpoint is the preceding boundary for its first instruction');
    assert.throws(() => recorder.previousRetireCursor(1), error => error.code === 'INVALID_CURSOR');
});

test('a recording may begin at the live stream current cursor', () => {
    const recorder = createDebugRecorder();
    recorder.createCheckpoint(checkpoint(40, 0, 1));
    recorder.appendEvent({schema: RECORDER_SCHEMA, seq: 40, kind: 'instruction'});
    assert.deepEqual(recorder.eventsFrom(40).map(event => event.seq), [40]);
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
    recorder.appendEvent({schema: RECORDER_SCHEMA, seq: 0, kind: 'instruction'});
    assert.throws(() => recorder.appendEvent({schema: RECORDER_SCHEMA, seq: 0}), error =>
        error.code === 'INVALID_EVENT_SEQUENCE');
    assert.throws(() => recorder.appendEvent({schema: RECORDER_SCHEMA, seq: 2}), error =>
        error.code === 'EVENT_SEQUENCE_GAP');
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

test('input storage participates in atomic checkpoint-boundary eviction', () => {
    const recorder = createDebugRecorder({
        checkpointBudgetBytes: Infinity, eventBudgetBytes: Infinity, inputBudgetBytes: 1
    });
    recorder.appendInput(input(0, 'keyboard', {text: 'large input payload'}));
    recorder.createCheckpoint(checkpoint(0, 1, 1));
    assert.equal(recorder.retention().overInputBudget, true,
        'one restore segment is retained even while over budget');
    recorder.appendInput(input(1, 'serial'));
    recorder.createCheckpoint(checkpoint(0, 2, 2));
    assert.deepEqual(recorder.checkpoints().map(item => item.inputCursor), [2]);
    assert.deepEqual(recorder.inputsFrom(2), []);
    assert.equal(recorder.retention().inputBytes, 0);
    assert.throws(() => recorder.inputsFrom(1), error => error.code === 'INVALID_CURSOR');
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
    assert.notEqual(hashReplayValues(new DataView(Uint8Array.of(1).buffer)),
        hashReplayValues(new DataView(Uint8Array.of(2).buffer)));
    assert.throws(() => hashReplayValues(new Map([['cpu', 1]])), error =>
        error instanceof RecorderError && error.code === 'UNHASHABLE_VALUE');
});

test('ordered replay comparison reports the first divergent absolute cursor without payloads', () => {
    const expected = [{pc: 1}, {pc: 2, memory: [3]}, {pc: 4}];
    const actual = [{pc: 1}, {pc: 2, memory: [9]}, {pc: 4}];
    const divergence = compareReplayValues(expected, actual, {baseCursor: 40});
    assert.equal(divergence.matches, false);
    assert.equal(divergence.reason, 'REPLAY_DIVERGED');
    assert.equal(divergence.cursor, 41);
    assert.equal(divergence.expectedPresent, true);
    assert.equal(divergence.actualPresent, true);
    assert.notEqual(divergence.expectedHash, divergence.actualHash);
    assert.equal('expected' in divergence, false, 'diagnostic must not copy replay payloads');

    const truncated = compareReplayValues(expected, expected.slice(0, 2), {baseCursor: 40});
    assert.equal(truncated.cursor, 42);
    assert.equal(truncated.actualPresent, false);
    assert.equal(compareReplayValues(expected, expected).matches, true);
});

test('explicit checkpoint ids cannot collide with later automatic allocation', () => {
    const recorder = createDebugRecorder();
    assert.equal(recorder.createCheckpoint({...checkpoint(0, 0, 1), id: 1}).id, 1);
    assert.equal(recorder.createCheckpoint(checkpoint(0, 0, 2)).id, 0);
    assert.equal(recorder.createCheckpoint(checkpoint(0, 0, 3)).id, 2);
});

test('returned records are defensive clones of stored recording truth', () => {
    const recorder = createDebugRecorder();
    const source = checkpoint(0, 0, 4);
    const returned = recorder.createCheckpoint(source);
    source.snapshot.timer.pending = 99;
    returned.snapshot.timer.pending = 88;
    assert.equal(recorder.findCheckpoint(0).snapshot.timer.pending, 4);
    const summary = recorder.checkpointSummary()[0];
    assert.equal('snapshot' in summary, false, 'render-facing summaries must not clone target memory');
    summary.time.ticks = 99n;
    assert.equal(recorder.checkpointSummary()[0].time.ticks, 0n);
});

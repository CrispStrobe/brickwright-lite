import test from 'node:test';
import assert from 'node:assert/strict';

import {
    HaltOccurrenceLedgerError,
    createHaltOccurrenceLedger
} from '../overlay/scratch-gui/src/lib/bw-debug/halt-occurrence-ledger.js';

const halt = (boundaryCursor, overrides = {}) => ({
    boundaryCursor,
    triggerEventSeq: boundaryCursor || null,
    matchingIds: ['execute:1'],
    generation: 0,
    stopSide: 'before',
    source: 'breakpoint-engine',
    ...overrides
});

test('appends compact immutable summaries with independent monotonic cursors', () => {
    const ledger = createHaltOccurrenceLedger();
    const ids = ['b', 'a', 'b'];
    const first = ledger.append(halt(7, {matchingIds: ids, triggerEventSeq: null}));
    ids[0] = 'mutated';
    const second = ledger.append(halt(9, {generation: 1, stopSide: 'after', source: 'native'}));

    assert.deepEqual(first, {
        occurrenceCursor: 0, boundaryCursor: 7, triggerEventSeq: null,
        matchingIds: ['b', 'a'], generation: 0, stopSide: 'before', source: 'breakpoint-engine'
    });
    assert.equal(second.occurrenceCursor, 1);
    first.matchingIds[0] = 'caller mutation';
    assert.deepEqual(ledger.summaries()[0].matchingIds, ['b', 'a']);
    const summaries = ledger.summaries();
    summaries[0].source = 'caller mutation';
    summaries[0].matchingIds.push('caller mutation');
    assert.equal(ledger.summaries()[0].source, 'breakpoint-engine');
    assert.deepEqual(ledger.summaries()[0].matchingIds, ['b', 'a']);
    assert.throws(() => ledger.append({...halt(10), payload: {registers: 'forbidden'}}), error =>
        error instanceof HaltOccurrenceLedgerError && error.code === 'UNSUPPORTED_FIELD');
});

test('strict previous lookups handle equal cursors and equal boundaries', () => {
    const ledger = createHaltOccurrenceLedger();
    ledger.append(halt(10, {matchingIds: ['one']}));
    ledger.append(halt(10, {matchingIds: ['two']}));
    ledger.append(halt(20, {matchingIds: ['three']}));

    assert.equal(ledger.previousByOccurrenceCursor(0), null);
    assert.equal(ledger.previousByOccurrenceCursor(1).occurrenceCursor, 0);
    assert.equal(ledger.previousByOccurrenceCursor(3).occurrenceCursor, 2);
    assert.equal(ledger.previousBeforeBoundary(10), null);
    assert.equal(ledger.previousBeforeBoundary(20).occurrenceCursor, 1);
    assert.equal(ledger.previousBeforeBoundary(21).occurrenceCursor, 2);
    assert.throws(() => ledger.previousByOccurrenceCursor(4), error => error.code === 'INVALID_CURSOR');
});

test('checkpoint eviction is explicit, boundary-aligned and cursors never recycle', () => {
    const ledger = createHaltOccurrenceLedger({maxOccurrences: 3});
    ledger.append(halt(4));
    ledger.append(halt(8));
    ledger.append(halt(12));
    assert.throws(() => ledger.append(halt(16)), error =>
        error instanceof HaltOccurrenceLedgerError && error.code === 'CAPACITY_EXCEEDED');

    assert.equal(ledger.evictBeforeCheckpoint(8), 1);
    assert.deepEqual(ledger.summaries().map(item => item.boundaryCursor), [8, 12]);
    assert.throws(() => ledger.previousByOccurrenceCursor(0), error => error.code === 'INVALID_CURSOR');
    assert.equal(ledger.append(halt(16)).occurrenceCursor, 3);
    assert.deepEqual(ledger.retention(), {
        maxOccurrences: 3,
        retainedOccurrences: 3,
        evictedOccurrences: 1,
        nextOccurrenceCursor: 4,
        firstOccurrenceCursor: 1
    });
});

test('duplicate checkpoint boundaries remain retained and full eviction preserves global ordering', () => {
    const ledger = createHaltOccurrenceLedger({maxOccurrences: 3});
    ledger.append(halt(8));
    ledger.append(halt(8));
    assert.equal(ledger.evictBeforeCheckpoint(8), 0,
        'occurrences exactly at the retained checkpoint boundary remain addressable');
    assert.equal(ledger.evictBeforeCheckpoint(9), 2);
    assert.deepEqual(ledger.summaries(), []);
    assert.throws(() => ledger.append(halt(7)), error => error.code === 'BOUNDARY_ORDER');
    assert.equal(ledger.append(halt(9)).occurrenceCursor, 2);
});

test('invalid and out-of-order facts fail closed without consuming a cursor', () => {
    assert.throws(() => createHaltOccurrenceLedger({maxOccurrences: 0}), RangeError);
    const ledger = createHaltOccurrenceLedger();
    ledger.append(halt(4));
    assert.throws(() => ledger.append(halt(3)), error => error.code === 'BOUNDARY_ORDER');
    assert.throws(() => ledger.append(halt(5, {stopSide: 'during'})), TypeError);
    assert.throws(() => ledger.append(halt(5, {triggerEventSeq: -1})), TypeError);
    assert.throws(() => ledger.append(halt(5, {matchingIds: [1]})), TypeError);
    assert.equal(ledger.append(halt(5)).occurrenceCursor, 1);
});

test('clear starts a new execution history', () => {
    const ledger = createHaltOccurrenceLedger();
    ledger.append(halt(4));
    ledger.evictBeforeCheckpoint(5);
    ledger.clear();
    assert.deepEqual(ledger.retention(), {
        maxOccurrences: 4096,
        retainedOccurrences: 0,
        evictedOccurrences: 0,
        nextOccurrenceCursor: 0,
        firstOccurrenceCursor: null
    });
    assert.equal(ledger.append(halt(0)).occurrenceCursor, 0);
});

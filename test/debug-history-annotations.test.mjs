import assert from 'node:assert/strict';
import test from 'node:test';

import {createHistoryAnnotationStore} from
    '../overlay/scratch-gui/src/lib/bw-debug/history-annotations.js';
import {createBranchCursor} from '../overlay/scratch-gui/src/lib/bw-debug/fork-history.js';

const at = (branchId, eventCursor) => createBranchCursor(branchId, eventCursor);

test('bookmarks and annotations retain immutable branch-qualified cursors and bounded text', () => {
    const store = createHistoryAnnotationStore({resolveCheckpoint () {}, maxEntries: 2, maxTextBytes: 12});
    const cursor = {branchId: 'left', eventCursor: 7};
    const bookmark = store.addBookmark({cursor, label: 'loop', annotation: 'why'});
    cursor.eventCursor = 99;
    assert.deepEqual(bookmark.entry.cursor, at('left', 7));
    assert.throws(() => { bookmark.entry.cursor.eventCursor = 4; }, TypeError);
    assert.equal(store.addAnnotation({cursor: at('right', 8), annotation: 'compare'}).accepted, true);
    assert.equal(store.addAnnotation({cursor: at('main', 9), annotation: 'full'}).code,
        'annotation-capacity');
    assert.deepEqual(store.list({branchId: 'left'}).map(entry => entry.id), [1]);
    assert.throws(() => store.addBookmark({cursor: at('main', 1), label: '0123456789abc'}), RangeError);
    assert.equal(store.update(1, {label: 'loop-2'}).entry.label, 'loop-2');
    assert.equal(store.remove(2).accepted, true);
    assert.equal(store.retention().retainedEntries, 1);
});

test('checkpoint comparison uses public inspection only and never traverses opaque snapshots', () => {
    let snapshotReads = 0;
    const checkpoints = new Map();
    const put = (cursor, inspection) => checkpoints.set(`${cursor.branchId}:${cursor.eventCursor}`, {
        id: cursor.eventCursor, eventCursor: cursor.eventCursor,
        time: {domain: 'cpu', ticks: cursor.eventCursor}, inspection,
        get snapshot () { snapshotReads++; throw new Error('opaque snapshot must stay private'); }
    });
    put(at('left', 4), {registers: {a: 1, pc: 0x200}, memory: new Uint8Array([1, 2])});
    put(at('right', 9), {registers: {a: 2, pc: 0x200}, memory: new Uint8Array([1, 3])});
    const store = createHistoryAnnotationStore({resolveCheckpoint: cursor =>
        checkpoints.get(`${cursor.branchId}:${cursor.eventCursor}`)});
    const result = store.compareCheckpoints(at('left', 4), at('right', 9));
    assert.equal(result.accepted, true);
    assert.equal(result.identical, false);
    assert.deepEqual(result.differences.map(item => item.path), ['memory.hash', 'registers.a']);
    assert.equal(snapshotReads, 0);
    assert.equal('snapshot' in result.left, false);
    assert.throws(() => { result.left.inspection.registers.a = 99; }, TypeError);
});

test('comparison refuses wrong checkpoint boundaries and caps reported fields', () => {
    const resolveCheckpoint = cursor => ({eventCursor: cursor.eventCursor === 3 ? 2 : cursor.eventCursor,
        time: {domain: 'cpu', ticks: 0}, inspection: {a: 1, b: 2, c: 3}});
    const store = createHistoryAnnotationStore({resolveCheckpoint, maxComparisonFields: 2});
    assert.equal(store.compareCheckpoints(at('main', 3), at('main', 4)).code,
        'checkpoint-comparison-unavailable');
    const bounded = store.compareCheckpoints(at('main', 4), at('other', 4));
    assert.equal(bounded.accepted, true);
    assert.ok(bounded.differences.length <= 2);
    assert.equal(bounded.truncated, true);
});

test('portable entries restore IDs, branch cursors, and the next monotonic ID', () => {
    const store = createHistoryAnnotationStore({resolveCheckpoint () {}, initialEntries: [
        {id: 4, kind: 'bookmark', cursor: at('left', 8), label: 'loop', annotation: ''},
        {id: 9, kind: 'annotation', cursor: at('right', 12), annotation: 'IRQ arrived'}
    ]});
    assert.deepEqual(store.list().map(entry => [entry.id, entry.kind, entry.cursor.branchId]),
        [[4, 'bookmark', 'left'], [9, 'annotation', 'right']]);
    assert.equal(store.addAnnotation({cursor: at('right', 13), annotation: 'continued'}).entry.id, 10);
});

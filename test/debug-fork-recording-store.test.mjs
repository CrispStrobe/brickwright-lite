import test from 'node:test';
import assert from 'node:assert/strict';

import {createBranchCursor} from '../overlay/scratch-gui/src/lib/bw-debug/fork-history.js';
import {createForkRecordingStore} from
    '../overlay/scratch-gui/src/lib/bw-debug/fork-recording-store.js';

const at = (branchId, eventCursor) => createBranchCursor(branchId, eventCursor);

test('retains exact opaque handles while fork creation leaves activation explicit', () => {
    const root = {recorder: {}, session: {}};
    const child = {recorder: {}, session: {}};
    const store = createForkRecordingStore({rootBranchId: 'root', rootRecording: root});
    const forked = store.fork({branchId: 'child', forkCursor: at('root', 4), recording: child});
    assert.equal(forked.accepted, true);
    assert.strictEqual(store.active().recording, root);
    assert.equal(store.active().branch.branchId, 'root');
    assert.strictEqual(store.recordingFor('child').recording, child);

    const activated = store.activate('child');
    assert.strictEqual(activated.recording, child);
    assert.strictEqual(store.active().recording, child);
    assert.equal(store.activate('missing').code, 'branch-not-retained');
    assert.strictEqual(store.active().recording, child);
});

test('sibling ordinals remain branch-qualified and never alias recording handles', () => {
    const root = {};
    const left = {};
    const right = {};
    const store = createForkRecordingStore({rootRecording: root});
    store.fork({branchId: 'left', forkCursor: at('main', 5), recording: left});
    store.fork({branchId: 'right', forkCursor: at('main', 5), recording: right});
    assert.notDeepEqual(at('left', 9), at('right', 9));
    assert.notStrictEqual(store.recordingFor('left').recording,
        store.recordingFor('right').recording);
    assert.deepEqual(store.summaries().map(item => [item.branchId, item.forkCursor]), [
        ['main', at('main', 0)], ['left', at('main', 5)], ['right', at('main', 5)]
    ]);
});

test('checkpoint eviction releases only lineage-safe inactive branch recordings', () => {
    const store = createForkRecordingStore({rootRecording: {}, maxBranches: 5});
    store.fork({branchId: 'parent', forkCursor: at('main', 1), recording: {name: 'parent'}});
    store.activate('parent');
    store.fork({branchId: 'child', forkCursor: at('parent', 2), recording: {name: 'child'}});
    store.activate('main');
    store.fork({branchId: 'active', forkCursor: at('main', 8), recording: {name: 'active'}});
    store.activate('active');

    const removed = store.evictBeforeCheckpoint(at('main', 7));
    assert.deepEqual([...removed.removed], ['child', 'parent']);
    assert.equal(store.recordingFor('child').code, 'branch-not-retained');
    assert.equal(store.recordingFor('parent').code, 'branch-not-retained');
    assert.equal(store.recordingFor('active').accepted, true);
    assert.equal(store.recordingFor('main').accepted, true);
});

test('prepared store fork publishes lineage and payload together only after successful commit', () => {
    const root = {};
    const child = {checkpoint: {}, recorder: {}};
    const store = createForkRecordingStore({rootRecording: root});
    const prepared = store.prepareFork({branchId: 'child', forkCursor: at('main', 4)});
    assert.equal(prepared.accepted, true);
    assert.equal(store.recordingFor('child').code, 'branch-not-retained');
    assert.equal(prepared.reservation.commit(undefined).code, 'recording-required');
    assert.equal(store.recordingFor('child').code, 'branch-not-retained');
    assert.equal(prepared.reservation.commit(child).accepted, true);
    assert.strictEqual(store.recordingFor('child').recording, child);
    assert.strictEqual(store.active().recording, root);
    assert.equal(prepared.reservation.commit({}).code, 'reservation-finished');
});

test('aborted or stale store reservations leave no lineage or payload orphan', () => {
    const store = createForkRecordingStore({rootRecording: {}});
    const aborted = store.prepareFork({branchId: 'aborted', forkCursor: at('main', 1)});
    assert.equal(aborted.reservation.abort().accepted, true);
    assert.equal(store.recordingFor('aborted').code, 'branch-not-retained');

    const stale = store.prepareFork({branchId: 'stale', forkCursor: at('main', 1)});
    store.fork({branchId: 'other', forkCursor: at('main', 2), recording: {}});
    assert.equal(stale.reservation.commit({}).code, 'stale-fork-reservation');
    assert.equal(store.recordingFor('stale').code, 'branch-not-retained');
});

test('failed forks retain neither payload nor identity and capacity never evicts implicitly', () => {
    const store = createForkRecordingStore({rootRecording: {}, maxBranches: 2});
    const a = {};
    assert.equal(store.fork({branchId: 'a', forkCursor: at('main', 1), recording: a}).accepted, true);
    assert.equal(store.fork({branchId: 'b', parentBranchId: 'missing',
        forkCursor: at('missing', 2), recording: {}}).code, 'unknown-parent-branch');
    assert.equal(store.recordingFor('b').code, 'branch-not-retained');
    assert.equal(store.fork({branchId: 'b', forkCursor: at('main', 2), recording: {}}).code,
        'branch-capacity');
    assert.deepEqual(store.summaries().map(item => item.branchId), ['main', 'a']);
    assert.strictEqual(store.recordingFor('a').recording, a);
});

test('opaque handles are required but may intentionally be null', () => {
    assert.throws(() => createForkRecordingStore(), /rootRecording is required/);
    const store = createForkRecordingStore({rootRecording: null});
    assert.strictEqual(store.active().recording, null);
    assert.throws(() => store.fork({branchId: 'missing-payload', forkCursor: at('main', 1)}),
        /fork recording is required/);
    assert.equal(store.fork({branchId: 'null-child', forkCursor: at('main', 1), recording: null}).accepted,
        true);
    assert.strictEqual(store.recordingFor('null-child').recording, null);
});

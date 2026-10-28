import test from 'node:test';
import assert from 'node:assert/strict';
import {createDebuggerSessionBundle, validateDebuggerSessionBundle,
    importDebuggerSessionBundle} from '../overlay/scratch-gui/src/lib/bw-debug/session-bundle.js';

const codecs = {test: {
    encode: snapshot => new TextEncoder().encode(JSON.stringify(snapshot)),
    decode: bytes => JSON.parse(new TextDecoder().decode(bytes))
}};
const bytes = value => value instanceof Uint8Array ? value :
    new TextEncoder().encode(typeof value === 'string' ? value : JSON.stringify(value));
const receipt = async (chunk, value) => {
    const payload = bytes(value);
    const digest = await crypto.subtle.digest('SHA-256', payload);
    const sha256 = Buffer.from(digest).toString('hex');
    return [{chunk, sha256, bytes: payload.length},
        {encoding: 'base64', bytes: Buffer.from(payload).toString('base64'), sha256}];
};
const legacyFixture = async () => {
    const chunks = {};
    const add = async (id, value) => {
        const [ref, chunk] = await receipt(id, value); chunks[id] = chunk; return ref;
    };
    const firmware = await add('firmware', new Uint8Array([9, 8]));
    const source = await add('source', 'legacy source');
    const trace = await add('trace', [{seq: 0}, {seq: 1}]);
    const snapshot = await add('snapshot-0', {legacy: true});
    return {manifest: {schema: 1, kind: 'brickworks-debug-session', firmware, source, trace,
        branches: [{id: 'main', parentId: null, eventCursor: 0},
            {id: 'fork', parentId: 'main', eventCursor: 1}],
        checkpoints: [{id: 7, eventCursor: 0, inputCursor: 0,
            time: {ticks: 0, domain: 'cpu'}, codec: 'test', snapshot}],
        bookmarks: [{eventCursor: 2, label: 'legacy last event'}],
        annotations: [{eventCursor: 0, text: 'start'}], codecs: ['test']}, chunks};
};
const input = () => ({firmware: new Uint8Array([1, 2, 3]), source: 'LD A,1', codecs,
    trace: [{seq: 0, fidelity: 'recorded'}, {seq: 1, fidelity: 'recorded'}],
    inputs: [{cursor: 0, time: {ticks: 1, domain: 'cpu'}, producer: 'key'}],
    branches: [{id: 'main', parentId: null, eventCursor: 0}],
    checkpoints: [{id: 4, eventCursor: 0, inputCursor: 0, time: {ticks: 0, domain: 'cpu'},
        codec: 'test', snapshot: {secret: 'opaque-machine-state'}}],
    bookmarks: [{eventCursor: 1, label: 'loop'}],
    annotations: [{eventCursor: 1, text: 'inspect bus'}]});

test('portable bundle has versioned manifest, content hashes and opaque snapshot chunks', async () => {
    const bundle = await createDebuggerSessionBundle(input());
    assert.equal(bundle.manifest.schema, 1);
    assert.equal(bundle.manifest.kind, 'brickworks-debug-session');
    assert.match(bundle.manifest.firmware.sha256, /^[0-9a-f]{64}$/);
    assert.match(bundle.manifest.source.sha256, /^[0-9a-f]{64}$/);
    assert.equal(JSON.stringify(bundle).includes('opaque-machine-state'), false,
        'snapshot internals must not enter manifests or structural comparisons');
    const summary = await validateDebuggerSessionBundle(bundle, {codecs});
    assert.deepEqual([summary.traceEvents, summary.branches, summary.checkpoints], [2, 1, 1]);
    assert.equal(Object.hasOwn(summary, 'snapshots'), false);
});

test('import validates everything before one destination mutation', async () => {
    const bundle = await createDebuggerSessionBundle(input());
    let commits = 0; let staged;
    const imported = await importDebuggerSessionBundle({bundle, codecs, commit: value => {
        commits++; staged = value; return {branch: 'main'};
    }});
    assert.equal(imported.accepted, true);
    assert.equal(commits, 1);
    assert.deepEqual([...staged.firmware], [1, 2, 3]);
    assert.equal(staged.source, 'LD A,1');
    assert.deepEqual(staged.checkpoints[0].snapshot, {secret: 'opaque-machine-state'});
    assert.equal(staged.inputs[0].producer, 'key');
});

test('hash, order, codec and bounds failures occur before decode or commit', async () => {
    const original = await createDebuggerSessionBundle(input());
    const cases = [];
    let changed = structuredClone(original);
    changed.chunks.firmware.bytes = 'AAAA'; cases.push(changed);
    changed = structuredClone(original); changed.manifest.recordings.push(
        structuredClone(changed.manifest.recordings[0])); cases.push(changed);
    changed = structuredClone(original); changed.manifest.codecs = ['missing']; cases.push(changed);
    changed = structuredClone(original); changed.manifest.recordings[0].trace.bytes = 99_999_999; cases.push(changed);
    for (const bundle of cases) {
        let decoded = 0; let committed = 0;
        const guarded = {test: {...codecs.test, decode: bytes => { decoded++; return codecs.test.decode(bytes); }}};
        await assert.rejects(importDebuggerSessionBundle({bundle, codecs: guarded,
            commit: () => { committed++; }}));
        assert.equal(decoded, 0);
        assert.equal(committed, 0);
    }
});

test('creation enforces bounded collections and canonical increasing trace order on validation', async () => {
    await assert.rejects(createDebuggerSessionBundle({...input(), trace: [{seq: 0}, {seq: 1}],
        limits: {traceEvents: 1}}));
    const bundle = await createDebuggerSessionBundle(input());
    const trace = new TextEncoder().encode(JSON.stringify([{seq: 2}, {seq: 1}]));
    // Replace the trace through the public creator so its receipt remains valid.
    const reordered = await createDebuggerSessionBundle({...input(), trace: JSON.parse(new TextDecoder().decode(trace))});
    await assert.rejects(validateDebuggerSessionBundle(reordered, {codecs}), error =>
        error.code === 'INVALID_TRACE_ORDER');
    assert.equal(bundle.manifest.annotations.length, 1);
});

test('branch recordings retain independent event/input cursors and checkpoint ownership', async () => {
    const base = input();
    base.branches.push({id: 'fork', parentId: 'main', eventCursor: 1});
    const recordings = [
        {branchId: 'main', trace: [{seq: 0}], inputs: [{cursor: 0,
            time: {ticks: 1, domain: 'cpu'}, producer: 'key'}], checkpoints: base.checkpoints},
        {branchId: 'fork', trace: [{seq: 0}], inputs: [{cursor: 0,
            time: {ticks: 2, domain: 'cpu'}, producer: 'irq'}], checkpoints: [{...base.checkpoints[0], id: 5}]}
    ];
    const bundle = await createDebuggerSessionBundle({...base, recordings});
    const summary = await validateDebuggerSessionBundle(bundle, {codecs});
    assert.deepEqual([summary.traceEvents, summary.inputs], [2, 2]);
    let staged;
    await importDebuggerSessionBundle({bundle, codecs, commit: value => { staged = value; }});
    assert.equal(staged.recordings.length, 2);
    assert.deepEqual(staged.recordings.map(x => [x.branchId, x.trace[0].seq,
        x.inputs[0].cursor, x.checkpoints[0].branchId]),
    [['main', 0, 0, 'main'], ['fork', 0, 0, 'fork']]);
    assert.equal(Object.hasOwn(staged, 'trace'), false,
        'multi-branch imports cannot expose an ambiguous flattened trace');
});

test('imports genuine original schema-1 manifests and upgrades their recording view', async () => {
    const bundle = await legacyFixture();
    const summary = await validateDebuggerSessionBundle(bundle, {codecs});
    assert.deepEqual([summary.traceEvents, summary.inputs, summary.branches], [2, 0, 2]);
    let staged;
    await importDebuggerSessionBundle({bundle, codecs, commit: value => { staged = value; }});
    assert.deepEqual(staged.recordings.map(item => [item.branchId, item.trace.length, item.inputs.length]),
        [['main', 2, 0], ['fork', 0, 0]]);
    assert.equal(staged.checkpoints[0].branchId, 'main');
    assert.deepEqual(staged.checkpoints[0].snapshot, {legacy: true});

    const empty = await legacyFixture();
    empty.manifest.branches = [];
    empty.manifest.checkpoints = [];
    empty.manifest.codecs = [];
    empty.manifest.bookmarks = [{eventCursor: 2, label: 'last boundary'}];
    delete empty.chunks['snapshot-0'];
    let emptyStaged;
    await importDebuggerSessionBundle({bundle: empty, codecs, commit: value => { emptyStaged = value; }});
    assert.deepEqual(emptyStaged.branches, [{id: 'main', parentId: null, eventCursor: 0}]);
    assert.equal(emptyStaged.recordings[0].trace.length, 2);
});

test('session marks use boundary cursors and cover empty retained ranges', async () => {
    const canonicalLastBoundary = await createDebuggerSessionBundle({...input(),
        bookmarks: [{eventCursor: 2, label: 'after seq 1'}]});
    await validateDebuggerSessionBundle(canonicalLastBoundary, {codecs});

    const checkpointOnly = await createDebuggerSessionBundle({...input(), trace: [],
        branches: [{id: 'main', parentId: null, eventCursor: 7}],
        checkpoints: [{...input().checkpoints[0], eventCursor: 7}],
        bookmarks: [{eventCursor: 7, label: 'checkpoint boundary'}], annotations: []});
    await validateDebuggerSessionBundle(checkpointOnly, {codecs});

    const completelyEmpty = await createDebuggerSessionBundle({...input(), trace: [], checkpoints: [],
        bookmarks: [{eventCursor: 0, label: 'empty start'}], annotations: []});
    await validateDebuggerSessionBundle(completelyEmpty, {codecs});
});

test('total byte accounting includes the manifest inspection surface on create and validate', async () => {
    const bundle = await createDebuggerSessionBundle(input());
    const rawChunkBytes = Object.values(bundle.chunks).reduce((sum, chunk) =>
        sum + Buffer.from(chunk.bytes, 'base64').length, 0);
    const expected = rawChunkBytes + bytes(bundle.manifest).length;
    const summary = await validateDebuggerSessionBundle(bundle, {codecs});
    assert.equal(summary.totalBytes, expected);
    assert.ok(Buffer.byteLength(JSON.stringify(bundle)) < expected * 4 / 3 + 1024,
        'the accounted export remains safely within the import envelope');
    await assert.rejects(createDebuggerSessionBundle({...input(), limits: {totalBytes: expected - 1}}),
        error => error.code === 'BUNDLE_LIMIT_EXCEEDED');
    await assert.rejects(validateDebuggerSessionBundle(bundle, {codecs, limits: {totalBytes: expected - 1}}),
        error => error.code === 'BUNDLE_LIMIT_EXCEEDED');
});

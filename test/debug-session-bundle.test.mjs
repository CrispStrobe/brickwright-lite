import test from 'node:test';
import assert from 'node:assert/strict';
import {createDebuggerSessionBundle, validateDebuggerSessionBundle,
    importDebuggerSessionBundle} from '../overlay/scratch-gui/src/lib/bw-debug/session-bundle.js';

const codecs = {test: {
    encode: snapshot => new TextEncoder().encode(JSON.stringify(snapshot)),
    decode: bytes => JSON.parse(new TextDecoder().decode(bytes))
}};
const input = () => ({firmware: new Uint8Array([1, 2, 3]), source: 'LD A,1', codecs,
    trace: [{seq: 0, fidelity: 'recorded'}, {seq: 1, fidelity: 'recorded'}],
    branches: [{id: 'main', parentId: null, eventCursor: 0},
        {id: 'fork', parentId: 'main', eventCursor: 1}],
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
    assert.deepEqual([summary.traceEvents, summary.branches, summary.checkpoints], [2, 2, 1]);
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
});

test('hash, order, codec and bounds failures occur before decode or commit', async () => {
    const original = await createDebuggerSessionBundle(input());
    const cases = [];
    let changed = structuredClone(original);
    changed.chunks.firmware.bytes = 'AAAA'; cases.push(changed);
    changed = structuredClone(original); changed.manifest.branches.reverse(); cases.push(changed);
    changed = structuredClone(original); changed.manifest.codecs = ['missing']; cases.push(changed);
    changed = structuredClone(original); changed.manifest.trace.bytes = 99_999_999; cases.push(changed);
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

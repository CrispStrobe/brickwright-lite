/**
 * The diagnostics surface for CP3-D2, and the one property that matters about it.
 *
 * The DoD says no pin source, digest, lease, correlation, raw arguments, raw results or
 * dependency errors may appear. The way this file proves it is deliberately adversarial: it
 * feeds rows that carry every one of those fields and requires them ABSENT from the rendered
 * text. A blocklist would pass a test that names the fields it blocks; a whitelist passes this
 * one, which names fields it was never told about.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';

import {NATIVE_FIELDS, WORKER_FIELDS, asText, collect, nativeRows, row, summarise, workerRows}
    from '../overlay/scratch-gui/src/lib/capability-diagnostics.js';

const HOSTILE = {
    lease: 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
    digest: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    correlation: 'corr-secret-7',
    args: {pin: 'A1', secret: 'hunter2'},
    result: 'linux',
    url: 'https://gallery.invalid/extension.js',
    pinSource: '/etc/brickwright/pins',
    error: 'ENOENT: /home/someone/.config/private'
};

test('a field the panel was never told about cannot reach the output', () => {
    const native = nativeRows([Object.assign({
        index: 3, at: 1234, principal: 99, operation: 'platform.kind.read',
        resource: 'platform/default', sequence: 0, decision: 'allowed', denial: null
    }, HOSTILE)]);
    const worker = workerRows([Object.assign({
        seq: 1, time: 5678, event: 'allowed', workerId: 2, slug: 'reviewed-2',
        declared: ['platform.kind.read'], operation: 'platform.kind.read', code: null
    }, HOSTILE)]);
    const text = asText(native, worker, null);

    for (const [name, value] of Object.entries(HOSTILE)) {
        const needle = typeof value === 'object' ? 'hunter2' : String(value);
        assert.equal(text.includes(needle), false,
            `${name} reached the rendered panel: ${text.slice(0, 300)}`);
    }
    // …while the fields it IS for did arrive, or the test above would pass on an empty panel.
    assert.match(text, /platform\.kind\.read/);
    assert.match(text, /allowed/);
    assert.match(text, /reviewed-2/);
});

test('no object is ever stringified into the DOM', () => {
    // `[object Object]` in a diagnostics panel is the shape that hides a leak in plain sight.
    const text = asText(nativeRows([{index: 0, at: 1, principal: {a: 1}, operation: {b: 2},
        resource: null, sequence: 0, decision: 'allowed', denial: null}]), [], null);
    assert.equal(text.includes('[object Object]'), false, text);
});

test('the four states CP3-D2 names are counted across BOTH sources', () => {
    const native = nativeRows([
        {decision: 'allowed'}, {decision: 'denied'}, {decision: 'revoked'}, {decision: 'issued'}
    ]);
    const worker = workerRows([
        {event: 'allowed'}, {event: 'refused'},
        {event: 'attached', declared: ['platform.kind.read', 'project.metadata.read']}
    ]);
    assert.deepEqual(summarise(native, worker), {declared: 2, allowed: 2, refused: 2, revoked: 1});
});

test('a browser build says it has no native boundary, rather than showing an empty one', async () => {
    // "No native activity" and "no native boundary" are different facts. A panel that renders
    // both as an empty table is a worse diagnostic than none.
    const {native, nativeNote} = await collect({invoke: null, workerDiagnostics: () => []});
    assert.deepEqual(native, []);
    assert.match(nativeNote, /no native boundary/);
    assert.match(asText(native, [], nativeNote), /no native boundary/);
});

test('an unavailable source is reported, never thrown', async () => {
    const out = await collect({
        invoke: async () => { throw new Error('native_broker_audit not allowed'); },
        workerDiagnostics: () => { throw new Error('the VM is not up'); }
    });
    assert.match(out.nativeNote, /unavailable: native_broker_audit not allowed/);
    assert.deepEqual(out.worker, []);
});

test('the whitelists are the documented field sets', () => {
    // Pinned so widening either one is a deliberate edit that shows up in review.
    assert.deepEqual([...NATIVE_FIELDS],
        ['index', 'at', 'principal', 'operation', 'resource', 'sequence', 'decision', 'denial']);
    assert.deepEqual([...WORKER_FIELDS],
        ['seq', 'time', 'event', 'workerId', 'slug', 'declared', 'operation', 'code']);
    assert.deepEqual(Object.keys(row({a: 1, b: 2}, ['a'])), ['a']);
});

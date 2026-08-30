import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

import {isHostedCompilerRequest} from '../scripts/lib/offline-compiler-policy.mjs';

const request = (url, method = 'POST') => ({url: () => url, method: () => method});

test('offline gate blocks only external compiler POSTs', () => {
    const app = 'http://localhost:8617/';
    assert.equal(isHostedCompilerRequest(request('https://stc-compiler.vercel.app/compile'), app), true);
    assert.equal(isHostedCompilerRequest(
        request('http://localhost:8617/static/sdcc-wasm/runtime.json', 'GET'), app), false);
    assert.equal(isHostedCompilerRequest(request('https://example.com/telemetry'), app), false);
    assert.equal(isHostedCompilerRequest(
        request('https://stc-compiler.vercel.app/compile', 'GET'), app), false);
});

test('browser proof retains the zero-request assertion and debugger evidence', async () => {
    const source = await readFile(new URL('../scripts/verify-debug-frames-watch.mjs', import.meta.url), 'utf8');
    assert.match(source, /route\.abort\('blockedbyclient'\)/);
    assert.match(source, /hostedCompilerRequests\.length === 0/);
    assert.match(source, /phase=running/);
    assert.match(source, /data-debug-frames/);
    assert.match(source, /data-step-cycle/);
});

/**
 * Choosing where synthesis runs.
 *
 * The rules are borrowed from bw-board's execution-policy on purpose, and the
 * tests are about the refusals rather than the happy path — a selector that
 * picks correctly but falls back silently is the one that produces bug reports
 * nobody can reproduce.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {defaultCatalog, probeBackends, selectBackend, offerable, healthUrl}
    from '../overlay/scratch-gui/src/lib/bw-fpga/backends.js';
import {synthUrl} from '../overlay/scratch-gui/src/lib/bw-fpga/synthesis.js';

const codes = list => (list || []).map(x => x.code).sort();
const ok = () => Promise.resolve({status: 200});
// A runtime that can run the local toolchain. Injected because this box cannot —
// Node 20 has no WasmGC — and a selector whose local path is untestable here
// would have its refusals exercised by nobody.
const capable = {wasm: true, wasmGC: true, exceptions: true,
    canRunLocalToolchain: true, missing: []};

test('a backend nobody can reach is NOT offered', async () => {
    // target-kinds.js: a picker entry nobody can select is a lie the front end
    // tells for us.
    const catalog = defaultCatalog();               // no endpoint, nothing downloaded
    const {available, probes} = await probeBackends({catalog, capabilities: capable});
    assert.deepEqual(available, []);
    assert.deepEqual(offerable(catalog, available), [],
        'an empty picker is honest; a full one that refuses on click is not');
    assert.deepEqual(codes(probes), ['not-configured', 'not-downloaded']);
});

test('probing is FAIL-CLOSED: a service that errors is not available', async () => {
    const catalog = defaultCatalog({hostedEndpoint: 'https://synth.invalid'});
    const {available, probes} = await probeBackends({
        catalog, capabilities: capable, fetchImpl: () => Promise.reject(new Error('ENOTFOUND'))
    });
    assert.deepEqual(available, []);
    assert.equal(probes.find(p => p.id === 'hosted').code, 'unreachable');
});

test('a service answering non-2xx is unhealthy, not available', async () => {
    const catalog = defaultCatalog({hostedEndpoint: 'https://synth.invalid'});
    const {available, probes} = await probeBackends({
        catalog, capabilities: capable, fetchImpl: () => Promise.resolve({status: 503})
    });
    assert.deepEqual(available, []);
    assert.equal(probes.find(p => p.id === 'hosted').code, 'unhealthy');
});

test('auto prefers hosted, and SAYS that it did', async () => {
    const catalog = defaultCatalog({hostedEndpoint: 'https://synth.example'});
    const {available} = await probeBackends({catalog, capabilities: capable, fetchImpl: ok, localAvailable: true});
    assert.deepEqual(available.sort(), ['hosted', 'local']);

    const r = selectBackend({backend: 'auto', available, catalog});
    assert.equal(r.accepted, true);
    assert.equal(r.selected.id, 'hosted');
    assert.ok(r.reason, 'the choice must be reportable, not implicit');
});

test('auto falls through to local when hosted is absent — and names why', async () => {
    const catalog = defaultCatalog();               // hosted not configured
    const {available} = await probeBackends({catalog, capabilities: capable, localAvailable: true});
    const r = selectBackend({backend: 'auto', available, catalog});
    assert.equal(r.selected.id, 'local');
    assert.deepEqual(codes(r.refusals), ['unavailable'],
        'the backend it skipped must still be accounted for');
});

test('an EXPLICIT request that cannot be honoured refuses — it does not fall back', async () => {
    // The rule that matters most. Building somewhere other than asked is how two
    // backends that disagree become unfalsifiable bug reports.
    const catalog = defaultCatalog({hostedEndpoint: 'https://synth.example'});
    const {available} = await probeBackends({catalog, capabilities: capable, fetchImpl: ok, localAvailable: false});
    const r = selectBackend({backend: 'local', available, catalog});
    assert.equal(r.accepted, false);
    assert.equal(r.selected, null);
    assert.equal(r.code, 'unavailable');
    assert.equal(r.requested.backend, 'local', 'the refusal must still say what was asked for');
});

test('copyleft sources select the local tier, and REFUSE hosted by name', async () => {
    const catalog = defaultCatalog({hostedEndpoint: 'https://synth.example'});
    const {available} = await probeBackends({catalog, capabilities: capable, fetchImpl: ok, localAvailable: true});

    const r = selectBackend({backend: 'auto', requiredCapabilities: ['copyleft-sources'],
        available, catalog});
    assert.equal(r.selected.id, 'local', 'the local tier is the only route for these');
    const skipped = r.refusals.find(x => x.id === 'hosted');
    assert.equal(skipped.code, 'missing-capability');
    assert.match(skipped.reason, /convey a derivative work/);
});

test('copyleft with no local toolchain is a refusal, not a hosted build', async () => {
    const catalog = defaultCatalog({hostedEndpoint: 'https://synth.example'});
    const {available} = await probeBackends({catalog, capabilities: capable, fetchImpl: ok, localAvailable: false});
    const r = selectBackend({backend: 'auto', requiredCapabilities: ['copyleft-sources'],
        available, catalog});
    assert.equal(r.accepted, false,
        'the decision that GPL never builds on our server must not be reachable around');
    assert.deepEqual(codes(r.refusals), ['missing-capability', 'unavailable']);
});

test('an unknown backend id is named, not ignored', () => {
    const r = selectBackend({backend: 'quantum', available: [], catalog: defaultCatalog()});
    assert.equal(r.code, 'unknown-backend');
});

test('with nothing available at all, auto says so plainly', () => {
    const r = selectBackend({backend: 'auto', available: [], catalog: defaultCatalog()});
    assert.equal(r.code, 'no-backend-available');
    assert.match(r.reason, /Nothing can be built/);
});

// ── the two modules have to mean the same thing by "endpoint" ────
//
// They did not. The probe GET `${endpoint}/health`; `synthesise` POSTed to
// `endpoint` itself. One configured value — BW_SYNTHESIS_ENDPOINT — feeds both,
// so at most one of them could ever have been right, and nothing noticed because
// neither path runs in any build CI compiles.

test('probe and synthesis derive their urls from the SAME base', () => {
    const base = 'https://bw-synth.vercel.app/api';
    assert.equal(healthUrl(base), 'https://bw-synth.vercel.app/api/health');
    assert.equal(synthUrl(base), 'https://bw-synth.vercel.app/api/synth');
});

test('a trailing slash does not produce a doubled one', () => {
    assert.equal(healthUrl('https://x/api/'), 'https://x/api/health');
    assert.equal(synthUrl('https://x/api//'), 'https://x/api/synth');
});

test('the probe asks the url synthesis would post to, minus the verb', async () => {
    const asked = [];
    const catalog = defaultCatalog({hostedEndpoint: 'https://bw-synth.vercel.app/api'});
    await probeBackends({
        catalog,
        capabilities: capable,
        fetchImpl: url => {
            asked.push(url);
            return Promise.resolve({status: 503});
        }
    });
    assert.deepEqual(asked, ['https://bw-synth.vercel.app/api/health']);
});

test('a 503 from the live service means the backend is NOT offered', async () => {
    // bw-synth answers 503 today: deployed, and the toolchain does not fit its
    // /tmp. A health check that reports trouble must remove the backend, not
    // decorate it — the selector is fail-closed for exactly this shape.
    const catalog = defaultCatalog({hostedEndpoint: 'https://bw-synth.vercel.app/api'});
    const {available, probes} = await probeBackends({
        catalog,
        capabilities: capable,
        fetchImpl: () => Promise.resolve({status: 503})
    });
    assert.deepEqual(available, []);
    assert.equal(probes.find(p => p.id === 'hosted').code, 'unhealthy');

    const sel = selectBackend({backend: 'auto', available, catalog});
    assert.equal(sel.accepted, false);
    assert.equal(sel.code, 'no-backend-available');
});

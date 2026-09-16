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
import {defaultCatalog, probeBackends, selectBackend, offerable}
    from '../overlay/scratch-gui/src/lib/bw-fpga/backends.js';

const codes = list => (list || []).map(x => x.code).sort();
const ok = () => Promise.resolve({status: 200});

test('a backend nobody can reach is NOT offered', async () => {
    // target-kinds.js: a picker entry nobody can select is a lie the front end
    // tells for us.
    const catalog = defaultCatalog();               // no endpoint, nothing downloaded
    const {available, probes} = await probeBackends({catalog});
    assert.deepEqual(available, []);
    assert.deepEqual(offerable(catalog, available), [],
        'an empty picker is honest; a full one that refuses on click is not');
    assert.deepEqual(codes(probes), ['not-configured', 'not-downloaded']);
});

test('probing is FAIL-CLOSED: a service that errors is not available', async () => {
    const catalog = defaultCatalog({hostedEndpoint: 'https://synth.invalid'});
    const {available, probes} = await probeBackends({
        catalog, fetchImpl: () => Promise.reject(new Error('ENOTFOUND'))
    });
    assert.deepEqual(available, []);
    assert.equal(probes.find(p => p.id === 'hosted').code, 'unreachable');
});

test('a service answering non-2xx is unhealthy, not available', async () => {
    const catalog = defaultCatalog({hostedEndpoint: 'https://synth.invalid'});
    const {available, probes} = await probeBackends({
        catalog, fetchImpl: () => Promise.resolve({status: 503})
    });
    assert.deepEqual(available, []);
    assert.equal(probes.find(p => p.id === 'hosted').code, 'unhealthy');
});

test('auto prefers hosted, and SAYS that it did', async () => {
    const catalog = defaultCatalog({hostedEndpoint: 'https://synth.example'});
    const {available} = await probeBackends({catalog, fetchImpl: ok, localAvailable: true});
    assert.deepEqual(available.sort(), ['hosted', 'local']);

    const r = selectBackend({backend: 'auto', available, catalog});
    assert.equal(r.accepted, true);
    assert.equal(r.selected.id, 'hosted');
    assert.ok(r.reason, 'the choice must be reportable, not implicit');
});

test('auto falls through to local when hosted is absent — and names why', async () => {
    const catalog = defaultCatalog();               // hosted not configured
    const {available} = await probeBackends({catalog, localAvailable: true});
    const r = selectBackend({backend: 'auto', available, catalog});
    assert.equal(r.selected.id, 'local');
    assert.deepEqual(codes(r.refusals), ['unavailable'],
        'the backend it skipped must still be accounted for');
});

test('an EXPLICIT request that cannot be honoured refuses — it does not fall back', async () => {
    // The rule that matters most. Building somewhere other than asked is how two
    // backends that disagree become unfalsifiable bug reports.
    const catalog = defaultCatalog({hostedEndpoint: 'https://synth.example'});
    const {available} = await probeBackends({catalog, fetchImpl: ok, localAvailable: false});
    const r = selectBackend({backend: 'local', available, catalog});
    assert.equal(r.accepted, false);
    assert.equal(r.selected, null);
    assert.equal(r.code, 'unavailable');
    assert.equal(r.requested.backend, 'local', 'the refusal must still say what was asked for');
});

test('copyleft sources select the local tier, and REFUSE hosted by name', async () => {
    const catalog = defaultCatalog({hostedEndpoint: 'https://synth.example'});
    const {available} = await probeBackends({catalog, fetchImpl: ok, localAvailable: true});

    const r = selectBackend({backend: 'auto', requiredCapabilities: ['copyleft-sources'],
        available, catalog});
    assert.equal(r.selected.id, 'local', 'the local tier is the only route for these');
    const skipped = r.refusals.find(x => x.id === 'hosted');
    assert.equal(skipped.code, 'missing-capability');
    assert.match(skipped.reason, /convey a derivative work/);
});

test('copyleft with no local toolchain is a refusal, not a hosted build', async () => {
    const catalog = defaultCatalog({hostedEndpoint: 'https://synth.example'});
    const {available} = await probeBackends({catalog, fetchImpl: ok, localAvailable: false});
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

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash, webcrypto} from 'node:crypto';

// Execute the exact browser helper as ESM without installing a browser/build tool.
const source = fs.readFileSync(new URL('../overlay/scratch-gui/src/lib/bw-machines/raw-hdd-download.js', import.meta.url), 'utf8');
const {createRawHddDownload} = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const deferred = () => {let resolve; const promise = new Promise(r => { resolve = r; }); return {promise, resolve};};
const snapshot = () => {
    const bytes = Uint8Array.from({length: 512}, (_, i) => (i * 17 + 9) & 255);
    return {schema: 'bw.i80386-master-hdd-copy.v1', drive: 'master', bytes,
        geometry: {cylinders: 1, heads: 1, sectors: 1}, byteLength: 512,
        boundary: {cpuCycles: 41, machineCycles: 246}, sha256: sha(bytes)};
};
function fixture (options = {}) {
    const supplied = snapshot();
    const calls = {urls: [], revoked: [], anchors: [], clicks: [], blobs: []};
    const browser = {
        isSecureContext: true,
        crypto: {subtle: {digest: (...args) => webcrypto.subtle.digest(...args)}},
        Blob: class extends Blob {
            constructor (...args) {
                if (options.blobFailure === calls.blobs.length + 1) throw new Error('blob-primary');
                super(...args); calls.blobs.push(this);
            }
            async arrayBuffer () {
                if (options.arrayBufferFailure) throw new Error('blob-read-primary');
                if (this.type === 'application/octet-stream' && options.blobGate) {
                    options.blobEntered?.resolve();
                    await options.blobGate.promise;
                }
                return super.arrayBuffer();
            }
        },
        URL: {
            createObjectURL (blob) {
                const number = calls.urls.length + 1;
                if (options.urlFailure === number) throw new Error(`url-${number}-primary`);
                const url = `blob:authored-${number}`;
                calls.urls.push({url, blob});
                return url;
            },
            revokeObjectURL (url) {
                calls.revoked.push(url);
                if (options.revokeFailure === calls.revoked.length) throw new Error('revoke-secondary');
            }
        },
        document: {
            body: {appendChild: anchor => {
                if (options.appendFailure) throw new Error('append-primary');
                anchor.appended = true;
            }},
            createElement (tag) {
                assert.equal(tag, 'a');
                const number = calls.anchors.length + 1;
                if (options.anchorFailure === number) throw new Error('anchor-primary');
                const anchor = {removed: false, appended: false,
                    click () {
                        calls.clicks.push(this.download);
                        if (options.clickFailure === number) throw new Error(`click-${number}-primary`);
                    },
                    remove () {
                        this.removed = true;
                        if (options.removeFailure === number) throw new Error('remove-secondary');
                    }};
                calls.anchors.push(anchor);
                return anchor;
            }
        }
    };
    let active = {target: {snapshotAtaMaster: async () => supplied}, identity: {session: 1}};
    const helper = createRawHddDownload({getActiveSession: () => active, browser});
    return {helper, browser, supplied, calls, get active () {return active;}, set active (value) {active = value;}};
}
const allRevoked = f => {
    for (const {url} of f.calls.urls) assert.ok(f.calls.revoked.includes(url));
    for (const anchor of f.calls.anchors) assert.ok(anchor.removed);
};
const hashGate = f => {
    const entered = deferred(); const release = deferred();
    f.browser.crypto.subtle.digest = async (...args) => {
        entered.resolve(); await release.promise; return webcrypto.subtle.digest(...args);
    };
    return {entered, release};
};

test('initiates exactly raw img and scalar metadata with fixed filenames, not a save guarantee', async () => {
    const f = fixture(); const original = f.supplied.bytes.slice();
    const result = await f.helper.download();
    assert.equal(result.initiated, true);
    assert.deepEqual(f.calls.clicks, ['386-master-hdd.img', '386-master-hdd.json']);
    assert.equal(f.calls.urls.length, 2);
    assert.deepEqual(new Uint8Array(await f.calls.urls[0].blob.arrayBuffer()), original);
    const metadata = JSON.parse(await f.calls.urls[1].blob.text());
    assert.equal(metadata.sha256, sha(original));
    assert.equal(metadata.byteLength, 512);
    assert.deepEqual(metadata.geometry, {cylinders: 1, heads: 1, sectors: 1});
    assert.deepEqual(metadata.boundary, {cpuCycles: 41, machineCycles: 246});
    assert.equal(metadata.boundaryMeaning, 'settled-detached-copy');
    assert.equal(metadata.guestCompletionQualified, false);
    assert.equal(metadata.crashDurabilityQualified, false);
    assert.ok(Object.isFrozen(result.metadata));
    assert.ok(Object.isFrozen(result.metadata.geometry));
    assert.ok(Object.isFrozen(result.metadata.boundary));
    assert.deepEqual(f.supplied.bytes, original);
    allRevoked(f);
});

test('selects current session at each action and releases busy after completion', async () => {
    const f = fixture(); let first = 0; let second = 0;
    f.active.target.snapshotAtaMaster = async () => {first++; return f.supplied;};
    assert.equal((await f.helper.download()).initiated, true);
    f.active = {target: {snapshotAtaMaster: async () => {second++; return snapshot();}}, identity: {session: 2}};
    assert.equal((await f.helper.download()).initiated, true);
    assert.equal(first, 1); assert.equal(second, 1);
});

for (const phase of ['snapshot', 'hash']) {
    for (const change of ['target', 'identity', 'dispose']) {
        test(`${change} during ${phase} prevents all download clicks`, async () => {
            const f = fixture(); const gate = deferred(); let entered;
            if (phase === 'snapshot') f.active.target.snapshotAtaMaster = () => gate.promise;
            else { entered = hashGate(f); }
            const result = f.helper.download();
            if (phase === 'hash') await entered.entered.promise;
            if (change === 'target') f.active = {target: {snapshotAtaMaster: async () => snapshot()}, identity: f.active.identity};
            if (change === 'identity') f.active = {target: f.active.target, identity: {session: 2}};
            if (change === 'dispose') f.helper.dispose();
            if (phase === 'snapshot') gate.resolve(f.supplied); else entered.release.resolve();
            const outcome = await result;
            assert.equal(outcome.refused.code, change === 'dispose' ? 'download-disposed' : 'download-stale-session');
            assert.equal(f.calls.urls.length, 0); assert.equal(f.calls.clicks.length, 0);
            allRevoked(f);
        });
    }
}

test('concurrent action is refused without another supplier request', async () => {
    const f = fixture(); const gate = deferred(); let captures = 0;
    f.active.target.snapshotAtaMaster = () => {captures++; return gate.promise;};
    const pending = f.helper.download();
    assert.equal((await f.helper.download()).refused.code, 'download-busy');
    gate.resolve(f.supplied); assert.equal((await pending).initiated, true); assert.equal(captures, 1);
});

test('immutable Blob and captured scalar metadata survive supplier changes while awaiting', async () => {
    const blobEntered = deferred(); const blobGate = deferred();
    const f = fixture({blobEntered, blobGate}); const original = f.supplied.bytes.slice();
    const pending = f.helper.download(); await blobEntered.promise;
    f.supplied.bytes.fill(0); f.supplied.sha256 = 'f'.repeat(64);
    f.supplied.geometry.cylinders = 999; f.supplied.boundary.cpuCycles = 999;
    blobGate.resolve(); const result = await pending;
    assert.equal(result.initiated, true); assert.equal(result.metadata.sha256, sha(original));
    assert.equal(result.metadata.geometry.cylinders, 1); assert.equal(result.metadata.boundary.cpuCycles, 41);
    assert.deepEqual(new Uint8Array(await Blob.prototype.arrayBuffer.call(f.calls.urls[0].blob)), original);
    allRevoked(f);
});

test('no session, missing token, and unsupported supplier fail before any browser action', async () => {
    for (const identity of [undefined, null, '', false, NaN]) {
        const f = fixture(); f.active = {target: f.active.target, identity};
        assert.equal((await f.helper.download()).refused.code, 'download-no-session'); assert.equal(f.calls.blobs.length, 0);
    }
    const f = fixture(); f.active.target = {};
    assert.equal((await f.helper.download()).refused.code, 'download-unsupported'); assert.equal(f.calls.urls.length, 0);
});

test('supplier refusal values and thrown errors remain useful and do not leave busy set', async () => {
    const f = fixture();
    f.active.target.snapshotAtaMaster = async () => ({refused: {code: 'snapshot-ata-busy', reason: 'ATA DRQ is active'}});
    assert.deepEqual(await f.helper.download(), {refused: {code: 'snapshot-ata-busy', reason: 'ATA DRQ is active'}});
    f.active.target.snapshotAtaMaster = async () => {throw new Error('supplier-first');};
    assert.equal((await f.helper.download()).refused.reason, 'supplier-first');
    f.active.target.snapshotAtaMaster = async () => snapshot();
    assert.equal((await f.helper.download()).initiated, true);
});

test('malformed CHS, cap, counters, schema, storage and hash refuse before Blob allocation', async () => {
    const cuts = [s => {s.schema = 'wrong';}, s => {s.drive = 'slave';}, s => {s.byteLength = 64 * 1024 * 1024 + 512;},
        s => {s.geometry.heads = 0;}, s => {s.geometry.sectors = 256;}, s => {s.geometry.cylinders = 1.5;},
        s => {s.boundary.cpuCycles = true;}, s => {s.boundary.machineCycles = -1;}, s => {s.sha256 = 'A'.repeat(64);},
        s => {s.bytes = new Uint16Array(256);}, s => {s.bytes = new Proxy(s.bytes, {});},
        s => {s.byteLength = 1024; Object.defineProperty(s.bytes, 'length', {value: 1024}); Object.defineProperty(s.bytes, 'byteLength', {value: 1024});},
        s => {Object.defineProperty(s, 'sha256', {get () {throw new Error('getter must not run');}});}];
    for (const edit of cuts) {
        const f = fixture(); edit(f.supplied);
        assert.equal((await f.helper.download()).refused.code, 'download-invalid-snapshot');
        assert.equal(f.calls.blobs.length, 0);
    }
});

test('intrinsic Uint8 extent ignores poisoned own length getters', async () => {
    const f = fixture(); let calls = 0;
    for (const key of ['length', 'byteLength']) Object.defineProperty(f.supplied.bytes, key, {get () {calls++; throw new Error('shadow');}});
    assert.equal((await f.helper.download()).initiated, true); assert.equal(calls, 0);
});

test('hash mismatch, unavailable hash and bad digest produce no URLs', async () => {
    const f = fixture(); f.supplied.sha256 = 'f'.repeat(64);
    assert.equal((await f.helper.download()).refused.code, 'download-hash-mismatch');
    assert.equal(f.calls.urls.length, 0);
    const g = fixture(); g.browser.isSecureContext = false;
    assert.equal((await g.helper.download()).refused.code, 'download-hash-unavailable');
    const h = fixture(); h.browser.crypto.subtle.digest = async () => new ArrayBuffer(31);
    assert.equal((await h.helper.download()).refused.code, 'download-hash-failed');
});

for (const cut of [{urlFailure: 1}, {urlFailure: 2}, {clickFailure: 1}, {clickFailure: 2},
    {clickFailure: 1, revokeFailure: 1}, {clickFailure: 2, removeFailure: 1}]) {
    test(`browser failure ${JSON.stringify(cut)} cleans every other owned resource and keeps primary`, async () => {
        const f = fixture(cut); const result = await f.helper.download();
        const expected = cut.urlFailure ? `url-${cut.urlFailure}-primary` : `click-${cut.clickFailure}-primary`;
        assert.equal(result.refused.reason, expected);
        allRevoked(f);
        f.helper.dispose(); // retries a failed cleanup without granting download success
        allRevoked(f);
    });
}

test('cleanup-only error refuses initiated result but still revokes the other URL', async () => {
    const f = fixture({revokeFailure: 1});
    assert.equal((await f.helper.download()).refused.reason, 'revoke-secondary');
    assert.equal(f.calls.revoked.length, 2); allRevoked(f);
    assert.deepEqual(f.helper.dispose(), {disposed: true});
    assert.equal(f.calls.revoked.length, 3);
});

test('disposal is permanent and cleans resources when invoked by a click callback', async () => {
    const f = fixture(); const create = f.browser.document.createElement;
    f.browser.document.createElement = tag => {
        const anchor = create(tag); anchor.click = () => {f.calls.clicks.push(anchor.download); f.helper.dispose();}; return anchor;
    };
    assert.equal((await f.helper.download()).refused.code, 'download-disposed');
    assert.equal(f.calls.urls.length, 1); allRevoked(f);
    assert.equal((await f.helper.download()).refused.code, 'download-disposed');
});

for (const cut of [{blobFailure: 1}, {blobFailure: 2}, {arrayBufferFailure: true}, {anchorFailure: 1}, {anchorFailure: 2}, {appendFailure: true}]) {
    test(`Blob/anchor failure ${JSON.stringify(cut)} refuses and cleans all created resources`, async () => {
        const f = fixture(cut); const result = await f.helper.download();
        assert.ok(result.refused); assert.match(result.refused.reason, /primary/); allRevoked(f);
    });
}

test('offset views and Buffer input keep exact intrinsic bytes and original storage', async () => {
    for (const buffer of [false, true]) {
        const f = fixture(); const original = f.supplied.bytes.slice();
        const store = new Uint8Array(1024).fill(0x77);
        f.supplied.bytes = buffer ? Buffer.from(store.buffer, 37, 512) : new Uint8Array(store.buffer, 37, 512);
        f.supplied.bytes.set(original); const before = store.slice();
        assert.equal((await f.helper.download()).initiated, true);
        assert.deepEqual(new Uint8Array(await f.calls.urls[0].blob.arrayBuffer()), original);
        assert.deepEqual(store, before); allRevoked(f);
    }
});

test('digest rejection and non-Error supplier throws refuse, retaining useful first errors', async () => {
    const f = fixture(); f.browser.crypto.subtle.digest = async () => {throw new Error('digest-primary');};
    assert.equal((await f.helper.download()).refused.reason, 'digest-primary');
    assert.equal(f.calls.urls.length, 0);
    for (const value of [null, undefined, 0, 'authored-string']) {
        const g = fixture(); g.active.target.snapshotAtaMaster = async () => {throw value;};
        assert.deepEqual(await g.helper.download(), {refused: {code: 'download-failed', reason: String(value)}});
        assert.equal(g.calls.urls.length, 0);
    }
});

test('disposal while Blob readback awaits prevents hashing and all URLs', async () => {
    const blobEntered = deferred(); const blobGate = deferred();
    const f = fixture({blobEntered, blobGate}); let hashes = 0;
    f.browser.crypto.subtle.digest = async (...args) => {hashes++; return webcrypto.subtle.digest(...args);};
    const pending = f.helper.download(); await blobEntered.promise; f.helper.dispose(); blobGate.resolve();
    assert.equal((await pending).refused.code, 'download-disposed');
    assert.equal(hashes, 0); assert.equal(f.calls.urls.length, 0);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash, webcrypto} from 'node:crypto';
import {githubIdentityMatches} from '../scripts/package-provenance.mjs';

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

// Panel integration: execute exact class methods/onChange body, with only React
// state batching and runner/browser interfaces stubbed. No JSX/compiler/engine.
const panelSource = fs.readFileSync(new URL('../overlay/scratch-gui/src/components/tw-pseudocode/debug-panel.jsx', import.meta.url), 'utf8');
function panelMethod (name) {
    const pattern = new RegExp(`^    (?:async )?${name} \\([^\\n]*?\\) \\{`, 'm');
    const start = panelSource.search(pattern);
    assert.ok(start >= 0, `exact panel method ${name}`);
    const lineEnd = panelSource.indexOf('\n', start);
    const line = panelSource.slice(start, lineEnd);
    if (line.endsWith('}')) return line;
    const end = panelSource.indexOf('\n    }', start);
    assert.ok(end > start); return panelSource.slice(start, end + '\n    }'.length);
}
const methodNames = ['_supportsHddDownload', '_invalidateHddDownload', '_updateHddDownloadSession',
    '_hddDownloadSession', 'onHddDownload', 'onStart', 'onStop', 'onStep', '_teardownRunner',
    'componentWillUnmount', 'onReverseStep', 'onReverseCycle', 'onReverseContinue', 'onRestoreLast',
    'onTimelineGoSelected', 'onCorrelatedRestore', 'onDebugSessionImport'];
function panelFixture (f = fixture(), asyncState = false) {
    const events = []; const pendingState = [];
    const fakeWindow = {removeEventListener () {}, bwStopMachineVideo () {}, bwStopMachineKeyboard () {}, bwStopMachineAudio () {}};
    const Panel = new Function('createRawHddDownload', 'window', `return class {\n${methodNames.map(panelMethod).join('\n')}\n};`)(
        options => createRawHddDownload({...options, browser: f.browser}), fakeWindow);
    const panel = new Panel();
    const runner = {supports: name => name === 'snapshotAtaMaster', snapshotAtaMaster: async () => f.supplied,
        resume () {events.push('resume');}, start () {events.push('start');}, stop () {events.push('stop');},
        step (kind) {events.push(`step-${kind}`);}, destroy () {events.push('destroy');},
        reverseStepDebugInstruction () {return {accepted: true};}, reverseStepDebugCycle () {return {accepted: true};},
        reverseContinueDebug () {return {accepted: true};}, restoreDebugCheckpoint () {return {accepted: true};},
        seekSelectedDebugEvent () {return {accepted: true};}, restoreCorrelatedDebugTargets () {},
        debugRecorder () {return {checkpointSummary: () => [{eventCursor: 1}]};},
        debugRecordingStatus () {return {};}, importDebugSession: async () => ({accepted: true})};
    panel.state = {runner, ui: {phase: 'paused', session: {why: {pc: 1}}}, hddDownloadBusy: false, hddDownloadStatus: null};
    Object.assign(panel, {_hddDownloadMounted: true, _hddDownloadToken: {}, _hddDownloadRunner: runner,
        _hddDownloadPhase: 'paused', _hddDownloadHalt: panel.state.ui.session.why, _hddDownload: null,
        _hddDownloadPending: false, _runnerPromise: null});
    panel.props = {vm: {}, onRunnerGone: () => events.push('gone'), onRunnerChange: () => events.push('change')};
    panel._mouseLeave = () => {};
    panel.tx = key => ({hddDownloadPreparing: 'Preparing image + JSON', hddDownloadInitiated: 'Image + JSON downloads initiated, not saved'}[key] || key);
    panel.setState = change => {events.push('setState'); if (asyncState) pendingState.push(change); else Object.assign(panel.state, change);};
    panel.runner = async () => runner; panel.mirrorLabwiredDisplay = () => {};
    const marker = '            onChange: (ui) => {';
    const start = panelSource.indexOf(marker) + marker.length;
    const end = panelSource.indexOf('\n            }\n        });', start);
    assert.ok(end > start);
    const onChange = new Function('runner', 'ReactDOM', `return function (ui) {${panelSource.slice(start, end)}\n};`)(
        runner, {unstable_batchedUpdates: fn => fn()}).bind(panel);
    return {panel, runner, f, events, onChange, flush: () => {for (const state of pendingState.splice(0)) Object.assign(panel.state, state);}};
}

test('panel gates both bridge and supplier support, paused selection, and visible JSX action', () => {
    const {panel, runner} = panelFixture();
    assert.equal(panel._supportsHddDownload(runner), true); assert.ok(panel._hddDownloadSession());
    runner.supports = () => false; assert.equal(panel._supportsHddDownload(runner), false); assert.equal(panel._hddDownloadSession(), null);
    runner.supports = () => true; delete runner.snapshotAtaMaster; assert.equal(panel._supportsHddDownload(runner), false);
    assert.match(panelSource, /\{canDownloadHdd \? \([\s\S]*?data-debug-hdd-download[\s\S]*?onClick=\{this\.onHddDownload\}/);
    assert.match(panelSource, /disabled=\{!paused \|\| this\.state\.hddDownloadBusy\}/);
    assert.match(panelSource, /createRawHddDownload.*|import \{createRawHddDownload\}/);
});

test('actual panel action uses current runner, real helper and image/JSON initiation status', async () => {
    const {panel, f} = panelFixture(); await panel.onHddDownload();
    assert.deepEqual(f.calls.clicks, ['386-master-hdd.img', '386-master-hdd.json']);
    assert.match(panel.state.hddDownloadStatus, /initiated, not saved/); assert.equal(panel.state.hddDownloadBusy, false);
    allRevoked(f);
});

test('panel synchronous pending guard prevents duplicate actions before React state commits', async () => {
    const {panel, runner, f, flush} = panelFixture(fixture(), true); const gate = deferred(); let requests = 0;
    runner.snapshotAtaMaster = () => {requests++; return gate.promise;};
    const first = panel.onHddDownload(); const second = panel.onHddDownload(); await second;
    assert.equal(requests, 1); gate.resolve(f.supplied); await first; flush(); assert.equal(f.calls.clicks.length, 2);
});

test('exact onChange keeps benign paused token but invalidates synchronous paused-step halt boundary', async () => {
    const {panel, runner, f, onChange} = panelFixture(); const token = panel._hddDownloadToken;
    onChange({phase: 'paused', session: {why: panel.state.ui.session.why}}); assert.equal(panel._hddDownloadToken, token);
    const gate = hashGate(f); const pending = panel.onHddDownload(); await gate.entered.promise;
    onChange({phase: 'paused', session: {why: {pc: 2}}}); assert.notEqual(panel._hddDownloadToken, token);
    assert.equal(panel._hddDownloadRunner, runner); gate.release.resolve(); await pending;
    assert.equal(f.calls.clicks.length, 0); assert.equal(panel.state.hddDownloadStatus, null);
});

for (const method of ['onStart', 'onStop', 'onStep', 'onReverseStep', 'onReverseCycle',
    'onReverseContinue', 'onRestoreLast', 'onTimelineGoSelected', 'onCorrelatedRestore']) {
    test(`exact panel ${method} invalidates pending hashed copy even if fake runner remains paused`, async () => {
        const {panel, f} = panelFixture(); const gate = hashGate(f); const pending = panel.onHddDownload();
        await gate.entered.promise; const token = panel._hddDownloadToken; await panel[method]();
        assert.notEqual(panel._hddDownloadToken, token); gate.release.resolve(); await pending;
        assert.equal(f.calls.clicks.length, 0); assert.equal(panel.state.hddDownloadStatus, null);
    });
}

test('run-to/phase ABA through exact onChange cannot resurrect an earlier pending copy', async () => {
    const {panel, f, onChange} = panelFixture(); const gate = hashGate(f); const pending = panel.onHddDownload();
    await gate.entered.promise; const why = panel.state.ui.session.why;
    onChange({phase: 'running', session: {why}}); onChange({phase: 'paused', session: {why}});
    gate.release.resolve(); await pending; assert.equal(f.calls.clicks.length, 0); assert.equal(panel.state.hddDownloadStatus, null);
});

test('teardown and unmount dispose helper; late completion cannot update replacement UI', async () => {
    for (const unmount of [false, true]) {
        const {panel, f, events} = panelFixture(); const gate = hashGate(f); const pending = panel.onHddDownload();
        await gate.entered.promise; if (unmount) panel.componentWillUnmount(); else panel._teardownRunner();
        const writes = events.filter(e => e === 'setState').length;
        gate.release.resolve(); await pending;
        assert.equal(events.filter(e => e === 'setState').length, writes); assert.equal(f.calls.clicks.length, 0);
        assert.ok(events.includes('destroy'));
    }
});

test('session import invalidates immediately before mutation after its own async file read', async () => {
    const {panel, f} = panelFixture(); const read = deferred(); const importing = panel.onDebugSessionImport({text: () => read.promise});
    const gate = hashGate(f); const downloading = panel.onHddDownload(); await gate.entered.promise;
    read.resolve('{}'); await importing; gate.release.resolve(); await downloading;
    assert.equal(f.calls.clicks.length, 0); assert.equal(panel.state.hddDownloadStatus, null);
});

test('panel surfaces snapshot refusal without claiming saved output', async () => {
    const {panel, runner, f} = panelFixture(); runner.snapshotAtaMaster = async () => ({refused: {code: 'snapshot-ata-busy', reason: 'ATA DRQ is active'}});
    await panel.onHddDownload(); assert.equal(panel.state.hddDownloadStatus, 'ATA DRQ is active');
    assert.equal(panel.state.hddDownloadBusy, false); assert.equal(f.calls.clicks.length, 0);
});

test('replacement can finish its own action while old snapshot completion stays silent', async () => {
    const {panel, runner, f, events} = panelFixture(); const old = deferred();
    runner.snapshotAtaMaster = () => old.promise; const pending = panel.onHddDownload();
    panel._teardownRunner();
    const replacement = {supports: () => true, snapshotAtaMaster: async () => snapshot()};
    panel.state.runner = replacement;
    const ui = {phase: 'paused', session: {why: {pc: 9}}};
    panel._updateHddDownloadSession(replacement, ui); panel.state.ui = ui;
    await panel.onHddDownload(); const status = panel.state.hddDownloadStatus;
    const writes = events.filter(e => e === 'setState').length;
    old.resolve(snapshot()); await pending;
    assert.equal(events.filter(e => e === 'setState').length, writes);
    assert.equal(panel.state.hddDownloadStatus, status); assert.equal(f.calls.clicks.length, 2);
    allRevoked(f);
});

test('panel lifecycle source mounts the guard and mirrors only the existing tracked panel', () => {
    assert.match(panelSource, /componentDidMount \(\) \{\s*this\._hddDownloadMounted = true;/);
    assert.match(panelSource, /componentWillUnmount \(\) \{\s*this\._hddDownloadMounted = false;/);
    assert.equal(fs.readFileSync(new URL('../packages/scratch-gui/src/components/tw-pseudocode/debug-panel.jsx', import.meta.url), 'utf8'), panelSource);
});

// Execute the admission helper without importing Playwright or starting a guest.
const persistenceSource = fs.readFileSync(new URL('../scripts/verify-i80386-local-hdd-gui.mjs', import.meta.url), 'utf8');
const pinStart = persistenceSource.indexOf('function persistencePackagePins (');
const pinEnd = persistenceSource.indexOf('\nfunction persistenceSnapshotSources (', pinStart);
assert.ok(pinStart >= 0 && pinEnd > pinStart, 'actual persistence package admission helper');
const admitPackagePins = new Function('assert', `${persistenceSource.slice(pinStart, pinEnd)}\nreturn persistencePackagePins;`)(assert);
const packageFiles = ['package.json', 'packages/scratch-gui/package.json'];
function packagePinFixture () {
    const packages = Object.fromEntries(packageFiles.map(name => [name,
        JSON.parse(fs.readFileSync(new URL(`../${name}`, import.meta.url), 'utf8'))]));
    const boardPin = packages['package.json'].devDependencies['bw-board'].split('#')[1];
    assert.match(boardPin, /^[0-9a-f]{40}$/);
    const critical = () => Object.fromEntries(packageFiles.map(name => [name, Buffer.from(JSON.stringify(packages[name]))]));
    return {packages, admission: {boardPin}, critical};
}

test('persistence admission accepts the real root devDependency and GUI dependency manifests', () => {
    const f = packagePinFixture();
    assert.equal(f.packages['package.json'].dependencies?.['bw-board'], undefined);
    assert.equal(f.packages['packages/scratch-gui/package.json'].devDependencies?.['bw-board'], undefined);
    assert.doesNotThrow(() => admitPackagePins(f.admission, f.critical(), githubIdentityMatches));
    assert.match(persistenceSource, /persistencePackagePins\(admission, critical, githubIdentityMatches\);/);
});

test('persistence admission rejects a missing or different canonical supplier in either manifest', () => {
    for (const [name, field] of [['package.json', 'devDependencies'], ['packages/scratch-gui/package.json', 'dependencies']]) {
        for (const value of [undefined, 'github:CrispStrobe/bw-board#' + '0'.repeat(40), 'github:Other/bw-board#' + '1'.repeat(40)]) {
            const f = packagePinFixture();
            if (value === undefined) delete f.packages[name][field]['bw-board'];
            else f.packages[name][field]['bw-board'] = value;
            assert.throws(() => admitPackagePins(f.admission, f.critical(), githubIdentityMatches), /declared supplier pin mismatch/);
        }
    }
});

test('persistence admission rejects second supplier declarations even when they repeat the expected pin', () => {
    for (const [name, canonical] of [['package.json', 'devDependencies'], ['packages/scratch-gui/package.json', 'dependencies']]) {
        for (const field of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'].filter(value => value !== canonical)) {
            for (const pin of ['github:CrispStrobe/bw-board#' + '0'.repeat(40), `github:CrispStrobe/bw-board#${packagePinFixture().admission.boardPin}`]) {
                const f = packagePinFixture();
                f.packages[name][field] = {...f.packages[name][field], 'bw-board': pin};
                assert.throws(() => admitPackagePins(f.admission, f.critical(), githubIdentityMatches), /ambiguous supplier declaration/);
            }
        }
    }
});

test('persistence admission never substitutes a supplier from a noncanonical field', () => {
    for (const [name, canonical, other] of [['package.json', 'devDependencies', 'dependencies'],
        ['packages/scratch-gui/package.json', 'dependencies', 'devDependencies']]) {
        const f = packagePinFixture(), pin = f.packages[name][canonical]['bw-board'];
        delete f.packages[name][canonical]['bw-board'];
        f.packages[name][other] = {...f.packages[name][other], 'bw-board': pin};
        assert.throws(() => admitPackagePins(f.admission, f.critical(), githubIdentityMatches), /declared supplier pin mismatch/);
    }
});

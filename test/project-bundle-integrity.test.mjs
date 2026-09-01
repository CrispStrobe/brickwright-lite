import {describe, test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {
    parseBundleDocument,
    replaceProjectState,
    encodeProjectState,
    decodeProjectState,
    BUNDLE_FORMAT,
    BUNDLE_VERSION
} from '../overlay/scratch-gui/src/lib/bw-project-bundle.js';

const require = createRequire(import.meta.url);
const JSZip = require('../packages/scratch-gui/node_modules/jszip');

const code = {lang: 'pseudocode', code: 'DEVICE SPIKE\nWHEN flag clicked:\n  stop motor A'};
const circuit = {version: 1, parts: [{id: 'r1', kind: 'resistor'}], wires: []};
const controller = {version: 1, mode: 'play', widgets: [{name: 'speed', type: 'slider'}]};
const raw = {
    'bw-code-autosave': JSON.stringify(code),
    'bw-circuit-autosave': JSON.stringify(circuit),
    'bw-ctl-widgets': JSON.stringify(controller)
};

const memoryStorage = (initial = {}, failAt = Infinity) => {
    const values = new Map(Object.entries(initial));
    let operations = 0;
    const mutate = fn => {
        operations++;
        if (operations === failAt) throw new Error(`injected storage failure at operation ${failAt}`);
        fn();
    };
    return {
        get length () { return values.size; },
        key: index => [...values.keys()][index] ?? null,
        getItem: key => values.has(key) ? values.get(key) : null,
        setItem: (key, value) => mutate(() => values.set(key, String(value))),
        removeItem: key => mutate(() => values.delete(key)),
        dump: () => Object.fromEntries(values)
    };
};

describe('project bundle typed document census', () => {
    const fixtures = [
        ['v1', JSON.stringify({version: 1, state: raw}), 'loaded'],
        ['v1 implicit', JSON.stringify({state: raw}), 'loaded'],
        ['v2', JSON.stringify({format: BUNDLE_FORMAT, version: BUNDLE_VERSION,
            state: {code, circuit, controller}}), 'loaded'],
        ['malformed JSON', '{', 'invalid'],
        ['array document', '[]', 'invalid'],
        ['zero version', JSON.stringify({version: 0, state: {}}), 'invalid'],
        ['wrong v2 format', JSON.stringify({format: 'other', version: 2, state: {}}), 'invalid'],
        ['invalid code', JSON.stringify({format: BUNDLE_FORMAT, version: 2,
            state: {code: {lang: 'pseudocode'}}}), 'invalid'],
        ['invalid circuit', JSON.stringify({format: BUNDLE_FORMAT, version: 2,
            state: {circuit: {parts: 'not-an-array'}}}), 'invalid'],
        ['invalid controller', JSON.stringify({format: BUNDLE_FORMAT, version: 2,
            state: {controller: {widgets: null}}}), 'invalid'],
        ['future', JSON.stringify({format: BUNDLE_FORMAT, version: 3, state: {}}), 'future']
    ];

    test('all 11 contract fixtures have exact named outcomes', () => {
        assert.equal(fixtures.length, 11, 'counted 11 format fixtures on 2026-09-01');
        for (const [name, text, outcome] of fixtures) {
            assert.equal(parseBundleDocument(text).outcome, outcome, name);
        }
    });

    test('oversized bundle and known sections are refused before storage', () => {
        const tooLargeBundle = ' '.repeat((2 * 1024 * 1024) + 1);
        assert.equal(parseBundleDocument(tooLargeBundle).outcome, 'invalid');
        const oversizedCode = JSON.stringify({format: BUNDLE_FORMAT, version: 2,
            state: {code: {lang: 'pseudocode', code: 'x'.repeat((512 * 1024) + 1)}}});
        assert.equal(parseBundleDocument(oversizedCode).outcome, 'invalid');
    });

    test('v1 migrates and v2 decodes to the same exact storage state', () => {
        const v1 = parseBundleDocument(JSON.stringify({version: 1, state: raw}));
        const v2 = parseBundleDocument(JSON.stringify({format: BUNDLE_FORMAT, version: 2,
            state: encodeProjectState(raw)}));
        assert.deepEqual(v1.state, raw);
        assert.deepEqual(v2.state, raw);
        assert.deepEqual(decodeProjectState(encodeProjectState(raw)), raw);
    });

    test('an untrusted v1 bundle cannot write arbitrary storage keys', () => {
        const parsed = parseBundleDocument(JSON.stringify({version: 1, state: {
            ...raw, theme: 'stolen', '__proto__.polluted': 'yes'
        }}));
        assert.equal(parsed.outcome, 'loaded');
        assert.deepEqual(parsed.state, raw);
    });
});

describe('project state is replacement, not merge', () => {
    test('A to B(code only) removes circuit/widgets and preserves personal preferences', () => {
        const storage = memoryStorage({...raw, 'bw-theme': 'dark'});
        const next = {'bw-code-autosave': JSON.stringify({...code, code: 'DEVICE PICO'})};
        const result = replaceProjectState(storage, next);
        assert.equal(result.outcome, 'loaded');
        assert.deepEqual(storage.dump(), {...next, 'bw-theme': 'dark'});
    });

    test('A to vanilla removes the complete project namespace', () => {
        const storage = memoryStorage({...raw, 'bw-compact-chrome': '1'});
        assert.equal(replaceProjectState(storage, {}).outcome, 'loaded');
        assert.deepEqual(storage.dump(), {'bw-compact-chrome': '1'});
    });

    test('failure during replacement restores A byte-for-byte', () => {
        const before = {...raw, 'bw-theme': 'dark'};
        // Three removals succeed; the first replacement write fails. Rollback follows.
        const storage = memoryStorage(before, 4);
        const result = replaceProjectState(storage, {
            'bw-code-autosave': JSON.stringify({...code, code: 'DEVICE PICO'})
        });
        assert.equal(result.outcome, 'storage-failed');
        assert.equal(result.rolledBack, true);
        assert.deepEqual(storage.dump(), before);
    });
});

describe('real archive extraction applies the classified outcome', () => {
    const archive = async sidecar => {
        const zip = new JSZip();
        zip.file('project.json', JSON.stringify({targets: [], meta: {semver: '3.0.0'}}));
        if (sidecar !== undefined) zip.file('brickwright/state.json', sidecar);
        return zip.generateAsync({type: 'nodebuffer'});
    };

    test('a vanilla archive clears A and reports legacy', async () => {
        const storage = memoryStorage({...raw, 'bw-theme': 'dark'});
        global.localStorage = storage;
        try {
            const {extractBrickwrightState} =
                await import('../packages/scratch-gui/src/lib/bw-project-bundle.js');
            const bytes = await archive();
            const result = await extractBrickwrightState(
                bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
            assert.equal(result.outcome, 'legacy');
            assert.deepEqual(storage.dump(), {'bw-theme': 'dark'});
        } finally {
            delete global.localStorage;
        }
    });

    for (const [name, sidecar, outcome] of [
        ['invalid', '{', 'invalid'],
        ['future', JSON.stringify({format: BUNDLE_FORMAT, version: 3, state: {}}), 'future']
    ]) {
        test(`${name} archive is classified before storage mutation`, async () => {
            const storage = memoryStorage({...raw, 'bw-theme': 'dark'});
            global.localStorage = storage;
            try {
                const {extractBrickwrightState} =
                    await import('../packages/scratch-gui/src/lib/bw-project-bundle.js');
                const bytes = await archive(sidecar);
                const result = await extractBrickwrightState(
                    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
                assert.equal(result.outcome, outcome);
                assert.deepEqual(storage.dump(), {...raw, 'bw-theme': 'dark'});
            } finally {
                delete global.localStorage;
            }
        });
    }

    test('unknown v2 data survives load to save but never becomes a storage key', async () => {
        const storage = memoryStorage();
        global.localStorage = storage;
        global.window = {dispatchEvent: () => {}};
        try {
            const module = await import('../packages/scratch-gui/src/lib/bw-project-bundle.js');
            const inputDocument = {format: BUNDLE_FORMAT, version: 2, vendor: {name: 'future-tool'},
                state: {code, analysis: {opaque: [1, 2, 3]}}};
            const input = await archive(JSON.stringify(inputDocument));
            const loaded = await module.extractBrickwrightState(
                input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength));
            assert.equal(loaded.outcome, 'loaded');
            assert.equal(storage.getItem('analysis'), null, 'unknown sections never become storage keys');

            const base = await archive();
            const output = await module.attachBrickwrightState(new Blob([base]));
            const zip = await JSZip.loadAsync(await output.arrayBuffer());
            const saved = JSON.parse(await zip.file('brickwright/state.json').async('text'));
            assert.deepEqual(saved.vendor, inputDocument.vendor);
            assert.deepEqual(saved.state.analysis, inputDocument.state.analysis);
            assert.deepEqual(saved.state.code, code);
        } finally {
            delete global.localStorage;
            delete global.window;
        }
    });

    test('a future document mutates no storage and survives the next save opaquely', async () => {
        const storage = memoryStorage({...raw, 'bw-theme': 'dark'});
        global.localStorage = storage;
        global.window = {dispatchEvent: () => {}};
        try {
            const module = await import('../packages/scratch-gui/src/lib/bw-project-bundle.js');
            const future = {format: BUNDLE_FORMAT, version: 7, state: {quantum: {program: 'q'}}};
            const input = await archive(JSON.stringify(future));
            const loaded = await module.extractBrickwrightState(
                input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength));
            assert.equal(loaded.outcome, 'future');
            assert.equal(loaded.version, 7);
            assert.deepEqual(loaded.report, {action: 'preserved-not-applied', version: 7,
                supportedVersion: 2});
            assert.deepEqual(storage.dump(), {...raw, 'bw-theme': 'dark'});

            const base = await archive();
            const output = await module.attachBrickwrightState(new Blob([base]));
            const zip = await JSZip.loadAsync(await output.arrayBuffer());
            const saved = JSON.parse(await zip.file('brickwright/state.json').async('text'));
            assert.deepEqual(saved, future);
        } finally {
            delete global.localStorage;
            delete global.window;
        }
    });
});

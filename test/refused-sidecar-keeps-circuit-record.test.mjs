// SPDX-License-Identifier: BSD-3-Clause
// Task I5. Opening a project whose Brickwright sidecar is refused (future
// version, invalid JSON) must leave the known project state untouched,
// atomically — in storage, not just in memory. Opening a project switches the
// active tab, which hides the Circuit tab and runs the host's Designer flush.
// That flush wrote plain toJSON while bw-circuit-ui's own autosave writes the
// file-owned record with resolved nets, so the refusal rewrote the circuit
// record of the SAME unchanged circuit. This replays the real sequence with the
// real code: refused inspection, the real bundle listener, the real hide flush.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import JSZip from 'jszip';
import {extractBrickwrightState} from '../overlay/scratch-gui/src/lib/bw-project-bundle.js';
import {circuitAutosaveRecord, readCircuitOwner} from '../overlay/scratch-gui/src/lib/circuit-autosave-record.js';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const tabPath = 'overlay/scratch-gui/src/components/tw-pseudocode/circuit-tab.jsx';
const source = read(tabPath);
const slice = (from, to) => {
    const start = source.indexOf(from);
    const end = source.indexOf(to, start);
    assert.ok(start >= 0 && end > start, `actual source block exists: ${from.trim()}`);
    return source.slice(start, end);
};

const memoryStorage = initial => {
    const values = new Map(Object.entries(initial));
    return {
        get length () { return values.size; },
        key: index => [...values.keys()][index] ?? null,
        getItem: key => values.has(key) ? values.get(key) : null,
        setItem: (key, value) => values.set(key, String(value)),
        removeItem: key => values.delete(key),
        dump: () => Object.fromEntries(values)
    };
};

// A Designer circuit as bw-circuit-ui exposes it: toJSON() returns a fresh
// object without nets; resolvedNets is the engine connectivity it appends.
const designerCircuit = {
    toJSON: () => ({version: 1, parts: [{id: 'mcu1', kind: 'stc12'}, {id: 'led1', kind: 'led'}],
        wires: [{from: 'mcu1.P1.0', to: 'led1.A'}]}),
    resolvedNets: [['mcu1.P1.0', 'led1.A'], ['led1.K', 'gnd']]
};
// The record a wire-based project file restores and bw-circuit-ui's load
// writes: the circuit without engine nets. Measured in the browser gate on
// head 00e6456f: the restored record was 2755 bytes with no nets, and the
// refusal rewrote it to 5793 bytes WITH resolved nets.
const restoredRecord = circuit => JSON.stringify(circuit.toJSON());
// The rule at 00e6456f (and bw-circuit-ui 9d7a9a26's autosave): nets for every
// file-owned circuit. Kept here as the counterexample the new rule must refuse.
const netsForEveryFile = circuit => JSON.stringify({...circuit.toJSON(), nets: circuit.resolvedNets});

const sb3With = async sidecar => {
    const zip = new JSZip();
    zip.file('project.json', '{"targets":[]}');
    zip.file('brickwright/state.json', sidecar);
    return zip.generateAsync({type: 'arraybuffer'});
};

const cases = {
    future: JSON.stringify({format: 'brickwright-state', version: 7, state: {futureOnly: {value: 99}}}),
    invalid: '{invalid'
};

test('host flush writes exactly bw-circuit-ui\'s autosave record', () => {
    const wired = {fileLoaded: true, fileNets: false};
    assert.equal(circuitAutosaveRecord(designerCircuit, wired), restoredRecord(designerCircuit));
    assert.notEqual(circuitAutosaveRecord(designerCircuit, wired), netsForEveryFile(designerCircuit));
    assert.equal(circuitAutosaveRecord(designerCircuit, {fileLoaded: true, fileNets: true}),
        netsForEveryFile(designerCircuit), 'a nets-described file keeps its nets');
    assert.equal(circuitAutosaveRecord(designerCircuit, {}), restoredRecord(designerCircuit));
    const empty = {toJSON: () => ({parts: [], wires: []}), resolvedNets: []};
    assert.equal(circuitAutosaveRecord(empty, {}), null, 'inferred empty canvas is not written');
    assert.equal(circuitAutosaveRecord(empty, {fileLoaded: true}), JSON.stringify({parts: [], wires: []}));
    assert.equal(circuitAutosaveRecord(null, wired), null);
    const owner = readCircuitOwner({getItem: key => ({'bw-circuit-file-loaded': '1',
        'bw-circuit-autosave': JSON.stringify({parts: [], nets: [['a', 'b']]})})[key] ?? null});
    assert.deepEqual(owner, {fileLoaded: true, fileNets: true});
});

for (const [outcome, sidecar] of Object.entries(cases)) {
    test(`${outcome} sidecar leaves every known project record byte-identical`, async () => {
        const storage = memoryStorage({
            'bw-code-autosave': JSON.stringify({lang: 'pseudocode', code: 'SPRITE Cat:'}),
            'bw-circuit-autosave': restoredRecord(designerCircuit),
            'bw-circuit-file-loaded': '1',
            'bw-ctl-widgets': JSON.stringify({version: 1, widgets: [{name: 'slider1', type: 'slider'}]})
        });
        const before = storage.dump();
        const previousStorage = globalThis.localStorage;
        globalThis.localStorage = storage;
        try {
            const result = await extractBrickwrightState(await sb3With(sidecar));
            assert.equal(result.outcome, outcome);
            assert.deepEqual(storage.dump(), before, 'the bundle layer applies nothing');

            // The real bundle listener: a refusal announcement must not republish.
            const listenerSrc = slice('        this._onBundleLoaded = event => {',
                "        window.addEventListener('bw-project-bundle-loaded'");
            const changes = [];
            const owner = {props: {vm: {runtime: {}}}, _markReactUpdate () { changes.push('mark'); },
                setState (value) { changes.push(['state', value]); },
                _applyToLiveCircuit (value) { changes.push(['apply', value]); }};
            const listener = new Function('localStorage',
                `return function () { ${listenerSrc} return this._onBundleLoaded; };`)(storage).call(owner);
            listener({detail: {outcome}});
            assert.deepEqual(changes, []);

            // The real hide flush: opening the project moved the active tab off
            // Circuit, with the Designer mounted before and unmounted now.
            const flushSrc = slice('        if (prevProps.isVisible && !this.props.isVisible && !this._boxRef.current',
                '        this._designerShown =');
            const flush = new Function('localStorage', 'circuitAutosaveRecord', 'readCircuitOwner',
                'prevProps', `${flushSrc}`);
            flush.call({props: {isVisible: false}, _boxRef: {current: null}, _designerShown: true,
                state: {circuit: designerCircuit}}, storage, circuitAutosaveRecord, readCircuitOwner,
            {isVisible: true});
            assert.deepEqual(storage.dump(), before,
                `${outcome} sidecar partially replaced known project state`);
        } finally {
            globalThis.localStorage = previousStorage;
        }
    });
}

test('packaged circuit tab and helper mirror the overlay', () => {
    assert.equal(read('packages/scratch-gui/src/components/tw-pseudocode/circuit-tab.jsx'), source);
    assert.equal(read('packages/scratch-gui/src/lib/circuit-autosave-record.js'),
        read('overlay/scratch-gui/src/lib/circuit-autosave-record.js'));
});

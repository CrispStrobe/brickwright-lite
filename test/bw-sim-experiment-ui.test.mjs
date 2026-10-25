// SPDX-License-Identifier: BSD-3-Clause
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import * as recording from '../overlay/scratch-gui/src/lib/bw-sim/measurements/recording.js';
import * as experiments from '../overlay/scratch-gui/src/lib/bw-sim/measurements/experiments.js';
import * as inspection from '../overlay/scratch-gui/src/lib/bw-sim/measurements/inspection.js';
import {sha256Text} from '../overlay/scratch-gui/src/lib/bw-sim/measurements/binding-digest.js';
const requireGui = createRequire(new URL('../packages/scratch-gui/package.json', import.meta.url));
const React = requireGui('react'), {renderToStaticMarkup} = requireGui('react-dom/server'), babel = requireGui('@babel/core');
const load = name => {
    const source = readFileSync(new URL(`../overlay/scratch-gui/src/components/tw-pseudocode/${name}`, import.meta.url), 'utf8');
    const code = babel.transformSync(source, {filename: name, configFile: false, babelrc: false,
        presets: [requireGui.resolve('@babel/preset-react')], plugins: [requireGui.resolve('@babel/plugin-transform-modules-commonjs')]}).code;
    const module = {exports: {}};
    Function('require', 'module', 'exports', code)(id => id.endsWith('/measurements/recording.js') ? recording :
        id.endsWith('/measurements/experiments.js') ? experiments : id.endsWith('/measurements/inspection.js') ? inspection : requireGui(id), module, module.exports);
    return module.exports.default;
};
const Recorder = load('sim-lab-measurement-recorder.jsx'), Inspector = load('sim-lab-physics-inspector.jsx');
const synchronous = component => {
    component.setState = (update, callback) => { Object.assign(component.state, typeof update === 'function' ? update(component.state) : update); callback?.(); };
    return component;
};
const find = (element, id) => {
    if (!element || typeof element !== 'object') return null;
    if (element.props?.['data-testid'] === id) return element;
    for (const child of [element.props?.children].flat(Infinity)) { const match = find(child, id); if (match) return match; }
    return null;
};
const modelKey = '0 Current original model bytes\n';
const definition = {id: 'mass', kind: 'mass', label: 'Mass', targets: ['brick'], visible: true};
const context = {modelSha256: 'a'.repeat(64), rawModelSha256: sha256Text(modelKey)};
const make = () => synchronous(new Recorder({locale: 'en', recorder: recording.createMeasurementRecorder(), session: {}, modelKey,
    modelContext: context, recorderRevision: 0, definitions: [definition], selected: ['mass'], sampleTime: 0,
    rows: [{id: 'mass', unit: 'g', value: 3, source: 'configured-mass', available: true}], paused: true, replaying: false}));
const csv = () => {
    const r = recording.createMeasurementRecorder(), c = make();
    r.start(c.recordingProps()); r.update(c.recordingProps());
    r.update({...c.recordingProps(), sampleTime: 100, rows: [{...c.props.rows[0], value: 4}]}); r.stop();
    return recording.measurementRunsToCsv(r.snapshot().runs);
};
const event = text => ({target: {value: 'old-selection', files: [{size: Buffer.byteLength(text), text: async () => text}]}});
test('real recorder UI imports CSV atomically, restores plot selection and reports malformed input visibly', async () => {
    const c = make(); let selected, saved = 0;
    c.props = {...c.props, onRestoredSelection: ids => { selected = ids; }, onHistoryChanged: () => { saved++; }};
    const input = event(csv()); await c.importCsv(input);
    assert.equal(input.target.value, ''); assert.equal(c.state.snapshot.runs.length, 1);
    assert.equal(c.state.snapshot.runs[0].samples[1].readings[0].value, 4); assert.equal(c.state.snapshot.runs[0].origin, 'csv'); assert.deepEqual(selected, ['mass']); assert.equal(saved, 1);
    const before = c.recorder.snapshot(); await c.importCsv(event('wrong,header\r\n'));
    assert.deepEqual(c.recorder.snapshot(), before); assert.match(c.state.importStatus, /CSV import refused/);
});
test('pending file reads cannot attach to another session, model, definitions, replay or disposed panel', async () => {
    for (const change of ['session', 'model', 'definitions', 'replay', 'dispose', 'clear']) {
        const c = make(); let release;
        const pending = c.importCsv({target: {value: 'file', files: [{size: 200, text: () => new Promise(resolve => { release = resolve; })}]}});
        if (change === 'session') c.props = {...c.props, session: {}};
        if (change === 'model') c.props = {...c.props, modelContext: {...context, modelSha256: 'b'.repeat(64)}};
        if (change === 'definitions') c.props = {...c.props, definitions: [{...definition, targets: ['other']}]};
        if (change === 'replay') c.props = {...c.props, replaying: true};
        if (change === 'dispose') c.componentWillUnmount();
        if (change === 'clear') c.clear();
        release(csv()); await pending;
        assert.deepEqual(c.recorder.snapshot().runs, [], change); assert.equal(c.state.importStatus, '', change);
    }
});
test('capacity and file byte bounds refuse before reading or changing captured runs', async () => {
    for (const capacity of [true, false]) {
        const c = make(); c.props = {...c.props, recordingAllowed: capacity}; let reads = 0;
        await c.importCsv({target: {value: 'file', files: [{size: experiments.CSV_BYTE_LIMIT + 1, text: async () => { reads++; return csv(); }}]}});
        assert.equal(reads, 0); assert.deepEqual(c.recorder.snapshot().runs, []); assert.match(c.state.importStatus, /refused/);
    }
});
test('a synchronous project save stop becomes visible in recorder controls even at the same sample time', () => {
    const c = make(); c.start(); assert.equal(c.state.snapshot.active, true);
    c.recorder.stop('project-save'); const previous = c.props; c.props = {...c.props, recorderRevision: 1}; c.componentDidUpdate(previous);
    assert.equal(c.state.snapshot.active, false); assert.equal(c.state.snapshot.runs.length, 1);
    assert.equal(find(c.render(), 'bw-sim-measurement-record-stop'), null);
    assert.ok(find(c.render(), 'bw-sim-measurement-record-start'));
});
test('actual inspector renders separate configured/solver masses, local tensor and static/replay availability', () => {
    let reads = 0;
    const d = {configuredMassKg: 0.003, solverMassKg: 0.02, centerOfMassWorld: [1, 2, 3], inertiaKgM2: [[0.1, 0, 0], [0, 0.2, 0], [0, 0, 0.3]],
        motion: 'dynamic', gravityFactor: 0.15, massAdjusted: true, inertiaAdjusted: true};
    const session = {model: {parts: [{id: 'brick'}]}, mechanism: {bodies: [{id: 'b', massKg: 0.003, parts: ['brick']}]},
        core: {bodyDynamics: () => { reads++; return d; }}};
    const html = renderToStaticMarkup(React.createElement(Inspector, {locale: 'en', session}));
    assert.match(html, /Configured mass/); assert.match(html, /3 g/); assert.match(html, /20 g/); assert.match(html, /local body axes/); assert.match(html, /Solver mass is adjusted/);
    const before = reads;
    const replay = renderToStaticMarkup(React.createElement(Inspector, {locale: 'en', session, replaying: true}));
    assert.equal(reads, before); assert.match(replay, /unavailable/);
    session.core.bodyDynamics = () => ({...d, motion: 'static', solverMassKg: null, inertiaKgM2: null, massAdjusted: false, inertiaAdjusted: false});
    const fixed = renderToStaticMarkup(React.createElement(Inspector, {locale: 'en', session}));
    assert.match(fixed, /Static \/ clamped/); assert.doesNotMatch(fixed, /NaN|Infinity/);
});

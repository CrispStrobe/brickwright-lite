// SPDX-License-Identifier: BSD-3-Clause
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {compareMeasurementRuns, createMeasurementRecorder, measurementRunsToCsv, measurementRunsToReport, RECORDING_INTERVAL_MS,
    RECORDING_DURATION_MS, RECORDING_LIMIT, RECORDING_SAMPLE_LIMIT} from '../overlay/scratch-gui/src/lib/bw-sim/measurements/recording.js';
import {sha256Text} from '../overlay/scratch-gui/src/lib/bw-sim/measurements/binding-digest.js';

const definition = overrides => ({id: 'hinge', kind: 'jointAngle', label: 'Input hinge', joint: 'j1', binding: 'sha256:binding-1', visible: true, ...overrides});
const modelKey = '0 Test LDraw model\n';
const makeRows = (value = 1, overrides = {}) => [{id: 'hinge', available: true, value, unit: '°', source: 'jolt-joint', ...overrides}];
const start = (recorder, overrides = {}) => recorder.start({session: {}, modelKey, definitions: [definition()], selected: ['hinge'], sampleTime: 0, ...overrides});
const sample = (recorder, session, time, value, rowOverrides = {}, overrides = {}) => recorder.update({session, modelKey,
    definitions: [definition()], selected: ['hinge'], rows: makeRows(value, rowOverrides), sampleTime: time, ...overrides});

test('two bounded recordings admit 600 actual row sets at 100 ms simulated intervals', () => {
    const recorder = createMeasurementRecorder(), session = {};
    start(recorder, {session});
    for (let i = 0; i < RECORDING_SAMPLE_LIMIT; i++) sample(recorder, session, i * RECORDING_INTERVAL_MS, i);
    let snapshot = recorder.snapshot();
    assert.equal(snapshot.active, false); assert.equal(snapshot.stoppedReason, 'sample-limit');
    assert.equal(snapshot.runs.length, 1); assert.equal(snapshot.runs[0].samples.length, 600);
    assert.equal(snapshot.runs[0].samples.at(-1).elapsedMs, 59900);
    assert.equal(snapshot.runs[0].modelSha256, sha256Text(modelKey));
    assert.equal(snapshot.runs[0].samples.at(-1).readings[0].value, 599);
    snapshot.runs[0].samples[0].readings[0].value = 999;
    assert.equal(recorder.snapshot().runs[0].samples[0].readings[0].value, 0, 'returned snapshots cannot mutate retained samples');

    const secondSession = {};
    start(recorder, {session: secondSession});
    sample(recorder, secondSession, 0, 3);
    sample(recorder, secondSession, 100, 5);
    recorder.stop();
    snapshot = recorder.snapshot();
    assert.equal(snapshot.runs.length, RECORDING_LIMIT); assert.equal(snapshot.compatible, true);
    assert.equal(recorder.start({session: {}, modelKey, definitions: [definition()], selected: ['hinge'], sampleTime: 0}).runs.length, 2,
        'a third run is refused until explicit clear');
    assert.equal(recorder.snapshot().runs.length, 2);
    recorder.clear(); assert.deepEqual(recorder.snapshot().runs, []);
});

test('sampling ignores renders, sub-interval rows and bad time; paused same-time update replaces the sample', () => {
    const recorder = createMeasurementRecorder(), session = {};
    start(recorder, {session});
    const rows = makeRows(1);
    recorder.update({session, modelKey, definitions: [definition()], selected: ['hinge'], rows, sampleTime: 0});
    recorder.update({session, modelKey, definitions: [definition()], selected: ['hinge'], rows, sampleTime: 0});
    recorder.update({session, modelKey, definitions: [definition()], selected: ['hinge'], rows: makeRows(2), sampleTime: 50});
    recorder.update({session, modelKey, definitions: [definition()], selected: ['hinge'], rows: makeRows(3), sampleTime: 100});
    recorder.update({session, modelKey, definitions: [definition()], selected: ['hinge'], rows: makeRows(4), sampleTime: 100, paused: true});
    let active = recorder.snapshot();
    assert.equal(active.sampleCount, 2); assert.equal(active.runs.length, 0);
    recorder.stop();
    const points = recorder.snapshot().runs[0].samples;
    assert.deepEqual(points.map(point => point.elapsedMs), [0, 100]);
    assert.equal(points[1].readings[0].value, 4);
});

test('a sparse producer still stops at the 60-second simulated-time bound', () => {
    const recorder = createMeasurementRecorder(), session = {};
    start(recorder, {session}); sample(recorder, session, 0, 1);
    const snapshot = sample(recorder, session, RECORDING_DURATION_MS, 2);
    assert.equal(snapshot.active, false); assert.equal(snapshot.stoppedReason, 'time-limit');
    assert.equal(snapshot.runs[0].samples.length, 1);
});

test('active recording stops on replay, session reset, model replacement and definition or binding change', () => {
    const cases = [
        ['pose-replay', props => ({...props, replaying: true})],
        ['session-reset', props => ({...props, session: {}})],
        ['model-changed', props => ({...props, modelKey: 'different model'})],
        ['definitions-changed', props => ({...props, definitions: [definition({binding: 'sha256:new-binding'})]})],
        ['definitions-changed', props => ({...props, selected: []})],
        ['time-reset', props => ({...props, sampleTime: Number.NaN})]
    ];
    for (const [why, change] of cases) {
        const recorder = createMeasurementRecorder(), session = {};
        start(recorder, {session}); sample(recorder, session, 0, 1);
        const props = {session, modelKey, definitions: [definition()], selected: ['hinge'], rows: makeRows(2), sampleTime: 100};
        const snapshot = recorder.update(change(props));
        assert.equal(snapshot.active, false, why); assert.equal(snapshot.stoppedReason, why);
        assert.equal(snapshot.runs.length, 1, 'the admitted partial run stays available');
        assert.equal(snapshot.runs[0].samples.length, 1);
    }
});

test('completed runs remain comparable after session reset only when model and binding identity match', () => {
    const recorder = createMeasurementRecorder(), first = {}, second = {};
    start(recorder, {session: first}); sample(recorder, first, 0, 1); sample(recorder, first, 100, 2); recorder.stop();
    start(recorder, {session: second}); sample(recorder, second, 0, 2); sample(recorder, second, 100, 4); recorder.stop();
    const runs = recorder.snapshot().runs;
    assert.equal(runs.length, 2); assert.equal(recorder.snapshot().compatible, true);
    const result = compareMeasurementRuns(runs)[0];
    assert.deepEqual(result.pairs.map(pair => pair.delta), [1, 2]);
    const mismatched = createMeasurementRecorder();
    const originalSession = {};
    start(mismatched, {session: originalSession}); sample(mismatched, originalSession, 0, 1); mismatched.stop();
    const refused = mismatched.start({session: {}, modelKey: `${modelKey}other`, definitions: [definition()], selected: ['hinge'], sampleTime: 0});
    assert.equal(refused.active, false); assert.equal(refused.stoppedReason, 'different-model-or-measurements');
    assert.equal(refused.runs.length, 1);
    const changedBinding = mismatched.start({session: {}, modelKey, definitions: [definition({binding: 'changed'})], selected: ['hinge'], sampleTime: 0});
    assert.equal(changedBinding.active, false); assert.equal(changedBinding.stoppedReason, 'different-model-or-measurements');
});

test('display-label changes do not alter quantity/binding identity; selected trace set remains capped at four', () => {
    const recorder = createMeasurementRecorder(), session = {};
    const many = Array.from({length: 5}, (_, i) => definition({id: `m${i}`, label: `Measure ${i}`}));
    recorder.start({session, modelKey, definitions: many, selected: many.map(d => d.id), sampleTime: 0});
    recorder.update({session, modelKey, definitions: many, selected: many.map(d => d.id), rows: many.slice(0, 4).map(d => ({id: d.id, available: true, value: 1, unit: '°'})), sampleTime: 0});
    recorder.stop();
    assert.equal(recorder.snapshot().runs[0].definitions.length, 4);
    const labelRecorder = createMeasurementRecorder(), first = {}, next = {};
    start(labelRecorder, {session: first}); sample(labelRecorder, first, 0, 1); labelRecorder.stop();
    labelRecorder.start({session: next, modelKey, definitions: [definition({label: 'Renamed display'})], selected: ['hinge'], sampleTime: 0});
    assert.equal(labelRecorder.snapshot().active, true, 'presentation labels do not change the compared physical quantity');
});

test('comparison uses exact elapsed-time intersections and preserves gaps instead of zeroes', () => {
    const recorder = createMeasurementRecorder(), first = {}, second = {};
    start(recorder, {session: first}); sample(recorder, first, 0, 2); sample(recorder, first, 100, null, {available: false, reason: 'missing-target'}); sample(recorder, first, 200, 8); recorder.stop();
    start(recorder, {session: second}); sample(recorder, second, 0, 3); sample(recorder, second, 100, 9); sample(recorder, second, 250, 11); recorder.stop();
    const comparison = compareMeasurementRuns(recorder.snapshot().runs)[0];
    assert.deepEqual(comparison.pairs.map(pair => pair.elapsedMs), [0, 100]);
    assert.equal(comparison.pairs[0].delta, 1);
    assert.equal(comparison.pairs[1].available, false); assert.equal(comparison.pairs[1].delta, null);
    assert.equal(comparison.pairs[1].reason, 'missing-target');
    assert.equal(comparison.range[0].min, 2); assert.equal(comparison.range[0].max, 8);
});

test('CSV is stable RFC4180 long form and neutralizes formula-like user text without changing negative values', () => {
    const recorder = createMeasurementRecorder(), session = {};
    start(recorder, {session, definitions: [definition({label: '=SUM(A1:A2)'})]});
    recorder.update({session, modelKey, definitions: [definition({label: '=SUM(A1:A2)'})], selected: ['hinge'], rows: makeRows(-1.25), sampleTime: 0});
    recorder.stop();
    const csv = measurementRunsToCsv(recorder.snapshot().runs);
    assert.match(csv, /^"run_id","model_sha256","measurement_id","label"/);
    assert.ok(csv.includes('""binding"":""sha256:binding-1""'), 'the CSV retains target and binding identity as JSON');
    assert.match(csv, /,"'=SUM\(A1:A2\)",/);
    assert.match(csv, /,"-1\.25",""\r\n$/);
    assert.ok(csv.includes('\r\n')); assert.equal(csv.endsWith('\r\n'), true);
    assert.equal(measurementRunsToCsv([]), '"run_id","model_sha256","measurement_id","label","kind","definition_json","unit","source","elapsed_ms","available","value","reason"\r\n');
});

test('JSON report is bounded summary metadata with only finite comparison deltas', () => {
    const recorder = createMeasurementRecorder(), first = {}, second = {};
    start(recorder, {session: first}); sample(recorder, first, 0, 2); sample(recorder, first, 100, null, {available: false}); recorder.stop();
    start(recorder, {session: second}); sample(recorder, second, 0, 5); sample(recorder, second, 100, 9); recorder.stop();
    const reportText = measurementRunsToReport(recorder.snapshot().runs), report = JSON.parse(reportText);
    assert.ok(Buffer.byteLength(reportText) < 65536); assert.equal(report.schema, 'bw.sim-lab.measurement-runs.v1');
    assert.equal(report.compatible, true); assert.equal(report.runs.length, 2);
    assert.equal(report.runs[0].measurements[0].min, 2); assert.equal(report.runs[0].measurements[0].max, 2);
    assert.equal(report.comparison[0].availableSharedSampleTimes, 1);
    assert.equal(report.comparison[0].minimumDelta, 3); assert.equal(report.comparison[0].maximumDelta, 3);
});

const requireGui = createRequire(new URL('../packages/scratch-gui/package.json', import.meta.url));
const React = requireGui('react'), {renderToStaticMarkup} = requireGui('react-dom/server'), babel = requireGui('@babel/core');
const loadRecorder = () => {
    const source = readFileSync(new URL('../overlay/scratch-gui/src/components/tw-pseudocode/sim-lab-measurement-recorder.jsx', import.meta.url), 'utf8');
    const code = babel.transformSync(source, {filename: 'sim-lab-measurement-recorder.jsx', babelrc: false, configFile: false,
        presets: [requireGui.resolve('@babel/preset-react')], plugins: [requireGui.resolve('@babel/plugin-transform-modules-commonjs')]}).code;
    const module = {exports: {}};
    new Function('require', 'module', 'exports', code)(name => name.endsWith('/measurements/recording.js') ?
        {compareMeasurementRuns, createMeasurementRecorder, measurementRunsToCsv, measurementRunsToReport, RECORDING_LIMIT} : requireGui(name), module, module.exports);
    return module.exports.default;
};
const Recorder = loadRecorder();
const findElement = (element, predicate) => {
    if (!element || typeof element !== 'object') return null;
    if (predicate(element)) return element;
    for (const child of [element.props?.children].flat(Infinity)) {
        const found = findElement(child, predicate); if (found) return found;
    }
    return null;
};

test('React recorder controls start/stop, keep two runs, render exact shared-time deltas and clear', () => {
    const session = {};
    const props = {locale: 'en', session, modelKey, definitions: [definition()], selected: ['hinge'], rows: makeRows(4), sampleTime: 0, replaying: false, paused: false};
    const component = new Recorder(props);
    component.setState = update => {component.state = {...component.state, ...(typeof update === 'function' ? update(component.state, component.props) : update)};};
    let button = id => findElement(component.render(), element => element.props?.['data-testid'] === id);
    button('bw-sim-measurement-record-start').props.onClick();
    component.props = {...component.props, rows: makeRows(4), sampleTime: 0}; component.componentDidUpdate(props);
    const atZero = component.props;
    component.props = {...component.props, rows: makeRows(7), sampleTime: 100}; component.componentDidUpdate(atZero);
    button('bw-sim-measurement-record-stop').props.onClick();
    assert.match(renderToStaticMarkup(React.createElement(Recorder, props)), /Start recording/);
    assert.match(renderToStaticMarkup(component.render()), /Run 1: 2 sample sets/);

    const previous = component.props;
    component.props = {...component.props, session: {}, rows: makeRows(3), sampleTime: 0}; component.componentDidUpdate(previous);
    button('bw-sim-measurement-record-start').props.onClick();
    const beforeZero = component.props;
    component.props = {...component.props, rows: makeRows(3), sampleTime: 0}; component.componentDidUpdate(beforeZero);
    const beforeHundred = component.props;
    component.props = {...component.props, rows: makeRows(5), sampleTime: 100}; component.componentDidUpdate(beforeHundred);
    button('bw-sim-measurement-record-stop').props.onClick();
    const html = renderToStaticMarkup(component.render());
    assert.match(html, /Run 2: 2 sample sets/); assert.match(html, /Shared simulation times/); assert.match(html, /Change \(2 − 1\)/);
    assert.match(html, /<td>3<\/td><td>-1<\/td>/); assert.match(html, /<td>5<\/td><td>-2<\/td>/);
    assert.equal(button('bw-sim-measurement-record-start').props.disabled, true);
    button('bw-sim-measurement-record-clear').props.onClick();
    assert.match(renderToStaticMarkup(component.render()), /Start recording/);
});

test('rendered CSV control downloads the retained immutable run as text/csv', async () => {
    const session = {}, props = {locale: 'en', session, modelKey, definitions: [definition()], selected: ['hinge'], rows: makeRows(4), sampleTime: 0, replaying: false};
    const component = new Recorder(props);
    component.setState = update => {component.state = {...component.state, ...(typeof update === 'function' ? update(component.state, component.props) : update)};};
    const button = id => findElement(component.render(), element => element.props?.['data-testid'] === id);
    button('bw-sim-measurement-record-start').props.onClick();
    const prior = component.props;
    component.props = {...component.props, rows: makeRows(4), sampleTime: 0}; component.componentDidUpdate(prior);
    button('bw-sim-measurement-record-stop').props.onClick();
    let downloaded = null, revoked = null;
    const oldCreate = URL.createObjectURL, oldRevoke = URL.revokeObjectURL, oldDocument = globalThis.document;
    const oldClick = globalThis.HTMLAnchorElement?.prototype?.click;
    URL.createObjectURL = blob => {downloaded = blob; return 'blob:measurement-test';};
    URL.revokeObjectURL = url => {revoked = url;};
    globalThis.document = {createElement: tag => {assert.equal(tag, 'a'); return {click () {assert.equal(this.href, 'blob:measurement-test');}};}};
    try {
        button('bw-sim-measurement-record-export').props.onClick();
        assert.equal(downloaded.type, 'text/csv;charset=utf-8');
        await new Promise(resolve => setTimeout(resolve, 5));
        assert.equal(revoked, 'blob:measurement-test');
    } finally {
        URL.createObjectURL = oldCreate; URL.revokeObjectURL = oldRevoke;
        if (oldDocument === undefined) delete globalThis.document; else globalThis.document = oldDocument;
        if (oldClick) globalThis.HTMLAnchorElement.prototype.click = oldClick;
    }
});

test('recorder component stops in lifecycle on source change and blocks replay start', () => {
    const session = {}, props = {locale: 'de', session, modelKey, definitions: [definition()], selected: ['hinge'], rows: makeRows(1), sampleTime: 0, replaying: false};
    const component = new Recorder(props);
    component.setState = update => {component.state = {...component.state, ...(typeof update === 'function' ? update(component.state, component.props) : update)};};
    findElement(component.render(), el => el.props?.['data-testid'] === 'bw-sim-measurement-record-start').props.onClick();
    const previous = component.props;
    component.props = {...component.props, replaying: true}; component.componentDidUpdate(previous);
    assert.equal(component.state.snapshot.active, false);
    assert.equal(component.state.snapshot.stoppedReason, 'pose-replay');
    assert.match(renderToStaticMarkup(component.render()), /Während der Wiedergabe nicht verfügbar/);
    assert.equal(findElement(component.render(), el => el.props?.['data-testid'] === 'bw-sim-measurement-record-start').props.disabled, true);
});

test('pane-owned recorder survives panel unmount and preserves stopped samples for remount', () => {
    const session = {}, recorder = createMeasurementRecorder();
    const props = {locale: 'en', recorder, session, modelKey, definitions: [definition()], selected: ['hinge'], rows: makeRows(1), sampleTime: 0, replaying: false};
    const component = new Recorder(props);
    component.setState = update => {component.state = {...component.state, ...(typeof update === 'function' ? update(component.state, component.props) : update)};};
    findElement(component.render(), el => el.props?.['data-testid'] === 'bw-sim-measurement-record-start').props.onClick();
    const previous = component.props;
    component.props = {...component.props, rows: makeRows(7), sampleTime: 100}; component.componentDidUpdate(previous);
    component.componentWillUnmount();
    assert.equal(recorder.snapshot().active, false); assert.equal(recorder.snapshot().stoppedReason, 'panel-closed');
    assert.deepEqual(recorder.snapshot().runs[0].samples.map(s => s.elapsedMs), [0,100]);
    const remount = new Recorder(props);
    assert.equal(remount.state.snapshot.runs[0].samples[1].readings[0].value, 7);
});

test('a paused final observation keeps its actual elapsed timestamp and cannot extend the duration bound', () => {
    const recorder=createMeasurementRecorder(),session={};start(recorder,{session});
    sample(recorder,session,0,1);sample(recorder,session,100,2);sample(recorder,session,150,3,{}, {paused:true});
    recorder.stop();const points=recorder.snapshot().runs[0].samples;
    assert.deepEqual(points.map(p=>[p.elapsedMs,p.timeMs]),[[0,0],[150,150]]);
    recorder.clear();start(recorder,{session});sample(recorder,session,59950,1);sample(recorder,session,60010,2,{}, {paused:true});
    assert.equal(recorder.snapshot().stoppedReason,'time-limit');
    assert.equal(recorder.snapshot().runs[0].samples[0].elapsedMs,59950);
});

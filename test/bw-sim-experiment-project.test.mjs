// SPDX-License-Identifier: BSD-3-Clause
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import JSZip from 'jszip';
import {balancedAfter} from './helpers/js-scope.mjs';
import {parseModel, serializeModel} from '../overlay/scratch-gui/src/lib/bw-sim/model/ldraw-model.js';
import {createControlPair, restoreControlPair} from '../overlay/scratch-gui/src/lib/bw-sim/measurements/control-pairs.js';
import {experimentsFromRuns} from '../overlay/scratch-gui/src/lib/bw-sim/measurements/experiments.js';
import {createMeasurementRecorder} from '../overlay/scratch-gui/src/lib/bw-sim/measurements/recording.js';
import {refuseSimLabSave, clearSimLabSaveFailure, simLabSaveFailure} from '../overlay/scratch-gui/src/lib/bw-sim/model/sim-lab-save-state.js';
import {measurementModelContext} from '../overlay/scratch-gui/src/lib/bw-sim/measurements/model-context.js';
import {simLabRecordFromText, readSimLabStorage, isStorableName, SIM_LAB_STORAGE_KEY} from '../overlay/scratch-gui/src/lib/bw-sim/model/sim-lab-persist.js';

const source = readFileSync(new URL('../overlay/scratch-gui/src/components/tw-pseudocode/sim-lab-pane.jsx', import.meta.url), 'utf8');
const signatures = ['rememberMeasurementHistory ()', 'currentRecord ()', 'onBundleCollect (event)', 'async onBundleLoaded (event)', 'async openStored ()'];
const methods = signatures.map(signature => `${signature} ${balancedAfter(source, `    ${signature} {`, '{', '}')}`).join(',\n');
const api = Function('createMeasurementRecorder', 'measurementModelContext', 'simLabRecordFromText', 'readSimLabStorage', 'isStorableName',
    'SIM_LAB_STORAGE_KEY', 'MODEL_TITLE', 'modelKey', 'refuseSimLabSave', 'clearSimLabSaveFailure', 'simLabSaveFailure', 'restoreControlPair', `return {${methods}}`)(createMeasurementRecorder, measurementModelContext,
    simLabRecordFromText, readSimLabStorage, isStorableName, SIM_LAB_STORAGE_KEY, 'Sim Lab model', m => m.file, refuseSimLabSave, clearSimLabSaveFailure, simLabSaveFailure, restoreControlPair);
const raw = '0 Original title\n0 Name: original.ldr\n0 !BW ID brick\n1 16 0 0 0 1 0 0 0 1 0 0 0 1 3001.dat\n';
const definition = {id: 'mass', kind: 'mass', label: 'Assembly mass', targets: ['brick'], visible: true};
const pane = () => {
    const model = parseModel(raw).model;
    const p = {...api, lib: {serializeModel, MODELS: [{file: 'default.ldr'}]}, session: {model}, opened: {text: raw},
        measurements: [definition], measurementModels: new Map(), measurementExperiments: new Map(), measurementRecording: createMeasurementRecorder(),
        measurementContext: measurementModelContext(model, raw, serializeModel), measurementRevision: 0, measurementSaveError: null,
        state: {status: 'ready', modelFile: 'renamed.ldr', mat: null, message: '', measurementTick: 0}, locale: 'en', disposed: false,
        setState (update, callback) { Object.assign(this.state, typeof update === 'function' ? update(this.state) : update); callback?.(); }};
    return p;
};
const browser = async callback => {
    const original = Object.fromEntries(['localStorage', 'window', 'CustomEvent'].map(k => [k, Object.getOwnPropertyDescriptor(globalThis, k)]));
    const values = new Map();
    globalThis.localStorage = {get length () { return values.size; }, key: i => [...values.keys()][i] ?? null,
        getItem: k => values.get(k) ?? null, setItem: (k, v) => values.set(k, String(v)), removeItem: k => values.delete(k)};
    globalThis.window = {dispatchEvent: () => {}};
    globalThis.CustomEvent = class { constructor (type, options) { this.type = type; this.detail = options?.detail; } };
    clearSimLabSaveFailure();
    try { await callback(values); } finally {
        clearSimLabSaveFailure();
        for (const [key, descriptor] of Object.entries(original)) {
            if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
        }
    }
};
test('actual save hook freezes capture and carries compact history across a renamed serialized project', () => {
    const p = pane(), session = p.session, context = p.measurementContext;
    p.measurementRecording.start({session, modelKey: raw, canonicalModelSha256: context.modelSha256,
        rawModelSha256: context.rawModelSha256, definitions: p.measurements, selected: ['mass'], sampleTime: 0});
    p.measurementRecording.update({session, modelKey: raw, definitions: p.measurements, selected: ['mass'],
        sampleTime: 0, rows: [{id: 'mass', value: 3, unit: 'g', source: 'configured-mass', available: true}]});
    const record = p.currentRecord();
    assert.equal(p.measurementRecording.snapshot().active, false);
    assert.equal(p.measurementRevision, 1); assert.equal(p.state.measurementTick, 1);
    assert.equal(record.experiments.runs.length, 1); assert.equal(record.experiments.runs[0].samples.length, 1);
    assert.notEqual(record.ldraw, raw);
    const reopenedContext = measurementModelContext(parseModel(record.ldraw).model, record.ldraw, serializeModel);
    const reopened = createMeasurementRecorder(); reopened.restore(record.experiments, reopenedContext);
    assert.equal(reopened.snapshot().runs[0].samples[0].readings[0].value, 3);
    assert.deepEqual(reopened.selectionFor(record.ldraw, reopenedContext.modelSha256), ['mass']);
});
test('actual project-load hook clears previous histories even when a vanilla project is loaded', async () => {
    for (const outcome of ['loaded', 'legacy']) {
        const p = pane(); p.measurementModels.set('old', [definition]); p.measurementExperiments.set('old', {runs: [{}]});
        p.measurementRecording.start({session: p.session, modelKey: raw, definitions: p.measurements, selected: ['mass'], sampleTime: 0});
        let opened = 0; p.openStored = async () => { opened++; };
        await p.onBundleLoaded({detail: {outcome}});
        assert.equal(opened, 1); assert.equal(p.measurementModels.size, 0); assert.equal(p.measurementExperiments.size, 0);
        assert.equal(p.measurementContext, null); assert.equal(p.measurementRecording.snapshot().active, false);
        assert.deepEqual(p.measurementRecording.snapshot().runs, []);
    }
});
test('actual stored-open hook forwards admitted history and legacy projects open without it', async () => browser(async values => {
    const p = pane(); const record = p.currentRecord();
    values.set(SIM_LAB_STORAGE_KEY, JSON.stringify(record));
    let opened; p.openText = async (...args) => { opened = args; };
    await p.openStored(); assert.equal(opened[0], record.ldraw); assert.deepEqual(opened[3].measurements, record.measurements);
    assert.equal(opened[3].experiments, undefined);
    values.clear(); let shipped; p.openShipped = async file => { shipped = file; };
    await p.openStored(); assert.equal(shipped, 'default.ldr');
}));
test('an actual oversized model refusal cancels bundle export instead of attaching stale storage', async () => browser(async values => {
    const {attachBrickwrightState} = await import('../overlay/scratch-gui/src/lib/bw-project-bundle.js');
    const p = pane(), stale = JSON.stringify(p.currentRecord()); values.set(SIM_LAB_STORAGE_KEY, stale);
    p.session.model.files = {'oversized.dat': `0 ${'x'.repeat(1048576)}`};
    window.dispatchEvent = event => p.onBundleCollect(event);
    const zip = new JSZip(); zip.file('project.json', '{"targets":[]}'); const bytes = await zip.generateAsync({type: 'uint8array'});
    await assert.rejects(attachBrickwrightState(new Blob([bytes])), /Robot Lab model and recordings could not be saved/);
    assert.equal(values.get(SIM_LAB_STORAGE_KEY), stale, 'failed collection did not overwrite the last valid local state');
    assert.match(p.state.message, /Export CSV or clear recordings/);
    delete p.session.model.files;
    p.onBundleCollect(); assert.equal(p.state.message, '', 'a corrected save clears only its own failure');
}));
test('aggregate project bound rejects otherwise valid sections before creating an unreadable bundle', async () => browser(async values => {
    const {attachBrickwrightState} = await import('../overlay/scratch-gui/src/lib/bw-project-bundle.js');
    values.set('bw-code-autosave', JSON.stringify({lang: 'js', code: 'x'.repeat(500000)}));
    values.set('bw-circuit-autosave', JSON.stringify({parts: [], note: 'x'.repeat(900000)}));
    values.set(SIM_LAB_STORAGE_KEY, JSON.stringify({ldraw: `${raw}0 ${'x'.repeat(800000)}`}));
    const zip = new JSZip(); zip.file('project.json', '{"targets":[]}'); const bytes = await zip.generateAsync({type: 'uint8array'});
    await assert.rejects(attachBrickwrightState(new Blob([bytes])), /Project data is too large to reopen safely/);
}));
test('a failed unmount collection survives pane closure and project rollback, while a new project clears it', async () => browser(async values => {
    const bundle = await import('../overlay/scratch-gui/src/lib/bw-project-bundle.js');
    const p = pane(); values.set(SIM_LAB_STORAGE_KEY, JSON.stringify(p.currentRecord()));
    p.session.model.files = {'oversized.dat': `0 ${'x'.repeat(1048576)}`};
    p.onBundleCollect(); // The unmount path has no event or live listener afterward.
    const reloadedNotice = await import('../overlay/scratch-gui/src/lib/bw-sim/model/sim-lab-save-state.js?reload-control');
    assert.match(reloadedNotice.simLabSaveFailure(), /could not be saved/);
    window.dispatchEvent = () => {};
    const zip = new JSZip(); zip.file('project.json', '{"targets":[]}'); const bytes = await zip.generateAsync({type: 'uint8array'});
    await assert.rejects(bundle.attachBrickwrightState(new Blob([bytes])), /could not be saved/);
    const applied = bundle.applyBrickwrightInspection({outcome: 'legacy', state: {}});
    assert.equal(applied.outcome, 'legacy');
    assert.ok(await bundle.attachBrickwrightState(new Blob([bytes])), 'a genuinely new compatible project is not poisoned');
    const rollback = bundle.rollbackBrickwrightInspection(applied);
    assert.equal(rollback.rolledBack, true);
    await assert.rejects(bundle.attachBrickwrightState(new Blob([bytes])), /could not be saved/);
}));
test('project metadata keeps recorded missing-target gaps as gaps through save and reopen', () => {
    const p = pane(), session = p.session;
    p.measurements = [{...definition, targets: ['removed-part']}];
    p.measurementRecording.start({session, modelKey: raw, canonicalModelSha256: p.measurementContext.modelSha256,
        rawModelSha256: p.measurementContext.rawModelSha256, definitions: p.measurements, selected: ['mass'], sampleTime: 0});
    p.measurementRecording.update({session, modelKey: raw, definitions: p.measurements, selected: ['mass'], sampleTime: 0,
        rows: [{id: 'mass', value: null, available: false, unit: 'g', source: '', reason: 'missing-target'}]});
    const record = p.currentRecord(), context = measurementModelContext(parseModel(record.ldraw).model, record.ldraw, serializeModel);
    const restored = createMeasurementRecorder(); restored.restore(record.experiments, context);
    const row = restored.snapshot().runs[0].samples[0].readings[0];
    assert.equal(row.available, false); assert.equal(row.value, null); assert.equal(row.reason, 'missing-target');
});
test('a superseded stored-model load cannot publish an old save failure into the new model', async () => browser(async values => {
    const p = pane(); values.set(SIM_LAB_STORAGE_KEY, JSON.stringify(p.currentRecord()));
    refuseSimLabSave('Old model could not be saved');
    let release;
    p.openText = () => { p.loadToken = {}; return new Promise(resolve => { release = resolve; }); };
    const pending = p.openStored();
    p.loadToken = {}; p.state.message = 'New model'; release(); await pending;
    assert.equal(p.state.message, 'New model'); assert.equal(p.measurementSaveError, null);
}));


test('actual save hook preserves an explicit pair and independent foreign identity in project bytes', async () => {
    const p = pane(), context = {...p.measurementContext, definitions: p.measurements};
    const make = (modelSha256, d, value) => experimentsFromRuns([{id:'run-1',origin:'simulation',modelSha256,definitions:[d],samples:[{elapsedMs:0,timeMs:5,readings:[{...d,unit:'g',source:'configured-mass',available:true,value,reason:''}]}]}],{modelSha256});
    const foreign = {...definition,id:'control-mass',label:'Control mass',targets:['different-brick']};
    const baseline=make(context.modelSha256,definition,3),control=make('e'.repeat(64),foreign,6);
    p.measurementControlPair=createControlPair({modelSha256:context.modelSha256,baseline:{packet:baseline,context},control:{packet:control,context:{modelSha256:'e'.repeat(64)}},mappings:[{baselineId:'mass',controlId:'control-mass'}]});
    const record=p.currentRecord();
    const zip=new JSZip();zip.file('brickwright/state.json',JSON.stringify({state:{simLab:record}}));
    const bytes=await zip.generateAsync({type:'nodebuffer'}),opened=await JSZip.loadAsync(bytes,{checkCRC32:true});
    const saved=JSON.parse(await opened.file('brickwright/state.json').async('text')).state.simLab;
    const reopenedContext=measurementModelContext(parseModel(saved.ldraw).model,saved.ldraw,serializeModel);
    const restored=restoreControlPair(saved.experiments,{...reopenedContext,definitions:saved.measurements});
    assert.equal(restored.baseline.canonicalModelSha256,context.modelSha256);
    assert.equal(restored.control.canonicalModelSha256,'e'.repeat(64));
    assert.equal(restored.baseline.id,restored.control.id,'role-qualified run-1 identities are preserved');
    assert.equal(p.measurementRecording.snapshot().runs.length,0,'pair data never becomes an ordinary recorder run');
    p.measurements=[{...definition,targets:['replacement']}];
    assert.throws(()=>p.currentRecord(),/binding mismatch/,'live binding replacement cannot silently rewrite pair provenance');
});


test('actual save hook retains twelve-digit placement while canonical measurement identity stays six-digit', () => {
    const p=pane(),part=p.session.model.parts[0],c=.384615384615,s=.923076923077;
    p.session.model={...p.session.model,parts:[{...part,position:[83.0769230769,0,0],rotation:[c,0,s,0,1,0,-s,0,c]}]};
    p.opened.text=serializeModel(p.session.model,{name:'precise.ldr',title:'Precise',precision:12});p.state.modelFile='precise.ldr';
    p.measurementContext=measurementModelContext(p.session.model,p.opened.text,serializeModel);
    const record=p.currentRecord();
    assert.ok(record.ldraw.includes('83.0769230769'));
    assert.ok(record.ldraw.includes('0.384615384615'));
    const parsed=parseModel(record.ldraw);assert.deepEqual(parsed.refusals,[]);
    const reopened=measurementModelContext(parsed.model,record.ldraw,serializeModel);
    assert.equal(reopened.modelSha256,p.measurementContext.modelSha256);
    assert.notEqual(reopened.rawModelSha256,reopened.modelSha256,'the precise saved bytes are not relabelled as the canonical six-digit serialization');
});

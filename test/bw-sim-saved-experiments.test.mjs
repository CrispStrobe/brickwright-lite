// SPDX-License-Identifier: BSD-3-Clause
import test from 'node:test';
import assert from 'node:assert/strict';
import {experimentsFromRuns, experimentsToRuns, measurementExperiments, measurementRunsFromCsv,
    EXPERIMENT_BYTE_LIMIT, CSV_BYTE_LIMIT} from '../overlay/scratch-gui/src/lib/bw-sim/measurements/experiments.js';
import {createMeasurementRecorder, measurementRunsToCsv, compareMeasurementRuns} from '../overlay/scratch-gui/src/lib/bw-sim/measurements/recording.js';
import {simLabRecord, simLabRecordFromText} from '../overlay/scratch-gui/src/lib/bw-sim/model/sim-lab-persist.js';
import {sha256Text} from '../overlay/scratch-gui/src/lib/bw-sim/measurements/binding-digest.js';

const modelKey = '0 Original model\n1 16 0 0 0 1 0 0 0 1 0 0 0 1 3001.dat\n';
const canonical = sha256Text('independent fixed-header physical model');
const context = {modelSha256: canonical, rawModelSha256: sha256Text(modelKey)};
const definition = {id: 'angle', kind: 'jointAngle', label: 'Input, "hinge"', targets: [], joint: 'j0', rope: '', binding: 'sha256:physical-members'};
const row = (value, gap = false) => ({id: definition.id, kind: definition.kind, label: definition.label,
    unit: '°', source: 'jolt-joint', available: !gap, value: gap ? null : value, reason: gap ? 'missing-target' : ''});
const run = (overrides = {}) => ({id: 'run-1', modelSha256: context.rawModelSha256, definitions: [definition],
    samples: [{elapsedMs: 0, timeMs: 450, readings: [row(-3)]}, {elapsedMs: 150, timeMs: 600, readings: [row(null, true)]},
        {elapsedMs: 350, timeMs: 800, readings: [row(5)]}], ...overrides});
const clone = value => structuredClone(value);
const packet = () => experimentsFromRuns([run()], context);
const csv = () => measurementRunsToCsv([run()]);

test('compact history roundtrip retains provenance, finite observations, irregular times and explicit gaps', () => {
    const saved = packet();
    assert.ok(Buffer.byteLength(JSON.stringify(saved)) < EXPERIMENT_BYTE_LIMIT);
    assert.deepEqual(saved.runs[0].samples[1], [150, 600, [[null, 'jolt-joint', 'missing-target']]]);
    const restored = experimentsToRuns(JSON.parse(JSON.stringify(saved)), {modelSha256: canonical, definitions: [definition]});
    assert.equal(restored[0].modelSha256, context.rawModelSha256);
    assert.equal(restored[0].canonicalModelSha256, canonical);
    assert.deepEqual(restored[0].samples, run().samples);
    saved.runs[0].samples[0][2][0][0] = 999;
    assert.equal(restored[0].samples[0].readings[0].value, -3);
});

test('existing Sim Lab records remain unchanged; optional experiments normalize and detach', () => {
    const legacy = simLabRecord({ldraw: modelKey, name: 'robot.ldr'});
    assert.deepEqual(legacy, {ldraw: modelKey, name: 'robot.ldr'});
    const source = packet();
    const record = simLabRecordFromText(modelKey, {measurements: [definition], experiments: source});
    assert.deepEqual(simLabRecord(JSON.parse(JSON.stringify(record))), record);
    source.runs[0].samples[0][2][0][0] = 99;
    assert.equal(record.experiments.runs[0].samples[0][2][0][0], -3);
    assert.throws(() => simLabRecord({...record, experiments: {...record.experiments, schema: 'future'}}), /schema/);
    assert.throws(() => simLabRecord({...record, ldraw: modelKey + '0 ' + 'x'.repeat(1024 * 1024)}), /exceeds/);
});

test('restore requires independent canonical identity; raw-text alias is explicit and provenance survives canonical reopen', () => {
    assert.throws(() => experimentsFromRuns([run()], {modelSha256: canonical}), /model mismatch/);
    assert.throws(() => experimentsToRuns(packet(), {modelSha256: 'b'.repeat(64)}), /model mismatch/);
    const restored = experimentsToRuns(packet(), {modelSha256: canonical});
    assert.equal(restored[0].modelSha256, context.rawModelSha256);
    assert.throws(() => experimentsToRuns(packet(), {...context, definitions: [{...definition, binding: 'different-members'}]}), /binding mismatch/);
});

test('strict CSV roundtrip keeps negative numbers, Unicode, escaped text, gaps and first-row definitions', () => {
    const original = run({definitions: [{...definition, id: '-angle', label: "'=literal Ω, \"hinge\""}]});
    original.samples = original.samples.map(s => ({...s, readings: s.readings.map(r => ({...r, id: '-angle', label: original.definitions[0].label}))}));
    const exported = measurementRunsToCsv([original]);
    const imported = measurementRunsFromCsv(exported, context);
    assert.equal(imported[0].definitions[0].id, '-angle');
    assert.equal(imported[0].definitions[0].label, original.definitions[0].label);
    assert.deepEqual(imported[0].samples.map(s => s.elapsedMs), [0,150,350]);
    assert.ok(imported[0].samples.every(s => !Object.hasOwn(s, 'timeMs')), 'absolute time is absent in CSV');
    assert.equal(imported[0].samples[0].readings[0].value, -3);
    assert.equal(imported[0].samples[1].readings[0].value, null);
    const portable = measurementRunsToCsv(imported);
    assert.match(portable.split('\r\n')[0], /canonical_model_sha256/);
    assert.equal(measurementRunsToCsv(measurementRunsFromCsv(portable, {modelSha256:canonical})), portable);
});

test('formula-like labels roundtrip against authoritative definition JSON without arbitrary apostrophe stripping', () => {
    for (const label of ['=formula', '+formula', '-formula', '@formula', "'=already literal", ' ordinary']) {
        const r = run({definitions: [{...definition, label}]});
        r.samples.forEach(s => s.readings.forEach(reading => {reading.label = label;}));
        assert.equal(measurementRunsFromCsv(measurementRunsToCsv([r]), context)[0].definitions[0].label, label);
    }
});

test('CSV parser refuses malformed quoting, wrong headers, row lengths and declarations', () => {
    for (const input of [csv().replace('"run_id"', '"other"'), csv() + '"unterminated',
        csv().replace('"run-1",', '"run-1"junk,'), csv().replace(/\r\n/u, '\r'),
        csv().replace('"jolt-joint",', '"jolt-joint","extra",'),
        csv().replace('"{', '"not-json{')]) assert.throws(() => measurementRunsFromCsv(input, context), /experiments/);
    const lines = csv().trimEnd().split('\r\n');
    assert.throws(() => measurementRunsFromCsv([lines[0], lines[2]].join('\r\n'), context), /first-row definition/);
    assert.throws(() => measurementRunsFromCsv([lines[0],lines[1],lines[1]].join('\r\n'), context), /repeats a definition/);
});

test('CSV admission refuses changed models, bindings, units, source, availability, finite values and time', () => {
    for (const alter of [
        s => s.replace(context.rawModelSha256, 'f'.repeat(64)),
        s => s.replaceAll('"°"', '"mm"'),
        s => s.replaceAll('"jolt-joint"', '"estimated-torque"'),
        s => s.replace('"true"', '"1"'),
        s => s.replace('"-3"', '"NaN"'),
        s => s.replace('"-3"', '""'),
        s => s.replace('"150"', '"-1"'),
        s => s.replace('"150"', '"60000"'),
        s => s.replace('"350"', '"150"'),
        s => s.replace('"350"', '"100"'),
        s => s.replace('"missing-target"', '"invented-gap"')
    ]) assert.throws(() => measurementRunsFromCsv(alter(csv()), context), /experiments/);
    assert.throws(() => measurementRunsFromCsv(csv(), {...context, definitions: [{...definition, joint: 'j9'}]}), /binding mismatch/);
});

test('incomplete multi-trace groups and duplicate rows refuse instead of inventing zeroes or interpolation', () => {
    const d2 = {...definition, id: 'second'};
    const r = run({definitions: [definition, d2]});
    r.samples = r.samples.map(s => ({...s, readings: [...s.readings, {...s.readings[0], id: d2.id}]}));
    const lines = measurementRunsToCsv([r]).trimEnd().split('\r\n');
    assert.throws(() => measurementRunsFromCsv(lines.filter((_,i) => i !== 4).join('\r\n'), context), /incomplete sample/);
    assert.throws(() => measurementRunsFromCsv([...lines, lines.at(-1)].join('\r\n'), context), /duplicate reading/);
});

test('compact schema refuses duplicated ids, malformed tuple shapes, bad times, unavailable values and forged sources', () => {
    for (const alter of [
        p => {p.runs.push(clone(p.runs[0]));},
        p => {p.runs[0].samples[0].push(1);},
        p => {p.runs[0].samples[1][0] = 0;},
        p => {p.runs[0].samples[1][0] = 60000;},
        p => {p.runs[0].samples[1][1] = 999;},
        p => {p.runs[0].samples[1][2][0][0] = 0;},
        p => {p.runs[0].samples[0][2][0][1] = 'invented';},
        p => {p.runs[0].definitions.push(clone(p.runs[0].definitions[0]));}
    ]) {const p = packet(); alter(p); assert.throws(() => measurementExperiments(p), /experiments|measurements/);}
});

test('all caps refuse before admission, while a full two-run/four-trace history stays within existing section bounds', () => {
    const defs = Array.from({length: 4}, (_,i) => ({...definition, id: `angle-${i}`, binding: 'x'.repeat(4096)}));
    const samples = Array.from({length: 600}, (_,i) => ({elapsedMs: i * 100, timeMs: 1000 + i * 100,
        readings: defs.map(d => ({...row(i), id: d.id}))}));
    const r = run({definitions: defs, samples});
    const complete = experimentsFromRuns([r, {...r,id:'run-2'}], context);
    assert.ok(Buffer.byteLength(JSON.stringify(complete)) < EXPERIMENT_BYTE_LIMIT);
    assert.ok(Buffer.byteLength(JSON.stringify(simLabRecord({ldraw: modelKey, experiments: complete}))) < 1024 * 1024);
    assert.equal(experimentsToRuns(complete, context)[1].samples.length, 600);
    const importedMaximum = measurementRunsFromCsv(measurementRunsToCsv([r, {...r,id:'run-2'}]), context);
    assert.equal(importedMaximum.length,2);
    assert.equal(importedMaximum[1].samples.length,600);
    assert.equal(importedMaximum[1].samples[599].readings[3].value,599);
    assert.throws(() => experimentsFromRuns([r,r,r], context), /at most two/);
    assert.throws(() => experimentsFromRuns([run({definitions: [...defs, {...definition,id:'fifth'}]})], context), /1-4/);
    assert.throws(() => experimentsFromRuns([run({samples:[...samples,samples[0]]})], context), /1-600/);
    assert.throws(() => measurementRunsFromCsv('x'.repeat(CSV_BYTE_LIMIT + 1), context), /byte limit/);
    assert.throws(() => measurementExperiments({...complete, unknown: 'x'.repeat(EXPERIMENT_BYTE_LIMIT)}), /byte limit/);
});

test('recorder restore/import are atomic, preserve provenance and compare admitted canonical identity', () => {
    const recorder = createMeasurementRecorder();
    recorder.restore(packet(), context);
    const before = recorder.snapshot();
    assert.throws(() => recorder.importCsv(csv(), {...context,modelSha256:'f'.repeat(64)}));
    assert.deepEqual(recorder.snapshot(), before);
    assert.throws(() => recorder.restore({...packet(),schema:'bad'},context));
    assert.deepEqual(recorder.snapshot(), before);
    assert.deepEqual(recorder.selectionFor('different serialization', canonical), ['angle']);
    const session = {};
    const args = {session, modelKey, canonicalModelSha256:canonical, rawModelSha256:context.rawModelSha256,
        definitions:[definition],selected:['angle'],sampleTime:0};
    recorder.start(args);
    assert.throws(() => recorder.importCsv(csv(),context), /Stop recording/);
    assert.throws(() => recorder.restore(undefined,context), /Stop recording/);
    recorder.update({...args,rows:[row(7)],sampleTime:0}); recorder.stop();
    assert.equal(recorder.snapshot().compatible,true);
    assert.equal(compareMeasurementRuns(recorder.snapshot().runs)[0].pairs[0].delta,10);
    const saved = recorder.exportExperiments({modelSha256:canonical});
    const reopened = createMeasurementRecorder(); reopened.restore(saved,{modelSha256:canonical});
    assert.equal(reopened.snapshot().compatible,true);
    reopened.restore(undefined,context); assert.deepEqual(reopened.snapshot().runs,[]);
});

test('recorder import capacity and binding failures preserve the exact retained history', () => {
    const recorder = createMeasurementRecorder(); recorder.importCsv(csv(),context);
    const before = recorder.snapshot();
    assert.throws(() => recorder.importCsv(csv(),context),/duplicate run ids/);
    assert.deepEqual(recorder.snapshot(),before);
    const second = run({id:'run-2'});
    recorder.importCsv(measurementRunsToCsv([second]),context);
    const full = recorder.snapshot();
    assert.throws(() => recorder.importCsv(csv(),context),/more than two/);
    assert.deepEqual(recorder.snapshot(),full);
});


test('capture after importing a nonsequential run id allocates a distinct id', () => {
    const recorder = createMeasurementRecorder();
    recorder.importCsv(measurementRunsToCsv([run({id:'run-2'})]),context);
    const session = {}, args = {session,modelKey,canonicalModelSha256:canonical,rawModelSha256:context.rawModelSha256,
        definitions:[definition],selected:['angle'],sampleTime:0};
    recorder.start(args);recorder.update({...args,rows:[row(2)]});recorder.stop();
    assert.deepEqual(recorder.snapshot().runs.map(r=>r.id),['run-2','run-1']);
    assert.equal(recorder.exportExperiments(context).runs.length,2);
});

test('differently declared physical definitions across two imported runs cannot compare', () => {
    const changed = run({id:'run-2',definitions:[{...definition,binding:'different-members'}]});
    assert.throws(() => measurementRunsFromCsv(measurementRunsToCsv([run(),changed]),context),/incompatible measurement/);
});

test('duplicate saved elapsed timestamps refuse even when absolute origin and all rows remain consistent', () => {
    const value = packet();
    value.runs[0].samples[1][0] = value.runs[0].samples[0][0];
    value.runs[0].samples[1][1] = value.runs[0].samples[0][1];
    assert.throws(() => measurementExperiments(value), /duplicate elapsed time/);
});


test('new canonical capture keeps raw provenance separately and exports the original twelve columns', () => {
    const recorder = createMeasurementRecorder(), session = {};
    const args = {session,modelKey,canonicalModelSha256:canonical,rawModelSha256:context.rawModelSha256,
        definitions:[definition],selected:['angle'],sampleTime:0};
    recorder.start(args);recorder.update({...args,rows:[row(2)]});recorder.stop();
    const captured=recorder.snapshot().runs[0];
    assert.equal(captured.modelSha256,canonical);
    assert.equal(captured.rawModelSha256,context.rawModelSha256);
    const exported=measurementRunsToCsv([captured]);
    assert.equal(exported.split('\r\n')[0].split(',').length,12);
    assert.equal(measurementRunsFromCsv(exported,{modelSha256:canonical})[0].modelSha256,canonical);
    const reopened=experimentsToRuns(recorder.exportExperiments(context),{modelSha256:canonical})[0];
    assert.equal(reopened.rawModelSha256,context.rawModelSha256);
});

test('legacy CSV import survives canonical save/reopen and portable thirteen-column reexport without relabelling provenance', () => {
    const legacy=csv();
    assert.equal(legacy.split('\r\n')[0].split(',').length,12);
    const recorder=createMeasurementRecorder();recorder.importCsv(legacy,context);
    const saved=JSON.parse(JSON.stringify(recorder.exportExperiments(context)));
    const reopened=createMeasurementRecorder();reopened.restore(saved,{modelSha256:canonical});
    const portable=measurementRunsToCsv(reopened.snapshot().runs);
    assert.equal(portable.split('\r\n')[0].split(',').length,13);
    const imported=measurementRunsFromCsv(portable,{modelSha256:canonical});
    assert.equal(imported[0].modelSha256,context.rawModelSha256);
    assert.equal(imported[0].canonicalModelSha256,canonical);
    assert.deepEqual(imported[0].samples.map(s=>s.readings),run().samples.map(s=>s.readings));
    assert.throws(()=>measurementRunsFromCsv(portable.replaceAll(canonical,'f'.repeat(64)),{modelSha256:canonical}),/canonical model mismatch/);
    assert.throws(()=>measurementRunsFromCsv(portable,{modelSha256:'f'.repeat(64)}),/canonical model mismatch/);
    assert.throws(()=>measurementRunsFromCsv(portable.replaceAll('canonical_model_sha256','other_identity'),context),/header/);
    assert.throws(()=>measurementRunsFromCsv(portable.replaceAll(context.rawModelSha256,'malformed'),context),/original model/);
    const blank=portable.replaceAll('"'+canonical+'"','""');
    assert.throws(()=>measurementRunsFromCsv(blank,context),/canonical model mismatch/);
});

test('portable CSV checks canonical identity on every row, including later declaration-free rows', () => {
    const imported=measurementRunsFromCsv(csv(),context);
    const portable=measurementRunsToCsv(imported).trimEnd().split('\r\n');
    portable[portable.length-1]=portable.at(-1).replace(canonical,'f'.repeat(64));
    assert.throws(()=>measurementRunsFromCsv(portable.join('\r\n'),context),/canonical model mismatch/);
});

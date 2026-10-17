// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// C8 (GUI half): the Sim Lab model rides in the project file as the `simLab`
// section of the Brickwright bundle (lib/bw-project-bundle.js), mirrored to
// one localStorage key, exactly as the circuit and the arena sandbox do.
//
// Checked through the REAL bundle writer and reader (attachBrickwrightState /
// extractBrickwrightState over a real .sb3 zip), not a re-implementation:
//   - a model saved with the project comes back, and serialize → save → load
//     → parse → serialize is byte-identical (plan C8 DoD);
//   - no model → no section; opening a project without one clears a stale model;
//   - a malformed section is refused by name (the load is refused, the old
//     state stays), and a malformed stored value is a listed refusal in the
//     pane's notes, never a throw.

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import JSZip from 'jszip';
import {parseModel, serializeModel} from '../overlay/scratch-gui/src/lib/bw-sim/model/ldraw-model.js';
import {catalogFrom} from '../overlay/scratch-gui/src/lib/bw-sim/sim-session.js';
import {
    SIM_LAB_STORAGE_KEY, simLabRecord, simLabRecordFromText, readSimLabStorage, isStorableName
} from '../overlay/scratch-gui/src/lib/bw-sim/model/sim-lab-persist.js';

const bundle = await import('../overlay/scratch-gui/src/lib/bw-project-bundle.js');

const PARTS = JSON.parse(readFileSync(new URL('../overlay/scratch-gui/src/lib/bw-sim/part-meta/parts.json', import.meta.url)));
const CATALOG = catalogFrom(PARTS);
const DRIVING_BASE = readFileSync(new URL('../overlay/scratch-gui/static/sim-lab/models/driving-base.ldr', import.meta.url), 'utf8');
// What the pane passes to serializeModel (sim-lab-pane.jsx, MODEL_TITLE).
const OPTS = {name: 'my-model.ldr', title: 'Sim Lab model'};

const storage = initial => {
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

const baseArchive = async () => {
    const zip = new JSZip();
    zip.file('project.json', JSON.stringify({
        targets: [{isStage: true, name: 'Stage', blocks: {}, costumes: [], sounds: []}],
        meta: {semver: '3.0.0'}
    }));
    return zip.generateAsync({type: 'nodebuffer'});
};

const toArrayBuffer = bytes => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);

/** Run fn with browser globals the bundle module touches, restoring them after. */
const withBrowser = async (initial, fn) => {
    global.localStorage = storage(initial);
    global.window = {dispatchEvent: () => {}};
    global.CustomEvent = class { constructor (type) { this.type = type; } };
    try {
        return await fn();
    } finally {
        delete global.localStorage;
        delete global.window;
        delete global.CustomEvent;
    }
};

/** Save with what `initial` holds in storage; return the sidecar document and the file's bytes. */
const save = async initial => withBrowser(initial, async () => {
    const blob = await bundle.attachBrickwrightState(new Blob([await baseArchive()]),
        {now: () => new Date('2026-10-17T00:00:00.000Z')});
    const bytes = Buffer.from(await blob.arrayBuffer());
    const zip = await JSZip.loadAsync(bytes);
    const entry = zip.file(bundle.BUNDLE_PATH);
    return {bytes, document: entry ? JSON.parse(await entry.async('text')) : null};
});

/** Open `bytes` into a browser whose storage holds `initial`; return the outcome and the storage after. */
const open = async (bytes, initial = {}) => withBrowser(initial, async () => {
    const result = await bundle.extractBrickwrightState(toArrayBuffer(bytes));
    return {result, after: global.localStorage.dump()};
});

/**
 * The reference driving base turned 30° about Y and shifted by a third of an
 * LDU: every rotation entry and most coordinates are then non-integers, which
 * is where a lossy number format would show.
 */
const turnedModel = () => {
    const {model, refusals} = parseModel(DRIVING_BASE, {catalog: CATALOG});
    assert.deepEqual(refusals, []);
    const c = Math.cos(Math.PI / 6);
    const s = Math.sin(Math.PI / 6);
    const R = [c, 0, s, 0, 1, 0, -s, 0, c];
    const mul = (a, b) => [0, 1, 2].flatMap(i => [0, 1, 2].map(j => a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j]));
    return {version: 1, parts: model.parts.map(p => ({...p,
        rotation: mul(R, p.rotation),
        position: [0, 1, 2].map(i => R[i * 3] * p.position[0] + R[i * 3 + 1] * p.position[1] + R[i * 3 + 2] * p.position[2] + 1 / 3)}))};
};

test('a model saved with the project comes back byte-identical (serialize → save → load → serialize)', async () => {
    const model = turnedModel();
    const text = serializeModel(model, OPTS);
    assert.match(text, /\.\d{6}/, 'the sample must exercise fractional numbers');
    const record = simLabRecordFromText(text, {name: OPTS.name, mat: 'line-oval'});

    const saved = await save({[SIM_LAB_STORAGE_KEY]: JSON.stringify(record)});
    assert.deepEqual(saved.document.state.simLab, {ldraw: text, name: 'my-model.ldr', mat: 'line-oval'},
        'the bundle carries the LDraw text, its name and the mat');

    // A different browser: nothing stored, an unrelated preference that must survive.
    const {result, after} = await open(saved.bytes, {'bw-theme': 'dark'});
    assert.equal(result.outcome, 'loaded');
    assert.equal(after['bw-theme'], 'dark');
    const {record: back, refusals} = readSimLabStorage(after[SIM_LAB_STORAGE_KEY]);
    assert.deepEqual(refusals, []);
    assert.equal(back.ldraw, text, 'the stored text is the saved text, byte for byte');
    assert.equal(back.mat, 'line-oval');

    // The pane opens the text (parseModel) and the next save serializes what it opened.
    const reopened = parseModel(back.ldraw, {catalog: CATALOG});
    assert.deepEqual(reopened.refusals, []);
    assert.equal(reopened.model.parts.length, model.parts.length);
    assert.equal(serializeModel(reopened.model, {name: back.name, title: OPTS.title}), text);

    // And a second save of the reopened project writes the same section again.
    const again = await save(after);
    assert.deepEqual(again.document.state.simLab, saved.document.state.simLab);
});

test('the shipped driving base round-trips under its own name', async () => {
    const {model} = parseModel(DRIVING_BASE, {catalog: CATALOG});
    const opts = {name: 'driving-base.ldr', title: OPTS.title};
    const text = serializeModel(model, opts);
    const saved = await save({[SIM_LAB_STORAGE_KEY]: JSON.stringify(simLabRecordFromText(text, {name: opts.name}))});
    assert.equal(saved.document.state.simLab.mat, undefined, 'no mat selected → no mat stored');
    const {after} = await open(saved.bytes);
    const {record} = readSimLabStorage(after[SIM_LAB_STORAGE_KEY]);
    assert.equal(record.name, 'driving-base.ldr');
    assert.equal(serializeModel(parseModel(record.ldraw, {catalog: CATALOG}).model, {name: record.name, title: opts.title}), text);
});

test('no model: nothing is written, and opening a project without one clears a stale model', async () => {
    // An empty Build scene serializes to a header with no part line: not a model.
    assert.equal(simLabRecordFromText(serializeModel({version: 1, parts: []}, OPTS), {name: OPTS.name}), null);

    const code = JSON.stringify({lang: 'pseudocode', code: 'DEVICE SPIKE'});
    const saved = await save({'bw-code-autosave': code});
    assert.ok(saved.document, 'the other sections are still saved');
    assert.equal('simLab' in saved.document.state, false, 'no simLab section without a model');

    const stale = JSON.stringify(simLabRecordFromText(serializeModel(turnedModel(), OPTS), {name: OPTS.name}));
    const {result, after} = await open(saved.bytes, {[SIM_LAB_STORAGE_KEY]: stale});
    assert.equal(result.outcome, 'loaded');
    assert.equal(after[SIM_LAB_STORAGE_KEY], undefined, 'the previous project\'s model must not leak into this one');
    assert.equal(after['bw-code-autosave'], code);
});

test('a malformed simLab section refuses the load by name and leaves the open project alone', async () => {
    const zip = await JSZip.loadAsync(await baseArchive());
    const writeSection = async simLab => {
        zip.file(bundle.BUNDLE_PATH, JSON.stringify({format: bundle.BUNDLE_FORMAT, version: bundle.BUNDLE_VERSION,
            state: {code: {lang: 'pseudocode', code: 'new'}, simLab}}));
        return zip.generateAsync({type: 'nodebuffer'});
    };
    const before = {'bw-code-autosave': JSON.stringify({lang: 'pseudocode', code: 'old'}),
        [SIM_LAB_STORAGE_KEY]: JSON.stringify({ldraw: DRIVING_BASE})};
    const cases = [
        [{ldraw: 42}, /simLab\.ldraw must be a string/],
        [{ldraw: '0 only a comment\r\n'}, /simLab\.ldraw places no part/],
        [{ldraw: DRIVING_BASE, mat: 'Line Oval!'}, /simLab\.mat must be a mat id/],
        [{ldraw: DRIVING_BASE, name: 'two\nlines'}, /simLab\.name must be one line/],
        [['not', 'an', 'object'], /simLab must be an object/],
        [{ldraw: `${DRIVING_BASE}0 ${'x'.repeat(1024 * 1024)}\r\n`}, /simLab exceeds/]
    ];
    for (const [simLab, reason] of cases) {
        const {result, after} = await open(await writeSection(simLab), before);
        assert.equal(result.outcome, 'invalid', JSON.stringify(simLab).slice(0, 80));
        assert.match(result.reason, reason);
        assert.deepEqual(after, before, 'a refused file must not touch the open project');
    }
});

test('a malformed stored value is a listed refusal, never a throw', () => {
    assert.deepEqual(readSimLabStorage(null), {record: null, refusals: []});
    for (const [raw, needle] of [['{bad json', /JSON/], ['42', /must be an object/],
        [JSON.stringify({ldraw: ''}), /places no part/], [JSON.stringify({ldraw: DRIVING_BASE, mat: 7}), /mat/]]) {
        const {record, refusals} = readSimLabStorage(raw);
        assert.equal(record, null);
        assert.equal(refusals.length, 1);
        assert.equal(refusals[0].code, 'project-model-unreadable');
        assert.match(refusals[0].message, needle);
    }
});

test('fields a newer writer adds are dropped; the known ones keep a fixed order', () => {
    const record = simLabRecord({future: {x: 1}, mat: 'plain', ldraw: DRIVING_BASE, name: 'a.ldr'});
    assert.deepEqual(Object.keys(record), ['ldraw', 'name', 'mat']);
    assert.equal(record.future, undefined);
    // A name the record cannot keep is left out of the record rather than failing the save.
    assert.equal(isStorableName('a\u0007b'), false);
    assert.deepEqual(simLabRecordFromText(DRIVING_BASE, {name: 'a\u0007b'}), {ldraw: DRIVING_BASE});
});

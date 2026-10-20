// Every model through every save format and back, compared as models: the
// Robot Lab's shipped models, the 2,054-part stress model and a fixed number of
// seeded random models go .ldr, .mpd, .io and the project's simLab record and
// come back with the same parts, colours, poses (to 1e-6 LDU), ports, ids,
// groups and steps — and the LDraw text byte for byte, as the Save as… docs
// promise. Random MPDs with nested sub-models placed several times flatten to
// exactly what placing every part by hand gives. On a failure the seed is in
// the message: `modelCase(seed)` rebuilds the case.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import JSZip from 'jszip';
import {openModelFile, saveModelFile} from '../overlay/scratch-gui/src/lib/bw-sim/model/model-file.js';
import {parseModel, serializeModel} from '../overlay/scratch-gui/src/lib/bw-sim/model/ldraw-model.js';
import {simLabRecordFromText, readSimLabStorage} from '../overlay/scratch-gui/src/lib/bw-sim/model/sim-lab-persist.js';
import {catalogFrom} from '../overlay/scratch-gui/src/lib/bw-sim/sim-session.js';
import {validatePlacedModel} from '../overlay/scratch-gui/src/lib/bw-sim/contracts.js';
import {stressModel} from '../scripts/lib/sim-lab-stress-model.mjs';
import {rng, randomModel, randomMpd, modelDifferences, ldconfigColours} from './fixtures/bw-sim/model-gen.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SIM = path.join(ROOT, 'overlay/scratch-gui/src/lib/bw-sim');
const MODELS_DIR = path.join(ROOT, 'overlay/scratch-gui/static/sim-lab/models');
const CATALOG = catalogFrom(JSON.parse(readFileSync(path.join(SIM, 'part-meta/parts.json'), 'utf8')));
const LDCONFIG = readFileSync(path.join(ROOT, 'overlay/scratch-gui/static/ldraw/LDConfig.ldr'), 'utf8');
const COLOURS = ldconfigColours(LDCONFIG);
const PARTS = [...CATALOG.keys()];
const OPTS = {name: 'my-model.ldr', title: 'Sim Lab model'};

const bundle = await import('../overlay/scratch-gui/src/lib/bw-project-bundle.js');

/** Every save format, as the pane uses it: save, then open the saved bytes, then parse. */
const throughFormat = async (model, format) => {
    if (format === 'sb3-record') {
        // The project's simLab record: stored as JSON (the bundle section / localStorage value).
        const record = simLabRecordFromText(serializeModel(model, OPTS), {name: OPTS.name, mat: 'plain'});
        const back = readSimLabStorage(JSON.stringify(record));
        assert.deepEqual(back.refusals, []);
        return back.record.ldraw;
    }
    const saved = await saveModelFile(model, format, OPTS);
    const bytes = typeof saved.data === 'string' ? new TextEncoder().encode(saved.data) : saved.data;
    const opened = await openModelFile(saved.filename, bytes);
    assert.deepEqual(opened.refusals, [], `${format}: the reader notes nothing`);
    return opened.text;
};
const FORMATS = ['ldr', 'mpd', 'io', 'sb3-record'];

/** Round-trip `model` through every format; return what differs (empty: nothing). */
const roundTrip = async (model, {catalog} = {}) => {
    const problems = [];
    const ldr = serializeModel(model, OPTS);
    for (const format of FORMATS) {
        const text = await throughFormat(model, format);
        const {model: back, refusals} = parseModel(text, {catalog});
        if (refusals.length) problems.push(`${format}: refusals ${JSON.stringify(refusals.slice(0, 3))}`);
        for (const d of modelDifferences(model, back)) problems.push(`${format}: ${d}`);
        const again = serializeModel(back, OPTS);
        if (again !== ldr) {
            const a = ldr.split('\r\n');
            const b = again.split('\r\n');
            const i = a.findIndex((l, k) => l !== b[k]);
            problems.push(`${format}: not byte-stable at line ${i + 1}: ${JSON.stringify(a[i])} vs ${JSON.stringify(b[i])}`);
        }
    }
    return problems;
};

const shipped = readdirSync(MODELS_DIR).filter(f => f.endsWith('.ldr')).sort();

test('every shipped model goes through .ldr, .mpd, .io and the project record unchanged, byte for byte', async () => {
    assert.ok(shipped.length >= 6, shipped.join());
    for (const file of shipped) {
        const {model, refusals} = parseModel(readFileSync(path.join(MODELS_DIR, file), 'utf8'), {catalog: CATALOG});
        assert.deepEqual(refusals, [], file);
        assert.deepEqual(validatePlacedModel(model, CATALOG), [], file);
        assert.deepEqual(await roundTrip(model, {catalog: CATALOG}), [], file);
    }
});

test('the 2,054-part stress model round-trips through every format, and through a real .sb3', async () => {
    const text = stressModel(readFileSync(path.join(MODELS_DIR, 'driving-base.ldr'), 'utf8'));
    const {model, refusals} = parseModel(text, {catalog: CATALOG});
    assert.deepEqual(refusals, []);
    assert.ok(model.parts.length > 2000, `${model.parts.length} parts`);
    assert.deepEqual(await roundTrip(model, {catalog: CATALOG}), []);

    // The real bundle writer and reader: the record inside an .sb3 archive and out again.
    const ldraw = serializeModel(model, OPTS);
    const record = simLabRecordFromText(ldraw, {name: OPTS.name});
    const values = new Map([['bw-sim-lab-model-v1', JSON.stringify(record)]]);
    global.localStorage = {
        get length () { return values.size; }, key: i => [...values.keys()][i] ?? null,
        getItem: k => (values.has(k) ? values.get(k) : null), setItem: (k, v) => values.set(k, String(v)), removeItem: k => values.delete(k)
    };
    global.window = {dispatchEvent: () => {}};
    global.CustomEvent = class { constructor (type) { this.type = type; } };
    try {
        const base = new JSZip();
        base.file('project.json', JSON.stringify({targets: [{isStage: true, name: 'Stage', blocks: {}, costumes: [], sounds: []}], meta: {semver: '3.0.0'}}));
        const blob = await bundle.attachBrickwrightState(new Blob([await base.generateAsync({type: 'nodebuffer'})]),
            {now: () => new Date('2026-10-18T00:00:00.000Z')});
        const sb3 = new Uint8Array(await blob.arrayBuffer());
        values.clear();
        const result = await bundle.extractBrickwrightState(sb3.buffer);
        assert.equal(result.outcome, 'loaded');
        const back = readSimLabStorage(values.get('bw-sim-lab-model-v1'));
        assert.equal(back.record.ldraw, ldraw, 'the .sb3 carries the text byte for byte');
        assert.deepEqual(modelDifferences(model, parseModel(back.record.ldraw, {catalog: CATALOG}).model), []);
    } finally {
        delete global.localStorage;
        delete global.window;
        delete global.CustomEvent;
    }
});

// A fixed number of cases from fixed seeds, so CI is deterministic and fast.
const RANDOM_CASES = 150;
const MPD_CASES = 150;
export const modelCase = seed => randomModel(rng(seed), {parts: PARTS, colours: COLOURS});
export const mpdCase = seed => randomMpd(rng(seed), {parts: PARTS, colours: COLOURS});

test(`${RANDOM_CASES} random models (catalogue parts, all colours incl. direct, 24 axis-aligned and arbitrary rotations, ports, ids, groups, steps) round-trip through every format`, async () => {
    const failures = [];
    for (let seed = 1; seed <= RANDOM_CASES; seed++) {
        const model = modelCase(seed);
        const problems = await roundTrip(model, {catalog: CATALOG});
        if (problems.length) failures.push(`seed ${seed}: ${problems.slice(0, 4).join('; ')}`);
    }
    assert.deepEqual(failures, []);
});

test(`${MPD_CASES} random MPDs: nested sub-models placed several times flatten to placing every part by hand`, () => {
    const failures = [];
    for (let seed = 1; seed <= MPD_CASES; seed++) {
        const {text, expected} = mpdCase(seed);
        const flat = parseModel(text, {catalog: CATALOG});
        const byHand = [...expected];
        if (flat.refusals.length) failures.push(`seed ${seed}: refusals ${JSON.stringify(flat.refusals.slice(0, 2))}`);
        const want = {version: 1, parts: byHand.map((p, i) => ({id: `x${i}`, ...p}))};
        const diff = modelDifferences(want, flat.model, {ids: false, tolerance: 1e-6});
        if (diff.length) failures.push(`seed ${seed}: ${diff.slice(0, 3).join('; ')}`);
        if (new Set(flat.model.parts.map(p => p.id)).size !== flat.model.parts.length) failures.push(`seed ${seed}: ids not unique`);
        // And the flattened model is a model like any other: it round-trips byte-stably.
        const ldr = serializeModel(flat.model, OPTS);
        if (serializeModel(parseModel(ldr, {catalog: CATALOG}).model, OPTS) !== ldr) failures.push(`seed ${seed}: flattened model not byte-stable`);
    }
    assert.deepEqual(failures, []);
});

// ---- minimal reproductions of what these tests found (2026-10-18) ----------------------

const I = '1 0 0 0 1 0 0 0 1';
const ids = text => parseModel(text).model.parts.map(p => p.id);

test('found: a part in colour 16 inside a sub-model takes the colour the sub-model is placed in', () => {
    const text = ['0 FILE a.ldr', `1 4 0 0 0 ${I} b.ldr`, `1 16 0 0 0 ${I} b.ldr`, '0 FILE b.ldr', `1 16 0 0 0 ${I} 32523.dat`, `1 1 0 0 0 ${I} 32523.dat`].join('\n');
    assert.deepEqual(parseModel(text).model.parts.map(p => p.color), [4, 1, 16, 1], 'placing by hand: red, blue; then main colour, blue');
});

test('found: a direct colour is written as 0x2RRGGBB (other programs read only that), and reads back', () => {
    const model = {version: 1, parts: [{id: 'a', part: '32523.dat', color: 0x2ff8000, position: [0, 0, 0], rotation: [1, 0, 0, 0, 1, 0, 0, 0, 1]}]};
    const text = serializeModel(model);
    assert.match(text, /^1 0x2FF8000 0 0 0 /m);
    assert.equal(parseModel(text).model.parts[0].color, 0x2ff8000);
});

test('found: a sheared matrix with determinant 1 is decoration, not a part; a rotation written with three decimals opens as the rotation it is', () => {
    const shear = parseModel(`1 4 0 0 0 1 5 0 0 1 0 0 0 1 32523.dat\n`);
    assert.deepEqual([shear.model.parts.length, shear.refusals.map(r => r.code), shear.model.decor.length], [0, [], 1]);
    // 42022 Hot Rod (OMR, MLCad): rows of length² 0.9989 — refused before as det 0.9989.
    const mlcad = parseModel(`1 4 0 0 0 0.674 -0.738 0 -0.738 -0.674 0 0 0 -1 32523.dat\n`);
    assert.deepEqual(mlcad.refusals, []);
    const R = mlcad.model.parts[0].rotation;
    for (let r = 0; r < 3; r++) assert.ok(Math.abs(Math.hypot(R[r * 3], R[r * 3 + 1], R[r * 3 + 2]) - 1) < 1e-9, 'made orthonormal');
    assert.ok(Math.abs(R[0] - 0.674) < 1e-3 && Math.abs(R[1] + 0.738) < 1e-3, 'and still the rotation the file meant');
    // Our own six-decimal rotations are kept exactly as written (byte-stable round trips).
    const own = `1 4 0 0 0 0.866025 0 0.5 0 1 0 -0.5 0 0.866025 32523.dat\n`;
    assert.deepEqual(parseModel(own).model.parts[0].rotation, [0.866025, 0, 0.5, 0, 1, 0, -0.5, 0, 0.866025]);
});

test('found: a garbled number or colour refuses the line instead of reading half of it', () => {
    for (const line of [`1 4 12abc 0 0 ${I} 32523.dat`, `1 4x 0 0 0 ${I} 32523.dat`, `1 4 0x10 0 0 ${I} 32523.dat`,
        `1 4 0 0 0 1 0 0 0 1 0 0 0 1e 32523.dat`, `1 -1 0 0 0 ${I} 32523.dat`, `1 4 1e400 0 0 ${I} 32523.dat`]) {
        const {model, refusals} = parseModel(`${line}\n`);
        assert.deepEqual([model.parts.length, refusals.map(r => r.code)], [0, ['unparsable']], line);
    }
    assert.deepEqual(parseModel(`1 4 +.5e+1 -2. 1E2 ${I} 32523.dat\n`).model.parts[0].position, [5, -2, 100], 'LDraw number forms still read');
    assert.deepEqual(parseModel(`1 4 2000000 0 0 ${I} 32523.dat\n`).refusals.map(r => r.code), ['out-of-range']);
});

test('found: a refused line does not pass its group, port or id on to the next part', () => {
    const text = ['0 !BW GROUP g Wheels', '0 !BW IN g', '0 !BW PORT A', '0 !BW ID x', `1 4 0 0 0 -1 0 0 0 1 0 0 0 1 32523.dat`, `1 4 0 0 0 ${I} 32523.dat`].join('\n');
    const {model} = parseModel(text);
    assert.deepEqual(model.groups[0].parts, [], 'the mirrored part was refused; the next one is not in its group');
    assert.deepEqual([model.parts[0].id, model.parts[0].port], ['p1', undefined]);
});

test('found: a generated id never takes an id the file gives a later part', () => {
    assert.deepEqual(ids([`1 4 0 0 0 ${I} 32523.dat`, `1 4 0 0 0 ${I} 32523.dat`, '0 !BW ID p2', `1 4 0 0 0 ${I} 32523.dat`].join('\n')), ['p1', 'p3', 'p2']);
    assert.deepEqual(parseModel(['0 !BW ID p2', `1 4 0 0 0 ${I} 32523.dat`, `1 4 0 0 0 ${I} 32523.dat`].join('\n')).refusals, []);
});

test('found: an embedded part (a .dat FILE section) is a part, refused once by name, not opened into its primitives', () => {
    const text = ['0 FILE m.ldr', `1 4 0 0 0 ${I} my part.dat`, `1 4 0 0 0 ${I} 32523.dat`, '0 FILE my part.dat', '0 !LDRAW_ORG Unofficial_Part',
        `1 16 0 0 0 ${I} stud.dat`, `1 16 0 0 0 ${I} 32523.dat`].join('\n');
    const {model, refusals} = parseModel(text, {catalog: CATALOG});
    assert.deepEqual(model.parts.map(p => p.part), ['32523.dat']);
    assert.deepEqual(refusals.map(r => [r.code, r.line]), [['unknown-part', 2]]);
    assert.match(refusals[0].message, /my part\.dat/);
    // A sub-model named .ldr with `!LDRAW_ORG Model` is still opened up.
    assert.equal(parseModel(text.replace(/my part\.dat/g, 'sub.ldr').replace('Unofficial_Part', 'Model'), {catalog: CATALOG}).model.parts.length, 2);
});

test('found: of two FILE sections with one name the first is used, so a later one cannot replace the main model', () => {
    const text = ['0 FILE m.ldr', `1 4 0 0 0 ${I} 32523.dat`, '0 FILE m.ldr', `1 1 0 0 0 ${I} 32524.dat`, `1 1 0 0 0 ${I} 32524.dat`].join('\n');
    assert.deepEqual(parseModel(text).model.parts.map(p => p.part), ['32523.dat']);
});

test('found: a damaged ZIP is refused by name (not-a-zip), never JSZip\'s own error', async () => {
    const io = (await saveModelFile(modelCase(3), 'io')).data;
    const bad = Uint8Array.from(io);
    bad[40] ^= 0xff; // inside the compressed model.ldr
    await assert.rejects(openModelFile('m.io', bad), e => e.code === 'not-a-zip');
    const garbledName = Uint8Array.from(io);
    const cd = garbledName.length - 22 - 46 - 'model.ldr'.length; // the central directory's name of the one entry
    garbledName[cd + 46] = 0x4e; // "Nodel.ldr" in the directory, "model.ldr" in the local header
    await assert.rejects(openModelFile('m.lxf', garbledName, {ldconfig: LDCONFIG}), e => ['not-a-zip', 'lxf-no-lxfml'].includes(e.code));
});

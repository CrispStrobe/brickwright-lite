// The Robot Lab's model files (lib/bw-sim/model/model-file.js): LDraw .ldr/.mpd,
// BrickLink Studio .io and LEGO Digital Designer .lxf. Fixtures are made for
// these tests (test/fixtures/bw-sim/interop/: a hand-written LXFML zipped into
// an .lxf, and a ZIP encrypted with a password of our own) — no third-party model.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import JSZip from 'jszip';
import {
    openModelFile, saveModelFile, readStudioIo, writeStudioIo, zipDirectory, serializeMpd, mergeImportIssues,
    ModelFileError, OPEN_ACCEPT, SAVE_FORMATS, formatOf
} from '../overlay/scratch-gui/src/lib/bw-sim/model/model-file.js';
import {parseLxfml} from '../overlay/scratch-gui/src/lib/bw-sim/model/lxf-model.js';
import {lddColours} from '../overlay/scratch-gui/src/lib/bw-sim/model/ldd-parts.js';
import {parseModel, serializeModel} from '../overlay/scratch-gui/src/lib/bw-sim/model/ldraw-model.js';
import {catalogFrom} from '../overlay/scratch-gui/src/lib/bw-sim/sim-session.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SIM = path.join(ROOT, 'overlay/scratch-gui/src/lib/bw-sim');
const FIX = path.join(ROOT, 'test/fixtures/bw-sim');
const LDCONFIG = readFileSync(path.join(ROOT, 'overlay/scratch-gui/static/ldraw/LDConfig.ldr'), 'utf8');
const CATALOG = catalogFrom(JSON.parse(readFileSync(path.join(SIM, 'part-meta/parts.json'), 'utf8')));
const PANE = readFileSync(path.join(ROOT, 'overlay/scratch-gui/src/components/tw-pseudocode/sim-lab-pane.jsx'), 'utf8');
const bytes = file => new Uint8Array(readFileSync(path.join(FIX, file)));
const text = file => readFileSync(path.join(FIX, file), 'utf8');
const MODELS = ['driving-base.ldr', 'driving-base-steps.ldr'];

const rejects = (promise, code) => assert.rejects(promise, e => e instanceof ModelFileError && e.code === code, `expected ${code}`);

test('ldr → io → ldr is byte-stable, and the .io is a plain ZIP whose model.ldr is the .ldr save', async () => {
    for (const file of MODELS) {
        const model = parseModel(text(file)).model;
        const ldr = serializeModel(model, {name: 'my-model.ldr', title: 'T'});
        const io = await saveModelFile(model, 'io', {name: 'my-model.ldr', title: 'T'});
        assert.equal(io.filename, 'my-model.io');
        assert.equal(io.mime, 'application/zip');
        // Read back with JSZip directly, not with our reader.
        const zip = await JSZip.loadAsync(io.data);
        assert.deepEqual(Object.keys(zip.files), ['model.ldr'], `${file}: one entry`);
        assert.equal(await zip.file('model.ldr').async('string'), ldr, `${file}: model.ldr is the .ldr text byte for byte`);
        assert.equal(zipDirectory(io.data).encrypted, false);
        // And through the Robot Lab's own reader, then the LDraw round trip.
        const opened = await openModelFile('my-model.io', io.data);
        assert.equal(opened.text, ldr);
        assert.equal(opened.name, 'my-model.ldr');
        assert.deepEqual(opened.refusals, []);
        assert.equal(serializeModel(parseModel(opened.text).model, {name: 'my-model.ldr', title: 'T'}), ldr, `${file}: ldr → io → ldr`);
        // The same model writes the same bytes (fixed entry dates).
        assert.deepEqual((await saveModelFile(model, 'io', {name: 'my-model.ldr', title: 'T'})).data, io.data);
    }
});

test('ldr → mpd → ldr is byte-stable (ids, ports, groups and steps survive the FILE wrapper)', async () => {
    for (const file of MODELS) {
        const model = parseModel(text(file)).model;
        const ldr = serializeModel(model, {name: 'm.ldr', title: 'T'});
        const mpd = await saveModelFile(model, 'mpd', {name: 'm.ldr', title: 'T'});
        assert.equal(mpd.filename, 'm.mpd');
        assert.match(mpd.data, /^0 FILE m\.ldr\r\n/);
        assert.equal(mpd.data, serializeMpd(model, {name: 'm.ldr', title: 'T'}));
        const back = parseModel(mpd.data);
        assert.deepEqual(back.refusals, []);
        assert.equal(serializeModel(back.model, {name: 'm.ldr', title: 'T'}), ldr, `${file}: ldr → mpd → ldr`);
    }
    assert.ok(parseModel(text('driving-base-steps.ldr')).model.steps.length > 1, 'the steps fixture has steps to lose');
});

test('a password-protected .io is refused cleanly, before anything tries to decrypt it', async () => {
    const enc = bytes('interop/studio-encrypted.io');
    assert.equal(zipDirectory(enc).encrypted, true, 'the fixture really is encrypted');
    assert.deepEqual(zipDirectory(enc).names, ['model.ldr']);
    await rejects(openModelFile('old-studio.io', enc), 'io-encrypted');
});

test('broken and foreign files are refused by name, not opened half-way', async () => {
    await rejects(openModelFile('x.io', new TextEncoder().encode('0 not a zip\r\n')), 'not-a-zip');
    const noModel = new JSZip();
    noModel.file('model2.ldr', '1 15 0 0 0 1 0 0 0 1 0 0 0 1 3001.dat\r\n');
    await rejects(openModelFile('x.io', await noModel.generateAsync({type: 'uint8array'})), 'io-no-model');
    await rejects(openModelFile('x.lxf', await noModel.generateAsync({type: 'uint8array'}), {ldconfig: LDCONFIG}), 'lxf-no-lxfml');
    await rejects(openModelFile('x.stl', new Uint8Array(4)), 'unsupported-format');
    const v4 = text('interop/IMAGE100.LXFML').replace('versionMajor="5"', 'versionMajor="4"');
    await rejects(openModelFile('old.lxf', new TextEncoder().encode(v4), {ldconfig: LDCONFIG}), 'lxf-version');
    await rejects(openModelFile('x.lxf', new TextEncoder().encode('<html></html>'), {ldconfig: LDCONFIG}), 'lxf-unreadable');
});

test('an .io line placing a Studio-only part (CustomParts/) is refused as such; other unknown parts as unknown', async () => {
    const zip = new JSZip();
    const ldr = ['0 Studio-shaped test model', '0 Name: model.ldr',
        '1 71 0 0 0 1 0 0 0 1 0 0 0 1 32523.dat',
        '1 4 0 -20 0 1 0 0 0 1 0 0 0 1 m1234abcd_studio.dat',
        '1 4 0 -40 0 1 0 0 0 1 0 0 0 1 973.dat', ''].join('\r\n'); // a minifig torso: not a Robot Lab part
    zip.file('model.ldr', ldr);
    zip.file('model2.ldr', 'not read');
    zip.file('CustomParts/parts/m1234abcd_studio.dat', '0 a Studio part\r\n');
    zip.file('CustomParts/p/some-primitive.dat', '0 a primitive\r\n');
    const io = await readStudioIo(await zip.generateAsync({type: 'uint8array'}));
    assert.equal(io.text, ldr);
    assert.deepEqual(io.refusals.map(r => [r.code, r.line]), [['studio-only-part', 4]]);
    assert.ok(!CATALOG.has('973.dat'), 'the test needs a part the catalogue does not have');
    const parsed = parseModel(io.text, {catalog: CATALOG});
    assert.deepEqual(parsed.model.parts.map(p => p.part), ['32523.dat']);
    assert.deepEqual(parsed.refusals.map(r => [r.code, r.line]), [['unknown-part', 4], ['unknown-part', 5]]);
    assert.deepEqual(mergeImportIssues(io.refusals, parsed.refusals).map(r => [r.code, r.line]),
        [['studio-only-part', 4], ['unknown-part', 5]], 'line 4 is said once, as the Studio part it is');
});

test('a hand-made .lxf opens with its parts at poses worked out by hand from the geometry rules', async () => {
    const lxf = bytes('interop/interop-fixture.lxf');
    const zip = await JSZip.loadAsync(lxf);
    assert.equal(await zip.file('IMAGE100.LXFML').async('string'), text('interop/IMAGE100.LXFML'), 'the .lxf holds the hand-written LXFML');
    // Without the catalogue no part can be placed: there is no recorded frame table (model/ldd-parts.js).
    const bare = await openModelFile('fixture.lxf', lxf, {ldconfig: LDCONFIG, title: 'T'});
    assert.equal(parseModel(bare.text, {catalog: CATALOG}).model.parts.length, 0);
    const opened = await openModelFile('fixture.lxf', lxf, {ldconfig: LDCONFIG, title: 'T', catalog: CATALOG});
    assert.equal(opened.name, 'fixture.ldr');
    const {model, refusals} = parseModel(opened.text, {catalog: CATALOG});
    assert.deepEqual(refusals, []);
    // Worked out by hand (lxf-model.js: R = F·B·Rn·F, p = 25·F·(b − B·Rn·t), F = diag(1,−1,−1)) with the frames
    // ldd-frame.js works out from each part's connectors:
    //  - beam 3 (32523: holes at z = −20, 0, 20, axis y), identity bone. The Technic beam rule: LDD z along the holes
    //    in LDD's sense (LDraw +y), LDD x from the end hole (z = 20) to the next (−z), origin at the end hole's
    //    LDD +z end: o = (0, 10, 20). So M = [ex ey ez] = [(0,0,−1) (−1,0,0) (0,1,0)]; with an identity bone the
    //    part's rotation is F·Mᵀ = [0 0 −1; 1 0 0; 0 −1 0] and its position −R·o = (20, 0, 10): the beam along x
    //    from x = 0 to 40 — LDD's own frame for this beam puts it there too, turned half about its row (a beam
    //    is the same so), without LDD's 0.02-unit sub-offset.
    //  - axle 4 (3705, along x, 80 long), bone = 90° about y, b = (1.6, 0.4, 0.8): R = 180° about y,
    //    p = (0, −10, −20) — the same axle as LDD's own frame puts it, turned end for end.
    //  - gear 24 (3648), b = (0, 0, 2): R = I, p = (0, 0, −40).
    //  - brick 3001, b = (0, 2, 0): the stud-grid rule, R = I; its first stud cell's underside 2 LDD units up.
    // Colours from LDConfig's LEGOID comments: 194 → 71, 26 → 0, 21 → 4; 999 has none → 71 with a warning.
    const I = [1, 0, 0, 0, 1, 0, 0, 0, 1];
    assert.deepEqual(model.parts.map(p => [p.part, p.color, p.position, p.rotation]), [
        ['32523.dat', 71, [20, 0, 10], [0, 0, -1, 1, 0, 0, 0, -1, 0]],
        ['3705.dat', 0, [0, -10, -20], [-1, 0, 0, 0, 1, 0, 0, 0, -1]],
        ['3648.dat', 71, [0, 0, -40], I],
        ['3001.dat', 4, [30, -74, 10], I]
    ]);
    assert.deepEqual(opened.refusals.map(r => [r.code, r.design, r.severity || 'error']), [
        ['lxf-derived-frame', '32523', 'warning'],
        ['lxf-derived-frame', '3705', 'warning'],
        ['lxf-unknown-design', '64290', 'error'], // a newer mould number: no catalogue part has it
        ['lxf-unknown-material', '3648', 'warning'],
        ['lxf-derived-frame', '3648', 'warning'],
        ['lxf-derived-frame', '3001', 'warning'],
        ['lxf-unknown-design', '54696', 'error'],
        ['lxf-bad-transform', '2780', 'error']
    ]);
});

test('colours: an LDD material is the LEGO colour number LDConfig writes as LEGOID', () => {
    const map = lddColours(LDCONFIG);
    // Spot checks against the file's own lines, read independently here.
    for (const [lego, name] of [[21, 'Red'], [26, 'Black'], [23, 'Blue'], [194, 'Light_Bluish_Grey'], [1, 'White'], [426, 'White']]) {
        const block = LDCONFIG.split(/\r?\n/);
        const i = block.findIndex(l => new RegExp(`LEGOID[\\d\\s/]*\\b${lego}\\b[\\d\\s/]*-`).test(l));
        assert.ok(i >= 0, `LEGOID ${lego} is in LDConfig`);
        const code = Number(/CODE\s+(\d+)/.exec(block[i + 1])[1]);
        assert.match(block[i + 1], new RegExp(`!COLOUR ${name}\\b`));
        assert.equal(map.get(lego), code, `LEGO ${lego}`);
    }
    assert.ok(map.size > 100, `${map.size} colours`);
});

test('the pane offers what the module supports, and words every whole-file refusal in English and German', () => {
    assert.equal(OPEN_ACCEPT, '.ldr,.mpd,.io,.lxf,.lcd');
    assert.match(PANE, new RegExp(`const OPEN_ACCEPT = '${OPEN_ACCEPT.replace(/\./g, '\\.')}';`));
    assert.match(PANE, new RegExp(`const SAVE_FORMATS = \\[${SAVE_FORMATS.map(f => `'${f}'`).join(', ')}\\];`));
    assert.deepEqual(['a.LDR', 'b.mpd', 'c.io', 'd.lxf', 'f.LCD', 'e.txt'].map(formatOf), ['ldr', 'mpd', 'io', 'lxf', 'lcd', null]);
    const sources = ['model/model-file.js', 'model/lxf-model.js', 'model/lcd-model.js'].map(f => readFileSync(path.join(SIM, f), 'utf8')).join('\n');
    const codes = new Set([...sources.matchAll(/new (?:ModelFile|Lxf|Lcd)Error\('([a-z-]+)'/g)].map(m => m[1]));
    assert.ok(codes.size >= 7, [...codes].join());
    for (const code of codes) {
        assert.equal(PANE.split(`'${code}':`).length - 1, 2, `${code}: one sentence per language in the pane's fileErrors`);
    }
});

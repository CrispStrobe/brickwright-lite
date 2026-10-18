// Real model files written by other people with other programs (test/fixtures/model-files/,
// sources and licences in SOURCES.md there): three LDraw OMR Technic sets as MPDs with
// nested sub-models. What each must open to is written down here from the file text, not
// from the reader: the leaf part count (counted section by section through the FILE
// structure), and a few named parts placed by hand (the sub-model's placement applied to
// the part's line). Parts the Robot Lab does not know are refused by name, line by line;
// the rest opens. Then each opened model goes through every save format and back.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {openModelFile, saveModelFile} from '../overlay/scratch-gui/src/lib/bw-sim/model/model-file.js';
import {parseModel, serializeModel} from '../overlay/scratch-gui/src/lib/bw-sim/model/ldraw-model.js';
import {catalogFrom} from '../overlay/scratch-gui/src/lib/bw-sim/sim-session.js';
import {validatePlacedModel} from '../overlay/scratch-gui/src/lib/bw-sim/contracts.js';
import {modelDifferences} from './fixtures/bw-sim/model-gen.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'test/fixtures/model-files');
const CATALOG = catalogFrom(JSON.parse(readFileSync(path.join(ROOT, 'overlay/scratch-gui/src/lib/bw-sim/part-meta/parts.json'), 'utf8')));
const SOURCES = readFileSync(path.join(DIR, 'SOURCES.md'), 'utf8');

/**
 * What each file must open to. `leaves`: type-1 lines that are parts, counted through the
 * FILE structure (a sub-model placed twice counts twice; an embedded `.dat` part counts as
 * one part). `placed`: parts worked out by hand — [line of the part, part, colour, position,
 * rotation] in the main model's frame.
 */
const EXPECTED = {
    // 42022 Hot Rod (MLCad-style header: ROTATION CENTER/CONFIG). 24 sections, 3 deep.
    // Rotations are written with three decimals: Sub 02 is placed (line 145) at (70, 0, −300)
    // with R = [0.674 −0.738 0; −0.738 −0.674 0; 0 0 −1], whose rows have length² 0.9989 —
    // a rotation to the file's precision, not a scale. Its line 198 puts 59443 at (0, 0, −30):
    // R·(0, 0, −30) = (0, 0, 30), so (70, 0, −270); line 200 at (0, 0, −270): (70, 0, −30).
    '42022-1.mpd': {
        leaves: 414, sections: 24,
        placed: [
            [12, '99008.dat', 19, [0, 0, 0], [1, 0, 0, 0, 1, 0, 0, 0, 1]],
            [198, '59443.dat', 0, [70, 0, -270], [0.674, -0.738, 0, -0.738, -0.674, 0, 0, 0, -1]],
            [200, '59443.dat', 0, [70, 0, -30], [0.674, -0.738, 0, -0.738, -0.674, 0, 0, 0, -1]]
        ]
    },
    // 42032 Compact Tracked Loader (LDCad 1.4: `0 !LDCAD GENERATED`). 14 sections, 4 deep,
    // with an embedded unofficial part `42032 - 33299b.dat` (placed on lines 103, 110, 231,
    // 236) built from primitives and a sub-file named with a backslash. seat.ldr is placed
    // (line 25) in colour 1 at (−20, −153, 80) without rotation: its line 148 (32526 at
    // (0, −20, −60)) lands at (−20, −173, 20), its line 152 (32523 at (20, 60, −80), colour 71)
    // at (0, −93, 0).
    '42032-1.mpd': {
        leaves: 251, sections: 14,
        embedded: {name: '42032 - 33299b.dat', lines: [103, 110, 231, 236]},
        placed: [
            [148, '32526.dat', 1, [-20, -173, 20], [0, -1, 0, 0, 0, 1, -1, 0, 0]],
            [152, '32523.dat', 71, [0, -93, 0], [0, 1, 0, -1, 0, 0, 0, 0, 1]]
        ]
    },
    // 42034 Quad Bike (no program named). 8 sections, 2 deep. side1.ldr is placed (line 81) in
    // colour 72 at (−180, −118.528, −0.1771) with R1 = [1 0 0; 0 −0.3912 −0.9203; 0 0.9203 −0.3912].
    // Its line 225 (6558, colour 1, at (20, 0, 0)) lands at (−160, −118.528, −0.1771) turned by R1;
    // its line 231 (2780, colour 0, at (30, 0, −80), R = diag(−1, 1, −1)): R1·(30, 0, −80) =
    // (30, 73.624, 31.296), so (−150, −44.904, 31.1189), turned by R1·diag(−1, 1, −1).
    '42034-1.mpd': {
        leaves: 147, sections: 8,
        placed: [
            [225, '6558.dat', 1, [-160, -118.528, -0.1771], [1, 0, 0, 0, -0.3912, -0.9203, 0, 0.9203, -0.3912]],
            [231, '2780.dat', 0, [-150, -44.904, 31.1189], [-1, 0, 0, 0, -0.3912, 0.9203, 0, 0.9203, 0.3912]]
        ]
    }
};

const near = (a, b, tolerance) => a.every((v, i) => Math.abs(v - b[i]) <= tolerance);

for (const [file, want] of Object.entries(EXPECTED)) {
    test(`${file} (LDraw OMR) opens to the model written down by hand; unknown parts are refused by name`, async () => {
        const bytes = new Uint8Array(readFileSync(path.join(DIR, file)));
        const sha = createHash('sha256').update(bytes).digest('hex');
        assert.ok(SOURCES.includes(sha), `${file}: its sha256 ${sha} is recorded in SOURCES.md`);
        const text = new TextDecoder().decode(bytes);
        assert.equal((text.match(/^0 FILE /gm) || []).length, want.sections, 'sections');

        const opened = await openModelFile(file, bytes);
        // Without a catalogue every leaf is placed: the flattening alone.
        const all = parseModel(opened.text);
        assert.equal(all.model.parts.length, want.leaves, 'every leaf part once per placement');
        assert.deepEqual(all.refusals, [], 'nothing refused when every part is accepted');

        const {model, refusals} = parseModel(opened.text, {catalog: CATALOG});
        assert.deepEqual(validatePlacedModel(model, CATALOG), []);
        const unknown = refusals.filter(r => r.code === 'unknown-part');
        assert.deepEqual(refusals.filter(r => r.code !== 'unknown-part'), [], 'only unknown parts are refused');
        assert.equal(model.parts.length + unknown.length, want.leaves, 'every leaf is opened or refused');
        assert.ok(model.parts.length >= want.leaves / 2, `${model.parts.length} of ${want.leaves} parts open`);
        const lines = text.split(/\r?\n/);
        for (const r of unknown) {
            const name = /'(.+)'/.exec(r.message)[1];
            assert.ok(!CATALOG.has(name.toLowerCase().replace(/\\/g, '/')), `${name} is refused although the catalogue has it`);
            assert.ok(lines[r.line - 1].trim().endsWith(name), `refusal names the part of its line ${r.line}`);
        }
        if (want.embedded) {
            const named = unknown.filter(r => r.message.includes(want.embedded.name));
            assert.deepEqual(named.map(r => r.line).sort((a, b) => a - b), want.embedded.lines, 'the embedded part, once per placement');
            assert.ok(!unknown.some(r => /\b(?:2-4\w+|4-4\w+|1-4\w+|axl3hole|connect|npeghol\d)\.dat/.test(r.message)),
                'an embedded part is not opened up into its primitives');
        }
        for (const [line, part, colour, position, rotation] of want.placed) {
            const hit = model.parts.find(p => p.part === part && near(p.position, position, 1e-3));
            assert.ok(hit, `line ${line}: ${part} at ${position}`);
            assert.equal(hit.color, colour, `line ${line}: colour`);
            assert.ok(near(hit.rotation, rotation, 2e-3), `line ${line}: rotation ${hit.rotation} vs ${rotation}`);
        }

        // The opened model through every save format and back, byte-stable.
        const ldr = serializeModel(model, {name: 'omr.ldr'});
        for (const format of ['ldr', 'mpd', 'io']) {
            const saved = await saveModelFile(model, format, {name: 'omr.ldr'});
            const data = typeof saved.data === 'string' ? new TextEncoder().encode(saved.data) : saved.data;
            const back = parseModel((await openModelFile(saved.filename, data)).text, {catalog: CATALOG});
            assert.deepEqual(back.refusals, [], format);
            assert.deepEqual(modelDifferences(model, back.model), [], format);
            assert.equal(serializeModel(back.model, {name: 'omr.ldr'}), ldr, `${format}: byte-stable`);
        }
    });
}

test('SOURCES.md names every fixture with author, licence and URL, and the files keep their licence line', () => {
    for (const file of Object.keys(EXPECTED)) {
        assert.match(SOURCES, new RegExp(file.replace('.', '\\.')));
        const text = readFileSync(path.join(DIR, file), 'utf8');
        assert.match(text, /^0 !LICENSE .*CCAL version 2\.0/m, `${file}: licence line kept`);
        assert.match(text, /^0 Author: /m, `${file}: author line kept`);
    }
    assert.match(SOURCES, /library\.ldraw\.org\/library\/omr\//);
    assert.match(SOURCES, /CC BY 2\.0/);
});

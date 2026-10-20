// LDD frames from LDraw geometry (lib/bw-sim/model/ldd-frame.js), the .lxf import's
// fallback that uses them (model/lxf-model.js), and the evaluator that scores the rule
// against an LDD↔LDraw mapping file (scripts/eval-ldd-frames.mjs). ldraw.xml itself
// is not in the repository (no licence): the evaluator runs here on a small mapping
// file written for this test, whose rows are worked out by hand from the vendored
// LDraw parts. docs/ROBOT-LAB-LDD-FRAMES.md has the method and the measured scores.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {lddFrameOf, rowOfFrame, collidersBottom, DERIVED_RULES} from '../overlay/scratch-gui/src/lib/bw-sim/model/ldd-frame.js';
import {lddToLdraw, parseLxfml} from '../overlay/scratch-gui/src/lib/bw-sim/model/lxf-model.js';
import {LDD_PARTS} from '../overlay/scratch-gui/src/lib/bw-sim/model/ldd-parts.js';
import {
    parseLdrawXml, frameOfRow, compareFrames, evaluate, tally, splitOf, symmetriesOf
} from '../scripts/eval-ldd-frames.mjs';
import {libReader} from '../scripts/derive-part-meta.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PARTS = JSON.parse(readFileSync(path.join(ROOT, 'overlay/scratch-gui/src/lib/bw-sim/part-meta/parts.json'), 'utf8')).parts;
const CATALOG = new Map(PARTS.map(p => [p.part, p]));
const LIB = libReader(path.join(ROOT, 'overlay/scratch-gui/static/ldraw'));
const F = [1, 0, 0, 0, -1, 0, 0, 0, -1];
const near = (a, b, eps = 1e-6) => a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) <= eps);

test('a mapping row is the LDD frame inside the LDraw part: o = 25·F·t, M = F·Rot(axis, angle)', () => {
    // Worked by hand from the semantics (LeoCAD lc_lxf.cpp): an identity row with t = (−1.2, −0.96, 0.4)
    // puts LDD's origin 30 LDU along −x, 24 LDU down (LDraw +y) and 10 LDU along −z of the LDraw origin.
    const rows = parseLdrawXml(`<LDrawMapping>
        <!-- <Transformation ldraw="commented.dat" tx="9" ty="9" tz="9" ax="1" ay="0" az="0" angle="0" /> -->
        <Transformation ldraw="3001.dat" tx="-1.2" ty="-0.96" tz="0.4" ax="1" ay="0" az="0" angle="0" />
        <Transformation ldraw="4519.dat" tx="1.2" ty="0" tz="0" ax="0" ay="1" az="0" angle="1.570796" />
        <Transformation ldraw="4519.dat" tx="7" ty="7" tz="7" ax="0" ay="1" az="0" angle="0" />
    </LDrawMapping>`);
    assert.deepEqual([...rows.keys()], ['3001.dat', '4519.dat'], 'comments are skipped; a repeated part keeps its first row');
    const brick = frameOfRow(rows.get('3001.dat'));
    assert.ok(near(brick.o, [-30, 24, -10]), String(brick.o));
    assert.ok(near(brick.M, F));
    // A quarter turn about LDD y: LDD x (column 0) goes to LDraw +z, LDD z (column 2) to LDraw +x; the
    // origin is 1.2 LDD units = 30 LDU along LDraw +x: the axle's +x end.
    const axle = frameOfRow(rows.get('4519.dat'));
    assert.ok(near(axle.o, [30, 0, 0]), String(axle.o));
    assert.ok(near(axle.M, [0, 0, 1, 0, -1, 0, 1, 0, 0], 1e-6), String(axle.M));
});

test('rowOfFrame is the row lxf-model applies: a recorded row and its frame place a bone identically', () => {
    const bone = [0, 0, -1, 0, 1, 0, 1, 0, 0, 1.6, 0.4, 0.8]; // a quarter turn about y, moved
    for (const [design, row] of LDD_PARTS) {
        const t = row.translation;
        const frame = frameOfRow({tx: t[0], ty: t[1], tz: t[2], axis: row.axis, angle: row.angle});
        const a = lddToLdraw(bone, row);
        const b = lddToLdraw(bone, rowOfFrame(frame));
        assert.ok(near(a.rotation, b.rotation, 1e-5) && near(a.position, b.position, 1e-3), design);
    }
});

test('the grid rule on a 2 x 4 brick: LDD y up, origin at the bottom of the −x −z corner cell', () => {
    // Built here, not read from the catalogue: studs on y = 0 at x ∈ {±10, ±30}, z = ±10, underside at y = 24.
    const connectors = [];
    for (const x of [-30, -10, 10, 30]) for (const z of [-10, 10]) {
        connectors.push({type: 'stud', position: [x, 0, z], axis: [0, -1, 0]});
        connectors.push({type: 'antistud', position: [x, 24, z], axis: [0, -1, 0]});
    }
    const f = lddFrameOf({category: 'brick', connectors});
    assert.equal(f.rule, 'grid');
    assert.ok(near(f.o, [-30, 24, -10]), String(f.o));
    assert.ok(near(f.M, F));
    // Without an underside the height comes from the given bottom, on the plate grid below the studs.
    const studsOnly = connectors.filter(c => c.type === 'stud');
    assert.equal(lddFrameOf({category: 'brick', connectors: studsOnly}, {bottom: 23.9}).o[1], 24);
    assert.equal(lddFrameOf({category: 'brick', connectors: studsOnly}, {bottom: 4}).o[1], 0, 'a baseplate: the stud base');
    assert.equal(lddFrameOf({connectors: []}).rule, 'ldraw-origin');
    assert.equal(lddFrameOf({connectors: [{type: 'ball', position: [0, 0, 0], axis: [1, 0, 0]}]}), null);
    assert.deepEqual([...DERIVED_RULES], ['grid']);
});

test('collidersBottom: the lowest collider corner, rotated colliders included', () => {
    const meta = CATALOG.get('3001.dat');
    assert.equal(collidersBottom(meta), 24, 'the 2 x 4 brick body box reaches the underside');
    // A box 2 high turned a quarter about z (quaternion [0, 0, sin 45°, cos 45°]) at y = 5: half-extent x (3) becomes y.
    const s = Math.SQRT1_2;
    assert.ok(Math.abs(collidersBottom({colliders: [{shape: 'box', halfExtents: [3, 1, 1], position: [0, 5, 0], rotation: [0, 0, s, s]}]}) - 8) < 1e-9);
    assert.equal(collidersBottom({}), null);
});

test('evaluator on a hand-made mapping file: agreement modulo symmetry, and each kind of disagreement', () => {
    // Rows worked out by hand from the vendored LDraw files (static/ldraw/parts), not taken from ldraw.xml:
    //  3001 (brick 2 x 4: studs x ∈ {±10, ±30}, z = ±10, top y = 0, underside y = 24): origin at the
    //       −x −z cell's bottom (−30, 24, −10), LDraw's yaw → t = F·o/25 = (−1.2, −0.96, 0.4).      agree
    //  4519 (axle 3, along LDraw x from −30 to 30): origin at the +x end with LDD z = +x (a quarter turn
    //       about y). The rule picks the −x end with LDD z = −x; the axle's half turn about y maps one
    //       onto the other.                                                                      agree
    //  3005 (brick 1 x 1) with its origin one stud (0.8) off along x.                       translation
    //  3004 (brick 1 x 2, along LDraw x) turned a quarter about y: not a symmetry of it.        rotation
    //  9999x.dat: no such LDraw part.                                                     not-in-library
    const xml = `<LDrawMapping>
        <Transformation ldraw="3001.dat" tx="-1.2" ty="-0.96" tz="0.4" ax="1" ay="0" az="0" angle="0" />
        <Transformation ldraw="4519.dat" tx="1.2" ty="0" tz="0" ax="0" ay="1" az="0" angle="1.570796" />
        <Transformation ldraw="3005.dat" tx="0.8" ty="-0.96" tz="0" ax="1" ay="0" az="0" angle="0" />
        <Transformation ldraw="3004.dat" tx="-0.4" ty="-0.96" tz="0" ax="0" ay="1" az="0" angle="1.570796" />
        <Transformation ldraw="9999x.dat" tx="0" ty="0" tz="0" ax="1" ay="0" az="0" angle="0" />
    </LDrawMapping>`;
    const scores = evaluate({xml, read: LIB});
    const verdict = Object.fromEntries(scores.map(s => [s.part, s.verdict]));
    assert.deepEqual(verdict, {
        '3001.dat': 'agree', '3004.dat': 'rotation', '3005.dat': 'translation', '4519.dat': 'agree', '9999x.dat': 'not-in-library'
    });
    assert.ok(Math.abs(scores.find(s => s.part === '3005.dat').offset - 20) < 1e-6, 'one stud off');
    const all = tally(scores).total;
    assert.equal(all.n, 5);
    assert.equal(all.scored, 4);
    assert.equal(all.agree, 2);
    assert.equal(all.rate, 0.5);
    // The split is a fixed hash of the file name, so it never moves a part between halves.
    assert.deepEqual(['3001.dat', '4519.dat'].map(splitOf), ['3001.dat', '4519.dat'].map(p => splitOf(p.toUpperCase())));
});

test('compareFrames: a symmetry reconciles two frames only when it maps the axes AND the origin', () => {
    const truth = {o: [30, 0, 0], M: [0, 0, 1, 0, -1, 0, 1, 0, 0]};
    const flipped = {o: [-30, 0, 0], M: [0, 0, -1, 0, -1, 0, -1, 0, 0]};
    const halfTurnY = {m: [-1, 0, 0, 0, 1, 0, 0, 0, -1], t: [0, 0, 0]};
    assert.equal(compareFrames(flipped, truth, symmetriesOf({symmetries: [halfTurnY], axial: [], anchor: [0, 0, 0]})).agree, true);
    assert.equal(compareFrames(flipped, truth, symmetriesOf({symmetries: [], axial: [], anchor: [0, 0, 0]})).rotation, false);
    const shifted = {o: [-29, 0, 0], M: flipped.M};
    const c = compareFrames(shifted, truth, symmetriesOf({symmetries: [halfTurnY], axial: [], anchor: [0, 0, 0]}), 0.5);
    assert.equal(c.agree, false);
    assert.equal(c.rotation, true);
    assert.ok(Math.abs(c.offset - 1) < 1e-9);
});

// ---- the .lxf import --------------------------------------------------------------------

const ROTY90 = '0,0,-1,0,1,0,1,0,0'; // LXFML bone rows: x → −z, z → x (a quarter turn about LDD y)
const lxfml = parts => `<?xml version="1.0" encoding="UTF-8" standalone="no" ?>
<LXFML versionMajor="5" versionMinor="0" name="stack"><Bricks>
${parts.map(([design, bone], i) => `<Brick refID="${i}" designID="${design}"><Part refID="${i}" designID="${design}" materials="21"><Bone refID="${i}" transformation="${bone}"/></Part></Brick>`).join('\n')}
</Bricks></LXFML>`;

/** A connector of a placed part, in the model frame. */
const placed = (p, c) => [0, 1, 2].map(r => p.rotation[3 * r] * c[0] + p.rotation[3 * r + 1] * c[1] + p.rotation[3 * r + 2] * c[2] + p.position[r]);
const ofType = (p, type) => CATALOG.get(p.part).connectors.filter(c => c.type === type).map(c => placed(p, c.position));

test('.lxf: bricks outside the recorded table load and stack — every anti-stud lands on a stud', () => {
    assert.ok(!LDD_PARTS.has('3001') && !LDD_PARTS.has('3004'), 'the test needs designs outside ldd-parts.js');
    // An LDD stack, written by hand in LDD's own terms (y up, 1 unit = 25 LDU, a brick is 0.96 high,
    // a stud pitch 0.8): a 2 x 4 brick on the ground; a 1 x 2 brick on top of it, one pitch along x
    // and one along −z; a second 1 x 2 turned a quarter about y, three pitches along x.
    const xml = lxfml([
        ['3001', `1,0,0,0,1,0,0,0,1,0,0,0`],
        ['3004', `1,0,0,0,1,0,0,0,1,0.8,0.96,-0.8`],
        ['3004', `${ROTY90},2.4,0.96,0`],
        ['32140', `1,0,0,0,1,0,0,0,1,0,2,0`],
        ['54696', `1,0,0,0,1,0,0,0,1,0,3,0`]
    ]);
    const {model, refusals} = parseLxfml(xml, {colours: new Map([[21, 4]]), catalog: CATALOG});
    assert.deepEqual(model.parts.map(p => p.part), ['3001.dat', '3004.dat', '3004.dat']);
    assert.deepEqual(refusals.map(r => [r.code, r.design, r.severity || 'error']), [
        ['lxf-derived-frame', '3001', 'warning'],
        ['lxf-derived-frame', '3004', 'warning'],
        ['lxf-derived-frame', '3004', 'warning'],
        ['lxf-unknown-design', '54696', 'error'], // not a catalogue part
        // A Technic beam: its derived frame is not trusted for import, and floating apart it connects to nothing,
        // so its frame cannot be worked out from connections either (model/ldd-snap.js; test/bw-sim-ldd-snap).
        ['lxf-unplaced-design', '32140', 'error']
    ]);
    const [base, top, turned] = model.parts;
    // Independent expectations, from the parts' own connectors (parts.json) and LDraw's frame:
    // the base stands on the ground: LDD's floor (y = 0) is LDraw's y = 0, so its underside is there.
    for (const a of ofType(base, 'antistud')) assert.ok(Math.abs(a[1]) < 1e-6, `base underside at y = 0: ${a}`);
    // Both 1 x 2 bricks sit on the base: each of their anti-studs is exactly on one of the base's studs.
    const studs = ofType(base, 'stud');
    for (const p of [top, turned]) {
        for (const a of ofType(p, 'antistud')) {
            assert.ok(studs.some(s => near(s, a, 1e-6)), `${p.part} anti-stud ${a} on a stud of the base`);
        }
    }
    // Which studs: one pitch (20 LDU) along LDD x from the base's first cell, LDD −z being LDraw +z.
    const baseFirst = studs.reduce((b, s) => (s[0] < b[0] - 1e-9 || (Math.abs(s[0] - b[0]) < 1e-9 && s[2] < b[2]) ? s : b));
    const topCells = ofType(top, 'antistud').map(a => [a[0] - baseFirst[0], a[2] - baseFirst[2]]).sort((a, b) => a[0] - b[0]);
    assert.deepEqual(topCells, [[20, 20], [40, 20]]);
    const turnedCells = ofType(turned, 'antistud').map(a => [a[0] - baseFirst[0], a[2] - baseFirst[2]]).sort((a, b) => a[1] - b[1]);
    assert.deepEqual(turnedCells, [[60, 0], [60, 20]]);
    // The turned brick runs along LDraw z, the other along x.
    assert.ok(near(turned.rotation.map(Math.abs), [0, 0, 1, 0, 1, 0, 1, 0, 0]));
    assert.ok(near(top.rotation, [1, 0, 0, 0, 1, 0, 0, 0, 1]));
});

test('.lxf: without a catalogue, a design outside the table is still refused', () => {
    const {model, refusals} = parseLxfml(lxfml([['3001', '1,0,0,0,1,0,0,0,1,0,0,0']]), {colours: new Map()});
    assert.deepEqual(model.parts, []);
    assert.deepEqual(refusals.map(r => r.code), ['lxf-unknown-design']);
});

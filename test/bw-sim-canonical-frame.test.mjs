// Canonical part frames from LDraw geometry (lib/bw-sim/part-meta/canonical-frame.js):
// symmetry groups, mirror pairs and duplicates across the vendored LDraw subset, the
// editor's mirror command on a real left/right pair, the palette's default placement,
// and the LDD frame fitter (scripts/fit-ldd-offsets.mjs) on a synthetic fixture.
// Expected facts come from reasoning about the parts' shapes (stated at each check) or
// are recomputed here from the vendored geometry with this file's own arithmetic —
// never read back from a value the code under test was handed.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {flattenPart, bounds} from '../overlay/scratch-gui/src/lib/bw-sim/ldraw/ldraw-geometry.js';
import {
    analysePart, findPairs, matchParts, placementRotation, defaultRotation, mirrorSymmetry
} from '../overlay/scratch-gui/src/lib/bw-sim/part-meta/canonical-frame.js';
import {mirrorPoses, mirrorCounterpart} from '../overlay/scratch-gui/src/lib/bw-sim/editor/editor-parity.js';
import {createEditor} from '../overlay/scratch-gui/src/lib/bw-sim/editor/editor-state.js';
import {validatePartMeta, validatePlacedModel} from '../overlay/scratch-gui/src/lib/bw-sim/contracts.js';
import {LDD_PARTS} from '../overlay/scratch-gui/src/lib/bw-sim/model/ldd-parts.js';
import {fitLibrary, parsePrimitive, lddLines, rowForm, rowTransform, primitivesDir} from '../scripts/fit-ldd-offsets.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LIB = path.join(ROOT, 'overlay/scratch-gui/static/ldraw');
const read = p => {
    const f = path.join(LIB, p.toLowerCase());
    return existsSync(f) ? readFileSync(f, 'latin1') : undefined;
};
const PARTS = JSON.parse(readFileSync(path.join(ROOT, 'overlay/scratch-gui/src/lib/bw-sim/part-meta/parts.json'), 'utf8')).parts;
const CATALOG = new Map(PARTS.map(p => [p.part, p]));
const analysed = new Map();
const analyse = part => {
    if (!analysed.has(part)) {
        const meta = CATALOG.get(part) || {part};
        analysed.set(part, analysePart(meta, flattenPart(part, read).polys, {meshOnly: !CATALOG.has(part)}));
    }
    return analysed.get(part);
};

// ---- this file's own arithmetic ------------------------------------------------------------
const I3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
const det = m => m[0] * (m[4] * m[8] - m[5] * m[7]) - m[1] * (m[3] * m[8] - m[5] * m[6]) + m[2] * (m[3] * m[7] - m[4] * m[6]);
const mulV = (m, v) => [0, 1, 2].map(r => m[r * 3] * v[0] + m[r * 3 + 1] * v[1] + m[r * 3 + 2] * v[2]);
const mul = (a, b) => [0, 1, 2].flatMap(r => [0, 1, 2].map(c => a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c]));
const T = m => [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]];
const close = (a, b, eps = 1e-6) => a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) <= eps);
const key = v => v.map(x => Math.round(x * 100) / 100 + 0).join(',');
const apply = (g, v) => mulV(g.m, v).map((x, i) => x + g.t[i]);
/** A connector as a comparable string: type, position, unsigned axis direction. */
const connKey = (c, g = {m: I3, t: [0, 0, 0]}) => {
    // A ball's axis is the socket's opening, not used for matching (contracts.js): left out.
    const a = c.type === 'ball' || c.type === 'ballsocket' ? [0, 0, 0] : mulV(g.m, c.axis || [0, 0, 0]).map(x => Math.round(x * 1000) / 1000 + 0);
    const k = a.findIndex(x => x !== 0);
    const sense = c.type === 'stud' || c.type === 'antistud' || c.type === 'tube' || k < 0 || a[k] > 0 ? 1 : -1;
    return `${c.type}@${key(apply(g, c.position))}/${key(a.map(x => x * sense))}`;
};
const connSet = (meta, g) => (meta.connectors || []).map(c => connKey(c, g)).sort();
/** A rotation about an arbitrary axis (Rodrigues), independent of the module under test. */
const axisAngle = (axis, angle) => {
    const l = Math.hypot(...axis);
    const [x, y, z] = axis.map(v => v / l);
    const c = Math.cos(angle), s = Math.sin(angle), t = 1 - c;
    return [t * x * x + c, t * x * y - s * z, t * x * z + s * y, t * x * y + s * z, t * y * y + c, t * y * z - s * x,
        t * x * z - s * y, t * y * z + s * x, t * z * z + c];
};
const kinds = group => group.elements.map(e => e.what.kind);
const has = (group, kind, dir) => group.elements.some(e => e.what.kind === kind &&
    (!dir || close((e.what.axis || e.what.normal).map(Math.abs), dir.map(Math.abs), 1e-6)));

// ---- symmetry groups -------------------------------------------------------------------------

test('a Technic beam 7 has the symmetry of a box: 8 elements, 180° about its long axis among them', () => {
    // 32524 is drawn centred: seven holes along LDraw y at z = −60…60, a stadium-ended slab
    // 20 wide (x) and 20 thick (y). Reflecting x, y or z alone maps it onto itself, so does
    // every product of those: the group of a rectangular box, D2h — 8 elements, 4 of them
    // turns (identity and 180° about x, y and z), 3 mirror planes and the inversion.
    const a = analyse('32524.dat');
    assert.equal(a.group.order, 8);
    assert.equal(a.group.properOrder, 4);
    assert.ok(has(a.group, 'rotation', [0, 0, 1]), '180° about the long axis (z)');
    assert.ok(has(a.group, 'rotation', [0, 1, 0]), '180° about the hole axis');
    assert.ok(has(a.group, 'rotation', [1, 0, 0]));
    for (const n of [[1, 0, 0], [0, 1, 0], [0, 0, 1]]) assert.ok(has(a.group, 'reflection', n), `mirror plane normal ${n}`);
    assert.ok(kinds(a.group).includes('inversion'));
    assert.equal(a.group.chiral, false);
    for (const e of a.group.elements) assert.equal(e.missedArea, 0, `${e.what.kind}: the beam is drawn exactly symmetric`);
    // The frame: the long axis first (largest variance), on LDraw's lattice.
    assert.equal(a.frame.aligned, true);
    assert.deepEqual([a.frame.E[0], a.frame.E[3], a.frame.E[6]].map(Math.abs), [0, 0, 1], 'first principal axis (column 0) = the beam (z)');
    // The lattice: 7 hole lines along y, 20 LDU apart along z.
    assert.deepEqual(a.lattice.directions[0].axis, [0, 1, 0]);
    assert.equal(a.lattice.directions[0].count, 7);
    assert.equal(a.lattice.pitch[2], 20);
});

test('a 2 x 4 brick loses the up/down symmetries to its studs: 4 elements, no inversion', () => {
    // Studs on top, an open underside: no reflection of y and no turn that swaps top and bottom
    // survives. Left/right and front/back reflections and the half turn about the vertical do (C2v).
    const a = analyse('3001.dat');
    assert.equal(a.group.order, 4);
    assert.equal(a.group.properOrder, 2);
    assert.ok(has(a.group, 'rotation', [0, 1, 0]), 'half turn about the vertical');
    assert.ok(has(a.group, 'reflection', [1, 0, 0]) && has(a.group, 'reflection', [0, 0, 1]));
    assert.ok(!has(a.group, 'reflection', [0, 1, 0]) && !kinds(a.group).includes('inversion'));
    // Studs 20 LDU apart; with the underside tubes between them, connectors every 10.
    assert.deepEqual(a.lattice.pitchByType.stud, [20, null, 20]);
    assert.equal(a.lattice.pitch[0], 10);
});

test('an axle\'s cross makes it four-fold about its length; a worm gear is chiral', () => {
    // The axle profile is a plus sign: a quarter turn about the axle maps it onto itself.
    const axle = analyse('4519.dat');
    assert.ok(axle.group.axial.some(x => close(x.axis, [1, 0, 0]) && x.order === 4), JSON.stringify(axle.group.axial));
    assert.equal(axle.group.order, 16, 'D4h: the square\'s 8 symmetries times the end-for-end flip');
    // A worm is a helix: a helix's mirror image turns the other way, so no improper element.
    const worm = analyse('4716.dat');
    assert.equal(worm.group.chiral, true);
    assert.equal(mirrorSymmetry(worm.group), null);
});

// ---- mirror pairs and duplicates ----------------------------------------------------------------

const REAL_PAIRS = [['41769a.dat', '41770a.dat'], ['43722a.dat', '43723a.dat'], ['32190.dat', '32191.dat']];

test('the vendored left/right pairs are found from their geometry, and nothing else pairs', () => {
    // Wedge plates 2x4 and 2x3 right/left, and the Technic panel fairings #1/#2 (no "left" or
    // "right" in their names), among controls that pair with nothing.
    const parts = [...REAL_PAIRS.flat(), '3001.dat', '32524.dat', '3022.dat', '32526.dat', '6536.dat'].map(analyse);
    const {mirrors, duplicates} = findPairs(parts);
    assert.deepEqual(mirrors.map(p => [p.a, p.b]).sort(), REAL_PAIRS.slice().sort());
    assert.deepEqual(duplicates, []);
    for (const {a, b, transform} of mirrors) {
        assert.ok(det(transform.m) < 0, 'a mirror map is improper');
        // Recomputed here: the map takes a's connectors onto b's …
        assert.deepEqual(connSet(CATALOG.get(a), transform), connSet(CATALOG.get(b)));
        // … and a's mesh onto b's: the mapped vertices span b's bounding box.
        const va = flattenPart(a, read).polys.map(p => p.map(v => apply(transform, v)));
        const ba = bounds(va); const bb = bounds(flattenPart(b, read).polys);
        assert.ok(close(ba.min, bb.min, 0.01) && close(ba.max, bb.max, 0.01), `${a}→${b} bounds`);
        // Each side alone is chiral: no improper map takes it onto itself.
        assert.equal(analyse(a).group.chiral, true);
        assert.equal(analyse(b).group.chiral, true);
    }
    // The name-only pairing could not find the fairings: their names do not say left or right.
    assert.ok(!/left|right/i.test(CATALOG.get('32190.dat').name) && !/left|right/i.test(CATALOG.get('32191.dat').name));
});

test('an LDraw alias is a duplicate of its target, a mirror image is not', () => {
    // 41769.dat is LDraw's "~Moved to 41769a"; 3648.dat is "~Moved to 3648b".
    assert.match(read('parts/41769.dat').split('\n')[0], /~Moved to 41769a/);
    for (const [x, y] of [['41769a.dat', '41769.dat'], ['3648.dat', '3648b.dat']]) {
        const g = matchParts(analyse(x), analyse(y), {proper: true, exact: true});
        assert.ok(g.length > 0, `${x} = ${y}`);
        assert.ok(g.some(e => close(e.m, I3) && close(e.t, [0, 0, 0])), 'the identity is one of the maps');
    }
    assert.deepEqual(matchParts(analyse('41769a.dat'), analyse('41770a.dat'), {proper: true, exact: true}), [], 'right is no copy of left');
    const {duplicates, groups, mirrors} = findPairs(['41769a.dat', '41769.dat', '41770a.dat'].map(analyse));
    assert.deepEqual(groups, [['41769a.dat', '41769.dat']]);
    assert.equal(duplicates.length, 1);
    assert.deepEqual(mirrors.map(p => [p.a, p.b]), [['41769a.dat', '41770a.dat']], 'the alias does not pair a second time');
});

// ---- the measurement as shipped in parts.json -------------------------------------------------------

test('every catalogue part carries its measured mirrorOf, valid and consistent with its geometry', () => {
    for (const p of PARTS) {
        assert.notEqual(p.mirrorOf, undefined, `${p.part}: run node scripts/derive-canonical-frames.mjs`);
        assert.deepEqual(validatePartMeta(p).filter(x => /mirrorOf/.test(x)), [], p.part);
        if (!p.mirrorOf) continue;
        const other = CATALOG.get(p.mirrorOf.part);
        assert.ok(other, `${p.part}: counterpart ${p.mirrorOf.part} is in the catalogue`);
        // Connectors map exactly (this file's comparison), under every listed symmetry.
        assert.deepEqual(connSet(p, p.mirrorOf.transform), connSet(other), `${p.part} → ${p.mirrorOf.part}`);
        for (const o of p.mirrorOf.others || []) {
            assert.ok(det(o.m) < 0);
            assert.deepEqual(connSet(p, o), connSet(p), `${p.part}: another improper symmetry`);
        }
        if (other !== p) {
            // The counterpart points back with the inverse map, so mirroring twice is the identity.
            const back = other.mirrorOf.transform;
            assert.equal(other.mirrorOf.part, p.part);
            assert.ok(close(mul(back.m, p.mirrorOf.transform.m), I3) && close(apply(back, p.mirrorOf.transform.t), [0, 0, 0], 1e-3));
        }
    }
    // The real pairs are recorded as pairs, a symmetric beam as itself, a worm as none.
    for (const [a, b] of REAL_PAIRS) assert.equal(CATALOG.get(a).mirrorOf.part, b);
    assert.equal(CATALOG.get('32524.dat').mirrorOf.part, '32524.dat');
    assert.equal(CATALOG.get('4716.dat').mirrorOf, null);
    // And what is shipped is what the geometry says now (the pairs, re-measured here).
    const {mirrors} = findPairs(REAL_PAIRS.flat().map(analyse));
    for (const {a, b, transform} of mirrors) {
        assert.equal(CATALOG.get(a).mirrorOf.part, b);
        assert.ok(close(CATALOG.get(a).mirrorOf.transform.m, transform.m) && close(CATALOG.get(a).mirrorOf.transform.t, transform.t, 1e-3));
    }
});

// ---- the editor's mirror command ----------------------------------------------------------------

const reflectX = pivot => v => [2 * pivot - v[0], v[1], v[2]];
const worldConnectors = (placed) => (CATALOG.get(placed.part).connectors || [])
    .map(c => connKey(c, {m: placed.rotation, t: placed.position}));
const worldBounds = placed => bounds(flattenPart(placed.part, read).polys.map(p => p.map(v => apply({m: placed.rotation, t: placed.position}, v))));

test('the mirror command swaps a real left part for its right counterpart, which lands on the mirror image', () => {
    const turned = axisAngle([0.3, 1, -0.2], 1.1);
    for (const [a, b] of [...REAL_PAIRS, ...REAL_PAIRS.map(([x, y]) => [y, x])]) {
        assert.deepEqual(mirrorCounterpart(a, CATALOG)?.part, b);
        for (const rotation of [I3, axisAngle([0, 1, 0], Math.PI / 2), turned]) {
            const placed = {id: 'p', part: a, position: [40, -24, 60], rotation};
            const [m] = mirrorPoses([placed], CATALOG, 'x', 10);
            assert.equal(m.how, 'swapped');
            assert.equal(m.part, b);
            assert.ok(Math.abs(det(m.rotation) - 1) < 1e-9, 'a proper rotation, never a mirrored part');
            // The counterpart's connectors are the mirror images of the original's.
            const mirrored = worldConnectors(placed).map(k => {
                const [type, rest] = k.split('@');
                const [pos, ax] = rest.split('/');
                const q = reflectX(10)(pos.split(',').map(Number));
                const d = ax.split(',').map(Number); d[0] = -d[0];
                const kk = d.findIndex(x => x !== 0);
                const s = type === 'stud' || type === 'antistud' || type === 'tube' || kk < 0 || d[kk] > 0 ? 1 : -1;
                return `${type}@${key(q)}/${key(d.map(x => x * s))}`;
            }).sort();
            assert.deepEqual(worldConnectors({...m, part: m.part}).sort(), mirrored, `${a} → ${b}`);
            // And its mesh fills the mirror image of the original's box.
            const was = worldBounds(placed); const now = worldBounds(m);
            assert.ok(close([2 * 10 - was.max[0], was.min[1], was.min[2]], now.min, 0.05) &&
                close([2 * 10 - was.min[0], was.max[1], was.max[2]], now.max, 0.05), `${a} → ${b}: mesh bounds`);
        }
    }
});

test('through the editor: one undo step, twice gives the left part back where it was', () => {
    const model = {version: 1, parts: [
        {id: 'w', part: '41769a.dat', color: 4, position: [20, -8, 0], rotation: I3.slice()},
        {id: 'f', part: '32190.dat', color: 15, position: [-40, -30, 20], rotation: axisAngle([0, 1, 0], Math.PI / 2).map(v => Math.round(v))},
        {id: 'g', part: '4716.dat', position: [0, -40, 80], rotation: I3.slice()}
    ]};
    const ed = createEditor({model, catalog: CATALOG});
    const before = ed.model;
    ed.apply({type: 'mirror', ids: ['w', 'f', 'g'], axis: 'x'});
    const after = ed.model;
    assert.equal(after.parts.find(p => p.id === 'w').part, '41770a.dat');
    assert.equal(after.parts.find(p => p.id === 'f').part, '32191.dat');
    assert.equal(after.parts.find(p => p.id === 'g').part, '4716.dat', 'a worm has no mirror image: it stays a worm');
    assert.deepEqual(validatePlacedModel(after, CATALOG), []);
    ed.undo();
    assert.deepEqual(ed.model, before);
    ed.redo();
    ed.apply({type: 'mirror', ids: ['w', 'f', 'g'], axis: 'x'});
    for (const p of before.parts) {
        const q = ed.model.parts.find(x => x.id === p.id);
        assert.equal(q.part, p.part);
        assert.ok(close(q.position, p.position, 1e-9) && close(q.rotation, p.rotation, 1e-12), `${p.id} is back`);
    }
});

test('a beam mirrored across its own plane stays put; across any plane, twice is where it was', () => {
    // A beam 7 standing along world z (a quarter turn about y): world x is its width direction, a
    // mirror plane of the beam, so its mirror image across x is itself where it stands.
    const R = axisAngle([0, 1, 0], Math.PI / 2).map(v => Math.round(v) + 0);
    const placed = {id: 'b', part: '32524.dat', position: [0, -20, 40], rotation: R};
    const [m] = mirrorPoses([placed], CATALOG, 'x', 0);
    assert.equal(m.how, 'mirrored');
    assert.ok(close(m.rotation, R) && close(m.position, placed.position), JSON.stringify(m));
    for (const rotation of [R, axisAngle([1, 1, 0], 0.4), axisAngle([0, 0, 1], Math.PI / 2).map(v => Math.round(v) + 0)]) {
        for (const axis of ['x', 'z']) {
            const p0 = {id: 'b', part: '32348.dat', position: [10, -20, 40], rotation};
            const [once] = mirrorPoses([p0], CATALOG, axis, 30);
            const [twice] = mirrorPoses([{...once, id: 'b'}], CATALOG, axis, 30);
            assert.ok(close(twice.rotation, rotation, 1e-9) && close(twice.position, p0.position, 1e-9), `${axis}: back where it was`);
        }
    }
});

test('a symmetric part whose mirror plane is off its origin mirrors in place, shifted onto the image', () => {
    // A beam 7 whose LDraw origin sits 10 LDU off its middle: its mirror plane is x = 10 in its
    // own frame, so p ↦ (−x + 20, y, z) maps it onto itself.
    const beam = CATALOG.get('32524.dat');
    const shifted = {...beam, part: '9100.dat', connectors: beam.connectors.map(c => ({...c, position: [c.position[0] + 10, c.position[1], c.position[2]]})),
        colliders: [], mirrorOf: {part: '9100.dat', transform: {m: [-1, 0, 0, 0, 1, 0, 0, 0, 1], t: [20, 0, 0]}}};
    const catalog = new Map([...CATALOG, ['9100.dat', shifted]]);
    const rotation = axisAngle([0, 1, 0], Math.PI / 2).map(v => Math.round(v));
    const placed = {id: 'p', part: '9100.dat', position: [30, 0, -10], rotation};
    const [m] = mirrorPoses([placed], catalog, 'x', 0);
    assert.equal(m.how, 'mirrored');
    const world = pose => shifted.connectors.map(c => key(apply({m: pose.rotation, t: pose.position}, c.position))).sort();
    assert.deepEqual(world(m), world(placed).map(k => key(reflectX(0)(k.split(',').map(Number)))).sort());
});

// ---- the palette's default placement ------------------------------------------------------------

const world = (R, v) => mulV(R, v).map(x => Math.round(x * 1e9) / 1e9 + 0);
const extentAlong = (meta, R) => {
    const pts = (meta.connectors || []).map(c => world(R, c.position));
    return [0, 1, 2].map(k => Math.max(...pts.map(p => p[k])) - Math.min(...pts.map(p => p[k])));
};

test('auto-orientation: bricks studs up, a beam along x with its holes horizontal, shafts along x, gears on a horizontal axle', () => {
    for (const meta of PARTS) {
        const {rotation: R} = placementRotation(meta);
        assert.ok(Math.abs(det(R) - 1) < 1e-12 && R.every(v => v === 0 || Math.abs(v) === 1), `${meta.part}: an axis rotation`);
        assert.deepEqual(defaultRotation(meta), R);
    }
    // Studs point up (LDraw −y) on every System part.
    for (const part of ['3001.dat', '3022.dat', '3039.dat', '41769a.dat', '3700.dat']) {
        const meta = CATALOG.get(part);
        const R = placementRotation(meta).rotation;
        for (const c of meta.connectors.filter(x => x.type === 'stud')) assert.deepEqual(world(R, c.axis), [0, -1, 0], `${part}: stud up`);
    }
    // A beam: its row of holes runs along world x, every hole axis horizontal, facing z.
    for (const part of ['32524.dat', '32523.dat', '41239.dat', '32278.dat']) {
        const meta = CATALOG.get(part);
        const R = placementRotation(meta).rotation;
        for (const c of meta.connectors) assert.deepEqual(world(R, c.axis).map(Math.abs), [0, 0, 1], `${part}: hole facing z`);
        const ext = extentAlong(meta, R);
        assert.ok(ext[0] > 0 && ext[1] === 0 && ext[2] === 0, `${part}: the holes in a row along x`);
    }
    // An axle and a pin lie along x.
    for (const part of ['4519.dat', '3708.dat', '2780.dat']) {
        const c = CATALOG.get(part).connectors[0];
        assert.deepEqual(world(placementRotation(CATALOG.get(part)).rotation, c.axis).map(Math.abs), [1, 0, 0], part);
    }
    // A gear stands on a horizontal axle along z.
    for (const part of ['3648.dat', '3647.dat', '3649.dat']) {
        const c = CATALOG.get(part).connectors.find(x => x.type === 'axlehole');
        assert.deepEqual(world(placementRotation(CATALOG.get(part)).rotation, c.axis).map(Math.abs), [0, 0, 1], part);
    }
    // A device keeps LDraw's frame (its labels are drawn upright in it).
    for (const meta of PARTS.filter(p => p.device || p.hubProfile)) assert.deepEqual(placementRotation(meta).rotation, I3, meta.part);
});

// ---- the LDD fitter on a synthetic fixture --------------------------------------------------------

const FIXTURE = path.join(ROOT, 'test/fixtures/bw-sim/ldd-synthetic');

/**
 * The transforms the fixture's frames were drawn in (fixture XML comments), written here by
 * hand as p_LDraw = 25·A·q + d:
 *   32523: the beam along LDD +x from its end hole, holes along LDD z, origin on the hole's
 *          front face → LDD x ↦ LDraw −z (from +20), LDD y ↦ LDraw x, LDD z ↦ LDraw −y, the
 *          hole's centre (z = −0.4) at LDraw y = 0.
 *   4519:  the axle along LDD −z from its end → LDD z ↦ LDraw x (from +30), y ↦ −y, x ↦ z.
 *   6536:  LDD z ↦ LDraw x, y ↦ −y, x ↦ z, the origin at LDraw (−10, 0, 0).
 */
const EXPECTED = {
    32523: {A: [0, 1, 0, 0, 0, -1, -1, 0, 0], d: [0, -10, 20]},
    4519: {A: [0, 0, 1, 0, -1, 0, 1, 0, 0], d: [30, 0, 0]},
    6536: {A: [0, 0, 1, 0, -1, 0, 1, 0, 0], d: [-10, 0, 0]}
};

/** Equal up to a proper symmetry of the part's connectors (searched here over the 24 axis turns). */
const sameModuloSymmetry = (fit, exp, meta) => {
    const cs = meta.connectors;
    const centre = cs.reduce((acc, c) => acc.map((v, i) => v + c.position[i] / cs.length), [0, 0, 0]);
    const turns = [];
    for (const perm of [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]]) {
        for (let s = 0; s < 8; s++) {
            const m = new Array(9).fill(0);
            perm.forEach((c, r) => { m[3 * r + c] = (s >> r) & 1 ? -1 : 1; });
            if (det(m) > 0) turns.push(m);
        }
    }
    return turns.some(m => {
        const g = {m, t: centre.map((v, i) => v - mulV(m, centre)[i])};
        if (connSet(meta, g).join() !== connSet(meta).join()) return false;
        return close(fit.rotation, mul(m, exp.A), 1e-9) && close(fit.offsetLDU, apply(g, exp.d), 1e-6);
    });
};

test('the LDD fitter recovers the hand-made frames of a synthetic fixture and agrees with the importer\'s rows', () => {
    const result = fitLibrary(FIXTURE);
    // The fixture was written with Axels along local +y from their point; the fitter is told
    // nothing and finds that convention as the only one that fits every part.
    assert.deepEqual(result.convention, {axis: 'y', anchor: 'start'});
    assert.ok(result.conventions.slice(1).every(c => c.totalResidualLDU > 1), JSON.stringify(result.conventions.slice(0, 3)));
    const by = id => result.parts.find(p => p.designId === id);
    for (const id of ['32523', '4519', '6536']) {
        const p = by(id);
        assert.ok(p.residualLDU < 1e-6, `${id}: residual ${p.residualLDU}`);
        assert.ok(sameModuloSymmetry(p, EXPECTED[id], CATALOG.get(p.part)), `${id}: ${JSON.stringify(p.rotation)} + ${p.offsetLDU}`);
        // Every fixture line, mapped by the fit, lands on one of the part's connectors (this file's arithmetic).
        const prim = parsePrimitive(readFileSync(path.join(FIXTURE, 'Primitives', `${id}.xml`), 'utf8'));
        const targets = new Set(CATALOG.get(p.part).connectors.map(c => key(c.position)));
        for (const l of lddLines(prim, result.convention)) {
            assert.ok(targets.has(key(mulV(p.rotation, l.centre).map((v, i) => 25 * v + p.offsetLDU[i]))), `${id}: a line off its connector`);
        }
        // The row form reproduces the same transform.
        const back = rowTransform(rowForm({Q: mul([1, 0, 0, 0, -1, 0, 0, 0, -1], p.rotation), A: p.rotation, d: p.offsetLDU}));
        // (the row form keeps 6 decimals, as ldd-parts.js keeps 7)
        assert.ok(close(back.A, p.rotation, 1e-6) && close(back.d, p.offsetLDU, 1e-4), `${id}: row form round trip`);
    }
    assert.equal(by('6536').ambiguous, 2, 'the cross block\'s connectors allow one half turn');
    // The fixture's Axel type 7 is a beam hole: learnt as a pin hole, it keeps the cross block's
    // pin hole off its axle hole (both one hole long, so geometry alone could swap them).
    assert.equal(result.typeMap['7'], 'pinhole');
    // Cross-check against model/ldd-parts.js for the two designs it records: same rotation,
    // offsets 0.5 LDU apart — the rows keep LDD's 0.02-unit sub-offset, the fixture does not.
    for (const id of ['32523', '4519']) {
        assert.ok(LDD_PARTS.has(id));
        const cc = by(id).crossCheck;
        assert.equal(cc.agree, true, `${id}: ${JSON.stringify(cc)}`);
        // (the rows' angles carry 7 digits: 1.570796 is 2e-5° off a quarter turn)
        assert.ok(cc.angleDeg < 1e-3 && Math.abs(cc.offsetLDU - 0.5) < 1e-4, `${id}: ${JSON.stringify(cc)}`);
    }
    assert.equal(by('6536').crossCheck, undefined, 'not one of the importer\'s 27 rows');
    assert.match(by('3001').skipped, /no Axel/);
    assert.match(by('99999').skipped, /no catalogue part/);
    assert.throws(() => primitivesDir('/somewhere/db.lif'), /extract LDD's db\.lif/);
});

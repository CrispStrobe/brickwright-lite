// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// The second batch of parts added to the Sim Lab catalogue (oc-parts.md):
// the thin liftarms 1 x 6 / 1 x 7, axles 10 / 12 / 4-with-stop and the 20T /
// 12T / 36T double-bevel gears. Every expected value here is derived from the
// official LDraw geometry (vendored under static/ldraw) or from the compiler's
// documented gear rule, never from the metadata under test.

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {flattenPart, bounds} from '../overlay/scratch-gui/src/lib/bw-sim/ldraw/ldraw-geometry.js';
import {compile} from '../overlay/scratch-gui/src/lib/bw-sim/mech/compile.js';
import {makeCatalog} from './fixtures/bw-sim/test-catalog.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const LIB = path.join(ROOT, 'overlay/scratch-gui/static/ldraw');
const META = JSON.parse(readFileSync(path.join(ROOT, 'overlay/scratch-gui/src/lib/bw-sim/part-meta/parts.json'), 'utf8')).parts;
const read = p => {
    const f = path.join(LIB, p.toLowerCase());
    return existsSync(f) ? readFileSync(f, 'latin1') : undefined;
};
const metaOf = part => {
    const m = META.find(p => p.part === part);
    assert.ok(m, `${part} is in the catalogue`);
    return m;
};

// (a) ------------------------------------------------------------------------
test('thin liftarm 1 x 6 (32063): six pin holes, 20 LDU apart, counted from its LDraw pegholes', t => {
    const flat = flattenPart('32063.dat', read);
    assert.deepEqual(flat.missing, []);
    // A thin liftarm's pin holes are the round bores it draws with peghole.dat on
    // each face (the npeghol* primitives at z = 0, 20, 40 … are the notches BETWEEN
    // holes, not holes). peghole.dat is a unit primitive placed with its hole axis on
    // LDraw +y; the two placements per hole sit at y = -5 and y = +5, so the hole's
    // centre line is the shared z (x is 0 for all of them).
    const drawn = flat.primitives
        .filter(p => /\/peghole\.dat$/i.test(p.file))
        .map(p => ({x: p.x.t[0], z: p.x.t[2]}));
    assert.ok(drawn.length >= 6, `peghole placements drawn: ${drawn.length}`);
    const holes = [...new Set(drawn.map(h => h.z))].sort((a, b) => a - b);
    assert.deepEqual(holes, [-50, -30, -10, 10, 30, 50], 'six holes, symmetric about the centre');
    assert.ok(drawn.every(h => h.x === 0), 'all holes on the liftarm centre line');
    for (let i = 1; i < holes.length; i++) {
        assert.equal(holes[i] - holes[i - 1], 20, `hole ${i} pitch`);
    }
    // The metadata describes exactly those six holes (and nothing else).
    const meta = metaOf('32063.dat');
    const pins = meta.connectors.filter(c => c.type === 'pinhole');
    assert.equal(pins.length, 6);
    assert.deepEqual(pins.map(c => c.position[2]).sort((a, b) => a - b), holes);
    assert.ok(pins.every(c => Math.abs(Math.abs(c.axis[1]) - 1) < 1e-9 && c.position[0] === 0));
    t.diagnostic(`drawn and described: 6 pin holes at z = ${holes.join(', ')} (20 LDU pitch, axis y)`);
});

// (b) ------------------------------------------------------------------------
test('axle 10 (3737) is 200 LDU and axle 12 (3708) 240 LDU long', t => {
    for (const [part, studs] of [['3737.dat', 10], ['3708.dat', 12]]) {
        const flat = flattenPart(part, read);
        assert.deepEqual(flat.missing, []);
        const b = bounds(flat.polys);
        // LDraw draws the axle 0.5 LDU short at each end (the axle-end bevel primitive
        // is anchored at the true end but its outline stops one chamfer in), so the
        // MESH span is 20·N − 1: 199 for the 10L axle, 239 for the 12L.
        const meshSpan = b.max[0] - b.min[0];
        assert.ok(Math.abs(meshSpan - (studs * 20 - 1)) < 1e-6, `mesh span ${meshSpan} for a ${studs}L axle`);
        // The axle really is 20 LDU (one hole pitch) long per stud: LDraw anchors the
        // two axle-end subparts at ±(20·N/2), and the metadata connector spans that.
        const ends = flat.primitives.filter(p => /\/axleend\w*\.dat$/i.test(p.file)).map(p => Math.abs(p.x.t[0]));
        assert.ok(ends.length >= 2, 'the axle has two LDraw axle ends');
        assert.equal(Math.max(...ends), studs * 10, `axle end at half the ${studs}L length`);
        assert.equal(metaOf(part).connectors[0].length, studs * 20);
        t.diagnostic(`${part}: mesh ${meshSpan} LDU (two 0.5 LDU end chamfers), nominal axle ${studs * 20} LDU = ${studs} studs x 20 LDU`);
    }
});

// (c) ------------------------------------------------------------------------
test('87083: the stop is one-sided geometry (a collar), so it engages a hole from one side only', t => {
    const flat = flattenPart('87083.dat', read);
    assert.deepEqual(flat.missing, []);
    // Cross-section radius r(x) = hypot(y, z): the shaft is a Technic axle cross that
    // fits a 6 LDU bore; the stop is a collar of radius 8 LDU. The collar cannot enter
    // a 6 LDU Technic hole, so the axle can be pushed in only shaft-first and the collar
    // comes to rest against the far face — it engages from one side.
    const pts = flat.polys.flat();
    const radius = v => Math.hypot(v[1], v[2]);
    const shaftMax = Math.max(...pts.filter(v => v[0] < 30).map(radius));
    const oversize = pts.filter(v => radius(v) > 6.5);
    assert.ok(oversize.length > 0, 'there is a collar');
    assert.ok(shaftMax <= 6.5, `the shaft fits a 6 LDU bore (max radius ${shaftMax})`);
    assert.ok(Math.min(...oversize.map(v => v[0])) > 30, 'the oversize collar is only at the +x end');
    const collarMax = Math.max(...pts.filter(v => v[0] >= 38).map(radius));
    assert.ok(Math.abs(collarMax - 8) < 0.5, `the collar is radius 8 (got ${collarMax})`);
    // Whatever the connector model stores is symmetric about the part origin: a single
    // axle segment. It cannot express "only from the −x side" (the stop is not a
    // connector), so the simulation needs this geometry to know the stop.
    const meta = metaOf('87083.dat');
    assert.equal(meta.connectors.length, 1);
    assert.equal(meta.connectors[0].type, 'axle');
    assert.equal(meta.connectors[0].length, 80);
    assert.deepEqual(meta.connectors[0].position, [0, 0, 0], 'the single axle connector is symmetric');
    t.diagnostic('stop: radius 8 LDU at x 38..40, the 6 LDU bore admits only the shaft, so a hole takes it shaft-first (−x end leading); the connector model stores one symmetric 80 LDU axle and cannot encode the one-sided stop.');
});

// (d) ------------------------------------------------------------------------
// A double-bevel gear meshes as a BEVEL: perpendicular axes, the two axle lines
// meeting at O, |c1 − O| = r2 and |c2 − O| = r1 (mech/gears.js meshContact). The
// pitch radius (contracts.js) is r = teeth · 1.25 LDU (Technic module 1: pitch
// diameter in mm = tooth count). The frame is built the way test/bw-sim-mech
// test 8 does: two pins (test-pin) through test-corner join the two orthogonal
// test-beam5 beams into ONE rigid frame; each gear turns on a test-axle4 axle
// through its own beam hole. |ratio| is joint2 / joint1 and equals r1 / r2.
const gearCatalog = () => {
    const catalog = makeCatalog();
    for (const part of ['32269.dat', '32270.dat', '32498.dat']) catalog.set(part, metaOf(part));
    return catalog;
};
const I3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
const ROT_Y_90 = [0, 0, 1, 0, 1, 0, -1, 0, 0];

test('two 20T double bevels at 90 deg mesh with |ratio| 1 (r1 = r2 = 25 LDU)', t => {
    // g1 at the origin, axis Z; g2 at c2 = (-25, 0, 25) rotated 90 deg about Y so its
    // axis is X. The two axle lines (z-axis through the origin, x-axis at z = 25) meet
    // at O = (0, 0, 25); |c1 − O| = 25 = r2 and |c2 − O| = 25 = r1, so the pitch cones
    // touch. r1 = r2 = 20 · 1.25 = 25, so |ratio| = r1 / r2 = 1.
    const model = {
        version: 1,
        parts: [
            {id: 'beamZ', part: 'test-beam5.dat', position: [0, 0, 0], rotation: I3},
            {id: 'axleZ', part: 'test-axle4.dat', position: [0, 0, 0], rotation: I3},
            {id: 'g1', part: '32269.dat', position: [0, 0, 0], rotation: I3},
            {id: 'beamX', part: 'test-beam5.dat', position: [-25, 0, 25], rotation: ROT_Y_90},
            {id: 'axleX', part: 'test-axle4.dat', position: [-25, 0, 25], rotation: ROT_Y_90},
            {id: 'g2', part: '32269.dat', position: [-25, 0, 25], rotation: ROT_Y_90},
            {id: 'corner', part: 'test-corner.dat', position: [-40, 0, 20], rotation: I3},
            {id: 'pinZ', part: 'test-pin.dat', position: [-40, 0, 10], rotation: I3},
            {id: 'pinX', part: 'test-pin.dat', position: [-30, 0, 45], rotation: ROT_Y_90},
        ],
    };
    const mech = compile(model, gearCatalog(), {ground: false});
    assert.deepEqual(mech.diagnostics, []);
    assert.equal(mech.gears.length, 1, JSON.stringify(mech.gears));
    assert.ok(Math.abs(Math.abs(mech.gears[0].ratio) - 1) < 1e-9, `ratio ${mech.gears[0].ratio}`);
    // The constraint couples the two real 32269 instances (ids g1 and g2).
    assert.deepEqual([...mech.gears[0].parts].sort(), ['g1', 'g2']);
    assert.deepEqual(model.parts.filter(p => p.id === 'g1' || p.id === 'g2').map(p => p.part), ['32269.dat', '32269.dat']);
    t.diagnostic(`20T <-> 20T: ratio ${mech.gears[0].ratio}, |ratio| 1`);
});

test('a 36T and a 12T double bevel at 90 deg mesh with |ratio| 3 (r1 = 45, r2 = 15 LDU)', t => {
    // 36T at c1 = (-45, 0, 10), axis Z; 12T at c2 = (0, 0, 25), axis X (rotated 90 deg
    // about Y). The axle lines are the z-axis through c1 and the x-axis at z = 25; they
    // meet at O = (-45, 0, 25): |c1 − O| = 15 = r2 and |c2 − O| = 45 = r1. The compiler
    // orders the pair by centre, so the 36T (x = -45) is joint1 and the 12T joint2, and
    // |ratio| = r1 / r2 = 36·1.25 / (12·1.25) = 45 / 15 = 3.
    const model = {
        version: 1,
        parts: [
            {id: 'beamZ', part: 'test-beam5.dat', position: [-45, 0, 10], rotation: I3},
            {id: 'axleZ', part: 'test-axle4.dat', position: [-45, 0, 10], rotation: I3},
            {id: 'g36', part: '32498.dat', position: [-45, 0, 10], rotation: I3},
            {id: 'beamX', part: 'test-beam5.dat', position: [-20, 0, 25], rotation: ROT_Y_90},
            {id: 'axleX', part: 'test-axle4.dat', position: [0, 0, 25], rotation: ROT_Y_90},
            {id: 'g12', part: '32270.dat', position: [0, 0, 25], rotation: ROT_Y_90},
            {id: 'corner', part: 'test-corner.dat', position: [-45, 0, 20], rotation: I3},
            {id: 'pinZ', part: 'test-pin.dat', position: [-45, 0, 15], rotation: I3},
            {id: 'pinX', part: 'test-pin.dat', position: [-30, 0, 45], rotation: ROT_Y_90},
        ],
    };
    const mech = compile(model, gearCatalog(), {ground: false});
    assert.deepEqual(mech.diagnostics, []);
    assert.equal(mech.gears.length, 1, JSON.stringify(mech.gears));
    assert.ok(Math.abs(Math.abs(mech.gears[0].ratio) - 3) < 1e-9, `ratio ${mech.gears[0].ratio}`);
    // The constraint couples the real 32498 (id g36) and 32270 (id g12).
    assert.deepEqual([...mech.gears[0].parts].sort(), ['g12', 'g36']);
    assert.deepEqual(model.parts.filter(p => p.id === 'g12' || p.id === 'g36').map(p => p.part).sort(), ['32270.dat', '32498.dat']);
    t.diagnostic(`36T <-> 12T: ratio ${mech.gears[0].ratio}, |ratio| 3`);
});

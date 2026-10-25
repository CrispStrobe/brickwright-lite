// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// Robot Lab render quality (headless three): parts are drawn the way LEGO CAD
// tools draw them, from the vendored LDraw files. Proven:
//
//   - a beam's edge-line geometry has exactly one segment per LDraw type-2
//     line of the flattened part, at the same (world-frame) positions, and its
//     conditional lines one per type-5 line;
//   - edge lines are drawn in the LDConfig EDGE colour of the placed colour,
//     and fixed-colour edges (the wheel's integral tyre) in their own colour's
//     EDGE value;
//   - LDraw BFC is honoured: the flattened beam encloses a positive volume
//     (every face wound outward);
//   - creased normals: on a beam, two adjacent coplanar faces share the face
//     normal and a 90° crease stays sharp, while on the tyre the normals of
//     faces meeting at a few degrees are averaged (each vertex normal differs
//     from its face normal, and coincident vertices agree);
//   - a SPIKE motor is split into housing + drive hub: the hub mesh holds
//     exactly the LDraw drive-hub sub-file's triangles, lives in the motor's
//     OUTPUT body group, and after real physics with the motor running it has
//     turned with the output body, relative to the still housing.

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {Box3, Color, Quaternion, Vector3} from 'three';
import {parseLDConfig} from '../overlay/scratch-gui/src/lib/bw-sim/view/ldraw-colors.js';
import {partVisual} from '../overlay/scratch-gui/src/lib/bw-sim/view/part-geometry.js';
import {circularFeatures, flattenPart, parseLDraw} from '../overlay/scratch-gui/src/lib/bw-sim/ldraw/ldraw-geometry.js';
import {compile} from '../overlay/scratch-gui/src/lib/bw-sim/mech/compile.js';
import {buildSimScene, applySnapshot} from '../overlay/scratch-gui/src/lib/bw-sim/view/sim-scene3d.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const LDRAW_DIR = path.join(ROOT, 'overlay', 'scratch-gui', 'static', 'ldraw');
const json = p => JSON.parse(readFileSync(path.join(ROOT, p), 'utf8'));
const CATALOG = new Map(json('overlay/scratch-gui/src/lib/bw-sim/part-meta/parts.json').parts.map(p => [p.part, p]));
const MODEL = json('test/fixtures/bw-sim/driving-base.json');
const LDU_M = 0.0004;
const read = p => {
    try { return readFileSync(path.join(LDRAW_DIR, p), 'utf8'); } catch { return undefined; }
};
const colors = parseLDConfig(readFileSync(path.join(LDRAW_DIR, 'LDConfig.ldr'), 'utf8'));

const BEAM = '32524.dat'; // Technic beam 7
const WHEEL = '39367p01.dat'; // wheel with integral tyre (the driving base's wheels)
const MOTOR = '54696p01.dat';
const HUB_FILE = 'u9363p01.dat'; // the drive-hub sub-file 54696p01.dat references (LDraw)

/** Angle between two vectors in degrees; atan2 stays exact near 0° where acos of a float32 dot does not. */
const deg = (a, b) => {
    const c = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    return Math.atan2(Math.hypot(...c), a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) * 180 / Math.PI;
};
const triCount = polys => polys.reduce((n, p) => n + p.length - 2, 0);

/** Per triangle: positions, vertex normals and the face normal, from a non-indexed geometry. */
const triangles = (geo, first = 0, count = geo.attributes.position.count) => {
    const pos = geo.attributes.position.array;
    const nor = geo.attributes.normal.array;
    const out = [];
    for (let v = first; v < first + count; v += 3) {
        const p = [0, 1, 2].map(k => [pos[(v + k) * 3], pos[(v + k) * 3 + 1], pos[(v + k) * 3 + 2]]);
        const n = [0, 1, 2].map(k => [nor[(v + k) * 3], nor[(v + k) * 3 + 1], nor[(v + k) * 3 + 2]]);
        const e1 = p[1].map((x, i) => x - p[0][i]);
        const e2 = p[2].map((x, i) => x - p[0][i]);
        const c = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
        const len = Math.hypot(...c);
        if (len > 1e-14) out.push({p, n, face: c.map(x => x / len)});
    }
    return out;
};
const key = p => p.map(x => Math.round(x * 1e7)).join(',');

/** Pairs of triangles sharing an edge (two vertex positions), with the shared vertex indices in each. */
const sharedEdges = tris => {
    const byEdge = new Map();
    tris.forEach((t, i) => {
        for (let a = 0; a < 3; a++) {
            const b = (a + 1) % 3;
            const k = [key(t.p[a]), key(t.p[b])].sort().join('|');
            if (!byEdge.has(k)) byEdge.set(k, []);
            byEdge.get(k).push([i, a, b]);
        }
    });
    const pairs = [];
    for (const list of byEdge.values()) {
        if (list.length !== 2) continue;
        const [[i, a1, b1], [j, a2, b2]] = list;
        // match vertices by position
        const vi = [a1, b1];
        const vj = key(tris[j].p[a2]) === key(tris[i].p[a1]) ? [a2, b2] : [b2, a2];
        pairs.push({t: tris[i], u: tris[j], vi, vj});
    }
    return pairs;
};

test('a beam\'s edge lines are its LDraw type-2 lines, one segment each, in the world frame', () => {
    const flat = flattenPart(BEAM, read);
    const {edges, conditional} = partVisual(BEAM, read, colors);
    assert.ok(flat.edges.length > 100, `beam 7 has many edge lines (${flat.edges.length})`);
    assert.equal(edges.attributes.position.count, flat.edges.length * 2, 'one segment per type-2 line');
    assert.equal(conditional.attributes.position.count, flat.optional.length * 2, 'one segment per type-5 line');
    assert.ok(flat.optional.length > 100, 'beam 7 has conditional lines on its round ends and holes');
    // Every LDraw edge appears as a segment, mapped (x, -y, -z) * 0.0004.
    const seg = new Set();
    const pos = edges.attributes.position.array;
    for (let v = 0; v < pos.length; v += 6) {
        seg.add([key(pos.slice(v, v + 3)), key(pos.slice(v + 3, v + 6))].sort().join('|'));
    }
    const world = q => [q[0] * LDU_M, -q[1] * LDU_M, -q[2] * LDU_M];
    for (const [a, b] of flat.edges) assert.ok(seg.has([key(world(a)), key(world(b))].sort().join('|')), `edge ${a} → ${b}`);
});

test('LDraw BFC is honoured: a beam\'s faces all wind outward (positive enclosed volume)', () => {
    // The divergence theorem: Σ p0·(p1×p2)/6 over outward-wound triangles is the volume.
    let v = 0;
    let magnitude = 0;
    for (const poly of flattenPart(BEAM, read).polys) {
        for (let i = 1; i + 1 < poly.length; i++) {
            const [a, b, c] = [poly[0], poly[i], poly[i + 1]];
            const t = (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6;
            v += t;
            magnitude += Math.abs(t);
        }
    }
    // A 7 × 1 × 1 beam is at most 140 × 20 × 20 LDU; less its seven bores it is still well over half that.
    assert.ok(v > 20000 && v < 140 * 20 * 20, `beam volume ${v} LDU³`);
    assert.ok(magnitude > 0);
});

test('edge lines use the LDConfig EDGE colour of the placed colour; fixed-colour edges their own colour\'s EDGE', () => {
    const mech = compile(MODEL, CATALOG);
    const built = buildSimScene({model: MODEL, mechanism: mech, read, colors, catalog: CATALOG});
    try {
        let checked = 0;
        for (const pl of MODEL.parts) {
            const mesh = built.partMeshes.get(pl.id);
            const lines = mesh.children.find(c => c.isLineSegments && c.userData.edgeLines === 'edges');
            if (!flattenPart(pl.part, read).edges.length) {
                // LDraw draws no edges on some parts (the castor ball): none are made up.
                assert.equal(lines, undefined, `${pl.id} has no LDraw edges and no edge lines`);
                continue;
            }
            assert.ok(lines, `${pl.id} has edge lines`);
            const expected = new Color(colors.get(pl.color).edge);
            assert.ok(lines.material[0].color.equals(expected), `${pl.id} (colour ${pl.color}) edge ${lines.material[0].color.getHexString()} = LDConfig EDGE ${colors.get(pl.color).edge}`);
            checked++;
        }
        assert.ok(checked >= MODEL.parts.length - 1, `checked ${checked} parts`);
        // The wheel's tyre is moulded in a fixed colour: its edges carry that colour's EDGE per vertex.
        const wheelPl = MODEL.parts.find(p => p.part === WHEEL);
        const flat = flattenPart(WHEEL, read);
        const tyreCodes = new Set(flat.edgeColours.filter(c => c !== 16));
        assert.equal(tyreCodes.size, 1, 'the tyre is one fixed colour');
        const [tyre] = tyreCodes;
        const lines = built.partMeshes.get(wheelPl.id).children.find(c => c.userData.edgeLines === 'edges');
        const group1 = lines.geometry.groups.find(g => g.materialIndex === 1);
        assert.equal(group1.count, flat.edgeColours.filter(c => c === tyre).length * 2, 'every tyre edge in the fixed group');
        const rgb = new Color(colors.get(tyre).edge);
        const col = lines.geometry.attributes.color;
        for (let v = group1.start; v < group1.start + group1.count; v++) {
            assert.ok(Math.abs(col.getX(v) - rgb.r) < 1e-6 && Math.abs(col.getY(v) - rgb.g) < 1e-6 && Math.abs(col.getZ(v) - rgb.b) < 1e-6, `tyre edge vertex ${v}`);
        }
        assert.ok(lines.material[1].vertexColors, 'the fixed group is drawn from vertex colours');
    } finally {
        built.dispose();
    }
});

test('creased normals: a beam\'s flat side is flat and its 90° creases sharp', () => {
    const tris = triangles(partVisual(BEAM, read, colors).faces);
    const pairs = sharedEdges(tris);
    const coplanar = pairs.filter(({t, u}) => deg(t.face, u.face) < 1e-3);
    const square = pairs.filter(({t, u}) => Math.abs(deg(t.face, u.face) - 90) < 1e-3);
    assert.ok(coplanar.length > 50 && square.length > 50, `beam has coplanar (${coplanar.length}) and 90° (${square.length}) neighbours`);
    // The flat side with the holes: faces normal to the bore axis (from LDraw's hole primitives).
    const bore = circularFeatures(flattenPart(BEAM, read).primitives).find(f => /beamhol|connhole|peghole/.test(f.file)).axis;
    const axis = [bore[0], -bore[1], -bore[2]];
    const side = coplanar.filter(({t}) => Math.abs(Math.abs(t.face[0] * axis[0] + t.face[1] * axis[1] + t.face[2] * axis[2]) - 1) < 1e-6);
    assert.ok(side.length > 50, `the holed side has many coplanar neighbours (${side.length})`);
    for (const {t, u, vi, vj} of coplanar) {
        // Neighbours in one plane share the normal at their common vertices (also on round surfaces).
        for (let k = 0; k < 2; k++) assert.ok(deg(t.n[vi[k]], u.n[vj[k]]) < 1e-3, 'adjacent coplanar faces share a normal');
    }
    for (const {t, vi} of side) {
        // The holed side stays flat: it meets the bores and the round ends at 90°, so nothing bends it.
        for (let k = 0; k < 2; k++) assert.ok(deg(t.n[vi[k]], t.face) < 1e-3, 'the flat side\'s normal is its face normal');
    }
    for (const {t, u, vi, vj} of square) {
        for (let k = 0; k < 2; k++) assert.ok(deg(t.n[vi[k]], u.n[vj[k]]) > 80, 'a 90° crease keeps two normals');
    }
});

test('creased normals: the tyre\'s surface shades smoothly', () => {
    const geo = partVisual(WHEEL, read, colors).faces;
    const fixed = geo.groups.find(g => g.materialIndex === 1);
    const tyre = triangles(geo, fixed.start, fixed.count);
    const gentle = sharedEdges(tyre).filter(({t, u}) => {
        const a = deg(t.face, u.face);
        return a > 2 && a < 30;
    });
    assert.ok(gentle.length > 200, `the tyre has many gently angled neighbours (${gentle.length})`);
    let smooth = 0;
    for (const {t, u, vi, vj} of gentle) {
        const faceAngle = deg(t.face, u.face);
        for (let k = 0; k < 2; k++) {
            assert.ok(deg(t.n[vi[k]], u.n[vj[k]]) < 1e-3, `one normal where faces meet at ${faceAngle.toFixed(1)}°`);
            // The shared normal lies between the two face normals, not on either.
            if (deg(t.n[vi[k]], t.face) > 0.2 * faceAngle && deg(u.n[vj[k]], u.face) > 0.2 * faceAngle) smooth++;
        }
    }
    assert.ok(smooth > gentle.length, `the normals vary across faces (${smooth} of ${gentle.length * 2} shared vertices)`);
});

test('a motor\'s drive hub is its own mesh in the output body and turns with it under real physics', async () => {
    const {loadJolt, createPhysicsCore} = await import('../overlay/scratch-gui/src/lib/bw-sim/physics/jolt-core.js');
    const {SimHubBridge, STEP_MS} = await import('../overlay/scratch-gui/src/lib/bw-sim/hub-bridge.js');
    const VirtualSpikeHubState = (await import('../overlay/scratch-gui/src/lib/virtual-hub/spike-hub-state.js')).default;
    const mech = compile(MODEL, CATALOG);
    const motors = MODEL.parts.filter(p => p.part === MOTOR);
    assert.equal(motors.length, 2, 'the driving base has two motors');
    const J = await loadJolt();
    const core = createPhysicsCore(J, mech, {stepHz: 1000 / STEP_MS});
    const hubState = new VirtualSpikeHubState();
    const bodyOf = node => mech.bodies.find(b => b.parts.includes(node));
    // The motor's hinge on its port joins housing (body1) and output (body2).
    const motorJoint = port => mech.joints.find(j => j.motor && j.motor.port === port);
    const bridge = new SimHubBridge({hubState, core, mechanism: mech, hubBody: bodyOf('hub').id});
    const built = buildSimScene({model: MODEL, mechanism: mech, read, colors, catalog: CATALOG});
    try {
        // The hub mesh is exactly the LDraw drive-hub sub-file; housing + hub are the whole motor.
        const hubTris = triCount(flattenPart(HUB_FILE, read).polys);
        const allTris = triCount(flattenPart(MOTOR, read).polys);
        assert.ok(parseLDraw(read(`parts/${MOTOR}`)).refs.some(r => r.file.toLowerCase() === HUB_FILE));
        for (const m of motors) {
            const hub = built.hubMeshes.get(m.id);
            const housing = built.partMeshes.get(m.id);
            assert.ok(hub, `${m.id} has a drive-hub mesh`);
            assert.equal(hub.geometry.attributes.position.count / 3, hubTris, `${m.id} hub = ${HUB_FILE}`);
            assert.equal((hub.geometry.attributes.position.count + housing.geometry.attributes.position.count) / 3, allTris);
            assert.equal(hub.parent, built.bodyGroups.get(motorJoint(m.port).body2), `${m.id} hub in the output body`);
            assert.equal(housing.parent, built.bodyGroups.get(motorJoint(m.port).body1), `${m.id} housing in the housing body`);
            assert.ok(mech.bodies.find(b => b.id === motorJoint(m.port).body2).parts.includes(m.port === 'A' ? 'wheelL' : 'wheelR'),
                'the output body is the one carrying the wheel');
            assert.notEqual(hub.parent, housing.parent);
            assert.ok(hub.children.some(c => c.userData.edgeLines === 'edges'), 'the hub carries its own edge lines');
        }
        built.scene.updateMatrixWorld(true);
        const pose = o => ({q: o.getWorldQuaternion(new Quaternion()), c: new Box3().setFromObject(o).getCenter(new Vector3())});
        const before = new Map(motors.map(m => [m.id, {hub: pose(built.hubMeshes.get(m.id)), housing: pose(built.partMeshes.get(m.id))}]));

        hubState.motors.runAtSpeed('A', -400);
        hubState.motors.runAtSpeed('B', 400);
        for (let t = 0; t < 500; t += 50) bridge.tick(50);
        applySnapshot(built, core.snapshot());
        built.scene.updateMatrixWorld(true);

        for (const m of motors) {
            const hub = pose(built.hubMeshes.get(m.id));
            const housing = pose(built.partMeshes.get(m.id));
            const b = before.get(m.id);
            // The hub's turn relative to the housing (both world rotations since t = 0).
            const hubTurn = hub.q.clone().multiply(b.hub.q.clone().invert());
            const housingTurn = housing.q.clone().multiply(b.housing.q.clone().invert());
            const relative = housingTurn.clone().invert().multiply(hubTurn);
            const angle = 2 * Math.acos(Math.min(1, Math.abs(relative.w))) * 180 / Math.PI;
            assert.ok(angle > 20, `${m.id} hub turned ${angle.toFixed(1)}° relative to its housing`);
            // It turns in place on its axle: its centre stays where it was on the housing.
            const offset0 = b.hub.c.clone().sub(b.housing.c).applyQuaternion(housingTurn);
            const offset1 = hub.c.clone().sub(housing.c);
            assert.ok(offset1.distanceTo(offset0) < 0.5e-3, `${m.id} hub stays on its housing (${(offset1.distanceTo(offset0) * 1000).toFixed(2)} mm)`);
            // And it moves exactly as its output body does: mesh pose = body pose × fixed offset.
            const group = built.hubMeshes.get(m.id).parent;
            const expected = group.getWorldQuaternion(new Quaternion()).multiply(built.hubMeshes.get(m.id).quaternion);
            assert.ok(Math.abs(Math.abs(expected.dot(hub.q)) - 1) < 1e-9, `${m.id} hub follows its output body`);
        }
    } finally {
        built.dispose();
        bridge.dispose();
        core.destroy();
    }
});

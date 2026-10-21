// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// Every model the Robot Lab ships (MODELS, static/sim-lab/models/) and every
// model fixture under test/fixtures/bw-sim/ is a build that could exist: no two
// solid parts share volume. Pins, axles and the castor ball sit inside holes and
// sockets, and meshing gears interleave their teeth — those are connections, not
// overlaps (editor/overlap.js sitsInside / placedGearsMesh, the editor's own rule).
//
// Two independent checks, because each misses what the other sees:
//
//  1. Colliders: solidOverlaps (editor/overlap.js) is empty for every part — the
//     rule the editor refuses a move by.
//  2. Real meshes: no point of one solid part's LDraw mesh lies inside another
//     solid part's mesh, deeper than SKIN below its surface. Colliders are boxes
//     around non-box shapes; this is what was found 2026-10-17: the line
//     follower's colour sensor collar was 8 LDU inside its mounting beam, because
//     the SPIKE sensors' pinhole connectors sat at the bottom of their blind
//     holes (test/bw-sim-part-meta.test.mjs now checks the seat).
//
// Point-in-mesh by the GENERALISED WINDING NUMBER (Jacobson et al. 2013): the
// sum of the solid angles the mesh's triangles subtend at the point, over 4π —
// 1 inside, 0 outside. LDraw part meshes are not watertight (hole tunnels meet
// faces at T-junctions, sensors carry internal "see-through blocker" quads), and
// a ray-parity test flips its answer at every such crack; the winding number
// degrades gracefully there (an open seam shifts it by a fraction, not by 1).
// It needs consistent outward winding, which flattenPart provides (BFC resolved).
// A point counts as inside when the number is > 0.5 AND the point is more than
// SKIN from every triangle, so parts that merely touch (a beam on the hub's face,
// coplanar faces) do not count. The points tested are every vertex and every
// triangle centroid of the part (centroids catch a face that crosses another
// part between vertices), both ways round for each pair.

import {phasedMotorRead} from '../overlay/scratch-gui/src/lib/bw-sim/ldraw/motor-phase.js';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync, existsSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseModel} from '../overlay/scratch-gui/src/lib/bw-sim/model/ldraw-model.js';
import {MODELS, MODELS_BASE, catalogFrom} from '../overlay/scratch-gui/src/lib/bw-sim/sim-session.js';
import {solidOverlaps, sitsInside} from '../overlay/scratch-gui/src/lib/bw-sim/editor/overlap.js';
import {placedGearsMesh} from '../overlay/scratch-gui/src/lib/bw-sim/mech/gears.js';
import {flattenPart, bounds} from '../overlay/scratch-gui/src/lib/bw-sim/ldraw/ldraw-geometry.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const GUI = path.join(ROOT, 'overlay/scratch-gui');
const LIB = path.join(GUI, 'static/ldraw');
const CATALOG = catalogFrom(JSON.parse(readFileSync(path.join(GUI, 'src/lib/bw-sim/part-meta/parts.json'), 'utf8')));
const FIXTURES = path.join(ROOT, 'test/fixtures/bw-sim');
const read = p => {
    const f = path.join(LIB, p.toLowerCase());
    return existsSync(f) ? readFileSync(f, 'latin1') : undefined;
};

/** LDU. Deeper than this inside another part's mesh is interpenetration (0.2 mm). */
const SKIN = 0.5;

/** Every model to check: [label, PlacedModel]. */
const models = () => {
    const out = MODELS.map(m => [`models/${m.file}`,
        parseModel(readFileSync(path.join(GUI, MODELS_BASE, m.file), 'utf8'), {catalog: CATALOG}).model]);
    const walk = dir => readdirSync(dir, {withFileTypes: true}).flatMap(e =>
        (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
    for (const file of walk(FIXTURES).sort()) {
        const label = `fixtures/${path.relative(FIXTURES, file)}`;
        if (file.endsWith('.ldr')) out.push([label, parseModel(readFileSync(file, 'utf8'), {catalog: CATALOG}).model]);
        else if (file.endsWith('.json')) {
            const j = JSON.parse(readFileSync(file, 'utf8'));
            const model = j.model || j;
            if (Array.isArray(model.parts)) out.push([label, model]);
        }
    }
    return out;
};

// ---- meshes, in each part's own frame ----------------------------------------

const meshCache = new Map();
/** Triangles as a flat Float64Array (9 per triangle), the points to test, and the bounds. */
const meshOf = (part, rotorAngle = 0) => {
    const key = `${part}@${rotorAngle}`;
    if (meshCache.has(key)) return meshCache.get(key);
    const f = flattenPart(part, phasedMotorRead(part, read, CATALOG.get(part), rotorAngle));
    assert.deepEqual(f.missing, [], `${part} resolves`);
    const tris = [];
    for (const p of f.polys) {
        tris.push([p[0], p[1], p[2]]);
        if (p.length === 4) tris.push([p[0], p[2], p[3]]);
    }
    const T = new Float64Array(tris.length * 9);
    tris.forEach((t, i) => t.forEach((v, j) => T.set(v, i * 9 + j * 3)));
    const keys = new Set();
    const points = [];
    const add = v => {
        const k = v.map(x => x.toFixed(3)).join(',');
        if (!keys.has(k)) { keys.add(k); points.push(v); }
    };
    for (const t of tris) {
        for (const v of t) add(v);
        add([0, 1, 2].map(i => (t[0][i] + t[1][i] + t[2][i]) / 3));
    }
    // Per-triangle bounds, so "is p within SKIN of the surface" skips far triangles cheaply.
    const TB = new Float64Array((T.length / 9) * 6);
    for (let i = 0, k = 0; i < T.length; i += 9, k += 6) {
        for (let a = 0; a < 3; a++) {
            TB[k + a] = Math.min(T[i + a], T[i + 3 + a], T[i + 6 + a]);
            TB[k + 3 + a] = Math.max(T[i + a], T[i + 3 + a], T[i + 6 + a]);
        }
    }
    const m = {T, TB, points, box: bounds(f.polys)};
    meshCache.set(key, m);
    return m;
};

const toWorld = (pl, v) => {
    const r = pl.rotation;
    return [0, 1, 2].map(i => r[i * 3] * v[0] + r[i * 3 + 1] * v[1] + r[i * 3 + 2] * v[2] + pl.position[i]);
};
/** Inverse of toWorld for an orthonormal rotation (Rᵀ). */
const toLocal = (pl, w) => {
    const r = pl.rotation;
    const d = [0, 1, 2].map(i => w[i] - pl.position[i]);
    return [0, 1, 2].map(i => r[i] * d[0] + r[3 + i] * d[1] + r[6 + i] * d[2]);
};

const worldBox = pl => {
    const {box} = meshOf(pl.part, pl.rotorAngle);
    const lo = [Infinity, Infinity, Infinity];
    const hi = [-Infinity, -Infinity, -Infinity];
    for (let c = 0; c < 8; c++) {
        const w = toWorld(pl, [0, 1, 2].map(i => ((c >> i) & 1 ? box.max[i] : box.min[i])));
        for (let i = 0; i < 3; i++) { lo[i] = Math.min(lo[i], w[i]); hi[i] = Math.max(hi[i], w[i]); }
    }
    return {min: lo, max: hi};
};
const boxesMeet = (a, b) => [0, 1, 2].every(i => a.min[i] < b.max[i] - SKIN && b.min[i] < a.max[i] - SKIN);

/** Generalised winding number of the mesh at p (part frame). */
const winding = (T, p) => {
    let sum = 0;
    for (let i = 0; i < T.length; i += 9) {
        const ax = T[i] - p[0], ay = T[i + 1] - p[1], az = T[i + 2] - p[2];
        const bx = T[i + 3] - p[0], by = T[i + 4] - p[1], bz = T[i + 5] - p[2];
        const cx = T[i + 6] - p[0], cy = T[i + 7] - p[1], cz = T[i + 8] - p[2];
        const la = Math.hypot(ax, ay, az), lb = Math.hypot(bx, by, bz), lc = Math.hypot(cx, cy, cz);
        const det = ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx);
        const den = la * lb * lc + (ax * bx + ay * by + az * bz) * lc + (bx * cx + by * cy + bz * cz) * la + (cx * ax + cy * ay + cz * az) * lb;
        sum += 2 * Math.atan2(det, den);
    }
    return sum / (4 * Math.PI);
};

/**
 * Distance from p to the closest triangle of the mesh (Ericson, Real-Time Collision Detection 5.1.5).
 * With `within`, only triangles whose bounds come within that distance are measured, and the
 * search stops at the first one closer than it (returns that distance; Infinity if none is).
 */
const surfaceDistance = ({T, TB}, p, within = Infinity) => {
    let best = Infinity;
    const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
    const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    for (let i = 0, k = 0; i < T.length; i += 9, k += 6) {
        if (within !== Infinity && (p[0] < TB[k] - within || p[0] > TB[k + 3] + within ||
            p[1] < TB[k + 1] - within || p[1] > TB[k + 4] + within || p[2] < TB[k + 2] - within || p[2] > TB[k + 5] + within)) continue;
        const a = [T[i], T[i + 1], T[i + 2]], b = [T[i + 3], T[i + 4], T[i + 5]], c = [T[i + 6], T[i + 7], T[i + 8]];
        const ab = sub(b, a), ac = sub(c, a), ap = sub(p, a);
        const d1 = dot(ab, ap), d2 = dot(ac, ap);
        let q;
        if (d1 <= 0 && d2 <= 0) q = a;
        else {
            const bp = sub(p, b); const d3 = dot(ab, bp), d4 = dot(ac, bp);
            if (d3 >= 0 && d4 <= d3) q = b;
            else {
                const vc = d1 * d4 - d3 * d2;
                if (vc <= 0 && d1 >= 0 && d3 <= 0) { const v = d1 / (d1 - d3); q = [a[0] + v * ab[0], a[1] + v * ab[1], a[2] + v * ab[2]]; }
                else {
                    const cp = sub(p, c); const d5 = dot(ab, cp), d6 = dot(ac, cp);
                    if (d6 >= 0 && d5 <= d6) q = c;
                    else {
                        const vb = d5 * d2 - d1 * d6;
                        if (vb <= 0 && d2 >= 0 && d6 <= 0) { const w = d2 / (d2 - d6); q = [a[0] + w * ac[0], a[1] + w * ac[1], a[2] + w * ac[2]]; }
                        else {
                            const va = d3 * d6 - d5 * d4;
                            if (va <= 0 && (d4 - d3) >= 0 && (d5 - d6) >= 0) {
                                const w = (d4 - d3) / ((d4 - d3) + (d5 - d6));
                                q = [b[0] + w * (c[0] - b[0]), b[1] + w * (c[1] - b[1]), b[2] + w * (c[2] - b[2])];
                            } else {
                                const den = 1 / (va + vb + vc); const v = vb * den, w = vc * den;
                                q = [a[0] + ab[0] * v + ac[0] * w, a[1] + ab[1] * v + ac[1] * w, a[2] + ab[2] * v + ac[2] * w];
                            }
                        }
                    }
                }
            }
        }
        const d = Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
        if (d < best) best = d;
        if (within !== Infinity && best <= within) return best;
    }
    return best;
};

/**
 * Points of `a`'s mesh (world) strictly inside `b`'s mesh: [{point, depth}]. The answer
 * depends only on the two parts and their relative pose, which the models share (they are
 * all built on the same driving base), so it is computed once per relative pose.
 */
const insideCache = new Map();
const pointsInside = (a, b) => {
    const rel = [...[0, 1, 2].flatMap(i => toLocal(b, toWorld(a, [i === 0 ? 1 : 0, i === 1 ? 1 : 0, i === 2 ? 1 : 0]))),
        ...toLocal(b, a.position)].map(v => v.toFixed(3)).join(',');
    const key = `${a.part}@${a.rotorAngle || 0}|${b.part}@${b.rotorAngle || 0}|${rel}`;
    if (!insideCache.has(key)) insideCache.set(key, pointsInsideLocal(a, b));
    return insideCache.get(key).map(({point, depth}) => ({point: toWorld(b, point), depth}));
};
/** The same, with the points in `b`'s frame. */
const pointsInsideLocal = (a, b) => {
    const A = meshOf(a.part, a.rotorAngle);
    const B = meshOf(b.part, b.rotorAngle);
    const lo = B.box.min.map(v => v + SKIN);
    const hi = B.box.max.map(v => v - SKIN);
    const out = [];
    for (const v of A.points) {
        const w = toWorld(a, v);
        const p = toLocal(b, w);
        if (!p.every((x, i) => x > lo[i] && x < hi[i])) continue;
        if (surfaceDistance(B, p, SKIN) <= SKIN) continue; // on the surface: touching, not inside
        if (winding(B.T, p) <= 0.5) continue;
        out.push({point: p, depth: surfaceDistance(B, p)});
    }
    return out;
};

const solidParts = model => model.parts.filter(p => CATALOG.has(p.part) && !sitsInside(CATALOG.get(p.part)));

const MODEL_LIST = models();

test('the models checked are the shipped list and every model fixture', () => {
    const labels = MODEL_LIST.map(([l]) => l);
    for (const m of MODELS) assert.ok(labels.includes(`models/${m.file}`), m.file);
    for (const f of ['fixtures/driving-base.json', 'fixtures/driving-base.ldr', 'fixtures/line-follower.json', 'fixtures/gears/8-24.json']) {
        assert.ok(labels.includes(f), f);
    }
    for (const [label, model] of MODEL_LIST) assert.ok(solidParts(model).length >= 2, `${label}: has solid parts to check`);
});

test('the point-in-mesh test sees a real interpenetration and ignores parts that only touch', () => {
    // A beam 3 pushed 8 LDU into the hub's front face is inside it; the same beam
    // flush on the face (as the castor beam of the driving base stands) is not.
    const hub = {id: 'hub', part: '45601.dat', position: [0, 0, 0], rotation: [1, 0, 0, 0, 1, 0, 0, 0, 1]};
    const flush = {id: 'beam', part: '32523.dat', position: [40, -30, 120], rotation: [-1, 0, 0, 0, 0, 1, 0, 1, 0]};
    const pushed = {...flush, position: [40, -30, 112]};
    assert.deepEqual(pointsInside(flush, hub), []);
    assert.deepEqual(pointsInside(hub, flush), []);
    const deep = [...pointsInside(pushed, hub), ...pointsInside(hub, pushed)];
    assert.ok(deep.length > 0, 'an 8 LDU push into the hub is found');
});

test('no solid part\'s colliders overlap another solid part (solidOverlaps)', () => {
    const found = [];
    for (const [label, model] of MODEL_LIST) {
        for (const p of model.parts) {
            for (const o of solidOverlaps(model, CATALOG, p)) found.push(`${label}: ${p.id} overlaps ${o.part}`);
        }
    }
    assert.deepEqual(found, []);
});

test('no point of a solid part\'s mesh lies inside another solid part\'s mesh', () => {
    const found = [];
    for (const [label, model] of MODEL_LIST) {
        const solids = solidParts(model);
        const boxes = new Map(solids.map(p => [p.id, worldBox(p)]));
        for (let i = 0; i < solids.length; i++) {
            for (let j = i + 1; j < solids.length; j++) {
                const a = solids[i];
                const b = solids[j];
                if (!boxesMeet(boxes.get(a.id), boxes.get(b.id))) continue;
                if (placedGearsMesh(a, CATALOG.get(a.part), b, CATALOG.get(b.part))) continue;
                const hits = [...pointsInside(a, b), ...pointsInside(b, a)];
                if (hits.length) {
                    const worst = hits.reduce((m, h) => (h.depth > m.depth ? h : m));
                    found.push(`${label}: ${a.id} (${a.part}) and ${b.id} (${b.part}) interpenetrate — ${hits.length} points, ` +
                        `deepest ${worst.depth.toFixed(1)} LDU at ${worst.point.map(v => +v.toFixed(1))}`);
                }
            }
        }
    }
    assert.deepEqual(found, []);
});


test('no pin, axle or ball reaches into a solid part beyond its hole or socket', () => {
    // A seated pin lies in its hole's bore, which is outside the part's volume (the bore
    // walls face inward), so its mesh only touches the part. A pin longer than the holes it
    // is in — a 3L pin in a sensor's 18 LDU blind hole — ends inside the part's body.
    const found = [];
    for (const [label, model] of MODEL_LIST) {
        const known = model.parts.filter(p => CATALOG.has(p.part));
        const boxes = new Map(known.map(p => [p.id, worldBox(p)]));
        for (const a of known.filter(p => sitsInside(CATALOG.get(p.part)))) {
            for (const b of solidParts(model)) {
                if (!boxesMeet(boxes.get(a.id), boxes.get(b.id))) continue;
                const hits = pointsInside(a, b);
                if (hits.length) {
                    const worst = hits.reduce((m, h) => (h.depth > m.depth ? h : m));
                    found.push(`${label}: ${a.id} (${a.part}) reaches into ${b.id} (${b.part}) — ${hits.length} points, ` +
                        `deepest ${worst.depth.toFixed(1)} LDU at ${worst.point.map(v => +v.toFixed(1))}`);
                }
            }
        }
    }
    assert.deepEqual(found, []);
});

/**
 * Two shafts cannot fill one stretch of a bore. In the S1 driving base (until 2026-10-17) the
 * front beam's holes took a 2L pin from the hub's side AND one from the castor's side, each
 * 10 LDU into the same 20 LDU hole: the compiler joined everything, every mesh check passed (a
 * pin sits in the bore, outside every solid), and no real build can do it — a 3L pin goes
 * through hub, beam and castor. Here: two pin/axle connectors of different parts on one line
 * whose segments overlap by more than SHARE_EPS (LDU), reported with the hole they share.
 */
const SHARE_EPS = 1;
const SHAFT = new Set(['pin', 'axle']);
const HOLE = new Set(['pinhole', 'axlehole']);
const placedConnectors = (model, types) => model.parts.filter(p => CATALOG.has(p.part)).flatMap(p =>
    CATALOG.get(p.part).connectors.filter(c => types.has(c.type) && c.length).map(c => {
        const r = p.rotation;
        const axis = [0, 1, 2].map(i => r[i * 3] * c.axis[0] + r[i * 3 + 1] * c.axis[1] + r[i * 3 + 2] * c.axis[2]);
        return {part: p.id, id: c.id, position: toWorld(p, c.position), axis, length: c.length};
    }));
const sameLine = (a, b) => {
    const d = [0, 1, 2].map(i => b.position[i] - a.position[i]);
    const along = d[0] * a.axis[0] + d[1] * a.axis[1] + d[2] * a.axis[2];
    const cos = Math.abs(a.axis[0] * b.axis[0] + a.axis[1] * b.axis[1] + a.axis[2] * b.axis[2]);
    return cos > Math.cos(Math.PI / 180) && Math.hypot(...d.map((v, i) => v - along * a.axis[i])) <= 0.5;
};
const span = (c, axis) => {
    const t = c.position[0] * axis[0] + c.position[1] * axis[1] + c.position[2] * axis[2];
    return [t - c.length / 2, t + c.length / 2];
};
const sharedHoles = model => {
    const shafts = placedConnectors(model, SHAFT);
    const holes = placedConnectors(model, HOLE);
    const out = [];
    for (let i = 0; i < shafts.length; i++) {
        for (let j = i + 1; j < shafts.length; j++) {
            const a = shafts[i];
            const b = shafts[j];
            if (a.part === b.part || !sameLine(a, b)) continue;
            const [a0, a1] = span(a, a.axis);
            const [b0, b1] = span(b, a.axis);
            const lo = Math.max(a0, b0);
            const hi = Math.min(a1, b1);
            if (hi - lo <= SHARE_EPS) continue;
            const mid = (lo + hi) / 2;
            const hole = holes.find(h => h.part !== a.part && h.part !== b.part && sameLine(a, h) &&
                span(h, a.axis)[0] <= mid && mid <= span(h, a.axis)[1]);
            out.push(`${a.part} and ${b.part} both fill ${hole ? `${hole.part}'s hole ${hole.id}` : 'one bore'} (${(hi - lo).toFixed(1)} LDU)`);
        }
    }
    return out;
};

test('the shared-hole check sees two pins in one hole and passes one long pin', () => {
    // Beam 7 on its own: a 2L pin from each side, each with one half in its centre hole (y -10..10),
    // as the driving base had them; then one 3L pin through the same hole.
    const beam = {id: 'beam', part: '32524.dat', position: [0, 0, 0], rotation: [1, 0, 0, 0, 1, 0, 0, 0, 1]};
    const ALONG_Y = [0, -1, 0, 1, 0, 0, 0, 0, 1];
    const two = {parts: [beam,
        {id: 'up', part: '2780.dat', position: [0, -10, 0], rotation: ALONG_Y},
        {id: 'down', part: '2780.dat', position: [0, 10, 0], rotation: ALONG_Y}]};
    assert.deepEqual(sharedHoles(two), ['up and down both fill beam\'s hole h3 (20.0 LDU)']);
    // End to end in two neighbouring beams' holes is not sharing.
    const apart = {parts: [beam,
        {id: 'up', part: '2780.dat', position: [0, -20, 0], rotation: ALONG_Y},
        {id: 'down', part: '2780.dat', position: [0, 20, 0], rotation: ALONG_Y}]};
    assert.deepEqual(sharedHoles(apart), []);
    const one = {parts: [beam, {id: 'long', part: '6558.dat', position: [0, 0, 0], rotation: ALONG_Y}]};
    assert.deepEqual(sharedHoles(one), []);
});

test('no two pins or axles fill the same hole', () => {
    const found = [];
    for (const [label, model] of MODEL_LIST) for (const s of sharedHoles(model)) found.push(`${label}: ${s}`);
    assert.deepEqual(found, []);
});


test('a phased motor socket accepts its aligned axle, rejects wrong clocking and still detects over-insertion', () => {
    const motor = {id: 'motor', part: '54696p01.dat', position: [0, 0, 0], rotation: [1,0,0,0,1,0,0,0,1], rotorAngle: 45};
    const c = Math.SQRT1_2;
    const axle = {id: 'shaft', part: '3707.dat', position: [0,-110,0], rotation: [0,c,-c,1,0,0,0,-c,-c]};
    assert.deepEqual(pointsInside(axle, motor), []);
    assert.ok(pointsInside(axle, {...motor, rotorAngle: 0}).length > 0, 'the static zero-angle socket really intersects a 45-degree axle');
    assert.ok(pointsInside({...axle, position: [0,-70,0]}, motor).length > 0, 'phase never excuses reaching past the socket into the housing');
});

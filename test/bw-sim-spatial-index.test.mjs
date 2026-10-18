// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// The build editor's broad phase (mech/spatial-index.js) against brute force, on
// seeded random models: the grid's box and ray queries against testing every box,
// and every function that now consults it — overlap.js (solidOverlaps,
// moveVerdict, freeOffset, rayHitParts), snap.js snapCandidates and graph.js
// buildGraph's connector pairs — on a frozen model (indexed) against the same
// model unfrozen (no index: every part visited, the code path from before the
// index). The answers must be identical, element for element, in the same order.

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {
    PAIR_REACH_LDU, connectorBounds, createSpatialIndex, indexFor, partBounds
} from '../overlay/scratch-gui/src/lib/bw-sim/mech/spatial-index.js';
import {collidersOf, freeOffset, moveVerdict, rayHitParts, solidOverlaps} from '../overlay/scratch-gui/src/lib/bw-sim/editor/overlap.js';
import {snapCandidates} from '../overlay/scratch-gui/src/lib/bw-sim/editor/snap.js';
import {buildGraph} from '../overlay/scratch-gui/src/lib/bw-sim/mech/graph.js';
import {upgradePartMeta} from '../overlay/scratch-gui/src/lib/bw-sim/contracts.js';
import {BUILTIN_KINDS} from '../overlay/scratch-gui/src/lib/bw-sim/kinds/index.js';
import {mul3, worldAxisRotation} from '../overlay/scratch-gui/src/lib/bw-sim/editor/transform-math.js';
import {mat3MulVec3, vecNormalize} from '../overlay/scratch-gui/src/lib/bw-sim/mech/vec.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CATALOG = new Map(JSON.parse(readFileSync(path.join(ROOT, 'overlay/scratch-gui/src/lib/bw-sim/part-meta/parts.json'), 'utf8'))
    .parts.map(p => [p.part, p]));

/** mulberry32: a small seeded generator, so a failure names a seed that reproduces it. */
const rng = seed => () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const pick = (r, list) => list[Math.floor(r() * list.length)];

/** The 24 axis-aligned proper rotations (exact entries). */
const ROTATIONS = (() => {
    const out = new Map();
    const q = Math.PI / 2;
    for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) for (let c = 0; c < 4; c++) {
        const r = mul3(worldAxisRotation('x', a * q), mul3(worldAxisRotation('y', b * q), worldAxisRotation('z', c * q))).map(v => Math.round(v) + 0);
        out.set(r.join(','), r);
    }
    return [...out.values()];
})();

// Parts that pair, collide and mesh: beams, pins, axles, gears, bricks, plates, connectors, a wheel.
const KINDS = ['beam', 'pin', 'axle', 'gear', 'brick', 'plate', 'connector', 'wheel', 'tile'];
const POOL = [...CATALOG.values()].filter(m => KINDS.includes(m.category) && (m.colliders?.length || m.connectors?.length)).map(m => m.part);

/**
 * A crowded random model: `n` parts on a 10 LDU grid in a cube of ±`span` LDU (many touch, overlap
 * and pair), with some exactly seated pairs (a pin moved onto a beam's hole) so pairs are not rare.
 */
const randomModel = (seed, n = 140, span = 160) => {
    const r = rng(seed);
    const parts = [];
    for (let i = 0; i < n; i++) {
        const part = pick(r, POOL);
        const position = [0, 1, 2].map(() => Math.round((r() * 2 - 1) * span / 10) * 10);
        parts.push({id: `p${i + 1}`, part, position, rotation: pick(r, ROTATIONS).slice()});
    }
    // Seat a third of them: a shaft connector (pin, axle) turned onto another part's hole and centred in it.
    const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    for (let i = 0; i < n / 3; i++) {
        const a = pick(r, parts);
        const b = pick(r, parts);
        const shafts = (CATALOG.get(a.part).connectors || []).filter(c => ['pin', 'axle', 'stud', 'ball'].includes(c.type));
        const holes = (CATALOG.get(b.part).connectors || []).filter(c => ['pinhole', 'axlehole', 'antistud', 'ballsocket'].includes(c.type));
        if (a === b || !shafts.length || !holes.length) continue;
        const cs = pick(r, shafts);
        const ch = pick(r, holes);
        const holeAxis = vecNormalize(mat3MulVec3(b.rotation, ch.axis));
        const turns = ROTATIONS.filter(R => Math.abs(Math.abs(dot(vecNormalize(mat3MulVec3(R, cs.axis)), holeAxis)) - 1) < 1e-9);
        if (!turns.length) continue;
        a.rotation = pick(r, turns).slice();
        const at = mat3MulVec3(b.rotation, ch.position).map((v, k) => v + b.position[k]);
        const off = mat3MulVec3(a.rotation, cs.position);
        a.position = at.map((v, k) => v - off[k]);
    }
    return {version: 1, parts};
};
/** The same model frozen (as the editor holds it): the index is used. */
const frozen = model => Object.freeze({...model, parts: Object.freeze(model.parts.map(p => Object.freeze({...p,
    position: Object.freeze(p.position.slice()), rotation: Object.freeze(p.rotation.slice())})))});

const touches = (a, b) => [0, 1, 2].every(k => a.min[k] <= b.max[k] && a.max[k] >= b.min[k]);
const rayThrough = (box, o, d) => {
    let near = 0;
    let far = Infinity;
    for (let k = 0; k < 3; k++) {
        if (Math.abs(d[k]) < 1e-15) {
            if (o[k] < box.min[k] || o[k] > box.max[k]) return false;
            continue;
        }
        let a = (box.min[k] - o[k]) / d[k];
        let b = (box.max[k] - o[k]) / d[k];
        if (a > b) [a, b] = [b, a];
        near = Math.max(near, a);
        far = Math.min(far, b);
        if (near > far) return false;
    }
    return true;
};

test('grid queries: a box query and a ray query return exactly the boxes brute force finds, in index order', () => {
    for (let seed = 1; seed <= 40; seed++) {
        const r = rng(seed);
        const boxes = Array.from({length: 300}, () => {
            if (r() < 0.05) return null; // an item with no extent is never returned
            const c = [0, 1, 2].map(() => (r() * 2 - 1) * 400);
            const h = [0, 1, 2].map(() => r() * (r() < 0.1 ? 200 : 30));
            return {min: c.map((v, k) => v - h[k]), max: c.map((v, k) => v + h[k])};
        });
        const cell = pick(r, [7, 40, 113]);
        const index = createSpatialIndex(boxes, cell);
        for (let q = 0; q < 30; q++) {
            const c = [0, 1, 2].map(() => (r() * 2 - 1) * 500);
            const h = [0, 1, 2].map(() => r() * 80);
            const box = {min: c.map((v, k) => v - h[k]), max: c.map((v, k) => v + h[k])};
            const want = boxes.map((b, i) => (b && touches(b, box) ? i : -1)).filter(i => i >= 0);
            assert.deepEqual(index.queryBox(box), want, `seed ${seed}: box query ${JSON.stringify(box)}`);
            // Rays from outside and inside the occupied region, some along an axis (zero components).
            const o = [0, 1, 2].map(() => (r() * 2 - 1) * (r() < 0.5 ? 1500 : 300));
            let d = [0, 1, 2].map(() => r() * 2 - 1);
            if (r() < 0.3) d[Math.floor(r() * 3)] = 0;
            if (r() < 0.15) d = [0, 0, 0].map((_, k) => (k === Math.floor(r() * 3) ? (r() < 0.5 ? -1 : 1) : 0));
            d = vecNormalize(d.every(v => v === 0) ? [0, 1, 0] : d);
            const rays = boxes.map((b, i) => (b && rayThrough(b, o, d) ? i : -1)).filter(i => i >= 0);
            assert.deepEqual(index.queryRay(o, d), rays, `seed ${seed}: ray from ${o} along ${d}`);
        }
    }
});

test('a part\'s bounds hold all its colliders and connector segments, turned any of the 24 ways', () => {
    const r = rng(7);
    for (const meta of CATALOG.values()) {
        const placed = {position: [0, 1, 2].map(() => Math.round((r() * 2 - 1) * 300)), rotation: pick(r, ROTATIONS)};
        const box = partBounds(placed, meta);
        const inside = p => [0, 1, 2].every(k => p[k] >= box.min[k] - 1e-6 && p[k] <= box.max[k] + 1e-6);
        for (const prim of collidersOf(placed, meta)) {
            // Corners of the collider (a cylinder: of the box overlap.js tests it as; a sphere: its six poles).
            if (prim.shape === 'sphere') {
                for (let k = 0; k < 3; k++) for (const s of [-1, 1]) assert.ok(inside(prim.centre.map((v, i) => v + (i === k ? s * prim.radius : 0))), meta.part);
                continue;
            }
            const axis = prim.shape === 'box' ? prim.axes : null;
            if (axis) {
                for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
                    const p = prim.centre.map((v, k) => v + sx * axis[0][k] * prim.halfExtents[0] + sy * axis[1][k] * prim.halfExtents[1] + sz * axis[2][k] * prim.halfExtents[2]);
                    assert.ok(inside(p), `${meta.part}: box collider corner outside its bounds`);
                }
            } else {
                // A cylinder: points round both rims.
                const a = prim.axis;
                const u = vecNormalize(Math.abs(a[0]) < 0.9 ? [0, -a[2], a[1]] : [-a[2], 0, a[0]]);
                const w = [a[1] * u[2] - a[2] * u[1], a[2] * u[0] - a[0] * u[2], a[0] * u[1] - a[1] * u[0]];
                for (const s of [-1, 1]) for (let t = 0; t < 16; t++) {
                    const c = Math.cos(t * Math.PI / 8) * prim.radius;
                    const n = Math.sin(t * Math.PI / 8) * prim.radius;
                    assert.ok(inside(prim.centre.map((v, k) => v + s * a[k] * prim.halfHeight + c * u[k] + n * w[k])), `${meta.part}: cylinder rim outside`);
                }
            }
        }
        for (const c of meta.connectors || []) {
            const p = mat3MulVec3(placed.rotation, c.position).map((v, k) => v + placed.position[k]);
            const a = vecNormalize(mat3MulVec3(placed.rotation, c.axis));
            for (const s of [-1, 1]) assert.ok(inside(p.map((v, k) => v + s * a[k] * (c.length || 0) / 2)), `${meta.part}: connector ${c.id} end outside`);
        }
    }
});

test('the index is only used, and only cached, for a frozen parts array', () => {
    const model = randomModel(3, 20);
    assert.equal(indexFor(model.parts, CATALOG), null, 'a parts array that may change gets no index');
    const f = frozen(model);
    const index = indexFor(f.parts, CATALOG);
    assert.ok(index && index.size === 20);
    assert.equal(indexFor(f.parts, CATALOG), index, 'the same frozen array: the same index');
});

test('overlaps, move verdicts, free offsets and rays: the indexed answers are the brute-force answers', () => {
    let overlapsSeen = 0;
    let refusals = 0;
    let rayHits = 0;
    for (let seed = 1; seed <= 8; seed++) {
        const r = rng(seed * 101);
        const plain = randomModel(seed);
        const model = frozen(plain);
        assert.ok(indexFor(model.parts, CATALOG));
        for (const p of model.parts) {
            const a = solidOverlaps(plain, CATALOG, plain.parts.find(x => x.id === p.id));
            const b = solidOverlaps(model, CATALOG, p);
            assert.deepEqual(b, a, `seed ${seed}: overlaps of ${p.id}`);
            overlapsSeen += a.length;
        }
        for (let q = 0; q < 25; q++) {
            const ids = [...new Set([pick(r, model.parts).id, pick(r, model.parts).id])];
            const delta = [0, 1, 2].map(() => Math.round((r() * 2 - 1) * 6) * 10);
            const turn = r() < 0.3 ? pick(r, ROTATIONS) : null;
            const moves = ids.map(id => {
                const p = model.parts.find(x => x.id === id);
                return {id, position: p.position.map((v, k) => v + delta[k]), rotation: turn ? mul3(turn, p.rotation) : p.rotation.slice()};
            });
            const connected = r() < 0.3 ? [pick(r, model.parts).id] : [];
            const a = moveVerdict({model: plain, catalog: CATALOG, moves, connected});
            assert.deepEqual(moveVerdict({model, catalog: CATALOG, moves, connected}), a, `seed ${seed}: verdict on ${JSON.stringify(moves)}`);
            if (!a.ok) refusals++;
            const parts = ids.map(id => model.parts.find(x => x.id === id));
            const offsets = [[20, 0, 0], [-40, 0, 0], [0, -24, 0], [0, 0, 60], [200, 0, 0]];
            assert.deepEqual(freeOffset({model, catalog: CATALOG, parts, offsets}), freeOffset({model: plain, catalog: CATALOG, parts, offsets}),
                `seed ${seed}: free offset`);
            const origin = [0, 1, 2].map(() => (r() * 2 - 1) * 600);
            const target = pick(r, model.parts).position;
            const dir = vecNormalize(target.map((v, k) => v - origin[k] + (r() - 0.5) * 20));
            const exclude = r() < 0.3 ? [pick(r, model.parts).id] : [];
            const hits = rayHitParts(plain, CATALOG, origin, dir, {exclude});
            assert.deepEqual(rayHitParts(model, CATALOG, origin, dir, {exclude}), hits, `seed ${seed}: ray`);
            rayHits += hits.length;
        }
    }
    // The random models exercise what they claim to: overlaps, refusals and ray hits all occur.
    assert.ok(overlapsSeen > 100 && refusals > 20 && rayHits > 100, `overlaps ${overlapsSeen}, refusals ${refusals}, ray hits ${rayHits}`);
});

test('the magnet: snapCandidates with the index equals snapCandidates over every part', () => {
    let found = 0;
    // Eight random models: which parts the pool draws depends on the catalogue, and with five the
    // queries near hole-less parts (turntables, actuator parts) left too few candidates to judge by.
    for (let seed = 1; seed <= 8; seed++) {
        const r = rng(seed * 977);
        const plain = randomModel(seed, 100);
        const model = frozen(plain);
        for (let q = 0; q < 16; q++) {
            const near = pick(r, model.parts);
            const part = pick(r, ['2780.dat', '3673.dat', '3705.dat', '32524.dat', '6558.dat', near.part].filter(x => CATALOG.has(x)));
            const pose = {position: near.position.map(v => v + Math.round((r() * 2 - 1) * 30)), rotation: pick(r, ROTATIONS)};
            const exclude = r() < 0.5 ? [near.id] : [];
            const radius = pick(r, [20, 32, 40]);
            const a = snapCandidates({model: {...plain, parts: plain.parts.filter(p => !exclude.includes(p.id))}, catalog: CATALOG, part, pose, radius});
            const b = snapCandidates({model, exclude, catalog: CATALOG, part, pose, radius});
            assert.deepEqual(b, a, `seed ${seed}: ${part} at ${JSON.stringify(pose)}`);
            found += a.length;
        }
    }
    assert.ok(found > 25, `candidates found: ${found}`);
});

test('the compiler\'s connector pairs (graph.js broad phase) are exactly the pairs of every node with every node', () => {
    let pairs = 0;
    for (let seed = 1; seed <= 12; seed++) {
        const model = randomModel(seed, 120);
        const {nodes, edges} = buildGraph(model, CATALOG, []);
        // Brute force: every connector of every node against every connector of every later node.
        const list = [...nodes.values()].sort((a, b) => a.id.localeCompare(b.id));
        const want = [];
        for (let i = 0; i < list.length; i++) {
            for (let j = i + 1; j < list.length; j++) {
                if (list[i].partId === list[j].partId) continue;
                for (const cA of list[i].connectors) {
                    for (const cB of list[j].connectors) {
                        const pair = BUILTIN_KINDS.connectors.pair(cA, cB);
                        if (!pair) continue;
                        const [s, h] = pair.shaft === cA ? [list[i], list[j]] : [list[j], list[i]];
                        want.push(`${h.id}/${pair.hole.id} ${s.id}/${pair.shaft.id} ${pair.kind}`);
                    }
                }
            }
        }
        const got = edges.filter(e => !e._isMotorInternal).map(e => `${e.a.part}/${e.a.connector} ${e.b.part}/${e.b.connector} ${e.kind}`);
        assert.deepEqual([...got].sort(), [...want].sort(), `seed ${seed}`);
        // And every pair the rules joined lies within the broad phase's reach.
        for (const e of edges.filter(x => !x._isMotorInternal)) {
            const ca = nodes.get(e.a.part).connectors.find(c => c.id === e.a.connector);
            const cb = nodes.get(e.b.part).connectors.find(c => c.id === e.b.connector);
            const [ba, bb] = [connectorBounds([ca]), connectorBounds([cb])];
            assert.ok([0, 1, 2].every(k => ba.min[k] - PAIR_REACH_LDU <= bb.max[k] && bb.min[k] - PAIR_REACH_LDU <= ba.max[k]));
        }
        pairs += want.length;
    }
    assert.ok(pairs > 100, `pairs found: ${pairs}`);
    assert.ok(upgradePartMeta(CATALOG.get('2780.dat')));
});

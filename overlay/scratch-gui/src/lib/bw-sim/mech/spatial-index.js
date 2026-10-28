// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// A uniform-grid spatial hash for the build editor's broad phase: which parts
// can a pose touch, which can a pointer ray hit, whose connectors are near a
// point. Without it every overlap check, magnet search and pick visited every
// part of the model (with the colliders and connectors of each transformed
// again): fine for a robot of 100 parts, seconds per pointer move on a
// 2,000-part one. With it the cost follows what is NEAR, not the model's size.
//
// Pure (no three): items are axis-aligned boxes {min, max} in any unit; the
// cell size is the caller's. A query returns item indices in ascending order,
// so a caller that walks "the parts near here" sees them in model order — the
// order the brute-force loops had, which decides ties (snap.js keeps the first
// fixed connector that yields a pose).
//
// The narrow phase stays the callers' own: an index answers "may touch", never
// "touches". Boxes are conservative (every collider, every connector segment
// inside), so a query never drops a part the exact test would have kept;
// test/bw-sim-spatial-index.test.mjs holds this against brute force.
//
// partBounds / indexFor: the editor's models are frozen (editor-state.js), so a
// frozen parts array is a fixed set of fixed poses and its index is cached for
// it; a frozen placed part's bounds are cached for the part object, so the
// index of the next model (one part moved) recomputes one box, not all. An
// array that is not frozen may still change, so it gets no index (callers then
// loop over every part, as before).

import {mat3MulVec3} from './vec.js';

/**
 * How close (LDU) two connectors' segments (`position` ± `axis`·length/2) must come for ANY
 * connector pair rule to join them (registry/kinds.js modules): centres within 0.5 LDU (stud,
 * tube, ball), or coaxial within 0.5 LDU with overlapping segments (pins, axles, slides), axes
 * parallel within 1° — over the longest connector (320 LDU) a 1° tilt moves an end under 3 LDU.
 * A broad-phase margin, never a rule: a new pair rule that reaches further must raise it.
 */
export const PAIR_REACH_LDU = 8;

/** Grid cell edge (LDU): about two hole pitches, the size of a small part. */
export const CELL_LDU = 40;

// Integer cell coordinates packed into one number while they fit (±2^20 cells), else a string key.
const LIMIT = 1 << 20;
const keyOf = (x, y, z) => (Math.abs(x) < LIMIT && Math.abs(y) < LIMIT && Math.abs(z) < LIMIT ?
    ((x + LIMIT) * 2097152 + (y + LIMIT)) * 2097152 + (z + LIMIT) : `${x},${y},${z}`);

const boxesTouch = (a, b) => a.min[0] <= b.max[0] && a.max[0] >= b.min[0] && a.min[1] <= b.max[1] && a.max[1] >= b.min[1] &&
    a.min[2] <= b.max[2] && a.max[2] >= b.min[2];

/**
 * @param {({min: number[], max: number[]}|null)[]} boxes one per item (null: an item with no extent, never returned)
 * @param {number} cell grid cell edge, in the boxes' unit
 * @returns {{size: number, queryBox: (box: {min: number[], max: number[]}) => number[],
 *            queryRay: (origin: number[], dir: number[], maxT?: number) => number[], boxes: object[]}}
 */
export const createSpatialIndex = (boxes, cell = CELL_LDU) => {
    const cells = new Map();
    const lo = [Infinity, Infinity, Infinity];
    const hi = [-Infinity, -Infinity, -Infinity];
    const c = v => Math.floor(v / cell);
    boxes.forEach((b, i) => {
        if (!b) return;
        for (let k = 0; k < 3; k++) {
            if (b.min[k] < lo[k]) lo[k] = b.min[k];
            if (b.max[k] > hi[k]) hi[k] = b.max[k];
        }
        const x0 = c(b.min[0]), x1 = c(b.max[0]), y0 = c(b.min[1]), y1 = c(b.max[1]), z0 = c(b.min[2]), z1 = c(b.max[2]);
        for (let x = x0; x <= x1; x++) {
            for (let y = y0; y <= y1; y++) {
                for (let z = z0; z <= z1; z++) {
                    const key = keyOf(x, y, z);
                    const list = cells.get(key);
                    if (list) list.push(i);
                    else cells.set(key, [i]);
                }
            }
        }
    });
    const empty = lo[0] === Infinity;
    const sorted = set => Array.from(set).sort((a, b) => a - b);

    /** Items whose box touches `box` (closed intervals: touching counts). */
    const queryBox = box => {
        const found = new Set();
        if (empty) return [];
        const x0 = c(Math.max(box.min[0], lo[0])), x1 = c(Math.min(box.max[0], hi[0]));
        const y0 = c(Math.max(box.min[1], lo[1])), y1 = c(Math.min(box.max[1], hi[1]));
        const z0 = c(Math.max(box.min[2], lo[2])), z1 = c(Math.min(box.max[2], hi[2]));
        for (let x = x0; x <= x1; x++) {
            for (let y = y0; y <= y1; y++) {
                for (let z = z0; z <= z1; z++) {
                    const list = cells.get(keyOf(x, y, z));
                    if (!list) continue;
                    for (const i of list) if (!found.has(i) && boxesTouch(boxes[i], box)) found.add(i);
                }
            }
        }
        return sorted(found);
    };

    /**
     * Items whose box the ray origin + t·dir (t ≥ 0, up to maxT) passes through: a 3D DDA over the
     * cells the ray crosses inside the occupied region (Amanatides & Woo), each item box then slab-tested.
     */
    const queryRay = (origin, dir, maxT = Infinity) => {
        if (empty) return [];
        // Clip the ray to the occupied region.
        let t0 = 0;
        let t1 = maxT;
        for (let k = 0; k < 3; k++) {
            if (Math.abs(dir[k]) < 1e-15) {
                if (origin[k] < lo[k] || origin[k] > hi[k]) return [];
                continue;
            }
            let a = (lo[k] - origin[k]) / dir[k];
            let b = (hi[k] - origin[k]) / dir[k];
            if (a > b) [a, b] = [b, a];
            if (a > t0) t0 = a;
            if (b < t1) t1 = b;
            if (t0 > t1) return [];
        }
        const found = new Set();
        const tested = new Set();
        const rayHitsBox = b => {
            let near = 0;
            let far = maxT;
            for (let k = 0; k < 3; k++) {
                if (Math.abs(dir[k]) < 1e-15) {
                    if (origin[k] < b.min[k] || origin[k] > b.max[k]) return false;
                    continue;
                }
                let a = (b.min[k] - origin[k]) / dir[k];
                let d = (b.max[k] - origin[k]) / dir[k];
                if (a > d) [a, d] = [d, a];
                if (a > near) near = a;
                if (d < far) far = d;
                if (near > far) return false;
            }
            return true;
        };
        const start = [0, 1, 2].map(k => origin[k] + dir[k] * t0);
        const end = [0, 1, 2].map(k => origin[k] + dir[k] * t1);
        const cellAt = [0, 1, 2].map(k => c(start[k]));
        const last = [0, 1, 2].map(k => c(end[k]));
        const step = [0, 1, 2].map(k => (dir[k] > 0 ? 1 : dir[k] < 0 ? -1 : 0));
        const tMax = [0, 1, 2].map(k => {
            if (!step[k]) return Infinity;
            const boundary = (cellAt[k] + (step[k] > 0 ? 1 : 0)) * cell;
            return t0 + (boundary - start[k]) / dir[k];
        });
        const tDelta = [0, 1, 2].map(k => (step[k] ? cell / Math.abs(dir[k]) : Infinity));
        // Enough steps to cross the region (plus slack for rounding at cell boundaries).
        let guard = Math.abs(last[0] - cellAt[0]) + Math.abs(last[1] - cellAt[1]) + Math.abs(last[2] - cellAt[2]) + 4;
        for (;;) {
            const list = cells.get(keyOf(cellAt[0], cellAt[1], cellAt[2]));
            if (list) {
                for (const i of list) {
                    if (tested.has(i)) continue;
                    tested.add(i);
                    if (rayHitsBox(boxes[i])) found.add(i);
                }
            }
            if (guard-- <= 0) break;
            const k = tMax[0] < tMax[1] ? (tMax[0] < tMax[2] ? 0 : 2) : (tMax[1] < tMax[2] ? 1 : 2);
            if (tMax[k] > t1) break;
            cellAt[k] += step[k];
            tMax[k] += tDelta[k];
        }
        return sorted(found);
    };

    return {size: boxes.length, boxes, queryBox, queryRay};
};

/** A box grown by `by` on every side. */
export const grow = (box, by) => ({min: box.min.map(v => v - by), max: box.max.map(v => v + by)});

/** The box around some points (null for none). */
export const boxOfPoints = points => {
    if (!points.length) return null;
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (const p of points) {
        for (let k = 0; k < 3; k++) {
            if (p[k] < min[k]) min[k] = p[k];
            if (p[k] > max[k]) max[k] = p[k];
        }
    }
    return {min, max};
};

/**
 * How far a collider reaches from its centre along a model axis, for a collider placed with
 * rotation `rot` (the part's) — box: Σ|axis_i·e_k|·h_i; cylinder: its bounding box's (overlap.js
 * tests cylinders as that box or tighter); sphere: its radius.
 */
const quatToAxes = q => {
    const [x, y, z, w] = q;
    return [
        [1 - 2 * (y * y + z * z), 2 * (x * y + w * z), 2 * (x * z - w * y)],
        [2 * (x * y - w * z), 1 - 2 * (x * x + z * z), 2 * (y * z + w * x)],
        [2 * (x * z + w * y), 2 * (y * z - w * x), 1 - 2 * (x * x + y * y)]
    ];
};
const unit = v => {
    const n = Math.hypot(v[0], v[1], v[2]) || 1;
    return [v[0] / n, v[1] / n, v[2] / n];
};
const colliderReach = (c, rot) => {
    if (c.shape === 'sphere') return [c.radius, c.radius, c.radius];
    const local = c.rotation ? quatToAxes(c.rotation) : [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
    const axes = local.map(a => unit(mat3MulVec3(rot, a)));
    const half = c.shape === 'box' ? c.halfExtents : [c.radius, c.halfHeight, c.radius];
    if (c.shape === 'cylinder') {
        // Any two directions across the axis: the reach of a cylinder is at most that of its square box,
        // whichever way the box is turned about the axis (|a|+|b| ≤ √2·r covers every turn).
        const axis = axes[1];
        const r = c.radius;
        return [0, 1, 2].map(k => Math.abs(axis[k]) * c.halfHeight + Math.SQRT2 * r * Math.sqrt(Math.max(0, 1 - axis[k] * axis[k])) + 1e-9);
    }
    return [0, 1, 2].map(k => axes.reduce((s, a, i) => s + Math.abs(a[k]) * half[i], 0) + 1e-9);
};

/**
 * The box around connectors already in the model frame ({position, axis, length}), or null for none.
 * @param {{position: number[], axis: number[], length?: number}[]} connectors
 */
export const connectorBounds = connectors => {
    if (!connectors.length) return null;
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (const c of connectors) {
        const half = (c.length || 0) / 2;
        for (let k = 0; k < 3; k++) {
            const reach = Math.abs(c.axis ? c.axis[k] : 0) * half + 1e-9;
            if (c.position[k] - reach < min[k]) min[k] = c.position[k] - reach;
            if (c.position[k] + reach > max[k]) max[k] = c.position[k] + reach;
        }
    }
    return {min, max};
};

const boundsCache = new WeakMap(); // frozen placed part → {meta, box}

/**
 * The box (LDU, model frame) around a placed part's colliders and connector segments
 * (each connector's `position` ± `axis`·length/2), or null for a part with neither.
 * @param {{position: number[], rotation: number[]}} placed
 * @param {object} meta PartMeta
 */
export const partBounds = (placed, meta) => {
    if (!meta) return null;
    const cached = Object.isFrozen(placed) ? boundsCache.get(placed) : null;
    if (cached && cached.meta === meta) return cached.box;
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    const rot = placed.rotation;
    const pos = placed.position;
    const add = (centre, reach) => {
        for (let k = 0; k < 3; k++) {
            if (centre[k] - reach[k] < min[k]) min[k] = centre[k] - reach[k];
            if (centre[k] + reach[k] > max[k]) max[k] = centre[k] + reach[k];
        }
    };
    for (const c of meta.colliders || []) {
        const local = mat3MulVec3(rot, c.position || [0, 0, 0]);
        add([local[0] + pos[0], local[1] + pos[1], local[2] + pos[2]], colliderReach(c, rot));
    }
    for (const c of meta.connectors || []) {
        const local = mat3MulVec3(rot, c.position);
        const axis = c.axis ? unit(mat3MulVec3(rot, c.axis)) : [0, 0, 0];
        const half = (c.length || 0) / 2;
        add([local[0] + pos[0], local[1] + pos[1], local[2] + pos[2]], axis.map(v => Math.abs(v) * half + 1e-9));
    }
    const box = min[0] === Infinity ? null : {min, max};
    if (Object.isFrozen(placed)) boundsCache.set(placed, {meta, box});
    return box;
};

const indexCache = new WeakMap(); // frozen parts array → {catalog, index}

/**
 * The spatial index of a model's parts (partBounds boxes; item i is parts[i]), cached for a frozen
 * parts array; null for one that is not frozen (it may still change: the caller loops over every part).
 * @param {object[]} parts
 * @param {Map} catalog part → PartMeta
 */
export const indexFor = (parts, catalog) => {
    if (!Array.isArray(parts) || !Object.isFrozen(parts)) return null;
    const cached = indexCache.get(parts);
    // The catalogue Map may grow (sim-lab.js loads its second piece into it): a part unknown then has a box now.
    if (cached && cached.catalog === catalog && cached.size === catalog.size) return cached.index;
    const index = createSpatialIndex(parts.map(p => partBounds(p, catalog.get(p.part))));
    indexCache.set(parts, {catalog, size: catalog.size, index});
    return index;
};

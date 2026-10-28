// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
// Box colliders from a part's own LDraw mesh (docs/data/part-collider-derivations.json).
import {flattenPart} from '../../overlay/scratch-gui/src/lib/bw-sim/ldraw/ldraw-geometry.js';
const AXES = {x: 0, y: 1, z: 2};
const QUANTUM = 0.0001; // LDU; outward error stays below the existing 0.01 LDU overhang guard.
const area = p => {
    let sum = 0;
    for (let i = 1; i + 1 < p.length; i++) {
        const a = p[i].map((v, k) => v - p[0][k]);
        const b = p[i + 1].map((v, k) => v - p[0][k]);
        sum += Math.hypot(a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]) / 2;
    }
    return sum;
};
const clip = (poly, axis, bound, lower) => {
    const out = [];
    if (!poly.length) return out;
    let a = poly.at(-1), da = (a[axis] - bound) * (lower ? 1 : -1);
    for (const b of poly) {
        const db = (b[axis] - bound) * (lower ? 1 : -1);
        if ((da >= 0) !== (db >= 0)) {
            const t = da / (da - db);
            const v = a.map((x, i) => x + t * (b[i] - x));
            v[axis] = bound;
            out.push(v);
        }
        if (db >= 0) out.push(b);
        a = b; da = db;
    }
    return out;
};
/** Centre rounding must never move an endpoint inward. Recheck the represented interval. */
export const conservativeInterval = (lo, hi) => {
    if (![lo, hi].every(Number.isFinite) || hi < lo) throw new Error('invalid collider interval');
    const centre = Math.round((lo / 2 + hi / 2) / QUANTUM) * QUANTUM + 0;
    let half = Math.max(QUANTUM, Math.ceil(Math.max(centre - lo, hi - centre) / QUANTUM) * QUANTUM);
    if (![centre, half].every(Number.isFinite)) throw new Error('unrepresentable collider interval');
    while (centre - half > lo || centre + half < hi) {
        const next = half + QUANTUM;
        if (!(next > half)) throw new Error('unrepresentable collider interval');
        half = next;
    }
    return [centre, half];
};
/** The boxes of one derivation entry, as parts.json colliders ({shape, halfExtents, position}). */
export function deriveBoxes(part, entry, read) {
    const f = flattenPart(part, read);
    if (f.missing.length) throw new Error(`${part}: missing ${f.missing.join(', ')}`);
    return entry.boxes.map(({what, ranges, open = false, span}) => {
        const planes = Object.entries(ranges).map(([a, bounds], i) => [AXES[a], i === 0 && span ? span : bounds]);
        if (!planes.length || planes.some(([a, b]) => a === undefined || b.length !== 2 || !b.every(Number.isFinite) || b[0] >= b[1])) throw new Error(`${part}: invalid ranges for ${what}`);
        // Clip every face, including faces with no original vertex inside the slab.
        // Open features own positive-area interior faces and their limiting edges,
        // but not a face lying wholly on an excluded plane (the adjacent feature owns it).
        const inside = f.polys.flatMap(face => {
            let poly = face;
            for (const [a, [l, h]] of planes) poly = clip(clip(poly, a, l, true), a, h, false);
            if (!(area(poly) > 0)) return [];
            if (open && planes.some(([a, bounds]) => bounds.some(b => poly.every(v => v[a] === b)))) return [];
            return poly;
        });
        if (!inside.length) throw new Error(`${part}: no mesh inside ${what}`);
        const lo = [0, 1, 2].map(i => Math.min(...inside.map(v => v[i])));
        const hi = [0, 1, 2].map(i => Math.max(...inside.map(v => v[i])));
        // The first range spans the box along its axis (a face need not have a vertex on the boundary);
        // any further range only selects vertices.
        const [axis, bounds] = planes[0];
        [lo[axis], hi[axis]] = bounds;
        const intervals = lo.map((v, i) => conservativeInterval(v, hi[i]));
        return {shape: 'box', halfExtents: intervals.map(x => x[1]), position: intervals.map(x => x[0])};
    });
}


// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
// Box colliders from a part's own LDraw mesh (docs/data/part-collider-derivations.json).
import {flattenPart} from '../../overlay/scratch-gui/src/lib/bw-sim/ldraw/ldraw-geometry.js';
const AXES = {x: 0, y: 1, z: 2};
const round = v => Math.round(v * 100) / 100 + 0;
/** The boxes of one derivation entry, as parts.json colliders ({shape, halfExtents, position}). */
export function deriveBoxes(part, entry, read) {
    const f = flattenPart(part, read);
    if (f.missing.length) throw new Error(`${part}: missing ${f.missing.join(', ')}`);
    const points = f.polys.flat();
    return entry.boxes.map(({what, ranges, open = false, span}) => {
        const within = (x, lo, hi) => (open ? x > lo && x < hi : x >= lo && x <= hi);
        const inside = points.filter(v => Object.entries(ranges).every(([a, [lo, hi]]) => within(v[AXES[a]], lo, hi)));
        if (!inside.length) throw new Error(`${part}: no mesh inside ${what}`);
        const lo = [0, 1, 2].map(i => Math.min(...inside.map(v => v[i])));
        const hi = [0, 1, 2].map(i => Math.max(...inside.map(v => v[i])));
        // The first range spans the box along its axis (a face need not have a vertex on the boundary);
        // any further range only selects vertices.
        const [axis, [l, h]] = Object.entries(ranges)[0];
        [lo[AXES[axis]], hi[AXES[axis]]] = span || [l, h];
        return {shape: 'box', halfExtents: [0, 1, 2].map(i => round((hi[i] - lo[i]) / 2)), position: [0, 1, 2].map(i => round((hi[i] + lo[i]) / 2))};
    });
}


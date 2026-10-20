// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// Loose groups of a model from elsewhere (docs/ROBOT-LAB-REAL-MODELS.md). A real set is built: every part of it
// is held. When a group of its parts still connects to nothing, our reading of a part is off, not the model —
// a hole derived as blind that the pin goes through (the 4x4 Off-Roader's turntable: 268 parts hung on one
// 3L axle-pin in it), a hole a few LDU short, a pin centred 3 LDU off a derived bore. Such a group is joined
// by its nearest shaft-in-hole near-miss to another group, under relaxed rules (RESCUE: about 2°, 4 LDU
// across, 1 LDU engaged, blind bottoms ignored), until nothing more joins. Never for our own files: there a
// loose part is the builder's to fix, and the Lab says so.

import {edgeKind, MIN_ENGAGE_LDU} from '../kinds/pin-axle.js';

export const RESCUE = Object.freeze({cosAngle: Math.cos(2 * Math.PI / 180), lateralLdu: 4, engagedLdu: 1});

const SHAFTS = new Set(['pin', 'axle']);
const HOLES = new Set(['pinhole', 'axlehole']);
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** How badly a shaft misses a hole (lower is better), or null when it misses by more than RESCUE allows. */
const nearMiss = (s, h) => {
    if (!edgeKind(s, h) || typeof s.length !== 'number' || typeof h.length !== 'number') return null;
    const cos = Math.abs(dot(s.axis, h.axis));
    if (cos < RESCUE.cosAngle) return null;
    const d = [0, 1, 2].map(i => h.position[i] - s.position[i]);
    const axial = dot(d, s.axis);
    const lateral = Math.hypot(...d.map((v, i) => v - axial * s.axis[i]));
    if (lateral > RESCUE.lateralLdu) return null;
    const engaged = Math.min(s.length / 2, axial + h.length / 2) - Math.max(-s.length / 2, axial - h.length / 2);
    if (engaged < RESCUE.engagedLdu) return null;
    return lateral + (1 - cos) * 100 + Math.max(0, Math.min(MIN_ENGAGE_LDU, s.length, h.length) - engaged) / 2;
};

/**
 * Edges that join a model's loose groups to the rest (buildGraph's nodes and edges; neither is changed).
 * @returns {{edges: object[], groups: string[][]}} the new edges (kind from edgeKind, `rescued: true`), and the
 *   part ids of each group they joined
 */
export const rescueLoose = (nodes, edges) => {
    const parent = new Map([...nodes.keys()].map(id => [id, id]));
    const find = x => {
        while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); }
        return x;
    };
    const union = (a, b) => { const ra = find(a); const rb = find(b); if (ra !== rb) parent.set(ra, rb); };
    for (const e of edges) if (parent.has(e.a.part) && parent.has(e.b.part)) union(e.a.part, e.b.part);
    // A part's nodes (a motor's housing and output) belong together.
    const byPart = new Map();
    for (const n of nodes.values()) {
        if (byPart.has(n.partId)) union(byPart.get(n.partId), n.id); else byPart.set(n.partId, n.id);
    }
    const plugs = [];
    for (const n of nodes.values()) for (const c of n.connectors) if (SHAFTS.has(c.type) || HOLES.has(c.type)) plugs.push({n, c});
    // A grid of CELL LDU: a near-miss is within half a pin's length of its hole, so the 27 cells round a plug hold it.
    const CELL = 40;
    const cellOf = v => v.map(x => Math.floor(x / CELL));
    const grid = new Map();
    for (const q of plugs) {
        const k = cellOf(q.c.position).join(',');
        if (!grid.has(k)) grid.set(k, []);
        grid.get(k).push(q);
    }
    const near = function* (pos) {
        const [x, y, z] = cellOf(pos);
        for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) yield* (grid.get(`${x + dx},${y + dy},${z + dz}`) || []);
    };
    const added = [];
    const groups = [];
    for (let pass = 0; pass < 8; pass++) {
        const members = new Map();
        for (const id of nodes.keys()) {
            const r = find(id);
            if (!members.has(r)) members.set(r, []);
            members.get(r).push(id);
        }
        if (members.size < 2) break;
        const main = [...members.entries()].sort((a, b) => b[1].length - a[1].length || (a[0] < b[0] ? -1 : 1))[0][0];
        let joined = false;
        for (const [root, ids] of [...members.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
            if (root === main || find(root) !== root) continue;
            const inGroup = new Set(ids);
            let best = null;
            for (const p of plugs) {
                if (!inGroup.has(p.n.id)) continue;
                for (const q of near(p.c.position)) {
                    if (find(q.n.id) === root) continue;
                    const [s, h] = SHAFTS.has(p.c.type) ? [p, q] : [q, p];
                    if (!SHAFTS.has(s.c.type) || !HOLES.has(h.c.type)) continue;
                    const score = nearMiss(s.c, h.c);
                    if (score !== null && (!best || score < best.score)) best = {score, s, h};
                }
            }
            if (!best) continue;
            const {s, h} = best;
            added.push({a: {part: h.n.id, connector: h.c.id}, b: {part: s.n.id, connector: s.c.id}, kind: edgeKind(s.c, h.c),
                point: h.c.position.slice(), axis: h.c.axis.slice(), rescued: true});
            groups.push([...new Set(ids.map(id => nodes.get(id).partId))]);
            union(s.n.id, h.n.id);
            joined = true;
        }
        if (!joined) break;
    }
    return {edges: added, groups};
};

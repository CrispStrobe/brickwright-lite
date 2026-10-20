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

/** Parts a coupling holds, not the connector graph (kinds/chain.js: chain and tread links): never welded, nor welded to. */
const COUPLED = new Set(['chain-link']);
const coupled = n => n.connectors.some(c => COUPLED.has(c.type));

/** How far apart two parts' boxes may be and still touch (LDU): half a plate's rounding. */
export const TOUCH_LDU = 1;

/** A node's colliders as model-frame axis-aligned boxes [min, max] (LDU). */
const boxesOf = n => (n.meta.colliders || []).map(c => {
    const he = c.shape === 'box' ? c.halfExtents : c.shape === 'cylinder' ? [c.radius, c.halfHeight, c.radius] : [c.radius, c.radius, c.radius];
    const p0 = c.position || [0, 0, 0];
    const R = n.placed.rotation;
    const lo = [Infinity, Infinity, Infinity];
    const hi = [-Infinity, -Infinity, -Infinity];
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
        const l = [p0[0] + sx * he[0], p0[1] + sy * he[1], p0[2] + sz * he[2]];
        for (let i = 0; i < 3; i++) {
            const w = R[i * 3] * l[0] + R[i * 3 + 1] * l[1] + R[i * 3 + 2] * l[2] + n.placed.position[i];
            lo[i] = Math.min(lo[i], w);
            hi[i] = Math.max(hi[i], w);
        }
    }
    return [lo, hi];
});
const touchVolume = (a, b) => {
    let v = 1;
    for (let i = 0; i < 3; i++) {
        const d = Math.min(a[1][i], b[1][i]) - Math.max(a[0][i], b[0][i]) + TOUCH_LDU;
        if (d <= 0) return 0;
        v *= d;
    }
    return v;
};

/**
 * The last resort for a model from elsewhere: a group still connected to nothing (after rescueLoose) is welded to
 * the part outside it that it touches most. It is held in the real set by something we do not read (a part's
 * connector we derive wrongly, a clip, a panel's tab); welded it may lock a motion, but the model holds together
 * instead of falling apart. Groups of parts with no connectors at all (tyres, plugs, stickers) are left to
 * kinds/tyre.js, which knows a tyre goes on its rim; chain and tread links (COUPLED) to kinds/chain.js.
 * @returns {{pairs: Array<[string, string]>, groups: string[][]}} node pairs to weld, and each welded group's part ids
 */
export const weldByContact = (nodes, edges) => {
    const parent = new Map([...nodes.keys()].map(id => [id, id]));
    const find = x => {
        while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); }
        return x;
    };
    const union = (a, b) => { const ra = find(a); const rb = find(b); if (ra !== rb) parent.set(ra, rb); };
    for (const e of edges) if (parent.has(e.a.part) && parent.has(e.b.part)) union(e.a.part, e.b.part);
    const byPart = new Map();
    for (const n of nodes.values()) {
        if (byPart.has(n.partId)) union(byPart.get(n.partId), n.id); else byPart.set(n.partId, n.id);
    }
    const boxes = new Map([...nodes.values()].map(n => [n.id, boxesOf(n)]));
    // A grid of CELL LDU over every box, to find a box's neighbours.
    const CELL = 40;
    const grid = new Map();
    for (const [id, bs] of boxes) {
        for (const [lo, hi] of bs) {
            for (let x = Math.floor(lo[0] / CELL); x <= Math.floor(hi[0] / CELL); x++) {
                for (let y = Math.floor(lo[1] / CELL); y <= Math.floor(hi[1] / CELL); y++) {
                    for (let z = Math.floor(lo[2] / CELL); z <= Math.floor(hi[2] / CELL); z++) {
                        const k = `${x},${y},${z}`;
                        if (!grid.has(k)) grid.set(k, new Set());
                        grid.get(k).add(id);
                    }
                }
            }
        }
    }
    const neighbours = id => {
        const out = new Set();
        for (const [lo, hi] of boxes.get(id)) {
            for (let x = Math.floor((lo[0] - TOUCH_LDU) / CELL); x <= Math.floor((hi[0] + TOUCH_LDU) / CELL); x++) {
                for (let y = Math.floor((lo[1] - TOUCH_LDU) / CELL); y <= Math.floor((hi[1] + TOUCH_LDU) / CELL); y++) {
                    for (let z = Math.floor((lo[2] - TOUCH_LDU) / CELL); z <= Math.floor((hi[2] + TOUCH_LDU) / CELL); z++) {
                        for (const o of grid.get(`${x},${y},${z}`) || []) out.add(o);
                    }
                }
            }
        }
        return out;
    };
    const pairs = [];
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
            if (ids.every(id => !nodes.get(id).connectors.length)) continue;
            // A tread's links welded to each other and to its sprockets make the track a rigid loop that ties the
            // sprockets together (the Bulldozer 8275 flew apart).
            if (ids.some(id => coupled(nodes.get(id)))) continue;
            let best = null;
            for (const id of ids) {
                for (const o of neighbours(id)) {
                    if (find(o) === root || coupled(nodes.get(o))) continue;
                    let v = 0;
                    for (const a of boxes.get(id)) for (const b of boxes.get(o)) v += touchVolume(a, b);
                    if (v > 0 && (!best || v > best.v || (v === best.v && `${id}|${o}` < best.key))) best = {v, id, o, key: `${id}|${o}`};
                }
            }
            if (!best) continue;
            pairs.push([best.id, best.o]);
            groups.push([...new Set(ids.map(id => nodes.get(id).partId))]);
            union(best.id, best.o);
            joined = true;
        }
        if (!joined) break;
    }
    return {pairs, groups};
};

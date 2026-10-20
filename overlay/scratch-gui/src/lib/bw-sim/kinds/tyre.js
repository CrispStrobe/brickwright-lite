// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// Parts with nothing to connect by (part-meta/catalog-parts.js decoration: no pin, no axle, no stud): a
// tyre grips its rim, an NXT cable's plug sits in its socket, a sticker on its brick — LDraw draws each
// as a part of its own, and the connector graph joins none, so a real model's tyres and plugs lay on the
// floor beside it (the NXT Tri-bot from the LDraw library). Coupling module 'tyre' (emits no coupling):
// each such part is welded to the part its colliders overlap most (a tyre, flagged `tyre`, to the
// part centred nearest it within TYRE_REACH_LDU: its rim sits inside it). A ball is a toy, never welded.

import {mat3MulVec3} from '../mech/vec.js';

/** How far a rim's centre may be from its tyre's (LDU): a rim sits in the tyre, give or take a stud. */
export const TYRE_REACH_LDU = 20;

/** A placed node's colliders as model-frame axis-aligned boxes [min, max] (LDU). */
const boxesOf = n => (n.meta.colliders || []).map(c => {
    const he = c.shape === 'box' ? c.halfExtents : c.shape === 'cylinder' ? [c.radius, c.halfHeight, c.radius] : [c.radius, c.radius, c.radius];
    const p0 = c.position || [0, 0, 0];
    const corners = [];
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
        const local = [p0[0] + sx * he[0], p0[1] + sy * he[1], p0[2] + sz * he[2]];
        const w = mat3MulVec3(n.placed.rotation, local);
        corners.push([w[0] + n.placed.position[0], w[1] + n.placed.position[1], w[2] + n.placed.position[2]]);
    }
    return [[0, 1, 2].map(i => Math.min(...corners.map(v => v[i]))), [0, 1, 2].map(i => Math.max(...corners.map(v => v[i])))];
});
const overlap = (a, b) => {
    let v = 1;
    for (let i = 0; i < 3; i++) {
        const d = Math.min(a[1][i], b[1][i]) - Math.max(a[0][i], b[0][i]);
        if (d <= 0) return 0;
        v *= d;
    }
    return v;
};

export const TYRE = {
    id: 'tyre',
    kind: 'tyre',
    detect ({nodes, islands}) {
        const welds = [];
        const placed = [...nodes.entries()].map(([nodeId, n]) => ({n, island: islands.nodeToBody.get(nodeId)})).filter(x => x.island && x.n.meta);
        const loneParts = placed.filter(x => (x.n.meta.tyre || x.n.meta.decoration) && !(x.n.meta.connectors || []).length &&
            !/^ball\b/i.test(x.n.meta.name || ''));
        if (!loneParts.length) return {welds};
        const boxes = new Map(placed.map(x => [x, boxesOf(x.n)]));
        for (const t of loneParts) {
            let best = null;
            let bestScore = 0;
            for (const o of placed) {
                if (o.n.partId === t.n.partId || loneParts.includes(o)) continue;
                let score;
                if (t.n.meta.tyre) {
                    const [p, q] = [o.n.placed.position, t.n.placed.position];
                    const d = Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
                    score = d <= TYRE_REACH_LDU ? TYRE_REACH_LDU + 1 - d : 0;
                } else {
                    score = 0;
                    for (const a of boxes.get(t)) for (const b of boxes.get(o)) score += overlap(a, b);
                }
                if (score > bestScore) { bestScore = score; best = o; }
            }
            if (best && best.island !== t.island) welds.push([t.island, best.island]);
        }
        return {welds};
    },
    validate: () => []
};

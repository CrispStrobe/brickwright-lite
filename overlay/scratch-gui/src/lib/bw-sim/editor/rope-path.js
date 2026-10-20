// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// Ropes (docs/ROBOT-LAB-UX.md §15, architecture M10): a string from a winch drum, over pulleys,
// down to a hook. LDraw has strings only as fixed shapes, so a rope is the model's `ropes` record
// ({id, around: [drum, sheave…, hook], lengthLdu}) and this module says where it runs. Pure.
//
// Its points (model frame, LDU): the drum's centre (a part with a circle: a bush, a pulley, a
// wheel — editor/belt-path.js partCircle; the rope winds round it), each sheave's centre (its
// circle, else the part's origin), and the hook's top (the highest point of its colliders,
// where the string is tied). Tied, a rope is taut: its length is the sum of its segments.

import {partCircle, placedCircle} from './belt-path.js';

const mulVec = (m, v) => [0, 1, 2].map(r => m[r * 3] * v[0] + m[r * 3 + 1] * v[1] + m[r * 3 + 2] * v[2]);
const add = (a, b) => a.map((x, i) => x + b[i]);
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
/** A rotation quaternion [x, y, z, w] applied to v. */
const rotate = (q, v) => {
    const [x, y, z, w] = q;
    const t = [2 * (y * v[2] - z * v[1]), 2 * (z * v[0] - x * v[2]), 2 * (x * v[1] - y * v[0])];
    return [v[0] + w * t[0] + (y * t[2] - z * t[1]), v[1] + w * t[1] + (z * t[0] - x * t[2]), v[2] + w * t[2] + (x * t[1] - y * t[0])];
};

/** The top of a part as placed (LDraw: up is −y): the highest point of its colliders, under that collider's middle. */
export const partTop = (pl, meta) => {
    let best = null;
    for (const c of (meta && meta.colliders) || []) {
        const centre = add(mulVec(pl.rotation, c.position || [0, 0, 0]), pl.position);
        const h = c.shape === 'box' ? c.halfExtents : c.shape === 'cylinder' ? [c.radius, c.halfHeight, c.radius] : [c.radius, c.radius, c.radius];
        for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
            const local = c.rotation ? rotate(c.rotation, [sx * h[0], sy * h[1], sz * h[2]]) : [sx * h[0], sy * h[1], sz * h[2]];
            const y = centre[1] + mulVec(pl.rotation, local)[1];
            if (!best || y < best[1] - 1e-9) best = [centre[0], y, centre[2]];
        }
    }
    return best || pl.position.slice();
};

/** A rope's points (model frame, LDU) for `around` [drum, sheave…, hook], or null when a part is gone or the drum is not round. */
export const ropePoints = (model, catalogMap, around) => {
    const byId = new Map(model.parts.map(p => [p.id, p]));
    const pls = around.map(id => byId.get(id));
    if (pls.some(p => !p)) return null;
    const drum = placedCircle(pls[0], catalogMap.get(pls[0].part));
    if (!drum) return null;
    const sheaves = pls.slice(1, -1).map(pl => {
        const c = placedCircle(pl, catalogMap.get(pl.part));
        return c ? c.center : pl.position.slice();
    });
    const hook = pls.at(-1);
    return [drum.center, ...sheaves, partTop(hook, catalogMap.get(hook.part))];
};

/** The rope's length along its points (LDU). */
export const ropeLength = points => points.slice(1).reduce((s, p, i) => s + dist(points[i], p), 0);

/**
 * A rope tied from the first selected part (the drum) over the middle ones to the last (the hook):
 * {around, lengthLdu, points} or {error: 'needTwo'|'drumNotRound'|'tooShort', parts?}.
 */
export const ropeTie = (model, catalogMap, ids) => {
    if (ids.length < 2) return {error: 'needTwo'};
    const byId = new Map(model.parts.map(p => [p.id, p]));
    const drum = byId.get(ids[0]);
    if (!drum || !partCircle(catalogMap.get(drum.part))) return {error: 'drumNotRound', parts: [ids[0]]};
    const points = ropePoints(model, catalogMap, ids);
    if (!points) return {error: 'drumNotRound', parts: [ids[0]]};
    const lengthLdu = ropeLength(points);
    if (lengthLdu < 10) return {error: 'tooShort'};
    return {around: ids.slice(), lengthLdu: Math.round(lengthLdu * 10) / 10, points};
};

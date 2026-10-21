// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// Pneumatic hoses (docs/ROBOT-LAB-UX.md §16): where a hose goes between two parts' air ports. Pure.
// LDraw has the tubes only as fixed shapes, so a hose is the model's `hoses` record ({id, a: {part,
// port}, b: {part, port}}) and its path is drawn: out of each nozzle along its axis, sagging between.

const mulVec = (m, v) => [0, 1, 2].map(r => m[r * 3] * v[0] + m[r * 3 + 1] * v[1] + m[r * 3 + 2] * v[2]);
const add = (a, b) => a.map((x, i) => x + b[i]);
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/** A placed part's air ports in the model frame: [{id, role, at (LDU), out (unit)}]. */
export const placedPorts = (pl, meta) => ((meta && meta.connectors) || []).filter(c => c.type === 'air-port').map(c => ({
    id: c.id, role: c.data.role, at: add(mulVec(pl.rotation, c.position), pl.position), out: mulVec(pl.rotation, c.axis)
}));

/**
 * The pairs of roles a hose is for: a valve's outlet to a cylinder's port, and on the supply side a
 * pump, a tank or a T-piece to a valve's supply or to each other (kinds/pneumatic.js air networks).
 */
const goodPair = (r1, r2) => {
    const outlet = ['outA', 'outB'];
    const cyl = ['extend', 'retract'];
    const supply = ['supply', 'pump', 'tank', 'tee'];
    return (outlet.includes(r1) && cyl.includes(r2)) || (cyl.includes(r1) && outlet.includes(r2)) ||
        (supply.includes(r1) && supply.includes(r2) && !(r1 === 'supply' && r2 === 'supply'));
};

/**
 * A hose between the two selected parts: the nearest pair of their free air ports, a valve's outlet
 * and a cylinder's port first: {a: {part, port}, b: {part, port}, roles: [a's, b's]} or {error: 'needTwo'|'noPorts'|'allUsed'}.
 * @param {{parts: object[], hoses?: object[]}} model
 * @param {Map<string, object>} catalogMap
 * @param {string[]} ids
 */
export const hoseTie = (model, catalogMap, ids) => {
    if (ids.length !== 2) return {error: 'needTwo'};
    const byId = new Map(model.parts.map(p => [p.id, p]));
    const used = new Set((model.hoses || []).flatMap(h => [`${h.a.part}:${h.a.port}`, `${h.b.part}:${h.b.port}`]));
    const [p, q] = ids.map(id => byId.get(id));
    const [pp, qp] = [p, q].map(pl => (pl ? placedPorts(pl, catalogMap.get(pl.part)) : []));
    if (!pp.length || !qp.length) return {error: 'noPorts'};
    const free = (pl, ports) => ports.filter(x => !used.has(`${pl.id}:${x.id}`));
    const pairs = [];
    for (const a of free(p, pp)) for (const b of free(q, qp)) pairs.push({a, b, good: goodPair(a.role, b.role), d: dist(a.at, b.at)});
    if (!pairs.length) return {error: 'allUsed'};
    pairs.sort((x, y) => (y.good - x.good) || (x.d - y.d));
    const [best] = pairs;
    return {a: {part: p.id, port: best.a.id}, b: {part: q.id, port: best.b.id}, roles: [best.a.role, best.b.role]};
};

/** A hose's drawn path (model frame, LDU): from one nozzle, out along it, sagging, into the other. null when a part or port is gone. */
export const hosePoints = (model, catalogMap, hose) => {
    const byId = new Map(model.parts.map(p => [p.id, p]));
    const ends = [hose.a, hose.b].map(e => {
        const pl = byId.get(e.part);
        return pl && placedPorts(pl, catalogMap.get(pl.part)).find(x => x.id === e.port);
    });
    if (ends.some(e => !e)) return null;
    return hoseCurve(ends[0].at, ends[0].out, ends[1].at, ends[1].out);
};

/** The curve between two nozzles (each a point and its outward axis), LDU: out 30 LDU, then a sag (+y is down). */
export const hoseCurve = (a, aOut, b, bOut) => {
    const reach = 30;
    const span = dist(a, b);
    const a1 = add(a, aOut.map(v => v * reach));
    const b1 = add(b, bOut.map(v => v * reach));
    const mid = a1.map((v, i) => (v + b1[i]) / 2);
    mid[1] += Math.min(80, span * 0.25);
    return [a, a1, mid, b1, b];
};

// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// Which parts of a mechanism must not collide beyond the jointed body pairs (owner decision D2:
// everything collides except what is joined; contracts.js noCollidePairs). compile.js calls these
// on the connection graph and the islands; the physics core applies the result as a Jolt
// GroupFilterTable (body pairs) and, for the pairs filtered part by part, a SimShapeFilter.

import {lduToWorld, dirToWorld} from '../contracts.js';

/**
 * The connector axes of the graph: every connector endpoint joined to another by an edge (a pin in
 * a hole, an axle through holes, a ball in its socket, a motor's output in its housing) is one
 * axis group, so two beams on one pin, a gear and its spacer on one axle, or a wheel on a motor's
 * output share one. A motor's internal hinge joins its housing (a pseudo endpoint: the housing's
 * own holes are other axes) to its output connector.
 * @param {object[]} edges graph edges (graph.js)
 * @returns {Map<string, string[]>} group root → node ids (graph nodes) in the group
 */
export const axisGroups = edges => {
    const parent = new Map();
    const find = x => {
        if (!parent.has(x)) parent.set(x, x);
        let r = x;
        while (parent.get(r) !== r) r = parent.get(r);
        parent.set(x, r);
        return r;
    };
    const union = (a, b) => {
        const ra = find(a);
        const rb = find(b);
        if (ra !== rb) parent.set(ra < rb ? rb : ra, ra < rb ? ra : rb);
    };
    const nodeOf = new Map();
    const key = (node, connector) => {
        const k = `${node}\n${connector}`;
        nodeOf.set(k, node);
        return k;
    };
    for (const e of edges) {
        const a = e._isMotorInternal ? key(e.a.part, '#axis') : key(e.a.part, e.a.connector);
        union(a, key(e.b.part, e.b.connector));
    }
    const groups = new Map();
    for (const [k, node] of nodeOf) {
        const r = find(k);
        if (!groups.has(r)) groups.set(r, new Set());
        groups.get(r).add(node);
    }
    return new Map([...groups].map(([r, set]) => [r, [...set].sort()]));
};

/**
 * Body pairs that meet on one connector axis (axisGroups): their parts are seated on the same pin
 * or axle, face to face, whether or not a joint joins the two bodies directly. Two beams on a
 * frictionless pin are each hinged to the PIN, not to each other; their faces touch at zero gap
 * and, as contacts, rubbed (a pendulum lost 6° per half swing to it, test/bw-sim-validation).
 * @param {object[]} edges graph edges
 * @param {{nodeToBody: Map<string, string>}} islands
 * @returns {[string, string][]} body pairs (unordered, possibly repeated)
 */
export const sharedAxisBodyPairs = (edges, islands) => {
    const out = [];
    for (const nodes of axisGroups(edges).values()) {
        const bodies = [...new Set(nodes.map(n => islands.nodeToBody.get(n)).filter(Boolean))].sort();
        for (let i = 0; i < bodies.length; i++) for (let k = i + 1; k < bodies.length; k++) out.push([bodies[i], bodies[k]]);
    }
    return out;
};

/** Rotate v by unit quaternion q [x, y, z, w]. */
const rotate = (q, v) => {
    const [x, y, z, w] = q;
    const t = [2 * (y * v[2] - z * v[1]), 2 * (z * v[0] - x * v[2]), 2 * (x * v[1] - y * v[0])];
    return [v[0] + w * t[0] + y * t[2] - z * t[1], v[1] + w * t[1] + z * t[0] - x * t[2], v[2] + w * t[2] + x * t[1] - y * t[0]];
};
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** A collider's centre relative to p, its half extent along unit d (exact for box, cylinder, sphere) and its bounding radius. Metres. */
const colliderAlong = (body, c, p, d) => {
    const q = c.rotation || [0, 0, 0, 1];
    const centre = (c.position || [0, 0, 0]).map((v, i) => v + body.position[i] - p[i]);
    let half;
    let reach;
    if (c.shape === 'box') {
        half = [0, 1, 2].reduce((s, i) => s + c.halfExtents[i] * Math.abs(dot(rotate(q, [i === 0 ? 1 : 0, i === 1 ? 1 : 0, i === 2 ? 1 : 0]), d)), 0);
        reach = Math.hypot(...c.halfExtents);
    } else if (c.shape === 'cylinder') {
        const ca = Math.abs(dot(rotate(q, [0, 1, 0]), d));
        half = c.halfHeight * ca + c.radius * Math.sqrt(Math.max(0, 1 - ca * ca));
        reach = Math.hypot(c.radius, c.halfHeight);
    } else {
        half = c.radius;
        reach = c.radius;
    }
    return {centre, half, reach};
};

/** Interval [lo, hi] of a part's colliders along unit d, from point p. */
const intervalAlong = (body, colliders, p, d) => colliders.reduce((acc, c) => {
    const {centre, half} = colliderAlong(body, c, p, d);
    const t = dot(centre, d);
    return [Math.min(acc[0], t - half), Math.max(acc[1], t + half)];
}, [Infinity, -Infinity]);

/** Distance from the origin to the convex hull of 2D points (0 inside). */
const hullDistance = pts => {
    const sorted = pts.slice().sort((p, q) => p[0] - q[0] || p[1] - q[1]);
    const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const half = list => list.reduce((h, pt) => {
        while (h.length >= 2 && cross(h[h.length - 2], h[h.length - 1], pt) <= 0) h.pop();
        h.push(pt);
        return h;
    }, []);
    const lower = half(sorted);
    const upper = half(sorted.slice().reverse());
    const hull = [...lower.slice(0, -1), ...upper.slice(0, -1)];
    if (hull.length < 3) return Math.min(...pts.map(pt => Math.hypot(...pt)));
    const inside = hull.every((pt, k) => cross(pt, hull[(k + 1) % hull.length], [0, 0]) >= 0);
    if (inside) return 0;
    return Math.min(...hull.map((p0, k) => {
        const p1 = hull[(k + 1) % hull.length];
        const e = [p1[0] - p0[0], p1[1] - p0[1]];
        const len2 = e[0] * e[0] + e[1] * e[1] || 1;
        const t = Math.max(0, Math.min(1, -(p0[0] * e[0] + p0[1] * e[1]) / len2));
        return Math.hypot(p0[0] + t * e[0], p0[1] + t * e[1]);
    }));
};

/**
 * Band of distances from the line (p, unit a) a part's colliders can occupy: nearest exactly (the
 * collider's box — a cylinder's bounding box — projected across the line), farthest its corners'.
 */
const radialBand = (body, colliders, p, a) => colliders.reduce((acc, c) => {
    const {centre} = colliderAlong(body, c, p, a);
    if (c.shape === 'sphere') {
        const t = dot(centre, a);
        const d = Math.hypot(centre[0] - t * a[0], centre[1] - t * a[1], centre[2] - t * a[2]);
        return [Math.min(acc[0], Math.max(0, d - c.radius)), Math.max(acc[1], d + c.radius)];
    }
    const q = c.rotation || [0, 0, 0, 1];
    const half = c.shape === 'box' ? c.halfExtents : [c.radius, c.halfHeight, c.radius];
    const axes = [[1, 0, 0], [0, 1, 0], [0, 0, 1]].map(v => rotate(q, v));
    const [u, w] = perpendiculars(a);
    const pts = [];
    for (let k = 0; k < 8; k++) {
        const v = [0, 1, 2].reduce((acc2, i) => acc2.map((x, n) => x + axes[i][n] * half[i] * ((k >> i) & 1 ? 1 : -1)), centre.slice());
        pts.push([dot(v, u), dot(v, w)]);
    }
    return [Math.min(acc[0], hullDistance(pts)), Math.max(acc[1], ...pts.map(pt => Math.hypot(...pt)))];
}, [Infinity, -Infinity]);

/** Band of distances from point p a part's colliders can occupy: the exact nearest distance (a cylinder as its box), the bounding farthest. */
const pointBand = (body, colliders, p) => colliders.reduce((acc, c) => {
    const {centre, reach} = colliderAlong(body, c, p, [1, 0, 0]);
    let near;
    if (c.shape === 'sphere') near = Math.max(0, Math.hypot(...centre) - c.radius);
    else {
        const q = c.rotation || [0, 0, 0, 1];
        const half = c.shape === 'box' ? c.halfExtents : [c.radius, c.halfHeight, c.radius];
        // p in the collider's frame: −centre along each of its axes, clamped to the box.
        near = Math.hypot(...[0, 1, 2].map(i => {
            const t = -dot(centre, rotate(q, [i === 0 ? 1 : 0, i === 1 ? 1 : 0, i === 2 ? 1 : 0]));
            return Math.max(0, Math.abs(t) - half[i]);
        }));
    }
    return [Math.min(acc[0], near), Math.max(acc[1], Math.hypot(...centre) + reach)];
}, [Infinity, -Infinity]);

/** Two unit vectors perpendicular to unit a (and to each other). */
const perpendiculars = a => {
    const t = Math.abs(a[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
    const u0 = [t[0] - a[0] * dot(t, a), t[1] - a[1] * dot(t, a), t[2] - a[2] * dot(t, a)];
    const n = Math.hypot(...u0);
    const u = u0.map(v => v / n);
    return [u, [a[1] * u[2] - a[2] * u[1], a[2] * u[0] - a[0] * u[2], a[0] * u[1] - a[1] * u[0]]];
};

/** A collider as an oriented box in world frame (a cylinder or sphere as its bounding box). */
const obbOf = (body, c) => {
    const q = c.rotation || [0, 0, 0, 1];
    const half = c.shape === 'box' ? c.halfExtents : c.shape === 'cylinder' ? [c.radius, c.halfHeight, c.radius] : [c.radius, c.radius, c.radius];
    return {centre: (c.position || [0, 0, 0]).map((v, i) => v + body.position[i]), axes: [[1, 0, 0], [0, 1, 0], [0, 0, 1]].map(v => rotate(q, v)), half};
};

/**
 * Whether two parts' colliders interpenetrate at t = 0 by more than the contact slop (separating-axis
 * test of their boxes). A machine built this way has one part NESTED in the other's collider — a
 * differential's side gears and planets inside its casing's solid envelope, an axle through it — and
 * they cannot be meant to collide: each contact would push them apart from the first step.
 */
const nested = (bA, cA, bB, cB) => cA.some(x => cB.some(y => {
    const a = obbOf(bA, x);
    const b = obbOf(bB, y);
    const d = a.centre.map((v, i) => b.centre[i] - v);
    const cross = (u, v) => [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const axes = [...a.axes, ...b.axes, ...a.axes.flatMap(u => b.axes.map(v => cross(u, v)))];
    return axes.every(n => {
        const len = Math.hypot(...n);
        if (len < 1e-9) return true;
        const u = n.map(v => v / len);
        const r = box => box.axes.reduce((s, ax, i) => s + box.half[i] * Math.abs(dot(ax, u)), 0);
        return r(a) + r(b) - Math.abs(dot(d, u)) > APART_M;
    });
}));

/** Touching counts as apart: faces in contact at zero gap (0.5 LDU = 0.2 mm, the contact slop) never interpenetrate. */
const APART_M = 0.0002;
const apart = (x, y) => x[1] <= y[0] + APART_M || y[1] <= x[0] + APART_M;

/**
 * Which parts of two no-collide bodies must not collide (self-collision across a joint is local, not
 * per body). The physics core filters a body pair whole only when every pair of their parts is
 * excluded here; otherwise it filters just the listed part pairs (a Jolt SimShapeFilter) and the
 * rest collide — an arm on a motor's output swinging into a post fixed on the motor's housing.
 * A part pair is excluded when
 *   - the two parts already interpenetrate at t = 0 (`nested`: a part inside a hollow part's solid
 *     collider, as a differential's gears in its casing — joints a coupling kind makes have no
 *     connector edge to say they are seated), or
 *   - the two parts are seated on one connector axis (axisGroups: a pin and the beams on it, the motor's
 *     output and its housing, an arm pinned into the output and the housing those holes sit in), or
 *   - the bodies turn about one line (their joint is a hinge, or they share a hinge axis group) and
 *     the parts can never meet by that turn: their intervals along the line are apart (faces stacked
 *     along the axis, as two links of a linkage) or their distance bands from it are. A turn about the
 *     line keeps both, so no stop is lost: such parts can only touch at zero gap, and then they rub.
 * Coupled bodies (meshing gears, a rack and its pinion, a registered coupling's) stay excluded whole.
 * @param {object[]} bodies the mechanism's bodies (colliders tagged with `part`, mech/islands.js)
 * @param {object[]} joints
 * @param {[string, string][]} noCollide the body pairs (contracts.js noCollidePairs)
 * @param {[string, string][]} coupled body pairs a coupling ties (kept whole)
 * @param {object[]} edges graph edges
 * @param {{nodeToBody: Map<string, string>}} islands
 * @param {Map<string, object>} nodes graph nodes (node id → {partId})
 * @returns {[string, string, [string, string][]][]} [bodyA, bodyB, part pairs [ofA, ofB]] for the pairs
 *   filtered locally, sorted; a noCollide pair not listed is filtered whole
 */
export const localNoCollide = (bodies, joints, noCollide, coupled, edges, islands, nodes) => {
    const byId = new Map(bodies.map(b => [b.id, b]));
    const keyOf = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);
    const coupledKeys = new Set(coupled.map(([a, b]) => keyOf(a, b)));
    // Seated part pairs per body pair, and the hinge lines that relate the pair.
    const seated = new Map();
    const lines = new Map();
    const addLine = (k, line) => {
        if (!lines.has(k)) lines.set(k, []);
        lines.get(k).push(line);
    };
    const groupEdges = new Map();
    const groups = axisGroups(edges);
    const rootOfNode = new Map();
    for (const [root, members] of groups) for (const n of members) if (!rootOfNode.has(n)) rootOfNode.set(n, root);
    for (const e of edges) {
        const root = rootOfNode.get(e.b.part);
        if (!groupEdges.has(root)) groupEdges.set(root, []);
        groupEdges.get(root).push(e);
    }
    for (const [root, members] of groups) {
        const es = groupEdges.get(root) || [];
        const hingeLine = es.length && es.every(e => e.kind === 'hinge' || e.kind === 'rigid') && es.some(e => e.kind === 'hinge')
            ? es.find(e => e.kind === 'hinge') : null;
        // A motor's housing and output are one part on two bodies: a part seated on the output (a pin in
        // its holes) is seated against the housing too (it reaches into the housing's collider).
        const withHalves = new Set(members);
        for (const m of members) {
            const part = nodes.get(m)?.partId;
            for (const other of [part, `${part}#out`]) if (other && other !== m && nodes.has(other)) withHalves.add(other);
        }
        const placed = [...withHalves].map(n => ({body: islands.nodeToBody.get(n), part: nodes.get(n)?.partId})).filter(x => x.body && x.part);
        for (const x of placed) {
            for (const y of placed) {
                if (x.body >= y.body) continue;
                const k = `${x.body}|${y.body}`;
                if (!seated.has(k)) seated.set(k, new Set());
                seated.get(k).add(`${x.part}\n${y.part}`);
                addLine(k, hingeLine ? {kind: 'hinge', point: lduToWorld(hingeLine.point), axis: dirToWorld(hingeLine.axis)} : {kind: 'other'});
            }
        }
    }
    // A pair joined by a joint moves as that joint lets it: the joint replaces what the groups said.
    const jointed = new Map();
    for (const j of joints) {
        if (j.body2 === 'world') continue;
        const k = keyOf(j.body1, j.body2);
        if (!jointed.has(k)) jointed.set(k, []);
        jointed.get(k).push({kind: ['hinge', 'slider', 'ball'].includes(j.type) ? j.type : 'other', point: j.point, axis: j.axis});
    }
    for (const [k, ls] of jointed) lines.set(k, ls);
    const out = [];
    for (const [A, B] of noCollide) {
        const k = `${A}|${B}`;
        if (coupledKeys.has(k)) continue;
        const bA = byId.get(A);
        const bB = byId.get(B);
        if (!bA || !bB || bA.parts.length === 0 || bB.parts.length === 0) continue;
        if (![...bA.colliders, ...bB.colliders].every(c => typeof c.part === 'string')) continue;
        const partsOf = b => [...new Set(b.colliders.map(c => c.part))].sort();
        const pa = partsOf(bA);
        const pb = partsOf(bB);
        const seatedHere = seated.get(k) || new Set();
        // The motion the two bodies can make relative to each other: one hinge line, one slider axis or one
        // ball point that every relation between them agrees on. Anything else (a kind registered later,
        // relations that disagree): only the seated part pairs are excluded.
        const ls = lines.get(k) || [];
        const unit = v => {
            const len = Math.hypot(...v);
            return v.map(x => x / len);
        };
        let motion = null;
        if (ls.length && ls.every(l => l.kind === ls[0].kind) && ls[0].kind !== 'other') {
            const {kind, point} = ls[0];
            const a0 = kind === 'ball' ? null : unit(ls[0].axis);
            const agree = ls.every(l => {
                const d = l.point.map((v, i) => v - point[i]);
                if (kind === 'ball') return Math.hypot(...d) <= APART_M;
                const a = unit(l.axis);
                if (Math.abs(dot(a, a0)) < Math.cos(Math.PI / 180)) return false;
                if (kind === 'slider') return true;
                const t = dot(d, a0);
                return Math.hypot(d[0] - t * a0[0], d[1] - t * a0[1], d[2] - t * a0[2]) <= APART_M;
            });
            if (agree) motion = {kind, point, axis: a0};
        }
        // Parts the motion can never bring together: what it keeps fixed separates them.
        const never = (cx, cy) => {
            if (!motion) return false;
            const {kind, point, axis} = motion;
            if (kind === 'hinge') {
                return apart(intervalAlong(bA, cx, point, axis), intervalAlong(bB, cy, point, axis)) ||
                    apart(radialBand(bA, cx, point, axis), radialBand(bB, cy, point, axis));
            }
            if (kind === 'slider') return perpendiculars(axis).some(u => apart(intervalAlong(bA, cx, point, u), intervalAlong(bB, cy, point, u)));
            return apart(pointBand(bA, cx, point), pointBand(bB, cy, point));
        };
        const excluded = [];
        let all = true;
        for (const x of pa) {
            const cx = bA.colliders.filter(c => c.part === x);
            for (const y of pb) {
                const cy = bB.colliders.filter(c => c.part === y);
                if (seatedHere.has(`${x}\n${y}`) || never(cx, cy) || nested(bA, cx, bB, cy)) excluded.push([x, y]);
                else all = false;
            }
        }
        if (!all) out.push([A, B, excluded]);
    }
    return out;
};

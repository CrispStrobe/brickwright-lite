// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// Which parts of a mechanism must not collide beyond the jointed body pairs (owner decision D2:
// everything collides except what is joined; contracts.js noCollidePairs). compile.js calls these
// on the connection graph and the islands; the physics core applies the result as a Jolt
// GroupFilterTable (body pairs).

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

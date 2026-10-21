// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// Free pins (compile.js): a frictionless pin or an axle that only joins two parts which turn on
// it — a boom on its pivot, an actuator's eye on the boom — is, to the compiler's islands, a body
// of its own with two collinear hinges: one to each part. Kinematically it adds nothing (its own
// spin about its axis is free and drives nothing), but to the solver it is a 0.25–1 g body whose
// tiny inertia sits between two constraints, and a loop through such bodies (frame – boom –
// actuator – frame) does not converge: measured, a 5 g boom closed through three free 3673/32556
// pins and a linear actuator sagged ±4° at rest and loaded the actuator past its clutch
// (test/bw-sim-linear-actuator.test.mjs).
//
// So such a pin is welded to one of the two parts (the first by body id): the two hinges become
// one hinge between the two parts, on the same line — exactly the joint the pin makes.
//
// A body is a free pin when every part on it is a shaft (no solid collider: pins and axles,
// kinds/pin-axle.js solidColliders), it has two or more joints, all hinges without a motor, to different
// bodies, on one line (with `dangling`, also a single hinge: a pin that holds nothing) (a pin through three beams: each beam hinges on the one it is welded to) (parallel 1°, 0.5 LDU), and no part on it has teeth (a gear on an
// axle is a body of its own) or a tooth connector.

import {COS_1_DEG, vecDot, vecSub, vecScale, vecLen, vecNormalize} from './vec.js';
import {solidColliders} from '../kinds/pin-axle.js';
import {LDU_M} from '../contracts.js';

const TOOTH = new Set(['worm', 'rack-teeth', 'screw-spindle', 'screw-nut', 'turntable-ring', 'turntable-race']);

/** Is the point q on the line (p, unit a) within tol? */
const onLine = (q, p, a, tol) => {
    const d = vecSub(q, p);
    return vecLen(vecSub(d, vecScale(a, vecDot(d, a)))) <= tol;
};

/**
 * @param {Map} nodes graph nodes
 * @param {{bodies: Array, nodeToBody: Map}} islands
 * @param {Array} joints joints.js joints (world frame, m)
 * @returns {[string, string][]} [pin body, part body] pairs to weld
 */
export const freePinWelds = (nodes, islands, joints, {dangling = false} = {}) => {
    const metaOfBody = new Map();
    for (const [nodeId, node] of nodes.entries()) {
        const b = islands.nodeToBody.get(nodeId);
        if (!b) continue;
        if (!metaOfBody.has(b)) metaOfBody.set(b, []);
        metaOfBody.get(b).push(node.meta);
    }
    const out = [];
    for (const body of islands.bodies) {
        const metas = metaOfBody.get(body.id) || [];
        if (!metas.length || metas.some(m => solidColliders(m).length > 0 || m.gear || (m.connectors || []).some(c => TOOTH.has(c.type)))) continue;
        if (metas.some(m => m.internalJoints && m.internalJoints.length)) continue;
        const mine = joints.filter(j => j.body1 === body.id || j.body2 === body.id);
        // A hinge with friction or end stops (a slip clutch's hub on its axle) is a joint that does something.
        if (mine.some(j => j.type !== 'hinge' || j.motor || j.frictionNm || j.limits)) continue;
        // dangling (a model from elsewhere): a pin on ONE hinge, holding nothing (odin's 0.25 g 3673 at the end of a
        // linkage spun up to 500 rad/s and took the model to NaN), is welded to the part it hangs on.
        if (mine.length === 1 && dangling) {
            out.push([body.id, mine[0].body1 === body.id ? mine[0].body2 : mine[0].body1]);
            continue;
        }
        if (mine.length < 2) continue;
        const others = mine.map(j => (j.body1 === body.id ? j.body2 : j.body1));
        if (new Set(others).size !== others.length) continue;
        const a = vecNormalize(mine[0].axis);
        if (mine.some(j => Math.abs(vecDot(a, vecNormalize(j.axis))) < COS_1_DEG - 1e-12 ||
            !onLine(j.point, mine[0].point, a, 0.5 * LDU_M + 1e-9))) continue;
        out.push([body.id, [...others].sort()[0]]);
    }
    return out;
};

// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// Hinges (D3): each hinge or ball edge between different islands is a joint.
// Several hinge edges between same island pair with collinear axes are ONE joint
// (midpoint). Non-collinear hinge edges lock: merge islands + warning.
// Also handles ball joints (point constraint).

import {COS_1_DEG, vecAdd, vecSub, vecDot, vecCross, vecLen, vecScale, vecNormalize, vecDist, lineDistance} from './vec.js';
import {lduToWorld, dirToWorld} from '../contracts.js';

const COS_1 = COS_1_DEG;
const TOL = 0.5 + 1e-9;

/** Check if two axes are parallel (abs dot >= cos1) */
const parallel = (a, b) => Math.abs(vecDot(a, b)) >= COS_1 - 1e-12;

/** Perpendicular distance from point p to line (origin + dir) in LDU */
const perpDist = (p, origin, dir) => {
    const d = vecSub(p, origin);
    const axial = vecDot(d, dir);
    const perp = vecSub(d, vecScale(dir, axial));
    return vecLen(perp);
};

/**
 * Build joints from hinge/ball edges and islands.
 * Does NOT handle locked-hinges merging here – that is orchestrated by compile.js
 * via extraRigidPairs, but this module also provides detection helper.
 *
 * @param {Map<string,object>} nodes
 * @param {Array} edges from graph (rigid/hinge/ball including motor internal)
 * @param {{bodies:Array, nodeToBody:Map, bodyMap:Map}} islands
 * @param {Array} diagnostics
 * @returns {{joints:Array, lockedPairs:Array}} lockedPairs = list of [bodyIdA, bodyIdB] that need merging
 */
export const buildJoints = (nodes, edges, islands, diagnostics = []) => {
    const {nodeToBody, bodyMap} = islands;
    // Collect hinge and ball edges that are between different islands
    const candidates = []; // each {edge, body1, body2, pointLdu, axisLdu, pointWorld, axisWorld, isMotor, motor}
    for (const e of edges) {
        if (e.kind !== 'hinge' && e.kind !== 'ball') continue;
        const b1 = nodeToBody.get(e.a.part);
        const b2 = nodeToBody.get(e.b.part);
        if (!b1 || !b2) continue;
        if (b1 === b2) continue; // same island, ignore (already rigid)
        // Compute world point/axis
        // For hinge: point = hole centre LDU -> world, axis = hole axis LDU -> world
        // For ball: point = ball centre LDU -> world, axis not used
        // For motor internal: point/axis already is output connector's, but still a= housing, b= out, point is output's
        const pointWorld = lduToWorld(e.point);
        // For hinge, axisWorld is dirToWorld of e.axis (which is already in model LDU after R*axis)
        // For ball, we still have axis but joint type ball has no axis; we don't need it.
        const axisWorld = e.axis ? vecNormalize(dirToWorld(e.axis)) : null;
        // Also keep LDU versions for collinear checks
        const pointLdu = e.point.slice();
        const axisLdu = e.axis ? vecNormalize(e.axis.slice()) : null;

        // For hinge, we need to handle axis sign to follow shaft orientation: joint axis should align with shaft direction if possible
        // Spec says axis = hole axis, but to make flipping axle flip ratio we align with shaft when dot <0
        // For non-motor hinge edges, we have both shaft and hole axes available via edge's original connectors? But edge only stores hole axis. We could determine shaft axis from the other node's connector that matched.
        // Simpler: we stored only hole axis. Flipping shaft doesn't change hole axis, so we cannot know shaft direction. However motor case we have explicit motor flag.
        // For now we keep hole axis as is; the test for flipped axle will be handled by making beam holes opposite direction (catalog design) rather than relying on shaft flip.
        // If we want flipping axle to flip joint axis, we can interpret flipping as placing same axle but with opposite orientation, which still connects to same hole (parallel) but the joint axis we produce is still hole axis (unchanged). Ratio would not flip, but task says it should.
        // To satisfy that expectation, we make joint axis follow the shaft axis direction when we can detect it: find shaft connector for this edge to decide sign.
        // We need to retrieve shaft axis from nodes: edge.b is shaft node (convention in graph.js: a=hole, b=shaft). So we can look up shaft node's connector's axis for that edge's connector id.
        // Let's do that.

        let axisWorldOriented = axisWorld;
        if (e.kind === 'hinge' && !e._isMotorInternal) {
            // Find shaft connector's axis
            const shaftNode = nodes.get(e.b.part);
            const shaftConn = shaftNode ? shaftNode.connectors.find(c => c.id === e.b.connector) : null;
            if (shaftConn) {
                // shaft axis LDU is shaftConn.axis, compare with hole axis
                const dot = vecDot(shaftConn.axis, e.axis);
                if (dot < 0 && axisWorld) axisWorldOriented = vecScale(axisWorld, -1);
            }
        }
        // For motor internal, axis should be output connector's axis as stored (hole axis is output's, shaft=out, hole=housing? Actually for motor internal edge, a=housing, b=out, point=out's position, axis=out's axis. That's already shaft direction, so fine.

        candidates.push({
            edge: e,
            body1: b1, // hole island (or housing)
            body2: b2, // shaft island (or output)
            pointLdu,
            axisLdu: axisLdu ? vecNormalize(axisLdu) : null,
            pointWorld,
            axisWorld: axisWorldOriented,
            isMotor: !!e.motor,
            motor: e.motor || null,
            _isMotorInternal: !!e._isMotorInternal,
        });
    }

    // Group hinge candidates by island pair unordered (but need directed body1/body2 for joint)
    // For hinge, grouping key is unordered pair sorted, because axle through two holes of one beam has same body1/body2 (beam island, axle island) for both edges, so they group.
    // For ball, separate grouping.
    // We handle hinge and ball separately: ball joints don't have collinearity concerns; each ball edge is its own joint (but multiple ball edges between same pair? Unlikely, but we handle similarly: if multiple ball edges between same pair with same point within tolerance, merge? Spec says "A ball edge between different islands becomes ONE joint of type ball at the ball centre (body1=socket island, body2=ball island)." So we should group ball edges by pair and deduplicate similar to hinge? But ball has no axis, so collinearity irrelevant. We'll just group ball edges by pair and merge if points within 0.5 (coincident). Simpler: for ball, group by pair and if multiple ball edges between same pair with same point, merge to one. We'll handle generically.

    const hingeGroups = new Map(); // key -> array of candidates where kind hinge
    const ballGroups = new Map();

    for (const c of candidates) {
        const key = [c.body1, c.body2].sort().join('|');
        if (c.edge.kind === 'hinge') {
            if (!hingeGroups.has(key)) hingeGroups.set(key, []);
            hingeGroups.get(key).push(c);
        } else if (c.edge.kind === 'ball') {
            if (!ballGroups.has(key)) ballGroups.set(key, []);
            ballGroups.get(key).push(c);
        }
    }

    const joints = [];
    const lockedPairs = []; // list of [bodyIdA, bodyIdB] that are locked

    // Process hinge groups
    for (const [key, group] of hingeGroups.entries()) {
        if (group.length === 1) {
            // Single hinge
            const g = group[0];
            const joint = {
                id: '', // filled later
                type: 'hinge',
                body1: g.body1,
                body2: g.body2,
                point: g.pointWorld,
                axis: g.axisWorld,
            };
            if (g.motor) joint.motor = {port: g.motor.port, maxTorqueNm: g.motor.maxTorqueNm, maxSpeedRadPerSec: g.motor.maxSpeedRadPerSec};
            joints.push({joint, groupKey: key, members: group});
        } else {
            // Check collinearity among all members
            // Use LDU positions/axes for tolerance 0.5
            const ref = group[0];
            let allCollinear = true;
            for (let i = 1; i < group.length; i++) {
                const cur = group[i];
                if (!parallel(ref.axisLdu, cur.axisLdu)) { allCollinear = false; break; }
                const d = perpDist(cur.pointLdu, ref.pointLdu, ref.axisLdu);
                if (d > TOL) { allCollinear = false; break; }
            }
            if (allCollinear) {
                // ONE joint, point = midpoint of hole centres (average in world)
                // Compute midpoint in LDU then to world, or average world points directly (scale cancels)
                let mx = 0; let my = 0; let mz = 0;
                for (const g of group) { mx += g.pointWorld[0]; my += g.pointWorld[1]; mz += g.pointWorld[2]; }
                mx /= group.length; my /= group.length; mz /= group.length;
                const midWorld = [mx, my, mz];
                // Axis = ref axis (choose first)
                // If multiple axes have opposite directions, we need consistent; they are parallel same direction per check abs, but we used abs. For collinear check we used abs, so opposite direction still considered parallel. Need to choose axis direction consistent with majority. Use ref's axisWorld oriented already.
                // If there are two axes opposite, the average would be ambiguous; we pick ref.

                // Motor handling: if any member is motor internal, its joint should be separate, but motor internal groups are size 1 always (only one edge between housing and output), so they are not in >1 group. So ignore.

                const joint = {
                    id: '',
                    type: 'hinge',
                    body1: ref.body1,
                    body2: ref.body2,
                    point: midWorld,
                    axis: ref.axisWorld,
                };
                // If any member has motor, include it (should not happen for hinge group >1)
                const motorMember = group.find(g => g.motor);
                if (motorMember) joint.motor = {port: motorMember.motor.port, maxTorqueNm: motorMember.motor.maxTorqueNm, maxSpeedRadPerSec: motorMember.motor.maxSpeedRadPerSec};
                joints.push({joint, groupKey: key, members: group});
            } else {
                // Locked: non-collinear hinges between same pair lock it
                const [bA, bB] = key.split('|');
                lockedPairs.push([bA, bB]);
                // No joint created; will be merged and diagnostic added by compile.js
            }
        }
    }

    // Process ball groups: each ball edge between different islands becomes one ball joint at ball centre
    // For ball, point = ball centre world (which is same as socket centre within tolerance). We have edge.point = hole (socket) position LDU. For ball joint, spec: "at the ball centre (body1 = socket island, body2 = ball island)". So point is ball centre world. Our edge.point is socket position (hole). But ball and socket positions coincide within 0.5, so either is fine; we'll use average of socket and ball positions? However we only have socket position stored. To get ball centre, we need shaft (ball) position. Let's retrieve ball position for more accurate: edge.b is ball, edge.a is socket. edge.point is socket position. Ball position is shaft position, which is within 0.5. For ball joint point we should use ball centre (shaft position). We have not stored shaft position; we have edge.point as hole (socket). For ball, hole is socket, shaft is ball. The ball centre is shaft position. We should use shaft position for joint point. Let's adjust: for ball, use ball position.

    for (const [key, group] of ballGroups.entries()) {
        // For each ball edge, determine ball position world
        // group may have multiple ball edges between same island pair but at different positions (e.g., two separate castors). They should be separate joints? Spec says "A ball edge between different islands becomes ONE joint" – implies each edge is a joint. So we should not merge distinct ball positions, each is separate.
        // However if two ball edges are at same point (duplicate), they would be same joint. We'll handle grouping by point proximity: if points within 0.5, merge.

        // For simplicity, if group length 1, create one ball joint per edge
        // For group length >1, check if their points are coincident within 0.5 -> merge if same point, else they are separate joints? But spec suggests ball joints are per edge, not merged like hinge collinear. The phrase "between different islands becomes ONE joint" suggests each ball edge is one joint. So we will create one joint per edge, but need to deduplicate identical positions (distance <=0.5 -> one joint)
        // We'll cluster by point proximity.

        const clusters = [];
        for (const g of group) {
            // Find ball position: shaft node is ball
            const ballNode = nodes.get(g.edge.b.part);
            const ballConn = ballNode ? ballNode.connectors.find(c => c.id === g.edge.b.connector) : null;
            const ballPosLdu = ballConn ? ballConn.position : g.pointLdu; // fallback to socket point
            const ballPosWorld = lduToWorld(ballPosLdu);
            let found = false;
            for (const cl of clusters) {
                if (vecDist(ballPosWorld, cl.representative) <= 0.5 * 0.0004 + 1e-9) { // 0.5 LDU in world meters
                    cl.members.push({g, ballPosWorld});
                    found = true;
                    break;
                }
            }
            if (!found) clusters.push({representative: ballPosWorld, members: [{g, ballPosWorld}]});
        }
        for (const cl of clusters) {
            // For each cluster, create one joint at average ball position
            let mx = 0; let my = 0; let mz = 0;
            for (const m of cl.members) { mx += m.ballPosWorld[0]; my += m.ballPosWorld[1]; mz += m.ballPosWorld[2]; }
            mx /= cl.members.length; my /= cl.members.length; mz /= cl.members.length;
            const mid = [mx, my, mz];
            // body1 = socket island, body2 = ball island per spec
            // For our group, body1 is socket (hole), body2 is ball (shaft) already; but we grouped by unordered key, so we need to determine which is socket vs ball per edge. However all edges in group have same unordered pair, but could have mixed which is socket vs ball? For ball, socket is hole, ball is shaft, so body1 socket, body2 ball consistent. Since we stored a=hole (socket), b=shaft (ball), body1 = socket, body2 = ball. So we can use first member's body1/body2.
            const rep = cl.members[0].g;
            const joint = {
                id: '',
                type: 'ball',
                body1: rep.body1,
                body2: rep.body2,
                point: mid,
            };
            joints.push({joint, groupKey: key, members: cl.members.map(m => m.g)});
        }
    }

    // Deterministic sort of joints by body1, body2, point, axis
    joints.sort((A, B) => {
        const a = A.joint; const b = B.joint;
        let c = a.body1.localeCompare(b.body1);
        if (c !== 0) return c;
        c = a.body2.localeCompare(b.body2);
        if (c !== 0) return c;
        c = a.type.localeCompare(b.type);
        if (c !== 0) return c;
        for (let i = 0; i < 3; i++) {
            if (a.point[i] !== b.point[i]) return a.point[i] - b.point[i];
        }
        if (a.axis && b.axis) {
            for (let i = 0; i < 3; i++) if (a.axis[i] !== b.axis[i]) return a.axis[i] - b.axis[i];
        } else if (a.axis) return -1;
        else if (b.axis) return 1;
        return 0;
    });

    // Assign ids deterministic j+index
    joints.forEach((entry, idx) => { entry.joint.id = `j${idx}`; });

    // Unwrap to list of joint objects
    const jointList = joints.map(e => e.joint);

    return {joints: jointList, lockedPairs, jointEntries: joints};
};

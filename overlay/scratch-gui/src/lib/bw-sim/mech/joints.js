// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// Hinges (D3): each hinge or ball edge between different islands is a joint.
// Several hinge edges between same island pair with collinear axes are ONE joint
// (midpoint). Non-collinear hinge edges lock: merge islands + warning.
// Also handles ball joints (point constraint).

import {COS_1_DEG, vecAdd, vecSub, vecDot, vecCross, vecLen, vecScale, vecNormalize, vecDist, lineDistance} from './vec.js';
import {lduToWorld, dirToWorld, LDU_M} from '../contracts.js';
import {MIN_ENGAGE_LDU} from '../kinds/pin-axle.js';

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
 * @returns {{joints:Array, lockedPairs:Array, lockedParts:Array}} lockedPairs = list of [bodyIdA, bodyIdB] that need merging;
 *   lockedParts[i] = the placed parts whose hinges lock pair i
 */
/**
 * The joint's motor from the graph edge's: every field the contract names, the device id
 * included — the hub reports it (48 medium, 49 large angular motor) and scales speeds by it.
 */
const motorOf = m => {
    const motor = {port: m.port, maxTorqueNm: m.maxTorqueNm, maxSpeedRadPerSec: m.maxSpeedRadPerSec};
    if (Number.isInteger(m.deviceId)) motor.deviceId = m.deviceId;
    return motor;
};

/** Every member of a locked hinge group is a pin of one and the same placed part (the shaft side, edge b). */
const isPinMount = (group, nodes) => {
    const owners = new Set();
    for (const g of group) {
        const node = nodes.get(g.edge.b.part);
        const c = node ? node.connectors.find(k => k.id === g.edge.b.connector) : null;
        if (!c || c.type !== 'pin' || g.edge._isMotorInternal) return false;
        owners.add(node.partId);
    }
    return owners.size === 1;
};

/** A connector of a graph node by id (LDraw model frame, LDU), or null. */
const connectorOf = (nodes, end) => {
    const node = nodes.get(end.part);
    return node ? node.connectors.find(c => c.id === end.connector) || null : null;
};

/** A connector's segment along unit direction u: [lo, hi] (LDU). */
const segmentAlong = (c, u) => {
    const t = vecDot(c.position, u);
    const h = (c.length || 0) / 2 * Math.abs(vecDot(c.axis, u));
    return [t - h, t + h];
};

/**
 * Slider edges grouped by island pair (unordered key, as hinges). A member: {edge, body1 (the
 * shaft's island, edge a), body2 (the bore's), axisLdu (the shaft's), boreWorld (the bore's
 * centre, m)}.
 */
const sliderGroups = (edges, nodeToBody) => {
    const groups = new Map();
    for (const e of edges) {
        if (e.kind !== 'slider') continue;
        const b1 = nodeToBody.get(e.a.part);
        const b2 = nodeToBody.get(e.b.part);
        if (!b1 || !b2 || b1 === b2) continue;
        const key = [b1, b2].sort().join('|');
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push({edge: e, body1: b1, body2: b2, axisLdu: vecNormalize(e.axis), boreWorld: null});
    }
    return groups;
};

/**
 * How far a slider joint can travel, in LDU along the joint's axis (body2 relative to body1,
 * zero at the start pose): [min ≤ 0, max ≥ 0]. Measured from the connectors, per edge
 * (one bore on one shaft):
 *   - engagement: the bore stays on its shaft by at least min(MIN_ENGAGE_LDU, both lengths) —
 *     the seat rule of kinds/pin-axle.js, so a bore that slides off the axle's end stops there.
 *     On one shaft it is enough that ONE of the moving part's bores stays on (union per shaft:
 *     a carriage riding two eyes of a toggle keeps running while the lower eye leaves the axle);
 *   - stops: no bore passes through another part's connector on the same shaft (a beam or a
 *     connector the axle is fixed in, a bush) — any bore of the moving part meeting one stops it
 *     (intersection over every bore).
 * Across shafts (two guide axles) the travel is the intersection. Parts that touch the moving
 * part away from its shafts are not seen here (jointed bodies never collide, R3): a stop that is
 * not on a shaft is a limit only if a coupling gives one (kinds/rack.js: the rack's teeth).
 */
const sliderTravel = (group, ref, nodes, edges, nodeToBody) => {
    const u = ref.axisLdu;
    let lo = -Infinity;
    let hi = Infinity;
    const byShaft = new Map();
    for (const g of group) {
        const shaft = connectorOf(nodes, g.edge.a);
        const bore = connectorOf(nodes, g.edge.b);
        g.boreWorld = lduToWorld(bore.position);
        // The joint moves body2 relative to body1 along u; this edge's bore moves relative to its
        // shaft along u by sign·d (its shaft may be on body2: a carriage axle through a frame bore).
        const sign = g.body1 === ref.body1 ? 1 : -1;
        const [s0, s1] = segmentAlong(shaft, u);
        const [b0, b1] = segmentAlong(bore, u);
        const need = Math.min(MIN_ENGAGE_LDU, s1 - s0, b1 - b0);
        const engage = [s0 - b1 + need, s1 - b0 - need].map(v => sign * v).sort((p, q) => p - q);
        const key = `${g.edge.a.part}|${g.edge.a.connector}`;
        const prev = byShaft.get(key);
        byShaft.set(key, prev ? [Math.min(prev[0], engage[0]), Math.max(prev[1], engage[1])] : engage);
        // Stops: every other connector seated on this shaft, unless it moves with the bore.
        const moving = nodeToBody.get(g.edge.b.part);
        for (const e of edges) {
            let other = null;
            if (e.a.part === g.edge.a.part && e.a.connector === g.edge.a.connector) other = e.b;
            else if (e.b.part === g.edge.a.part && e.b.connector === g.edge.a.connector) other = e.a;
            if (!other || nodeToBody.get(other.part) === moving) continue;
            const c = connectorOf(nodes, other);
            if (!c) continue;
            const [o0, o1] = segmentAlong(c, u);
            if (o0 >= b1 - 1e-6) {
                const stop = sign * (o0 - b1);
                if (sign > 0) hi = Math.min(hi, stop); else lo = Math.max(lo, stop);
            } else if (o1 <= b0 + 1e-6) {
                const stop = sign * (o1 - b0);
                if (sign > 0) lo = Math.max(lo, stop); else hi = Math.min(hi, stop);
            }
        }
    }
    for (const [a, b] of byShaft.values()) {
        lo = Math.max(lo, a);
        hi = Math.min(hi, b);
    }
    return [Math.min(0, lo), Math.max(0, hi)];
};

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
    const lockedParts = []; // per locked pair: the placed parts whose hinges lock (for the diagnostic)
    const lockedMounts = []; // per locked pair: true when it is one part's own pins (isPinMount)

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
            if (g.motor) joint.motor = motorOf(g.motor);
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
                if (motorMember) joint.motor = motorOf(motorMember.motor);
                joints.push({joint, groupKey: key, members: group});
            } else {
                // Locked: non-collinear hinges between same pair lock it
                const [bA, bB] = key.split('|');
                lockedPairs.push([bA, bB]);
                const ids = new Set();
                for (const g of group) {
                    for (const end of [g.edge.a, g.edge.b]) {
                        const node = nodes.get(end.part);
                        if (node) ids.add(node.partId);
                    }
                }
                lockedParts.push([...ids].sort());
                // A part held by two of its OWN frictionless pins in two holes (the toggle joint 48496,
                // whose pins LDraw draws as plain connect.dat) is mounted rigidly by design: the lock is
                // the mount, not a hinge the builder meant to turn, so compile.js says nothing about it.
                lockedMounts.push(isPinMount(group, nodes));
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

    // Slider edges (an axle through a slide-bore, kinds/slide.js): every slider edge between
    // one island pair is ONE slider joint — the bores of a carriage on one or two guide axles.
    // Edges along different directions lock the pair (as non-collinear hinges do), and so does
    // a pair that also has a hinge between it (a turn and a slide along one pair of bodies).
    for (const [key, group] of sliderGroups(edges, nodeToBody).entries()) {
        const ref = group[0];
        const crossing = group.some(g => !parallel(ref.axisLdu, g.axisLdu));
        if (crossing || hingeGroups.has(key)) {
            lockedPairs.push(key.split('|'));
            const ids = new Set();
            for (const g of [...group, ...(hingeGroups.get(key) || [])]) {
                for (const end of [g.edge.a, g.edge.b]) {
                    const node = nodes.get(end.part);
                    if (node) ids.add(node.partId);
                }
            }
            lockedParts.push([...ids].sort());
            lockedMounts.push(false);
            continue;
        }
        const travel = sliderTravel(group, ref, nodes, edges, nodeToBody);
        const mid = [0, 1, 2].map(i => group.reduce((s, g) => s + g.boreWorld[i], 0) / group.length);
        const joint = {
            id: '',
            type: 'slider',
            body1: ref.body1,
            body2: ref.body2,
            point: mid,
            axis: vecNormalize(dirToWorld(ref.axisLdu)),
            limits: [travel[0] * LDU_M, travel[1] * LDU_M]
        };
        joints.push({joint, groupKey: key, members: group});
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

    return {joints: jointList, lockedPairs, lockedParts, lockedMounts, jointEntries: joints};
};

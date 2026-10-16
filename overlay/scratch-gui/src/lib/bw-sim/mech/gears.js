// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// Gear inference (D4). For every pair of gear parts in different islands,
// find the joint for each gear (where its island is body2 and axis parallel
// to gear axis). Then check spur/spur, bevel/bevel meshing tolerances and
// emit gear constraints with signed ratio using the contract formula:
//     P = c1 + r1*u, t = unit(a1 × (P−c1)), ratio = ((a1×(P−c1))·t)/((a2×(P−c2))·t)
// For bevel, u is direction c2−O.

import {COS_1_DEG, SIN_1_DEG, vecAdd, vecSub, vecDot, vecCross, vecLen, vecScale, vecNormalize, vecDist, lineDistance, lineClosestMidpoint, mat3MulVec3} from './vec.js';
import {pitchRadiusLdu, lduToWorld, dirToWorld} from '../contracts.js';

const COS_1 = COS_1_DEG;
const SIN_1 = SIN_1_DEG;
const TOL = 0.5;
const TOL_M = 0.5 * 0.0004; // world meters for point comparisons but we do geometry in LDU

/**
 * Find the joint for a gear island.
 * @param {string} islandId body id of gear's island
 * @param {object} gearInfo {centerLdu, axisLdu} transformed gear centre/axis in LDU model frame
 * @param {Array} joints list of hinge joints (with body1/body2, pointWorld, axisWorld, pointLdu, axisLdu needed)
 * @returns {object|null} joint or null
 */
const findJointForGear = (islandId, gearInfo, joints, gearToJointCache) => {
    // Use cache
    if (gearToJointCache.has(islandId)) return gearToJointCache.get(islandId);
    let best = null;
    let bestDist = Infinity;
    for (const j of joints) {
        if (j.type !== 'hinge') continue;
        if (j.body2 !== islandId) continue;
        // Axis parallel: |dot(gearAxisLdu, jointAxisLdu)| >= cos1
        // Need joint axis LDU: convert world axis back to LDU via dirToWorld inverse (same function)
        const jointAxisLdu = vecNormalize(dirToWorld(j.axis));
        const dot = Math.abs(vecDot(gearInfo.axisLdu, jointAxisLdu));
        if (dot < COS_1 - 1e-12) continue;
        // Line passes within 0.5 LDU of gear centre: perp distance from gear centre to joint line <=0.5
        // Joint line: joint point (world or ldu?) For distance in LDU, use LDU points: joint point LDU = dirToWorld inverse of world point? But we have joint point in world, need LDU version.
        // We have joints with pointWorld and we can compute pointLdu = lduToWorld inverse: but we don't have stored. We'll compute joint point LDU via converting world point back: ldu uses scaling + flip; inverse is pLdu = [x/LDU_M, -y/LDU_M, -z/LDU_M]
        // However we didn't store joint pointLdu in joints.js for hinge; we stored pointWorld only. Let's compute LDU from world: pLdu = [pointWorld[0]/LDU_M, -pointWorld[1]/LDU_M, -pointWorld[2]/LDU_M]
        // But easier: we stored pointLdu in candidate's edge point, but after merging joints point is midpoint world; to get LDU we can inverse.
        // We'll compute joint point LDU via inverse transform.
        const LDU_M = 0.0004;
        const jPointLdu = [j.point[0] / LDU_M, 0 - j.point[1] / LDU_M, 0 - j.point[2] / LDU_M];
        const jAxisLduNorm = jointAxisLdu;
        const dist = (() => {
            const d = vecSub(gearInfo.centerLdu, jPointLdu);
            const axial = vecDot(d, jAxisLduNorm);
            const perp = vecSub(d, vecScale(jAxisLduNorm, axial));
            return vecLen(perp);
        })();
        if (dist > TOL + 1e-9) continue;
        if (dist < bestDist) { bestDist = dist; best = j; }
    }
    gearToJointCache.set(islandId, best);
    return best;
};

/**
 * Build gear constraints.
 * @param {Map<string,object>} nodes Map id->node
 * @param {{bodies:Array, nodeToBody:Map, bodyMap:Map}} islands final islands after locked merging
 * @param {Array} joints list of joints (hinge/ball) produced by joints.js (already deterministic)
 * @param {Map<string,object>} catalogMap
 * @param {Array} diagnostics
 * @returns {{gears:Array}}
 */
export const buildGears = (nodes, islands, joints, catalogMap, diagnostics = []) => {
    const {nodeToBody} = islands;

    // Collect gear infos: each PlacedModel part that has gear metadata and whose island is present
    // Need to map from gear partId -> islandId, center/axis LDU, teeth, type, r
    const gearInfos = []; // {partId, islandId, type, teeth, r, centerLdu, axisLdu, joint, jointId}

    // For each node that is output or regular, we need to find gear parts: nodes whose meta has gear, regardless of whether node is housing or output? For motor, gear could be on output? But motor gear typically spur attached to output shaft, which is in output island. The gear part itself is separate placed part with gear meta, not motor. So we look for placed parts that are gears.

    // However we have nodes mapping: each placed part that is gear has a node id = partId (no motor split). Its island is nodeToBody.get(partId)
    // For each distinct gear part, we need its transformed gear centre/axis in LDU model.

    const seenPartIds = new Set();
    for (const [nodeId, node] of nodes.entries()) {
        const pid = node.partId;
        if (seenPartIds.has(pid)) continue; // already processed gear for this part (if motor split has duplicate partId, we would have processed twice but gear meta only on gear parts, not motor)
        seenPartIds.add(pid);
        const meta = node.meta;
        if (!meta.gear) continue;
        const islandId = nodeToBody.get(nodeId);
        if (!islandId) continue;
        // Also need to ensure nodeId is the one that owns the gear's connectors? For gear parts, they have axlehole connector; the node is single. So island is correct.
        // If there are two nodes for same partId (motor), but motor has no gear, ignore.
        // For gear part, check if its island is correct: if gear has multiple nodes? No, gear part is not motor, so single node.

        // Transform gear centre/axis
        const placed = node.placed;
        const rot = placed.rotation;
        // Gear centre/axis in part frame -> model LDU
        const centerLdu = vecAdd(mat3MulVec3(rot, meta.gear.center), placed.position);
        const axisLduRaw = mat3MulVec3(rot, meta.gear.axis);
        const axisLdu = vecNormalize(axisLduRaw);

        const r = pitchRadiusLdu(meta.gear.teeth);

        gearInfos.push({
            partId: pid,
            nodeId,
            islandId,
            type: meta.gear.type,
            teeth: meta.gear.teeth,
            r,
            centerLdu,
            axisLdu,
            meta,
        });
    }

    // Helper to get mat3MulVec3 (import at top)
    // We'll need it for gear transform above; ensure import includes mat3MulVec3

    // Find joint for each gear
    const gearToJointCache = new Map();
    for (const g of gearInfos) {
        const j = findJointForGear(g.islandId, g, joints, gearToJointCache);
        if (!j) {
            diagnostics.push({severity: 'warning', code: 'gear-not-on-hinge', message: `Gear ${g.partId} not on hinge`, parts: [g.partId]});
            g.joint = null;
        } else {
            g.joint = j;
            g.jointId = j.id;
        }
    }

    // Now consider every pair of gear infos in different islands, both have joints
    const gears = [];
    // For determinism, sort gearInfos by partId
    gearInfos.sort((a, b) => {
        for (let i = 0; i < 3; i++) if (a.centerLdu[i] !== b.centerLdu[i]) return a.centerLdu[i] - b.centerLdu[i];
        return a.partId.localeCompare(b.partId);
    });

    for (let i = 0; i < gearInfos.length; i++) {
        const g1 = gearInfos[i];
        if (!g1.joint) continue;
        for (let j = i + 1; j < gearInfos.length; j++) {
            const g2 = gearInfos[j];
            if (!g2.joint) continue;
            if (g1.islandId === g2.islandId) continue; // same island, no constraint

            // Check type combo
            const t1 = g1.type; const t2 = g2.type;
            if (t1 === 'worm' || t2 === 'worm' || t1 === 'rack' || t2 === 'rack') {
                diagnostics.push({severity: 'warning', code: 'unsupported-gear', message: `Worm/rack gear pair ${g1.partId}–${g2.partId} unsupported`, parts: [g1.partId, g2.partId]});
                continue;
            }
            if ((t1 === 'spur' && t2 === 'spur')) {
                // spur-spur check
                if (!parallelAxes(g1.axisLdu, g2.axisLdu)) continue;
                // centre distance perpendicular to axis = r1+r2 ±0.5
                const delta = vecSub(g2.centerLdu, g1.centerLdu);
                const axial = vecDot(delta, g1.axisLdu); // if axes parallel, axial along a1 (or a2 same line)
                const perpVec = vecSub(delta, vecScale(g1.axisLdu, axial));
                const perpDist = vecLen(perpVec);
                if (Math.abs(perpDist - (g1.r + g2.r)) > TOL + 1e-9) continue;
                if (Math.abs(axial) > 4 + 1e-9) continue;

                // Matched: create gear constraint
                // Compute ratio using joint axes and contact point
                // u = unit component of (c2-c1) perpendicular to a1
                let u = vecNormalize(perpVec);
                if (vecLen(u) < 1e-9) continue; // degenerate
                const P = vecAdd(g1.centerLdu, vecScale(u, g1.r));
                // t = unit(a1_joint × (P−c1))
                // Need joint axes in LDU or world? Use joint axes world for ratio but we can use LDU joint axes (converted)
                const a1JointLdu = vecNormalize(dirToWorld(g1.joint.axis));
                const a2JointLdu = vecNormalize(dirToWorld(g2.joint.axis));
                // Compute t in LDU using a1JointLdu
                const pc1 = vecSub(P, g1.centerLdu);
                const pc2 = vecSub(P, g2.centerLdu);
                const cross1 = vecCross(a1JointLdu, pc1);
                const cross2 = vecCross(a2JointLdu, pc2);
                const t = vecNormalize(cross1);
                if (vecLen(t) < 1e-9) continue;
                const num = vecDot(cross1, t);
                const den = vecDot(cross2, t);
                if (Math.abs(den) < 1e-12) continue;
                const ratio = num / den;

                gears.push({
                    id: `g${gears.length}`,
                    type: 'gear',
                    joint1: g1.jointId,
                    joint2: g2.jointId,
                    ratio,
                });

            } else if (t1 === 'bevel' && t2 === 'bevel') {
                // bevel-bevel
                if (!perpendicularAxes(g1.axisLdu, g2.axisLdu)) continue;
                const dist = lineDistance(g1.centerLdu, g1.axisLdu, g2.centerLdu, g2.axisLdu);
                if (dist > TOL + 1e-9) continue;
                const {o1, o2, mid: O} = lineClosestMidpoint(g1.centerLdu, g1.axisLdu, g2.centerLdu, g2.axisLdu);
                // Use midpoint as O, but for intersection case O is same as O1/O2 midpoint
                // Check |c1-O| = r2 ±1 and |c2-O| = r1 ±1
                const d1 = vecDist(g1.centerLdu, O);
                const d2 = vecDist(g2.centerLdu, O);
                if (Math.abs(d1 - g2.r) > 1 + 1e-9) continue;
                if (Math.abs(d2 - g1.r) > 1 + 1e-9) continue;

                // Compute ratio for bevel: u = direction of c2−O (since c1−O along a1)
                // spec: u = direction of c2−O
                const uVec = vecSub(g2.centerLdu, O);
                const uLen = vecLen(uVec);
                if (uLen < 1e-9) continue;
                const u = vecScale(uVec, 1 / uLen);
                // Need to ensure u is perpendicular to a1? It should be.
                const P = vecAdd(g1.centerLdu, vecScale(u, g1.r));
                const a1JointLdu = vecNormalize(dirToWorld(g1.joint.axis));
                const a2JointLdu = vecNormalize(dirToWorld(g2.joint.axis));
                const pc1 = vecSub(P, g1.centerLdu);
                const pc2 = vecSub(P, g2.centerLdu);
                const cross1 = vecCross(a1JointLdu, pc1);
                const cross2 = vecCross(a2JointLdu, pc2);
                const t = vecNormalize(cross1);
                if (vecLen(t) < 1e-9) continue;
                const num = vecDot(cross1, t);
                const den = vecDot(cross2, t);
                if (Math.abs(den) < 1e-12) continue;
                const ratio = num / den;

                gears.push({
                    id: `g${gears.length}`,
                    type: 'gear',
                    joint1: g1.jointId,
                    joint2: g2.jointId,
                    ratio,
                });
            } else {
                // Mismatched spur/bevel etc => unsupported
                diagnostics.push({severity: 'warning', code: 'unsupported-gear', message: `Mismatched gear types ${g1.partId}(${t1})–${g2.partId}(${t2})`, parts: [g1.partId, g2.partId]});
            }
        }
    }

    // Sort gears deterministically by joint1, joint2 (lexicographically)
    gears.sort((a, b) => {
        let c = a.joint1.localeCompare(b.joint1);
        if (c !== 0) return c;
        c = a.joint2.localeCompare(b.joint2);
        if (c !== 0) return c;
        return a.id.localeCompare(b.id);
    });
    // Reassign ids deterministic after sort: g0,g1...
    gears.forEach((g, idx) => { g.id = `g${idx}`; });

    return {gears};
};

const parallelAxes = (a1, a2) => Math.abs(vecDot(a1, a2)) >= COS_1 - 1e-12;
const perpendicularAxes = (a1, a2) => Math.abs(vecDot(a1, a2)) <= SIN_1 + 1e-12;

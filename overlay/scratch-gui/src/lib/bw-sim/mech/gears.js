// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// Gear inference (D4). Two gears whose pitch circles touch (spur: parallel
// axes, centre distance r1 + r2; bevel: perpendicular axes meeting at O with
// |c1 − O| = r2 and |c2 − O| = r1) mesh. A mesh only transmits motion when
// both gears turn about axes held by the SAME part: the frame F. Gear 1 sits on
// body B1 that turns in F through hinge h1, gear 2 on B2 that turns in F
// through h2. The tooth contact then fixes the two rotations RELATIVE TO F,
// which is exactly what the contract's gear constraint couples
// (ω(joint2) = ratio · ω(joint1), each ω the hinge's relative rate).
//
// Topologies the rule separates:
//   - common frame (a gearbox: both axles in holes of one beam/frame) → gear;
//   - gear-on-frame: gear 1 is rigidly part of the frame gear 2 turns in
//     (e.g. a beam pinned to the motor's turning output that also carries the
//     8T): gear 1 cannot turn relative to that frame, so its teeth hold gear 2
//     still in it. The pair LOCKS: no gear constraint, a warning, and the two
//     bodies are merged (compile.js), so the simulation shows the one rigid
//     assembly the model really is instead of a fictitious transmission;
//   - axes held by different frames → no gear, a warning (planetary-style
//     trains are not modelled).
//
// A hinge's ω is body2 relative to body1 about its axis. A gear on the hinge's
// body2 turns by +ω relative to the frame, one on its body1 by −ω, so the
// ratio uses the signed axis a = s·axis (s = ±1). With these axes the contact
// formula gives the contract ratio directly:
//     P = c1 + r1·u, t = unit(a1 × (P − c1)),
//     ratio = ((a1 × (P − c1)) · t) / ((a2 × (P − c2)) · t)
// (equal tooth speed at P). Spur: u = unit component of c2 − c1 normal to a1;
// bevel: u = unit(c2 − O).

import {COS_1_DEG, SIN_1_DEG, vecAdd, vecSub, vecDot, vecCross, vecLen, vecScale, vecNormalize, vecDist, lineDistance, lineClosestMidpoint, mat3MulVec3} from './vec.js';
import {pitchRadiusLdu, dirToWorld, LDU_M} from '../contracts.js';

const COS_1 = COS_1_DEG;
const SIN_1 = SIN_1_DEG;
/** Positional tolerance, LDU. */
const TOL = 0.5;

const parallelAxes = (a1, a2) => Math.abs(vecDot(a1, a2)) >= COS_1 - 1e-12;
const perpendicularAxes = (a1, a2) => Math.abs(vecDot(a1, a2)) <= SIN_1 + 1e-12;

/** World point (metres) back to the LDraw model frame (LDU): the inverse of lduToWorld. */
const worldToLdu = p => [p[0] / LDU_M, -p[1] / LDU_M, -p[2] / LDU_M];

/**
 * The hinges a gear can turn on: hinge joints touching the gear's body whose
 * axis is the gear's own axis line (parallel within 1°, passing within
 * 0.5 LDU of the gear centre).
 * @param {object} gear gear info (islandId, centerLdu, axisLdu)
 * @param {Array} joints compiled joints
 * @returns {{joint: object, frame: string, sign: number}[]} sign +1 when the gear is on body2
 */
const gearHinges = (gear, joints) => {
    const out = [];
    for (const j of joints) {
        if (j.type !== 'hinge') continue;
        let sign;
        let frame;
        if (j.body2 === gear.islandId) { sign = 1; frame = j.body1; }
        else if (j.body1 === gear.islandId) { sign = -1; frame = j.body2; }
        else continue;
        // dirToWorld flips y and z; it is its own inverse, so it maps the world axis back to LDU.
        const axisLdu = vecNormalize(dirToWorld(j.axis));
        if (!parallelAxes(gear.axisLdu, axisLdu)) continue;
        const d = vecSub(gear.centerLdu, worldToLdu(j.point));
        const perp = vecSub(d, vecScale(axisLdu, vecDot(d, axisLdu)));
        if (vecLen(perp) > TOL + 1e-9) continue;
        out.push({joint: j, frame, sign});
    }
    out.sort((a, b) => a.joint.id.localeCompare(b.joint.id));
    return out;
};

/**
 * Signed contract ratio ω(h2) = ratio · ω(h1) for a mesh with contact point P.
 * @returns {number|null} null when degenerate
 */
const meshRatio = (g1, h1, g2, h2, P) => {
    const a1 = vecScale(vecNormalize(dirToWorld(h1.joint.axis)), h1.sign);
    const a2 = vecScale(vecNormalize(dirToWorld(h2.joint.axis)), h2.sign);
    const cross1 = vecCross(a1, vecSub(P, g1.centerLdu));
    const cross2 = vecCross(a2, vecSub(P, g2.centerLdu));
    const t = vecNormalize(cross1);
    if (vecLen(t) < 1e-9) return null;
    const den = vecDot(cross2, t);
    if (Math.abs(den) < 1e-12) return null;
    return vecDot(cross1, t) / den;
};

/**
 * Where two gears touch, or null when they do not mesh.
 * @returns {{P: Vec3}|null} contact point P on gear 1's pitch circle (LDU)
 */
const meshContact = (g1, g2) => {
    if (g1.type === 'spur' && g2.type === 'spur') {
        if (!parallelAxes(g1.axisLdu, g2.axisLdu)) return null;
        const delta = vecSub(g2.centerLdu, g1.centerLdu);
        const axial = vecDot(delta, g1.axisLdu);
        const perpVec = vecSub(delta, vecScale(g1.axisLdu, axial));
        if (Math.abs(vecLen(perpVec) - (g1.r + g2.r)) > TOL + 1e-9) return null;
        if (Math.abs(axial) > 4 + 1e-9) return null;
        const u = vecNormalize(perpVec);
        if (vecLen(u) < 1e-9) return null;
        return {P: vecAdd(g1.centerLdu, vecScale(u, g1.r))};
    }
    if (g1.type === 'bevel' && g2.type === 'bevel') {
        if (!perpendicularAxes(g1.axisLdu, g2.axisLdu)) return null;
        if (lineDistance(g1.centerLdu, g1.axisLdu, g2.centerLdu, g2.axisLdu) > TOL + 1e-9) return null;
        const {mid: O} = lineClosestMidpoint(g1.centerLdu, g1.axisLdu, g2.centerLdu, g2.axisLdu);
        if (Math.abs(vecDist(g1.centerLdu, O) - g2.r) > 1 + 1e-9) return null;
        if (Math.abs(vecDist(g2.centerLdu, O) - g1.r) > 1 + 1e-9) return null;
        const uVec = vecSub(g2.centerLdu, O);
        if (vecLen(uVec) < 1e-9) return null;
        return {P: vecAdd(g1.centerLdu, vecScale(vecNormalize(uVec), g1.r))};
    }
    return null;
};

/** A readable name for a gear: "the 8-tooth gear (g8)". */
const gearName = g => `the ${g.teeth}-tooth gear (${g.partId})`;

/**
 * The part of the frame that holds a gear's hinge (the beam its axle turns
 * in), for messages. Falls back to the frame body id.
 */
const holderName = (hinge, gear, jointEntries, nodes) => {
    const entry = jointEntries ? jointEntries.find(e => e.joint === hinge.joint) : null;
    const edge = entry && entry.members && entry.members[0] ? entry.members[0].edge : null;
    if (edge) {
        // Edge a = hole side = body1, b = shaft side = body2; the holder is the frame's side.
        const nodeId = hinge.sign === 1 ? edge.a.part : edge.b.part;
        const node = nodes.get(nodeId);
        if (node) return `${node.meta.name || node.placed.part} (${node.partId})`;
    }
    return `body ${hinge.frame}`;
};

/**
 * Build gear constraints.
 * @param {Map<string,object>} nodes Map id->node
 * @param {{bodies:Array, nodeToBody:Map, bodyMap:Map}} islands final islands after locked merging
 * @param {Array} joints joints produced by joints.js (deterministic ids)
 * @param {Map<string,object>} catalogMap unused, kept for the call signature
 * @param {Array} diagnostics warnings are pushed here
 * @param {Array} [jointEntries] joints.js jointEntries (for naming the holding part in messages)
 * @returns {{gears: Array, lockedPairs: Array<[string, string]>}} lockedPairs: [frame body, gear body]
 *   pairs a gear-on-frame mesh locks together; compile.js merges them and runs again
 */
/**
 * Whether two placed gear parts mesh where they stand (same rule as the
 * compiler: tooth types match, pitch circles touch). The build editor uses it
 * to let meshing gears share volume, since their teeth interleave.
 * @param {{part: string, position: number[], rotation: number[]}} a placed part
 * @param {object} metaA its PartMeta
 * @param {{part: string, position: number[], rotation: number[]}} b placed part
 * @param {object} metaB its PartMeta
 * @returns {boolean}
 */
export const placedGearsMesh = (a, metaA, b, metaB) => {
    if (!metaA?.gear || !metaB?.gear || metaA.gear.type !== metaB.gear.type) return false;
    if (metaA.gear.type !== 'spur' && metaA.gear.type !== 'bevel') return false;
    const info = (p, meta) => ({
        type: meta.gear.type, teeth: meta.gear.teeth, r: pitchRadiusLdu(meta.gear.teeth),
        centerLdu: vecAdd(mat3MulVec3(p.rotation, meta.gear.center), p.position),
        axisLdu: vecNormalize(mat3MulVec3(p.rotation, meta.gear.axis))
    });
    return Boolean(meshContact(info(a, metaA), info(b, metaB)));
};

export const buildGears = (nodes, islands, joints, catalogMap, diagnostics = [], jointEntries = null) => {
    const {nodeToBody} = islands;

    // Every placed gear part with its centre/axis in the model frame (LDU).
    const gearInfos = [];
    const seenPartIds = new Set();
    for (const [nodeId, node] of nodes.entries()) {
        const pid = node.partId;
        if (seenPartIds.has(pid)) continue; // a motor's two nodes share a part id; motors are not gears
        seenPartIds.add(pid);
        const meta = node.meta;
        if (!meta.gear) continue;
        const islandId = nodeToBody.get(nodeId);
        if (!islandId) continue;
        const rot = node.placed.rotation;
        gearInfos.push({
            partId: pid,
            nodeId,
            islandId,
            type: meta.gear.type,
            teeth: meta.gear.teeth,
            r: pitchRadiusLdu(meta.gear.teeth),
            centerLdu: vecAdd(mat3MulVec3(rot, meta.gear.center), node.placed.position),
            axisLdu: vecNormalize(mat3MulVec3(rot, meta.gear.axis)),
        });
    }

    for (const g of gearInfos) {
        g.hinges = gearHinges(g, joints);
        if (g.hinges.length === 0) {
            diagnostics.push({severity: 'warning', code: 'gear-not-on-hinge', message: `Gear ${g.partId} not on hinge`, parts: [g.partId]});
        }
    }

    // Deterministic pair order: by centre, then part id.
    gearInfos.sort((a, b) => {
        for (let i = 0; i < 3; i++) if (a.centerLdu[i] !== b.centerLdu[i]) return a.centerLdu[i] - b.centerLdu[i];
        return a.partId.localeCompare(b.partId);
    });

    const gears = [];
    const lockedPairs = [];
    for (let i = 0; i < gearInfos.length; i++) {
        const g1 = gearInfos[i];
        for (let k = i + 1; k < gearInfos.length; k++) {
            const g2 = gearInfos[k];
            if (g1.islandId === g2.islandId) continue; // one rigid body: nothing to couple

            const t1 = g1.type; const t2 = g2.type;
            if (t1 === 'worm' || t2 === 'worm' || t1 === 'rack' || t2 === 'rack') {
                diagnostics.push({severity: 'warning', code: 'unsupported-gear', message: `Worm/rack gear pair ${g1.partId}–${g2.partId} unsupported`, parts: [g1.partId, g2.partId]});
                continue;
            }
            if (t1 !== t2) {
                diagnostics.push({severity: 'warning', code: 'unsupported-gear', message: `Mismatched gear types ${g1.partId}(${t1})–${g2.partId}(${t2})`, parts: [g1.partId, g2.partId]});
                continue;
            }
            const contact = meshContact(g1, g2);
            if (!contact) continue;

            // Gear-on-frame: one gear is rigidly part of the frame the other turns in.
            const lockOn = (fixed, turning) => turning.hinges.find(h => h.frame === fixed.islandId);
            const lock12 = lockOn(g1, g2);
            const lock21 = lock12 ? null : lockOn(g2, g1);
            if (lock12 || lock21) {
                const [fixed, turning, hinge] = lock12 ? [g1, g2, lock12] : [g2, g1, lock21];
                diagnostics.push({
                    severity: 'warning',
                    code: 'gear-on-frame',
                    message: `${gearName(fixed)} is rigidly joined to ${holderName(hinge, turning, jointEntries, nodes)}, which holds ${gearName(turning)}, so it cannot turn it: the two gears lock together.`.replace(/^t/, 'T'),
                    parts: [fixed.partId, turning.partId],
                });
                lockedPairs.push([fixed.islandId, turning.islandId]);
                continue;
            }

            if (g1.hinges.length === 0 || g2.hinges.length === 0) continue; // already diagnosed

            // Common frame: the first (by joint id) hinge pair turning in the same body.
            let pair = null;
            for (const h1 of g1.hinges) {
                const h2 = g2.hinges.find(h => h.frame === h1.frame);
                if (h2) { pair = [h1, h2]; break; }
            }
            if (!pair) {
                diagnostics.push({
                    severity: 'warning',
                    code: 'gear-frames-differ',
                    message: `${gearName(g1)} and ${gearName(g2)} mesh, but their axles turn in different parts, so the gearing is not modelled.`.replace(/^t/, 'T'),
                    parts: [g1.partId, g2.partId],
                });
                continue;
            }
            const ratio = meshRatio(g1, pair[0], g2, pair[1], contact.P);
            if (ratio === null) continue;
            // `parts`: the two meshing gears (g1 on joint1), so a view can show which gears couple.
            gears.push({id: '', type: 'gear', joint1: pair[0].joint.id, joint2: pair[1].joint.id, ratio, parts: [g1.partId, g2.partId]});
        }
    }

    gears.sort((a, b) => a.joint1.localeCompare(b.joint1) || a.joint2.localeCompare(b.joint2));
    gears.forEach((g, idx) => { g.id = `g${idx}`; });

    return {gears, lockedPairs};
};

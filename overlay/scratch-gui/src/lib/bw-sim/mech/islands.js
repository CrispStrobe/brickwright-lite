// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// Rigid islands (D2). Union-find over rigid edges. One body per island.
// Origin = centre of mass (mass-weighted part positions), rotation identity.
// Colliders transformed into body frame (metres), mass summed.
// Ground added unless opts.ground===false.

import {vecAdd, vecSub, vecDot, vecScale, vecLen, vecNormalize, mat3MulVec3, quatMul, quatFromLDrawMat, quatNormalize, COS_1_DEG} from './vec.js';
import {LDU_M, PART_FRICTION, lduToWorld, partMotorJoint, partSensor, partHubProfile, colliderVolume} from '../contracts.js';

/** Fraction of a v1 motor's mass that belongs to the output (turning) body (PartMeta v2: internalJoints[].massFraction). */
export {MOTOR_OUTPUT_MASS_FRACTION} from '../contracts.js';

const EPS = 1e-9;

class DSU {
    constructor(ids) {
        this.parent = new Map();
        for (const id of ids) this.parent.set(id, id);
    }
    find(x) {
        const p = this.parent.get(x);
        if (p !== x) {
            const r = this.find(p);
            this.parent.set(x, r);
            return r;
        }
        return p;
    }
    union(a, b) {
        const ra = this.find(a); const rb = this.find(b);
        if (ra === rb) return;
        // deterministic: keep smaller lexicographically as root for stability
        if (ra.localeCompare(rb) < 0) this.parent.set(rb, ra);
        else this.parent.set(ra, rb);
    }
}

/**
 * Free spinners welded to a neighbour (D2's body model, test/bw-sim-validation.test.mjs balance):
 * a part that is the SHAFT of every edge it has, all of them hinges on one line (collinear within
 * 1° and 0.5 LDU), to two or more other parts — a frictionless pin through two beams, a free axle
 * through holes with nothing fixed on it — turns freely about its own axis and carries nothing.
 * As its own body it is a 0.25–2 g body between two hinges, and the solver cannot hold a 9–24 g
 * lever through that chain: a balance's lever drooped 17.8° off its pin's axis (10 iterations; 0.45°
 * at 30/10). Welded into one of its partners it is ONE hinge between the two parts, kinematically
 * the same machine (only the pin's own spin, which nothing reads, is gone). The partner is the
 * first by node id. A part with a gear, a motor or a sensor is never a spinner.
 * @param {Map<string, object>} nodes graph nodes
 * @param {object[]} edges graph edges
 * @returns {[string, string][]} node pairs to weld (compile.js: extra rigid pairs)
 */
export const freeSpinnerWelds = (nodes, edges) => {
    const byNode = new Map();
    for (const e of edges) {
        for (const end of [e.a.part, e.b.part]) {
            if (!byNode.has(end)) byNode.set(end, []);
            byNode.get(end).push(e);
        }
    }
    const out = [];
    for (const [id, list] of byNode) {
        const node = nodes.get(id);
        if (!node || !node.meta || node.meta.gear || partMotorJoint(node.meta) || partSensor(node.meta) || partHubProfile(node.meta)) continue;
        if (!list.every(e => e.kind === 'hinge' && !e._isMotorInternal && e.b.part === id && e.a.part !== id)) continue;
        const partners = [...new Set(list.map(e => e.a.part))].sort();
        if (partners.length < 2) continue;
        const axis = vecNormalize(list[0].axis);
        const onLine = list.every(e => {
            if (Math.abs(vecDot(vecNormalize(e.axis), axis)) < COS_1_DEG - 1e-12) return false;
            const d = vecSub(e.point, list[0].point);
            return vecLen(vecSub(d, vecScale(axis, vecDot(d, axis)))) <= 0.5 + 1e-9;
        });
        if (onLine) out.push([id, partners[0]]);
    }
    return out.sort((p, q) => p[0].localeCompare(q[0]));
};

/**
 * Build islands (bodies) from nodes and edges.
 * @param {Map<string,object>} nodes Map id->node {id, partId, placed, meta, connectors}
 * @param {Array} edges list from graph (rigid/hinge/ball)
 * @param {Map<string,object>} catalogMap Map partName->PartMeta (for mass etc)
 * @param {Array} diagnostics
 * @param {object} opts {ground?:boolean} - ground handling is done in compile after islands+joints, but we also support ground here for simpler testing. If opts.ground===false skip ground.
 * @param {Array} extraRigidPairs optional list of [nodeIdA, nodeIdB] to union as rigid (for locked-hinges merging)
 * @returns {{bodies:Array, nodeToBody:Map<string,string>, bodyMap:Map<string,object>}}
 */
export const buildIslands = (nodes, edges, catalogMap, diagnostics = [], opts = {}, extraRigidPairs = []) => {
    // Import vec helpers locally for collider transform
    // We'll need mat3MulVec3
    const nodeIds = [...nodes.keys()];
    const dsu = new DSU(nodeIds);

    for (const e of edges) {
        if (e.kind === 'rigid') dsu.union(e.a.part, e.b.part);
    }
    for (const [a, b] of extraRigidPairs) {
        if (nodes.has(a) && nodes.has(b)) dsu.union(a, b);
    }

    // Group by root
    const groups = new Map(); // root -> nodeId[]
    for (const nid of nodeIds) {
        const r = dsu.find(nid);
        if (!groups.has(r)) groups.set(r, []);
        groups.get(r).push(nid);
    }

    // Sort groups by smallest node id string compare for deterministic island order
    const groupList = [...groups.values()];
    groupList.forEach(g => g.sort((a, b) => a.localeCompare(b)));
    groupList.sort((a, b) => a[0].localeCompare(b[0]));

    /** bodies */
    const bodies = [];
    /** nodeId -> bodyId */
    const nodeToBody = new Map();
    /** bodyId -> body */
    const bodyMap = new Map();

    // Helper to get world position of a placed part origin (LDU -> world)
    const partWorldPos = placed => lduToWorld(placed.position);
    const partWorldQuat = placed => quatFromLDrawMat(placed.rotation);

    // Build each body
    for (let i = 0; i < groupList.length; i++) {
        const nodeIdsInGroup = groupList[i];
        const bodyId = `b${i}`;

        // Distinct partIds (original PlacedModel part ids)
        const partIdSet = new Set();
        for (const nid of nodeIdsInGroup) partIdSet.add(nodes.get(nid).partId);
        const parts = [...partIdSet].sort((a, b) => a.localeCompare(b));

        // Mass sum: sum over nodes in group with motor fraction handling
        // For motor parts, output gets 15%, housing 85%; if both nodes in same island (locked) they sum to 100%
        let totalMassGrams = 0;
        for (const pid of parts) {
            const nodesForPart = nodeIdsInGroup.filter(nid => nodes.get(nid).partId === pid);
            for (const nid of nodesForPart) {
                const meta = nodes.get(nid).meta;
                const shaft = partMotorJoint(meta);
                if (shaft) {
                    const isOut = nid.endsWith('#out');
                    totalMassGrams += meta.massGrams * (isOut ? shaft.massFraction : (1 - shaft.massFraction));
                } else {
                    // Non-motor: include once per distinct part (nodesForPart length should be 1)
                    if (nid !== nodesForPart[0]) continue;
                    totalMassGrams += meta.massGrams;
                }
            }
        }
        const massKg = totalMassGrams / 1000;

        // Centre of mass: weighted average of part world positions with same fractions
        let comX = 0; let comY = 0; let comZ = 0;
        if (totalMassGrams > 0) {
            for (const pid of parts) {
                const nodesForPart = nodeIdsInGroup.filter(nid => nodes.get(nid).partId === pid);
                for (const nid of nodesForPart) {
                    const node = nodes.get(nid);
                    const meta = node.meta;
                    const placed = node.placed;
                    const wPos = partWorldPos(placed);
                    let mass = meta.massGrams;
                    const shaft = partMotorJoint(meta);
                    if (shaft) {
                        const isOut = nid.endsWith('#out');
                        mass *= isOut ? shaft.massFraction : (1 - shaft.massFraction);
                    } else {
                        if (nid !== nodesForPart[0]) continue;
                    }
                    comX += wPos[0] * mass;
                    comY += wPos[1] * mass;
                    comZ += wPos[2] * mass;
                }
            }
            comX /= totalMassGrams; comY /= totalMassGrams; comZ /= totalMassGrams;
        } else {
            // Fallback: average of node world positions (should not happen)
            let sx = 0; let sy = 0; let sz = 0;
            for (const nid of nodeIdsInGroup) {
                const w = partWorldPos(nodes.get(nid).placed);
                sx += w[0]; sy += w[1]; sz += w[2];
            }
            comX = sx / nodeIdsInGroup.length; comY = sy / nodeIdsInGroup.length; comZ = sz / nodeIdsInGroup.length;
        }
        const origin = [comX, comY, comZ];

        // Colliders: each node's meta colliders transformed, but need to respect motor outputColliders split
        // For motor parts, the internal joint's movingColliders (v1 meta.motor.outputColliders) indicate indices that belong to output node (partId#out). Housing node gets the rest.
        const colliders = [];
        // For each distinct partId, determine which colliders belong to this island
        for (const pid of parts) {
            // Find all nodes in group with this partId (could be 1 for normal, 2 for motor if both nodes ended up in same island due to locked merging)
            const nodesForPart = nodeIdsInGroup.filter(nid => nodes.get(nid).partId === pid);
            // There should be 1 or 2 nodes; we need to decide collider ownership
            // If motor part and nodesForPart includes both housing and output (i.e., motor's both nodes in same island because they got locked together), then we should include all colliders once.
            // If only one node for this part in this island, need to filter by motor outputColliders
            for (const nid of nodesForPart) {
                const node = nodes.get(nid);
                const meta = node.meta;
                const placed = node.placed;
                const shaft = partMotorJoint(meta);
                const isMotor = !!shaft;
                const isOutNode = nid.endsWith('#out');
                let colliderIndices;
                if (isMotor) {
                    const outSet = new Set(shaft.movingColliders || []);
                    if (isOutNode) colliderIndices = [...outSet];
                    else colliderIndices = meta.colliders.map((_, idx) => idx).filter(idx => !outSet.has(idx));
                } else {
                    // Non-motor: include all colliders, but if part appears in multiple nodes (shouldn't for non-motor), avoid duplicating colliders multiple times per island
                    // So we include colliders only for first node of that part in this island
                    // We'll handle de-duplication: if we already processed this pid, skip remaining nodes
                    // For non-motor, nodesForPart length should be 1, but if 2 due to bug, we include once
                    if (nid !== nodesForPart[0]) continue;
                    colliderIndices = meta.colliders.map((_, idx) => idx);
                }
                const pwQuat = partWorldQuat(placed);
                // This node's share of the part's mass, spread over its colliders by volume: a collider
                // carries `massKg` (and `part`), so the core puts the body's centre of mass and inertia
                // where the parts' masses are, not at the colliders' volume centroid (jolt-core.js).
                const nodeMassKg = meta.massGrams / 1000 * (isMotor ? (isOutNode ? shaft.massFraction : 1 - shaft.massFraction) : 1);
                const nodeVolume = colliderIndices.reduce((acc, idx) => acc + colliderVolume(meta.colliders[idx]), 0);
                for (const idx of colliderIndices) {
                    const col = meta.colliders[idx];
                    // Compute world position of collider centre
                    const localPos = col.position ? col.position : [0, 0, 0];
                    // Transform localPos: R*localPos + placed.position -> LDU model -> world
                    const modelPosLdu = vecAdd(mat3MulVec3(placed.rotation, localPos), placed.position);
                    const worldPos = lduToWorld(modelPosLdu);
                    const bodyPos = vecSub(worldPos, origin);
                    // Dimensions scaling
                    let outCol = null;
                    const needsPos = bodyPos[0] !== 0 || bodyPos[1] !== 0 || bodyPos[2] !== 0;
                    // Rotation: partWorldQuat * colliderQuat
                    let rotOut = null;
                    if (col.rotation) {
                        const qCol = col.rotation;
                        const worldRot = quatMul(pwQuat, qCol);
                        const norm = quatNormalize(worldRot);
                        // If not identity, include
                        if (Math.abs(norm[0]) > 1e-9 || Math.abs(norm[1]) > 1e-9 || Math.abs(norm[2]) > 1e-9 || Math.abs(norm[3] - 1) > 1e-9) {
                            rotOut = norm;
                        }
                    } else {
                        // Use part world rotation if not identity
                        if (Math.abs(pwQuat[0]) > 1e-9 || Math.abs(pwQuat[1]) > 1e-9 || Math.abs(pwQuat[2]) > 1e-9 || Math.abs(pwQuat[3] - 1) > 1e-9) {
                            rotOut = pwQuat;
                        }
                    }

                    if (col.shape === 'box') {
                        const he = col.halfExtents.map(v => v * LDU_M);
                        outCol = {shape: 'box', halfExtents: he};
                        if (needsPos) outCol.position = bodyPos;
                        if (rotOut) outCol.rotation = rotOut;
                    } else if (col.shape === 'cylinder') {
                        outCol = {shape: 'cylinder', radius: col.radius * LDU_M, halfHeight: col.halfHeight * LDU_M};
                        if (needsPos) outCol.position = bodyPos;
                        if (rotOut) outCol.rotation = rotOut;
                    } else if (col.shape === 'sphere') {
                        outCol = {shape: 'sphere', radius: col.radius * LDU_M};
                        if (needsPos) outCol.position = bodyPos;
                        // sphere rotation not needed
                    } else {
                        continue;
                    }
                    outCol.part = pid;
                    if (nodeVolume > 0 && nodeMassKg > 0) outCol.massKg = nodeMassKg * colliderVolume(col) / nodeVolume;
                    colliders.push(outCol);
                }
            }
        }

        // Safety: if no colliders (should not happen for valid motors after outputColliders split, but if motor output node had no other parts and outputColliders split incorrectly, it should still have colliders via the rule above), add dummy
        if (colliders.length === 0) {
            // Add tiny sphere at origin to satisfy validator; mass already positive
            colliders.push({shape: 'sphere', radius: 0.002});
        }

        // A rigid island touches the ground with whichever of its parts does; v1 takes
        // the grippiest (a tyred wheel makes its whole island grip like rubber).
        const friction = Math.max(...nodeIdsInGroup.map(nid => nodes.get(nid).meta.friction ?? PART_FRICTION));
        const body = {
            id: bodyId,
            motion: 'dynamic',
            position: origin,
            rotation: [0, 0, 0, 1],
            massKg,
            colliders,
            parts,
            friction,
        };
        bodies.push(body);
        bodyMap.set(bodyId, body);
        for (const nid of nodeIdsInGroup) nodeToBody.set(nid, bodyId);
    }

    // Ground handling is NOT done here; compile.js will add it after joints/gears finalization to ensure lowest y includes final bodies.
    // However if opts.ground===false is requested at islands level, we just return without ground; compile will handle.

    return {bodies, nodeToBody, bodyMap};
};

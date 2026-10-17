// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// Connector matching (D1). Between connectors of DIFFERENT parts/graph nodes:
// pin+pinhole (friction), axle+axlehole, axle+pinhole, stud+antistud,
// ball+ballsocket. Geometry in LDU model frame. Motors split into two graph
// nodes with an internal hinge.

import {COS_1_DEG} from './vec.js';
import {mat3MulVec3, vecAdd, vecSub, vecDot, vecCross, vecLen, vecScale, vecDist, vecNormalize} from './vec.js';

const I3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

const isI3 = m => m.length === 9 && m.every((v, i) => v === I3[i]);

const EPS = 1e-9;
const TOL = 0.5 + 1e-9;
const COS_1 = COS_1_DEG;

/** Transform a connector from part frame to LDraw model frame (LDU). */
const transformConnector = (conn, pos, rot) => {
    const p = vecAdd(mat3MulVec3(rot, conn.position), pos);
    const aRaw = mat3MulVec3(rot, conn.axis);
    const a = vecNormalize(aRaw);
    const out = {id: conn.id, type: conn.type, position: p, axis: a, length: conn.length, friction: conn.friction, _orig: conn};
    if (conn.closedEnd !== undefined) out.closedEnd = conn.closedEnd;
    return out;
};

const isShaftType = t => t === 'axle' || t === 'pin' || t === 'stud';
const isHoleType = t => t === 'pinhole' || t === 'axlehole' || t === 'antistud';

export const isShaftTypeExport = isShaftType;
export const isHoleTypeExport = isHoleType;

/**
 * Determine the edge kind for a shaft/hole pair. Returns 'rigid'|'hinge'|'ball'|null.
 */
export const edgeKind = (shaft, hole) => {
    if (shaft.type === 'pin' && hole.type === 'pinhole') {
        return shaft.friction === false ? 'hinge' : 'rigid';
    }
    if (shaft.type === 'axle' && hole.type === 'axlehole') return 'rigid';
    if (shaft.type === 'axle' && hole.type === 'pinhole') return 'hinge';
    if (shaft.type === 'stud' && hole.type === 'antistud') return 'rigid';
    if (shaft.type === 'ball' && hole.type === 'ballsocket') return 'ball';
    if (shaft.type === 'ballsocket' && hole.type === 'ball') return 'ball'; // symmetric, caller normalises
    return null;
};

/**
 * How far a shaft must reach into a hole to be held, in LDU (along their common axis).
 *
 * Technic lengths come on a 10 LDU lattice (a pin half and a beam's hole are 20, a thin
 * liftarm's hole, a half bush and a bevel gear's hub 10), so a real seat engages 10, 20,
 * ... LDU; a shaft that ends at a hole's face engages 0. A partly inserted axle still holds
 * in reality (the towball 2736's 17.5 LDU stub in a 20 LDU hole), so a shaft seats when it
 * engages at least 8 LDU: 2 LDU of slack under the shortest real seat (a 10 LDU hole), far
 * above the ±0.5 LDU of a face-to-face contact. A hole or shaft shorter than that seats on
 * its full length.
 */
export const MIN_ENGAGE_LDU = 8;

/**
 * Engaged length of a shaft connector in a hole connector (both in one frame, LDU), or
 * null when the shaft does not seat: axes parallel (1°) and coaxial (0.5 LDU), the two
 * segments (`length` along `axis`, centred on `position`) overlapping by at least
 * min(MIN_ENGAGE_LDU, shaft length, hole length), and — for a blind hole (`closedEnd`
 * ±1: which end of the hole's segment, along its axis, is the bottom) — the shaft not
 * reaching past the bottom (0.5 LDU tolerance). Applies to every shaft length alike
 * (pins, half pins, 3L pins, axles, axle pins, stubs).
 * @param {{position: number[], axis: number[], length?: number}} shaft
 * @param {{position: number[], axis: number[], length?: number, closedEnd?: number}} hole
 * @returns {number|null}
 */
export const shaftEngagement = (shaft, hole) => {
    const dot = vecDot(shaft.axis, hole.axis);
    if (Math.abs(dot) < COS_1 - 1e-12) return null;
    const delta = vecSub(hole.position, shaft.position);
    const axial = vecDot(delta, shaft.axis);
    const perp = vecSub(delta, vecScale(shaft.axis, axial));
    if (vecLen(perp) > TOL) return null;
    const Ls = shaft.length; const Lh = hole.length;
    if (Ls === undefined || Lh === undefined) return null;
    // Along the shaft's axis: shaft [-Ls/2, Ls/2], hole [axial - Lh/2, axial + Lh/2].
    const engaged = Math.min(Ls / 2, axial + Lh / 2) - Math.max(-Ls / 2, axial - Lh / 2);
    if (engaged < Math.min(MIN_ENGAGE_LDU, Ls, Lh) - 1e-9) return null;
    if (hole.closedEnd === 1 || hole.closedEnd === -1) {
        const bottomSide = hole.closedEnd * Math.sign(dot);
        const bottom = axial + bottomSide * Lh / 2;
        if (bottomSide > 0 ? Ls / 2 > bottom + 0.5 + 1e-9 : -Ls / 2 < bottom - 0.5 - 1e-9) return null;
    }
    return engaged;
};

/**
 * Check if shaft/hole geometry matches (shaft types except stud/antistud already handled,
 * ball handled separately).
 * @param {object} shaft transformed shaft connector (model LDU)
 * @param {object} hole transformed hole connector (model LDU)
 * @returns {boolean}
 */
const geometryMatchesShaftHole = (shaft, hole) => shaftEngagement(shaft, hole) !== null;

/**
 * Build the connection graph from a PlacedModel and catalog.
 * @param {object} model PlacedModel (already filtered for unknown parts)
 * @param {Map<string,object>|object} catalog Map or record partName -> PartMeta
 * @param {Array} diagnostics array to push warnings into (motor-without-port)
 * @returns {{nodes: Map<string,object>, edges: Array}}
 */
export const buildGraph = (model, catalog, diagnostics = []) => {
    const catalogMap = catalog instanceof Map ? catalog : new Map(Object.entries(catalog || {}));
    /** @type {Map<string, object>} nodeId -> {id, partId, placed, meta, connectors: Array} */
    const nodes = new Map();
    /** @type {Array} edges */
    const edges = [];

    // Create nodes, handle motors
    for (const pl of model.parts) {
        const meta = catalogMap.get(pl.part);
        if (!meta) continue; // unknown, caller handles diagnostic
        const rot = pl.rotation;
        if (meta.motor) {
            const outIds = new Set(meta.motor.output || []);
            const housingConns = meta.connectors.filter(c => !outIds.has(c.id));
            const outConns = meta.connectors.filter(c => outIds.has(c.id));

            const housingTrans = housingConns.map(c => transformConnector(c, pl.position, rot));
            const outTrans = outConns.map(c => transformConnector(c, pl.position, rot));

            const housingNodeId = pl.id;
            const outNodeId = `${pl.id}#out`;

            nodes.set(housingNodeId, {id: housingNodeId, partId: pl.id, placed: pl, meta, connectors: housingTrans});
            nodes.set(outNodeId, {id: outNodeId, partId: pl.id, placed: pl, meta, connectors: outTrans});

            // Motor internal hinge between housing and out
            if (outTrans.length > 0) {
                // Use the axlehole output if present (the centre shaft), otherwise centroid of all outputs.
                // The real SPIKE motor has one axlehole in the centre and 4 pinholes around it 20 LDU off; taking the first
                // connector (which may be a pinhole) would put the hinge 20 LDU off the shaft.
                let point;
                let axis;
                const axleHoleOut = outTrans.filter(c => c.type === 'axlehole');
                if (axleHoleOut.length > 0) {
                    point = axleHoleOut[0].position.slice();
                    axis = axleHoleOut[0].axis.slice();
                } else {
                    // Centroid of all output connector positions (they share one axis direction)
                    let cx = 0; let cy = 0; let cz = 0;
                    for (const c of outTrans) { cx += c.position[0]; cy += c.position[1]; cz += c.position[2]; }
                    cx /= outTrans.length; cy /= outTrans.length; cz /= outTrans.length;
                    point = [cx, cy, cz];
                    axis = outTrans[0].axis.slice();
                }
                const edge = {
                    a: {part: housingNodeId, connector: housingTrans.length > 0 ? housingTrans[0].id : outTrans[0].id},
                    b: {part: outNodeId, connector: outTrans[0].id},
                    kind: 'hinge',
                    point,
                    axis,
                    isMotor: true,
                    motor: null,
                    _isMotorInternal: true,
                    _aNode: housingNodeId,
                    _bNode: outNodeId,
                };
                if (pl.port) {
                    const maxSpeedRadPerSec = meta.motor.maxSpeedDegPerSec * Math.PI / 180;
                    edge.motor = {port: pl.port, maxTorqueNm: meta.motor.maxTorqueNm, maxSpeedRadPerSec};
                    if (Number.isInteger(meta.motor.deviceId)) edge.motor.deviceId = meta.motor.deviceId;
                } else {
                    diagnostics.push({severity: 'warning', code: 'motor-without-port', message: `Motor ${pl.id} has no port`, parts: [pl.id]});
                }
                edges.push(edge);
            } else {
                diagnostics.push({severity: 'warning', code: 'motor-without-port', message: `Motor ${pl.id} has no output connectors`, parts: [pl.id]});
            }
        } else {
            const trans = meta.connectors.map(c => transformConnector(c, pl.position, rot));
            nodes.set(pl.id, {id: pl.id, partId: pl.id, placed: pl, meta, connectors: trans});
        }
    }

    // Between different parts (different partId), compare connectors
    const nodeList = [...nodes.values()];
    // Deterministic iteration: sort nodes by id
    nodeList.sort((a, b) => a.id.localeCompare(b.id));

    for (let i = 0; i < nodeList.length; i++) {
        const nA = nodeList[i];
        for (let j = i + 1; j < nodeList.length; j++) {
            const nB = nodeList[j];
            // Different PlacedModel parts only (motor housing vs output share same partId but are already handled as motor internal hinge; we should NOT connect housing/out via normal connector matching)
            if (nA.partId === nB.partId) continue;
            for (const cA of nA.connectors) {
                for (const cB of nB.connectors) {
                    let shaft; let hole; let shaftNode; let holeNode;
                    let pairKind = null;

                    // Check both orderings
                    const tryPair = (s, sNode, h, hNode) => {
                        const k = edgeKind(s, h);
                        if (!k) return false;
                        // Ball is special: distance only, no axis geometry
                        if (k === 'ball') {
                            if (vecDist(s.position, h.position) > TOL) return false;
                            // ball match
                            pairKind = 'ball';
                            shaft = s; hole = h; shaftNode = sNode; holeNode = hNode;
                            return true;
                        }
                        if (s.type === 'stud' && h.type === 'antistud') {
                            if (vecDist(s.position, h.position) > TOL) return false;
                            pairKind = k; shaft = s; hole = h; shaftNode = sNode; holeNode = hNode;
                            return true;
                        }
                        // Shaft/hole with length check
                        if (!geometryMatchesShaftHole(s, h)) return false;
                        pairKind = k; shaft = s; hole = h; shaftNode = sNode; holeNode = hNode;
                        return true;
                    };

                    const aIsShaft = isShaftType(cA.type) || cA.type === 'ball' || cA.type === 'ballsocket';
                    // We need to try cA as shaft vs cB as hole, and vice versa
                    // Determine candidate shaft/hole based on types
                    let matched = false;
                    // cA shaft, cB hole
                    if ((isShaftType(cA.type) && isHoleType(cB.type)) || (cA.type === 'ball' && cB.type === 'ballsocket') || (cA.type === 'stud' && cB.type === 'antistud')) {
                        matched = tryPair(cA, nA, cB, nB);
                    }
                    if (!matched && ((isShaftType(cB.type) && isHoleType(cA.type)) || (cB.type === 'ball' && cA.type === 'ballsocket') || (cB.type === 'stud' && cA.type === 'antistud'))) {
                        matched = tryPair(cB, nB, cA, nA);
                    }
                    // Also handle ball ballsocket swapped already above, but also need ball as shaft vs socket as hole logic: we considered stud etc. The generic edgeKind handles ball as shaft vs hole. Ensure we handle both permutations.
                    // The above covers ball->ballsocket one way; the second call covers opposite.

                    if (!matched) continue;

                    // Create edge: a = hole side (for non-ball, point/axis = hole's), b = shaft side
                    // For ball, point is ball centre, body1 = socket island, body2 = ball island per spec
                    // So for ball, hole = ballsocket, shaft = ball -> body1 socket, body2 ball
                    // Our holeNode is socket, shaftNode is ball already
                    const edge = {
                        a: {part: holeNode.id, connector: hole.id},
                        b: {part: shaftNode.id, connector: shaft.id},
                        kind: pairKind,
                        point: hole.position.slice(),
                        axis: hole.axis.slice(),
                    };
                    // For ball, axis not used but contracts store only point for ball joints; we still provide axis from hole (socket opening direction) but islands/joints will ignore it for ball joints. We'll keep it but joints will not use.
                    // However spec says ball connectors have axis (socket opening) not used for matching. We store hole axis but joint builder will ignore.
                    edges.push(edge);
                }
            }
        }
    }

    // Sort edges deterministically by a.part, a.connector, b.part, b.connector, kind, point coords
    edges.sort((e1, e2) => {
        let c = e1.a.part.localeCompare(e2.a.part);
        if (c !== 0) return c;
        c = e1.a.connector.localeCompare(e2.a.connector);
        if (c !== 0) return c;
        c = e1.b.part.localeCompare(e2.b.part);
        if (c !== 0) return c;
        c = e1.b.connector.localeCompare(e2.b.connector);
        if (c !== 0) return c;
        c = e1.kind.localeCompare(e2.kind);
        if (c !== 0) return c;
        for (let i = 0; i < 3; i++) {
            if (e1.point[i] !== e2.point[i]) return e1.point[i] - e2.point[i];
        }
        return 0;
    });

    return {nodes, edges};
};

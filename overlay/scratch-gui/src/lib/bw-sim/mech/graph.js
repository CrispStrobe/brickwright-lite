// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// Connector matching (D1). Between connectors of DIFFERENT parts/graph nodes,
// the connector kind registry (registry/kinds.js; the v1 kinds are
// kinds/pin-axle.js: pin+pinhole (friction), axle+axlehole, axle+pinhole,
// stud+antistud, ball+ballsocket) says whether they join and with which edge.
// Geometry in LDU model frame. A part with an internal joint its device drives
// (a motor: PartMeta v2 internalJoints) splits into two graph nodes with an
// internal hinge.

import {mat3MulVec3, vecAdd, vecNormalize} from './vec.js';
import {upgradePartMeta, partMotorJoint, partMotor, portRefOf} from '../contracts.js';
import {BUILTIN_KINDS} from '../kinds/index.js';
import {PAIR_REACH_LDU, connectorBounds, createSpatialIndex, grow} from './spatial-index.js';

// The v1 connector rules live in kinds/pin-axle.js (the connector kind registry's first
// modules); they are re-exported here for the editor and the tests that always read them here.
export {edgeKind, MIN_ENGAGE_LDU, shaftEngagement, isShaftTypeExport, isHoleTypeExport} from '../kinds/pin-axle.js';

/** Transform a connector from part frame to LDraw model frame (LDU). */
const transformConnector = (conn, pos, rot) => {
    const p = vecAdd(mat3MulVec3(rot, conn.position), pos);
    const aRaw = mat3MulVec3(rot, conn.axis);
    const a = vecNormalize(aRaw);
    const out = {id: conn.id, type: conn.type, position: p, axis: a, length: conn.length, friction: conn.friction, _orig: conn};
    if (conn.closedEnd !== undefined) out.closedEnd = conn.closedEnd;
    return out;
};

/**
 * Build the connection graph from a PlacedModel and catalog.
 * @param {object} model PlacedModel (already filtered for unknown parts)
 * @param {Map<string,object>|object} catalog Map or record partName -> PartMeta
 * @param {Array} diagnostics array to push warnings into (motor-without-port)
 * @param {object} [kinds] the kind registries (kinds/index.js): which connectors pair, and how
 * @returns {{nodes: Map<string,object>, edges: Array}}
 *   A node's `meta` is the part's PartMeta v2 (upgradePartMeta). A motor's internal edge
 *   carries `motor` (the v1 joint motor: port, numbers, device id) and `actuator`
 *   ({port: {hub, port}, device}: what compile.js turns into the v2 actuator).
 */
export const buildGraph = (model, catalog, diagnostics = [], kinds = BUILTIN_KINDS) => {
    const catalogMap = catalog instanceof Map ? catalog : new Map(Object.entries(catalog || {}));
    /** @type {Map<string, object>} nodeId -> {id, partId, placed, meta, connectors: Array} */
    const nodes = new Map();
    /** @type {Array} edges */
    const edges = [];

    // Create nodes, handle motors
    for (const pl of model.parts) {
        const meta = upgradePartMeta(catalogMap.get(pl.part));
        if (!meta) continue; // unknown, caller handles diagnostic
        const rot = pl.rotation;
        const shaftJoint = partMotorJoint(meta);
        if (shaftJoint) {
            const outIds = new Set(shaftJoint.movingConnectors || []);
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
                if (shaftJoint.point && shaftJoint.axis) {
                    // PartMeta v2 names the shaft (the v1 upgrade copies the output axlehole's).
                    point = vecAdd(mat3MulVec3(rot, shaftJoint.point), pl.position);
                    axis = vecNormalize(mat3MulVec3(rot, shaftJoint.axis));
                } else if (axleHoleOut.length > 0) {
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
                const ref = portRefOf(pl);
                const motor = partMotor(meta);
                if (ref && motor) {
                    const {device} = motor;
                    const maxSpeedRadPerSec = device.motor.servoMaxDegPerSec * Math.PI / 180;
                    edge.motor = {port: ref.port, maxTorqueNm: device.motor.stallTorqueNm, maxSpeedRadPerSec};
                    if (device.ids && Number.isInteger(device.ids.lpf2)) edge.motor.deviceId = device.ids.lpf2;
                    edge.actuator = {port: ref, device: device.id};
                } else if (ref) {
                    diagnostics.push({severity: 'warning', code: 'motor-without-device', message: `Motor ${pl.id} names no motor device`, parts: [pl.id]});
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

    // Broad phase (spatial-index.js): a pair rule only joins connectors that come within PAIR_REACH_LDU
    // of each other, so each node is compared with the nodes whose connectors are that near, not with
    // every node of the model (a 2,000-part model: seconds, every compile).
    const boxes = nodeList.map(n => connectorBounds(n.connectors));
    const index = createSpatialIndex(boxes);
    for (let i = 0; i < nodeList.length; i++) {
        const nA = nodeList[i];
        if (!boxes[i]) continue;
        for (const j of index.queryBox(grow(boxes[i], PAIR_REACH_LDU))) {
            if (j <= i) continue;
            const nB = nodeList[j];
            // Different PlacedModel parts only (motor housing vs output share same partId but are already handled as motor internal hinge; we should NOT connect housing/out via normal connector matching)
            if (nA.partId === nB.partId) continue;
            for (const cA of nA.connectors) {
                for (const cB of nB.connectors) {
                    // The connector kind registry: cA tried as the shaft first, then cB (v1's order).
                    const pair = kinds.connectors.pair(cA, cB);
                    if (!pair) continue;
                    const {shaft, hole, kind: pairKind} = pair;
                    const [shaftNode, holeNode] = shaft === cA ? [nA, nB] : [nB, nA];
                    // Edge: a = hole side (point/axis are the hole's), b = shaft side. A ball joint
                    // (a = socket, b = ball) takes its point from the ball (joints.js).
                    const edge = {
                        a: {part: holeNode.id, connector: hole.id},
                        b: {part: shaftNode.id, connector: shaft.id},
                        kind: pairKind,
                        point: hole.position.slice(),
                        axis: hole.axis.slice(),
                    };
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

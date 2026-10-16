// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// Mechanism compiler entry: `compile(model, catalog, opts)` turns a
// PlacedModel + catalog into a CompiledMechanism (pure data in, pure data
// out). Runs validateCompiledMechanism on output and throws on bug.

import {validatePlacedModel, validateCompiledMechanism, GROUND_FRICTION, LDU_M, lduToWorld, dirToWorld} from '../contracts.js';
import {mat3MulVec3, vecAdd} from './vec.js';
import {buildGraph} from './graph.js';
import {buildIslands} from './islands.js';
import {buildJoints} from './joints.js';
import {buildGears} from './gears.js';
import {quatMul, quatConj} from './vec.js';

/** Rotate Vec3 v by unit quat q (xyzw) */
const quatRotateVec = (q, v) => {
    // q * v * q_conj, where v as quat [v,0]
    const qv = [v[0], v[1], v[2], 0];
    const qConj = quatConj(q);
    const t = quatMul(q, qv);
    const r = quatMul(t, qConj);
    return [r[0], r[1], r[2]];
};

/**
 * Create ground body (static box 2m x 2m, 0.02m thick) whose TOP is at lowest
 * world-y of any collider in the model (exact lowest point of each primitive).
 * Box: sum halfExtent_i * |y-component of local axis i in world|
 * Cylinder (axis a = rotated +y): halfHeight*|a_y| + radius*sqrt(1 - a_y^2)
 * Sphere: radius
 * @param {Array} bodies dynamic bodies already built
 * @returns {object} ground body
 */
const makeGround = (bodies, opts = {}) => {
    let lowest = Infinity;
    for (const b of bodies) {
        for (const col of b.colliders) {
            const colPos = col.position ? col.position : [0, 0, 0];
            const worldY = b.position[1] + colPos[1];
            let extent = 0;
            const rot = col.rotation ? col.rotation : [0, 0, 0, 1];
            if (col.shape === 'box') {
                const he = col.halfExtents;
                // Local axes X,Y,Z rotated
                const ax = quatRotateVec(rot, [1, 0, 0]);
                const ay = quatRotateVec(rot, [0, 1, 0]);
                const az = quatRotateVec(rot, [0, 0, 1]);
                extent = he[0] * Math.abs(ax[1]) + he[1] * Math.abs(ay[1]) + he[2] * Math.abs(az[1]);
            } else if (col.shape === 'cylinder') {
                const a = quatRotateVec(rot, [0, 1, 0]); // cylinder axis
                const ay = a[1];
                const hh = col.halfHeight; const r = col.radius;
                extent = hh * Math.abs(ay) + r * Math.sqrt(Math.max(0, 1 - ay * ay));
            } else if (col.shape === 'sphere') {
                extent = col.radius;
            }
            const bottom = worldY - extent;
            if (bottom < lowest) lowest = bottom;
        }
    }
    if (!isFinite(lowest)) lowest = 0;

    const halfThick = 0.01;
    const centerY = lowest - halfThick;
    return {
        id: 'ground',
        motion: 'static',
        position: [0, centerY, 0],
        rotation: [0, 0, 0, 1],
        massKg: 0,
        colliders: [{shape: 'box', halfExtents: [1, halfThick, 1]}],
        parts: [],
        friction: GROUND_FRICTION,
        color: opts.groundColor !== undefined ? opts.groundColor : 10,
        ...(opts.mat ? {mat: opts.mat} : {}),
    };
};

/**
 * Normalize catalog to Map.
 */
const toCatalogMap = catalog => {
    if (catalog instanceof Map) return catalog;
    if (catalog && typeof catalog === 'object') return new Map(Object.entries(catalog));
    return new Map();
};

/**
 * Compile a PlacedModel + catalog into a CompiledMechanism.
 * @param {object} model PlacedModel
 * @param {Map|object} catalog Map/record partName->PartMeta
 * @param {object} opts {ground?:boolean} ground===false disables ground body
 * @returns {object} CompiledMechanism
 */
export const compile = (model, catalog, opts = {}) => {
    const diagnostics = [];
    const catalogMap = toCatalogMap(catalog);

    // Validate input model (including catalog membership)
    const problems = validatePlacedModel(model, catalogMap);
    // Map problems to diagnostics
    for (const p of problems) {
        if (p.includes('is not in the part catalog') || p.includes('not in the part catalog')) {
            // Extract part name
            const m = p.match(/'([^']+)' is not in the part catalog/);
            const part = m ? m[1] : 'unknown';
            diagnostics.push({severity: 'error', code: 'unknown-part', message: p, parts: []});
        } else if (p.includes('not a proper rotation') || p.includes('port:')) {
            diagnostics.push({severity: 'error', code: 'invalid-model', message: p, parts: []});
        } else {
            // Generic invalid-model for any other validation problem
            if (p.includes('model.parts')) {
                diagnostics.push({severity: 'error', code: 'invalid-model', message: p, parts: []});
            } else {
                diagnostics.push({severity: 'error', code: 'invalid-model', message: p, parts: []});
            }
        }
    }

    // Filter parts to known ones; skip unknown parts (they are error, not throw)
    const knownParts = [];
    for (const pl of (model && Array.isArray(model.parts) ? model.parts : [])) {
        if (catalogMap.has(pl.part)) knownParts.push(pl);
        // else already diagnosed as unknown-part, skip
    }

    const filteredModel = {version: 1, parts: knownParts};

    // If filtered model has no valid parts, we still need to produce a mechanism with maybe ground only plus diagnostics
    // Build graph (even if empty)
    const {nodes, edges: graphEdges} = buildGraph(filteredModel, catalogMap, diagnostics);

    // Initial islands from rigid edges only
    let islands = buildIslands(nodes, graphEdges, catalogMap, diagnostics, opts);
    // Joints detection loop for locked-hinges
    let jointsResult = buildJoints(nodes, graphEdges, islands, diagnostics);
    let lockedPairs = jointsResult.lockedPairs;

    // If locked-hinges found, we need to merge islands and re-evaluate
    // Add warning diagnostics for locked
    let extraRigidPairsCollected = [];
    let iterations = 0;
    while (lockedPairs.length > 0 && iterations < 5) {
        iterations++;
        for (const [bA, bB] of lockedPairs) {
            diagnostics.push({severity: 'warning', code: 'locked-hinges', message: `Hinges between ${bA} and ${bB} lock, merging islands`, parts: []});
            // Need to find representative node ids for these bodies to union
            // Find any node belonging to body bA and any node belonging to body bB in current islands
            const nodesA = [...islands.nodeToBody.entries()].filter(([, bid]) => bid === bA).map(([nid]) => nid);
            const nodesB = [...islands.nodeToBody.entries()].filter(([, bid]) => bid === bB).map(([nid]) => nid);
            if (nodesA.length > 0 && nodesB.length > 0) {
                extraRigidPairsCollected.push([nodesA[0], nodesB[0]]);
            }
        }
        // Rebuild islands with extra rigid pairs
        islands = buildIslands(nodes, graphEdges, catalogMap, diagnostics, opts, extraRigidPairsCollected);
        jointsResult = buildJoints(nodes, graphEdges, islands, diagnostics);
        lockedPairs = jointsResult.lockedPairs;
        // Avoid infinite loop: if still locked, continue
        if (lockedPairs.length === 0) break;
    }

    const joints = jointsResult.joints;

    // Gears (after final islands/joints)
    const {gears} = buildGears(nodes, islands, joints, catalogMap, diagnostics);

    // Bodies final list: islands.bodies plus ground
    const bodies = [...islands.bodies];
    if (opts.ground !== false) {
        const ground = makeGround(bodies, opts);
        // Insert ground first to match example ordering (ground first)
        bodies.unshift(ground);
    }

    // Sort bodies deterministically: ground first (if present), then b0,b1... already sorted by smallest part id, but ground is 'ground' should stay first.
    // Our islands bodies are already b0... sorted. We'll keep ground at front.

    // Sort joints already deterministic from buildJoints (j0..), gears deterministic.

    // Sensors: from placed parts whose catalog entry has a sensor.
    const sensors = [];
    for (const pl of knownParts) {
        const meta = catalogMap.get(pl.part);
        if (!meta || !meta.sensor) continue;
        if (!pl.port) {
            diagnostics.push({severity: 'warning', code: 'sensor-without-port', message: 'Sensor ' + pl.id + ' has no port', parts: [pl.id]});
            continue;
        }
        let bodyId = islands.nodeToBody.get(pl.id);
        if (!bodyId) bodyId = islands.nodeToBody.get(pl.id + '#out');
        if (!bodyId) continue;
        const lduOrigin = vecAdd(mat3MulVec3(pl.rotation, meta.sensor.origin), pl.position);
        const worldOrigin = lduToWorld(lduOrigin);
        const lduDir = mat3MulVec3(pl.rotation, meta.sensor.direction);
        const worldDir = dirToWorld(lduDir);
        sensors.push({port: pl.port, kind: meta.sensor.kind, body: bodyId, origin: worldOrigin, direction: worldDir});
    }
    sensors.sort((a, b) => a.port.localeCompare(b.port));

    // Diagnostics: ensure deterministic order? Sort by code then message
    diagnostics.sort((a, b) => {
        let c = a.code.localeCompare(b.code);
        if (c !== 0) return c;
        c = a.severity.localeCompare(b.severity);
        if (c !== 0) return c;
        c = (a.message || '').localeCompare(b.message || '');
        if (c !== 0) return c;
        return 0;
    });

    const mechanism = {
        version: 1,
        gravity: [0, -9.81, 0],
        bodies,
        joints,
        gears,
        diagnostics,
    };
    if (sensors.length > 0) mechanism.sensors = sensors;

    const problemsOut = validateCompiledMechanism(mechanism);
    if (problemsOut.length > 0) {
        throw new Error(`compile produced invalid mechanism: ${problemsOut.join('; ')}`);
    }

    return mechanism;
};

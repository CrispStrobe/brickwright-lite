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
 * The placed parts of every connected group of bodies (bodies linked by joints) other
 * than the main one: the group with the hub, or else the one with the most parts.
 * @returns {string[][]} part ids per loose group, each sorted, groups in body order
 */
const looseGroups = (bodies, joints, catalogMap, nodes) => {
    if (bodies.length < 2) return [];
    const parent = new Map(bodies.map(b => [b.id, b.id]));
    const find = x => (parent.get(x) === x ? x : find(parent.get(x)));
    for (const j of joints) {
        if (!parent.has(j.body1) || !parent.has(j.body2)) continue;
        const a = find(j.body1); const b = find(j.body2);
        if (a !== b) parent.set(b, a);
    }
    const groups = new Map(); // root -> Set(part ids)
    for (const b of bodies) {
        const r = find(b.id);
        if (!groups.has(r)) groups.set(r, new Set());
        for (const pid of b.parts) groups.get(r).add(pid);
    }
    if (groups.size < 2) return [];
    const hubParts = new Set();
    for (const node of nodes.values()) if (node.meta && node.meta.hub) hubParts.add(node.partId);
    const list = [...groups.values()].map(set => [...set].sort((x, y) => x.localeCompare(y)));
    let main = list.findIndex(parts => parts.some(id => hubParts.has(id)));
    if (main < 0) {
        main = 0;
        list.forEach((parts, i) => { if (parts.length > list[main].length) main = i; });
    }
    return list.filter((_, i) => i !== main);
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
    // Map problems to diagnostics; a problem about one placed part names it (`model.parts[<id>]…`).
    const placedIds = new Set((model && Array.isArray(model.parts) ? model.parts : []).map(pl => pl && pl.id));
    const problemParts = p => {
        const m = p.match(/^model\.parts\[([^\]]+)\]/);
        return m && placedIds.has(m[1]) ? [m[1]] : [];
    };
    for (const p of problems) {
        const code = p.includes('is not in the part catalog') ? 'unknown-part' : 'invalid-model';
        diagnostics.push({severity: 'error', code, message: p, parts: problemParts(p)});
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

    // Topology fixpoint. Islands come from rigid edges; two things can then
    // weld islands together and force a rebuild: hinges between one island pair
    // that are not collinear (locked-hinges), and a gear rigidly on the frame its
    // mesh partner turns in (gear-on-frame, gears.js). Each pass rebuilds islands,
    // joints and gears from the graph plus the welds found so far; the gear pass's
    // other diagnostics are kept from the final pass only.
    const extraRigidPairs = [];
    const firstNodeOf = (islandsNow, bodyId) => {
        for (const [nid, bid] of islandsNow.nodeToBody.entries()) if (bid === bodyId) return nid;
        return null;
    };
    const weld = (islandsNow, bA, bB) => {
        const nA = firstNodeOf(islandsNow, bA);
        const nB = firstNodeOf(islandsNow, bB);
        if (nA && nB) extraRigidPairs.push([nA, nB]);
    };
    let islands;
    let jointsResult;
    let gearResult;
    let gearDiagnostics;
    // Every weld merges two islands, so this settles in at most one pass per node.
    for (let pass = 0; pass <= nodes.size + 1; pass++) {
        islands = buildIslands(nodes, graphEdges, catalogMap, diagnostics, opts, extraRigidPairs);
        jointsResult = buildJoints(nodes, graphEdges, islands, diagnostics);
        if (jointsResult.lockedPairs.length > 0) {
            jointsResult.lockedPairs.forEach(([bA, bB], i) => {
                const parts = (jointsResult.lockedParts && jointsResult.lockedParts[i]) || [];
                diagnostics.push({severity: 'warning', code: 'locked-hinges', message: `Hinges between ${bA} and ${bB} lock, merging islands`, parts});
                weld(islands, bA, bB);
            });
            continue;
        }
        gearDiagnostics = [];
        gearResult = buildGears(nodes, islands, jointsResult.joints, catalogMap, gearDiagnostics, jointsResult.jointEntries);
        if (gearResult.lockedPairs.length === 0) break;
        for (const d of gearDiagnostics) if (d.code === 'gear-on-frame') diagnostics.push(d);
        for (const [bA, bB] of gearResult.lockedPairs) weld(islands, bA, bB);
        gearResult = null;
    }
    if (!gearResult) throw new Error('compile: mechanism topology did not settle');
    // A gear welded by gear-on-frame is "not on a hinge" by construction; that is the lock, already said.
    const lockedGears = new Set(diagnostics.filter(d => d.code === 'gear-on-frame').flatMap(d => d.parts));
    for (const d of gearDiagnostics) {
        if (d.code === 'gear-not-on-hinge' && d.parts.every(p => lockedGears.has(p))) continue;
        diagnostics.push(d);
    }

    const joints = jointsResult.joints;
    const {gears} = gearResult;

    // Loose parts: bodies that no joint links, directly or through other bodies, to the
    // body carrying the hub (or, without a hub, to the largest connected group). They are
    // not held by the robot: they fall off or lie where they are.
    for (const group of looseGroups(islands.bodies, joints, catalogMap, nodes)) {
        diagnostics.push({severity: 'warning', code: 'loose-part', message: `Not connected to the rest of the model: ${group.join(', ')}`, parts: group});
    }

    // Bodies final list: islands.bodies plus ground
    const bodies = [...islands.bodies];
    if (opts.ground !== false) {
        const ground = makeGround(bodies, opts);
        // Insert ground first to match example ordering (ground first)
        bodies.unshift(ground);
    }

    // Obstacles: each becomes a STATIC body sitting on the floor (bottom at ground top)
    if (Array.isArray(opts.obstacles)) {
        const seenIds = new Set();
        let groundTop = 0;
        if (bodies.length > 0) {
            const g = bodies.find(b => b.id === 'ground');
            if (g) groundTop = g.position[1] + 0.01;
            else {
                // No ground? Use lowest as 0 fallback already
                groundTop = 0;
            }
        }
        for (const obs of opts.obstacles) {
            const id = obs && typeof obs.id === 'string' ? obs.id : '';
            let bad = null;
            if (!id) bad = `obstacle id missing`;
            else if (seenIds.has(id)) bad = `duplicate obstacle id '${id}'`;
            else if (obs.shape !== 'box') bad = `obstacle '${id}' shape must be 'box'`;
            else if (!Array.isArray(obs.size) || obs.size.length !== 3 || !obs.size.every(v => typeof v === 'number' && Number.isFinite(v) && v > 0)) bad = `obstacle '${id}' size must be three positive numbers`;
            else if (!Array.isArray(obs.position) || obs.position.length !== 3 || !obs.position.every(v => typeof v === 'number' && Number.isFinite(v))) bad = `obstacle '${id}' position must be Vec3`;
            else if (obs.yawDeg !== undefined && !(typeof obs.yawDeg === 'number' && Number.isFinite(obs.yawDeg))) bad = `obstacle '${id}' yawDeg must be a number`;
            else if (obs.color !== undefined && !(Number.isInteger(obs.color) && obs.color >= 0 && obs.color <= 10)) bad = `obstacle '${id}' color must be 0..10`;
            // Also check size positive already, but also need to check duplicate id tracking even if bad due to other reason? We already.
            if (bad) {
                diagnostics.push({severity: 'error', code: 'bad-obstacle', message: bad, parts: []});
                if (id) seenIds.add(id);
                continue;
            }
            // Valid: record id
            seenIds.add(id);
            const size = obs.size;
            const pos = obs.position;
            const yawDeg = obs.yawDeg || 0;
            const yawRad = yawDeg * Math.PI / 180;
            const half = yawRad / 2;
            const qy = Math.sin(half);
            const qw = Math.cos(half);
            // rotation about Y: [0, sin(yaw/2), 0, cos(yaw/2)]
            const rot = [0, qy, 0, qw];
            const h = size[1];
            const bottomY = groundTop + pos[1];
            const centerY = bottomY + h / 2;
            const body = {
                id: `obstacle:${id}`,
                motion: 'static',
                position: [pos[0], centerY, pos[2]],
                rotation: rot,
                massKg: 0,
                colliders: [{shape: 'box', halfExtents: [size[0] / 2, size[1] / 2, size[2] / 2]}],
                parts: [],
            };
            if (obs.color !== undefined) body.color = obs.color;
            bodies.push(body);
        }
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

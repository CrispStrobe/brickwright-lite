// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// SPIKE sensor models for Sim Lab (plan task E2, first slice).
//
// Pure functions that turn a running physics core + a CompiledMechanism
// into the hub's sensor readings. Used by SimHubBridge after each physics
// step. Units and ranges match docs/SPIKE-ARENA.md and the arena's
// arena-hub-bridge.js value shapes (deviceId 61/62/63 in the bridge).
//
// Frames: sensor origin/direction are in the part's LDraw frame (LDU) in
// PartMeta, converted to world frame at t=0 (metres) by the compiler and
// stored in CompiledMechanism.sensors[].origin/direction. At run time the
// body may have moved, so the t=0 local offset is carried through the
// body's pose: local = t0World − t0Body, world = bodyPose + q·local.
//
// Sensor models (S1):
//   distance: castRay from current world origin/direction, ignoring the
//     robot's own bodies; mm = round(distance·1000); outside 50..2000 → −1.
//   color: castRay down the sensor direction up to 32 mm; beyond that color
//     −1 reflection 0. In S1 the ground is uniform: colour is the ground
//     body's colour (opts.groundColor, default 10 white), reflection 100 for
//     white, 0 for black, scaled by 1 − distance/0.032.
//   force: castRay along the plunger up to ~5 mm; if a hit is within 2 mm,
//     force = 100·(1 − d/0.002) (clamped), pressed when >10.

/** LEGO device ids, matching lib/spike-arena/arena-hub-bridge.js. */
export const SENSOR_DEVICE = Object.freeze({color: 61, distance: 62, force: 63});

const quatConj = q => [0 - q[0], 0 - q[1], 0 - q[2], q[3]];

const quatMul = (a, b) => {
    const [ax, ay, az, aw] = a;
    const [bx, by, bz, bw] = b;
    return [
        aw * bx + ax * bw + ay * bz - az * by,
        aw * by - ax * bz + ay * bw + az * bx,
        aw * bz + ax * by - ay * bx + az * bw,
        aw * bw - ax * bx - ay * by - az * bz,
    ];
};

const quatRotateVec = (q, v) => {
    const qv = [v[0], v[1], v[2], 0];
    const qc = quatConj(q);
    const t = quatMul(q, qv);
    const r = quatMul(t, qc);
    return [r[0], r[1], r[2]];
};

const vecSub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const vecAdd = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];

/**
 * Read all sensors of a mechanism at the core's current time.
 * @param {object} core a physics core from createPhysicsCore (with bodyPose, castRay)
 * @param {object} mechanism the CompiledMechanism the core runs
 * @param {string[]} robotBodies body ids to ignore (the robot's own bodies)
 * @returns {Object<string, object>} port -> {kind, ...values} (without deviceId)
 */
export const readSensors = (core, mechanism, robotBodies = []) => {
    const out = {};
    if (!mechanism || !Array.isArray(mechanism.sensors) || mechanism.sensors.length === 0) return out;

    // Ground colour in S1: uniform mat. compile.js puts it on the ground body
    // as `color` (default 10 white). Fallback to white if absent.
    let groundColor = 10;
    const ground = mechanism.bodies.find(b => b.id === 'ground');
    if (ground && typeof ground.color === 'number') groundColor = ground.color;
    else {
        const anyColored = mechanism.bodies.find(b => typeof b.color === 'number');
        if (anyColored) groundColor = anyColored.color;
    }
    const isWhite = groundColor !== 0;
    const baseReflection = isWhite ? 100 : 0;
    const whiteRgb = [1000, 1000, 1000];
    const blackRgb = [60, 60, 60];

    const initialMap = new Map(mechanism.bodies.map(b => [b.id, b]));
    const ignoreBodies = Array.isArray(robotBodies) ? robotBodies : [];

    for (const sensor of mechanism.sensors) {
        const initialBody = initialMap.get(sensor.body);
        if (!initialBody) continue;
        let pose;
        try { pose = core.bodyPose(sensor.body); } catch (_) { continue; }
        if (!pose) continue;

        // t0 local offset: worldOrigin − t0BodyPos, rotated by inv(t0BodyQuat).
        // Islands are built with identity rotation at t=0, so the quat part is a
        // no-op today, but we handle the general case.
        const invInit = quatConj(initialBody.rotation);
        const delta0 = vecSub(sensor.origin, initialBody.position);
        const localOrigin = quatRotateVec(invInit, delta0);
        const localDir = quatRotateVec(invInit, sensor.direction);

        const worldOrigin = vecAdd(quatRotateVec(pose.rotation, localOrigin), pose.position);
        const worldDirRaw = quatRotateVec(pose.rotation, localDir);
        const len = Math.hypot(...worldDirRaw);
        if (len < 1e-12) continue;
        const worldDir = worldDirRaw.map(v => v / len);

        if (sensor.kind === 'distance') {
            // Cast up to 2.5 m; valid readings are 50..2000 mm.
            const maxDist = 2.5;
            let hit = null;
            try { hit = core.castRay(worldOrigin, worldDir, maxDist, {ignoreBodies}); } catch (_) {}
            if (!hit) {
                out[sensor.port] = {kind: 'distance', distance: -1};
            } else {
                const mm = Math.round(hit.distance * 1000);
                out[sensor.port] = {kind: 'distance', distance: (mm >= 50 && mm <= 2000) ? mm : -1};
            }
        } else if (sensor.kind === 'color') {
            const maxDist = 0.032;
            let hit = null;
            try { hit = core.castRay(worldOrigin, worldDir, maxDist, {ignoreBodies}); } catch (_) {}
            if (!hit) {
                out[sensor.port] = {kind: 'color', color: -1, reflection: 0, red: 0, green: 0, blue: 0};
            } else {
                const d = hit.distance;
                const reflection = Math.round(baseReflection * (1 - d / 0.032));
                const clampedReflection = Math.max(0, Math.min(100, reflection));
                const rgb = isWhite ? whiteRgb : blackRgb;
                out[sensor.port] = {
                    kind: 'color',
                    color: groundColor,
                    reflection: clampedReflection,
                    red: rgb[0],
                    green: rgb[1],
                    blue: rgb[2],
                };
            }
        } else if (sensor.kind === 'force') {
            // Tip probe: cast up to 5 mm, but only 0..2 mm counts.
            const maxDist = 0.01;
            let hit = null;
            try { hit = core.castRay(worldOrigin, worldDir, maxDist, {ignoreBodies}); } catch (_) {}
            if (!hit) {
                out[sensor.port] = {kind: 'force', force: 0, pressed: false};
            } else {
                const d = hit.distance;
                let force = 0;
                if (d <= 0) force = 100;
                else if (d < 0.002) force = Math.round((0.002 - d) / 0.002 * 100);
                else force = 0;
                force = Math.max(0, Math.min(100, force));
                out[sensor.port] = {kind: 'force', force, pressed: force > 10};
            }
        }
    }
    return out;
};

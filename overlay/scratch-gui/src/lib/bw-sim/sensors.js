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
import {createMat} from './world/mats.js';
export const SENSOR_DEVICE = Object.freeze({color: 61, distance: 62, force: 63});


/**
 * SPIKE IMU helpers — pitch/roll/faceUp from a hub body's world pose.
 *
 * SPIKE convention (documented by the nose-up test): when the hub lies
 * flat with its display (top) up, pitch = 0, roll = 0, faceUp = top (0),
 * and acceleration reads (0, 0, 1000) milli-g on the axis through its face.
 * The hub's local axes in world when the body is at identity are:
 *   +X = right (east), +Y = up, +Z = south; the hub's forward is -Z (north)
 *   and its face (display) normal is +Y (up). SPIKE's IMU axes are:
 *   X = right (+X body), Y = forward (-Z body), Z = up (+Y body).
 * Pitch is rotation about X (right), positive when the nose (forward) lifts
 * up; roll is about Y (forward), positive when the right side lifts up.
 * This matches the test that tilts the hub nose-up and expects positive pitch.
 */
const pitchFromQuat = q => {
    const bodyZ = quatRotateVec(q, [0, 0, 1]);
    const spikeY = [-bodyZ[0], -bodyZ[1], -bodyZ[2]]; // forward
    return Math.atan2(spikeY[1], Math.hypot(spikeY[0], spikeY[2])) * 180 / Math.PI;
};
const rollFromQuat = q => {
    const bodyX = quatRotateVec(q, [1, 0, 0]);
    // roll positive when right side up: right vector's Y positive
    return Math.atan2(bodyX[1], Math.hypot(bodyX[0], bodyX[2])) * 180 / Math.PI;
};
const faceUpFromQuat = q => {
    const bodyX = quatRotateVec(q, [1, 0, 0]);
    const bodyY = quatRotateVec(q, [0, 1, 0]);
    const bodyZ = quatRotateVec(q, [0, 0, 1]);
    const spikeX = bodyX;
    const spikeY = [-bodyZ[0], -bodyZ[1], -bodyZ[2]];
    const spikeZ = bodyY;
    const up = [0, 1, 0];
    const dot = (a, b) => a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
    const faces = [
        {id: 0, vec: spikeZ},
        {id: 1, vec: spikeZ.map(v=>-v)},
        {id: 2, vec: spikeY},
        {id: 3, vec: spikeY.map(v=>-v)},
        {id: 4, vec: spikeX},
        {id: 5, vec: spikeX.map(v=>-v)},
    ];
    let best = faces[0], bestDot = dot(faces[0].vec, up);
    for (const f of faces) { const d = dot(f.vec, up); if (d > bestDot) { bestDot = d; best = f; } }
    return best.id;
};

export const imuFromBody = (pose, angVelWorld, linVelWorld, prevLinVelWorld, dt, gravityWorld) => {
    const q = pose.rotation;
    const pitch = pitchFromQuat(q);
    const roll = rollFromQuat(q);
    const faceUp = faceUpFromQuat(q);
    // Angular velocity: world -> spike local
    const invQ = quatConj(q);
    const angBody = quatRotateVec(invQ, angVelWorld);
    // spike axes: X=bodyX, Y=-bodyZ, Z=bodyY
    const spikeAng = [angBody[0], -angBody[2], angBody[1]];
    const angularVelocity = {
        x: spikeAng[0] * 180 / Math.PI,
        y: spikeAng[1] * 180 / Math.PI,
        z: spikeAng[2] * 180 / Math.PI,
    };
    // Linear acceleration: (curr - prev)/dt, plus gravity
    let linAccWorld = [0, 0, 0];
    if (prevLinVelWorld && dt > 1e-9) {
        linAccWorld = [
            (linVelWorld[0] - prevLinVelWorld[0]) / dt,
            (linVelWorld[1] - prevLinVelWorld[1]) / dt,
            (linVelWorld[2] - prevLinVelWorld[2]) / dt,
        ];
    }
    // Proper acceleration = linAcc - gravity (gravity is [0,-9.81,0] down, so -gravity is up)
    const properWorld = [
        linAccWorld[0] - gravityWorld[0],
        linAccWorld[1] - gravityWorld[1],
        linAccWorld[2] - gravityWorld[2],
    ];
    const properBody = quatRotateVec(invQ, properWorld);
    const spikeAcc = [properBody[0], -properBody[2], properBody[1]];
    const toMilliG = v => v * 1000 / 9.81;
    const acceleration = {
        x: toMilliG(spikeAcc[0]),
        y: toMilliG(spikeAcc[1]),
        z: toMilliG(spikeAcc[2]),
    };
    return {pitch, roll, angularVelocity, acceleration, faceUp};
};

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
                let hitColor = groundColor;
                let useMat = false;
                let matReflection = 100;
                let matRgb = whiteRgb;
                let otherBodyColor = null;
                if (hit.bodyId === 'ground' && ground && typeof ground.mat === 'string') {
                    const mat = createMat(ground.mat);
                    if (mat) {
                        const v = mat.colorAt(hit.point[0], hit.point[2]);
                        hitColor = v.color;
                        matReflection = v.reflection;
                        matRgb = v.rgb;
                        useMat = true;
                    }
                } else if (hit.bodyId && hit.bodyId !== 'ground') {
                    const hitBody = mechanism.bodies.find(b => b.id === hit.bodyId);
                    if (hitBody && typeof hitBody.color === 'number') {
                        hitColor = hitBody.color;
                        otherBodyColor = hitBody.color;
                    } else {
                        out[sensor.port] = {kind: 'color', color: -1, reflection: 0, red: 0, green: 0, blue: 0};
                        continue;
                    }
                }
                if (useMat) {
                    const reflection = Math.round(matReflection * (1 - d / 0.032));
                    const clampedReflection = Math.max(0, Math.min(100, reflection));
                    out[sensor.port] = {
                        kind: 'color',
                        color: hitColor,
                        reflection: clampedReflection,
                        red: matRgb[0],
                        green: matRgb[1],
                        blue: matRgb[2],
                    };
                } else if (otherBodyColor !== null) {
                    const isOtherWhite = otherBodyColor !== 0;
                    const reflBase = isOtherWhite ? 100 : 5;
                    const rgbOther = isOtherWhite ? whiteRgb : blackRgb;
                    const reflection = Math.round(reflBase * (1 - d / 0.032));
                    const clampedReflection = Math.max(0, Math.min(100, reflection));
                    out[sensor.port] = {
                        kind: 'color',
                        color: hitColor,
                        reflection: clampedReflection,
                        red: rgbOther[0],
                        green: rgbOther[1],
                        blue: rgbOther[2],
                    };
                } else {
                    const reflection = Math.round(baseReflection * (1 - d / 0.032));
                    const clampedReflection = Math.max(0, Math.min(100, reflection));
                    const rgb = isWhite ? whiteRgb : blackRgb;
                    out[sensor.port] = {
                        kind: 'color',
                        color: hitColor,
                        reflection: clampedReflection,
                        red: rgb[0],
                        green: rgb[1],
                        blue: rgb[2],
                    };
                }
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

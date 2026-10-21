// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
/**
 * The Wall stopper's physical judge, for a track recorded in the Robot Lab (test/helpers/sim-lab-vm.mjs
 * runOnSimLab or test/helpers/spike-lab-routes.mjs runSpikeProjectInLab: both record, per frame,
 * `points` (sensor ray origins by port), `readings` (what the hub reads by port), `bodies` (every
 * dynamic body's pose) and `busy` (whether the hub's controller drives each motor port)).
 *
 * The same rule as test/bw-sim-wall-stopper-program.test.mjs, through the shared judge
 * (scripts/lib/sim-lab-wall-stopper-judge.mjs): the wall face is where the compiled wall body is, the
 * robot's front is the foremost point of any of its colliders at their simulated poses. (a) The front
 * never reaches the wall face; (b) the drive motors stop within two VM frames and one sensor period after
 * the hub's reading first goes below the threshold, and not before; (c) the run-on after that crossing is
 * bounded by the crossing speed times that budget plus the shorted motors' braking distance.
 */
import path from 'node:path';
import {REPO} from './bw-integrated.mjs';

const SIM = path.join(REPO, 'overlay', 'scratch-gui', 'src', 'lib', 'bw-sim');
const {STEP_MS} = await import(path.join(SIM, 'hub-bridge.js'));
const {brakingBound, judgeWallStop} = await import(path.join(REPO, 'scripts', 'lib', 'sim-lab-wall-stopper-judge.mjs'));

const rotate = ([x, y, z, w], v) => {
    const ix = w * v[0] + y * v[2] - z * v[1];
    const iy = w * v[1] + z * v[0] - x * v[2];
    const iz = w * v[2] + x * v[1] - y * v[0];
    const iw = -x * v[0] - y * v[1] - z * v[2];
    return [ix * w - iw * x - iy * z + iz * y, iy * w - iw * y - iz * x + ix * z, iz * w - iw * z - ix * y + iy * x];
};
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** How far a collider (body-local, as compiled) reaches along unit direction d, at the body's pose. */
const reach = (collider, pose, d) => {
    const local = v => rotate(pose.rotation, rotate(collider.rotation || [0, 0, 0, 1], v));
    const centre = rotate(pose.rotation, collider.position || [0, 0, 0]).map((v, i) => v + pose.position[i]);
    const c = dot(centre, d);
    if (collider.shape === 'sphere') return c + collider.radius;
    if (collider.shape === 'box') {
        const h = collider.halfExtents;
        return c + [[1, 0, 0], [0, 1, 0], [0, 0, 1]].reduce((s, axis, i) => s + Math.abs(dot(local(axis), d)) * h[i], 0);
    }
    if (collider.shape === 'cylinder') {
        const a = Math.abs(dot(local([0, 1, 0]), d));
        return c + a * collider.halfHeight + Math.sqrt(Math.max(0, 1 - a * a)) * collider.radius;
    }
    throw new Error(`collider shape ${collider.shape}`);
};

/** The wall's face toward the robot, from the compiled obstacle body: plane x = faceX. */
export const wallFace = mechanism => {
    const wall = mechanism.bodies.find(b => b.id === 'obstacle:wall');
    if (!wall) throw new Error('the mat compiles no wall body');
    return wall.position[0] - wall.colliders[0].halfExtents[0];
};

/**
 * @param {{track, mechanism, hubId}} run
 * @param {{thresholdMm: number, speedPercent: number, frameMs: number, port?: string}} options
 */
export function judgeWallStopRun ({track, mechanism, hubId}, {thresholdMm, speedPercent, frameMs, port = 'D'}) {
    const faceX = wallFace(mechanism);
    const robot = mechanism.bodies.filter(b => b.motion === 'dynamic');
    const ports = (mechanism.actuators || []).map(a => a.port);
    const samples = track.map(p => ({
        t: p.t,
        front: Math.max(...robot.flatMap(b => b.colliders.map(c => reach(c, p.bodies[b.id], [1, 0, 0])))),
        ray: p.points[port][0],
        reading: p.readings[port].distance,
        driving: ports.every(q => p.busy[q])
    }));
    const brake = brakingBound(mechanism, {speedPercent, hubBody: hubId});
    const verdict = judgeWallStop(samples, {faceX, thresholdMm, frameMs, sensorMs: STEP_MS, brakeM: brake.brakeM});
    const last = track.at(-1);
    const before = track.find(p => p.t >= last.t - 1000);
    const at = p => p.bodies[hubId].position;
    return {
        ...verdict, faceX, brake,
        startGap: faceX - track[0].points[port][0],
        // At rest: the last second of simulated time moved the hub less than 2 mm on the floor.
        settled: Math.hypot(at(last)[0] - at(before)[0], at(last)[2] - at(before)[2]) < 0.002
    };
}

export const reportWallStop = r => `front ${(r.frontGap * 100).toFixed(1)} cm, ray origin ${(r.rayGap * 100).toFixed(1)} cm, ` +
    `closest ${(r.closestGap * 100).toFixed(1)} cm from the wall face; stop began ${r.reactionMs?.toFixed(1)} ms after the crossing ` +
    `(budget ${r.budgetMs?.toFixed(1)}), ran on ${r.overrunM === null || r.overrunM === undefined ? '-' : (r.overrunM * 100).toFixed(2)} cm` +
    (r.failures.length ? `; ${r.failures.join('; ')}` : '');

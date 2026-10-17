// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
/**
 * Run a lite SPIKE program (`DEVICE SPIKE` .bw) in the Robot Lab (Sim Lab),
 * headless, through the path the browser takes when the pane's Run is pressed:
 *
 *   SB3Creator.parse -> generateSB3 -> the real Scratch VM
 *   -> the real bundled spikeprime extension -> Web Bluetooth (lite's shim)
 *   -> the virtual SPIKE hub -> SimHubBridge -> the Jolt physics model
 *   -> the colour sensor's ray on the mat -> the hub -> the extension.
 *
 * The VM side is test/helpers/spike-arena-vm.mjs's runOnArena, unchanged
 * (simulated time, the VM stepped at 30 frames per second, the world ticked by
 * the same frame time); only the world differs: a SimSession built the way the
 * pane builds it (prepareModel: the model placed on the mat's start pose, then
 * compiled), in place of the arena's bridge.
 *
 * What it reports is a TRACK: after every frame, where the drive-axle
 * midpoint and the colour sensor's spot are on the floor. The points are
 * carried by the hub body's pose from where the compiler put them at t = 0.
 * Every sensor's ray origin is carried the same way (`points`, by port), next
 * to what the hub reads on that port (`readings`), and every robot body's pose
 * is kept (`bodies`, by body id) for judges that need the whole robot.
 */
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {REPO} from './bw-integrated.mjs';
import {runOnArena, FRAME_MS} from './spike-arena-vm.mjs';

const SIM = path.join(REPO, 'overlay', 'scratch-gui', 'src', 'lib', 'bw-sim');
const {SimSession, prepareModel, catalogFrom, hubBodyOf} = await import(path.join(SIM, 'sim-session.js'));
const {loadJolt} = await import(path.join(SIM, 'physics', 'jolt-core.js'));
const {STEP_MS} = await import(path.join(SIM, 'hub-bridge.js'));

export const CATALOG = catalogFrom(JSON.parse(readFileSync(path.join(SIM, 'part-meta', 'parts.json'), 'utf8')));
export {FRAME_MS};

/** Rotate v by the unit quaternion [x, y, z, w]. */
const quatRotate = ([x, y, z, w], v) => {
    const ix = w * v[0] + y * v[2] - z * v[1];
    const iy = w * v[1] + z * v[0] - x * v[2];
    const iz = w * v[2] + x * v[1] - y * v[0];
    const iw = -x * v[0] - y * v[1] - z * v[2];
    return [
        ix * w - iw * x - iy * z + iz * y,
        iy * w - iw * y - iz * x + ix * z,
        iz * w - iw * z - ix * y + iy * x
    ];
};

/**
 * @param {string} source DEVICE SPIKE program
 * @param {object} options
 * @param {string} options.modelText LDraw text of the model (as the pane fetches it)
 * @param {string|null} [options.mat] mat id, as the pane's Mat selector sets it
 * @param {number} options.timeLimitMs simulated time budget
 * @param {function} [options.stopWhen] (track) => true ends the run early
 * @param {object} [options.worker] a PhysicsClient: the session runs its physics in that
 *        worker (ROADMAP §4.9), and each frame waits for its batch to reach the hub
 * @returns {Promise<{track: {t: number, axle: number[], sensor: number[], reflection: number, color: number,
 *          points: Object<string, number[]>, readings: Object<string, object>, bodies: Object<string, object>}[], issues, run, mechanism, hubId}>}
 */
export async function runOnSimLab (source, {modelText, mat = null, timeLimitMs, stopWhen = null, worker = null}) {
    const {model, runModel, mechanism, issues} = prepareModel(modelText, CATALOG, {mat});
    if (!mechanism) throw new Error(`the model does not compile: ${JSON.stringify(issues)}`);
    const J = worker ? null : await loadJolt();
    const hubId = hubBodyOf(model, mechanism, CATALOG);
    const loaded = worker ? await worker.simLoad({mechanism, hubBody: hubId, stepMs: STEP_MS}) : null;
    const hubDef = mechanism.bodies.find(b => b.id === hubId);
    const hinges = mechanism.joints.filter(j => j.motor);
    const axle0 = [0, 1, 2].map(i => hinges.reduce((sum, j) => sum + j.point[i], 0) / hinges.length);
    const sensor = (mechanism.sensors || []).find(s => s.kind === 'color');
    const port = sensor ? 'ABCDEF'.indexOf(sensor.port) : -1;
    const allSensors = mechanism.sensors || [];
    const robotIds = mechanism.bodies.filter(b => b.motion === 'dynamic').map(b => b.id);
    const track = [];
    let session = null;
    const bridgeFor = hub => {
        session = new SimSession({hubState: hub, model, runModel, mechanism, catalog: CATALOG, mat, J, worker, loaded});
        const carried = p0 => {
            const pose = session.core.bodyPose(hubId);
            const w = quatRotate(pose.rotation, [0, 1, 2].map(i => p0[i] - hubDef.position[i]));
            return w.map((v, i) => v + pose.position[i]);
        };
        const running = {status: 'running'};
        return {
            verdict: running,
            async tick (ms) {
                session.tick(ms);
                await session.idle();
                const reading = port >= 0 ? hub.data.sensors[port] : {};
                const points = {};
                const readings = {};
                for (const s of allSensors) {
                    points[s.port] = carried(s.origin);
                    readings[s.port] = {...hub.data.sensors['ABCDEF'.indexOf(s.port)]};
                }
                const bodies = {};
                for (const id of robotIds) {
                    const p = session.core.bodyPose(id);
                    bodies[id] = {position: [...p.position], rotation: [...p.rotation]};
                }
                track.push({t: session.time, axle: carried(axle0), sensor: sensor ? carried(sensor.origin) : null,
                    reflection: reading.reflection, color: reading.color, points, readings, bodies});
                return stopWhen && stopWhen(track) ? {status: 'done'} : running;
            }
        };
    };
    try {
        const run = await runOnArena(source, {timeLimitMs}, {bridgeFor});
        return {track, issues, run, mechanism, hubId, stats: session?.stats ?? null};
    } finally {
        session?.dispose();
    }
}

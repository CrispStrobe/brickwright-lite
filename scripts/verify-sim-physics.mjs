#!/usr/bin/env node
// SPDX-License-Identifier: BSD-3-Clause
// Run the plan's reference driving-base scenario through the integrated code.
// Usage: node scripts/verify-sim-physics.mjs [--model driving-base.ldr]
// Requires the normal integrated GUI dependencies. Reports one JSON measurement.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {performance} from 'node:perf_hooks';
import {Worker} from 'node:worker_threads';
import {fileURLToPath} from 'node:url';
import {parseModel} from '../packages/scratch-gui/src/lib/bw-sim/model/ldraw-model.js';
import {compile} from '../packages/scratch-gui/src/lib/bw-sim/mech/compile.js';
import {loadJolt, createPhysicsCore} from '../packages/scratch-gui/src/lib/bw-sim/physics/jolt-core.js';
import {SimHubBridge, STEP_MS} from '../packages/scratch-gui/src/lib/bw-sim/hub-bridge.js';
import {PhysicsClient} from '../packages/scratch-gui/src/lib/bw-sim/physics/physics-client.js';
import VirtualSpikeHubState from '../packages/scratch-gui/src/lib/virtual-hub/spike-hub-state.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const json = async path => JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8'));
const main = async () => {
    const args = process.argv.slice(2);
    if (args.length && (args.length !== 2 || args[0] !== '--model')) {
        throw new Error('Usage: node scripts/verify-sim-physics.mjs [--model driving-base.ldr]');
    }
    const started = performance.now();
    const catalog = new Map((await json('../overlay/scratch-gui/src/lib/bw-sim/part-meta/parts.json'))
        .parts.map(part => [part.part, part]));
    const modelPath = args.length ? resolve(args[1]) : resolve(root, 'test/fixtures/bw-sim/driving-base.ldr');
    const parsed = parseModel(await readFile(modelPath, 'utf8'), {catalog});
    if (parsed.refusals.length) throw new Error('LDraw refused: ' + JSON.stringify(parsed.refusals));
    const mechanism = compile(parsed.model, catalog);
    const errors = mechanism.diagnostics.filter(item => item.severity === 'error');
    if (errors.length) throw new Error('Mechanism refused: ' + JSON.stringify(errors));
    const hubPart = parsed.model.parts.find(part => part.part === '45601.dat');
    const hubBody = mechanism.bodies.find(body => body.parts.includes(hubPart?.id));
    assert.ok(hubBody, 'Reference scenario needs a SPIKE hub chassis');
    assert.deepEqual(mechanism.joints.filter(joint => joint.motor).map(joint => joint.motor.port).sort(),
        ['A', 'B'], 'Reference scenario needs wheel motors on ports A and B');
    const core = createPhysicsCore(await loadJolt(), mechanism, {stepHz: 1000 / STEP_MS});
    const hub = new VirtualSpikeHubState();
    const previousOwner = hub.clockOwner;
    let bridge;
    let drive;
    try {
        bridge = new SimHubBridge({hubState: hub, core, mechanism, hubBody: hubBody.id});
        const start = core.bodyPose(hubBody.id).position;
        hub.motors.runAtSpeed('A', -555);
        hub.motors.runAtSpeed('B', 555);
        for (let time = 0; time < 2000; time += 50) bridge.tick(50);
        const end = core.bodyPose(hubBody.id).position;
        drive = {seconds: 2, forwardMetres: start[2] - end[2], sidewaysMetres: end[0] - start[0],
            yawDegrees: hub.data.imu.yaw, encoderA: hub.data.motors[0].position,
            encoderB: hub.data.motors[1].position};
        assert.ok(drive.forwardMetres > 0.3, 'Driving base must move forward over 0.3 m');
        assert.ok(Math.abs(drive.sidewaysMetres) < 0.05 * drive.forwardMetres, 'Driving base must stay straight');
        assert.ok(Math.abs(drive.yawDegrees) < 5, 'Straight drive yaw must stay below 5 degrees');
        assert.ok(drive.encoderA < 0 && drive.encoderB > 0, 'Encoders must measure opposite wheel directions');
        const encoderMetres = (Math.abs(drive.encoderA) + Math.abs(drive.encoderB)) / 2 / 360 * Math.PI * 0.056;
        assert.ok(Math.abs(encoderMetres - drive.forwardMetres) < 0.1 * drive.forwardMetres,
            'Physical displacement must agree with wheel encoders within 10 percent');
    } finally {
        bridge?.dispose();
        core.destroy();
    }
    assert.equal(hub.clockOwner, previousOwner, 'Scenario must return hub clock ownership');

    const worker = new Worker(new URL('./lib/sim-physics-node-worker.mjs', import.meta.url));
    const client = new PhysicsClient(worker);
    const deadline = AbortSignal.timeout(30000);
    let onError, onExit, onAbort;
    const failed = new Promise((_, reject) => {
        onError = reject;
        onExit = code => reject(new Error('Physics worker exited before completion: ' + code));
        onAbort = () => reject(new Error('Physics worker exceeded its 30-second deadline'));
        worker.once('error', onError);
        worker.once('exit', onExit);
        deadline.addEventListener('abort', onAbort, {once: true});
    });
    let workerResult;
    try {
        workerResult = await Promise.race([failed, (async () => {
            const loaded = await client.load(mechanism, {stepHz: 1000 / STEP_MS});
            const motors = mechanism.joints.filter(joint => joint.motor).map(joint => ({joint: joint.id,
                cmd: {mode: 'velocity', radPerSec: (joint.motor.port === 'A' ? -555 : 555) * Math.PI / 180}}));
            let snapshot;
            for (let step = 0; step < 100; step++) snapshot = await client.step(STEP_MS / 1000, motors);
            assert.ok(Math.abs(snapshot.t - 0.5) < 1e-9, 'Worker must advance exactly 100 fixed steps');
            assert.equal(snapshot.bodies.length, loaded.bodyIds.length * 7);
            assert.equal(snapshot.joints.length, loaded.jointIds.length * 2);
            assert.ok([...snapshot.bodies, ...snapshot.joints].every(Number.isFinite), 'Worker snapshot must be finite');
            for (const motor of motors) {
                const angle = snapshot.joints[loaded.jointIds.indexOf(motor.joint) * 2];
                assert.ok(Math.abs(angle) > 0.1 && Math.sign(angle) === Math.sign(motor.cmd.radPerSec),
                    'Worker must measure physical wheel motion in its commanded direction');
            }
            await client.dispose();
            return {seconds: snapshot.t, bodyCount: loaded.bodyIds.length, jointCount: loaded.jointIds.length,
                measuredJointAngles: motors.map(motor => snapshot.joints[loaded.jointIds.indexOf(motor.joint) * 2])};
        })()]);
    } finally {
        deadline.removeEventListener('abort', onAbort);
        await worker.terminate();
        worker.removeListener('error', onError);
        worker.removeListener('exit', onExit);
    }
    console.log(JSON.stringify({status: 'passed', model: modelPath, diagnostics: mechanism.diagnostics,
        drive, worker: workerResult, elapsedMs: performance.now() - started}));
};
main().catch(error => { console.error(error.stack || String(error)); process.exitCode = 1; });

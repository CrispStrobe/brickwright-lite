// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// Physics worker (overlay/scratch-gui/src/lib/bw-sim/physics/): the host
// runs the core off the main thread, the client correlates replies, and
// interpolate() blends snapshots for rendering. Proven here with the real
// S1 driving base compiled from LDraw parts.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';
import { compile } from '../overlay/scratch-gui/src/lib/bw-sim/mech/compile.js';
import { createPhysicsHost } from '../overlay/scratch-gui/src/lib/bw-sim/physics/physics-host.js';
import { loadJolt, createPhysicsCore } from '../overlay/scratch-gui/src/lib/bw-sim/physics/jolt-core.js';
import { PhysicsClient, interpolate } from '../overlay/scratch-gui/src/lib/bw-sim/physics/physics-client.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const json = p => JSON.parse(readFileSync(path.join(ROOT, p), 'utf8'));
const CATALOG = new Map(json('overlay/scratch-gui/src/lib/bw-sim/part-meta/parts.json').parts.map(p => [p.part, p]));
const MODEL = json('test/fixtures/bw-sim/driving-base.json');

const compiled = () => compile(MODEL, CATALOG);
const HALF_SPEED = 555;

test('host alone: driving base moves forward', async () => {
    const mechanism = compiled();
    const messages = [];
    const host = createPhysicsHost({
        loadJolt,
        createPhysicsCore,
        post: (msg, transfer) => messages.push({ msg, transfer }),
    });
    const loadId = 1;
    await host.handle({ type: 'load', id: loadId, mechanism, stepHz: 200 });
    assert.equal(messages.length, 1);
    assert.equal(messages[0].msg.type, 'loaded');
    assert.deepEqual(messages[0].msg.bodyIds, mechanism.bodies.map(b => b.id));
    assert.deepEqual(messages[0].msg.jointIds, mechanism.joints.map(j => j.id));

    messages.length = 0;
    const hubBody = mechanism.bodies.find(b => b.parts.includes('hub')).id;
    // Find chassis body via hub part
    const chassisId = hubBody;
    // Get initial chassis position via host's core snapshot? We can step and check via snapshot
    // Instead, we will step 2s with motors and check via snapshot bodies
    // We need to know which body is chassis: the one with hub
    // We'll step and check the bodies buffer: it has 7 floats per body, we can check t and that chassis moved
    // For simplicity, we will do 40 steps of 50ms (2s total) with motors
    for (let t = 0; t < 2000; t += 50) {
        const dt = 0.05;
        const motors = [
            { joint: mechanism.joints.find(j => j.motor?.port === 'A').id, cmd: { mode: 'velocity', radPerSec: -HALF_SPEED * Math.PI / 180 } },
            { joint: mechanism.joints.find(j => j.motor?.port === 'B').id, cmd: { mode: 'velocity', radPerSec: HALF_SPEED * Math.PI / 180 } },
        ];
        await host.handle({ type: 'step', id: 2, dtSeconds: dt, motors });
        const snap = messages[messages.length - 1].msg;
        assert.equal(snap.type, 'snapshot');
        assert.ok(snap.bodies instanceof Float32Array);
        assert.equal(snap.bodies.length, mechanism.bodies.length * 7);
        assert.ok(snap.joints instanceof Float32Array);
        assert.equal(snap.joints.length, mechanism.joints.length * 2);
        // Check transfer list
        const transfer = messages[messages.length - 1].transfer;
        assert.ok(Array.isArray(transfer) && transfer.length === 2);
        // Clear for next iteration but keep last for chassis check
        if (t < 1950) messages.length = 0;
    }
    // Check final snapshot: chassis moved forward (world -z)
    const finalSnap = messages[messages.length - 1].msg;
    const bodyIds = mechanism.bodies.map(b => b.id);
    const chassisIdx = bodyIds.indexOf(chassisId);
    const chassisZ = finalSnap.bodies[chassisIdx * 7 + 2];
    // Initial chassis z is 0 (from compiled), so it should have moved negative
    assert.ok(chassisZ < -0.3, `chassis z ${chassisZ} should be < -0.3 (forward -z)`);
});

test('worker thread gives byte-identical snapshots', async () => {
    const mechanism = compiled();
    // Host alone run
    const hostMessages = [];
    const host = createPhysicsHost({ loadJolt, createPhysicsCore, post: (m, t) => hostMessages.push({ msg: m, transfer: t }) });
    await host.handle({ type: 'load', id: 1, mechanism, stepHz: 200 });
    for (let t = 0; t < 2000; t += 50) {
        const dt = 0.05;
        const motors = [
            { joint: mechanism.joints.find(j => j.motor?.port === 'A').id, cmd: { mode: 'velocity', radPerSec: -HALF_SPEED * Math.PI / 180 } },
            { joint: mechanism.joints.find(j => j.motor?.port === 'B').id, cmd: { mode: 'velocity', radPerSec: HALF_SPEED * Math.PI / 180 } },
        ];
        await host.handle({ type: 'step', id: 2, dtSeconds: dt, motors });
    }
    const hostSnap = hostMessages[hostMessages.length - 1].msg;

    // Worker thread run
    const worker = new Worker(path.join(ROOT, 'scripts/lib/sim-physics-node-worker.mjs'));
    const port = {
        postMessage: (msg, transfer) => worker.postMessage(msg, transfer),
        on: (ev, fn) => worker.on(ev, fn),
        addEventListener: (ev, fn) => worker.on(ev, fn),
    };
    const client = new PhysicsClient(port);
    await client.load(mechanism, { stepHz: 200 });
    let workerSnap;
    for (let t = 0; t < 2000; t += 50) {
        const dt = 0.05;
        const motors = [
            { joint: mechanism.joints.find(j => j.motor?.port === 'A').id, cmd: { mode: 'velocity', radPerSec: -HALF_SPEED * Math.PI / 180 } },
            { joint: mechanism.joints.find(j => j.motor?.port === 'B').id, cmd: { mode: 'velocity', radPerSec: HALF_SPEED * Math.PI / 180 } },
        ];
        workerSnap = await client.step(dt, motors);
    }
    assert.equal(workerSnap.t, hostSnap.t);
    assert.deepEqual(workerSnap.bodies, hostSnap.bodies);
    assert.deepEqual(workerSnap.joints, hostSnap.joints);
    await worker.terminate();
});

test('errors: step before load, invalid mechanism, unknown type', async () => {
    const messages = [];
    const host = createPhysicsHost({ loadJolt, createPhysicsCore, post: (m, t) => messages.push({ msg: m, transfer: t }) });
    await host.handle({ type: 'step', id: 1, dtSeconds: 0.01, motors: [] });
    assert.equal(messages[0].msg.type, 'error');
    messages.length = 0;

    const badMech = { version: 1, gravity: [0, -9.81, 0], bodies: [], joints: [], gears: [], diagnostics: [] };
    // Missing required bodies/joints fields valid, but empty is valid? Let's make invalid: missing gravity
    const invalidMech = { version: 1, bodies: [], joints: [], gears: [], diagnostics: [] };
    await host.handle({ type: 'load', id: 2, mechanism: invalidMech, stepHz: 120 });
    assert.equal(messages[0].msg.type, 'error');
    messages.length = 0;

    await host.handle({ type: 'unknown', id: 3 });
    assert.equal(messages[0].msg.type, 'error');
    messages.length = 0;

    // Host stays usable after errors
    const mechanism = compiled();
    await host.handle({ type: 'load', id: 4, mechanism, stepHz: 120 });
    assert.equal(messages[0].msg.type, 'loaded');
});

test('ordering: 20 steps without awaiting resolve in order', async () => {
    const mechanism = compiled();
    const host = createPhysicsHost({ loadJolt, createPhysicsCore, post: () => {} });
    // Capture posts
    const snaps = [];
    const origPost = host.handle;
    // We need to capture via post
    const messages = [];
    const host2 = createPhysicsHost({
        loadJolt,
        createPhysicsCore,
        post: (m, t) => messages.push(m),
    });
    await host2.handle({ type: 'load', id: 1, mechanism, stepHz: 200 });
    messages.length = 0;
    const promises = [];
    for (let i = 0; i < 20; i++) {
        promises.push(host2.handle({ type: 'step', id: 10 + i, dtSeconds: 0.01, motors: [] }));
    }
    await Promise.all(promises);
    assert.equal(messages.length, 20);
    for (let i = 1; i < messages.length; i++) {
        assert.ok(messages[i].t > messages[i - 1].t, `t should increase: ${messages[i - 1].t} -> ${messages[i].t}`);
    }
});

test('reset returns to t=0 and same first snapshot', async () => {
    const mechanism = compiled();
    const host = createPhysicsHost({ loadJolt, createPhysicsCore, post: (m, t) => {} });
    const messages = [];
    const host2 = createPhysicsHost({
        loadJolt,
        createPhysicsCore,
        post: (m, t) => messages.push(m),
    });
    await host2.handle({ type: 'load', id: 1, mechanism, stepHz: 120 });
    await host2.handle({ type: 'step', id: 2, dtSeconds: 0.05, motors: [] });
    const afterStep = messages[messages.length - 1];
    assert.ok(afterStep.t > 0);
    messages.length = 0;
    await host2.handle({ type: 'reset', id: 3 });
    assert.equal(messages[0].type, 'loaded');
    messages.length = 0;
    await host2.handle({ type: 'step', id: 4, dtSeconds: 0.05, motors: [] });
    const afterResetStep = messages[messages.length - 1];
    // Compare to fresh load + step
    const host3 = createPhysicsHost({ loadJolt, createPhysicsCore, post: (m, t) => {} });
    const messages3 = [];
    const host4 = createPhysicsHost({
        loadJolt,
        createPhysicsCore,
        post: (m, t) => messages3.push(m),
    });
    await host4.handle({ type: 'load', id: 10, mechanism, stepHz: 120 });
    await host4.handle({ type: 'step', id: 11, dtSeconds: 0.05, motors: [] });
    const freshSnap = messages3[messages3.length - 1];
    assert.equal(afterResetStep.t, freshSnap.t);
    assert.deepEqual(afterResetStep.bodies, freshSnap.bodies);
    assert.deepEqual(afterResetStep.joints, freshSnap.joints);
});

test('interpolate: alpha 0/1 and shortest arc', () => {
    const prev = {
        t: 0,
        bodies: new Float32Array([0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 1]),
        joints: new Float32Array([0, 0, 1, 1]),
    };
    const next = {
        t: 1,
        bodies: new Float32Array([1, 1, 1, 0, 0, 0, 1, 2, 2, 2, 0, 0, 0, 1]),
        joints: new Float32Array([1, 1, 2, 2]),
    };
    const at0 = interpolate(prev, next, 0);
    assert.deepEqual(at0.bodies, prev.bodies);
    assert.deepEqual(at0.joints, prev.joints);
    assert.equal(at0.t, 0);
    const at1 = interpolate(prev, next, 1);
    assert.deepEqual(at1.bodies, next.bodies);
    assert.deepEqual(at1.joints, next.joints);
    assert.equal(at1.t, 1);

    // Quaternion shortest arc: q and -q are same rotation, halfway should be unit and not lerp to zero
    const q = [0, 0, 0, 1];
    const qNeg = [0, 0, 0, -1];
    const prev2 = { t: 0, bodies: new Float32Array([0, 0, 0, ...q, 0, 0, 0, ...q]), joints: new Float32Array([0, 0]) };
    const next2 = { t: 1, bodies: new Float32Array([0, 0, 0, ...qNeg, 0, 0, 0, ...qNeg]), joints: new Float32Array([1, 1]) };
    const mid = interpolate(prev2, next2, 0.5);
    const len = Math.hypot(mid.bodies[3], mid.bodies[4], mid.bodies[5], mid.bodies[6]);
    assert.ok(Math.abs(len - 1) < 1e-6, `quaternion not unit: ${len}`);
    // Check it took short arc (should be same as original, not zero)
    assert.ok(Math.abs(mid.bodies[3]) < 1e-6 && Math.abs(mid.bodies[6] - 1) < 1e-6, 'short arc failed');
});

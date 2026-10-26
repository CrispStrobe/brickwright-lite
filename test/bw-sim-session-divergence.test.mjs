// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
/**
 * A scene whose solver diverges stops at its first non-finite pose
 * (overlay/scratch-gui/src/lib/bw-sim/sim-session.js): `session.failed` says which
 * body and when, the pane shows its "physics stopped" state from it, simulated time
 * stops, and the poses everyone reads stay those of the last finite step. Without
 * this a blown-up scene (Bloom in system Chrome, 2026-10-25) went on stepping NaN
 * in the worker, ever slower, and the view threw on every frame.
 *
 *   - on this thread: a body given a NaN velocity (a real NaN inside Jolt);
 *   - in the worker: a batch that comes back with a NaN pose never reaches the
 *     hubs or the mirror;
 *   - an ordinary scene runs on, unaffected, in both.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {Worker} from 'node:worker_threads';
import {SimSession, catalogFrom, MODELS_BASE, floorWatch} from '../overlay/scratch-gui/src/lib/bw-sim/sim-session.js';
import {PhysicsClient} from '../overlay/scratch-gui/src/lib/bw-sim/physics/physics-client.js';
import VirtualSpikeHubState from '../overlay/scratch-gui/src/lib/virtual-hub/spike-hub-state.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CATALOG = catalogFrom(JSON.parse(readFileSync(path.join(ROOT, 'overlay/scratch-gui/src/lib/bw-sim/part-meta/parts.json'), 'utf8')));
const MODEL = readFileSync(path.join(ROOT, 'overlay/scratch-gui', MODELS_BASE, 'motor-bench.ldr'), 'latin1');
const FRAME_MS = 1000 / 30;

const finite = snap => Array.from(snap.bodies).every(Number.isFinite);
const run = async (session, frames) => {
    for (let i = 0; i < frames; i++) {
        session.tick(FRAME_MS);
        await session.idle().catch(() => {});
    }
};
const quiet = async fn => {
    const original = console.error;
    const logged = [];
    console.error = (...args) => logged.push(args.join(' '));
    try { await fn(); } finally { console.error = original; }
    return logged;
};

test('on this thread: an ordinary scene runs on, a diverged one stops at its last finite step', async () => {
    const {session} = await SimSession.fromText(MODEL, {hubState: new VirtualSpikeHubState(), catalog: CATALOG});
    assert.equal(session.worker, false);
    await run(session, 30);
    assert.equal(session.failed, null);
    assert.ok(Math.abs(session.time - 30 * FRAME_MS) < 1e-6);
    assert.ok(finite(session.snapshot()));

    const body = session.mechanism.bodies.find(b => b.motion === 'dynamic');
    assert.ok(body, 'the bench has a moving body');
    const before = session.snapshot();
    session.core.setBodyVelocity(body.id, [NaN, 0, 0], [0, 0, 0]);
    const logged = await quiet(() => run(session, 10));
    assert.match(session.failed?.message || '', /solver diverged: body \S+ has no finite pose at 1\.03 s/);
    assert.equal(logged.length, 1, 'one report, not one per frame');
    assert.ok(Math.abs(session.time - 30 * FRAME_MS) < 1e-6, 'time stops at the last finite step');
    const after = session.snapshot();
    assert.ok(finite(after), 'the view keeps drawing the last finite poses');
    assert.deepEqual(Array.from(after.bodies), Array.from(before.bodies));
    session.dispose();
});

test('in the worker: a diverged batch reaches neither the hubs nor the mirror', async () => {
    const worker = new Worker(path.join(ROOT, 'test/fixtures/bw-sim/physics-worker-host.mjs'), {argv: [fileURLToPath(import.meta.url)]});
    const client = new PhysicsClient(worker);
    // The real worker computes every batch; from `poisonAt` on, a reply comes back with a NaN pose.
    let batches = 0;
    let poisonAt = Infinity;
    const simBatch = client.simBatch.bind(client);
    client.simBatch = async msg => {
        const reply = await simBatch(msg);
        if (++batches >= poisonAt) reply.bodies[reply.bodies.length - 1] = NaN;
        return reply;
    };
    try {
        const {session} = await SimSession.fromText(MODEL, {hubState: new VirtualSpikeHubState(), catalog: CATALOG, worker: client});
        assert.equal(session.worker, true, session.workerError);
        await run(session, 30);
        assert.equal(session.failed, null);
        assert.ok(Math.abs(session.time - 30 * FRAME_MS) < 1e-6);
        assert.ok(finite(session.snapshot()));

        const before = session.snapshot();
        const angles = session.hubs.map(({hub}) => JSON.stringify(hub.exportState()));
        poisonAt = batches + 1;
        const logged = await quiet(() => run(session, 10));
        assert.match(session.failed?.message || '', /solver diverged: body \S+ has no finite pose at 1\.03 s/);
        assert.equal(logged.length, 1, 'one report, not one per frame');
        assert.equal(batches, poisonAt, 'no batch is sent after the divergence');
        assert.ok(Math.abs(session.time - 30 * FRAME_MS) < 1e-6);
        assert.deepEqual(Array.from(session.snapshot().bodies), Array.from(before.bodies));
        assert.deepEqual(session.hubs.map(({hub}) => JSON.stringify(hub.exportState())), angles, 'no NaN reading reached a hub');
        session.dispose();
    } finally {
        await worker.terminate();
    }
});

// Issue #1436: a jammed drive's impulse tunnelled a whole model through the floor and it fell on, kilometres
// by 30 s, with every pose finite. A dynamic body wholly under the floor stops the run like a divergence.
test('a body that went through the floor stops the run, on this thread and in the worker', async () => {
    const sink = (snap, index) => { snap.bodies[7 * index + 1] -= 1; return snap; };
    {
        const {session} = await SimSession.fromText(MODEL, {hubState: new VirtualSpikeHubState(), catalog: CATALOG});
        await run(session, 30);
        assert.equal(session.failed, null, 'resting on the floor is not under it');
        const index = session.snapshot().bodyIds.findIndex(id => session.mechanism.bodies.find(b => b.id === id).motion === 'dynamic');
        const before = session.snapshot(), snapshot = session.core.snapshot.bind(session.core);
        session.core.snapshot = () => sink(snapshot(), index);
        const logged = await quiet(() => run(session, 10));
        assert.match(session.failed?.message || '', /body \S+ fell through the floor: \d+ mm under it at 1\.03 s/);
        assert.equal(logged.length, 1, 'one report, not one per frame');
        assert.ok(Math.abs(session.time - 30 * FRAME_MS) < 1e-6, 'time stops at the last step above the floor');
        session.core.snapshot = snapshot;
        assert.deepEqual(Array.from(session.snapshot().bodies), Array.from(before.bodies));
        session.dispose();
    }
    const worker = new Worker(path.join(ROOT, 'test/fixtures/bw-sim/physics-worker-host.mjs'), {argv: [fileURLToPath(import.meta.url)]});
    const client = new PhysicsClient(worker);
    let batches = 0, sinkAt = Infinity, index = -1;
    const simBatch = client.simBatch.bind(client);
    client.simBatch = async msg => {
        const reply = await simBatch(msg);
        if (++batches >= sinkAt) sink(reply, index);
        return reply;
    };
    try {
        const {session} = await SimSession.fromText(MODEL, {hubState: new VirtualSpikeHubState(), catalog: CATALOG, worker: client});
        assert.equal(session.worker, true, session.workerError);
        await run(session, 30);
        assert.equal(session.failed, null);
        index = session.snapshot().bodyIds.findIndex(id => session.mechanism.bodies.find(b => b.id === id).motion === 'dynamic');
        const before = session.snapshot();
        sinkAt = batches + 1;
        const logged = await quiet(() => run(session, 10));
        assert.match(session.failed?.message || '', /body \S+ fell through the floor: \d+ mm under it at 1\.03 s/);
        assert.equal(logged.length, 1);
        assert.equal(batches, sinkAt, 'no batch is sent after it');
        assert.deepEqual(Array.from(session.snapshot().bodies), Array.from(before.bodies));
        session.dispose();
    } finally {
        await worker.terminate();
    }
});

test('floorWatch: a reach for every dynamic body; no floor, nothing to watch', async () => {
    assert.equal(floorWatch({bodies: [{id: 'b0', motion: 'dynamic', colliders: []}]}), null);
    const {session} = await SimSession.fromText(MODEL, {hubState: new VirtualSpikeHubState(), catalog: CATALOG});
    const w = floorWatch(session.mechanism);
    assert.ok(w && w.thick > 0 && w.reach.size === session.mechanism.bodies.filter(b => b.motion === 'dynamic').length);
    session.dispose();
});

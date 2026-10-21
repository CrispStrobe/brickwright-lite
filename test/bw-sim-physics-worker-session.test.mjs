// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
/**
 * The Sim Lab with its physics in the worker (ROADMAP §4.9,
 * overlay/scratch-gui/src/lib/bw-sim/sim-worker-protocol.js) gives the
 * SAME numbers as the physics on the main thread — not close: equal, to the
 * last bit — through a real worker thread (node's worker_threads running the
 * same physics-host.js the browser's Web Worker runs).
 *
 * Each case runs two sessions side by side from the same model, one on this
 * thread and one in the worker, ticks both with the same frame lengths, waits
 * for the worker's batch to come back (session.idle()), and compares
 * everything a program or the view can see: every body's pose, every joint,
 * the hub's encoders, measured speeds, IMU and sensor readings, and the
 * simulated time.
 *
 *   - the S1 driving base driving forward, turning on the spot, then a
 *     run-for-degrees whose promise must finish on the same tick;
 *   - the Wall stopper (distance sensor) and the Colour explorer (colour
 *     sensor) driving across their mats: rays are cast inside the step;
 *   - encoders and sensors are of the SAME step as the poses: the encoder is
 *     the hinge's angle since the start, read from the mirrored poses;
 *   - a motor command that arrives while a batch is in flight is not lost and
 *     not late: the batch is redone from the worker's checkpoint, and the run
 *     equals the in-thread run that got the command before that tick;
 *   - a model without a hub settles identically;
 *   - the Line follower's example program, run by the real Scratch VM through
 *     the spikeprime extension (test/helpers/sim-lab-vm.mjs), draws the same
 *     track frame for frame: the colour sensor steers, the VM sets the motors
 *     between batches, and nothing drifts;
 *   - a worker that cannot load the scene leaves the physics on this thread.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {Worker} from 'node:worker_threads';
import {SimSession, catalogFrom, MODELS_BASE} from '../overlay/scratch-gui/src/lib/bw-sim/sim-session.js';
import {PhysicsClient} from '../overlay/scratch-gui/src/lib/bw-sim/physics/physics-client.js';
import VirtualSpikeHubState from '../overlay/scratch-gui/src/lib/virtual-hub/spike-hub-state.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CATALOG = catalogFrom(JSON.parse(readFileSync(path.join(ROOT, 'overlay/scratch-gui/src/lib/bw-sim/part-meta/parts.json'), 'utf8')));
const modelText = file => readFileSync(path.join(ROOT, 'overlay/scratch-gui', MODELS_BASE, file), 'latin1');
const DEG = 180 / Math.PI;
/** Frame lengths as a browser delivers them: mostly 60 Hz, some long, some short. */
const FRAMES = [16.7, 16.6, 16.7, 33.4, 16.6, 2.1, 16.7, 50, 16.6, 16.7];

// argv: the GUI-scope hook in the worker thread names this test as the one crossing the boundary.
const startWorker = () => new Worker(path.join(ROOT, 'test/fixtures/bw-sim/physics-worker-host.mjs'), {argv: [fileURLToPath(import.meta.url)]});

/** Both sessions of one model: `here` on this thread, `there` in the worker. */
const pair = async (file, {mat = null} = {}) => {
    const worker = startWorker();
    const client = new PhysicsClient(worker);
    const text = modelText(file);
    const hubHere = new VirtualSpikeHubState();
    const hubThere = new VirtualSpikeHubState();
    const {session: here} = await SimSession.fromText(text, {hubState: hubHere, catalog: CATALOG, mat});
    const {session: there} = await SimSession.fromText(text, {hubState: hubThere, catalog: CATALOG, mat, worker: client});
    assert.equal(here.worker, false);
    assert.equal(there.worker, true, `the worker runs the physics: ${there.workerError}`);
    let frame = 0;
    return {
        here, there, hubHere, hubThere,
        /** One frame for both; resolves when the worker's batch has reached its hub. */
        async tick (ms = FRAMES[frame++ % FRAMES.length]) {
            here.tick(ms);
            there.tick(ms);
            await there.idle();
        },
        /** The same command on both hubs. */
        both (fn) { return [fn(hubHere), fn(hubThere)]; },
        async close () {
            here.dispose();
            there.dispose();
            await worker.terminate();
        }
    };
};

/** Everything a program or the view can see, as plain data (doubles kept as they are). */
const seen = session => {
    const hub = session.hubState.data;
    return {
        time: session.time,
        snapshot: Buffer.from(session.snapshot().bodies.buffer).toString('hex') + Buffer.from(session.snapshot().joints.buffer).toString('hex'),
        poses: session.mechanism.bodies.map(b => session.core.bodyPose(b.id)),
        joints: session.mechanism.joints.filter(j => j.type === 'hinge').map(j => session.core.jointState(j.id)),
        motors: structuredClone(hub.motors),
        imu: structuredClone(hub.imu),
        sensors: structuredClone(hub.sensors),
        classicPorts: structuredClone(hub.classicPorts)
    };
};

const assertSame = (p, label) => assert.deepStrictEqual(seen(p.there), seen(p.here), label);

test('the driving base drives forward, turns and runs for degrees with identical numbers in the worker', async () => {
    const p = await pair('driving-base.ldr');
    try {
        const hubBody = p.here.bridge.hubBody;
        const start = p.here.core.bodyPose(hubBody).position;
        // Forward: A is mounted mirrored (driving-base convention), B not.
        p.both(h => { h.motors.runAtSpeed('A', -555); h.motors.runAtSpeed('B', 555); });
        for (let i = 0; i < 90; i++) { await p.tick(); assertSame(p, `forward, frame ${i}`); }
        const moved = p.there.core.bodyPose(hubBody).position;
        assert.ok(moved[2] - start[2] < -0.3, `drove forward ${(moved[2] - start[2]).toFixed(3)} m along z`);
        // Turn on the spot: both wheels the same way.
        p.both(h => { h.motors.runAtSpeed('A', 400); h.motors.runAtSpeed('B', 400); });
        for (let i = 0; i < 60; i++) { await p.tick(); assertSame(p, `turning, frame ${i}`); }
        assert.ok(Math.abs(p.hubThere.data.imu.yaw) > 30, `it turned: yaw ${p.hubThere.data.imu.yaw}`);
        // A finite motion: the promise finishes on the same tick on both.
        const finished = {here: null, there: null};
        const [a, b] = p.both(h => h.motors.runForDegrees('B', 360, 500));
        a.then(r => { finished.here = [r, p.here.time]; });
        b.then(r => { finished.there = [r, p.there.time]; });
        p.both(h => h.motors.stop('A'));
        for (let i = 0; i < 80 && !finished.here; i++) { await p.tick(); await null; assertSame(p, `run for degrees, frame ${i}`); }
        await new Promise(resolve => setImmediate(resolve));
        assert.ok(finished.here, 'the run for degrees finished');
        assert.deepEqual(finished.there, finished.here);
        assert.equal(p.there.stats.diverged, 0, 'the main thread\'s controller commanded what the worker\'s mirror did, every step');
        assert.ok(p.there.stats.batches >= 150, `batches: ${JSON.stringify(p.there.stats)}`);
    } finally { await p.close(); }
});

test('the encoders are the hinges\' angles of the same step as the mirrored poses', async () => {
    const p = await pair('driving-base.ldr');
    try {
        const joints = new Map(p.there.mechanism.joints.filter(j => j.motor).map(j => ['ABCDEF'.indexOf(j.motor.port), j.id]));
        const angle0 = new Map([...joints].map(([i, id]) => [i, p.there.core.jointState(id).angle]));
        p.both(h => { h.motors.runAtSpeed('A', -700); h.motors.runAtSpeed('B', 300); });
        let behind = 0;
        let previous = null;
        for (let i = 0; i < 40; i++) {
            await p.tick();
            for (const [index, id] of joints) {
                const fromPose = (p.there.core.jointState(id).angle - angle0.get(index)) * DEG;
                const encoder = p.hubThere.data.motors[index].position;
                assert.ok(Math.abs(encoder - fromPose) < 1e-6, `port ${index}, frame ${i}: encoder ${encoder} vs the pose's ${fromPose}`);
                if (previous && Math.abs(previous.get(index) - encoder) > 1e-6) behind++;
            }
            previous = new Map([...joints].map(([index, id]) => [index, (p.there.core.jointState(id).angle - angle0.get(index)) * DEG]));
        }
        // The check above can tell a step apart: the previous frame's angles are not the encoders'.
        assert.ok(behind > 40, `the previous frame's pose disagrees with this frame's encoder (${behind} times)`);
    } finally { await p.close(); }
});

for (const [file, mat, port, kind] of [['wall-stopper.ldr', 'wall', null, 'distance'], ['colour-explorer.ldr', 'colour-zones', null, 'color']]) {
    test(`the ${file.replace('.ldr', '')}'s ${kind} sensor reads the same ray in the worker, step for step`, async () => {
        const p = await pair(file, {mat});
        try {
            const sensor = p.here.mechanism.sensors.find(s => s.kind === kind);
            assert.ok(sensor, `the model has a ${kind} sensor`);
            const index = 'ABCDEF'.indexOf(port || sensor.port);
            // The hub shows the scene's reading from the start, not a previous model's.
            assertSame(p, 'at t = 0, before any batch');
            assert.equal(p.hubThere.data.sensors[index].kind, kind, 'the sensor reads at t = 0');
            p.both(h => { h.motors.runAtSpeed('A', -600); h.motors.runAtSpeed('B', 600); });
            const readings = new Set();
            for (let i = 0; i < 240; i++) {
                await p.tick();
                assertSame(p, `frame ${i}`);
                readings.add(JSON.stringify(p.hubThere.data.sensors[index]));
            }
            assert.equal(p.hubThere.data.sensors[index].kind, kind);
            // The Colour explorer crosses white, the black zone and white, then leaves the mat onto the plain floor,
            // which reads white too: two readings at least. (On the 2 m floor it once had, it then fell off the edge,
            // a third "no colour"; the floor is 20 m now, mech/compile.js FLOOR_HALF_M. Until the motorised hinges got
            // their own solver iterations, jolt-core.js MOTOR_VELOCITY_STEPS, the white reflection jittered 48–50.)
            // The wall stopper's distance changes on every frame as it drives at the wall.
            assert.ok(readings.size >= 2, `the ${kind} reading changed as the robot drove: ${[...readings].slice(0, 5).join(' ')}`);
        } finally { await p.close(); }
    });
}

test('a command that arrives while a batch is in flight is redone from the checkpoint, as if it came before the tick', async () => {
    const p = await pair('driving-base.ldr');
    try {
        p.both(h => { h.motors.runAtSpeed('A', -555); h.motors.runAtSpeed('B', 555); });
        for (let i = 0; i < 10; i++) await p.tick(16.7);
        assertSame(p, 'before');
        // The worker's batch is on its way when the program turns; on this thread the same
        // command lands before the tick (in-thread a tick is atomic: before or after, never inside).
        p.there.tick(16.7);
        assert.ok(p.there._inFlight, 'a batch is in flight');
        p.hubThere.motors.runAtSpeed('B', -300);
        p.hubHere.motors.runAtSpeed('B', -300);
        p.here.tick(16.7);
        await p.there.idle();
        assert.equal(p.there.stats.redos, 1, 'the batch was redone once');
        assertSame(p, 'after the redone batch');
        for (let i = 0; i < 30; i++) { await p.tick(16.7); assertSame(p, `after, frame ${i}`); }
        // A command that changes nothing the controller reads is not a conflict.
        p.there.tick(16.7);
        p.hubThere.motors.runAtSpeed('B', -300);
        p.hubHere.motors.runAtSpeed('B', -300);
        p.here.tick(16.7);
        await p.there.idle();
        assert.equal(p.there.stats.redos, 1, 'repeating the same speed is no change');
        assertSame(p, 'after a repeated command');
    } finally { await p.close(); }
});

test('a model without a hub settles identically in the worker', async () => {
    const worker = startWorker();
    const client = new PhysicsClient(worker);
    const text = '1 71 0 -200 0 1 0 0 0 1 0 0 0 1 32524.dat\n';
    try {
        const {session: here} = await SimSession.fromText(text, {hubState: new VirtualSpikeHubState(), catalog: CATALOG});
        const {session: there} = await SimSession.fromText(text, {hubState: new VirtualSpikeHubState(), catalog: CATALOG, worker: client});
        assert.equal(there.worker, true);
        assert.equal(there.bridge, null);
        for (const ms of [...FRAMES, ...FRAMES, 3, 1000]) { here.tick(ms); there.tick(ms); await there.idle(); }
        assert.deepStrictEqual(seen(there).poses, seen(here).poses);
        assert.equal(there.time, here.time);
        here.dispose();
        there.dispose();
    } finally { await worker.terminate(); }
});

test('a worker that cannot load the scene leaves the physics on this thread, and says why', async () => {
    // A host without the Sim Lab runner answers sim-load with an error, as a worker without WebAssembly would.
    const {createPhysicsHost} = await import('../overlay/scratch-gui/src/lib/bw-sim/physics/physics-host.js');
    const listeners = [];
    const host = createPhysicsHost({loadJolt: async () => ({}), createPhysicsCore: () => null,
        post: msg => listeners.forEach(fn => fn({data: msg}))});
    const port = {postMessage: msg => host.handle(structuredClone(msg)), addEventListener: (type, fn) => type === 'message' && listeners.push(fn)};
    const {session} = await SimSession.fromText(modelText('driving-base.ldr'),
        {hubState: new VirtualSpikeHubState(), catalog: CATALOG, worker: new PhysicsClient(port)});
    assert.equal(session.worker, false);
    assert.match(session.workerError, /no Sim Lab runner/);
    session.tick(100);
    assert.equal(session.time, 100);
    session.dispose();
});

test('the line follower\'s example program, run by the real VM, draws the same track with the physics in the worker', async t => {
    const {REPO, INTEGRATED} = await import('./helpers/bw-integrated.mjs');
    const {existsSync} = await import('node:fs');
    // A missing tree FAILS rather than skips (docs/GATES-THAT-CANNOT-FAIL.md).
    assert.ok(existsSync(path.join(INTEGRATED, 'node_modules', 'scratch-vm', 'src', 'index.js')),
        'the integrated GUI tree (scratch-vm) is present: run `cd packages/scratch-gui && npm install --ignore-scripts --legacy-peer-deps`');
    const {runOnSimLab} = await import('./helpers/sim-lab-vm.mjs');
    const GUI = path.join(REPO, 'overlay', 'scratch-gui');
    const program = readFileSync(path.join(GUI, 'static/sim-lab/programs/line-follower.bw'), 'utf8');
    const options = {modelText: modelText('line-follower.ldr'), mat: 'line-oval', timeLimitMs: 15000};
    const here = await runOnSimLab(program, options);
    const worker = startWorker();
    t.after(() => worker.terminate());
    const there = await runOnSimLab(program, {...options, worker: new PhysicsClient(worker)});
    assert.ok(there.stats && there.stats.batches > 400, `the worker ran the physics: ${JSON.stringify(there.stats)}`);
    assert.equal(there.stats.diverged, 0);
    assert.equal(there.track.length, here.track.length);
    // The program steered: the robot went round a good part of the oval.
    const far = Math.max(...here.track.map(p => Math.hypot(p.axle[0] - here.track[0].axle[0], p.axle[2] - here.track[0].axle[2])));
    assert.ok(far > 0.3, `the line follower drove ${far.toFixed(2)} m from its start`);
    for (let i = 0; i < here.track.length; i++) assert.deepStrictEqual(there.track[i], here.track[i], `frame ${i}`);
});

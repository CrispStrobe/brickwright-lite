// SPDX-License-Identifier: BSD-3-Clause
// An actual EV3 direct-bytecode guest in the Lab/Jolt world, on the main thread
// and the real physics worker. No compiler reply, sensor or motor is substituted.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Worker} from 'node:worker_threads';
import {fileURLToPath} from 'node:url';
import {SimSession, catalogFrom, MODELS} from '../overlay/scratch-gui/src/lib/bw-sim/sim-session.js';
import {PhysicsClient} from '../overlay/scratch-gui/src/lib/bw-sim/physics/physics-client.js';
import {createRobotLabApi} from '../overlay/scratch-gui/src/lib/bw-sim/api/robot-lab-api.js';
import {createEv3Session} from '../overlay/scratch-gui/src/lib/bw-sim/hubs/ev3/ev3-peripheral.js';

const catalog = catalogFrom(JSON.parse(readFileSync(new URL('../overlay/scratch-gui/src/lib/bw-sim/part-meta/parts.json', import.meta.url), 'utf8')));
const text = readFileSync(new URL('../overlay/scratch-gui/static/sim-lab/models/ev3-wall-stopper.ldr', import.meta.url), 'utf8');
const mat = MODELS.find(model => model.file === 'ev3-wall-stopper.ldr').mat;
// Preserve the shipped model's existing decorative-eye island merge exactly;
// a new compiler issue is not admitted by this fixture.
const SHIPPED_WARNINGS = [{severity: 'warning', code: 'locked-hinges',
    message: 'Hinges between b2 and b3 lock, merging islands', parts: ['eyeAxle', 'eyeAxleFront', 'eyes']}];

const connect = session => {
    const record = session.hubs.find(h => h.profile === 'ev3');
    assert.ok(record);
    const replies = [];
    const link = createEv3Session(() => record.hub, {send: bytes => replies.push(Array.from(bytes)), close () {}});
    const api = createRobotLabApi({getSession: () => session});
    return {record, hub: record.hub, replies, link, api};
};

// Independent CDK/FDK frames. WAIT_FOR_PRESS holds the first reply and the
// queued finite move; B+C then turn 180+90 degrees with a ramp and brake.
const WAIT = Uint8Array.from([7, 0, 1, 0, 0, 0, 0, 0x83, 3]);
const MOVE_CODE = [0xae, 0, 6, 0x81, 40, 0, 0x82, 180, 0, 0x81, 90, 1, 0xaa, 0, 6];
const MOVE = Uint8Array.from([5 + MOVE_CODE.length, 0, 2, 0, 0, 0, 0, ...MOVE_CODE]);
const seen = (session, guest) => ({position: session.core.bodyPose(guest.record.body).position,
    B: guest.hub.s.outputs[1].angleDeg, C: guest.hub.s.outputs[2].angleDeg});

test('valid brick input releases WAIT_FOR_PRESS into finite physical motion, including an in-flight worker batch', async t => {
    const worker = new Worker(new URL('./fixtures/bw-sim/physics-worker-host.mjs', import.meta.url),
        {argv: [fileURLToPath(import.meta.url)]});
    let here;
    let there;
    let a;
    let b;
    t.after(async () => {
        for (const guest of [a, b]) if (guest) { guest.link.close(); guest.api.dispose(); }
        if (here) here.dispose();
        if (there) there.dispose();
        await worker.terminate();
    });
    const main = await SimSession.fromText(text, {catalog, hubState: null, mat});
    here = main.session;
    const background = await SimSession.fromText(text, {catalog, hubState: null, mat, worker: new PhysicsClient(worker)});
    there = background.session;
    assert.deepEqual(main.issues, SHIPPED_WARNINGS);
    assert.deepEqual(background.issues, SHIPPED_WARNINGS);
    assert.equal(there.worker, true, there.workerError);
    a = connect(here);
    b = connect(there);
    const tick = async ms => {
        here.tick(ms); there.tick(ms);
        await here.idle(); await there.idle();
        assert.deepEqual(seen(there, b), seen(here, a), 'main and worker physical observations agree');
    };
    for (let i = 0; i < 10; i++) await tick(16.7);
    const start = seen(here, a);
    for (const guest of [a, b]) { guest.link.receive(WAIT); guest.link.receive(MOVE); }
    for (let i = 0; i < 5; i++) await tick(16.7);
    for (const guest of [a, b]) {
        assert.equal(guest.link.pending, 2);
        assert.deepEqual(guest.replies, []);
        assert.equal(guest.api.pressButton(guest.record.id, 0, true).ok, false);
        assert.equal(guest.hub.s.outputs[1].job, null);
        assert.equal(guest.hub.s.outputs[2].job, null);
    }
    const blocked = seen(here, a);
    assert.ok(Math.abs(blocked.B - start.B) < 1 && Math.abs(blocked.C - start.C) < 1, 'no commanded motor movement before input');
    assert.ok(Math.abs(blocked.position[0] - start.position[0]) < 0.001, 'the waiting program has not driven the robot');

    there.tick(16.7);
    assert.ok(there._inFlight);
    const redos = there.stats.redos || 0;
    assert.equal(b.api.pressButton(b.record.id, 'enter', true).ok, true);
    assert.equal(a.api.pressButton(a.record.id, 'enter', true).ok, true);
    assert.deepEqual(a.replies, [[3, 0, 1, 0, 2]], 'the actual held input releases the wire wait immediately');
    assert.deepEqual(b.replies, a.replies);
    here.tick(16.7);
    await here.idle(); await there.idle();
    assert.equal(there.stats.redos, redos + 1, 'worker replays the batch with the new button/motor state');
    assert.deepEqual(seen(there, b), seen(here, a));

    let completedAt = null;
    const track = [];
    const limit = here.time + 5000;
    while (here.time < limit) {
        await tick([16.7, 33.4, 2.1, 16.6][track.length % 4]);
        track.push({time: here.time, ...seen(here, a)});
        if (completedAt === null && a.replies.length === 2 && b.replies.length === 2) completedAt = here.time;
        if (completedAt !== null && here.time >= completedAt + 600) break;
    }
    assert.notEqual(completedAt, null, 'finite motor program completes within its simulated-time bound');
    assert.deepEqual(a.replies, [[3, 0, 1, 0, 2], [3, 0, 2, 0, 2]]);
    assert.deepEqual(b.replies, a.replies);
    const last = track.at(-1);
    const before = track.find(p => p.time >= last.time - 500);
    for (const port of ['B', 'C']) {
        const turned = last[port] - start[port];
        // STEP_SPEED stops at its tacho count and then brakes mechanically;
        // retain the shipped CDK step-command contract in
        // bw-sim-ev3-direct-commands.test.mjs, not a position-hold tolerance.
        assert.ok(turned >= 270 && turned < 280, `${port}: ${turned} degrees for a 270-degree program`);
        assert.ok(Math.abs(last[port] - before[port]) < 3, `${port} stopped after its finite command`);
    }
    assert.ok(last.position[0] - start.position[0] > 0.05, 'the button-gated guest drove the actual model');
    for (const guest of [a, b]) {
        assert.equal(guest.api.pressButton(guest.record.id, 'enter', false).ok, true);
        assert.equal(guest.hub.anyButton(), false);
        assert.equal(guest.link.pending, 0);
    }
});

test('FDK sync turns drive the actual robot with the same coupled shafts on main and worker', async t => {
    const worker = new Worker(new URL('./fixtures/bw-sim/physics-worker-host.mjs', import.meta.url),
        {argv: [fileURLToPath(import.meta.url)]});
    t.after(() => worker.terminate());
    const turns = new Map();
    for (const turn of [0, 50, 100, 150, 200, -50, -100, -150, -200]) {
        const {session: main} = await SimSession.fromText(text, {catalog, hubState: null, mat});
        const {session: background} = await SimSession.fromText(text, {catalog, hubState: null, mat,
            worker: new PhysicsClient(worker)});
        const a = connect(main);
        const b = connect(background);
        try {
            assert.equal(background.worker, true);
            const tick = async ms => {
                main.tick(ms); background.tick(ms);
                await main.idle(); await background.idle();
                assert.deepEqual(seen(background, b), seen(main, a), `turn ${turn}: identical physical shaft observations`);
            };
            for (let i = 0; i < 10; i++) await tick(16.7);
            const start = seen(main, a);
            let heading = a.hub.s.headingDeg;
            let swept = 0;
            const code = [0xb0, 0, 6, 0x81, 40, 0x82, turn & 255, (turn >> 8) & 255,
                0x82, 104, 1, 1, 0xaa, 0, 6]; // STEP_SYNC 360 degrees, then OUTPUT_READY
            const frame = Uint8Array.from([code.length + 5, 0, 3, 0, 0, 0, 0, ...code]);
            for (const guest of [a, b]) guest.link.receive(frame);
            let completedAt = null;
            const limit = main.time + 5000;
            while (main.time < limit) {
                await tick(16.7);
                const next = a.hub.s.headingDeg;
                swept += ((next - heading + 540) % 360) - 180;
                heading = next;
                if (completedAt === null && a.replies.length && b.replies.length) completedAt = main.time;
                if (completedAt !== null && main.time >= completedAt + 600) break;
            }
            assert.notEqual(completedAt, null, `turn ${turn}: bounded finite completion`);
            assert.deepEqual(a.replies, [[3, 0, 3, 0, 2]]);
            assert.deepEqual(b.replies, a.replies);
            const end = seen(main, a);
            const master = turn >= 0 ? 'B' : 'C';
            const follower = turn >= 0 ? 'C' : 'B';
            const masterTravel = end[master] - start[master];
            const followerTravel = end[follower] - start[follower];
            assert.ok(masterTravel >= 360 && masterTravel < 370, `turn ${turn}: master ${masterTravel}`);
            const ratio = (100 - Math.abs(turn)) / 100;
            assert.ok(Math.abs(followerTravel - ratio * masterTravel) < 10,
                `turn ${turn}: follower ${followerTravel}, master ${masterTravel}`);
            if (turn === 0) {
                assert.ok(end.position[0] - start.position[0] > 0.05, 'straight sync physically advances');
                assert.ok(Math.abs(swept) < 5, `straight sync heading ${swept}`);
            } else assert.ok(Math.abs(swept) > 10, `turn ${turn}: physical heading changed ${swept}`);
            turns.set(turn, swept);
            for (const port of a.hub.s.outputs.slice(1, 3)) {
                assert.equal(port.job, null);
                assert.equal(port.decay, 'brake');
                assert.ok(Math.abs(port.measuredDps) < 5, 'finite pair has stopped mechanically');
            }
        } finally {
            for (const guest of [a, b]) { guest.link.close(); guest.api.dispose(); }
            main.dispose(); background.dispose();
        }
    }
    for (const turn of [50, 100, 150, 200]) assert.ok(turns.get(turn) * turns.get(-turn) < 0,
        `opposite ${turn} turn ratios sweep opposite physical headings`);
});

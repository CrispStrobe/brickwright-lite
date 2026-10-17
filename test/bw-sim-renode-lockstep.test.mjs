// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
/**
 * Robot Lab R13d: an emulated SPIKE firmware drives the S1 driving base in
 * lockstep with the physics (docs/ROBOT-LAB-SPIKE-EMULATION.md §2, §4 R13d),
 * here against an in-process FAKE emulator (test/bw-sim-renode-lockstep-fake.mjs:
 * the port model's external shaft and duty average, and a re-implementation of
 * the NuttX hub program's motor loop and program interpreter). The real
 * Renode route (R13e) needs the other owners' pieces; see the plan.
 *
 * Proven, by measuring the physics and the exchanges (no value below is one the
 * test set):
 *   - the request is refused before sending when it breaks the closed contract;
 *   - "drive forward 360°" in the fake firmware: the shafts the hub sends at every
 *     step ARE the physics hinge angles (to the milli-degree the wire carries),
 *     the firmware's own view of its motors stays within 1° of the physics, the
 *     program completes because the PHYSICS wheels reached 360°;
 *   - the distance is within 5 % of the same motion through the Scratch route
 *     (spikeprime blocks, the VM, SpikeVirtualHub's controller; same DC model);
 *   - a reply with the wrong clock or a stale seq stops the scene; physics stays
 *     at the last completed step;
 *   - the worker is refused for such a scene (in-thread, one step per exchange);
 *   - a Scratch-driven hub and a firmware hub share one scene;
 *   - two runs are bit-identical;
 *   - the real-time factor is measured (a slow emulator is slow motion, not skipped steps).
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {SimSession, catalogFrom, MODELS_BASE} from '../overlay/scratch-gui/src/lib/bw-sim/sim-session.js';
import {compile} from '../overlay/scratch-gui/src/lib/bw-sim/mech/compile.js';
import {loadJolt} from '../overlay/scratch-gui/src/lib/bw-sim/physics/jolt-core.js';
import {RenodeLockstepDriver, capabilityTransport, lockstepAvailable} from '../overlay/scratch-gui/src/lib/bw-sim/routes/renode-lockstep/driver.js';
import {stepRequest, driveToPortDrive, LockstepDesyncError, LockstepContractError, LOCKSTEP_OPS} from '../overlay/scratch-gui/src/lib/bw-sim/routes/renode-lockstep/contract.js';
import {L3_HUB_NEEDS_LOCKSTEP} from '../overlay/scratch-gui/src/lib/bw-sim/routes/renode-lockstep/runner.js';
import {SpikeFirmwareVirtualHub} from '../overlay/scratch-gui/src/lib/bw-sim/hubs/spike/spike-firmware-hub.js';
import {SpikeVirtualHub} from '../overlay/scratch-gui/src/lib/bw-sim/hubs/spike/spike-virtual-hub.js';
import VirtualSpikeHubState from '../overlay/scratch-gui/src/lib/virtual-hub/spike-hub-state.js';
import {FakeSpikeRenode} from './bw-sim-renode-lockstep-fake.mjs';
import {runOnSimLab} from './helpers/sim-lab-vm.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SIM = path.join(ROOT, 'overlay/scratch-gui/src/lib/bw-sim');
const CATALOG = catalogFrom(JSON.parse(readFileSync(path.join(SIM, 'part-meta/parts.json'), 'utf8')));
const MODEL_TEXT = readFileSync(path.join(ROOT, 'overlay/scratch-gui', MODELS_BASE, 'driving-base.ldr'), 'latin1');
const DEG = 180 / Math.PI;
const SPEED_PCT = 30;

/** The °/s the Scratch route's `set movement speed 30` means for the base's medium motors. */
const scratchDps = (() => {
    const hub = new VirtualSpikeHubState();
    hub.data.sensors[0] = {kind: 'motor', deviceId: 48};
    return hub.backend.percentToDps(0, SPEED_PCT);
})();

/** Forward 360° on both wheels (A is mounted mirrored), then brake (fake op 7 starts A without waiting). */
const FORWARD_360 = [[7, 0, -360, Math.round(scratchDps)], [6, 1, 360, Math.round(scratchDps)], [2, 300, 0, 0], [0, 0, 0, 0]];

/** Rotate v by the unit quaternion [x, y, z, w]. */
const rotate = ([x, y, z, w], v) => {
    const ix = w * v[0] + y * v[2] - z * v[1];
    const iy = w * v[1] + z * v[0] - x * v[2];
    const iz = w * v[2] + x * v[1] - y * v[0];
    const iw = -x * v[0] - y * v[1] - z * v[2];
    return [ix * w - iw * x - iy * z + iz * y, iy * w - iw * y - iz * x + ix * z, iz * w - iw * z - ix * y + iy * x];
};

/** Builds the firmware route's scene for the shipped driving base (as the pane would). */
const firmwareScene = async ({program = FORWARD_360, faults = {}, latencyMs = 0, worker = null, text = MODEL_TEXT} = {}) => {
    const fake = new FakeSpikeRenode({program, faults, latencyMs});
    const driver = new RenodeLockstepDriver({transport: fake});
    await driver.begin();
    const made = [];
    const {session, issues} = await SimSession.fromText(text, {hubState: null, catalog: CATALOG, worker,
        createHub: def => { const hub = new SpikeFirmwareVirtualHub({id: def.id, driver}); made.push(hub); return hub; }});
    return {fake, driver, session, issues, hub: made[0]};
};

/**
 * Runs the firmware scene one 5 ms step at a time until the fake firmware's program
 * completes (or the budget runs out); records every step.
 */
const runFirmware = async ({budgetMs = 8000, ...options} = {}) => {
    const scene = await firmwareScene(options);
    const {session, hub, fake} = scene;
    hub.sent = [];
    const mech = session.mechanism;
    const hubBody = mech.bodies.find(b => b.id === session.hubs[0].body);
    const hinges = mech.joints.filter(j => j.motor);
    const byPort = new Map(mech.actuators.map(a => [a.port, a.joint]));
    const angle0 = new Map([...byPort].map(([port, joint]) => [port, session.core.jointState(joint).angle]));
    const axle0 = [0, 1, 2].map(i => hinges.reduce((sum, j) => sum + j.point[i], 0) / hinges.length);
    const axle = () => {
        const pose = session.core.bodyPose(hubBody.id);
        return rotate(pose.rotation, [0, 1, 2].map(i => axle0[i] - hubBody.position[i])).map((v, i) => v + pose.position[i]);
    };
    const start = axle();
    const steps = [];
    try {
        while (session.time < budgetMs && fake.programState !== 'complete') {
            session.tick(5);
            await session.idle();
            steps.push({t: session.time,
                angles: Object.fromEntries([...byPort].map(([port, joint]) => [port, (session.core.jointState(joint).angle - angle0.get(port)) * DEG])),
                guest: Object.fromEntries(hub.read.motors.map(m => [m.port, m.position])),
                drives: hub.readDrives(),
                poses: mech.bodies.map(b => session.core.bodyPose(b.id))});
        }
        return {...scene, steps, start, end: axle(), sent: hub.sent};
    } finally {
        session.dispose();
    }
};

const along = (a, b) => Math.hypot(b[0] - a[0], b[2] - a[2]);

/** The firmware run of the 360° test, reused by the Scratch comparison. */
let firmwareRun = null;

test('the step request is closed: refused before anything is sent', () => {
    const ok = {quantumUs: 5000, expectClockNs: 1e9, shafts: [{port: 'A', positionMdeg: 1, speedMdps: -2}], sensors: []};
    assert.deepEqual(stepRequest(ok).shafts, ok.shafts);
    const bad = [
        [{...ok, quantumUs: 7000}, /quantumUs/],
        [{...ok, expectClockNs: 1.5}, /expectClockNs/],
        [{...ok, shafts: [{port: 'G', positionMdeg: 0, speedMdps: 0}]}, /port 'G'/],
        [{...ok, shafts: [{port: 'A', positionMdeg: 0, speedMdps: 0}, {port: 'A', positionMdeg: 0, speedMdps: 0}]}, /twice/],
        [{...ok, shafts: [{port: 'A', positionMdeg: 0.5, speedMdps: 0}]}, /integer/],
        [{...ok, shafts: [{port: 'A', positionMdeg: 0, speedMdps: 0, extra: 1}]}, /unexpected key 'extra'/],
        [{...ok, sensors: [{port: 'A', kind: 'color', values: {}}]}, /both a shaft and a sensor/],
        [{...ok, sensors: [{port: 'C', kind: 'gyro', values: {}}]}, /kind/]
    ];
    for (const [request, why] of bad) assert.throws(() => stepRequest(request), why);
    // The duty is the quantum's mean; an undriven quantum floats unless it braked.
    assert.deepEqual(driveToPortDrive({port: 'A', meanDrive: -2500, brakingTicks: 0, ticks: 5}), {port: 'A', mode: 'pwm', duty: -0.25, decay: 'brake'});
    assert.equal(driveToPortDrive({port: 'A', meanDrive: 0, brakingTicks: 0, ticks: 5}).decay, 'coast');
    assert.equal(driveToPortDrive({port: 'A', meanDrive: 0, brakingTicks: 5, ticks: 5}).decay, 'brake');
});

test('the driver refuses an emulator without the lockstep capabilities, and the pane gate needs all three ops', async () => {
    const fake = new FakeSpikeRenode({capabilities: ['arena-inputs/v1', 'lockstep/v1']});
    const driver = new RenodeLockstepDriver({transport: fake});
    await assert.rejects(driver.begin(), err => err instanceof LockstepContractError && /motor-bridge-drive\/v1, external-shaft\/v1/.test(err.message));
    await driver.end();
    assert.deepEqual(fake.log.map(([op]) => op), [LOCKSTEP_OPS.sessionStart, LOCKSTEP_OPS.begin, LOCKSTEP_OPS.sessionClose],
        'no lockstep.end for a session that never entered lockstep; the session is closed');
    const ops = Object.fromEntries(Object.values(LOCKSTEP_OPS).map(op => [op, () => Promise.resolve({})]));
    assert.equal(lockstepAvailable(ops), true);
    assert.equal(lockstepAvailable({...ops, [LOCKSTEP_OPS.step]: undefined}), false);
    assert.equal(capabilityTransport({'renode.spike.state.read': () => null}), null, 'today\'s native ops alone are not enough');
});

test('fake firmware "drive forward 360°": the shafts it receives are the physics, and so is what it sees', async t => {
    const run = await runFirmware();
    const {steps, sent, fake} = run;
    assert.equal(fake.programState, 'complete', `the firmware program finished (state ${fake.programState} after ${steps.length} steps)`);
    assert.equal(run.session.lockstep, true);
    assert.equal(sent.length, steps.length, 'one exchange per physics step');
    assert.equal(fake.received.length, steps.length, 'and the emulator saw each one');
    // Exchange k carries R_k: the hinge angles after step k−1 (0 before the first step).
    let worstShaft = 0;
    let worstGuest = 0;
    for (let k = 0; k < steps.length; k++) {
        const physics = k === 0 ? {A: 0, B: 0} : steps[k - 1].angles;
        for (const s of sent[k].shafts) {
            worstShaft = Math.max(worstShaft, Math.abs(s.positionMdeg / 1000 - physics[s.port]));
        }
        assert.equal(fake.received[k].ms, 1000 + 5 * k, `exchange ${k} anchored at the step's start`);
        // What the firmware's motor model says at the end of the quantum vs the physics there.
        for (const port of ['A', 'B']) worstGuest = Math.max(worstGuest, Math.abs(steps[k].guest[port] - steps[k].angles[port]));
    }
    const last = steps.at(-1);
    t.diagnostic(`${steps.length} steps (${last.t} ms); wheels A ${last.angles.A.toFixed(2)}°, B ${last.angles.B.toFixed(2)}°; ` +
        `worst shaft vs physics ${worstShaft.toFixed(5)}°, worst guest vs physics ${worstGuest.toFixed(4)}°`);
    assert.ok(worstShaft <= 0.0005 + 1e-9, `the shafts are the hinge angles to the wire's milli-degree (worst ${worstShaft}°)`);
    assert.ok(worstGuest <= 1, `the guest's motor positions follow the physics within 1° (worst ${worstGuest}°)`);
    // The firmware stops when ITS encoder — the physics — is within 1° of the target.
    assert.ok(Math.abs(last.angles.B - 360) < 2 && Math.abs(last.angles.A + 360) < 2, `wheels at ${last.angles.A}°, ${last.angles.B}°`);
    assert.ok(steps.some(s => s.drives.every(d => Math.abs(d.duty) > 0.2)), 'the firmware drove the motors');
    assert.deepEqual(last.drives.map(d => d.decay), ['brake', 'brake'], 'and ended braking');
    run.distance = along(run.start, run.end);
    firmwareRun = run;
});

test('the same motion through the Scratch route travels within 5 % of the firmware route', async t => {
    const fw = firmwareRun || await runFirmware();
    const fwDistance = along(fw.start, fw.end);
    const program = ['DEVICE SPIKE', 'WHEN flag clicked:', '  set movement motors A B', `  set movement speed ${SPEED_PCT}`,
        '  move forward 360 degrees'].join('\n');
    const {track} = await runOnSimLab(program, {modelText: MODEL_TEXT, timeLimitMs: 6000});
    const scratch = along(track[0].axle, track.at(-1).axle);
    const ratio = fwDistance / scratch;
    t.diagnostic(`firmware ${(fwDistance * 1000).toFixed(1)} mm in ${fw.steps.at(-1).t} ms; Scratch ${(scratch * 1000).toFixed(1)} mm; ratio ${ratio.toFixed(4)}`);
    assert.ok(scratch > 0.1, `the Scratch route moved the base (${scratch} m)`);
    assert.ok(Math.abs(ratio - 1) < 0.05, `distance ratio firmware/Scratch ${ratio}`);
});

test('a reply with the wrong clock stops the scene; the physics stays at the last completed step', async () => {
    for (const faults of [{skewAtStep: 20, skewNs: 1}, {repeatSeqAtStep: 20}]) {
        const {session, hub} = await firmwareScene({faults});
        try {
            for (let i = 0; i < 19; i++) { session.tick(5); await session.idle(); }
            const before = session.mechanism.bodies.map(b => session.core.bodyPose(b.id));
            assert.equal(session.time, 95);
            session.tick(5);
            await assert.rejects(session.idle(), err => err instanceof LockstepDesyncError, JSON.stringify(faults));
            assert.ok(session.failed instanceof LockstepDesyncError, 'the session reports the failure (the pane shows it)');
            session.tick(50);
            await assert.rejects(session.idle());
            assert.equal(session.time, 95, 'no simulated time after the desync');
            assert.deepStrictEqual(session.mechanism.bodies.map(b => session.core.bodyPose(b.id)), before, 'the physics did not step');
            assert.equal(hub.exchanges, 19);
            await assert.rejects(hub.driver.step(hub.pendingInputs()), LockstepDesyncError, 'the driver stays failed');
        } finally {
            session.dispose();
        }
    }
});

test('the worker is refused for a scene with an emulated hub; it runs in-thread, never rewound', async () => {
    let loads = 0;
    const worker = {simLoad: async () => { loads++; throw new Error('must not be asked'); }};
    const {session, hub} = await firmwareScene({worker});
    try {
        assert.equal(session.worker, false);
        assert.equal(session.lockstep, true);
        assert.match(session.workerError, new RegExp(L3_HUB_NEEDS_LOCKSTEP));
        assert.equal(loads, 0, 'the worker was never loaded');
        assert.deepEqual(hub.exportState(), {nonRewindable: true, timeMs: 0});
        assert.throws(() => hub.importState({}), /cannot be rewound/);
        assert.throws(() => new SimSession({hubState: null, model: session.model, mechanism: session.mechanism, catalog: CATALOG,
            worker, loaded: {scene: 1}, hubs: session.hubs}), new RegExp(L3_HUB_NEEDS_LOCKSTEP));
        session.tick(5);
        await session.idle();
        assert.deepEqual(hub.exportState(), {nonRewindable: true, timeMs: 5});
    } finally {
        session.dispose();
    }
});

test('a motor on a port the emulated topology does not drive is refused', async () => {
    const onC = MODEL_TEXT.replace('0 !BW PORT B', '0 !BW PORT C');
    await assert.rejects(firmwareScene({text: onC}), /port-topology-mismatch|Port C: the model has a motor/);
});

test('a Scratch-driven hub and a firmware hub share one scene', async t => {
    const J = await loadJolt();
    const model = JSON.parse(readFileSync(path.join(ROOT, 'test/fixtures/bw-sim/driving-base.json'), 'utf8'));
    model.version = 2;
    model.parts.push({...structuredClone(model.parts.find(p => p.id === 'hub')), id: 'hub2', position: [0, 0, 400]});
    model.parts.find(p => p.port === 'B').port = {hub: 'hub2', port: 'A'};
    const mechanism = compile(model, CATALOG, {version: 2});
    const fake = new FakeSpikeRenode({program: [[1, 0, 300, 0], [2, 1000, 0, 0], [0, 0, 0, 0]]});
    const driver = new RenodeLockstepDriver({transport: fake});
    await driver.begin();
    const scratchState = new VirtualSpikeHubState();
    const session = new SimSession({hubState: scratchState, model, mechanism, catalog: CATALOG, J,
        createHub: def => (def.id === 'hub2' ? new SpikeFirmwareVirtualHub({id: def.id, driver}) : null)});
    try {
        const [scratch, firmware] = session.hubs.map(h => h.hub);
        assert.ok(scratch instanceof SpikeVirtualHub && firmware instanceof SpikeFirmwareVirtualHub);
        assert.equal(session.lockstep, true);
        const joint = id => mechanism.joints.find(j => j.motor && mechanism.bodies.find(b => b.id === j.body2).parts.includes(id)).id;
        const [left, right] = [joint('motorL'), joint('motorR')];
        const a0 = [left, right].map(j => session.core.jointState(j).angle);
        const start = session.core.bodyPose(session.hubs[0].body).position;
        // The Scratch side's command, as the VM would issue it between steps.
        scratchState.motors.runAtSpeed('A', -300);
        for (let i = 0; i < 160; i++) { session.tick(5); await session.idle(); }
        const turned = [left, right].map((j, i) => (session.core.jointState(j).angle - a0[i]) * DEG);
        const end = session.core.bodyPose(session.hubs[0].body).position;
        t.diagnostic(`0.8 s: Scratch wheel ${turned[0].toFixed(1)}°, firmware wheel ${turned[1].toFixed(1)}°, forward ${((start[2] - end[2]) * 1000).toFixed(1)} mm`);
        assert.ok(turned[0] < -100 && turned[1] > 100, `both hubs drove their wheel: ${turned}`);
        assert.ok(Math.abs(turned[0] + turned[1]) < 0.15 * turned[1], `at about the same speed: ${turned}`);
        assert.ok(start[2] - end[2] > 0.05, 'the base drove forward (−z)');
        assert.equal(firmware.exchanges, 160, 'one exchange per step');
        assert.equal(scratch.timeMs, firmware.timeMs, 'both hubs were advanced to the same time');
        assert.ok(Math.abs(scratchState.data.motors[0].position - turned[0]) < 1e-6, 'the Scratch hub reads the physics encoder');
    } finally {
        session.dispose();
    }
});

test('two runs of the firmware route are bit-identical', async () => {
    const a = await runFirmware({budgetMs: 600});
    const b = await runFirmware({budgetMs: 600});
    assert.equal(a.steps.length, 120);
    assert.deepStrictEqual(b.steps, a.steps);
    assert.deepStrictEqual(b.sent, a.sent);
});

test('a slow emulator is slow motion: every step waits for its exchange, the real-time factor says how slow', async t => {
    const latencyMs = 15;
    const {session} = await firmwareScene({latencyMs});
    try {
        const started = performance.now();
        // As the pane does: 50 ms of wall time per frame is owed, the runner keeps at most a
        // short backlog and drops the rest of the wall time — never simulated time.
        for (let frame = 0; frame < 8; frame++) {
            session.tick(50);
            await new Promise(resolve => setTimeout(resolve, 50));
        }
        await session.idle();
        const wall = performance.now() - started;
        const rtf = session.realTimeFactor;
        const outer = session.time / wall;
        t.diagnostic(`${session.time} ms simulated in ${wall.toFixed(0)} ms wall; runner RTF ${rtf.toFixed(3)}, outer ${outer.toFixed(3)}; dropped ${session.stats.droppedMs} ms`);
        assert.equal(session.stats.steps * 5, session.time, 'every simulated step had its exchange');
        assert.ok(session.stats.droppedMs > 0, 'wall time beyond the backlog was dropped');
        assert.ok(rtf < 0.6, `an exchange of ≥ ${latencyMs} ms per 5 ms step is slower than real time (RTF ${rtf})`);
        assert.ok(Math.abs(rtf - outer) < 0.35 * outer, `the runner's RTF ${rtf} agrees with the outer measurement ${outer}`);
    } finally {
        session.dispose();
    }
});

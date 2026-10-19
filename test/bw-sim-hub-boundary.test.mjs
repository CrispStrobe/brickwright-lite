// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
/**
 * One boundary for every hub (docs/ROBOT-LAB-ARCHITECTURE.md §3, §5.1, slice R1):
 * the S1 driving base (test/fixtures/bw-sim/driving-base.json) is driven by a hub
 * that is NOT SPIKE — a fake two-port family (test/fixtures/bw-sim/two-port-test-hub.mjs)
 * whose ports take PWM duties, like an RCX or Power Functions hub — through the same
 * SimHubBridge, worker protocol and SimSession the SPIKE hub uses, with no edit to
 * any of them: the family is a profile + one adapter, added to a registry.
 *
 * Proven here, by measuring the physics (nothing below asserts a value the test set):
 *   - hub profiles validate, and the registry refuses a bad or doubled family;
 *   - duty A = -1, B = +1 drives the base forward and straight; the encoder the hub
 *     counts (Σ deltaRad) is the hinge angle the physics measured;
 *   - the pwm drive is a real path: half the duty turns the wheels at half the speed
 *     (the R1 DC stand-in, physics/actuators.js), and duty 0 with decay 'coast' rolls
 *     on where 'brake' holds the wheels;
 *   - a port the hub does not have is a refusal, not a silent unbound motor;
 *   - the worker protocol carries the fake hub's state generically: a session with
 *     its physics behind a (here in-thread) physics host gives bit-identical poses and
 *     encoder counts to the in-thread session, including a batch redone because the
 *     hub's outputs changed while it was in flight.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {compile} from '../overlay/scratch-gui/src/lib/bw-sim/mech/compile.js';
import {loadJolt, createPhysicsCore} from '../overlay/scratch-gui/src/lib/bw-sim/physics/jolt-core.js';
import {createPhysicsHost} from '../overlay/scratch-gui/src/lib/bw-sim/physics/physics-host.js';
import {PhysicsClient} from '../overlay/scratch-gui/src/lib/bw-sim/physics/physics-client.js';
import {SimHubBridge, STEP_MS} from '../overlay/scratch-gui/src/lib/bw-sim/hub-bridge.js';
import {createSimRunner} from '../overlay/scratch-gui/src/lib/bw-sim/sim-worker-protocol.js';
import {SimSession, catalogFrom, MODELS_BASE} from '../overlay/scratch-gui/src/lib/bw-sim/sim-session.js';
import {hubRegistry} from '../overlay/scratch-gui/src/lib/bw-sim/hubs/index.js';
import {HubRegistry} from '../overlay/scratch-gui/src/lib/bw-sim/registry/hubs.js';
import {validateHubProfile} from '../overlay/scratch-gui/src/lib/bw-sim/hubs/hub-profile.js';
import {SPIKE_PRIME_PROFILE} from '../overlay/scratch-gui/src/lib/bw-sim/hubs/spike/profile.js';
import {TWO_PORT_PROFILE, TwoPortTestHub, twoPortTestHub} from './fixtures/bw-sim/two-port-test-hub.mjs';
import {SPIKE_MEDIUM_ANGULAR} from '../overlay/scratch-gui/src/lib/bw-sim/devices/dc-motors.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const json = p => JSON.parse(readFileSync(path.join(ROOT, p), 'utf8'));
const PARTS = json('overlay/scratch-gui/src/lib/bw-sim/part-meta/parts.json');
const CATALOG = catalogFrom(PARTS);
const MODEL = json('test/fixtures/bw-sim/driving-base.json');
const DEG = 180 / Math.PI;

/** Runs the driving base on a fresh two-port hub; `script(hub, ms)` sets outputs as time passes. */
const drive = async ({seconds, script, model = MODEL}) => {
    const J = await loadJolt();
    const mech = compile(model, CATALOG);
    const core = createPhysicsCore(J, mech, {stepHz: 1000 / STEP_MS});
    const hubBody = mech.bodies.find(b => b.parts.includes('hub')).id;
    const motors = new Map(mech.joints.filter(j => j.motor).map(j => [j.motor.port, j.id]));
    const angle0 = new Map([...motors].map(([port, id]) => [port, core.jointState(id).angle]));
    const hub = new TwoPortTestHub({id: 'hub'});
    let bridge;
    try {
        bridge = new SimHubBridge({hubs: [{hub, body: hubBody}], core, mechanism: mech});
        const start = core.bodyPose(hubBody).position;
        const track = [];
        for (let ms = 0; ms < seconds * 1000; ms += 50) {
            script(hub, ms);
            bridge.tick(50);
            track.push(core.bodyPose(hubBody).position);
        }
        const end = core.bodyPose(hubBody).position;
        const angles = new Map([...motors].map(([port, id]) => [port, core.jointState(id).angle - angle0.get(port)]));
        return {hub, start, end, track, angles, dz: end[2] - start[2], dx: end[0] - start[0]};
    } finally {
        bridge?.dispose();
        core.destroy();
    }
};

const along = (a, b) => Math.hypot(b[0] - a[0], b[2] - a[2]);

test('hub profiles validate, and the registry takes a family as data + one module', () => {
    assert.deepEqual(validateHubProfile(SPIKE_PRIME_PROFILE), []);
    assert.deepEqual(validateHubProfile(TWO_PORT_PROFILE), []);
    assert.deepEqual(SPIKE_PRIME_PROFILE.ports.map(p => p.id), ['A', 'B', 'C', 'D', 'E', 'F']);
    const broken = {...TWO_PORT_PROFILE, drive: 'volts',
        ports: [TWO_PORT_PROFILE.ports[0], {...TWO_PORT_PROFILE.ports[1], id: 'A', accepts: ['motor', 'warp-drive']}]};
    const problems = validateHubProfile(broken);
    assert.ok(problems.some(p => /ports\[1\]\.id: 'A' twice/.test(p)), problems.join('; '));
    assert.ok(problems.some(p => /ports\[1\]\.accepts/.test(p)), problems.join('; '));
    assert.ok(problems.some(p => /\.drive:/.test(p)), problems.join('; '));
    assert.throws(() => new HubRegistry([{profile: broken, createVirtualHub: () => null}]), /invalid hub profile/);
    assert.throws(() => hubRegistry.with(twoPortTestHub, twoPortTestHub), /registered twice/);
    assert.throws(() => hubRegistry.create('test-two-port'), /no hub module for profile 'test-two-port'/);
    const registry = hubRegistry.with(twoPortTestHub);
    // lab-direct: the Robot Lab's own hub for a model without one (hubs/lab-direct, the Robot Lab API).
    assert.deepEqual(registry.profiles().map(p => p.id), ['spike-prime', 'lab-direct', 'test-two-port']);
    assert.ok(registry.create('test-two-port', {id: 'x'}) instanceof TwoPortTestHub);
    assert.equal(hubRegistry.has('test-two-port'), false, 'the built-in registry is not changed by a test\'s');
});

test('a two-port pwm hub drives the S1 base forward; its encoder counts are the measured hinge angles', async t => {
    const r = await drive({seconds: 1, script: hub => { hub.setOutput('A', -1); hub.setOutput('B', 1); }});
    t.diagnostic(`1 s at duty 1 (9 V): ${r.dz.toFixed(3)} m along z, ${r.dx.toFixed(4)} m sideways, heading ${r.hub.headingDeg.toFixed(2)}°`);
    // Forward is away from the castor: world -z (test/bw-sim-s1-driving-base.test.mjs).
    assert.ok(r.dz < -0.3, `moved ${r.dz.toFixed(3)} m along z`);
    assert.ok(Math.abs(r.dx) < 0.05 * Math.abs(r.dz), `drifted ${r.dx.toFixed(3)} m sideways`);
    assert.ok(Math.abs(r.hub.headingDeg) < 5, `heading ${r.hub.headingDeg}°`);
    for (const port of ['A', 'B']) {
        assert.ok(Math.abs(r.hub.counts[port] - r.angles.get(port)) < 1e-9,
            `port ${port}: counted ${r.hub.counts[port]} rad, the hinge turned ${r.angles.get(port)} rad`);
    }
    assert.ok(r.hub.counts.A < 0 && r.hub.counts.B > 0, 'A turned negative, B positive');
    assert.equal(r.hub.steps, 1000 / STEP_MS, 'the hub was advanced once per physics step');
    assert.equal(r.hub.publishes, 1000 / 50, 'and published once per tick');
});

test('the pwm drive path: half the duty, half the speed; coast and brake stop the wheels as the DC model predicts', async tc => {
    const full = await drive({seconds: 1, script: hub => { hub.setOutput('A', -1); hub.setOutput('B', 1); }});
    const half = await drive({seconds: 1, script: hub => { hub.setOutput('A', -0.5); hub.setOutput('B', 0.5); }});
    // The DC line ω = ω0·(u − τ_load/τs) with u ∝ duty: half the duty gives
    // (u/2 − l)/(u − l) of the speed, 0.5 for a light rolling load l.
    for (const port of ['A', 'B']) {
        const ratio = half.hub.speeds[port] / full.hub.speeds[port];
        assert.ok(Math.abs(ratio - 0.5) < 0.05, `port ${port}: wheel speed ratio ${ratio.toFixed(3)} at half duty`);
    }
    const travel = along(half.start, half.end) / along(full.start, full.end);
    tc.diagnostic(`half duty: speed ratio A ${(half.hub.speeds.A / full.hub.speeds.A).toFixed(3)}, B ${(half.hub.speeds.B / full.hub.speeds.B).toFixed(3)}, ` +
        `travel ${travel.toFixed(3)}`);
    assert.ok(travel > 0.4 && travel < 0.6, `half duty went ${travel.toFixed(3)} of the distance`);
    // Drive 0.6 s, then duty 0: how far do the wheels turn in the 50 ms after the stop?
    // Predicted from the DC model (devices/dc-motors.js) and the base, not from a run. Each
    // wheel carries the motor's rotor (reflected inertia J) and half the base's mass on its
    // 28 mm radius: I = J + (m/2)·r². Coasting (winding open), only the gearbox friction τf
    // decelerates it and the tyres roll: θ = ω·t − ½·(τf/I)·t². Braked (winding shorted),
    // the back-EMF damping b = τs/ω0 decays the wheel's speed relative to the chassis; were
    // the chassis level it would be exponential with τ = I/b (rolling; J/b if the tyre skids),
    // θ = ω·τ·(1 − e^(−t/τ)). The chassis is not level: the braking torque's reaction pitches
    // it forward (this base's castor is behind the axle, so nothing stops the nose dipping;
    // measured up to 7 rad/s), turning the housing with the wheel, which only shortens the
    // relative turn the encoder counts — so I/b gives an upper bound. ω is the wheel speed the
    // hub measured at the stop.
    const stop = decay => {
        const at = {};
        return drive({seconds: 1.6, script: (hub, ms) => {
            const duty = ms < 600 ? 1 : 0;
            if (ms === 600 || ms === 650) at[ms] = {count: hub.counts.B, speed: hub.speeds.B};
            hub.setOutput('A', -duty, decay);
            hub.setOutput('B', duty, decay);
        }}).then(r => ({...r, afterStop: at[650].count - at[600].count, speedAtStop: at[600].speed}));
    };
    const coast = await stop('coast');
    const brake = await stop('brake');
    const motor = SPIKE_MEDIUM_ANGULAR.motor;
    const mass = compile(MODEL, CATALOG).bodies.filter(body => body.motion === 'dynamic').reduce((sum, body) => sum + body.massKg, 0);
    const r = 0.028;
    const t = 0.05;
    const J = motor.rotorInertiaKgM2;
    const I = J + mass / 2 * r * r;
    const b = motor.stallTorqueNm / motor.noLoadRadPerSec;
    const coastPredicted = coast.speedAtStop * t - 0.5 * motor.frictionTorqueNm / I * t * t;
    assert.ok(Math.abs(coast.afterStop - coastPredicted) < 0.1 * coastPredicted,
        `coasting, wheel B turned ${(coast.afterStop * DEG).toFixed(1)}° in 50 ms; predicted ${(coastPredicted * DEG).toFixed(1)}°`);
    const tau = I / b;
    const high = brake.speedAtStop * tau * (1 - Math.exp(-t / tau));
    tc.diagnostic(`coast ${(coast.afterStop * DEG).toFixed(1)}° in 50 ms (predicted ${(coastPredicted * DEG).toFixed(1)}°); ` +
        `brake ${(brake.afterStop * DEG).toFixed(1)}° (at most ${(high * DEG).toFixed(1)}°)`);
    assert.ok(brake.afterStop > 0 && brake.afterStop < 1.1 * high,
        `braked, wheel B turned ${(brake.afterStop * DEG).toFixed(1)}° in 50 ms; predicted at most ${(high * DEG).toFixed(1)}°`);
    assert.ok(coast.afterStop > brake.afterStop, 'the shorted winding stops the wheel sooner than the open one');
});

test('a motor on a port the hub does not have is refused, not left unbound', async () => {
    const onC = structuredClone(MODEL);
    onC.parts.find(p => p.port === 'B').port = 'C';
    await assert.rejects(drive({seconds: 0.1, model: onC, script: () => {}}), /the test hub has no port 'C'/);
});

/** Frame lengths as a browser delivers them. */
const FRAMES = [16.7, 16.6, 16.7, 33.4, 16.6, 2.1, 16.7, 50, 16.6, 16.7];

test('the worker protocol carries a non-SPIKE hub: bit-identical to in-thread, redo included', async () => {
    const registry = hubRegistry.with(twoPortTestHub);
    // The SPIKE hub part declares the fake family: the session picks its adapter from the registry.
    const catalog = new Map(CATALOG);
    catalog.set('45601.dat', {...catalog.get('45601.dat'), hub: {...catalog.get('45601.dat').hub, profile: 'test-two-port'}});
    const text = readFileSync(path.join(ROOT, 'overlay/scratch-gui', MODELS_BASE, 'driving-base.ldr'), 'latin1');
    // A physics host on this thread, as the worker runs it; messages are cloned as postMessage does.
    const listeners = [];
    const host = createPhysicsHost({loadJolt, createPhysicsCore,
        createSimRunner: options => createSimRunner({...options, registry}),
        post: msg => listeners.forEach(fn => fn({data: structuredClone(msg)}))});
    const port = {postMessage: msg => host.handle(structuredClone(msg)), addEventListener: (type, fn) => type === 'message' && listeners.push(fn)};
    const {session: here} = await SimSession.fromText(text, {hubState: null, catalog, registry});
    const {session: there} = await SimSession.fromText(text, {hubState: null, catalog, registry, worker: new PhysicsClient(port)});
    try {
        assert.equal(there.worker, true, `the host runs the physics: ${there.workerError}`);
        const [hubHere, hubThere] = [here, there].map(s => s.hubs[0].hub);
        assert.ok(hubHere instanceof TwoPortTestHub && hubThere instanceof TwoPortTestHub);
        const seen = s => ({time: s.time, poses: s.mechanism.bodies.map(b => s.core.bodyPose(b.id)),
            counts: s.hubs[0].hub.counts, speeds: s.hubs[0].hub.speeds, heading: s.hubs[0].hub.headingDeg});
        const both = fn => { fn(hubHere); fn(hubThere); };
        let f = 0;
        const tick = async () => {
            const ms = FRAMES[f++ % FRAMES.length];
            here.tick(ms);
            there.tick(ms);
            await there.idle();
        };
        both(h => { h.setOutput('A', -1); h.setOutput('B', 0.6); });
        for (let i = 0; i < 40; i++) { await tick(); assert.deepStrictEqual(seen(there), seen(here), `frame ${i}`); }
        // An output change while a batch is in flight: redone from the checkpoint, as if it came first.
        there.tick(16.7);
        assert.ok(there._inFlight, 'a batch is in flight');
        both(h => h.setOutput('B', -0.4, 'coast'));
        here.tick(16.7);
        await there.idle();
        assert.equal(there.stats.redos, 1, 'the batch was redone');
        for (let i = 0; i < 20; i++) { await tick(); assert.deepStrictEqual(seen(there), seen(here), `after the redo, frame ${i}`); }
        assert.equal(there.stats.diverged, 0, 'the main thread\'s hub chose the drives the mirror did, every step');
        assert.ok(Math.abs(hubThere.counts.A) > 1, `the wheels turned: ${JSON.stringify(hubThere.counts)}`);
    } finally {
        here.dispose();
        there.dispose();
    }
});

// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// Sliders and rack-and-pinion in the physics core (slice R3 (a), (e) of
// docs/ROBOT-LAB-ARCHITECTURE.md; overlay/scratch-gui/src/lib/bw-sim/physics/jolt-core.js).
//
// The Technic rack 3743 is not in the vendored LDraw subset
// (overlay/scratch-gui/static/ldraw/) and the full library is not available here, so the
// mechanisms are built from primitive colliders with LEGO dimensions: Technic gears are
// module 1 mm, so an 8T pinion's pitch radius is m·z/2 = 4 mm and a rack under it moves
// r = 0.004 m per radian (the coupling's ratio, derived, never measured from the run).
//
//   (a) a motor-driven 8T pinion moves a rack 10 cm with |v_rack − r·ω| < 1 % at every
//       step after spin-up, and the rack's travel is r·Δθ within 1 % — for both signs of
//       the ratio (rack axis +x and −x), and the slider's reported position is the rack
//       body's displacement;
//   (b) a slider with limits stops at them within 0.5 mm under a 0.5 N push (the slider's
//       own motor at 0.5 N, and gravity on 0.5 N / g = 51 g), both ends;
//       sliding friction holds a load below it and lets one above it slide at
//       (W − F)/m; a position motor reaches its target; hinge limits and friction too;
//   (e) checkpoint/rollback with sliders, a rack, a moving load in contact and the contact
//       log is bit-identical, including a slider motor's force limit (MotorSettings, which
//       Jolt's SaveState does not record); and the worker protocol (a hub driving the
//       pinion through SimHubBridge) gives the in-thread numbers to the last bit, redo included.

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadJolt, createPhysicsCore} from '../overlay/scratch-gui/src/lib/bw-sim/physics/jolt-core.js';
import {createPhysicsHost} from '../overlay/scratch-gui/src/lib/bw-sim/physics/physics-host.js';
import {PhysicsClient} from '../overlay/scratch-gui/src/lib/bw-sim/physics/physics-client.js';
import {createSimRunner} from '../overlay/scratch-gui/src/lib/bw-sim/sim-worker-protocol.js';
import {SimSession, catalogFrom, hubsOf} from '../overlay/scratch-gui/src/lib/bw-sim/sim-session.js';
import {hubRegistry} from '../overlay/scratch-gui/src/lib/bw-sim/hubs/index.js';
import {upgradeMechanismV1, validateCompiledMechanism} from '../overlay/scratch-gui/src/lib/bw-sim/contracts.js';
import {twoPortTestHub} from './fixtures/bw-sim/two-port-test-hub.mjs';

const J = await loadJolt();
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CATALOG = catalogFrom(JSON.parse(readFileSync(path.join(ROOT, 'overlay/scratch-gui/src/lib/bw-sim/part-meta/parts.json'), 'utf8')));

const STEP_HZ = 200;
const DT = 1 / STEP_HZ;
const G = 9.81;
/** Technic gear module (m): pitch radius = module · teeth / 2. */
const MODULE_M = 0.001;
const PINION_TEETH = 8;
const R_PINION = MODULE_M * PINION_TEETH / 2;
const TOL_RATE = 0.01;
const TOL_STOP_M = 0.0005;

const frame = (extra = {}) => ({id: 'frame', motion: 'static', position: [0, 0, 0], rotation: [0, 0, 0, 1], massKg: 0,
    colliders: [{shape: 'box', halfExtents: [0.004, 0.004, 0.004]}], parts: ['frame'], ...extra});
// A cylinder's axis is local +y; the pinion turns about world z: rotate +90° about x.
const Q_Y_TO_Z = [Math.SQRT1_2, 0, 0, Math.SQRT1_2];

/**
 * A clamped frame carrying an 8T pinion (hinge about +z, motorised) and a 10 cm rack under it
 * (slider along `dir`·x). Pinion turning +ω about +z moves its lowest tooth by ω×(0, −r, 0) =
 * (+r·ω, 0, 0): with the rack axis +x, ratio = +r; with −x, ratio = −r.
 */
const rackMech = (dir = 1, {gravity = [0, -G, 0], load = false} = {}) => {
    const bodies = [
        frame(),
        {id: 'pinion', motion: 'dynamic', position: [0, 0.02, 0], rotation: Q_Y_TO_Z, massKg: 0.002,
            colliders: [{shape: 'cylinder', radius: R_PINION, halfHeight: 0.0035}], parts: ['pinion']},
        {id: 'rack', motion: 'dynamic', position: [0, 0.02 - R_PINION - 0.002, 0], rotation: [0, 0, 0, 1], massKg: 0.008,
            colliders: [{shape: 'box', halfExtents: [0.05, 0.002, 0.004]}], parts: ['rack']}
    ];
    if (load) {
        // A 10 g box resting on the rack's far end: it rides along (contact, D2).
        bodies.push({id: 'box', motion: 'dynamic', position: [0.04, 0.02 - R_PINION + 0.005, 0], rotation: [0, 0, 0, 1], massKg: 0.01,
            colliders: [{shape: 'box', halfExtents: [0.005, 0.005, 0.005]}], parts: [], friction: 0.8});
    }
    return {
        version: 1, gravity, bodies,
        joints: [
            {id: 'jp', type: 'hinge', body1: 'frame', body2: 'pinion', point: [0, 0.02, 0], axis: [0, 0, 1],
                motor: {port: 'A', maxTorqueNm: 0.18, maxSpeedRadPerSec: 1110 * Math.PI / 180}},
            {id: 'jr', type: 'slider', body1: 'frame', body2: 'rack', point: [0, 0.02 - R_PINION - 0.002, 0], axis: [dir, 0, 0]}
        ],
        gears: [{id: 'rp', type: 'rackAndPinion', hingeJoint: 'jp', sliderJoint: 'jr', ratio: dir * R_PINION}],
        diagnostics: []
    };
};

for (const dir of [1, -1]) {
    test(`(a) a motor-driven 8T pinion moves a rack 10 cm at r·ω within 1 % (rack axis ${dir > 0 ? '+x' : '−x'}, ratio ${dir > 0 ? '+' : '−'}r)`, t => {
        const mech = rackMech(dir);
        assert.deepEqual(validateCompiledMechanism(mech), []);
        const core = createPhysicsCore(J, mech, {stepHz: STEP_HZ});
        const omega = 10; // rad/s: v = 4 cm/s
        core.setMotor('jp', {mode: 'velocity', radPerSec: omega});
        const x0 = core.bodyPose('rack').position[0];
        let worst = 0;
        let steps = 0;
        while (Math.abs(core.jointState('jr').position) < 0.1 && steps < 5 * STEP_HZ) {
            core.step(DT);
            steps++;
            if (steps < 20) continue; // spin-up (0.1 s)
            const w = core.jointState('jp').velocity;
            const v = core.jointState('jr').velocity;
            worst = Math.max(worst, Math.abs(v - dir * R_PINION * w) / Math.abs(R_PINION * w));
        }
        const theta = core.jointState('jp').angle;
        const s = core.jointState('jr').position;
        const moved = core.bodyPose('rack').position[0] - x0;
        core.destroy();
        t.diagnostic(`travel ${(s * 1000).toFixed(2)} mm in ${(steps * DT).toFixed(2)} s; r·θ ${(dir * R_PINION * theta * 1000).toFixed(2)} mm; worst |v − r·ω|/r·ω ${(worst * 100).toFixed(3)} %`);
        assert.ok(Math.abs(s) >= 0.1, `the rack moved 10 cm: ${s}`);
        assert.ok(worst < TOL_RATE, `|v_rack − r·ω| within 1 % every step: worst ${(worst * 100).toFixed(3)} %`);
        assert.ok(Math.abs(s - dir * R_PINION * theta) < TOL_RATE * Math.abs(s), `travel ${s} vs r·θ ${dir * R_PINION * theta}`);
        assert.ok(Math.abs(moved - dir * s) < 1e-5, `the slider's position is the rack body's displacement: ${moved} vs ${dir * s}`);
    });
}

test('(a) the rack drives the pinion back: pushing the rack turns the coasting pinion at v/r', t => {
    const mech = rackMech(1, {gravity: [0, 0, 0]});
    mech.joints[1].maxForceN = 1;
    const core = createPhysicsCore(J, mech, {stepHz: STEP_HZ});
    core.setMotor('jr', {mode: 'velocity', mPerSec: 0.02});
    for (let i = 0; i < STEP_HZ; i++) core.step(DT);
    const {velocity: w} = core.jointState('jp');
    const {velocity: v, position: s} = core.jointState('jr');
    const theta = core.jointState('jp').angle;
    core.destroy();
    t.diagnostic(`rack ${v.toFixed(5)} m/s, pinion ${w.toFixed(4)} rad/s (v/r ${(v / R_PINION).toFixed(4)})`);
    assert.ok(Math.abs(v - 0.02) < 0.02 * TOL_RATE, `the slider motor drives the rack at 2 cm/s: ${v}`);
    assert.ok(Math.abs(w - v / R_PINION) < TOL_RATE * v / R_PINION, `ω = v/r: ${w} vs ${v / R_PINION}`);
    assert.ok(Math.abs(theta - s / R_PINION) < TOL_RATE * s / R_PINION, `θ = s/r: ${theta} vs ${s / R_PINION}`);
});

/** A 20 g carriage on a slider along `axis` from a clamped frame. */
const carriage = ({axis = [1, 0, 0], gravity = [0, 0, 0], limits, frictionN, maxForceN, massKg = 0.02} = {}) => ({
    version: 1, gravity,
    bodies: [frame(), {id: 'carriage', motion: 'dynamic', position: [0, 0, 0], rotation: [0, 0, 0, 1], massKg,
        colliders: [{shape: 'box', halfExtents: [0.008, 0.004, 0.004]}], parts: ['carriage']}],
    joints: [{id: 's', type: 'slider', body1: 'frame', body2: 'carriage', point: [0, 0, 0], axis,
        ...(limits ? {limits} : {}), ...(frictionN !== undefined ? {frictionN} : {}), ...(maxForceN !== undefined ? {maxForceN} : {})}],
    gears: [], diagnostics: []
});

test('(b) a slider with limits stops at them within 0.5 mm under a 0.5 N push from its motor, both ends', t => {
    const limits = [-0.02, 0.03];
    const core = createPhysicsCore(J, carriage({limits}), {stepHz: STEP_HZ});
    const PUSH = 0.5;
    for (const [end, v] of [[limits[1], 1], [limits[0], -1]]) {
        core.setMotor('s', {mode: 'velocity', mPerSec: v, maxForceN: PUSH});
        let far = 0;
        for (let i = 0; i < STEP_HZ; i++) {
            core.step(DT);
            far = Math.max(far, v * (core.jointState('s').position - end));
        }
        const s = core.jointState('s').position;
        const x = core.bodyPose('carriage').position[0];
        t.diagnostic(`push ${v > 0 ? '+' : '−'}: rests at ${(s * 1000).toFixed(3)} mm (limit ${end * 1000} mm), furthest past it ${(far * 1000).toFixed(3)} mm`);
        assert.ok(Math.abs(s - end) < TOL_STOP_M, `stopped at the limit ${end}: ${s}`);
        assert.ok(Math.abs(x - end) < TOL_STOP_M, `the body is there too: ${x}`);
        // It hits the stop at v = √(2·F/m·d) (1.2 m/s from the +30 mm run's start): the stop acts
        // from the step it is reached, so it can be passed by at most one step's travel v·dt.
        const d = Math.abs(end - (v > 0 ? 0 : limits[1]));
        const vHit = Math.sqrt(2 * PUSH / 0.02 * d);
        assert.ok(far <= vHit * DT, `past the stop by at most one step at ${vHit.toFixed(2)} m/s: ${far}`);
    }
    core.destroy();
});

test('(b) a vertical slider stops a 0.5 N weight (51 g) at its lower limit within 0.5 mm', t => {
    const massKg = 0.5 / G;
    const core = createPhysicsCore(J, carriage({axis: [0, 1, 0], gravity: [0, -G, 0], limits: [-0.03, 0], massKg}), {stepHz: STEP_HZ});
    for (let i = 0; i < STEP_HZ; i++) core.step(DT);
    const s = core.jointState('s').position;
    core.destroy();
    t.diagnostic(`a ${(massKg * 1000).toFixed(1)} g carriage rests at ${(s * 1000).toFixed(3)} mm`);
    assert.ok(Math.abs(s + 0.03) < TOL_STOP_M, `stopped at −30 mm: ${s}`);
});

test('(b) sliding friction holds a weight below it and lets a heavier pull slide at (W − F)/m', t => {
    const massKg = 0.02;
    const W = massKg * G; // 0.196 N
    const held = createPhysicsCore(J, carriage({axis: [0, 1, 0], gravity: [0, -G, 0], frictionN: 1.5 * W, massKg}), {stepHz: STEP_HZ});
    for (let i = 0; i < STEP_HZ; i++) held.step(DT);
    const sHeld = held.jointState('s').position;
    held.destroy();
    const F = 0.5 * W;
    const slides = createPhysicsCore(J, carriage({axis: [0, 1, 0], gravity: [0, -G, 0], frictionN: F, massKg}), {stepHz: STEP_HZ});
    const T = 0.2;
    for (let i = 0; i < T * STEP_HZ; i++) slides.step(DT);
    const sSlid = slides.jointState('s').position;
    slides.destroy();
    // Jolt integrates velocity first, then position (symplectic Euler): after n steps of dt
    // under a constant acceleration a, s = a·dt²·n(n+1)/2 = ½·a·T²·(1 + 1/n).
    const n = T * STEP_HZ;
    const expected = -0.5 * (W - F) / massKg * T * T * (1 + 1 / n);
    t.diagnostic(`held: ${(sHeld * 1000).toFixed(4)} mm; sliding: ${(sSlid * 1000).toFixed(2)} mm in ${T} s, ½·(W − F)/m·T²·(1 + 1/n) = ${(expected * 1000).toFixed(2)} mm`);
    assert.ok(Math.abs(sHeld) < 1e-4, `friction 1.5·W holds it: ${sHeld}`);
    assert.ok(Math.abs(sSlid - expected) < 0.01 * Math.abs(expected), `slides ${sSlid} vs ${expected}`);
});

test('(b) a slider position motor reaches its target; a slider without a force cannot be driven', () => {
    const core = createPhysicsCore(J, carriage({maxForceN: 2}), {stepHz: STEP_HZ});
    core.setMotor('s', {mode: 'position', m: 0.015, mPerSec: 0.05});
    for (let i = 0; i < 2 * STEP_HZ; i++) core.step(DT);
    const s = core.jointState('s').position;
    core.destroy();
    assert.ok(Math.abs(s - 0.015) < TOL_STOP_M, `at the 15 mm target: ${s}`);
    const bare = createPhysicsCore(J, carriage(), {stepHz: STEP_HZ});
    assert.throws(() => bare.setMotor('s', {mode: 'velocity', mPerSec: 0.1}), /no motor force/);
    bare.setMotor('s', {mode: 'coast'});
    bare.destroy();
});

test('(b) hinge limits stop an arm falling under gravity; hinge friction holds it', t => {
    const arm = frictionNm => ({
        version: 1, gravity: [0, -G, 0],
        bodies: [frame(), {id: 'arm', motion: 'dynamic', position: [0.04, 0, 0], rotation: [0, 0, 0, 1], massKg: 0.01,
            colliders: [{shape: 'box', halfExtents: [0.04, 0.004, 0.004]}], parts: ['arm']}],
        joints: [{id: 'h', type: 'hinge', body1: 'frame', body2: 'arm', point: [0, 0, 0], axis: [0, 0, 1], limits: [-Math.PI / 6, Math.PI / 6],
            ...(frictionNm !== undefined ? {frictionNm} : {})}],
        gears: [], diagnostics: []
    });
    const core = createPhysicsCore(J, arm(), {stepHz: STEP_HZ});
    for (let i = 0; i < STEP_HZ; i++) core.step(DT);
    const fell = core.jointState('h').angle;
    core.destroy();
    // Gravity torque about the hinge: m·g·0.04 m = 3.9 mN·m.
    const held = createPhysicsCore(J, arm(1.5 * 0.01 * G * 0.04), {stepHz: STEP_HZ});
    for (let i = 0; i < STEP_HZ; i++) held.step(DT);
    const stayed = held.jointState('h').angle;
    held.destroy();
    t.diagnostic(`without friction: ${(fell * 180 / Math.PI).toFixed(2)}° (limit −30°); with 1.5× the gravity torque: ${(stayed * 180 / Math.PI).toFixed(4)}°`);
    assert.ok(Math.abs(fell + Math.PI / 6) < 0.5 * Math.PI / 180, `stopped at −30°: ${fell}`);
    assert.ok(Math.abs(stayed) < 0.05 * Math.PI / 180, `friction holds it: ${stayed}`);
});

const fingerprint = core => {
    const snap = core.snapshot();
    return Buffer.from(snap.bodies.buffer).toString('hex') + Buffer.from(snap.joints.buffer).toString('hex') +
        JSON.stringify(core.contactPairs()) + JSON.stringify(['jp', 'jr', 'js'].map(id => core.jointState(id)));
};

/** The rack mechanism plus a motorised carriage with limits and friction. */
const rollbackMech = () => {
    const m = rackMech(1, {load: true});
    m.bodies.push({id: 'carriage', motion: 'dynamic', position: [0, 0.06, 0], rotation: [0, 0, 0, 1], massKg: 0.02,
        colliders: [{shape: 'box', halfExtents: [0.008, 0.004, 0.004]}], parts: ['carriage']});
    m.joints.push({id: 'js', type: 'slider', body1: 'frame', body2: 'carriage', point: [0, 0.06, 0], axis: [0, 1, 0], limits: [-0.01, 0.02], frictionN: 0.05, maxForceN: 1});
    return m;
};

test('(e) checkpoint/rollback with sliders, a rack, a load in contact and the contact log is bit-identical', () => {
    const run = core => {
        core.setMotor('jp', {mode: 'velocity', radPerSec: 6});
        core.setMotor('js', {mode: 'velocity', mPerSec: 0.05});
        for (let i = 0; i < 60; i++) core.step(DT);
    };
    const reference = createPhysicsCore(J, rollbackMech(), {stepHz: STEP_HZ, recordContacts: true});
    run(reference);
    const atCheckpoint = fingerprint(reference);
    const after = [];
    for (let i = 0; i < 80; i++) { reference.step(DT); after.push(fingerprint(reference)); }
    assert.ok(reference.contactPairs().pairs['box|rack'] > 0, 'the load rides on the rack: a robot–load contact');

    const core = createPhysicsCore(J, rollbackMech(), {stepHz: STEP_HZ, recordContacts: true});
    assert.deepEqual(core.stateKeys(), ['clock', 'hinges', 'sliders', 'contacts']);
    run(core);
    core.checkpoint();
    // Other commands after the checkpoint: a weaker slider motor (its force limit is in
    // Jolt's MotorSettings, which SaveState skips), the pinion reversed.
    core.setMotor('js', {mode: 'velocity', mPerSec: -0.05, maxForceN: 0.1});
    core.setMotor('jp', {mode: 'velocity', radPerSec: -3});
    for (let i = 0; i < 50; i++) core.step(DT);
    assert.notEqual(fingerprint(core), after[49], 'the other commands changed the run');
    core.rollback();
    assert.equal(fingerprint(core), atCheckpoint, 'back at the checkpoint');
    for (let i = 0; i < 80; i++) { core.step(DT); assert.equal(fingerprint(core), after[i], `step ${i} after the rollback`); }
    // Twice from the same checkpoint.
    core.rollback();
    for (let i = 0; i < 80; i++) core.step(DT);
    assert.equal(fingerprint(core), after[79]);
    core.destroy();
    reference.destroy();
});

test('(e) the worker protocol carries sliders and a rack: bit-identical to in-thread, redo included', async () => {
    const registry = hubRegistry.with(twoPortTestHub);
    // The frame carries a hub part of the two-port test family; its port A drives the pinion.
    const catalog = new Map(CATALOG);
    catalog.set('45601.dat', {...catalog.get('45601.dat'), hub: {...catalog.get('45601.dat').hub, profile: 'test-two-port'}});
    const model = {version: 1, parts: [{id: 'frame', part: '45601.dat', position: [0, 0, 0], rotation: [1, 0, 0, 0, 1, 0, 0, 0, 1]}]};
    const mechanism = upgradeMechanismV1(rollbackMech());
    const hubs = hubsOf(model, mechanism, catalog);
    assert.deepEqual(hubs, [{id: 'frame', profile: 'test-two-port', body: 'frame'}]);
    const listeners = [];
    const host = createPhysicsHost({loadJolt, createPhysicsCore,
        createSimRunner: options => createSimRunner({...options, registry}),
        post: msg => listeners.forEach(fn => fn({data: structuredClone(msg)}))});
    const port = {postMessage: msg => host.handle(structuredClone(msg)), addEventListener: (type, fn) => type === 'message' && listeners.push(fn)};
    const client = new PhysicsClient(port);
    const loaded = await client.simLoad({mechanism, hubs, stepMs: 5});
    const here = new SimSession({hubState: null, model, mechanism, catalog, J, registry});
    const there = new SimSession({hubState: null, model, mechanism, catalog, worker: client, loaded, registry});
    try {
        const seen = s => ({time: s.time, poses: mechanism.bodies.map(b => s.core.bodyPose(b.id)),
            joints: mechanism.joints.filter(j => j.type !== 'ball').map(j => s.core.jointState(j.id)),
            counts: s.hubs[0].hub.counts, speeds: s.hubs[0].hub.speeds});
        const both = fn => { fn(here.hubs[0].hub); fn(there.hubs[0].hub); };
        const FRAMES = [16.7, 16.6, 16.7, 33.4, 16.6, 2.1, 16.7, 50, 16.6, 16.7];
        let f = 0;
        const tick = async () => {
            const ms = FRAMES[f++ % FRAMES.length];
            here.tick(ms);
            there.tick(ms);
            await there.idle();
        };
        both(h => h.setOutput('A', 0.2));
        for (let i = 0; i < 30; i++) { await tick(); assert.deepStrictEqual(seen(there), seen(here), `frame ${i}`); }
        there.tick(16.7);
        assert.ok(there._inFlight, 'a batch is in flight');
        both(h => h.setOutput('A', -0.1, 'coast'));
        here.tick(16.7);
        await there.idle();
        assert.equal(there.stats.redos, 1, 'the batch was redone');
        for (let i = 0; i < 20; i++) { await tick(); assert.deepStrictEqual(seen(there), seen(here), `after the redo, frame ${i}`); }
        assert.equal(there.stats.diverged, 0);
        assert.ok(Math.abs(there.core.jointState('jr').position) > 0.001, `the rack moved: ${there.core.jointState('jr').position}`);
    } finally {
        here.dispose();
        there.dispose();
    }
});

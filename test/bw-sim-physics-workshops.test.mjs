// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {REPO} from './helpers/bw-integrated.mjs';
import {MODELS, catalogFrom, prepareModel} from '../overlay/scratch-gui/src/lib/bw-sim/sim-session.js';
import {serializeModel} from '../overlay/scratch-gui/src/lib/bw-sim/model/ldraw-model.js';
import {buildSteps} from '../overlay/scratch-gui/src/lib/bw-sim/instructions/steps.js';
import {solidOverlaps} from '../overlay/scratch-gui/src/lib/bw-sim/editor/overlap.js';
import {loadJolt, createPhysicsCore} from '../overlay/scratch-gui/src/lib/bw-sim/physics/jolt-core.js';
import {runOnSimLab} from './helpers/sim-lab-vm.mjs';
const GUI = `${REPO}/overlay/scratch-gui`;
const catalog = catalogFrom(JSON.parse(readFileSync(`${GUI}/src/lib/bw-sim/part-meta/parts.json`)));
const modelText = id => readFileSync(`${GUI}/static/sim-lab/models/${id}.ldr`, 'utf8');
const program = id => readFileSync(`${GUI}/static/sim-lab/programs/${id}.bw`, 'utf8');
const prepared = id => prepareModel(modelText(id), catalog, {mat: 'plain'});
const jointFor = (mech, part) => mech.joints.find(j => j.body1 === mech.bodies.find(b => b.parts.includes('hub')).id &&
    mech.bodies.find(b => b.id === j.body2)?.parts.includes(part));
const finite = pose => [...pose.position, ...pose.rotation].every(Number.isFinite);

for (const [id, pieces, motors] of [['chain-transmission', 59, 1], ['flywheel-differential', 58, 2]]) {
    test(`${id}: >50 useful pieces, connected structure, no overlaps, complete instructions`, () => {
        const {model, mechanism, issues} = prepared(id);
        assert.deepEqual(issues, []);
        assert.equal(model.parts.length, pieces);
        assert.equal(mechanism.actuators.length, motors);
        assert.ok(MODELS.some(m => m.file === `${id}.ldr` && m.example === `${id}.bw`));
        for (const p of model.parts) assert.deepEqual(solidOverlaps(model, catalog, p), [], p.id);
        const steps = buildSteps(model, catalog).steps;
        assert.ok(steps.every(s => !s.loose));
        assert.deepEqual(steps.flatMap(s => s.parts).sort(), model.parts.map(p => p.id).sort());
    });
    test(`${id}: two-second full-motor stress run stays finite and together`, async () => {
        const {mechanism} = prepared(id);
        const core = createPhysicsCore(await loadJolt(), mechanism, {stepHz: 200});
        try {
            for (let i = 0; i < 40; i++) core.step(0.005);
            const bodies = mechanism.bodies.filter(b => b.motion === 'dynamic');
            const initial = new Map(bodies.map(b => [b.id, core.bodyPose(b.id).position]));
            for (const a of mechanism.actuators) core.setMotor(a.joint, {mode: 'velocity', radPerSec: 0.6 * a.maxSpeedRadPerSec});
            for (let i = 0; i < 400; i++) core.step(0.005);
            for (const a of mechanism.actuators) assert.ok(Math.abs(core.jointState(a.joint).angle) > 1, a.port);
            for (const b of bodies) {
                const pose = core.bodyPose(b.id);
                assert.ok(finite(pose));
                assert.ok(Math.hypot(...pose.position.map((v, i) => v - initial.get(b.id)[i])) < 0.5, b.id);
            }
        } finally { core.destroy(); }
    });
}

test('chain: three input turns make two same-direction output turns through the actual example', async t => {
    const r = await runOnSimLab(program('chain-transmission'), {modelText: modelText('chain-transmission'), mat: 'plain', timeLimitMs: 14000});
    assert.deepEqual(r.issues, []);
    assert.deepEqual(r.run.unsupported, []);
    const input = r.mechanism.actuators[0].joint;
    const output = jointFor(r.mechanism, 'sprocketBig').id;
    const start = r.track[0];
    const high = r.track.reduce((a, b) => b.joints[input].angle > a.joints[input].angle ? b : a);
    const turn = j => high.joints[j].angle - start.joints[j].angle;
    const inTurns = turn(input) / (2 * Math.PI);
    const outTurns = turn(output) / (2 * Math.PI);
    t.diagnostic(`input ${inTurns.toFixed(4)} turns; output ${outTurns.toFixed(4)} turns`);
    assert.ok(Math.abs(inTurns - 3) < 0.02);
    assert.ok(Math.abs(outTurns - 2) < 0.02);
    assert.ok(turn(input) * turn(output) > 0, 'a chain preserves direction');
    assert.ok(Math.abs(turn(output) / turn(input) - 2 / 3) < 0.005);
    assert.ok(Math.abs(r.track.at(-1).joints[input].angle - start.joints[input].angle) < 0.05, 'returns home');
});

test('differential: average output speed equals carrier speed; braking one side doubles the other', async t => {
    const r = await runOnSimLab(program('flywheel-differential'), {modelText: modelText('flywheel-differential'), mat: 'plain', timeLimitMs: 13000});
    assert.deepEqual(r.issues, []);
    assert.deepEqual(r.run.unsupported, []);
    const frameId = r.hubId;
    const shaftAxis = jointFor(r.mechanism, 'sideL').axis;
    const rate = part => {
        const body = r.mechanism.bodies.find(b => b.parts.includes(part)).id;
        let previous = null; let total = 0;
        const samples = [];
        for (const f of r.track) {
            const [fx, fy, fz, fw] = f.bodies[frameId].rotation;
            const [x, y, z, w] = f.bodies[body].rotation;
            const rx = fw * x - fx * w - fy * z + fz * y;
            const ry = fw * y + fx * z - fy * w - fz * x;
            const rz = fw * z - fx * y + fy * x - fz * w;
            const rw = fw * w + fx * x + fy * y + fz * z;
            const projection = rx * shaftAxis[0] + ry * shaftAxis[1] + rz * shaftAxis[2];
            const angle = 2 * Math.atan2(projection, rw);
            if (previous !== null) {
                let delta = angle - previous;
                while (delta > Math.PI) delta -= 2 * Math.PI;
                while (delta < -Math.PI) delta += 2 * Math.PI;
                total += delta;
            }
            previous = angle;
            if (f.t > 2000 && f.t < 4000) samples.push({t: f.t, angle: total});
        }
        return (samples.at(-1).angle - samples[0].angle) / ((samples.at(-1).t - samples[0].t) / 1000);
    };
    // Observe the real body's orientation relative to the frame, including the carrier:
    // its internal planet hinges are not a frame-to-carrier encoder.
    const left = rate('sideL'); const right = rate('sideR'); const carrier = rate('casing');
    t.diagnostic(JSON.stringify({left, right, carrier}));
    assert.ok(Math.abs(carrier) > 0.2, 'the carrier turns');
    assert.ok(Math.abs(right) < 0.05, 'right side is held');
    assert.ok(Math.abs((left + right) / 2 - carrier) < 0.05);
    assert.ok(Math.abs(left / carrier - 2) < 0.05);
});

test('inertia: under equal torque the six flywheels accelerate more slowly than the same frame without them', async t => {
    const J = await loadJolt();
    const accelerate = loaded => {
        let p = prepared('flywheel-differential');
        if (!loaded) p = prepareModel(serializeModel({...p.model, parts: p.model.parts.filter(x => !/^(flywheel|collar)/.test(x.id))}), catalog);
        assert.deepEqual(p.issues, []);
        const m = p.mechanism;
        // Clamp the same frame in both experiments, isolating rotational inertia from frame recoil.
        m.bodies.find(b => b.parts.includes('hub')).motion = 'static';
        const core = createPhysicsCore(J, m, {stepHz: 200});
        try {
            const input = m.actuators.find(a => a.port === 'A').joint;
            const brake = m.actuators.find(a => a.port === 'C').joint;
            core.setMotor(brake, {mode: 'velocity', radPerSec: 0});
            for (let i = 0; i < 50; i++) core.step(0.005);
            const before = core.jointState(input).velocity;
            core.setMotor(input, {mode: 'torque', torqueNm: 0.00003, dampingNmsPerRad: 0.000001});
            for (let i = 0; i < 40; i++) core.step(0.005);
            return (core.jointState(input).velocity - before) / 0.2;
        } finally { core.destroy(); }
    };
    const loaded = accelerate(true); const bare = accelerate(false);
    t.diagnostic(`equal torque: with flywheels ${loaded.toFixed(3)} rad/s², without ${bare.toFixed(3)} rad/s²`);
    assert.ok(loaded > 0 && bare > 0);
    assert.ok(loaded < bare * 0.9, 'added inertia measurably reduces angular acceleration');
    // The comparison can fail: substituting the bare frame for the loaded model cannot pass.
    assert.equal(bare < bare * 0.9, false);
});

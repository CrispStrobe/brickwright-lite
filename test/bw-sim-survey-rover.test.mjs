// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {REPO} from './helpers/bw-integrated.mjs';
import {MODELS, prepareModel, catalogFrom, SimSession} from '../overlay/scratch-gui/src/lib/bw-sim/sim-session.js';
import {solidOverlaps} from '../overlay/scratch-gui/src/lib/bw-sim/editor/overlap.js';
import {buildSteps, partAdjacency} from '../overlay/scratch-gui/src/lib/bw-sim/instructions/steps.js';
import {loadJolt, createPhysicsCore} from '../overlay/scratch-gui/src/lib/bw-sim/physics/jolt-core.js';
import {createRobotLabApi} from '../overlay/scratch-gui/src/lib/bw-sim/api/robot-lab-api.js';
import VirtualSpikeHubState from '../overlay/scratch-gui/src/lib/virtual-hub/spike-hub-state.js';
import {runOnSimLab} from './helpers/sim-lab-vm.mjs';

const GUI = `${REPO}/overlay/scratch-gui`;
const catalog = catalogFrom(JSON.parse(readFileSync(`${GUI}/src/lib/bw-sim/part-meta/parts.json`, 'utf8')));
const text = readFileSync(`${GUI}/static/sim-lab/models/survey-rover.ldr`, 'utf8');
const program = readFileSync(`${GUI}/static/sim-lab/programs/survey-rover.bw`, 'utf8');
const prepared = () => prepareModel(text, catalog, {mat: 'plain'});
const deg = r => r * 180 / Math.PI;
const distance = (a, b) => Math.hypot(...a.map((v, i) => v - b[i]));

test('Survey rover: three motors, sensor on the moving head, no loose parts or solid overlaps', () => {
    const entry = MODELS.find(m => m.file === 'survey-rover.ldr');
    assert.deepEqual(entry.title, {en: 'Survey rover', de: 'Erkundungsrover'});
    assert.equal(entry.example, 'survey-rover.bw');
    const {model, mechanism, issues} = prepared();
    assert.deepEqual(issues, []);
    assert.deepEqual(mechanism.actuators.map(a => a.port).sort(), ['A', 'B', 'C']);
    const motor = mechanism.actuators.find(a => a.port === 'C');
    const joint = mechanism.joints.find(j => j.id === motor.joint);
    const sensor = mechanism.sensors.find(s => s.port === 'D');
    assert.equal(sensor.kind, 'distance');
    assert.ok(mechanism.bodies.find(b => b.id === sensor.body).parts.includes('eyes'));
    assert.equal(sensor.body, joint.body2, 'sensor rides on the rotor, not the chassis');
    assert.ok(mechanism.bodies.length < 30);
    for (const part of model.parts) assert.deepEqual(solidOverlaps(model, catalog, part), [], part.id);
});

test('Survey rover: instructions place every part once, and each step connects to the assembly', () => {
    const {model} = prepared();
    const plan = buildSteps(model, catalog);
    const adjacency = partAdjacency(model, catalog);
    const built = new Set();
    assert.ok(plan.steps.length > 5);
    for (const step of plan.steps) {
        assert.equal(step.loose, false);
        const pending = new Set(step.parts);
        if (!built.size) { const first = pending.values().next().value; built.add(first); pending.delete(first); }
        while (pending.size) {
            const next = [...pending].find(id => [...adjacency.get(id)].some(n => built.has(n)));
            assert.ok(next, `unattached instruction step: ${[...pending]}`);
            assert.ok(!built.has(next), `duplicate part ${next}`);
            built.add(next); pending.delete(next);
        }
    }
    assert.deepEqual([...built].sort(), model.parts.map(p => p.id).sort());
});

test('Survey rover: all motors turn under load for two seconds with finite poses and no explosion', async () => {
    const {mechanism} = prepared();
    const core = createPhysicsCore(await loadJolt(), mechanism, {stepHz: 200});
    try {
        for (let i = 0; i < 40; i++) core.step(0.005);
        const bodies = mechanism.bodies.filter(b => b.motion === 'dynamic');
        const initial = new Map(bodies.map(b => [b.id, core.bodyPose(b.id).position]));
        for (const joint of mechanism.joints.filter(j => j.motor)) {
            core.setMotor(joint.id, {mode: 'velocity', radPerSec: 0.6 * joint.motor.maxSpeedRadPerSec});
        }
        for (let i = 0; i < 400; i++) core.step(0.005);
        for (const joint of mechanism.joints.filter(j => j.motor)) assert.ok(Math.abs(deg(core.jointState(joint.id).angle)) > 90, joint.id);
        for (const body of bodies) {
            const pose = core.bodyPose(body.id);
            assert.ok([...pose.position, ...pose.rotation].every(Number.isFinite), body.id);
            assert.ok(distance(pose.position, initial.get(body.id)) < 0.5, `${body.id} flung`);
            const ground = mechanism.bodies.find(b => b.id === 'ground');
            assert.ok(pose.position[1] > ground.position[1] + ground.colliders[0].halfExtents[1] - 0.01, `${body.id} fell through floor`);
        }
    } finally { core.destroy(); }
});

test('Survey rover: every motor is independently reachable through the Robot Lab API', async () => {
    const {session, issues} = await SimSession.fromText(text, {hubState: new VirtualSpikeHubState(), catalog});
    try {
        assert.deepEqual(issues, []);
        const api = createRobotLabApi({getSession: () => session, getStatus: () => 'running', locale: () => 'en'});
        assert.deepEqual(api.motors().map(m => m.port).sort(), ['A', 'B', 'C']);
        for (const port of ['A', 'B', 'C']) {
            const before = api.encoder(port).angleDeg;
            const command = api.setMotor(port, {degrees: 25, speedDps: 90});
            assert.equal(command.ok, true);
            let completed = false;
            command.done.then(result => { completed = result === 'completed'; });
            const start = session.time;
            while (!completed && session.time - start < 3000) { session.tick(20); await session.idle(); await null; }
            assert.ok(completed, `${port} completed`);
            assert.ok(Math.abs(api.encoder(port).angleDeg - before - 25) < 3, port);
            assert.equal(api.stopMotor(port).ok, true);
        }
    } finally { session.dispose(); }
});

const run = source => runOnSimLab(source, {modelText: text, mat: 'plain', timeLimitMs: 13000});
const judge = result => {
    const {track, mechanism, hubId} = result;
    const actuator = mechanism.actuators.find(a => a.port === 'C');
    const start = track[0].bodies[hubId].position;
    const angles = track.map(f => deg(f.joints[actuator.joint].angle));
    return {outward: Math.max(...track.map(f => distance(f.bodies[hubId].position, start))),
        returned: distance(track.at(-1).bodies[hubId].position, start),
        low: Math.min(...angles), high: Math.max(...angles), end: angles.at(-1)};
};

test('Survey rover: the actual example drives 10 cm, nods both ways, homes the head and returns', async t => {
    const result = await run(program);
    assert.deepEqual(result.issues, []);
    assert.deepEqual(result.run.unsupported, []);
    const r = judge(result);
    t.diagnostic(JSON.stringify(r));
    assert.ok(r.outward > 0.085 && r.outward < 0.12, '10 cm outward');
    assert.ok(r.returned < 0.015, 'returns within 15 mm');
    assert.ok(r.low < -25 && r.high > 25 && r.low > -35 && r.high < 35, 'head nods +/-30 degrees');
    assert.ok(Math.abs(r.end) < 3, 'head returns home');
    for (const frame of result.track) {
        for (const pose of Object.values(frame.bodies)) assert.ok([...pose.position, ...pose.rotation].every(Number.isFinite));
        const [x, y, z, w] = frame.bodies[result.hubId].rotation;
        assert.ok(1 - 2 * (x * x + z * z) > 0.98, 'chassis stays upright');
    }
});

test('Survey rover: omitting the return trip fails the return-position judge', async t => {
    const r = judge(await run(program.replace('move backward 10 cm', 'wait 1 seconds')));
    t.diagnostic(JSON.stringify(r));
    assert.ok(r.outward > 0.085);
    assert.ok(r.returned > 0.075, 'the judge detects a missing return');
});

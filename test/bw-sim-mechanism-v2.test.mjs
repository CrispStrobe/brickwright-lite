// SPDX-License-Identifier: BSD-3-Clause
/**
 * CompiledMechanism v2 (overlay/scratch-gui/src/lib/bw-sim/contracts.js;
 * docs/ROBOT-LAB-ARCHITECTURE.md §5.3, §5.7, slice R2): what the compiler
 * emits — hubs, actuators and sensor devices on {hub, port}, couplings, body
 * roles, the no-collide pairs — agrees with the v1 mechanism it contains; a v1
 * mechanism lifted by upgradeMechanismV1 runs bit-identically to the compiled
 * v2 one; and a model with two hubs carries each binding's hub through the
 * hub bridge, which plugs each motor into the hub it names.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {compile} from '../overlay/scratch-gui/src/lib/bw-sim/mech/compile.js';
import {validateCompiledMechanism, upgradeMechanismV1, mechanismV1, validatePlacedModel} from '../overlay/scratch-gui/src/lib/bw-sim/contracts.js';
import {loadJolt, createPhysicsCore} from '../overlay/scratch-gui/src/lib/bw-sim/physics/jolt-core.js';
import {SimHubBridge, STEP_MS, hubBindings} from '../overlay/scratch-gui/src/lib/bw-sim/hub-bridge.js';
import {catalogFrom, prepareModel, MODELS_BASE} from '../overlay/scratch-gui/src/lib/bw-sim/sim-session.js';
import {TwoPortTestHub} from './fixtures/bw-sim/two-port-test-hub.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const json = p => JSON.parse(readFileSync(path.join(ROOT, p), 'utf8'));
const CATALOG = catalogFrom(json('overlay/scratch-gui/src/lib/bw-sim/part-meta/parts.json'));
const BASE = json('test/fixtures/bw-sim/driving-base.json');
const GEARS = readdirSync(path.join(ROOT, 'test/fixtures/bw-sim/gears')).map(f => `gears/${f}`);
const J = await loadJolt();

test('the driving base compiles to v2: its hub, two motors on {hub, port}, roles and jointed pairs', () => {
    const m = compile(BASE, CATALOG, {version: 2});
    assert.deepEqual(validateCompiledMechanism(m), []);
    const hubBody = m.bodies.find(b => b.parts.includes('hub')).id;
    assert.deepEqual(m.hubs, [{id: 'hub', profile: 'spike-prime', body: hubBody}]);
    assert.deepEqual(m.actuators.map(a => [a.port, a.hub, a.device, a.ids.lpf2, a.sign]).sort(),
        [['A', 'hub', 'spike-medium-angular', 48, 1], ['B', 'hub', 'spike-medium-angular', 48, 1]]);
    for (const a of m.actuators) {
        const j = m.joints.find(x => x.id === a.joint);
        assert.equal(j.type, 'hinge');
        // The motor's hinge joins its housing to its turning output: both bodies hold the motor part.
        const motorPart = BASE.parts.find(p => p.port === a.port).id;
        for (const b of [j.body1, j.body2]) assert.ok(m.bodies.find(x => x.id === b).parts.includes(motorPart), `${a.port}: ${b}`);
        assert.equal(a.maxTorqueNm, 0.18);
        assert.equal(a.maxSpeedRadPerSec, 1110 * Math.PI / 180);
    }
    assert.deepEqual(m.devices, []);
    assert.equal(m.bodies.find(b => b.id === 'ground').role, 'ground');
    assert.ok(m.bodies.filter(b => b.id !== 'ground').every(b => b.role === 'robot' && b.collisionGroup === 'model'));
    assert.equal(m.bodies.find(b => b.id === 'ground').collisionGroup, 'world');
    // Every joint's two bodies never collide (owner decision D2's pair filter, R3).
    const pairs = new Set(m.noCollide.map(p => p.join('|')));
    for (const j of m.joints) assert.ok(pairs.has([j.body1, j.body2].sort().join('|')), `${j.id} ${j.body1}–${j.body2}`);
    assert.equal(m.noCollide.length, new Set(m.joints.map(j => [j.body1, j.body2].sort().join('|'))).size);
    // A mat's wall is an obstacle of the world.
    const walled = compile(BASE, CATALOG, {version: 2, obstacles: [{id: 'wall', shape: 'box', size: [0.5, 0.1, 0.02], position: [0, 0, -0.5]}]});
    assert.deepEqual(walled.bodies.filter(b => b.role === 'obstacle').map(b => [b.id, b.collisionGroup]), [['obstacle:wall', 'world']]);
    // The v1 mechanism inside it is what compile emits by default.
    assert.deepEqual(mechanismV1(m), compile(BASE, CATALOG));
});

test('sensors become devices on {hub, port}; a gear mesh is a coupling whose gear bodies never collide', () => {
    const text = readFileSync(path.join(ROOT, 'overlay/scratch-gui', MODELS_BASE, 'colour-explorer.ldr'), 'latin1');
    const {mechanism: m} = prepareModel(text, CATALOG, {mat: 'colour-zones'});
    assert.equal(m.version, 2);
    assert.equal(m.devices.length, m.sensors.length);
    for (const [d, s] of m.devices.map((d, i) => [d, m.sensors[i]])) {
        assert.equal(d.hub, m.hubs[0].id);
        assert.deepEqual([d.port, d.sensor, d.body, d.probe.origin, d.probe.direction], [s.port, s.kind, s.body, s.origin, s.direction]);
        assert.equal(d.device, `spike-${s.kind}`);
    }
    const g = compile(json('test/fixtures/bw-sim/gears/8-24.json'), CATALOG, {version: 2});
    assert.equal(g.couplings.length, 1);
    const [c] = g.couplings;
    assert.equal(c.kind, 'gear');
    assert.deepEqual(g.gears, [{id: c.id, type: 'gear', joint1: c.joint1, joint2: c.joint2, ratio: c.ratio, parts: c.parts}]);
    const gearBody = id => g.bodies.find(b => b.parts.includes(id)).id;
    const pair = c.parts.map(gearBody).sort();
    assert.ok(g.noCollide.some(p => p[0] === pair[0] && p[1] === pair[1]), 'the meshing gears\' bodies are a no-collide pair');
    assert.ok(g.bodies.some(b => b.role === 'robot'));
});

test('the v2 validator refuses a v1 view that disagrees with the v2 data, and unknown hubs and bodies', () => {
    const m = () => compile(BASE, CATALOG, {version: 2});
    const cases = [
        [x => { x.actuators[0].maxTorqueNm = 0.5; }, /joints\[\]\.motor: the v1 view disagrees with actuators/],
        [x => { x.actuators[0].hub = 'hub9'; }, /hub: 'hub9' is not one of the mechanism's hubs/],
        [x => { x.actuators.push({...x.actuators[0], id: 'a9'}); }, /has two actuators/],
        [x => {
            const [h1, h2] = x.joints.filter(j => j.type === 'hinge');
            x.gears = [{id: 'g0', type: 'gear', joint1: h1.id, joint2: h2.id, ratio: -1}];
        }, /gears: the v1 view disagrees with couplings/],
        [x => { x.bodies[0].role = 'furniture'; }, /role: need robot\|frame\|ground\|obstacle/],
        [x => { x.noCollide.push(['b9', 'ground']); }, /noCollide\[\d+\]/],
        [x => { x.hubs[0].body = 'nope'; }, /hubs\[hub\]\.body: unknown body 'nope'/],
        [x => { delete x.devices; }, /mechanism\.devices: not an array/]
    ];
    for (const [mutate, re] of cases) {
        const x = m();
        mutate(x);
        const problems = validateCompiledMechanism(x);
        assert.ok(problems.some(p => re.test(p)), `${re} not in ${JSON.stringify(problems)}`);
    }
});

/** Every body pose and joint state per step, under a motor command; numbers compared bit for bit. */
const run = (mechanism, steps = 200) => {
    const core = createPhysicsCore(J, mechanism, {stepHz: 1000 / STEP_MS});
    try {
        const motorised = mechanism.joints.filter(j => j.motor);
        motorised.forEach((j, i) => core.setMotor(j.id, {mode: 'velocity', radPerSec: i % 2 ? -5 : 5}));
        const out = [];
        for (let i = 0; i < steps; i++) {
            core.step(STEP_MS / 1000);
            out.push(mechanism.bodies.map(b => core.bodyPose(b.id)), mechanism.joints.map(j => (j.type === 'hinge' ? core.jointState(j.id) : null)));
        }
        return out;
    } finally {
        core.destroy();
    }
};

test('a v1 mechanism runs exactly as its upgrade and as the compiled v2 one (driving base, gear trains)', () => {
    for (const file of ['driving-base.json', ...GEARS]) {
        const model = json(`test/fixtures/bw-sim/${file}`);
        const v1 = compile(model, CATALOG);
        const lifted = upgradeMechanismV1(v1);
        assert.deepEqual(validateCompiledMechanism(lifted), [], file);
        assert.deepEqual(mechanismV1(lifted), v1, `${file}: the upgrade keeps the v1 data`);
        const v2 = compile(model, CATALOG, {version: 2});
        assert.deepEqual(lifted.couplings, v2.couplings, file);
        assert.deepEqual(lifted.noCollide, v2.noCollide, file);
        const reference = run(v1);
        assert.deepStrictEqual(run(lifted), reference, `${file}: upgraded`);
        assert.deepStrictEqual(run(v2), reference, `${file}: compiled v2`);
    }
});

test('two hubs: each motor plugs into the hub its port names, and each hub drives and counts only its own', () => {
    // The driving base with a second hub; the right motor plugs into that one (PlacedModel v2).
    const model = structuredClone(BASE);
    model.version = 2;
    model.parts.push({...structuredClone(model.parts.find(p => p.id === 'hub')), id: 'hub2', position: [0, 0, 400]});
    model.parts.find(p => p.port === 'B').port = {hub: 'hub2', port: 'A'};
    assert.deepEqual(validatePlacedModel(model, CATALOG), []);
    const m = compile(model, CATALOG, {version: 2});
    assert.deepEqual(m.hubs.map(h => h.id), ['hub', 'hub2']);
    const motorOf = id => m.joints.find(j => j.motor && m.bodies.find(b => b.id === j.body2).parts.includes(id));
    const left = m.actuators.find(a => a.joint === motorOf('motorL').id);
    const right = m.actuators.find(a => a.joint === motorOf('motorR').id);
    assert.deepEqual([left.hub, left.port, right.hub, right.port], ['hub', 'A', 'hub2', 'A']);
    // The v1 view cannot say which hub: both motors are on 'A' there.
    assert.deepEqual(mechanismV1(m).joints.filter(j => j.motor).map(j => j.motor.port), ['A', 'A']);
    // A port naming a part that is no hub is said, and plugs into the first hub.
    const wrong = structuredClone(model);
    wrong.parts.find(p => p.id === 'motorR').port = {hub: 'wheelL', port: 'B'};
    const w = compile(wrong, CATALOG, {version: 2});
    assert.ok(w.diagnostics.some(d => d.code === 'port-hub-unknown' && d.parts[0] === 'motorR'));
    assert.equal(w.actuators.find(a => a.port === 'B').hub, 'hub');

    const bindings = h => hubBindings(m, h, m.hubs.findIndex(x => x.id === h), 2).bindings.map(b => [b.port, b.hub]);
    assert.deepEqual(bindings('hub'), [['A', 'hub']]);
    assert.deepEqual(bindings('hub2'), [['A', 'hub2']]);

    const core = createPhysicsCore(J, m, {stepHz: 1000 / STEP_MS});
    const hubs = m.hubs.map(h => ({hub: new TwoPortTestHub({id: h.id}), body: h.body}));
    const bridge = new SimHubBridge({hubs, core, mechanism: m});
    try {
        const [one, two] = hubs.map(h => h.hub);
        assert.deepEqual([one.bound, two.bound], [['A'], ['A']]);
        const angle0 = new Map([left, right].map(a => [a.joint, core.jointState(a.joint).angle]));
        const start = core.bodyPose(m.hubs[0].body).position;
        one.setOutput('A', -1);
        two.setOutput('A', 1);
        for (let t = 0; t < 1000; t += 50) bridge.tick(50);
        const turned = a => core.jointState(a.joint).angle - angle0.get(a.joint);
        // Each hub counted exactly its own motor's measured rotation.
        assert.ok(Math.abs(one.counts.A - turned(left)) < 1e-9, `hub: ${one.counts.A} vs ${turned(left)}`);
        assert.ok(Math.abs(two.counts.A - turned(right)) < 1e-9, `hub2: ${two.counts.A} vs ${turned(right)}`);
        assert.ok(turned(left) < -1 && turned(right) > 1, `both wheels turned: ${turned(left)}, ${turned(right)}`);
        const end = core.bodyPose(m.hubs[0].body).position;
        assert.ok(start[2] - end[2] > 0.05, `the base drove forward (−z): ${start[2] - end[2]} m`);
        assert.equal(one.steps, two.steps, 'both hubs were advanced every step');
    } finally {
        bridge.dispose();
        core.destroy();
    }
});

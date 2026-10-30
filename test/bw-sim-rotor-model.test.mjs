// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// The per-model rotor treatment (#1494). By default a motor's reflected rotor inertia Jr is added
// about the hinge axis to both hinge bodies (jolt-core.js setRotorInertia, 'legacy'). A model that
// declares `0 !BW ROTOR_INERTIA native` once in its main section uses the engine's relative hinge rotor
// instead: kinetic energy ½·Jr·(ω2 − ω1)², bare body inertia unchanged. Mirrors #1460's
// MOTOR_DIRECTION setting: parsed, validated, kept through Build edits, undo, save and reopen;
// invalid or repeated declarations refuse simulation; embedded submodels do not override it.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {compile} from '../overlay/scratch-gui/src/lib/bw-sim/mech/compile.js';
import {parseModel, serializeModel} from '../overlay/scratch-gui/src/lib/bw-sim/model/ldraw-model.js';
import {createEditor} from '../overlay/scratch-gui/src/lib/bw-sim/editor/editor-state.js';
import {catalogFrom, prepareModel} from '../overlay/scratch-gui/src/lib/bw-sim/sim-session.js';
import {loadJolt, createPhysicsCore} from '../overlay/scratch-gui/src/lib/bw-sim/physics/jolt-core.js';
import {attachMotor} from '../overlay/scratch-gui/src/lib/bw-sim/physics/actuators.js';
import {SPIKE_MEDIUM_ANGULAR} from '../overlay/scratch-gui/src/lib/bw-sim/devices/dc-motors.js';
import {runRobotLabProgram} from './helpers/robot-lab-direct-vm.mjs';
// Extensions loaded before the run's fake clock install real timers; clear them so node:test exits.
import {clearStrayTimers} from './helpers/bw-vm.mjs';

const PARTS = JSON.parse(readFileSync(new URL('../overlay/scratch-gui/src/lib/bw-sim/part-meta/parts.json', import.meta.url)));
const CATALOG = new Map(PARTS.parts.map(p => [p.part, p]));
const SIM = 'overlay/scratch-gui/static/sim-lab/';
const read = file => readFileSync(new URL('../' + file, import.meta.url), 'utf8');
const I3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
const AX = [0, 1, 0, 1, 0, 0, 0, 0, -1];
const FLAT = [0, 0, 1, 0, 1, 0, -1, 0, 0];

/** A SPIKE medium motor turning an axle in a beam pinned under the housing (as in bw-sim-motor-direction-compat). */
const model = (rotor = null) => ({version: 1, ...(rotor === null ? {} : {rotor}), parts: [
    {id: 'm', part: '54696p01.dat', position: [0, 0, 0], rotation: I3, port: 'A'},
    {id: 'axle', part: '3707.dat', position: [0, 0, 0], rotation: AX},
    {id: 'beam', part: '32524.dat', position: [0, 40, 0], rotation: FLAT},
    {id: 'p1', part: '2780.dat', position: [20, 30, 0], rotation: AX},
    {id: 'p2', part: '2780.dat', position: [-20, 30, 0], rotation: AX},
]});

test('only an opted-in model carries the setting into its mechanism; unflagged equals explicit legacy', {timeout: 60000}, () => {
    const plain = compile(model(), CATALOG, {ground: false});
    assert.equal('rotor' in plain, false);
    assert.deepEqual(compile(model('legacy'), CATALOG, {ground: false}), plain);
    const native = compile(model('native'), CATALOG, {ground: false});
    assert.equal(native.rotor, 'native');
    assert.deepEqual({...native, rotor: undefined}, {...plain, rotor: undefined});
    assert.doesNotMatch(serializeModel(model()), /!BW ROTOR_INERTIA/, 'saving an old model does not opt it in');
    assert.throws(() => compile(model('typo'), CATALOG), /rotor/);
});

test('both explicit modes survive LDraw save/reopen, a Build edit and undo', {timeout: 60000}, () => {
    for (const rotor of ['legacy', 'native']) {
        const text = serializeModel(model(rotor));
        assert.match(text, new RegExp(`0 !BW ROTOR_INERTIA ${rotor}`));
        const {model: reopened, refusals} = parseModel(text, {catalog: CATALOG});
        assert.deepEqual(refusals, []);
        assert.equal(reopened.rotor, rotor);
        const editor = createEditor({model: reopened, catalog: CATALOG});
        assert.equal(editor.model.rotor, rotor);
        editor.apply({type: 'recolor', id: 'beam', color: 4});
        assert.equal(editor.model.rotor, rotor, 'an edit keeps the model-wide setting');
        editor.undo();
        assert.equal(editor.model.rotor, rotor, 'undo keeps it too');
        assert.equal(parseModel(serializeModel(editor.model), {catalog: CATALOG}).model.rotor, rotor);
        assert.equal(compile(reopened, CATALOG, {ground: false}).rotor, rotor === 'native' ? 'native' : undefined);
    }
});

test('invalid and duplicate rotor declarations refuse simulation rather than falling back', {timeout: 60000}, () => {
    const body = serializeModel(model());
    for (const header of ['0 !BW ROTOR_INERTIA typo', '0 !BW ROTOR_INERTIA', '0 !BW ROTOR_INERTIA native\n0 !BW ROTOR_INERTIA legacy',
        '0 !BW ROTOR_INERTIA native\n0 !BW ROTOR_INERTIA native']) {
        const result = prepareModel(`${header}\n${body}`, CATALOG);
        assert.equal(result.mechanism, null);
        assert.ok(result.issues.some(i => i.code === 'bad-rotor-model' && i.severity === 'error'));
        assert.throws(() => serializeModel(result.model), /rotor/);
    }
});

test('an embedded submodel cannot change the main model rotor setting', {timeout: 60000}, () => {
    const child = serializeModel(model());
    for (const rotor of [null, 'legacy']) {
        const text = '0 FILE main.ldr\n' + (rotor ? `0 !BW ROTOR_INERTIA ${rotor}\n` : '') +
            '1 16 0 0 0 1 0 0 0 1 0 0 0 1 child.ldr\n0 FILE child.ldr\n0 !BW ROTOR_INERTIA native\n' + child;
        const parsed = parseModel(text, {catalog: CATALOG});
        assert.deepEqual(parsed.refusals, []);
        assert.equal(parsed.model.rotor, rotor || undefined);
        assert.equal(parsed.model.parts.length, 5);
    }
});

test('legacy adds Jr about the axis to both moving bodies; native leaves bare inertia unchanged', {timeout: 60000}, async () => {
    const J = await loadJolt();
    const disc = (id, y) => ({id, motion: 'dynamic', position: [0, y, 0], rotation: [0, 0, 0, 1], massKg: 0.2,
        colliders: [{shape: 'cylinder', radius: 0.05, halfHeight: 0.002}], parts: []});
    const scene = rotor => ({version: 1, ...(rotor ? {rotor} : {}), gravity: [0, 0, 0], bodies: [disc('a', 0), disc('b', 0.05)],
        joints: [{id: 'j', type: 'hinge', body1: 'a', body2: 'b', point: [0, 0.025, 0], axis: [0, 1, 0],
            motor: {port: 'A', maxTorqueNm: 0.1, maxSpeedRadPerSec: 20, deviceId: 48}}], gears: [], diagnostics: []});
    const Iyy = (core, id) => core.bodyDynamics(id).inertiaKgM2[1][1];
    const Jr = SPIKE_MEDIUM_ANGULAR.motor.rotorInertiaKgM2;
    for (const rotor of [null, 'native']) {
        const core = createPhysicsCore(J, scene(rotor), {stepHz: 200});
        try {
            const bare = ['a', 'b'].map(id => Iyy(core, id));
            attachMotor(core, 'j', SPIKE_MEDIUM_ANGULAR);
            const after = ['a', 'b'].map(id => Iyy(core, id));
            for (let i = 0; i < 2; i++) {
                const expected = rotor === 'native' ? bare[i] : bare[i] + Jr;
                assert.ok(Math.abs(after[i] - expected) <= 1e-6 * expected, // Jolt keeps inverse inertia in float32
                 `${rotor || 'legacy'} body ${i}: ${after[i]} vs ${expected}`);
            }
        } finally { core.destroy(); }
    }
});

test('Afterturn (native): platform turn per reaction-wheel turn is -Iw/J at the saved pose (#1494)', {timeout: 600000}, async t => {
    // Afterturn's yaw bearing j0 (vertical through x = -0.032 m) carries every body but the base; motor A
    // turns the reaction rotor b3 about the same axis. With no external yaw torque, I_P·ψ' + Iw·(ψ' + α') = 0
    // (the relative rotor carries no yaw momentum), so dψ/dα = -Iw/J, J the locked moment of the whole platform.
    // Moments from the compiled bodies (bare, as the native rotor keeps them), parallel axis included.
    const modelText = read(SIM + 'models/afterturn.ldr');
    const p = prepareModel(modelText, catalogFrom(PARTS), {mat: 'plain'});
    assert.equal(p.mechanism.rotor, 'native', 'Afterturn opts in');
    const yawJoint = p.mechanism.joints.find(j => j.id === 'j0'), motorA = p.mechanism.actuators.find(a => a.port === 'A');
    const wheelJoint = p.mechanism.joints.find(j => j.id === motorA.joint);
    const base = yawJoint.body1 === wheelJoint.body1 ? yawJoint.body2 : yawJoint.body1;
    const core = createPhysicsCore(await loadJolt(), p.mechanism, {stepHz: 200});
    let Iw, Jlocked;
    try {
        const o = yawJoint.point;
        const yawMoment = id => {
            core.setBodyVelocity(id, [0, 0, 0], [0, 1, 0]);
            const own = core.bodyAngularMomentum(id)[1];
            const d = core.bodyDynamics(id), com = d.centerOfMassWorld, m = d.solverMassKg;
            core.setBodyVelocity(id, [0, 0, 0], [0, 0, 0]);
            return own + m * ((com[0] - o[0]) ** 2 + (com[2] - o[2]) ** 2);
        };
        const platform = p.mechanism.bodies.filter(b => b.motion === 'dynamic' && b.id !== base).map(b => b.id);
        Jlocked = platform.reduce((s, id) => s + yawMoment(id), 0);
        Iw = yawMoment(wheelJoint.body2);
    } finally { core.destroy(); }
    const law = Iw / Jlocked;
    let r;
    try { r = await runRobotLabProgram(read(SIM + 'programs/afterturn.bw'), {modelText, timeLimitMs: 70000}); }
    finally { clearStrayTimers(); }
    const rows = r.track.map(f => ({yaw: f.joints[yawJoint.id].angle, A: f.joints[wheelJoint.id].angle, B: f.joints.j1.angle}));
    // Reaction strokes at the saved mass radii (motor B home), from rest to rest.
    const strokes = [];
    for (let i = 1, start = null; i < rows.length; i++) {
        const moving = Math.abs(rows[i].A - rows[i - 1].A) > 1e-3 && Math.abs(rows[i].B - rows[i - 1].B) < 1e-4;
        if (moving && start === null) start = i - 1;
        if (!moving && start !== null) {
            if (Math.abs(rows[start].B) < 0.01 && Math.abs(rows[i - 1].A - rows[start].A) > 10) strokes.push([rows[start], rows[i - 1]]);
            start = null;
        }
    }
    t.diagnostic(JSON.stringify({Iw, Jlocked, law, legacyBothBodies: (Iw + SPIKE_MEDIUM_ANGULAR.motor.rotorInertiaKgM2) /
        (Jlocked + 2 * SPIKE_MEDIUM_ANGULAR.motor.rotorInertiaKgM2), strokes: strokes.map(([a, b]) => -(b.yaw - a.yaw) / (b.A - a.A))}));
    assert.equal(strokes.length, 2, 'the cycle and its inverse each turn the wheel 900° at the saved radii');
    for (const [a, b] of strokes) {
        const ratio = -(b.yaw - a.yaw) / (b.A - a.A);
        // The 1 % bound of the analytic free-pair control (bw-sim-rotor-inertia.test.mjs).
        assert.ok(Math.abs(ratio - law) <= 0.01 * law, `platform/wheel ${ratio} vs Iw/J ${law}`);
    }
});

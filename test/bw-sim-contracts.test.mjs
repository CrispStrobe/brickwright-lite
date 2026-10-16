// SPDX-License-Identifier: BSD-3-Clause
/**
 * The Sim Lab contracts (overlay/scratch-gui/src/lib/bw-sim/contracts.js):
 * a minimal valid instance of each passes, and each class of malformation is
 * refused by name — the compiler and the physics core rely on these
 * validators at their boundaries instead of re-checking.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
    LDU_M, pitchRadiusLdu, lduToWorld, dirToWorld, det3,
    validatePartMeta, validatePlacedModel, validateCompiledMechanism
} from '../overlay/scratch-gui/src/lib/bw-sim/contracts.js';

const I3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

const beam3 = () => ({
    part: '32523.dat', name: 'Technic beam 3', category: 'beam', massGrams: 1.1,
    connectors: [-20, 0, 20].map((x, i) => ({id: `h${i}`, type: 'pinhole', position: [x, 0, 0], axis: [0, 0, 1], length: 20})),
    colliders: [{shape: 'box', halfExtents: [30, 10, 10]}]
});

const gear8 = () => ({
    part: '3647.dat', name: 'Technic gear 8 tooth', category: 'gear', massGrams: 0.3,
    connectors: [{id: 'c', type: 'axlehole', position: [0, 0, 0], axis: [0, 0, 1], length: 16}],
    colliders: [{shape: 'cylinder', radius: 10, halfHeight: 8, rotation: [Math.SQRT1_2, 0, 0, Math.SQRT1_2]}],
    gear: {type: 'spur', teeth: 8, axis: [0, 0, 1], center: [0, 0, 0]}
});

const mechanism = () => ({
    version: 1, gravity: [0, -9.81, 0],
    bodies: [
        {id: 'ground', motion: 'static', position: [0, -0.01, 0], rotation: [0, 0, 0, 1], massKg: 0, colliders: [{shape: 'box', halfExtents: [1, 0.01, 1]}], parts: []},
        {id: 'frame', motion: 'dynamic', position: [0, 0.05, 0], rotation: [0, 0, 0, 1], massKg: 0.2, colliders: [{shape: 'box', halfExtents: [0.05, 0.01, 0.01]}], parts: ['p1']},
        {id: 'g8', motion: 'dynamic', position: [0, 0.05, 0], rotation: [0, 0, 0, 1], massKg: 0.01, colliders: [{shape: 'cylinder', radius: 0.004, halfHeight: 0.002}], parts: ['p2']},
        {id: 'g24', motion: 'dynamic', position: [0.016, 0.05, 0], rotation: [0, 0, 0, 1], massKg: 0.02, colliders: [{shape: 'cylinder', radius: 0.012, halfHeight: 0.002}], parts: ['p3']}
    ],
    joints: [
        {id: 'j1', type: 'hinge', body1: 'frame', body2: 'g8', point: [0, 0.05, 0], axis: [0, 1, 0], motor: {port: 'A', maxTorqueNm: 0.18, maxSpeedRadPerSec: 19.4}},
        {id: 'j2', type: 'hinge', body1: 'frame', body2: 'g24', point: [0.016, 0.05, 0], axis: [0, 1, 0]}
    ],
    gears: [{id: 'g1', type: 'gear', joint1: 'j1', joint2: 'j2', ratio: -1 / 3}],
    diagnostics: []
});

test('units: LDU, pitch radius, frame change', () => {
    assert.equal(LDU_M, 0.0004);
    assert.equal(pitchRadiusLdu(8) + pitchRadiusLdu(24), 40, '8T and 24T mesh two holes apart');
    assert.deepEqual(lduToWorld([10, -20, 30]).map(v => +v.toFixed(6)), [0.004, 0.008, -0.012], 'LDraw -y up becomes world +y up');
    assert.deepEqual(dirToWorld([0, -1, 0]), [0, 1, 0]);
    // The frame change is a proper rotation: it preserves cross products.
    const a = [1, 0, 0], b = [0, 0, 1];
    const cross = (u, v) => [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    assert.deepEqual(dirToWorld(cross(a, b)).map(v => v + 0), cross(dirToWorld(a), dirToWorld(b)).map(v => v + 0));
    assert.equal(det3(I3), 1);
});

test('PartMeta: valid parts pass', () => {
    assert.deepEqual(validatePartMeta(beam3()), []);
    assert.deepEqual(validatePartMeta(gear8()), []);
});

test('PartMeta: each malformation is named', () => {
    const cases = [
        [m => { m.part = '32523'; }, /\.part: need an LDraw file name/],
        [m => { m.massGrams = 0; }, /massGrams/],
        [m => { m.connectors[0].type = 'hole'; }, /\.type: 'hole' is not one of/],
        [m => { m.connectors[0].type = 'ballsocket'; }, null],
        [m => { m.connectors[0].axis = [0, 0, 2]; }, /axis: not a unit vector/],
        [m => { m.connectors[1].id = 'h0'; }, /duplicate id 'h0'/],
        [m => { m.colliders = []; }, /need at least one collider/],
        [m => { m.colliders[0] = {shape: 'cone', radius: 1}; }, /'cone' is not box\|cylinder\|sphere/],
        [m => { m.motor = {output: ['nope'], maxTorqueNm: 0.1, maxSpeedDegPerSec: 600}; }, /unknown connector 'nope'/],
        [m => { m.gear = {type: 'spur', teeth: 7.5, axis: [0, 0, 1], center: [0, 0, 0]}; }, /teeth: need a positive integer/]
    ];
    for (const [mutate, re] of cases) {
        const m = beam3();
        mutate(m);
        const problems = validatePartMeta(m);
        if (re === null) assert.deepEqual(problems, []);
        else assert.ok(problems.some(p => re.test(p)), `${re} not in ${JSON.stringify(problems)}`);
    }
});

test('PlacedModel: proper rotations only, catalog membership, ports', () => {
    const model = {version: 1, parts: [{id: 'p1', part: '32523.dat', position: [0, 0, 0], rotation: I3, port: 'A'}]};
    assert.deepEqual(validatePlacedModel(model, {'32523.dat': beam3()}), []);
    assert.deepEqual(validatePlacedModel(model, new Map([['32523.dat', beam3()]])), []);
    assert.match(validatePlacedModel(model, {}).join('\n'), /not in the part catalog/);
    const mirrored = structuredClone(model);
    mirrored.parts[0].rotation = [-1, 0, 0, 0, 1, 0, 0, 0, 1];
    assert.match(validatePlacedModel(mirrored).join('\n'), /not a proper rotation/);
    const badPort = structuredClone(model);
    badPort.parts[0].port = 'G';
    assert.match(validatePlacedModel(badPort).join('\n'), /port: 'G'/);
});

test('CompiledMechanism: valid passes, references are checked', () => {
    assert.deepEqual(validateCompiledMechanism(mechanism()), []);
    const cases = [
        [m => { m.joints[0].body2 = 'nope'; }, /body2: unknown body 'nope'/],
        [m => { m.joints[1].body2 = 'world'; }, null],
        [m => { m.joints[0].axis = [0, 2, 0]; }, /not a unit vector/],
        [m => { m.gears[0].joint2 = 'j9'; }, /unknown joint 'j9'/],
        [m => { m.gears[0].ratio = 0; }, /ratio: need a non-zero number/],
        [m => { m.bodies[1].massKg = 0; }, /dynamic body needs a positive mass/],
        [m => { m.bodies[1].rotation = [0, 0, 0, 2]; }, /not a unit quaternion/],
        [m => { m.joints[0].motor.port = 'Z'; }, /motor.port: 'Z'/],
        [m => { m.joints.push({id: 's', type: 'slider', body1: 'frame', body2: 'g8', point: [0, 0, 0], axis: [1, 0, 0]}); m.gears[0].joint2 = 's'; }, /is a slider, need a hinge/],
        [m => { delete m.diagnostics; }, /diagnostics: not an array/],
        [m => { m.joints.push({id: 'c', type: 'ball', body1: 'frame', body2: 'g24', point: [0, 0, 0]}); }, null],
        [m => { m.joints.push({id: 'c', type: 'ball', body1: 'frame', body2: 'g24', point: [0, 0, 0]}); m.gears[0].joint2 = 'c'; }, /is a ball, need a hinge/],
        [m => { m.joints[1].type = 'weld'; }, /need 'hinge', 'slider' or 'ball'/]
    ];
    for (const [mutate, re] of cases) {
        const m = mechanism();
        mutate(m);
        const problems = validateCompiledMechanism(m);
        if (re === null) assert.deepEqual(problems, []);
        else assert.ok(problems.some(p => re.test(p)), `${re} not in ${JSON.stringify(problems)}`);
    }
});

test('validators never throw on garbage', () => {
    for (const junk of [null, undefined, 3, 'x', [], {}, {connectors: 'x'}, {bodies: [null], joints: [null], gears: [null], diagnostics: [null], version: 1, gravity: [0, 0, 0]}]) {
        assert.ok(Array.isArray(validatePartMeta(junk)));
        assert.ok(Array.isArray(validatePlacedModel(junk)));
        assert.ok(Array.isArray(validateCompiledMechanism(junk)));
    }
});

// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// Owner decision D2 — everything collides (slice R3 (b)/(d) of
// docs/ROBOT-LAB-ARCHITECTURE.md; overlay/scratch-gui/src/lib/bw-sim/physics/jolt-core.js).
// Robot parts collide with loads and with each other; the body pairs of the mechanism's
// `noCollide` list (joined by a joint or coupling, or seated in each other's holes:
// contracts.js noCollidePairs) never do. The filter is a Jolt GroupFilterTable.
//
//   (d) a dynamic 50 g box resting on a beam carried by a motorised hinge is lifted with it:
//       it rises by d·sinθ + h·(cosθ − 1) (its centre at (d, h) in the beam's frame) and does
//       not slide along the beam;
//   - a two-link arm's forearm swung down onto the chassis (not joined to it) stops at the
//     first-touch angle derived from the geometry, and a contact chassis–forearm is recorded;
//     with the pair put in noCollide it swings on through the chassis;
//   - the compiled driving base and 8–24 gear train: a wheel's axle in its beam's hole, the
//     motors' housing and output, the castor ball in its socket and the meshing gears make
//     no contact — while the same mechanisms with an empty noCollide list DO touch on each of
//     those pairs (so the filter, not luck, keeps them apart);
//   - noCollide is built from the joints, couplings and the connector edges between bodies.

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadJolt, createPhysicsCore} from '../overlay/scratch-gui/src/lib/bw-sim/physics/jolt-core.js';
import {prepareModel, catalogFrom} from '../overlay/scratch-gui/src/lib/bw-sim/sim-session.js';
import {compile} from '../overlay/scratch-gui/src/lib/bw-sim/mech/compile.js';
import {upgradeMechanismV1, noCollidePairs} from '../overlay/scratch-gui/src/lib/bw-sim/contracts.js';

const J = await loadJolt();
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CATALOG = catalogFrom(JSON.parse(readFileSync(path.join(ROOT, 'overlay/scratch-gui/src/lib/bw-sim/part-meta/parts.json'), 'utf8')));
const STEP_HZ = 200;
const DT = 1 / STEP_HZ;
const G = 9.81;
const DEG = Math.PI / 180;

const ground = () => ({id: 'ground', motion: 'static', position: [0, -0.01, 0], rotation: [0, 0, 0, 1], massKg: 0,
    colliders: [{shape: 'box', halfExtents: [1, 0.01, 1]}], parts: [], friction: 0.8});

test('(d) a dynamic 50 g box resting on a beam carried by a hinge is lifted with it', t => {
    const Y = 0.05; // hinge height
    const BEAM_HALF = 0.004;
    const BOX_HALF = 0.01;
    const D = 0.06; // box centre along the beam
    const mech = {
        version: 1, gravity: [0, -G, 0],
        bodies: [
            ground(),
            {id: 'frame', motion: 'static', position: [-0.01, Y, 0], rotation: [0, 0, 0, 1], massKg: 0,
                colliders: [{shape: 'box', halfExtents: [0.006, 0.006, 0.006]}], parts: ['frame']},
            {id: 'beam', motion: 'dynamic', position: [0.05, Y, 0], rotation: [0, 0, 0, 1], massKg: 0.01,
                colliders: [{shape: 'box', halfExtents: [0.05, BEAM_HALF, 0.012]}], parts: ['beam'], friction: 0.8},
            {id: 'box', motion: 'dynamic', position: [D, Y + BEAM_HALF + BOX_HALF, 0], rotation: [0, 0, 0, 1], massKg: 0.05,
                colliders: [{shape: 'box', halfExtents: [BOX_HALF, BOX_HALF, BOX_HALF]}], parts: [], friction: 0.8}
        ],
        joints: [{id: 'h', type: 'hinge', body1: 'frame', body2: 'beam', point: [0, Y, 0], axis: [0, 0, 1],
            motor: {port: 'A', maxTorqueNm: 0.38, maxSpeedRadPerSec: 1050 * DEG}}],
        gears: [], diagnostics: []
    };
    const core = createPhysicsCore(J, mech, {stepHz: STEP_HZ, recordContacts: true});
    core.setMotor('h', {mode: 'hold'});
    for (let i = 0; i < STEP_HZ / 2; i++) core.step(DT);
    const rest = core.bodyPose('box').position;
    // Raise the beam by 20° (tan 20° = 0.36 < friction 0.8: the box must stay put on it).
    core.setMotor('h', {mode: 'position', rad: 20 * DEG, radPerSec: 0.5});
    for (let i = 0; i < 2 * STEP_HZ; i++) core.step(DT);
    const theta = core.jointState('h').angle;
    const box = core.bodyPose('box').position;
    const contacts = core.contactPairs().pairs;
    core.destroy();
    // The box's centre in the beam's frame (origin at the hinge): (dx, h) at rest.
    const dx = rest[0];
    const h = rest[1] - Y;
    const riseExpected = dx * Math.sin(theta) + h * (Math.cos(theta) - 1);
    const rise = box[1] - rest[1];
    // Along the beam: the box's centre projected on the beam's direction, before and after.
    const along = (box[0]) * Math.cos(theta) + (box[1] - Y) * Math.sin(theta);
    t.diagnostic(`at rest the box sits ${((rest[1] - (Y + BEAM_HALF + BOX_HALF)) * 1000).toFixed(3)} mm off its start; beam at ${(theta / DEG).toFixed(2)}°: ` +
        `box rose ${(rise * 1000).toFixed(2)} mm, d·sinθ + h·(cosθ − 1) = ${(riseExpected * 1000).toFixed(2)} mm; slid ${((along - dx) * 1000).toFixed(3)} mm along the beam`);
    assert.ok(Math.abs(rest[1] - (Y + BEAM_HALF + BOX_HALF)) < 0.0005, `the box rests on the beam (robot–load contact): y ${rest[1]}`);
    assert.ok(contacts['beam|box'] > 0, 'beam–box contact recorded');
    assert.ok(Math.abs(theta - 20 * DEG) < 0.5 * DEG, `the beam turned to 20°: ${theta / DEG}`);
    assert.ok(Math.abs(rise - riseExpected) < 0.001, `the box rose with the beam: ${rise} vs ${riseExpected}`);
    assert.ok(Math.abs(along - dx) < 0.001, `the box did not slide along the beam: ${along - dx}`);
});

/**
 * A chassis (300 g, on the ground), a post on a held hinge, and a forearm hinged to the post's
 * top that swings down. The forearm is joined to the post, the post to the chassis: the
 * forearm and the chassis are separate robot bodies.
 */
const armMech = () => ({
    version: 1, gravity: [0, -G, 0],
    bodies: [
        ground(),
        {id: 'chassis', motion: 'dynamic', position: [0, 0.01, 0], rotation: [0, 0, 0, 1], massKg: 0.3,
            colliders: [{shape: 'box', halfExtents: [0.06, 0.01, 0.03]}], parts: ['chassis'], friction: 0.8},
        {id: 'post', motion: 'dynamic', position: [0, 0.045, 0], rotation: [0, 0, 0, 1], massKg: 0.01,
            colliders: [{shape: 'box', halfExtents: [0.004, 0.02, 0.004]}], parts: ['post']},
        {id: 'forearm', motion: 'dynamic', position: [0.04, 0.06, 0], rotation: [0, 0, 0, 1], massKg: 0.01,
            colliders: [{shape: 'box', halfExtents: [0.04, 0.004, 0.004]}], parts: ['forearm']}
    ],
    joints: [
        {id: 'shoulder', type: 'hinge', body1: 'chassis', body2: 'post', point: [0, 0.025, 0], axis: [0, 0, 1],
            motor: {port: 'A', maxTorqueNm: 0.38, maxSpeedRadPerSec: 1050 * DEG}},
        {id: 'elbow', type: 'hinge', body1: 'post', body2: 'forearm', point: [0, 0.06, 0], axis: [0, 0, 1],
            motor: {port: 'B', maxTorqueNm: 0.05, maxSpeedRadPerSec: 1110 * DEG}}
    ],
    gears: [], diagnostics: []
});

/** Swings the forearm down for 1.5 s at 1 rad/s; returns how far it turned (rad, positive down) and the contacts. */
const swing = mech => {
    const core = createPhysicsCore(J, mech, {stepHz: STEP_HZ, recordContacts: true});
    core.setMotor('shoulder', {mode: 'hold'});
    core.setMotor('elbow', {mode: 'velocity', radPerSec: -1});
    for (let i = 0; i < 1.5 * STEP_HZ; i++) core.step(DT);
    const down = -core.jointState('elbow').angle;
    const {pairs} = core.contactPairs();
    core.destroy();
    return {down, pairs};
};

test('two separate robot bodies collide: a forearm swung onto the chassis stops at first touch', t => {
    // First touch: the chassis' top edge (0.06, 0.02) meets the forearm's lower face, 4 mm
    // under its centre line through the elbow (0, 0.06): with the edge at p = (0.06, −0.04)
    // from the elbow and the forearm turned down by θ, u = (cosθ, −sinθ), the edge is 4 mm
    // below the line when u × p = −0.04·cosθ + 0.06·sinθ = −0.004.
    const R = Math.hypot(0.06, 0.04);
    const touch = Math.asin(-0.004 / R) + Math.atan2(0.04, 0.06);
    const blocked = swing(armMech());
    const m2 = upgradeMechanismV1(armMech());
    const free = swing({...m2, noCollide: [...m2.noCollide, ['chassis', 'forearm']].sort((p, q) => p[0].localeCompare(q[0]) || p[1].localeCompare(q[1]))});
    t.diagnostic(`first touch ${(touch / DEG).toFixed(2)}°: stopped at ${(blocked.down / DEG).toFixed(2)}°; with the pair in noCollide it swung to ${(free.down / DEG).toFixed(1)}°`);
    assert.ok(blocked.pairs['chassis|forearm'] > 0, 'a chassis–forearm contact');
    assert.ok(Math.abs(blocked.down - touch) < 1.5 * DEG, `stopped at first touch: ${blocked.down / DEG}° vs ${touch / DEG}°`);
    assert.ok(!free.pairs['chassis|forearm'] && free.down > touch + 5 * DEG, `filtered, it passes through the chassis (until the floor stops it): ${free.down / DEG}°`);
    assert.ok(!blocked.pairs['chassis|post'] && !blocked.pairs['forearm|post'], 'the joined pairs never touch');
});

test('an axle in its hole, a motor\'s housing and output, the castor ball in its socket and meshing gears make no contact — the filter keeps them apart', t => {
    const base = prepareModel(readFileSync(path.join(ROOT, 'overlay/scratch-gui/static/sim-lab/models/driving-base.ldr'), 'latin1'), CATALOG).mechanism;
    const train = compile(JSON.parse(readFileSync(path.join(ROOT, 'test/fixtures/bw-sim/gears/8-24.json'), 'utf8')), CATALOG, {version: 2});
    const contactsOf = m => {
        const core = createPhysicsCore(J, m, {stepHz: STEP_HZ, recordContacts: true});
        for (let i = 0; i < STEP_HZ; i++) core.step(DT);
        const {pairs} = core.contactPairs();
        core.destroy();
        return pairs;
    };
    const bodyOf = (m, part) => m.bodies.find(b => b.parts.includes(part)).id;
    const pair = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);
    const cases = [
        ['the left wheel\'s axle in the chassis and the left motor\'s output in its housing', base, pair(bodyOf(base, 'wheelL'), bodyOf(base, 'frontBeam'))],
        ['the right wheel\'s axle and motor', base, pair(bodyOf(base, 'wheelR'), bodyOf(base, 'frontBeam'))],
        ['the castor ball in its socket', base, pair(bodyOf(base, 'ball'), bodyOf(base, 'castor'))],
        ['the 8T meshing the 24T', train, pair(bodyOf(train, 'g8'), bodyOf(train, 'g24'))],
        ['the 24T\'s axle in the beam\'s hole', train, pair(bodyOf(train, 'g24'), bodyOf(train, 'beam'))]
    ];
    const filtered = new Map([[base, contactsOf(base)], [train, contactsOf(train)]]);
    const unfiltered = new Map([[base, contactsOf({...base, noCollide: []})], [train, contactsOf({...train, noCollide: []})]]);
    for (const [what, m, key] of cases) {
        t.diagnostic(`${what} (${key}): ${filtered.get(m)[key] || 0} contacts filtered, ${unfiltered.get(m)[key] || 0} unfiltered`);
        assert.ok(m.noCollide.some(p => p.join('|') === key), `${what}: in noCollide`);
        assert.equal(filtered.get(m)[key], undefined, `${what}: no contact`);
        assert.ok(unfiltered.get(m)[key] > 0, `${what}: they do overlap, so without the filter they would touch`);
    }
});

test('noCollide holds the joints, the couplings and the connector edges between bodies', () => {
    const joints = [{id: 'j0', type: 'hinge', body1: 'b2', body2: 'b0'}, {id: 'j1', type: 'hinge', body1: 'b2', body2: 'b1'},
        {id: 'j2', type: 'slider', body1: 'b2', body2: 'b3'}];
    const couplings = [{id: 'g', kind: 'gear', joint1: 'j0', joint2: 'j1', ratio: -1 / 3},
        {id: 'r', kind: 'rackAndPinion', hingeJoint: 'j1', sliderJoint: 'j2', ratio: 0.004}];
    assert.deepEqual(noCollidePairs(joints, couplings, null, [['b4', 'b0'], ['b0', 'b4']]),
        [['b0', 'b1'], ['b0', 'b2'], ['b0', 'b4'], ['b1', 'b2'], ['b1', 'b3'], ['b2', 'b3']]);
    // The compiler passes its connector edges: on the shipped base they are the joints' pairs.
    const base = prepareModel(readFileSync(path.join(ROOT, 'overlay/scratch-gui/static/sim-lab/models/driving-base.ldr'), 'latin1'), CATALOG).mechanism;
    assert.deepEqual(base.noCollide, noCollidePairs(base.joints, base.couplings));
});

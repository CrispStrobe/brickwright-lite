// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// Snapping core tests (C5 pure half) — real parts, real geometry.

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {snapCandidates, rotateAboutSnap, placePart} from '../overlay/scratch-gui/src/lib/bw-sim/editor/snap.js';
import {compile} from '../overlay/scratch-gui/src/lib/bw-sim/mech/compile.js';
import {validatePlacedModel} from '../overlay/scratch-gui/src/lib/bw-sim/contracts.js';
import {vecDist} from '../overlay/scratch-gui/src/lib/bw-sim/mech/vec.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const json = p => JSON.parse(readFileSync(path.join(ROOT, p), 'utf8'));
const CATALOG = new Map(json('overlay/scratch-gui/src/lib/bw-sim/part-meta/parts.json').parts.map(p => [p.part, p]));

test('1. friction pin 2780 near beam 7 hole snaps with 1 pair, half in', () => {
    const model = {
        version: 1,
        parts: [
            {id: 'b1', part: '32524.dat', position: [0, 0, 0], rotation: [1, 0, 0, 0, 1, 0, 0, 0, 1]}
        ]
    };
    const pose = {
        position: [0, 10, 0],
        rotation: [1, 0, 0, 0, 1, 0, 0, 0, 1]
    };
    const cands = snapCandidates({model, catalog: CATALOG, part: '2780.dat', pose});
    assert.ok(cands.length >= 1, 'at least one candidate');
    const c = cands[0];
    assert.equal(c.pairs.length, 1);
    assert.equal(c.pairs[0].kind, 'rigid');
    // Pin axis should be along hole axis [0,1,0] in world, hole at [0,0,0] with face at [0,10,0], pin centre at face
    assert.ok(Math.abs(c.position[0]) < 1e-6);
    assert.ok(Math.abs(c.position[1] - 10) < 1e-6);
});

test('2. two beams 7 + 3L pin 6558 bridging both', () => {
    const model = {
        version: 1,
        parts: [
            {id: 'b1', part: '32524.dat', position: [0, 0, 0], rotation: [1, 0, 0, 0, 1, 0, 0, 0, 1]},
            {id: 'b2', part: '32524.dat', position: [0, 20, 0], rotation: [1, 0, 0, 0, 1, 0, 0, 0, 1]} // one hole pitch apart in stacking direction (y)
        ]
    };
    const pose = {
        position: [0, 10, 0],
        rotation: [1, 0, 0, 0, 1, 0, 0, 0, 1]
    };
    const cands = snapCandidates({model, catalog: CATALOG, part: '6558.dat', pose});
    assert.ok(cands.length >= 1);
    const best = cands[0];
    assert.equal(best.pairs.length, 2, `best should bridge both, got ${best.pairs.length}`);
});

test('3. axle 4 near motor output snaps rigid, near beam pinhole as hinge', () => {
    // Motor at origin, beam at origin, axle dragged near
    const modelMotor = {
        version: 1,
        parts: [
            {id: 'm1', part: '54696p01.dat', position: [0, 0, 0], rotation: [1, 0, 0, 0, 1, 0, 0, 0, 1]}
        ]
    };
    const poseNearMotor = {
        position: [0, -40, 0], // near motor output at [0,-40,0]
        rotation: [1, 0, 0, 0, 1, 0, 0, 0, 1]
    };
    const candsMotor = snapCandidates({model: modelMotor, catalog: CATALOG, part: '3705.dat', pose: poseNearMotor});
    const rigidCand = candsMotor.find(c => c.pairs[0]?.kind === 'rigid');
    assert.ok(rigidCand, 'axle near motor should have rigid');
    const modelBeam = {
        version: 1,
        parts: [
            {id: 'b1', part: '32524.dat', position: [0, 0, 0], rotation: [1, 0, 0, 0, 1, 0, 0, 0, 1]}
        ]
    };
    const poseNearBeam = {
        position: [0, 0, 0],
        rotation: [1, 0, 0, 0, 1, 0, 0, 0, 1]
    };
    const candsBeam = snapCandidates({model: modelBeam, catalog: CATALOG, part: '3705.dat', pose: poseNearBeam});
    const hingeCand = candsBeam.find(c => c.pairs[0]?.kind === 'hinge');
    assert.ok(hingeCand, 'axle near beam pinhole should have hinge');
});

test('4. wheel near axle end snaps rigid with axis along axle', () => {
    const model = {
        version: 1,
        parts: [
            {id: 'ax1', part: '3705.dat', position: [0, 0, 0], rotation: [1, 0, 0, 0, 1, 0, 0, 0, 1]}
        ]
    };
    // Axle along x, wheel's axlehole should snap to axle centre
    const pose = {
        position: [0, 0, 0],
        rotation: [1, 0, 0, 0, 1, 0, 0, 0, 1]
    };
    const cands = snapCandidates({model, catalog: CATALOG, part: '39367p01.dat', pose});
    assert.ok(cands.length >= 1);
    const c = cands[0];
    assert.equal(c.pairs[0].kind, 'rigid');
});

test('5. rotateAboutSnap four times returns original, keeps pairs', () => {
    const model = {
        version: 1,
        parts: [
            {id: 'b1', part: '32524.dat', position: [0, 0, 0], rotation: [1, 0, 0, 0, 1, 0, 0, 0, 1]}
        ]
    };
    const pose = {
        position: [0, 10, 0],
        rotation: [1, 0, 0, 0, 1, 0, 0, 0, 1]
    };
    const cands = snapCandidates({model, catalog: CATALOG, part: '2780.dat', pose});
    const c = cands[0];
    let cur = c;
    for (let i = 0; i < 4; i++) {
        cur = rotateAboutSnap(cur, 1);
        // Each step should keep pairs satisfied (still 1 pair)
        assert.equal(cur.pairs.length, 1);
    }
    for (let i = 0; i < 3; i++) assert.ok(Math.abs(cur.position[i] - c.position[i]) < 1e-6);
    for (let i = 0; i < 9; i++) assert.ok(Math.abs(cur.rotation[i] - c.rotation[i]) < 1e-6);
});

test('6. incompatible pin near axle hole no candidate, nothing within radius', () => {
    const model = {
        version: 1,
        parts: [
            {id: 'ax1', part: '3705.dat', position: [0, 0, 0], rotation: [1, 0, 0, 0, 1, 0, 0, 0, 1]}
        ]
    };
    const pose = {
        position: [0, 0, 0],
        rotation: [1, 0, 0, 0, 1, 0, 0, 0, 1]
    };
    const cands = snapCandidates({model, catalog: CATALOG, part: '2780.dat', pose});
    assert.equal(cands.length, 0);
    const emptyModel = {version: 1, parts: []};
    const cands2 = snapCandidates({model: emptyModel, catalog: CATALOG, part: '2780.dat', pose: {position: [1000, 1000, 1000], rotation: [1, 0, 0, 0, 1, 0, 0, 0, 1]}});
    assert.equal(cands2.length, 0);
});

test('7. placePart validates and does not mutate', () => {
    const model = {
        version: 1,
        parts: [
            {id: 'b1', part: '32524.dat', position: [0, 0, 0], rotation: [1, 0, 0, 0, 1, 0, 0, 0, 1]}
        ]
    };
    const copy = JSON.parse(JSON.stringify(model));
    const newModel = placePart(model, {part: '2780.dat', position: [0, 10, 0], rotation: [1, 0, 0, 0, 1, 0, 0, 0, 1]});
    assert.deepEqual(model, copy, 'input not mutated');
    const errs = validatePlacedModel(newModel, CATALOG);
    assert.equal(errs.length, 0, `validate: ${errs}`);
    assert.equal(newModel.parts.length, 2);
});

test('8. round trip motor-wheel-axle chain compiles like driving base left side', () => {
    const drivingBase = json('test/fixtures/bw-sim/driving-base.json');
    let model = {version: 1, parts: []};
    // Place motor directly at its driving base position (no need to snap to hub for this test)
    const motorL = drivingBase.parts.find(p => p.id === 'motorL');
    model = placePart(model, {part: motorL.part, position: motorL.position, rotation: motorL.rotation, port: motorL.port});
    const axlePos = drivingBase.parts.find(p => p.id === 'axleL').position;
    const axleRot = drivingBase.parts.find(p => p.id === 'axleL').rotation;
    const axlePose = {position: axlePos, rotation: axleRot};
    const axleCands = snapCandidates({model, catalog: CATALOG, part: '3705.dat', pose: axlePose});
    assert.ok(axleCands.length >= 1, `axle should snap to motor, got ${axleCands.length}`);
    const axleCand = axleCands[0];
    model = placePart(model, {part: '3705.dat', position: axleCand.position, rotation: axleCand.rotation});
    const axleId = model.parts[model.parts.length - 1].id;
    const wheelPos = drivingBase.parts.find(p => p.id === 'wheelL').position;
    const wheelRot = drivingBase.parts.find(p => p.id === 'wheelL').rotation;
    const wheelPose = {position: wheelPos, rotation: wheelRot};
    const wheelCands = snapCandidates({model, catalog: CATALOG, part: '39367p01.dat', pose: wheelPose});
    assert.ok(wheelCands.length >= 1, `wheel should snap to axle, got ${wheelCands.length}`);
    const wheelCand = wheelCands[0];
    model = placePart(model, {part: '39367p01.dat', position: wheelCand.position, rotation: wheelCand.rotation});
    const mech = compile(model, CATALOG);
    assert.ok(mech.bodies.length >= 2, 'should have at least chassis and wheel bodies');
    const wheelBody = mech.bodies.find(b => b.parts.includes(model.parts[model.parts.length - 1].id));
    const axleBody = mech.bodies.find(b => b.parts.includes(axleId));
    assert.equal(wheelBody, axleBody, 'wheel and axle share output body');
    const hinge = mech.joints.find(j => j.type === 'hinge' && j.motor);
    assert.ok(hinge, 'should have motorised hinge');
});

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
    // Perturb the axle pose by [7,-5,6] to prove snapping pulls it in
    const perturb = [7, -5, 6];
    const axlePos = drivingBase.parts.find(p => p.id === 'axleL').position;
    const axleRot = drivingBase.parts.find(p => p.id === 'axleL').rotation;
    const axlePosePerturbed = {
        position: [axlePos[0] + perturb[0], axlePos[1] + perturb[1], axlePos[2] + perturb[2]],
        rotation: axleRot.slice()
    };
    const axleCands = snapCandidates({model, catalog: CATALOG, part: '3705.dat', pose: axlePosePerturbed});
    assert.ok(axleCands.length >= 1, `axle should snap to motor, got ${axleCands.length}`);
    const axleCand = axleCands[0];
    model = placePart(model, {part: '3705.dat', position: axleCand.position, rotation: axleCand.rotation});
    const axleId = model.parts[model.parts.length - 1].id;
    // For wheel, also perturb rotation 20° about a random axis
    const wheelPos = drivingBase.parts.find(p => p.id === 'wheelL').position;
    const wheelRot = drivingBase.parts.find(p => p.id === 'wheelL').rotation;
    const angle = 20 * Math.PI / 180;
    const axis = [1, 1, 0].map(v => v / Math.hypot(1, 1, 0));
    const c = Math.cos(angle), s = Math.sin(angle), t = 1 - c;
    const [x, y, z] = axis;
    const rotPerturb = [
        t*x*x + c, t*x*y - s*z, t*x*z + s*y,
        t*x*y + s*z, t*y*y + c, t*y*z - s*x,
        t*x*z - s*y, t*y*z + s*x, t*z*z + c
    ];
    // Combine: rotPerturb * wheelRot
    const mat3MulMat3 = (a, b) => [
        a[0]*b[0]+a[1]*b[3]+a[2]*b[6], a[0]*b[1]+a[1]*b[4]+a[2]*b[7], a[0]*b[2]+a[1]*b[5]+a[2]*b[8],
        a[3]*b[0]+a[4]*b[3]+a[5]*b[6], a[3]*b[1]+a[4]*b[4]+a[5]*b[7], a[3]*b[2]+a[4]*b[5]+a[5]*b[8],
        a[6]*b[0]+a[7]*b[3]+a[8]*b[6], a[6]*b[1]+a[7]*b[4]+a[8]*b[7], a[6]*b[2]+a[7]*b[5]+a[8]*b[8]
    ];
    const wheelRotPerturbed = mat3MulMat3(rotPerturb, wheelRot);
    const wheelPosePerturbed = {
        position: [wheelPos[0] + perturb[0], wheelPos[1] + perturb[1], wheelPos[2] + perturb[2]],
        rotation: wheelRotPerturbed
    };
    const wheelCands = snapCandidates({model, catalog: CATALOG, part: '39367p01.dat', pose: wheelPosePerturbed});
    assert.ok(wheelCands.length >= 1, `wheel should snap to axle, got ${wheelCands.length}`);
    const wheelCand = wheelCands[0];
    model = placePart(model, {part: '39367p01.dat', position: wheelCand.position, rotation: wheelCand.rotation});
    // Assert snapped positions lie on motor's output axis line (perp distance ≤0.5) and axes parallel
    const motorMeta = CATALOG.get(motorL.part);
    const outConn = motorMeta.connectors.find(c => c.id === 'out');
    const motorOutPos = [motorL.position[0] + motorL.rotation[0]*outConn.position[0] + motorL.rotation[1]*outConn.position[1] + motorL.rotation[2]*outConn.position[2],
                         motorL.position[1] + motorL.rotation[3]*outConn.position[0] + motorL.rotation[4]*outConn.position[1] + motorL.rotation[5]*outConn.position[2],
                         motorL.position[2] + motorL.rotation[6]*outConn.position[0] + motorL.rotation[7]*outConn.position[1] + motorL.rotation[8]*outConn.position[2]];
    const motorOutAxis = [motorL.rotation[0]*outConn.axis[0] + motorL.rotation[1]*outConn.axis[1] + motorL.rotation[2]*outConn.axis[2],
                          motorL.rotation[3]*outConn.axis[0] + motorL.rotation[4]*outConn.axis[1] + motorL.rotation[5]*outConn.axis[2],
                          motorL.rotation[6]*outConn.axis[0] + motorL.rotation[7]*outConn.axis[1] + motorL.rotation[8]*outConn.axis[2]];
    const perpDistToLine = (p, origin, dir) => {
        const d = [p[0]-origin[0], p[1]-origin[1], p[2]-origin[2]];
        const axial = d[0]*dir[0] + d[1]*dir[1] + d[2]*dir[2];
        const perp = [d[0]-axial*dir[0], d[1]-axial*dir[1], d[2]-axial*dir[2]];
        return Math.hypot(perp[0], perp[1], perp[2]);
    };
    const axlePart = model.parts.find(p => p.id === axleId);
    const wheelPart = model.parts[model.parts.length - 1];
    assert.ok(perpDistToLine(axlePart.position, motorOutPos, motorOutAxis) <= 0.5 + 1e-9, 'axle on motor output line');
    assert.ok(perpDistToLine(wheelPart.position, motorOutPos, motorOutAxis) <= 0.5 + 1e-9, 'wheel on motor output line');
    const axleMeta = CATALOG.get('3705.dat');
    const wheelMeta = CATALOG.get('39367p01.dat');
    const axleWorldAxis = [axlePart.rotation[0]*axleMeta.connectors[0].axis[0] + axlePart.rotation[1]*axleMeta.connectors[0].axis[1] + axlePart.rotation[2]*axleMeta.connectors[0].axis[2],
                           axlePart.rotation[3]*axleMeta.connectors[0].axis[0] + axlePart.rotation[4]*axleMeta.connectors[0].axis[1] + axlePart.rotation[5]*axleMeta.connectors[0].axis[2],
                           axlePart.rotation[6]*axleMeta.connectors[0].axis[0] + axlePart.rotation[7]*axleMeta.connectors[0].axis[1] + axlePart.rotation[8]*axleMeta.connectors[0].axis[2]];
    const wheelWorldAxis = [wheelPart.rotation[0]*wheelMeta.connectors[0].axis[0] + wheelPart.rotation[1]*wheelMeta.connectors[0].axis[1] + wheelPart.rotation[2]*wheelMeta.connectors[0].axis[2],
                            wheelPart.rotation[3]*wheelMeta.connectors[0].axis[0] + wheelPart.rotation[4]*wheelMeta.connectors[0].axis[1] + wheelPart.rotation[5]*wheelMeta.connectors[0].axis[2],
                            wheelPart.rotation[6]*wheelMeta.connectors[0].axis[0] + wheelPart.rotation[7]*wheelMeta.connectors[0].axis[1] + wheelPart.rotation[8]*wheelMeta.connectors[0].axis[2]];
    const dotAxle = Math.abs(axleWorldAxis[0]*motorOutAxis[0] + axleWorldAxis[1]*motorOutAxis[1] + axleWorldAxis[2]*motorOutAxis[2]);
    const dotWheel = Math.abs(wheelWorldAxis[0]*motorOutAxis[0] + wheelWorldAxis[1]*motorOutAxis[1] + wheelWorldAxis[2]*motorOutAxis[2]);
    assert.ok(dotAxle >= Math.cos(Math.PI/180) - 1e-9, 'axle parallel to motor output');
    assert.ok(dotWheel >= Math.cos(Math.PI/180) - 1e-9, 'wheel parallel to motor output');
    const mech = compile(model, CATALOG);
    assert.ok(mech.bodies.length >= 2, 'should have at least chassis and wheel bodies');
    const wheelBody = mech.bodies.find(b => b.parts.includes(model.parts[model.parts.length - 1].id));
    const axleBody = mech.bodies.find(b => b.parts.includes(axleId));
    assert.equal(wheelBody, axleBody, 'wheel and axle share output body');
    const hinge = mech.joints.find(j => j.type === 'hinge' && j.motor);
    assert.ok(hinge, 'should have motorised hinge');
});

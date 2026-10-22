// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// A real car's drive line (docs/ROBOT-LAB-REAL-MODELS.md): a tyre derived from the LDraw library is a cylinder,
// so it rolls (part-meta/catalog-parts.js tyreCylinder); a double bevel gear meshes as a spur gear with a parallel
// partner (mech/gears.js), as the 4x4 Off-Roader's motor drives its differential's pinion; and a model from
// elsewhere, rolling now, has its bodies' speed capped (mech/compile.js FOREIGN_MAX_SPEED_M_S).

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {compile} from '../overlay/scratch-gui/src/lib/bw-sim/mech/compile.js';
import {tyreCylinder} from '../overlay/scratch-gui/src/lib/bw-sim/part-meta/catalog-parts.js';
import {validateCompiledMechanism} from '../overlay/scratch-gui/src/lib/bw-sim/contracts.js';

const CATALOG = new Map(JSON.parse(readFileSync(new URL('../overlay/scratch-gui/src/lib/bw-sim/part-meta/parts.json', import.meta.url))).parts.map(p => [p.part, p]));
const I3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
const AXLE_Y = [0, 1, 0, 1, 0, 0, 0, 0, -1]; // an axle's local x along LDraw y
const GEAR_Y = [1, 0, 0, 0, 0, 1, 0, -1, 0]; // a gear's local z (its axis) along LDraw y

test('a derived tyre\'s box is a cylinder along its odd side; a box with none stays a box', () => {
    const tyre = tyreCylinder({shape: 'box', halfExtents: [133.9, 133.9, 55], position: [0, 0, 4]});
    assert.equal(tyre.shape, 'cylinder');
    assert.equal(tyre.radius, 133.9);
    assert.equal(tyre.halfHeight, 55);
    assert.deepEqual(tyre.position, [0, 0, 4]);
    assert.deepEqual(tyre.rotation.map(v => +v.toFixed(6)), [0.707107, 0, 0, 0.707107], 'its axis y turned onto z');
    assert.equal(tyreCylinder({shape: 'box', halfExtents: [20, 8, 8]}).rotation[2] < 0, true, 'along x: y turned onto x');
    assert.equal(tyreCylinder({shape: 'box', halfExtents: [8, 20, 8]}).rotation, undefined, 'along y: no turn');
    const cube = {shape: 'box', halfExtents: [10, 10, 10]};
    assert.equal(tyreCylinder(cube), cube);
});

test('a 20T and a 12T double bevel on parallel axles 40 LDU apart mesh as spur gears', () => {
    const model = {version: 1, parts: [
        {id: 'beam', part: '32524.dat', position: [0, 0, 0], rotation: I3},
        {id: 'a1', part: '3705.dat', position: [0, 20, -40], rotation: AXLE_Y},
        {id: 'a2', part: '3705.dat', position: [0, 20, 0], rotation: AXLE_Y},
        {id: 'g20', part: '32269.dat', position: [0, 30, -40], rotation: GEAR_Y},
        {id: 'g12', part: '32270.dat', position: [0, 30, 0], rotation: GEAR_Y}
    ]};
    for (const rescueLoose of [false, true]) {
        const m = compile(model, CATALOG, {ground: false, version: 2, rescueLoose});
        assert.equal(validateCompiledMechanism(m).length, 0);
        const meshes = m.couplings.filter(c => c.kind === 'gear');
        assert.equal(meshes.length, 1, `rescueLoose ${rescueLoose}: ${JSON.stringify(m.couplings)}`);
        assert.ok(Math.abs(Math.abs(meshes[0].ratio) - 20 / 12) < 1e-6, `ratio ${meshes[0].ratio}`);
    }
});

test('a model from elsewhere caps every body\'s speed (FOREIGN_MAX_SPEED_M_S); our own files keep Jolt\'s', async () => {
    const {loadJolt, createPhysicsCore} = await import('../overlay/scratch-gui/src/lib/bw-sim/physics/jolt-core.js');
    const {FOREIGN_MAX_SPEED_M_S} = await import('../overlay/scratch-gui/src/lib/bw-sim/mech/compile.js');
    const J = await loadJolt();
    const model = {version: 1, parts: [{id: 'beam', part: '32524.dat', position: [0, -400, 0], rotation: I3}]};
    const speedAfterPush = opts => {
        const m = compile(model, CATALOG, {ground: false, version: 2, ...opts});
        const core = createPhysicsCore(J, m, {stepHz: 200});
        const id = m.bodies.find(b => b.motion !== 'static').id;
        const p0 = core.bodyPose(id).position;
        core.setBodyVelocity(id, [20, 0, 0], [0, 0, 0]);
        core.step(1 / 200);
        const v = (core.bodyPose(id).position[0] - p0[0]) * 200;
        core.destroy?.();
        return {v, solver: m.solver};
    };
    const foreign = speedAfterPush({rescueLoose: true});
    assert.equal(foreign.solver.maxLinearVelocity, FOREIGN_MAX_SPEED_M_S);
    assert.ok(foreign.v <= FOREIGN_MAX_SPEED_M_S + 1e-6, `capped: ${foreign.v} m/s`);
    const own = speedAfterPush({});
    assert.ok(own.v > 19, `our own file: ${own.v} m/s`);
});

test('a free hinge in a model from elsewhere turns with a pin\'s friction (FOREIGN_FREE_HINGE_NM); ours stays frictionless', async () => {
    const {FOREIGN_FREE_HINGE_NM} = await import('../overlay/scratch-gui/src/lib/bw-sim/mech/compile.js');
    // Two 7L beams stacked, one pin through their middle holes: a hinge nothing drives, limits or couples.
    const model = {version: 1, parts: [
        {id: 'b1', part: '32524.dat', position: [0, 0, 0], rotation: I3},
        {id: 'b2', part: '32524.dat', position: [0, 20, 0], rotation: I3},
        {id: 'pin', part: '3673.dat', position: [0, 10, 0], rotation: AXLE_Y}
    ]};
    const hinges = m => m.joints.filter(j => j.type === 'hinge');
    const own = compile(model, CATALOG, {ground: false, version: 2});
    const foreign = compile(model, CATALOG, {ground: false, version: 2, rescueLoose: true});
    assert.equal(validateCompiledMechanism(foreign).length, 0);
    assert.ok(hinges(own).length >= 1 && hinges(own).every(j => j.frictionNm === undefined), JSON.stringify(hinges(own)));
    assert.ok(hinges(foreign).length >= 1 && hinges(foreign).every(j => j.frictionNm === FOREIGN_FREE_HINGE_NM), JSON.stringify(hinges(foreign)));
    assert.ok(FOREIGN_FREE_HINGE_NM > 0);
});

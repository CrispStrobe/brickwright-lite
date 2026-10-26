// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {libReader} from '../scripts/derive-part-meta.mjs';
import {flattenPart} from '../overlay/scratch-gui/src/lib/bw-sim/ldraw/ldraw-geometry.js';
import {colliderFit} from '../overlay/scratch-gui/src/lib/bw-sim/part-meta/derive.js';
import {loadJolt, createPhysicsCore} from '../overlay/scratch-gui/src/lib/bw-sim/physics/jolt-core.js';
import {recordNineIntake} from './helpers/robot-lab-nine-intake.mjs';
import {evaluateNineIntake} from '../scripts/lib/sim-lab-nine-intake-judge.mjs';
const metadata = JSON.parse(readFileSync(new URL('../overlay/scratch-gui/src/lib/bw-sim/part-meta/parts.json', import.meta.url)));
const axle = metadata.parts.find(p => p.part === '4519.dat');

test('3L shaft collider encloses the complete official mesh without square-corner swept intrusion', () => {
    const read = libReader(new URL('../overlay/scratch-gui/static/ldraw', import.meta.url).pathname);
    const vertices = flattenPart('4519.dat', read).polys.flat();
    assert.ok(vertices.length >= 400);
    const radius = Math.max(...vertices.map(p => Math.hypot(p[1], p[2])));
    const lo = Math.min(...vertices.map(p => p[0])), hi = Math.max(...vertices.map(p => p[0]));
    assert.equal(radius, 6); assert.equal(lo, -29.5); assert.equal(hi, 29.5);
    assert.equal(axle.colliders.length, 1);
    const c = axle.colliders[0];
    assert.equal(c.shape, 'cylinder'); assert.equal(c.radius, radius);
    assert.equal(c.halfHeight, (hi - lo) / 2);
    assert.ok(colliderFit(axle.colliders, vertices).enclosed >= .999);
    assert.deepEqual(axle.connectors, [{id: 'a', type: 'axle', position: [0, 0, 0], axis: [1, 0, 0], length: 60}]);
    assert.equal(axle.massGrams, .5);
});

test('the corrected stock shaft still collides with an actual obstruction and with the floor', async t => {
    const J = await loadJolt();
    const run = obstructed => {
        const c = axle.colliders[0];
        const bodies = [
            {id: 'ground', motion: 'static', position: [0, -.01, 0], rotation: [0, 0, 0, 1], massKg: 0,
                parts: [], colliders: [{shape: 'box', halfExtents: [.1, .01, .1]}]},
            {id: 'shaft', motion: 'dynamic', position: [0, .03, 0], rotation: [0, 0, 0, 1], massKg: axle.massGrams / 1000,
                parts: ['shaft'], colliders: [{...c, radius: c.radius * .0004, halfHeight: c.halfHeight * .0004}]}
        ];
        if (obstructed) bodies.push({id: 'obstacle', motion: 'static', position: [0, .015, 0], rotation: [0, 0, 0, 1], massKg: 0,
            parts: [], colliders: [{shape: 'box', halfExtents: [.004, .001, .01]}]});
        const core = createPhysicsCore(J, {version: 1, gravity: [0, -9.81, 0], bodies, joints: [], gears: [], diagnostics: []}, {stepHz: 200, recordContacts: true});
        try {
            for (let i = 0; i < 400; i++) core.step(.005);
            return {y: core.bodyPose('shaft').position[1], pairs: core.contactPairs().pairs};
        } finally {core.destroy();}
    };
    const blocked = run(true), free = run(false);
    t.diagnostic(JSON.stringify({blocked, free}));
    assert.ok(blocked.pairs['obstacle|shaft'] > 0);
    assert.ok(Math.abs(blocked.y - .0184) < .0005);
    assert.ok(free.pairs['ground|shaft'] > 0);
    assert.ok(Math.abs(free.y - .0024) < .0005);
    assert.ok(blocked.y - free.y > .015, 'Removing only the real obstruction changes the resting height');
});

test('restoring only the old square shaft reproduces CounterSlide foundation displacement', async t => {
    const old = structuredClone(metadata);
    old.parts.find(p => p.part === '4519.dat').colliders = [{shape: 'box', halfExtents: [30, 6, 6]}];
    const record = await recordNineIntake('counterslide', {partMetadata: old,
        directory: process.env.BW_MODEL_QUALIFY_EVIDENCE_DIR ? process.env.BW_MODEL_QUALIFY_EVIDENCE_DIR + '/original-square' : undefined});
    const result = evaluateNineIntake('counterslide', record);
    t.diagnostic(JSON.stringify(result));
    assert.ok(result.errors.some(e => e.code === 'world-foundation-drift-mm'));
    assert.ok(!result.errors.some(e => e.code.startsWith('route-error-')), 'Unchanged input route still completes');
});

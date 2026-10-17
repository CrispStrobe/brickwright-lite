// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// Every reference model the Robot Lab's Model list offers (MODELS,
// static/sim-lab/models/) is a file that parses with no refusals and compiles
// with no error diagnostics and its motors on ports. The line follower is the
// fixture the lap test drives (test/bw-sim-line-follower.test.mjs), written
// out by serializeModel, so the shipped model is the one that was proven; its
// example program (static/sim-lab/programs/) is a DEVICE SPIKE text, run for a
// lap by test/bw-sim-line-follower-program.test.mjs.

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseModel, serializeModel} from '../overlay/scratch-gui/src/lib/bw-sim/model/ldraw-model.js';
import {MODELS, MODELS_BASE, PROGRAMS_BASE, prepareModel, catalogFrom} from '../overlay/scratch-gui/src/lib/bw-sim/sim-session.js';
import {MATS, createMat} from '../overlay/scratch-gui/src/lib/bw-sim/world/mats.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const GUI = path.join(ROOT, 'overlay/scratch-gui');
const CATALOG = catalogFrom(JSON.parse(readFileSync(path.join(GUI, 'src/lib/bw-sim/part-meta/parts.json'), 'utf8')));
const FIXTURE = JSON.parse(readFileSync(path.join(ROOT, 'test/fixtures/bw-sim/line-follower.json'), 'utf8'));

test('every model in the list is a shipped file that compiles cleanly, motors and sensors on ports', () => {
    assert.deepEqual(MODELS.map(m => m.file), ['driving-base.ldr', 'line-follower.ldr']);
    for (const entry of MODELS) {
        assert.ok(entry.title.en && entry.title.de && entry.title.en !== entry.title.de, `${entry.file}: EN and DE titles`);
        const text = readFileSync(path.join(GUI, MODELS_BASE, entry.file), 'utf8');
        const {model, refusals} = parseModel(text, {catalog: CATALOG});
        assert.deepEqual(refusals, [], entry.file);
        const {mechanism, issues} = prepareModel(text, CATALOG, {mat: entry.mat || null});
        assert.deepEqual(issues.filter(i => i.severity === 'error'), [], entry.file);
        assert.ok(model.parts.length > 5, entry.file);
        assert.deepEqual(mechanism.joints.filter(j => j.motor).map(j => j.motor.port).sort(), ['A', 'B'], `${entry.file}: wheels on A and B`);
        for (const s of mechanism.sensors || []) assert.match(s.port, /^[A-F]$/, `${entry.file}: sensor port`);
        if (entry.mat) assert.ok(MATS.some(m => m.id === entry.mat), `${entry.file}: mat ${entry.mat} exists`);
        if (entry.example) {
            const program = path.join(GUI, PROGRAMS_BASE, entry.example);
            assert.ok(existsSync(program), `${entry.file}: example ${entry.example} is shipped`);
            assert.match(readFileSync(program, 'utf8'), /^DEVICE SPIKE\s*$/m, entry.example);
        }
    }
});

test('the shipped line follower is the lap-tested fixture, byte for byte as serializeModel writes it', () => {
    const text = readFileSync(path.join(GUI, MODELS_BASE, 'line-follower.ldr'), 'utf8');
    const title = text.slice(2, text.indexOf('\r\n'));
    assert.equal(text, serializeModel(FIXTURE.model, {name: 'line-follower.ldr', title}));
    const {mechanism} = prepareModel(text, CATALOG, {mat: 'line-oval'});
    assert.deepEqual(mechanism.sensors.map(s => [s.port, s.kind]), [['C', 'color']]);
    assert.equal(MODELS.find(m => m.file === 'line-follower.ldr').mat, FIXTURE.mat);
});

test('a mat can carry obstacles: the Wall mat puts a wall in the scene, ahead of its start pose', () => {
    const wall = createMat('wall');
    assert.equal(wall.obstacles.length, 1);
    const [obstacle] = wall.obstacles;
    const text = readFileSync(path.join(GUI, MODELS_BASE, 'driving-base.ldr'), 'utf8');
    const {mechanism, issues} = prepareModel(text, CATALOG, {mat: 'wall'});
    assert.deepEqual(issues.filter(i => i.severity === 'error'), []);
    const body = mechanism.bodies.find(b => b.id === `obstacle:${obstacle.id}`);
    assert.ok(body && body.motion === 'static', 'the wall is a static body');
    assert.deepEqual(body.colliders[0].halfExtents, obstacle.size.map(v => v / 2));
    // It stands on the floor: its bottom face is the ground body's top face.
    const ground = mechanism.bodies.find(b => b.id === 'ground');
    const groundTop = ground.position[1] + ground.colliders[0].halfExtents[1];
    assert.ok(Math.abs(body.position[1] - obstacle.size[1] / 2 - groundTop) < 1e-9);
    // Ahead of the start pose along its heading, inside the mat.
    const {x, z, heading} = wall.startPose;
    const h = heading * Math.PI / 180;
    const ahead = (body.position[0] - x) * Math.cos(h) + (body.position[2] - z) * Math.sin(h);
    assert.ok(ahead > 0.5, `the wall is ${ahead} m ahead of the start`);
    assert.ok(Math.abs(body.position[0]) + obstacle.size[0] / 2 <= wall.sizeM[0] / 2, 'inside the mat');
    // Mats without obstacles compile none.
    for (const id of ['plain', 'line-oval', 'colour-zones']) {
        assert.deepEqual(createMat(id).obstacles, []);
        assert.equal(prepareModel(text, CATALOG, {mat: id}).mechanism.bodies.filter(b => b.id.startsWith('obstacle:')).length, 0, id);
    }
});

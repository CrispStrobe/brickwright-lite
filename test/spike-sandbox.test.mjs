// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
import {test} from 'node:test';
import assert from 'node:assert/strict';
import Hub from '../overlay/scratch-gui/src/lib/virtual-hub/spike-hub-state.js';
import {ArenaHubBridge} from '../overlay/scratch-gui/src/lib/spike-arena/arena-hub-bridge.js';
import {validateWorld} from '../overlay/scratch-gui/src/lib/spike-arena/arena-world.js';
import {sandboxWorld, editSandbox} from '../overlay/scratch-gui/src/lib/spike-arena/arena-sandbox.js';

test('free worlds run without scoring, wall failures or a time limit', () => {
    const world = sandboxWorld(), hub = new Hub();
    assert.deepEqual(validateWorld(world), []);
    const arena = new ArenaHubBridge({hubState: hub, world});
    hub.backend.runAtSpeed('A', -300);
    hub.backend.runAtSpeed('B', 300);
    arena.tick(120000);
    assert.equal(arena.verdict.status, 'running');
    assert.equal(arena.verdict.timeMs, 120000);
    assert.ok(arena.sim.pose.x > world.start.x);
    assert.ok(arena.sim.pose.x < 150, 'walls remain solid in the sandbox');
    assert.ok(arena.sim.blocked);
});

test('editing the mat changes shared sensor inputs, and reset retains its geometry', () => {
    const original = sandboxWorld();
    const painted = editSandbox(original, 'paint', 37, 40, 'red');
    const world = editSandbox(painted, 'wall', 65, 40);
    assert.equal(original.mat.shapes.length, 2, 'editing never mutates the original');
    const hub = new Hub(), arena = new ArenaHubBridge({hubState: hub, world});
    assert.equal(hub.backend.readSensor('C', 'color').color, 9);
    assert.ok(hub.backend.readSensor('D', 'distance').distance < 300);
    hub.backend.runAtSpeed('A', -300); hub.backend.runAtSpeed('B', 300);
    arena.tick(1000); arena.reset();
    assert.deepEqual(arena.sim.pose, world.start);
    assert.equal(hub.backend.readSensor('C', 'color').color, 9);
    const erased = editSandbox(world, 'erase', 65, 40);
    assert.equal(erased.walls.length, world.walls.length - 1);
});

test('copying a challenge removes its score, deadline and solution without changing geometry', () => {
    const challenge = {...sandboxWorld(), mode: 'challenge', timeLimitMs: 100,
        objects: [{id: 'beacon', shape: {type: 'circle', x: 20, y: 20, r: 2}}],
        success: [{type: 'touch', object: 'beacon'}], failure: [{type: 'noWallContact'}],
        stages: [{en: 'Touch', de: 'Berühren'}], solution: 'solution.bw'};
    const copy = sandboxWorld(challenge);
    assert.deepEqual(copy.mat, challenge.mat);
    assert.equal(copy.solution, undefined);
    assert.equal(copy.stages, undefined);
    assert.equal(copy.timeLimitMs, undefined);
    assert.deepEqual(copy.success, []);
    assert.ok(validateWorld({...challenge, success: []}).includes('success: at least one condition'));
    assert.ok(validateWorld({...copy, timeLimitMs: 100}).length);
});

test('invalid placements and imported worlds fail before replacing the working mat', () => {
    const world = sandboxWorld(), before = structuredClone(world);
    for (const [tool, x, y] of [['wall', -1, 0], ['start', NaN, 0], ['paint', 1, Infinity], ['bad', 1, 1]]) {
        assert.throws(() => editSandbox(world, tool, x, y));
    }
    assert.throws(() => sandboxWorld({...world, mat: {width: 0, height: 2}}));
    for (const robot of [{wheelDiameter: 0}, {left: {port: 'Z'}}, {left: {port: 'B'}},
        {sensors: [{port: 'C', kind: 'distance', x: NaN, y: 0}]}]) {
        assert.throws(() => sandboxWorld({...world, robot}));
    }
    assert.throws(() => sandboxWorld({...world, objects: Array(301).fill(world.objects[0])}));
    assert.throws(() => sandboxWorld({...world, walls: [{shape: {type: 'circle', x: 10, y: 10, r: -1}}]}));
    assert.deepEqual(world, before);
    const a = editSandbox(world, 'crate', 40, 40), b = editSandbox(a, 'crate', 45, 45);
    assert.equal(new Set(b.objects.map(object => object.id)).size, b.objects.length);
});

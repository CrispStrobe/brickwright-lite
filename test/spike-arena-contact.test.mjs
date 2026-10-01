// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
import {test} from 'node:test';
import assert from 'node:assert/strict';
import Hub from '../overlay/scratch-gui/src/lib/virtual-hub/spike-hub-state.js';
import {ArenaHubBridge} from '../overlay/scratch-gui/src/lib/spike-arena/arena-hub-bridge.js';
import {sandboxWorld} from '../overlay/scratch-gui/src/lib/spike-arena/arena-sandbox.js';

const world = contactModel => sandboxWorld({mat: {width: 180, height: 120, background: 'white'},
    start: {x: 30, y: 40, heading: 0}, robot: {contactModel},
    walls: [{shape: {type: 'rect', x: 65, y: 40, w: 4, h: 70}}]});
const run = chunks => {
    const hub = new Hub(), bridge = new ArenaHubBridge({hubState: hub, world: world('stall')});
    const moves = [hub.backend.runForDegrees('A', 1800, -300), hub.backend.runForDegrees('B', 1800, 300)];
    let ms = 0, i = 0;
    while (ms < 10000) {const dt = Math.min(chunks[i++ % chunks.length], 10000 - ms); bridge.tick(dt); ms += dt;}
    return {hub, bridge, moves};
};
test('wall contact stops encoders and resolves finite commands as stalled; reversing releases contact', async () => {
    const {hub, bridge, moves} = run([5]);
    assert.deepEqual(await Promise.all(moves), ['stalled', 'stalled']);
    assert.ok(bridge.sim.pose.x > 40 && bridge.sim.pose.x < 63);
    assert.ok(hub.data.motors[1].position < 1800);
    const x = bridge.sim.pose.x;
    hub.backend.runAtSpeed('A', 300); hub.backend.runAtSpeed('B', -300);
    bridge.tick(1000);
    assert.ok(bridge.sim.pose.x < x - 5, 'reverse escapes without resetting the rover');
});
test('contact and completion are deterministic across frame chunking', async () => {
    const a = run([5]), b = run([1, 17, 101, 2, 33]);
    assert.deepEqual(a.bridge.snapshot(), b.bridge.snapshot());
    assert.deepEqual(a.hub.data.motors, b.hub.data.motors);
    assert.deepEqual(await Promise.all(a.moves), await Promise.all(b.moves));
});
test('slip is selectable and environmental resistance never clears explicit load', () => {
    const hub = new Hub(), bridge = new ArenaHubBridge({hubState: hub, world: world('slip')});
    hub.backend.runAtSpeed('A', -300); hub.backend.runAtSpeed('B', 300);
    bridge.tick(5000); const position = hub.data.motors[1].position;
    bridge.tick(1000); assert.ok(hub.data.motors[1].position > position);
    bridge.reset(); hub.backend.setLoad('B', 1); hub.backend.runAtSpeed('B', 300);
    bridge.tick(1000); assert.equal(hub.data.motors[1].position, 0);
});


test('cancelling arena ownership clears contact load for subsequent standalone motor commands', () => {
    const {hub} = run([5]);
    hub.backend.cancel();
    hub.backend.runAtSpeed('B', 300); hub.backend.step(500);
    assert.ok(hub.data.motors[1].degPerSec > 0);
});

test('removing environmental resistance is detected by the finite-motion comparison', async () => {
    const hub = new Hub(), bridge = new ArenaHubBridge({hubState: hub, world: world('stall')});
    hub.backend.setArenaLoad = () => {}; // Meaningful mutation: no collision feedback.
    const move = hub.backend.runForDegrees('B', 1800, 300);
    hub.backend.runAtSpeed('A', -300); bridge.tick(10000);
    const result = await move;
    assert.equal(result, 'completed');
    assert.throws(() => assert.equal(result, 'stalled'), /completed/);
});

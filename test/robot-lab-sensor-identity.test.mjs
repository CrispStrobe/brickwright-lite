// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {hubBindings} from '../overlay/scratch-gui/src/lib/bw-sim/hub-bridge.js';

// Wrong discovery changes which sensor protocol a real extension initializes.
// The bridge must preserve a compiled device's ID without lending its mutable
// catalogue object to the hub, or manufacturing IDs for unidentified sensors.
test('sensor bindings retain protocol identity, remain independent copies and stay on their owning hub', () => {
    const device = {id: 'tilt', body: 'tilt-body', device: 'wedo2-tilt', sensor: 'tilt', hub: 'hub', port: 'B',
        ids: {lpf2: 0x22}, probe: {origin: [0, 0, 0], direction: [1, 0, 0]}};
    const mechanism = {version: 2, actuators: [], devices: [device]};
    const bindings = hubBindings(mechanism, 'hub').bindings;
    assert.deepEqual(bindings[0].ids, {lpf2: 0x22});
    bindings[0].ids.lpf2 = 0x23;
    assert.deepEqual(device.ids, {lpf2: 0x22}, 'hub mutation cannot change the compiled catalogue identity');
    assert.deepEqual(hubBindings(mechanism, 'other-hub', 1, 2).bindings, []);
    delete device.ids;
    assert.deepEqual(hubBindings(mechanism, 'hub').bindings[0].ids, {}, 'no identity is invented');
});

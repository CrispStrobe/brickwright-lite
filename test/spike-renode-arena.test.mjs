// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
import {test} from 'node:test';
import assert from 'node:assert/strict';
import Hub from '../overlay/scratch-gui/src/lib/virtual-hub/spike-hub-state.js';
import {ArenaHubBridge} from '../overlay/scratch-gui/src/lib/spike-arena/arena-hub-bridge.js';
import {RenodeArenaBridge} from '../overlay/scratch-gui/src/lib/spike-arena/renode-arena-bridge.js';
import {sandboxWorld} from '../overlay/scratch-gui/src/lib/spike-arena/arena-sandbox.js';
const frame = (seq, ms, position = 0) => ({schemaVersion: 1, type: 'snapshot', seq, clockNs: ms * 1e6,
    target: {board: 'spike-prime', firmware: 'brickwright-arena-demo', transport: 'none', imageSha256: 'a'.repeat(64),
        capabilities: ['arena-inputs/v1', 'arena-clock/v1', 'guest-motor-output/v1']},
    lifecycle: {connectionGeneration: 1},
    ports: [{id: 'C', attached: true, kind: 'color'}, {id: 'D', attached: true, kind: 'distance'}, {id: 'E', attached: true, kind: 'force'}],
    motors: [{port: 'A', position: -position, speedDps: -300, demandDirection: -1, stalled: false},
        {port: 'B', position, speedDps: 300, demandDirection: 1, stalled: false}]});
const setup = () => {
    const hub = new Hub();
    const bridge = new ArenaHubBridge({hubState: hub, world: sandboxWorld()});
    const adapter = new RenodeArenaBridge(bridge);
    return {hub, bridge, adapter};
};
test('guest clock and encoders drive the shared arena without stepping native motors', () => {
    const {hub, bridge, adapter} = setup();
    hub.stepMotors = () => {throw new Error('second clock');};
    adapter.accept(frame(1, 200, 30)); const x = bridge.sim.pose.x;
    assert.equal(bridge.sim.timeMs, 0, 'first observation establishes a baseline');
    const inputs = adapter.accept(frame(2, 400, 90));
    assert.ok(bridge.sim.pose.x > x + 2);
    assert.equal(bridge.sim.timeMs, 200);
    assert.equal(hub.data.motors[1].position, 90);
    assert.deepEqual(hub.data.classicPorts[1], [48, [27, 90, 0, 27]]);
    assert.equal(hub.clockOwner, 'renode');
    assert.equal(inputs.sensors.find(s => s.port === 'D').kind, 'distance');
    assert.equal(hub.data.sensors[3].distance, inputs.sensors.find(s => s.port === 'D').values.distanceMillimeters);
    adapter.close(); assert.equal(hub.clockOwner, null);
    assert.throws(() => adapter.accept(frame(3, 600, 150)), /closed/);
});
test('invalid, replayed and discontinuous frames cannot change the world', () => {
    const {bridge, adapter} = setup(); adapter.accept(frame(1, 200));
    for (const mutate of [f => {f.seq = 1;}, f => {f.clockNs = 0;}, f => {f.clockNs = 3000000000;},
        f => {f.target.transport = 'ble';}, f => {f.target.firmware = 'lego-prime-v3';},
        f => {f.lifecycle.connectionGeneration++;}, f => {f.motors[0].position = NaN;},
        f => {f.motors[1].position = 600;}, f => {f.ports = [];}]) {
        const bad = frame(2, 400, 60); mutate(bad);
        const before = bridge.snapshot();
        assert.throws(() => adapter.accept(bad));
        assert.deepEqual(bridge.snapshot(), before);
    }
});
test('mutation check detects disconnected actuator-to-world coupling', () => {
    const {bridge, adapter} = setup(); adapter.accept(frame(1, 0));
    bridge.sim.advanceWheels = () => {}; // Lost actuator coupling.
    const before = bridge.sim.pose.x; adapter.accept(frame(2, 1000, 300));
    assert.throws(() => assert.ok(bridge.sim.pose.x > before + 10));
});

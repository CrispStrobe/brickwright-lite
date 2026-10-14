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
        capabilities: ['arena-inputs/v1', 'arena-clock/v1', 'guest-motor-output/v1', 'state-sample/v1']},
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
test('full NuttX encoders use the same world and enforce its program capability', () => {
    const {hub, bridge, adapter} = setup();
    const nuttx = (seq, ms, position) => {
        const f = frame(seq, ms, position);
        f.target.firmware = 'brickwright-nuttx';
        f.target.capabilities.push('nuttx-program/v1');
        f.motors.forEach(m => {m.speedDps = Math.sign(m.speedDps) * 900;});
        return f;
    };
    hub.stepMotors = () => {throw new Error('second clock');};
    adapter.accept(nuttx(1, 1000, 0));
    const x = bridge.sim.pose.x;
    adapter.accept(nuttx(2, 1100, 90));
    assert.ok(bridge.sim.pose.x > x);
    assert.equal(hub.clockOwner, 'renode');
    const invalid = nuttx(3, 1200, 180);
    invalid.target.capabilities = invalid.target.capabilities.filter(cap => cap !== 'nuttx-program/v1');
    assert.throws(() => adapter.accept(invalid), /motor frame/);
});

test('MicroPython identity requires raw REPL capability and preserves frame continuity', () => {
    const micro = (seq, ms, position=0) => {
        const f = frame(seq,ms,position);f.target.firmware='micropython-prime';
        f.target.capabilities.push('micropython-uart/v1');f.lifecycle.micropythonUart={generation:1,state:'ready'};
        f.motors.forEach(m=>{m.speedDps=Math.sign(m.speedDps)*1110;});return f;
    };
    const {adapter,hub,bridge}=setup();
    const bad=micro(1,0);bad.target.capabilities.pop();assert.throws(()=>adapter.accept(bad),/contract/);
    assert.equal(hub.clockOwner,null);
    adapter.accept(micro(1,0));adapter.accept(micro(2,100,111));assert.equal(bridge.sim.timeMs,100);
    for(const mutate of [f=>{f.seq=2;},f=>{f.lifecycle.micropythonUart.generation=2;},
        f=>{f.target.imageSha256='b'.repeat(64);},f=>{f.motors[1].position=223;},
        f=>{f.motors[1].speedDps=1111;},f=>{f.clockNs=3000000000;}]) {
        const f=micro(3,200,222);mutate(f);const before=bridge.snapshot();assert.throws(()=>adapter.accept(f));assert.deepEqual(bridge.snapshot(),before);
    }
    const {adapter:legacy}=setup();const spoof=frame(1,0);spoof.target.capabilities.push('micropython-uart/v1');
    spoof.motors[1].speedDps=1110;assert.throws(()=>legacy.accept(spoof),/motor frame/);
});

const hubFrame = (seq, ms, position = 0) => {
    const value = frame(seq, ms, position);
    value.target.firmware = 'micropython-prime';
    value.target.capabilities.push('micropython-uart/v1', 'prime-hub-io/v1');
    value.lifecycle.micropythonUart = {generation: 1, state: 'ready'};
    value.display = {width: 5, height: 5, semantics: 'grayscale-16bit', pixels: Array(25).fill(65535)};
    value.buttons = {left: false, center: true, right: false, bluetooth: false};
    value.imu = {available: true, semantics: 'signed-16bit-raw', temperature: -32768,
        angularRate: [32767, 0, -1], acceleration: [-32768, 0, 32767]};
    value.audio = {available: true, active: false, pcm8: {lastSample: 255, totalBytes: 6,
        droppedBytes: 0, disabledBytes: 0, bufferedBytes: 6}};
    return value;
};
test('hub observations share the hub without replacing manual inputs or arena heading', () => {
    const {hub, adapter} = setup();
    hub.data.buttons.left = true;
    hub.data.imuRaw.acceleration = [1, 2, 3];
    const inputs = adapter.accept(hubFrame(1, 0));
    assert.deepEqual(hub.data.display, Array(25).fill(9));
    assert.deepEqual(hub.data.firmwareHub.imu.acceleration, [-32768, 0, 32767]);
    assert.equal(hub.data.firmwareHub.audio.pcm8.totalBytes, 6);
    assert.equal(hub.data.imu.yaw, 0);
    assert.equal(inputs.hub.buttons.left, true);
    assert.equal(inputs.hub.buttons.center, false, 'observations do not overwrite pending manual input');
    assert.deepEqual(inputs.hub.imuRaw.acceleration, [1, 2, 3]);
});
test('malformed hub observations fail before moving motors, world or ownership', () => {
    for (const mutate of [f => {f.display.pixels[0] = 65536;}, f => {f.buttons.left = 1;},
        f => {f.imu.acceleration[0] = true;}, f => {f.imu.angularRate.pop();},
        f => {f.audio.pcm8.totalBytes = -1;}, f => {f.audio.pcm8.path = 'monitor';},
        f => {f.display.semantics = 'physical';}, f => {f.target.firmware = 'brickwright-nuttx';}]) {
        const {hub, bridge, adapter} = setup();
        const before = structuredClone(hub.data), pose = {...bridge.sim.pose};
        const bad = hubFrame(1, 0, 20); mutate(bad);
        assert.throws(() => adapter.accept(bad), /Prime hub observation/);
        assert.deepEqual(hub.data, before); assert.deepEqual(bridge.sim.pose, pose);
        assert.equal(hub.clockOwner, null);
    }
    const {hub, adapter} = setup();
    hub.data.imuRaw.temperature = 32768;
    assert.throws(() => adapter.accept(hubFrame(1, 0)), /Prime hub input/);
    assert.equal(hub.clockOwner, null);
});

test('hub validation mutation checks detect lost grayscale, IMU and PCM bounds', async () => {
    const {readFile} = await import('node:fs/promises');
    const source = await readFile(new URL('../overlay/scratch-gui/src/lib/spike-arena/prime-hub-io.js', import.meta.url), 'utf8');
    for (const [needle, replacement, mutate] of [
        ['!display.pixels.every(v => integer(v, 0, 65535))', 'false', f => {f.display.pixels[0] = 65536;}],
        ['!vector(imu.angularRate)', 'false', f => {f.imu.angularRate = [0, 0];}],
        ["!['totalBytes', 'droppedBytes', 'disabledBytes', 'bufferedBytes'].every(key => integer(audio.pcm8[key], 0, Number.MAX_SAFE_INTEGER))",
            'false', f => {f.audio.pcm8.totalBytes = -1;}]
    ]) {
        assert.ok(source.includes(needle));
        const original = await import('../overlay/scratch-gui/src/lib/spike-arena/prime-hub-io.js');
        const mutant = await import(`data:text/javascript;base64,${Buffer.from(source.replace(needle, replacement)).toString('base64')}`);
        const bad = hubFrame(1, 0);mutate(bad);
        assert.throws(() => original.readHubObservation(bad), /Prime hub observation/);
        assert.throws(() => assert.throws(() => mutant.readHubObservation(bad), /Prime hub observation/),
            /Missing expected exception/, 'the same rejection scenario detects the broken validator');
    }
});

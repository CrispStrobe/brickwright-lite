// SPDX-License-Identifier: Apache-2.0
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const MODULE = resolve(here, '../overlay/scratch-gui/src/lib/virtual-hub/spike-prime-peripheral.js');
const {VirtualSpikePrimePeripheral, SPIKE_RX, packSpikeFrame, unpackSpikeFrame} = await import(MODULE);

test('answers fragmented info and notification requests', () => {
    const hub = new VirtualSpikePrimePeripheral();
    hub.hubState.setSimulationEnabled(true);
    const notifications = [];
    hub.setNotificationSink((uuid, bytes) => notifications.push({uuid, bytes}));
    hub.connect();

    const info = packSpikeFrame(Uint8Array.of(0));
    hub.onWrite(SPIKE_RX, info.slice(0, 1));
    hub.onWrite(SPIKE_RX, info.slice(1));
    assert.equal(notifications.length, 1);

    hub.onWrite(SPIKE_RX, packSpikeFrame(Uint8Array.of(0x28, 100, 0)));
    assert.equal(hub.state.notificationIntervalMs, 100);
    assert.equal(notifications.length, 3);
    assert.equal(unpackSpikeFrame(notifications[2].bytes)[0], 0x3c);
});

test('maps JSON motor tunnels and safely retains the Python subset', () => {
    const hub = new VirtualSpikePrimePeripheral();
    const tunnel = text => {
        const body = new TextEncoder().encode(text);
        hub.onWrite(SPIKE_RX, packSpikeFrame(Uint8Array.from([
            0x32, body.length & 0xff, body.length >> 8, ...body
        ])));
    };
    tunnel('{"m":"motor","p":{"port":2,"speed":75}}');
    assert.equal(hub.state.motors[2].speed, 75);
    tunnel('import motor; motor.stop(port.A)');
    assert.equal(hub.state.lastPythonTunnel, 'import motor; motor.stop(port.A)');
    tunnel('import motor; motor.run(port.C, 750)');
    assert.equal(hub.state.motors[2].speed, 75);
    hub.disconnect();
    assert.equal(hub.state.motors[2].speed, 0);
});

test('emits signed, correctly sized device records', () => {
    const hub = new VirtualSpikePrimePeripheral();
    hub.hubState.setSimulationEnabled(true);
    const messages = [];
    hub.setNotificationSink((_uuid, bytes) => messages.push(unpackSpikeFrame(bytes)));
    hub.connect();
    hub.onWrite(SPIKE_RX, packSpikeFrame(Uint8Array.of(0x28, 100, 0)));
    hub.setPort('A', 'motor', {speed: -25, position: -123456});
    hub.setPort('B', 'distance', {distance: -1});
    const message = messages.at(-1);
    assert.equal(message[0], 0x3c);
    assert.equal(message[1] | (message[2] << 8), message.length - 3);
    const motorOffset = 3 + 2 + 21;
    assert.equal(message[motorOffset], 0x0a);
    assert.equal(new DataView(message.buffer, message.byteOffset + motorOffset).getInt32(8, true), -123456);
    const distanceOffset = motorOffset + 12;
    assert.equal(message[distanceOffset], 0x0d);
    assert.equal(new DataView(message.buffer, message.byteOffset + distanceOffset).getInt16(2, true), -1);
});

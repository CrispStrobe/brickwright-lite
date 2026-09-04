// SPDX-License-Identifier: Apache-2.0
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const MODULE = resolve(here, '../overlay/scratch-gui/src/lib/virtual-hub/spike-prime-peripheral.js');
const {VirtualSpikePrimePeripheral, SPIKE_RX, packSpikeFrame} = await import(MODULE);

test('answers fragmented info and notification requests', () => {
    const hub = new VirtualSpikePrimePeripheral();
    const notifications = [];
    hub.setNotificationSink((uuid, bytes) => notifications.push({uuid, bytes}));
    hub.connect();

    const info = packSpikeFrame(Uint8Array.of(0));
    hub.onWrite(SPIKE_RX, info.slice(0, 1));
    hub.onWrite(SPIKE_RX, info.slice(1));
    assert.equal(notifications.length, 1);

    hub.onWrite(SPIKE_RX, packSpikeFrame(Uint8Array.of(0x28, 100, 0)));
    assert.equal(hub.state.notificationIntervalMs, 100);
    assert.equal(notifications.length, 2);
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
    hub.disconnect();
    assert.equal(hub.state.motors[2].speed, 0);
});

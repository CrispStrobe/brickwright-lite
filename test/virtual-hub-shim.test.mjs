// SPDX-License-Identifier: BSD-3-Clause
import {afterEach, beforeEach, test} from 'node:test';
import assert from 'node:assert/strict';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const MODULE = resolve(here, '../overlay/scratch-gui/src/lib/virtual-hub/web-bluetooth-shim.js');
const SERVICE = '0000fd02-0000-1000-8000-00805f9b34fb';
const RX = '0000fd02-0001-1000-8000-00805f9b34fb';
const TX = '0000fd02-0002-1000-8000-00805f9b34fb';

let delegated;
const real = {
    requestDevice: async options => {
        delegated = options;
        return {id: 'real'};
    },
    getAvailability: async () => true,
    getDevices: async () => [{id: 'remembered'}]
};

Object.defineProperty(globalThis, 'navigator', {
    value: {bluetooth: real}, configurable: true, writable: true
});

const {default: install, registerVirtualPeripheral, clearVirtualPeripheralsForTest} = await import(MODULE);

beforeEach(() => {
    clearVirtualPeripheralsForTest();
    delegated = null;
    Object.defineProperty(navigator, 'bluetooth', {value: real, configurable: true});
    delete globalThis.__brickwrightChooseVirtualBluetooth;
});

afterEach(() => delete globalThis.__brickwrightChooseVirtualBluetooth);

test('an empty registry delegates byte-for-byte to the existing implementation', async () => {
    install();
    const options = {filters: [{services: [SERVICE]}], optionalServices: [SERVICE]};
    assert.equal((await navigator.bluetooth.requestDevice(options)).id, 'real');
    assert.equal(delegated, options);
    assert.deepEqual(await navigator.bluetooth.getDevices(), [{id: 'remembered'}]);
});

test('discovers, connects, writes and receives a notification', async () => {
    let sink = null;
    let connected = 0;
    let disconnected = 0;
    const writes = [];
    registerVirtualPeripheral(() => ({
        id: 'virtual-spike-1',
        name: 'Virtual SPIKE Prime',
        services: [{
            uuid: SERVICE,
            characteristics: [{uuid: RX}, {uuid: TX}]
        }],
        connect: () => { connected++; },
        disconnect: () => { disconnected++; },
        onWrite: (uuid, bytes, withResponse) => writes.push({uuid, bytes: [...bytes], withResponse}),
        setNotificationSink: value => { sink = value; }
    }));
    globalThis.__brickwrightChooseVirtualBluetooth = candidates => candidates[0];
    install();

    const device = await navigator.bluetooth.requestDevice({
        filters: [{namePrefix: 'Virtual SPIKE', services: [SERVICE]}]
    });
    assert.equal(device.id, 'virtual-spike-1');
    const server = await device.gatt.connect();
    assert.equal(connected, 1);
    const service = await server.getPrimaryService(SERVICE.toUpperCase());
    const rx = await service.getCharacteristic(RX);
    await rx.writeValueWithoutResponse(Uint8Array.of(1, 2, 3));
    assert.deepEqual(writes, [{uuid: RX, bytes: [1, 2, 3], withResponse: false}]);

    const tx = await service.getCharacteristic(TX);
    await tx.startNotifications();
    let notification = null;
    tx.addEventListener('characteristicvaluechanged', event => {
        notification = [...new Uint8Array(event.target.value.buffer)];
    });
    sink(TX, Uint8Array.of(4, 5));
    assert.deepEqual(notification, [4, 5]);

    let closed = false;
    device.addEventListener('gattserverdisconnected', () => { closed = true; });
    server.disconnect();
    assert.equal(disconnected, 1);
    assert.equal(closed, true);
});

test('nonmatching virtual devices still delegate to real Bluetooth', async () => {
    registerVirtualPeripheral(() => ({id: 'other', name: 'Other', services: []}));
    install();
    assert.equal((await navigator.bluetooth.requestDevice({filters: [{services: [SERVICE]}]})).id, 'real');
});

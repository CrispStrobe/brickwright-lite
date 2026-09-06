// SPDX-License-Identifier: Apache-2.0
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../overlay/scratch-gui/src/lib/virtual-hub');
Object.defineProperty(globalThis, 'navigator', {value: {}, configurable: true});
globalThis.window = globalThis;
globalThis.addEventListener = () => {};
globalThis.localStorage = {getItem: () => null};
globalThis.document = {documentElement: {lang: 'en'}};
globalThis.alert = () => {};
const realSetInterval = globalThis.setInterval;
globalThis.setInterval = () => 0;

const {default: install, clearVirtualPeripheralsForTest} = await import(resolve(root, 'web-bluetooth-shim.js'));
const {registerVirtualSpikePrime} = await import(resolve(root, 'spike-prime-peripheral.js'));
const {default: HubState} = await import(resolve(root, 'spike-hub-state.js'));

const loadBundledExtension = async () => {
    const wrapper = await readFile(resolve(here,
        '../overlay/scratch-vm/src/extensions/crispstrobe/spikeprimeble/index.js'), 'utf8');
    const source = JSON.parse(wrapper.slice(wrapper.indexOf('makeExt(') + 8, -3));
    let extension = null;
    const Scratch = {
        extensions: {unsandboxed: true, register: value => { extension = value; }},
        BlockType: {COMMAND: 'command', REPORTER: 'reporter', BOOLEAN: 'Boolean'},
        ArgumentType: {STRING: 'string', NUMBER: 'number'},
        Cast: {toString: String, toNumber: Number},
        vm: {runtime: {getLocale: () => 'en'}}
    };
    Function('Scratch', source)(Scratch); // eslint-disable-line no-new-func
    return extension;
};

test('disabled SPIKE simulation leaves the real Bluetooth delegate unchanged', async () => {
    clearVirtualPeripheralsForTest();
    const expected = {id: 'real-spike'};
    let calls = 0;
    navigator.bluetooth = {requestDevice: async options => { calls++; return {...expected, options}; }};
    const state = new HubState();
    const registration = registerVirtualSpikePrime({hubState: state});
    install();
    const options = {filters: [{services: ['0000fd02-0000-1000-8000-00805f9b34fb']}]};
    const selected = await navigator.bluetooth.requestDevice(options);
    assert.equal(selected.id, expected.id);
    assert.equal(selected.options, options);
    assert.equal(calls, 1);
    assert.equal(registration.peripheral, null);
    registration.unregister();
});

test('bundled direct BLE extension runs through the virtual hub and reconnects', async t => {
    t.after(() => { globalThis.setInterval = realSetInterval; });
    clearVirtualPeripheralsForTest();
    const state = new HubState();
    state.setSimulationEnabled(true);
    const registration = registerVirtualSpikePrime({hubState: state});
    globalThis.__brickwrightChooseVirtualBluetooth = candidates => candidates[0];
    install();
    const extension = await loadBundledExtension();
    await extension.connectHub();
    assert.equal(extension.isConnected(), true);
    await extension.startMotor({PORT: 'C', SPEED: 65});
    assert.equal(state.data.motors[2].speed, 65);
    state.setPort('B', 'distance', {distance: 345});
    assert.equal(extension.getDistance({PORT: 'B'}), 345);
    extension.disconnectHub();
    assert.equal(state.data.motors[2].speed, 0);
    await extension.connectHub();
    assert.equal(extension.isConnected(), true);
    extension.disconnectHub();
    registration.unregister();
});

test('virtual GATT rejects malformed frames and accepts the next valid frame', async () => {
    clearVirtualPeripheralsForTest();
    const state = new HubState();
    state.setSimulationEnabled(true);
    const registration = registerVirtualSpikePrime({hubState: state});
    const hub = registration.peripheral;
    // Instantiate the registered factory by selecting it.
    install();
    const device = await navigator.bluetooth.requestDevice({filters: [{services: [
        '0000fd02-0000-1000-8000-00805f9b34fb'
    ]}]});
    const server = await device.gatt.connect();
    const service = await server.getPrimaryService('0000fd02-0000-1000-8000-00805f9b34fb');
    const rx = await service.getCharacteristic('0000fd02-0001-1000-8000-00805f9b34fb');
    await assert.rejects(rx.writeValueWithoutResponse(Uint8Array.of(3, 2)), /control byte|COBS/);
    await rx.writeValueWithoutResponse(Uint8Array.of(0, 0, 2));
    assert.ok(registration.peripheral);
    server.disconnect();
    registration.unregister();
    assert.equal(hub, null);
});

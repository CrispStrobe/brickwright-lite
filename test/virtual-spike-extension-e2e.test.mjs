// SPDX-License-Identifier: Apache-2.0
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {quietConsole} from './helpers/quiet-console.mjs';
import {readFile} from 'node:fs/promises';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../overlay/scratch-gui/src/lib/virtual-hub');
Object.defineProperty(globalThis, 'navigator', {value: {}, configurable: true});
globalThis.window = globalThis;
// The bundled extension logs ~1.7 KB on load and connect; none of it may reach fd 1 (helpers/quiet-console.mjs).
quietConsole();
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
        '../overlay/scratch-vm/src/extensions/crispstrobe/spikeprime/index.js'), 'utf8');
    const source = JSON.parse(wrapper.slice(wrapper.indexOf('makeExt(') + 8, -3));
    let extension = null;
    // The unified extension registers a peripheral and emits connection
    // events, which the old BLE-only extension did not: it drove Web
    // Bluetooth directly and ignored the runtime. A runtime stub that only
    // answered getLocale was enough for that and is not enough for this.
    const runtime = {
        getLocale: () => 'en',
        on: () => {},
        emit: () => {},
        registerPeripheralExtension: () => {},
        constructor: {
            PERIPHERAL_CONNECTED: 'connected', PERIPHERAL_DISCONNECTED: 'disconnected',
            PERIPHERAL_LIST_UPDATE: 'list', USER_PICKED_PERIPHERAL: 'picked',
            PERIPHERAL_SCAN_TIMEOUT: 'timeout', PERIPHERAL_REQUEST_ERROR: 'error'
        }
    };
    const Scratch = {
        extensions: {unsandboxed: true, register: value => { extension = value; }},
        BlockType: {COMMAND: 'command', REPORTER: 'reporter', BOOLEAN: 'Boolean'},
        ArgumentType: {STRING: 'string', NUMBER: 'number'},
        Cast: {toString: String, toNumber: Number},
        vm: {runtime}
    };
    Function('Scratch', source)(Scratch); // eslint-disable-line no-new-func
    return extension;
};

let realCalls = 0;
let lastRealOptions = null;

test('disabled SPIKE simulation leaves the real Bluetooth delegate unchanged', async () => {
    clearVirtualPeripheralsForTest();
    const expected = {id: 'real-spike'};
    navigator.bluetooth = {requestDevice: async options => {
        realCalls++; lastRealOptions = options; return {...expected, options};
    }};
    const state = new HubState();
    const registration = registerVirtualSpikePrime({hubState: state});
    install();
    const options = {filters: [{services: ['0000fd02-0000-1000-8000-00805f9b34fb']}]};
    const selected = await navigator.bluetooth.requestDevice(options);
    assert.equal(selected.id, expected.id);
    assert.equal(selected.options, options);
    assert.equal(realCalls, 1);
    assert.equal(registration.peripheral, null);
    registration.unregister();
});

test('unsupported Web Bluetooth filter semantics delegate without offering virtual SPIKE', async () => {
    clearVirtualPeripheralsForTest();
    const state = new HubState();
    state.setSimulationEnabled(true);
    const registration = registerVirtualSpikePrime({hubState: state});
    globalThis.__brickwrightChooseVirtualBluetooth = () => assert.fail('virtual chooser must not run');
    const unsupported = [
        {filters: [{services: ['0000fd02-0000-1000-8000-00805f9b34fb'], manufacturerData: [{companyIdentifier: 1}]}]},
        {filters: [{services: ['0000fd02-0000-1000-8000-00805f9b34fb'], serviceData: [{service: 'battery_service'}]}]},
        {filters: [{services: ['0000fd02-0000-1000-8000-00805f9b34fb']}], exclusionFilters: [{namePrefix: 'x'}]}
    ];
    for (const options of unsupported) {
        const before = realCalls;
        const selected = await navigator.bluetooth.requestDevice(options);
        assert.equal(selected.id, 'real-spike');
        assert.equal(realCalls, before + 1);
        assert.equal(lastRealOptions, options);
        assert.equal(registration.peripheral, null);
    }
    registration.unregister();
});

test('registration teardown disposes every SPIKE peripheral created across selections', async () => {
    clearVirtualPeripheralsForTest();
    const state = new HubState(); state.setSimulationEnabled(true);
    const registration = registerVirtualSpikePrime({hubState: state});
    globalThis.__brickwrightChooseVirtualBluetooth = candidates => candidates[0];
    const options = {filters: [{services: ['0000fd02-0000-1000-8000-00805f9b34fb']}]};
    await navigator.bluetooth.requestDevice(options);
    const first = registration.peripheral; let firstDisposed = 0;
    const firstDispose = first.dispose.bind(first); first.dispose = () => { firstDisposed++; firstDispose(); };
    await navigator.bluetooth.requestDevice(options);
    const second = registration.peripheral; let secondDisposed = 0;
    const secondDispose = second.dispose.bind(second); second.dispose = () => { secondDisposed++; secondDispose(); };
    registration.unregister();
    assert.deepEqual([firstDisposed, secondDisposed], [1, 1]);
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
    // No Scratch Link in this runtime, so auto resolves to Web Bluetooth —
    // which is the route the extension this test used to drive was hard-wired
    // to. Naming it would hide whether the detection works.
    await extension.connectHub();
    assert.equal(extension.getConnectionMode(), 'web-ble',
        'auto should have detected Web Bluetooth');
    assert.equal(extension.isConnected(), true);
    await extension.startMotor({PORT: 'C', SPEED: 65});
    assert.equal(state.data.motors[2].speed, 65);
    // The hub reports millimetres. spikeprimeble's getDistance returned them
    // raw; the unified getDistance means centimetres, because that is what it
    // meant on the 2.x hub it came from and those projects are the many. The
    // millimetre reading is not lost — it moved to getDistanceIn, which is
    // where the migration sends every old mm reader.
    state.setPort('B', 'distance', {distance: 345});
    assert.equal(extension.getDistance({PORT: 'B'}), 34.5, 'centimetres');
    assert.equal(extension.getDistanceIn({PORT: 'B', UNIT: 'mm'}), 345,
        'the hub-reported millimetres, at the sensor\'s own resolution');
    assert.equal(extension.getDistanceIn({PORT: 'B', UNIT: 'cm'}), 34.5);
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

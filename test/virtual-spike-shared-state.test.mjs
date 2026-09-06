// SPDX-License-Identifier: Apache-2.0
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = '../overlay/scratch-gui/src/lib/virtual-hub/';
const {default: HubState} = await import(resolve(here, `${root}spike-hub-state.js`));
const {VirtualSpikePrimePeripheral} = await import(resolve(here, `${root}spike-prime-peripheral.js`));
const {VirtualSpikeClassicSocket} = await import(resolve(here, `${root}spike-classic-scratch-link.js`));

test('BLE and Classic adapters share one neutral state and failsafe', () => {
    const hubState = new HubState();
    const ble = new VirtualSpikePrimePeripheral({hubState});
    const classic = new VirtualSpikeClassicSocket('ws://127.0.0.1:20111/scratch/bt', {hubState});
    ble.setPort('D', 'motor', {speed: 60, position: 45});
    assert.equal(classic.state.classicPorts[3][1][0], 60);
    hubState.setPort('B', 'distance', {distance: 321});
    assert.equal(ble.state.sensors[1].distance, 321);
    classic.close();
    assert.equal(ble.state.motors[3].speed, 0);
});

test('firmware target controls which transport is advertised', () => {
    const state = new HubState();
    const peripheral = new VirtualSpikePrimePeripheral({hubState: state});
    state.setFirmwareTarget('legacy-v2');
    assert.equal(peripheral.services.length, 0);
    state.setFirmwareTarget('official-v3');
    assert.equal(peripheral.services.length, 1);
    state.setFirmwareTarget('brickwright');
    assert.equal(peripheral.services.length, 1);
    assert.equal(globalThis.__brickwrightUseVirtualSpike, true);
    state.setFirmwareTarget('pybricks');
    assert.equal(peripheral.services.length, 0);
    assert.equal(globalThis.__brickwrightUseVirtualSpike, false);
});

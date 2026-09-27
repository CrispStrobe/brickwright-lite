import {test} from 'node:test';
import assert from 'node:assert/strict';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const {default: HubState} = await import(resolve(here,
    '../overlay/scratch-gui/src/lib/virtual-hub/spike-hub-state.js'));
const {loadSpikeTestRig} = await import(resolve(here,
    '../overlay/scratch-gui/src/lib/virtual-hub/spike-panel.js'));
const {snapshotSpikePorts, isSpikeExtensionLoaded} = await import(resolve(here,
    '../overlay/scratch-gui/src/lib/spike-port-snapshot.js'));

test('SPIKE ports appear only when a SPIKE extension is loaded', () => {
    const loaded = new Set();
    const vm = {extensionManager: {isExtensionLoaded: id => loaded.has(id)}};
    assert.equal(isSpikeExtensionLoaded(vm), false);
    loaded.add('spikeprime');
    assert.equal(isSpikeExtensionLoaded(vm), true);
    loaded.delete('spikeprime');
    loaded.add('spikeprimeble');
    assert.equal(isSpikeExtensionLoaded(vm), true);
    loaded.clear();
    assert.equal(isSpikeExtensionLoaded(vm), false);
});

test('Widgets shows real reported ports and does not mistake absent telemetry for an empty port', () => {
    const runtime = {peripheralExtensions: {spikeprime: {
        isConnected: () => true,
        portValues: {B: {type: 'force', pressed: true, force: 27},
            C: {type: 'color', color: 9}, D: {type: 'motor', speed: 0, position: 140},
            F: {type: 'matrix3', pixels: [9, 0, 0, 0, 9, 0, 0, 0, 9]}}
    }}};
    const snapshot = snapshotSpikePorts(runtime);
    assert.equal(snapshot.mode, 'live');
    assert.deepEqual(snapshot.ports.map(port => port.port), [...'ABCDEF']);
    assert.equal(snapshot.ports[0].label, 'No telemetry');
    assert.equal(snapshot.ports[1].detail, 'pressed · 27');
    assert.equal(snapshot.ports[2].detail, 'red');
    assert.equal(snapshot.ports[5].pixels.length, 9);
});

test('Widgets follows the shared virtual hub when no physical hub is attached', () => {
    const state = new HubState();
    loadSpikeTestRig(state);
    const snapshot = snapshotSpikePorts({peripheralExtensions: {}}, state);
    assert.equal(snapshot.mode, 'virtual');
    assert.deepEqual(snapshot.ports.map(port => port.label), [
        'Boost motor', 'Force sensor', 'Color sensor', 'SPIKE motor',
        'SPIKE Essential motor', 'Boost color/distance'
    ]);
    state.setMotorSpeed('D', 35);
    assert.match(snapshotSpikePorts({}, state).ports[3].detail, /35%/);
    state.setSimulationEnabled(false);
    assert.equal(snapshotSpikePorts({}, state).mode, 'offline');
});

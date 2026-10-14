// SPDX-License-Identifier: Apache-2.0
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const root = '../overlay/scratch-gui/src/lib/virtual-hub/';
const {default: HubState} = await import(resolve(here, `${root}spike-hub-state.js`));
const {applyVirtualPortInput, loadSpikeTestRig, openVirtualSpikePanel, closeVirtualSpikePanel} =
    await import(resolve(here, `${root}spike-panel.js`));

test('dashboard inputs update the shared neutral state', () => {
    const state = new HubState();
    applyVirtualPortInput(state, 'A', 'motor', '75');
    applyVirtualPortInput(state, 'B', 'distance', '240');
    applyVirtualPortInput(state, 'C', 'force', '42');
    state.stepMotors(1000);
    assert.equal(state.data.motors[0].speed, 75);
    assert.equal(state.data.classicPorts[1][1][0], 240);
    assert.equal(state.data.sensors[2].pressed, true);
    state.setFirmwareTarget('legacy-v2');
    assert.equal(state.data.firmwareTarget, 'legacy-v2');
    assert.equal(state.data.simulationEnabled, false);
});

test('the A-F test rig is simulated without claiming unsupported Boost devices are SPIKE devices', () => {
    const state = new HubState();
    loadSpikeTestRig(state);
    assert.equal(state.data.simulationEnabled, true);
    assert.equal(state.data.firmwareTarget, 'official-v3');
    assert.deepEqual(state.data.sensors.map(sensor => sensor.kind),
        ['boostMotor', 'force', 'color', 'motor', 'motor', 'boostColorDistance']);
    assert.equal(state.data.sensors[0].deviceId, 38);
    assert.equal(state.data.sensors[5].deviceId, 37);
    assert.equal(state.data.sensors[3].deviceId, 75);
    assert.equal(state.data.sensors[4].deviceId, 65);
});

test('reopening and closing the dashboard releases its state subscription', () => {
    class Node {
        constructor (tag = '') { this.tagName = tag.toUpperCase(); this.children = []; this.style = {};
            this.parentNode = null; this.listeners = {}; }
        setAttribute (key, value) { this[key] = value; }
        addEventListener (type, listener) { this.listeners[type] = listener; }
        focus () { globalThis.document.activeElement = this; }
        appendChild (child) { child.parentNode = this; this.children.push(child); return child; }
        append (...children) { for (const child of children) this.appendChild(child); }
        removeChild (child) { this.children = this.children.filter(item => item !== child); child.parentNode = null; }
    }
    const body = new Node('body');
    const priorFocus = new Node('button');
    const priorDocument = globalThis.document;
    globalThis.document = {body, activeElement: priorFocus, createElement: tag => new Node(tag),
        createTextNode: text => ({text, parentNode: null})};
    try {
        const state = new HubState();
        let dialog = openVirtualSpikePanel(state);
        assert.equal(dialog.role, 'dialog');
        assert.equal(dialog['aria-modal'], 'true');
        assert.equal(dialog['aria-label'], 'Virtual SPIKE Prime controls');
        assert.equal(document.activeElement.type, 'checkbox', 'the one simulation switch receives initial focus');
        assert.equal(state.listeners.size, 1);
        const enabled = document.activeElement;
        const controls = [];
        const visit = node => {
            if (node?.tagName === 'SELECT' || node?.tagName === 'INPUT') controls.push(node);
            for (const child of node?.children || []) visit(child);
        };
        visit(dialog);
        assert.ok(controls.some(node => node['aria-label'] === 'Firmware profile'));
        for (const port of 'ABCDEF') {
            assert.ok(controls.some(node => node['aria-label'] === `Port ${port} device type`));
            assert.ok(controls.some(node => node['aria-label'] === `Port ${port} value`));
        }
        state.configurationOwner = {};
        state.changed();
        assert.ok(controls.every(control => control.disabled === true), 'device and value controls lock during firmware ownership');
        enabled.checked = true;enabled.listeners.change();
        assert.equal(state.data.simulationEnabled, false, 'programmatic events cannot bypass the read-only controls');
        state.configurationOwner = null;state.changed();
        assert.ok(controls.every(control => control.disabled === false), 'closing firmware unlocks the existing controls');
        enabled.checked = true;
        enabled.listeners.change();
        assert.equal(state.data.simulationEnabled, true);
        state.externalBackend = {adapter: {hubIo: true}, closed: false};
        dialog = openVirtualSpikePanel(state);
        const hubControls = [];
        const findHub = node => {
            if (node?.['aria-label']?.startsWith('Hub ') || node?.['aria-label']?.startsWith('Raw ')) hubControls.push(node);
            for (const child of node?.children || []) findHub(child);
        };
        findHub(dialog);
        assert.equal(hubControls.length, 11, 'four buttons and seven signed raw samples');
        const button = hubControls.find(node => node['aria-label'] === 'Hub left button');
        button.checked = true;button.listeners.change();assert.equal(state.data.buttons.left, true);
        const raw = hubControls.find(node => node['aria-label'] === 'Raw acceleration x');
        raw.value = '-32768';raw.listeners.input();assert.equal(state.data.imuRaw.acceleration[0], -32768);
        for (const value of ['32768', '1.5', '']) {
            raw.value = value;raw.listeners.input();assert.equal(state.data.imuRaw.acceleration[0], -32768);
        }
        state.externalBackend.closed = true;
        button.checked = false;button.listeners.change();assert.equal(state.data.buttons.left, true, 'late closed-session events cannot alter input');
        assert.equal(state.listeners.size, 1);
        const reopenedEnabled = document.activeElement;
        let tabPrevented = false;
        dialog.listeners.keydown({key: 'Tab', shiftKey: true,
            preventDefault: () => { tabPrevented = true; }});
        assert.equal(tabPrevented, true);
        assert.equal(document.activeElement.tagName, 'BUTTON', 'reverse Tab wraps to Done');
        dialog.listeners.keydown({key: 'Tab', shiftKey: false, preventDefault: () => {}});
        assert.equal(document.activeElement, reopenedEnabled, 'forward Tab wraps to the simulation switch');
        let prevented = false;
        dialog.listeners.keydown({key: 'Escape', preventDefault: () => { prevented = true; }});
        assert.equal(prevented, true);
        assert.equal(body.children.length, 0);
        closeVirtualSpikePanel();
        assert.equal(state.listeners.size, 0);
        assert.equal(document.activeElement, priorFocus);
    } finally {
        globalThis.document = priorDocument;
    }
});

// SPDX-License-Identifier: Apache-2.0
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const root = '../overlay/scratch-gui/src/lib/virtual-hub/';
const {default: HubState} = await import(resolve(here, `${root}spike-hub-state.js`));
const {applyVirtualPortInput, openVirtualSpikePanel, closeVirtualSpikePanel} =
    await import(resolve(here, `${root}spike-panel.js`));

test('dashboard inputs update the shared neutral state', () => {
    const state = new HubState();
    applyVirtualPortInput(state, 'A', 'motor', '75');
    applyVirtualPortInput(state, 'B', 'distance', '240');
    applyVirtualPortInput(state, 'C', 'force', '42');
    assert.equal(state.data.motors[0].speed, 75);
    assert.equal(state.data.classicPorts[1][1][0], 240);
    assert.equal(state.data.sensors[2].pressed, true);
    state.setFirmwareTarget('legacy-v2');
    assert.equal(state.data.firmwareTarget, 'legacy-v2');
    assert.equal(state.data.simulationEnabled, false);
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
        enabled.checked = true;
        enabled.listeners.change();
        assert.equal(state.data.simulationEnabled, true);
        dialog = openVirtualSpikePanel(state);
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

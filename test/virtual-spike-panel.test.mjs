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
        constructor () { this.children = []; this.style = {}; this.parentNode = null; }
        setAttribute (key, value) { this[key] = value; }
        addEventListener () {}
        appendChild (child) { child.parentNode = this; this.children.push(child); return child; }
        append (...children) { for (const child of children) this.appendChild(child); }
        removeChild (child) { this.children = this.children.filter(item => item !== child); child.parentNode = null; }
    }
    const body = new Node();
    const priorDocument = globalThis.document;
    globalThis.document = {body, createElement: () => new Node(), createTextNode: text => ({text, parentNode: null})};
    try {
        const state = new HubState();
        openVirtualSpikePanel(state);
        assert.equal(state.listeners.size, 1);
        openVirtualSpikePanel(state);
        assert.equal(state.listeners.size, 1);
        closeVirtualSpikePanel();
        closeVirtualSpikePanel();
        assert.equal(state.listeners.size, 0);
    } finally {
        globalThis.document = priorDocument;
    }
});

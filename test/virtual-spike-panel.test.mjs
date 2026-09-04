// SPDX-License-Identifier: Apache-2.0
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const root = '../overlay/scratch-gui/src/lib/virtual-hub/';
const {default: HubState} = await import(resolve(here, `${root}spike-hub-state.js`));
const {applyVirtualPortInput} = await import(resolve(here, `${root}spike-panel.js`));

test('dashboard inputs update the shared neutral state', () => {
    const state = new HubState();
    applyVirtualPortInput(state, 'A', 'motor', '75');
    applyVirtualPortInput(state, 'B', 'distance', '240');
    applyVirtualPortInput(state, 'C', 'force', '42');
    assert.equal(state.data.motors[0].speed, 75);
    assert.equal(state.data.classicPorts[1][1][0], 240);
    assert.equal(state.data.sensors[2].pressed, true);
});

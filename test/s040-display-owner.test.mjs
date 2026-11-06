// SPDX-License-Identifier: BSD-3-Clause
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read = name => readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');
const source = read('overlay/scratch-gui/src/components/tw-pseudocode/debug-panel.jsx');

test('placed S040 retains its circuit face while standalone boards retain the generic mirror', () => {
    assert.equal(read('packages/scratch-gui/src/components/tw-pseudocode/debug-panel.jsx'), source);
    const start = source.indexOf('    mirrorLabwiredDisplay (runner) {');
    const end = source.indexOf('    setSamdButton (', start);
    assert.ok(start >= 0 && end > start, 'actual mirror method exists');
    const calls = [];
    const Panel = new Function('window', `return class { ${source.slice(start, end)} };`)({
        bwMirrorMachineVideo: payload => calls.push(payload)
    });
    const panel = new Panel();
    panel.state = {kind: 'labwired', labwiredChip: 'firmware:esp32-4848s040-merged-flash'};
    let reads = 0;
    const video = () => { reads++; return {width: 480, height: 480}; };
    panel.mirrorLabwiredDisplay({esp32S040PartId: 'panel-a', video});
    assert.equal(calls.length, 0, 'the placed part owns the display');
    assert.equal(reads, 0, 'no generic mirror is started');
    panel.mirrorLabwiredDisplay({video});
    assert.equal(calls.length, 1, 'standalone S040 retains its display');
    panel.state.labwiredChip = 'board:microbit-v2';
    panel.mirrorLabwiredDisplay({video});
    assert.equal(calls.length, 2, 'other LabWired boards retain their display');
});

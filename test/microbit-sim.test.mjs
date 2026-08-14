import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const overlay = resolve(here, '../overlay/scratch-gui');

test('microbit-sim-pane.jsx exists in overlay', () => {
    assert.ok(existsSync(resolve(overlay, 'src/components/tw-pseudocode/microbit-sim-pane.jsx')),
        'microbit-sim-pane.jsx missing');
});

test('simulator assets exist in static/microbit-sim/', () => {
    const base = resolve(overlay, 'static/microbit-sim');
    assert.ok(existsSync(resolve(base, 'simulator.html')), 'simulator.html missing');
    assert.ok(existsSync(resolve(base, 'build/firmware.js')), 'firmware.js missing');
    assert.ok(existsSync(resolve(base, 'build/firmware.wasm')), 'firmware.wasm missing');
    assert.ok(existsSync(resolve(base, 'build/simulator.js')), 'simulator.js missing');
});

test('pseudocode-importer has micropython buffer and tab', () => {
    const src = readFileSync(
        resolve(overlay, 'src/components/tw-pseudocode/pseudocode-importer.jsx'), 'utf8'
    );
    assert.ok(src.includes("micropython: ''"), 'micropython buffer not in state');
    assert.ok(src.includes("'micropython'"), 'micropython tab entry not found');
    assert.ok(src.includes('generateMicroPython'), 'generateMicroPython call not found');
    assert.ok(src.includes('flashMicrobitSim'), 'flashMicrobitSim method not found');
    assert.ok(src.includes('bw-microbit-flash'), 'bw-microbit-flash event not found');
});

test('gui.jsx lazy-loads MicrobitSimPane', () => {
    const src = readFileSync(
        resolve(overlay, 'src/components/gui/gui.jsx'), 'utf8'
    );
    assert.ok(src.includes('microbit-sim-pane.jsx'), 'microbit-sim-pane import not found');
    assert.ok(src.includes('MicrobitSimPane'), 'MicrobitSimPane component not found');
    assert.ok(src.includes("dockMode === 'microbit'"), 'microbit dock mode check not found');
});

test('stage-header has conditional microbit view button', () => {
    const src = readFileSync(
        resolve(overlay, 'src/components/stage-header/stage-header.jsx'), 'utf8'
    );
    assert.ok(src.includes('microbitSim'), 'microbitSim message not found');
    assert.ok(src.includes("dock: 'microbit'"), "dock: 'microbit' not found");
    assert.ok(src.includes('icon--microbit'), 'microbit icon import not found');
    assert.ok(src.includes('deviceIsMicrobit'), 'deviceIsMicrobit guard not found');
    assert.ok(src.includes('bw-device-id'), 'bw-device-id listener not found');
});

test('codemirror-editor handles micropython language', () => {
    const src = readFileSync(
        resolve(overlay, 'src/lib/codemirror-editor.jsx'), 'utf8'
    );
    assert.ok(src.includes("'micropython'"), 'micropython case not in langExtension');
});

test('about-data.js includes micropython-microbit-v2-simulator', () => {
    const src = readFileSync(
        resolve(overlay, 'src/components/menu-bar/about-data.js'), 'utf8'
    );
    assert.ok(src.includes('micropython-microbit-v2-simulator'),
        'micropython-microbit-v2-simulator not in about-data.js');
});

test('THIRD-PARTY-NOTICES.md includes micropython-microbit-v2-simulator', () => {
    const src = readFileSync(resolve(here, '../THIRD-PARTY-NOTICES.md'), 'utf8');
    assert.ok(src.includes('micropython-microbit-v2-simulator'),
        'micropython-microbit-v2-simulator not in THIRD-PARTY-NOTICES.md');
    assert.ok(src.includes('Micro:bit Educational Foundation'),
        'Foundation attribution missing');
});

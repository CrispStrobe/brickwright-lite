import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const gui = 'overlay/scratch-gui/src';
const vm = 'overlay/scratch-vm/src';

test('the console mirrors a real 160x120 stage and posts all eight controls', () => {
    const source = readFileSync(`${gui}/components/tw-pseudocode/arcade-device-pane.jsx`, 'utf8');
    assert.match(source, /drawImage\(source,[\s\S]*0, 4, 160, 120\)/);
    for (const button of ['up', 'down', 'left', 'right', 'a', 'b', 'start', 'select']) {
        assert.match(source, new RegExp(`${button}: \\{label:`), `${button} is not wired`);
    }
    assert.match(source, /postIOData\('keyboard'/);
    assert.match(source, /ARCADE_DEVICE_CHANGED/);
});

test('Arcade blocks mutate shared state instead of being VM no-ops', () => {
    const source = readFileSync(`${vm}/extensions/crispstrobe/arcade/index.js`, 'utf8');
    assert.doesNotMatch(source, /All no-ops/);
    assert.match(source, /buttonPressed\(args\)/);
    assert.match(source, /state\.neopixels\[index\] =/);
    assert.match(source, /this\._state\(\)\.sprites/);
    assert.match(source, /this\._runtime\.stopAll\(\)/);
});

test('PyBadge is a code-drawn circuit board, while LC is not given fake headers', () => {
    const sidecar = JSON.parse(readFileSync(`${gui}/lib/bw-circuit-ui/parts-data/pybadge.json`, 'utf8'));
    assert.equal(sidecar.kind, 'pybadge');
    assert.ok(sidecar.terminals.some(pin => pin.name === 'stemma_sda'));
    assert.ok(sidecar.terminals.some(pin => pin.name === 'd13'));
    const palette = readFileSync(`${gui}/lib/bw-circuit-ui/components/PartPalette.jsx`, 'utf8');
    assert.match(palette, /kind: 'pybadge'/);
    assert.doesNotMatch(palette, /kind: 'pybadge-lc'/);
});

test('recovered MakeCode source can leave through an honestly labelled project ZIP', () => {
    const importer = readFileSync(`${gui}/components/tw-pseudocode/pseudocode-importer.jsx`, 'utf8');
    assert.match(importer, /bw-export-makecode-source/);
    assert.match(importer, /Object\.entries\(project\.files\)/);
    assert.match(importer, /original files, not a reverse translation/i);
});

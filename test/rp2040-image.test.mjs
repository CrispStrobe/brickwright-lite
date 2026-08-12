import {test} from 'node:test';
import assert from 'node:assert/strict';

// rp2040js is a Node-optional dependency: the adapter imports it, but the
// tests here verify the adapter's contract without requiring the full
// rp2040js package (which needs Node ≥18 ESM). The fourth test below
// verifies sb3-creator's pin markers, which is standalone.

test('rp2040js-adapter exports createRp2040jsAdapter and RAM_START', async () => {
    // This import will fail in CI if rp2040js is not installed — that's
    // intentional: the build must have it.
    const mod = await import(
        '../packages/scratch-gui/src/lib/bw-board/rp2040js-adapter.js');
    assert.equal(typeof mod.createRp2040jsAdapter, 'function');
    assert.equal(mod.RAM_START, 0x20000000);
    assert.ok(mod.RP2040_PINS);
    assert.ok(mod.RP2040_PINS['GP0']);
    assert.ok(mod.RP2040_PINS['GP25']);
    assert.ok(mod.RP2040_PINS['GP28']);
});

test('RP2040_PINS maps GP26-GP28 to ADC channels 0-2', async () => {
    const {RP2040_PINS} = await import(
        '../packages/scratch-gui/src/lib/bw-board/rp2040js-adapter.js');
    assert.equal(RP2040_PINS['GP26'].adcChannel, 0);
    assert.equal(RP2040_PINS['GP27'].adcChannel, 1);
    assert.equal(RP2040_PINS['GP28'].adcChannel, 2);
});

test('board pin markers preserve Arduino and Pico pin vocabularies', async () => {
    const {default: SB3Creator} = await import(
        '../packages/scratch-gui/src/lib/sb3-creator.js');
    const creator = new SB3Creator();
    const markers = creator.stcStructMarkers({
        stc: {
            device: 'pico',
            pins: [
                {name: 'led', where: 'GP25', direction: 'output', activeLow: false},
                {name: 'button', where: 'GP14', direction: 'input', activeLow: true},
            ],
        },
    });
    assert.deepEqual(markers, [
        'scratch.device("pico", undefined)',
        'scratch.pin("led", "GP25", "output", 0)',
        'scratch.pin("button", "GP14", "input", 1)',
    ]);
});

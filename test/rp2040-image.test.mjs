import {test} from 'node:test';
import assert from 'node:assert/strict';
import {importIntegrated} from './helpers/bw-integrated.mjs';

// These adapter tests require installed rp2040js in the integrated GUI.
// Compiler-only pin marker coverage lives in board-pin-markers.test.mjs.

test('rp2040js-adapter exports createRp2040jsAdapter and RAM_START', async () => {
    // This import will fail in CI if rp2040js is not installed — that's
    // intentional: the build must have it.
    const mod = await importIntegrated('src/lib/bw-board/rp2040js-adapter.js');
    assert.equal(typeof mod.createRp2040jsAdapter, 'function');
    assert.equal(mod.RAM_START, 0x20000000);
    assert.ok(mod.RP2040_PINS);
    assert.ok(mod.RP2040_PINS['GP0']);
    assert.ok(mod.RP2040_PINS['GP25']);
    assert.ok(mod.RP2040_PINS['GP28']);
});
test('RP2040_PINS maps GP26-GP28 to ADC channels 0-2', async () => {
    const {RP2040_PINS} = await importIntegrated('src/lib/bw-board/rp2040js-adapter.js');
    assert.equal(RP2040_PINS['GP26'].adcChannel, 0);
    assert.equal(RP2040_PINS['GP27'].adcChannel, 1);
    assert.equal(RP2040_PINS['GP28'].adcChannel, 2);
});

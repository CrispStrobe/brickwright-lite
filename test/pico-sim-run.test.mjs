/**
 * pico-sim-run pure control helpers. The full install/reboot/GPIO chain is
 * proven in the hosted browser gate; these failure semantics need no emulator.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {waitFor} from '../overlay/scratch-gui/src/lib/pico-sim-run.js';

test('waitFor surfaces a terminal replacement failure without waiting for timeout', async () => {
    const failure = new Error('fresh USB epoch failed');
    await assert.rejects(waitFor(() => false, () => false, 60_000, () => failure), failure);
});

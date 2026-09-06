/**
 * pico-sim-run pure control helpers. The full install/reboot/GPIO chain is
 * proven in the hosted browser gate; these failure semantics need no emulator.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {waitFor} from '../overlay/scratch-gui/src/lib/pico-sim-run.js';

test('waitFor surfaces a terminal replacement failure without waiting for timeout', async () => {
    const failure = new Error('fresh USB epoch failed');
    await assert.rejects(waitFor(() => false, () => false, 60_000, () => failure), failure);
});

test('the two-run browser proof fails before starting run two when run one misses GPIO', async () => {
    const source = await readFile(new URL('../scripts/verify-pico-micropython.mjs', import.meta.url), 'utf8');
    const firstFailure = source.indexOf("throw new Error('the first Pico program did not drive GP25 high')");
    const stopFirstEpoch = source.indexOf("locator('[data-testid=\"bw-pico-sim-stop\"]')");
    const secondGpioPoll = source.indexOf("b.readPin('GP24')");
    assert.ok(firstFailure >= 0, 'the first required proof has no fail-fast boundary');
    assert.ok(firstFailure < stopFirstEpoch && stopFirstEpoch < secondGpioPoll,
        'a failed first run can still enter the second 180-second proof');
});

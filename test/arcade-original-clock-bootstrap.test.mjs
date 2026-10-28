import test from 'node:test';
import assert from 'node:assert/strict';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';

test('unmodified original Arcade program clock starts at zero and retains exact elapsed waits on a positive profiler clock',
    {timeout: 45000}, async () => {
        const actual = await runPxtArcade(`
let initialElapsed = control.millis()
pause(20)
let firstElapsed = control.millis()
pause(20)
let secondElapsed = control.millis()
`, {fakeClock: true});
        assert.equal(actual.initialElapsed, 0);
        assert.equal(actual.firstElapsed, 20);
        assert.equal(actual.secondElapsed, 40);
    });

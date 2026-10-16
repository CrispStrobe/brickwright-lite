import test from 'node:test';
import assert from 'node:assert/strict';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';

test('unmodified original Arcade starts at guest zero and retains exact elapsed waits on a positive profiler clock',
    {timeout: 45000}, async () => {
        const actual = await runPxtArcade(`
let initialElapsed = game.runtime()
pause(20)
let firstElapsed = game.runtime()
pause(20)
let secondElapsed = game.runtime()
`, {fakeClock: true});
        assert.equal(actual.initialElapsed, 0);
        assert.equal(actual.firstElapsed, 20);
        assert.equal(actual.secondElapsed, 40);
    });

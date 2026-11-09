import test from 'node:test';
import assert from 'node:assert/strict';
import {elapsedMatches} from '../scripts/lib/clock-elapsed.mjs';

test('fractional controlled-clock readings one second apart match exactly 1000 ms', () => {
    const before = 24.1, after = before + 1000; // the gate installs its clock at time 0
    assert.notEqual(after - before, 1000, 'the float difference itself is not exact');
    assert.ok(elapsedMatches(before, after, 1000));
    assert.ok(elapsedMatches(1000, 2000, 1000));
});

test('a real clock error is still caught', () => {
    const before = 24.1;
    for (const wrong of [999, 1001, 999.5, 1000.01, 0, 2000]) assert.equal(elapsedMatches(before, before + wrong, 1000), false, String(wrong));
    assert.equal(elapsedMatches(NaN, 1000, 1000), false);
    assert.equal(elapsedMatches(0, Infinity, 1000), false);
});

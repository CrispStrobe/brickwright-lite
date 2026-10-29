// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createTiltOnset} from './helpers/tilt-onset.mjs';
const q = degrees => [Math.sin(degrees * Math.PI / 360), 0, 0, Math.cos(degrees * Math.PI / 360)];
const init = () => createTiltOnset({tableRotation: q(0), towerRotation: q(0)});
const observe = (onset, step, table, tower, phase = 'hold', command = 0) => onset.observe({
    tableRotation: q(table), towerRotation: q(tower), step, timeSeconds: step * .005, phase, command});
const armed = () => { const onset = init(); observe(onset, 1, 0, 0, 'settle', null); onset.arm(); return onset; };
for (const sign of [1, -1]) {
    test(`first completed-step crossing is retained in direction ${sign}`, () => {
        const onset = armed();
        observe(onset, 2, sign * 6, sign * 10, 'poll');
        assert.equal(onset.first(), null);
        const first = observe(onset, 3, sign * 7.2, sign * 12.5);
        assert.equal(first.tipped, true);
        observe(onset, 4, sign * 7.6, sign * 110);
        const result = onset.result();
        assert.equal(result.first, first);
        assert.ok(Math.abs(result.first.tableDegrees - sign * 7.2) < 1e-12);
        assert.ok(Math.abs(result.last.tableDegrees - sign * 7.6) < 1e-12);
        assert.equal(result.first.step, 3);
        assert.equal(result.samples, 4);
    });
    test(`late wrap and re-entry cannot replace first crossing in direction ${sign}`, () => {
        const onset = armed();
        const first = observe(onset, 2, sign * 7.2, sign * 12.5);
        observe(onset, 3, sign * 7.6, sign * 170);
        const below = observe(onset, 4, sign * 7.7, sign * 10);
        assert.equal(below.tipped, false);
        observe(onset, 5, sign * 7.8, sign * 30);
        assert.equal(onset.result().first, first);
        assert.equal(onset.result().last.step, 5);
    });
}
test('frozen-output tower never supplies a crossing', () => {
    const onset = armed();
    for (let step = 2; step <= 8; step++) observe(onset, step, 0, 0);
    assert.equal(onset.first(), null);
    assert.throws(() => onset.result(), /missing completed-step tilt crossing/);
});
for (const sign of [1, -1]) {
    test(`a frozen world-space tower cannot pass the unchanged critical-error guard in direction ${sign}`, () => {
        const onset = armed();
        for (let n = 1; n <= 80; n++) observe(onset, n + 1, sign * n / 10, 0);
        const first = onset.result().first;
        const critical = Math.atan((10 - 1.25) / (72.74509803921569 - 1.25)) * 180 / Math.PI;
        assert.ok(Math.abs(first.tableDegrees) <= 5.2);
        assert.equal(first !== null && Math.abs(Math.abs(first.tableDegrees) - critical) <= 0.5, false);
        // A late sample near the expected angle could otherwise hide frozen output.
        assert.equal(Math.abs(7.2 - critical) <= 0.5, true);
    });
}
test('strict predicate does not count an aligned moving tower as tipped', () => {
    const onset = armed();
    observe(onset, 2, 7, 7);
    observe(onset, 3, 7, 11.9);
    assert.equal(onset.first(), null);
    observe(onset, 4, 7, 12.1);
    assert.equal(onset.first().step, 4);
});
test('first output cannot be rewritten through caller pose arrays or result references', () => {
    const onset = armed(), table = q(7.2), tower = q(12.5);
    onset.observe({tableRotation: table, towerRotation: tower, step: 2, timeSeconds: .01, phase: 'hold', command: 0});
    const first = onset.first(); table.fill(0); tower.fill(0);
    assert.throws(() => { first.tableDegrees = 100; }, TypeError);
    assert.throws(() => { onset.result().first = null; }, TypeError);
    assert.ok(Math.abs(first.tableDegrees - 7.2) < 1e-12);
});
test('missing, nonfinite and undefined initial poses refuse', () => {
    for (const bad of [undefined, [], [0, 0, 0], [0, 0, 0, 0], [NaN, 0, 0, 1], [Infinity, 0, 0, 1]]) {
        assert.throws(() => createTiltOnset({tableRotation: bad, towerRotation: q(0)}));
        assert.throws(() => createTiltOnset({tableRotation: q(0), towerRotation: bad}));
    }
});
test('pre-tipped initial and settle poses refuse in either direction', () => {
    for (const sign of [1, -1]) {
        assert.throws(() => createTiltOnset({tableRotation: q(0), towerRotation: q(sign * 6)}), /pre-tipped/);
        const onset = init();
        assert.throws(() => observe(onset, 1, 0, sign * 6, 'settle', null), /pre-tipped/);
    }
});
test('arming without a completed settle observation refuses', () => {
    assert.throws(() => init().arm(), /missing completed settle/);
    const onset = armed(); assert.throws(() => onset.arm(), /missing completed settle/);
});
test('missing or out-of-order completed observations refuse', () => {
    for (const change of [{step: 3}, {timeSeconds: 0}, {timeSeconds: NaN}, {phase: 'settle'}, {phase: 'unknown'}, {command: null}]) {
        const onset = armed();
        assert.throws(() => onset.observe({tableRotation: q(7), towerRotation: q(13), step: 2, timeSeconds: .01, phase: 'hold', command: 0, ...change}));
    }
});
test('a nonfinite pose after first crossing refuses rather than hiding behind a latched result', () => {
    const onset = armed(); observe(onset, 2, 7.2, 12.5);
    assert.throws(() => onset.observe({tableRotation: q(8), towerRotation: [NaN, 0, 0, 1], step: 3, timeSeconds: .015, phase: 'hold', command: 0}));
});

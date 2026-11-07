// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
// The contract validator's piece-count rule: an honest positive integer, no minimum (decision 2026-11-07).
import test from 'node:test';
import assert from 'node:assert/strict';
import {assertHonestPartCount, qualificationContracts} from '../scripts/lib/robot-lab-qualification.mjs';

test('an honest small piece count is accepted', () => {
    for (const n of [1, 20, 31, 44, 51, 400]) assert.doesNotThrow(() => assertHonestPartCount(n));
});

test('a missing, non-integer or non-positive piece count is still rejected', () => {
    for (const bad of [undefined, null, '20', 20.5, NaN, Infinity, 0, -3]) assert.throws(() => assertHonestPartCount(bad));
});

test('the registered contracts still validate', () => {
    assert.ok(qualificationContracts().length > 0);
});

// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require = createRequire(import.meta.url);
const {validArenaInputs} = require('../overlay/scratch-vm/src/extension-support/arena-inputs.js');
test('semantic input frames reject addresses, commands, duplicate ports and invalid units', () => {
    assert.equal(validArenaInputs({sensors: [{port: 'D', kind: 'distance', values: {distanceMillimeters: -1}}],
        loads: [{port: 'A', percent: 100}]}), true);
    for (const bad of [null, {sensors: [], loads: [], address: 0x20040000}, {sensors: [], loads: [], monitor: 'start'},
        {sensors: [], loads: [{port: 'A', percent: true}]}, {sensors: [], loads: [{port: 'A', percent: 101}]},
        {sensors: [], loads: [{port: 'A', percent: 1}, {port: 'A', percent: 2}]},
        {sensors: [{port: 'D', kind: 'distance', values: {distanceMillimeters: -2}}], loads: []}]) {
        assert.equal(validArenaInputs(bad), false);
    }
});

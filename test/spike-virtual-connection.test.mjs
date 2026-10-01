// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {connectVirtualSpike} from '../overlay/scratch-gui/src/lib/virtual-hub/connect-virtual-spike.js';

test('disconnects a pre-existing physical session and selects only the shared virtual hub', async () => {
    const hubState = {}, other = {}, previous = () => null;
    const host = {__brickwrightChooseVirtualBluetooth: previous};
    let connected = true;
    const calls = [];
    await connectVirtualSpike({host, hubState, connected: () => connected,
        disconnect: () => {calls.push('disconnect'); connected = false;},
        connect: () => {
            calls.push('connect');
            assert.equal(host.__brickwrightChooseVirtualBluetooth.virtualOnly, true);
            assert.deepEqual(host.__brickwrightChooseVirtualBluetooth([{hubState: other}, {hubState}]), {hubState});
            connected = true;
        }});
    assert.deepEqual(calls, ['disconnect', 'connect']);
    assert.equal(host.__brickwrightChooseVirtualBluetooth, previous);
});

test('a missing shared device fails closed and restores the previous chooser', async () => {
    const host = {}, hubState = {};
    await assert.rejects(connectVirtualSpike({host, hubState, connected: () => false, disconnect () {},
        connect: () => host.__brickwrightChooseVirtualBluetooth([{hubState: {}}])}), /unavailable/);
    assert.equal(host.__brickwrightChooseVirtualBluetooth, undefined);
});

test('a connection reported without virtual selection is rejected', async () => {
    let connected = false;
    await assert.rejects(connectVirtualSpike({host: {}, hubState: {}, connected: () => connected,
        disconnect () {}, connect: () => {connected = true;}}), /shared virtual/);
});

test('failure to disconnect prevents any new scan', async () => {
    await assert.rejects(connectVirtualSpike({host: {}, hubState: {}, connected: () => true,
        disconnect () {}, connect: () => assert.fail('must not scan')}), /disconnect/);
});

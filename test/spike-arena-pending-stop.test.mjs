// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import VirtualSpikeHubState from '../overlay/scratch-gui/src/lib/virtual-hub/spike-hub-state.js';
import {ArenaHubBridge} from '../overlay/scratch-gui/src/lib/spike-arena/arena-hub-bridge.js';

// Authored native teardown promises, with the actual hub clock guard and bridge.
// These controls do not execute an installed application or a guest.
const source = readFileSync(new URL('../overlay/scratch-gui/src/components/tw-pseudocode/spike-arena-pane.jsx', import.meta.url), 'utf8');
const begin = source.indexOf('    async stopProgram (');
const end = source.indexOf('\n    async ', begin + 1);
assert.ok(begin > 0 && end > begin);
const fixture = () => {
    let resolve, reject;
    const held = new Promise((yes, no) => { resolve = yes; reject = no; });
    const hub = new VirtualSpikeHubState();
    const events = [];
    hub.clockOwner = 'renode';
    const firmware = {
        calls: 0,
        stop () {
            this.calls++;
            this.closed = true;
            this.onStop?.();
            return held.then(() => { hub.clockOwner = null; hub.externalBackend = null; });
        },
        cancel () { return this.stop(); }
    };
    hub.externalBackend = firmware;
    const pane = new Function('ArenaHubBridge', `return ({${source.slice(begin, end)}});`)(ArenaHubBridge);
    Object.assign(pane, {
        disposed: false, bridge: {}, firmwareSession: firmware, hubState: hub,
        arenaFirmwareTopology: 'dual-ultrasonic',
        world: {mat: {width: 100, height: 100, border: false}, start: {x: 30, y: 40, heading: 0},
            walls: [], objects: [], zones: [], success: [{type: 'heading', target: 90}], failure: [], timeLimitMs: 10000},
        clock: {uninstall () { events.push('clock'); }},
        vm: {stopAll () { events.push('vm'); }}, spikeLoaded: () => true,
        setState (patch) { events.push(patch); }
    });
    return {pane, firmware, hub, events, resolve, reject};
};
const tick = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };

for (const count of [2, 3, 8]) {
    test(`${count} Stops wait for the same detached native teardown`, async () => {
        const f = fixture(), bridge = f.pane.bridge;
        const tasks = Array.from({length: count}, () => f.pane.stopProgram({restart: true}));
        const completed = Promise.allSettled(tasks);
        let settled = 0;
        tasks.forEach(task => task.then(() => { settled++; }, () => {}));
        try {
            await tick();
            assert.equal(settled, 0);
            assert.equal(f.firmware.calls, 1);
            assert.equal(f.pane.firmwareSession, null);
            assert.equal(f.pane.bridge, bridge);
            assert.equal(f.hub.clockOwner, 'renode');
            assert.deepEqual(f.events, []);
            f.resolve(); await Promise.all(tasks);
            assert.equal(f.hub.clockOwner, null);
            assert.ok(f.pane.bridge instanceof ArenaHubBridge);
            assert.deepEqual(f.events, ['clock', {status: 'ready'}, 'vm']);
            await f.pane.stopProgram();
            assert.equal(f.firmware.calls, 1, 'A completed teardown is not invoked again');
        } finally { f.resolve(); await completed; }
    });
}

test('synchronous Stop listener joins the already published native teardown', async () => {
    const f = fixture(); let reentrant;
    f.firmware.onStop = () => { reentrant = f.pane.stopProgram({restart: true}); };
    const first = f.pane.stopProgram();
    const completed = Promise.allSettled([first, reentrant]);
    try {
        await tick(); assert.deepEqual(f.events, []);
        f.resolve();
        const results = await completed;
        assert.ok(results.every(result => result.status === 'fulfilled'));
        assert.equal(f.firmware.calls, 1);
        assert.deepEqual(f.events, ['clock', {status: 'ready'}, 'vm']);
    } finally { f.resolve(); await completed; }
});

for (const lifecycle of ['disposed', 'bridge-replaced', 'intent-replaced']) {
    test(`pending Stops leave shared state alone after ${lifecycle}`, async () => {
        const f = fixture(); const first = f.pane.stopProgram(); const second = f.pane.stopProgram({restart: true});
        if (lifecycle === 'disposed') f.pane.disposed = true;
        if (lifecycle === 'bridge-replaced') f.pane.bridge = {};
        if (lifecycle === 'intent-replaced') f.pane.programIntent = {};
        const bridge = f.pane.bridge;
        f.resolve(); await Promise.all([first, second]);
        assert.equal(f.hub.clockOwner, null);
        assert.equal(f.pane.bridge, bridge);
        assert.deepEqual(f.events, []);
    });
}

for (const reentrant of [false, true]) {
    test(`original teardown error reaches current Stop, reentrant=${reentrant}`, async () => {
        const f = fixture(), error = new Error('original native stop failure'); let second;
        if (reentrant) f.firmware.onStop = () => { second = f.pane.stopProgram(); };
        const first = f.pane.stopProgram();
        if (!reentrant) second = f.pane.stopProgram();
        const rejects = assert.rejects(second, actual => actual === error);
        f.reject(error); await Promise.all([first, rejects]);
        assert.equal(f.hub.clockOwner, 'renode');
        assert.deepEqual(f.events, []);
    });
}

test('synchronous teardown exception preserves original error', async () => {
    const f = fixture(), error = new Error('synchronous stop failure');
    f.firmware.stop = () => { throw error; };
    await assert.rejects(f.pane.stopProgram(), actual => actual === error);
    assert.deepEqual(f.events, []);
});

test('replacement teardown waits for every outstanding native stop before reporting failure', async () => {
    const f = fixture(), error = new Error('first native failure');
    const first = f.pane.stopProgram();
    let release;
    f.pane.firmwareSession = {stop: () => new Promise(resolve => { release = resolve; })};
    const second = f.pane.stopProgram(); let settled = false;
    const rejection = assert.rejects(second, actual => actual === error).then(() => { settled = true; });
    f.reject(error); await tick();
    assert.equal(settled, false, 'An earlier error must not retire a still-pending replacement teardown');
    assert.deepEqual(f.events, []);
    release(); await Promise.all([first, rejection]);
});

test('an earlier completion cannot clear a replacement teardown still in flight', async () => {
    const f = fixture();
    const first = f.pane.stopProgram();
    let release;
    f.pane.firmwareSession = {stop: () => new Promise(resolve => { release = resolve; })};
    const second = f.pane.stopProgram();
    f.resolve(); await first;
    const third = f.pane.stopProgram(); let settled = false;
    const completed = third.then(() => { settled = true; });
    try {
        await tick();
        assert.equal(settled, false);
        assert.deepEqual(f.events, []);
    } finally { release(); await Promise.all([second, completed]); }
    assert.deepEqual(f.events, ['clock', 'vm']);
});

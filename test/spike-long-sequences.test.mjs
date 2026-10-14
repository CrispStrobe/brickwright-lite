// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
import {test} from 'node:test';
import assert from 'node:assert/strict';
import Hub from '../overlay/scratch-gui/src/lib/virtual-hub/spike-hub-state.js';
import {ArenaHubBridge} from '../overlay/scratch-gui/src/lib/spike-arena/arena-hub-bridge.js';
import {sandboxWorld} from '../overlay/scratch-gui/src/lib/spike-arena/arena-sandbox.js';

async function sequence (chunks, mutation = '') {
    const hub = new Hub(), backend = hub.backend;
    const world = sandboxWorld(); world.walls = []; world.objects = [];
    const arena = new ArenaHubBridge({hubState: hub, world});
    const advance = total => {
        let remaining = total, index = 0;
        while (remaining > 0) { const ms = Math.min(remaining, chunks[index++ % chunks.length]); arena.tick(ms); remaining -= ms; }
    };
    const trace = [];
    for (let round = 0; round < 30; round++) {
        const sign = round % 2 ? -1 : 1;
        const motion = [backend.runForDegrees('A', 90, -sign * 300), backend.runForDegrees('B', 90, sign * 300),
            backend.runToPosition('F', round * 3, 200)];
        const wait = backend.wait(125), beep = backend.beep(440 + round, 75);
        advance(1500);
        assert.deepEqual(await Promise.all([...motion, wait, beep]), Array(5).fill('completed'));
        assert.equal(hub.data.motors[0].position, round % 2 ? 0 : -90);
        assert.equal(hub.data.motors[1].position, round % 2 ? 0 : 90);
        const pending = [backend.runForTime('A', 5000, -200), backend.wait(5000), backend.beep(300, 5000)];
        advance(100);
        if (mutation !== 'lost-cancellation') backend.cancel();
        assert.equal(backend.busy('A'), false, 'cancellation immediately ends commanded motion');
        assert.deepEqual(await Promise.all(pending), Array(3).fill('interrupted'));
        backend.resetPosition('A', round % 2 ? 0 : -90);
        const stalled = backend.runToPosition('F', 1000, 300);
        backend.setLoad('F', 1); advance(600);
        assert.equal(await stalled, 'stalled');
        backend.setLoad('F', 0);
        trace.push({pose: {...arena.sim.pose}, sensors: structuredClone(arena.snapshot().sensors),
            motors: structuredClone(hub.data.motors), simulatedMs: backend.simulatedMs});
    }
    return trace;
}

test('30 mixed concurrent sequences, waits, cancellation and stalls reproduce across time chunk sizes', async () => {
    assert.deepEqual(await sequence([5]), await sequence([1, 17, 33, 2, 101]));
});
test('the long-sequence assertions detect lost cancellation', async () => {
    await assert.rejects(sequence([5], 'lost-cancellation'), assert.AssertionError);
});
test('bad commands cannot alter other active motors or cancel their waits', async () => {
    const hub = new Hub(), backend = hub.backend;
    const motion = backend.runToPosition('A', 120, 300), wait = backend.wait(100);
    const before = structuredClone(hub.data);
    assert.throws(() => backend.runForTime('B', -1, 100));
    assert.throws(() => backend.setLoad('A', Infinity));
    assert.throws(() => backend.runAtSpeed('Z', 100));
    await assert.rejects(backend.runToPosition('B', 10, 0));
    assert.deepEqual(hub.data, before);
    backend.step(2000);
    assert.deepEqual(await Promise.all([motion, wait]), ['completed', 'completed']);
    assert.equal(hub.data.motors[0].position, 120);
});

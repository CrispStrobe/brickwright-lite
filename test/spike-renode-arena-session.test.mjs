// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
import {test} from 'node:test';
import assert from 'node:assert/strict';
import Hub from '../overlay/scratch-gui/src/lib/virtual-hub/spike-hub-state.js';
import {ArenaHubBridge} from '../overlay/scratch-gui/src/lib/spike-arena/arena-hub-bridge.js';
import {RenodeArenaSession} from '../overlay/scratch-gui/src/lib/spike-arena/renode-arena-session.js';
import {sandboxWorld} from '../overlay/scratch-gui/src/lib/spike-arena/arena-sandbox.js';
const bridge = () => new ArenaHubBridge({hubState: new Hub(), world: sandboxWorld()});
test('cancel during startup closes only the session we started and never runs it', async () => {
    const calls = []; let release;
    const capabilities = Object.fromEntries(['session.start', 'session.close', 'run', 'state.read'].map(operation =>
        [`renode.spike.${operation}`, async () => {calls.push(operation);
            if (operation === 'session.start') await new Promise(resolve => {release = resolve;});
            return 'ready';}]));
    const session = new RenodeArenaSession({bridge: bridge(), capabilities});
    const starting = session.start(); const stopping = session.stop(); release();
    await Promise.all([starting, stopping]);
    assert.deepEqual(calls, ['session.start', 'session.close']);
    assert.equal(session.adapter.bridge.hubState.clockOwner, null);
});
test('failed startup does not close somebody else’s running debugger session', async () => {
    let closes = 0;
    const session = new RenodeArenaSession({bridge: bridge(), capabilities: {
        'renode.spike.session.start': async () => {throw new Error('already started');},
        'renode.spike.session.close': async () => {closes++;}
    }});
    await assert.rejects(session.start(), /already started/);
    assert.equal(closes, 0);
});
test('missing desktop boundary refuses before owning simulated time', async () => {
    const b = bridge(); const session = new RenodeArenaSession({bridge: b});
    await assert.rejects(session.start(), /unavailable/);
    assert.equal(b.hubState.clockOwner, null);
});
test('hub Stop cancels the externally owned guest and clears its ownership after close', async () => {
    const b = bridge(); let stops = 0;
    const frame = {schemaVersion: 1, type: 'snapshot', seq: 1, clockNs: 1000000,
        target: {board: 'spike-prime', firmware: 'brickwright-arena-demo', transport: 'none', imageSha256: 'a'.repeat(64),
            capabilities: ['arena-inputs/v1', 'arena-clock/v1', 'guest-motor-output/v1', 'state-sample/v1']}, lifecycle: {connectionGeneration: 1},
        ports: [{id: 'C', attached: true, kind: 'color'}, {id: 'D', attached: true, kind: 'distance'}, {id: 'E', attached: true, kind: 'force'}],
        motors: [{port: 'A', position: 0, speedDps: -2, demandDirection: -1, stalled: false},
            {port: 'B', position: 0, speedDps: 2, demandDirection: 1, stalled: false}]};
    const capabilities = Object.fromEntries(['session.start', 'session.close', 'run', 'state.read', 'arena.inputs.write'].map(operation =>
        [`renode.spike.${operation}`, async () => operation === 'state.read' ? JSON.stringify(frame) : 'ready']));
    const session = new RenodeArenaSession({bridge: b, capabilities, onStopped: () => {stops++;}});
    await session.start(); assert.equal(b.hubState.externalBackend, session);
    b.hubState.stopAll(); await session.completion;
    assert.equal(stops, 1); assert.equal(b.hubState.externalBackend, null); assert.equal(b.hubState.clockOwner, null);
});

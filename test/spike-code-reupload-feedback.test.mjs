// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import Hub from '../overlay/scratch-gui/src/lib/virtual-hub/spike-hub-state.js';
import {ArenaHubBridge} from '../overlay/scratch-gui/src/lib/spike-arena/arena-hub-bridge.js';
import {sandboxWorld} from '../overlay/scratch-gui/src/lib/spike-arena/arena-sandbox.js';
import {RenodeArenaSession} from '../overlay/scratch-gui/src/lib/spike-arena/renode-arena-session.js';
import {createCodeRunFeedback} from '../overlay/scratch-gui/src/lib/spike-arena/code-run-feedback.js';
import {encodePython, encodeInstructions} from '../overlay/scratch-gui/src/lib/spike-nuttx/upload-protocol.js';

// Authored native replies, real session/client/feedback and shipped pane methods.
// These are protocol controls, not installed-app or actual guest evidence.
const source = readFileSync(new URL('../overlay/scratch-gui/src/components/tw-pseudocode/spike-arena-pane.jsx', import.meta.url), 'utf8');
const methods = source.slice(source.indexOf('    firmwareProgramObserver ('), source.indexOf('    async programStorage ('));
const Pane = new Function('encodePython', 'encodeInstructions', `return class {${methods}};`)(encodePython, encodeInstructions);
const deferred = () => {
    let resolve;
    const promise = new Promise(done => {resolve = done;});
    return {promise, resolve};
};

async function fixture () {
    const bridge = new ArenaHubBridge({hubState: new Hub(), world: sandboxWorld()});
    let state = 0, seq = 0, holdRead, holdPacket, failure;
    const frame = () => ({schemaVersion: 1, type: 'snapshot', seq: ++seq, clockNs: seq * 1000000,
        target: {board: 'spike-prime', firmware: 'brickwright-nuttx', transport: 'none', imageSha256: 'a'.repeat(64),
            capabilities: ['arena-inputs/v1', 'arena-clock/v1', 'guest-motor-output/v1', 'state-sample/v1', 'nuttx-program/v1', 'nuttx-program-storage/v1']},
        lifecycle: {connectionGeneration: 1, nuttxProgram: {state, error: 0}},
        ports: [{id: 'C', attached: true, kind: 'color'}, {id: 'D', attached: true, kind: 'distance'}, {id: 'E', attached: true, kind: 'force'}],
        motors: ['A', 'B'].map(port => ({port, position: 0, speedDps: 0, demandDirection: 0, stalled: false}))});
    const packets = [];
    const capabilities = Object.fromEntries(['session.start', 'session.close', 'state.read', 'run', 'arena.inputs.write', 'program.packet'].map(op =>
        [`renode.spike.${op}`, async args => {
            if (op === 'state.read') {if (holdRead) await holdRead.promise; return JSON.stringify(frame());}
            if (op !== 'program.packet') return 'ready';
            const packet = args.bytes;
            packets.push(packet[2]);
            if ([2, 9].includes(packet[2])) state = 1;
            if (packet[2] === 3) state = 2;
            if (packet[2] === 4) state = 4;
            const result = frame(), reply = new Uint8Array(20), view = new DataView(reply.buffer);
            reply.set([0x71, 1, packet[2], state]);
            view.setUint32(4, 1, true); view.setUint16(14, 1, true);
            if (failure === packet[2]) view.setInt32(8, -22, true);
            result.lifecycle.nuttxProgramReply = [...reply];
            if (holdPacket?.op === packet[2]) {holdPacket.entered.resolve(); await holdPacket.gate.promise;}
            return JSON.stringify(result);
        }]));
    const session = new RenodeArenaSession({bridge, capabilities, backend: 'nuttx', source: 'print(1)'});
    await session.start(); clearTimeout(session.timer);
    const updates = [], feedback = createCodeRunFeedback(update => updates.push(update), {running: 'running', completed: 'completed'});
    const pane = new Pane();
    Object.assign(pane, {bridge, firmwareSession: session, state: {execution: 'nuttx', topology: 'default'},
        setState(update) {Object.assign(this.state, update);}});
    return {session, feedback, updates, packets,
        run: () => {
            const pending = pane.startFirmware(null, {source: 'print(2)', ...feedback.callbacks});
            pending.catch(() => {});
            return pending;
        },
        state: value => {state = value;},
        holdPoll () {holdRead = deferred(); session.tail = session.poll(); return () => {const held = holdRead; holdRead = null; held.resolve();};},
        hold (op) {holdPacket = {op, entered: deferred(), gate: deferred()}; return holdPacket;},
        fail (op) {failure = op;},
        async close () {holdRead?.resolve(); holdPacket?.gate.resolve(); clearTimeout(session.timer); await session.stop();}};
}

for (const previous of [0, 3, 4, 5]) test(`replacement feedback ignores previous state ${previous} and upload READY`, async () => {
    const f = await fixture();
    try {
        f.state(previous);
        const release = f.holdPoll(), held = f.hold(2);
        const running = f.run();
        release(); await held.entered.promise;
        assert.ok(f.updates.every(update => update.spike3Running), 'Old program and upload states must not terminate the new Code run');
        held.gate.resolve(); await running; clearTimeout(f.session.timer);
        assert.equal(f.updates.at(-1).status, 'running', 'The successful replacement START must publish before the caller returns');
        f.feedback.started();
        assert.equal(f.updates.at(-1).status, 'running');
        f.state(3); await f.session.poll(); clearTimeout(f.session.timer);
        assert.equal(f.updates.at(-1).status, 'completed');
    } finally {await f.close();}
});

test('replacement completion after a held START reply remains observable', async () => {
    const f = await fixture();
    try {
        const held = f.hold(3), running = f.run();
        await held.entered.promise;
        f.state(3); held.gate.resolve(); await running; clearTimeout(f.session.timer);
        await f.session.poll(); clearTimeout(f.session.timer);
        assert.equal(f.updates.at(-1).status, 'completed');
        assert.equal(f.session.completed, true);
    } finally {await f.close();}
});

test('replacement upload refusal still rejects rather than reporting old STOP/completion', async () => {
    const f = await fixture();
    try {
        f.fail(2);
        await assert.rejects(f.run(), /request failed/);
        assert.ok(f.updates.every(update => update.spike3Running), 'Only the caller error path should finish this run');
    } finally {await f.close();}
});

test('explicit cancellation wins over a delayed replacement reply', async () => {
    const f = await fixture();
    try {
        const held = f.hold(2), running = f.run();
        const rejected = assert.rejects(running, /cancelled|closed/);
        await held.entered.promise;
        f.feedback.requestStop(); const stopping = f.session.stop();
        held.gate.resolve(); await stopping; await rejected;
        assert.equal(f.updates.at(-1).status, 'Stopped.');
        assert.equal(f.updates.at(-1).spike3Running, false);
        assert.equal(f.packets.filter(op => op === 3).length, 1, 'No replacement START after cancellation');
    } finally {await f.close();}
});

test('Code Stop remains available while replacement waits for the previous poll', async () => {
    const f = await fixture();
    try {
        f.holdPoll(); f.run();
        assert.equal(f.updates.at(-1)?.spike3Running, true);
    } finally {await f.close();}
});

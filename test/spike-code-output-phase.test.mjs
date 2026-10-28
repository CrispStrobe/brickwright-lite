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
const Pane = new Function('encodePython', 'encodeInstructions', 'RenodeArenaSession', `return class {${methods}};`)(encodePython, encodeInstructions, RenodeArenaSession);
const deferred = () => {
    let resolve;
    const promise = new Promise(done => {resolve = done;});
    return {promise, resolve};
};

async function fixture () {
    const bridge = new ArenaHubBridge({hubState: new Hub(), world: sandboxWorld()});
    let state = 0, seq = 0, holdRead, holdPacket, failure, startOutput, outputHook, wrongStartId, startState = 2;
    const packetOutputs = new Map();
    let output = {sequence: 0, text: '', truncated: false};
    const outputs = [];
    const frame = () => ({schemaVersion: 1, type: 'snapshot', seq: ++seq, clockNs: seq * 1000000,
        target: {board: 'spike-prime', firmware: 'brickwright-nuttx', transport: 'none', imageSha256: 'a'.repeat(64),
            capabilities: ['arena-inputs/v1', 'arena-clock/v1', 'guest-motor-output/v1', 'state-sample/v1', 'nuttx-program/v1', 'nuttx-program-storage/v1']},
        lifecycle: {connectionGeneration: 1, nuttxProgram: {state, error: 0}, nuttxProgramOutput: {...output}},
        ports: [{id: 'C', attached: true, kind: 'color'}, {id: 'D', attached: true, kind: 'distance'}, {id: 'E', attached: true, kind: 'force'}],
        motors: ['A', 'B'].map(port => ({port, position: 0, speedDps: 0, demandDirection: 0, stalled: false}))});
    const packets = [];
    const capabilities = Object.fromEntries(['session.start', 'session.close', 'state.read', 'run', 'arena.inputs.write', 'program.packet'].map(op =>
        [`renode.spike.${op}`, async args => {
            if (op === 'state.read') {if (holdRead) await holdRead.promise; return JSON.stringify(frame());}
            if (op !== 'program.packet') return 'ready';
            const packet = args.bytes;
            if (packetOutputs.has(packet[2])) output = {...packetOutputs.get(packet[2])};
            packets.push(packet[2]);
            if ([2, 9].includes(packet[2])) state = 1;
            if (packet[2] === 3) { state = startState; if (startOutput) output = {...startOutput}; }
            if (packet[2] === 4) state = 4;
            const result = frame(), reply = new Uint8Array(20), view = new DataView(reply.buffer);
            reply.set([0x71, 1, packet[2], state]);
            view.setUint32(4, wrongStartId && packet[2] === 3 ? 2 : 1, true); view.setUint16(14, 1, true);
            if (failure === packet[2]) view.setInt32(8, -22, true);
            result.lifecycle.nuttxProgramReply = [...reply];
            if (holdPacket?.op === packet[2]) {holdPacket.entered.resolve(); await holdPacket.gate.promise;}
            return JSON.stringify(result);
        }]));
    const session = new RenodeArenaSession({bridge, capabilities, backend: 'nuttx', source: 'print(1)'});
    await session.start(); clearTimeout(session.timer);
    const updates = [], feedback = createCodeRunFeedback(update => updates.push(update), {running: 'running', completed: 'completed'});
    const pane = new Pane();
    Object.assign(pane, {bridge, hubState: bridge.hubState, nativeCapabilities: () => capabilities, draw() {},
        async stopProgram() {const old = this.firmwareSession; this.firmwareSession = null; if (old) await old.stop();},
        firmwareSession: session, state: {execution: 'nuttx', topology: 'default'},
        setState(update, done) {Object.assign(this.state, update); done?.();}});
    return {session, pane, feedback, updates, packets, outputs,
        packetOutput (op, sequence, text) { packetOutputs.set(op, {sequence, text, truncated: false}); },
        wrongStartId () { wrongStartId = true; },
        startState (value) { startState = value; },
        output (sequence, text) { output = {sequence, text, truncated: false}; },
        startOutput (sequence, text) { startOutput = {sequence, text, truncated: false}; },
        outputHook (callback) { outputHook = callback; },
        run: () => {
            const pending = pane.startFirmware(null, {source: 'print(2)', ...feedback.callbacks, onOutput: value => { outputs.push(value); outputHook?.(value); }});
            pending.catch(() => {});
            return pending;
        },
        state: value => {state = value;},
        holdPoll () {holdRead = deferred(); session.tail = session.poll(); return () => {const held = holdRead; holdRead = null; held.resolve();};},
        hold (op) {holdPacket = {op, entered: deferred(), gate: deferred()}; return holdPacket;},
        fail (op) {failure = op;},
        async close () {holdRead?.resolve(); holdPacket?.gate.resolve(); clearTimeout(session.timer); await session.stop();}};
}


// All frames/replies below are authored protocol controls. Production session,
// upload client and pane consumers execute; no firmware or native RPC is run.
test('replacement drains old poll and STOP output before publishing new Python output', async () => {
    const f = await fixture();
    try {
        f.output(2, 'old program');
        const release = f.holdPoll(), held = f.hold(2), pending = f.run();
        release(); await held.entered.promise;
        assert.deepEqual(f.outputs, [], 'A preceding poll and STOP belong to the old program');
        f.startOutput(4, 'new program'); held.gate.resolve(); await pending;
        clearTimeout(f.session.timer);
        assert.deepEqual(f.outputs.map(value => value.text), ['new program']);
        await f.session.poll(); clearTimeout(f.session.timer);
        assert.equal(f.outputs.length, 1, 'The same output snapshot is not replayed');
    } finally {await f.close();}
});

test('replacement with no current Python source still drains the old output snapshot', async () => {
    const f = await fixture();
    try {
        f.session.source = null; // Authored starting metadata: no current Python source.
        f.output(2, 'older Python output');
        const held = f.hold(2), pending = f.run(); await held.entered.promise;
        assert.deepEqual(f.outputs, [], 'BEGIN must not republish an old snapshot after source assignment');
        f.startOutput(4, 'current Python output'); held.gate.resolve(); await pending;
        clearTimeout(f.session.timer);
        assert.deepEqual(f.outputs.map(value => value.text), ['current Python output']);
    } finally {await f.close();}
});

test('new output observed in START is preserved before upload returns', async () => {
    const f = await fixture();
    try {
        f.startOutput(2, 'new immediate output'); await f.run(); clearTimeout(f.session.timer);
        assert.deepEqual(f.outputs.map(value => value.text), ['new immediate output']);
        await f.session.poll(); clearTimeout(f.session.timer);
        assert.equal(f.outputs.length, 1);
    } finally {await f.close();}
});

test('Stop from current replacement output still cancels subsequent publication', async () => {
    const f = await fixture();let stopping;
    try {
        f.outputHook(() => { stopping = f.session.stop(); });
        f.startOutput(2, 'stop now');
        await assert.rejects(f.run(), /cancelled|closed/);
        await stopping;
        assert.equal(f.session.closed, true);
        assert.deepEqual(f.outputs.map(value => value.text), ['stop now']);
        await f.session.poll(); assert.equal(f.outputs.length, 1);
    } finally {await f.close();}
});

test('old output remains validated while replacement drains a pending poll', async () => {
    const f = await fixture();
    try {
        f.output(-1, 'invalid');
        const mark = f.packets.length;
        const release = f.holdPoll(), pending = f.run();release();
        await assert.rejects(pending, /Invalid firmware output/);
        assert.deepEqual(f.packets.slice(mark), [], 'Invalid pending telemetry must reject before changing the program');
        assert.deepEqual(f.outputs, []);
        assert.equal(f.session.replacingProgram, false);
    } finally {await f.close();}
});

test('each replacement retry drains its own preceding output', async () => {
    const f = await fixture();
    try {
        f.startOutput(2, 'first replacement'); await f.run(); clearTimeout(f.session.timer);
        assert.deepEqual(f.outputs.map(value => value.text), ['first replacement']);
        f.outputs.length = 0; f.output(4, 'late previous output');
        const release = f.holdPoll(), held = f.hold(2), pending = f.run();
        release(); await held.entered.promise;
        assert.deepEqual(f.outputs, [], 'A retry establishes a new old-output boundary');
        f.startOutput(6, 'second replacement'); held.gate.resolve(); await pending;
        clearTimeout(f.session.timer);
        assert.deepEqual(f.outputs.map(value => value.text), ['second replacement']);
    } finally {await f.close();}
});

test('BEGIN CHUNK and COMMIT snapshots are drained until a successful START', async () => {
    const f = await fixture();
    try {
        f.packetOutput(0, 2, 'old at BEGIN'); f.packetOutput(1, 4, 'old at CHUNK'); f.packetOutput(2, 6, 'old at COMMIT');
        f.startOutput(8, 'new at START'); await f.run(); clearTimeout(f.session.timer);
        assert.deepEqual(f.outputs.map(value => value.text), ['new at START']);
    } finally {await f.close();}
});

test('rejected START does not authorize output for the replacement', async () => {
    const f = await fixture();
    try {
        f.fail(3); f.startOutput(2, 'untrusted rejected START');
        await assert.rejects(f.run(), /request failed/); clearTimeout(f.session.timer);
        assert.deepEqual(f.outputs, []);
    } finally {await f.close();}
});

test('foreign program id in START does not authorize replacement output', async () => {
    const f = await fixture();
    try {
        f.wrongStartId(); f.startOutput(2, 'foreign START');
        await assert.rejects(f.run(), /Mismatched NuttX program id/); clearTimeout(f.session.timer);
        assert.deepEqual(f.outputs, []);
    } finally {await f.close();}
});

test('READY START reply does not authorize execution output', async () => {
    const f = await fixture();
    try {
        f.startState(1); f.startOutput(2, 'old READY snapshot');
        await f.run(); clearTimeout(f.session.timer);
        assert.equal(f.session.programState, 1);
        assert.deepEqual(f.outputs, []);
    } finally {await f.close();}
});
for (const state of [3, 5]) test(`fast terminal START state ${state} preserves current output`, async () => {
    const f = await fixture();
    try {
        f.startState(state); f.startOutput(2, 'current terminal output');
        await f.run(); clearTimeout(f.session.timer);
        assert.equal(f.session.programState, state);
        assert.deepEqual(f.outputs.map(value => value.text), ['current terminal output']);
    } finally {await f.close();}
});

test('successful START without fresh output does not replay the drained old snapshot', async () => {
    const f = await fixture();
    try {
        f.output(2, 'old snapshot'); await f.run(); clearTimeout(f.session.timer);
        assert.deepEqual(f.outputs, []);
        f.output(4, 'new output after START'); await f.session.poll(); clearTimeout(f.session.timer);
        assert.deepEqual(f.outputs.map(value => value.text), ['new output after START']);
    } finally {await f.close();}
});

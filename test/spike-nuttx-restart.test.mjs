// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import Hub from '../overlay/scratch-gui/src/lib/virtual-hub/spike-hub-state.js';
import {ArenaHubBridge} from '../overlay/scratch-gui/src/lib/spike-arena/arena-hub-bridge.js';
import {sandboxWorld} from '../overlay/scratch-gui/src/lib/spike-arena/arena-sandbox.js';
import {RenodeArenaSession} from '../overlay/scratch-gui/src/lib/spike-arena/renode-arena-session.js';
import {NuttXProgramClient} from '../overlay/scratch-gui/src/lib/spike-nuttx/upload-protocol.js';
import {createCodeRunFeedback} from '../overlay/scratch-gui/src/lib/spike-arena/code-run-feedback.js';

function fixture (state = 3) {
    const packets = [], feedback = [];
    const presentation = createCodeRunFeedback(update => feedback.push(update),
        {running: 'Running', completed: 'Complete', stopped: 'Stopped'});
    const session = new RenodeArenaSession({
        bridge: new ArenaHubBridge({hubState: new Hub(), world: sandboxWorld()}),
        backend: 'nuttx', source: 'print(42)', ...presentation.callbacks
    });
    Object.assign(session, {nuttx: true, started: true, storageSupported: true,
        retainedProgram: true, programState: state, completed: true});
    session.schedule = () => {};
    session.programClient = new NuttXProgramClient(async packet => {
        packets.push(Array.from(packet));
        const reply = new Uint8Array(20);
        reply.set([0x71, 1, packet[2], 2]);
        new DataView(reply.buffer).setUint32(4, 1, true);
        return reply;
    }, 1);
    presentation.callbacks.onProgramState(state, true, state === 5 ? -5 : 0);
    return {session, packets, feedback};
}

test('retained completion, Stop and fault restart with START only, preserving source and loaded intent', async () => {
    for (const state of [3, 4, 5]) {
        const {session, packets, feedback} = fixture(state);
        assert.equal(session.canRestartProgram, true);
        await session.restartProgram();
        assert.deepEqual(packets.map(packet => packet[2]), [3], 'no upload, load, stop or replacement session');
        assert.equal(session.source, 'print(42)');
        assert.equal(session.programState, 2);
        assert.equal(session.completed, false, 'completion must be observed anew');
        assert.equal(session.loaded, false);
        assert.deepEqual(feedback.at(-1), {spike3Running: true, status: 'Running'});
        session.observeProgram({state: 3, error: 0});
        assert.deepEqual(feedback.at(-1), {spike3Running: false, status: 'Complete'});
        assert.equal(session.canRestartProgram, true);
    }
});

test('restart refuses empty, READY, running, closed, uncertain and uncommitted sessions without packets', async () => {
    for (const fields of [{programState: 0}, {programState: 1}, {programState: 2},
        {closed: true}, {storageUncertain: true}, {uploading: true}, {storageBusy: true},
        {retainedProgram: false}, {storageSupported: false}, {nuttx: false}]) {
        const {session, packets} = fixture();
        Object.assign(session, fields);
        assert.equal(session.canRestartProgram, false);
        await assert.rejects(session.restartProgram(), /unavailable or busy/);
        assert.deepEqual(packets, []);
    }
});

test('restart failure preserves prior completion, and parallel starts cannot overlap', async () => {
    const {session} = fixture();
    session.programClient.start = async () => {throw new Error('rejected by firmware');};
    await assert.rejects(session.restartProgram(), /rejected by firmware/);
    assert.equal(session.completed, true);
    assert.equal(session.storageBusy, false);
    let resolve;
    session.programClient.start = () => new Promise(done => {resolve = done;});
    const first = session.restartProgram();
    await Promise.resolve();
    await assert.rejects(session.restartProgram(), /unavailable or busy/);
    resolve({state: 2}); await first;
    assert.equal(session.completed, false);
});

test('close while restart waits for an in-flight poll never sends START', async () => {
    const {session, packets} = fixture(); let release;
    session.tail = new Promise(resolve => {release = resolve;});
    const pending = session.restartProgram();
    session.closed = true; release();
    await assert.rejects(pending, /closed/);
    assert.deepEqual(packets, []);
});

test('empty observation revokes restart and invalid successful START replies do not announce running', async () => {
    const {session, packets} = fixture();
    session.observeProgram({state: 0});
    session.observeProgram({state: 3});
    await assert.rejects(session.restartProgram(), /unavailable or busy/);
    assert.deepEqual(packets, []);
    session.retainedProgram = true;
    session.programClient.start = async () => ({state: 1});
    await assert.rejects(session.restartProgram(), /did not start/);
    assert.equal(session.completed, true);
});

const source = readFileSync(new URL('../overlay/scratch-gui/src/components/tw-pseudocode/spike-arena-pane.jsx', import.meta.url), 'utf8');
const start = new Function(`return ({${source.slice(source.indexOf('    async start () {'), source.indexOf('    async stopProgram ('))}}).start;`)();
function pane (state = 3) {
    const calls = [];
    const session = {storageSupported: true, programState: state, loaded: state === 1,
        closed: false, async startProgram () {calls.push('loaded'); this.programState = 2;},
        async restartProgram () {calls.push('restart'); this.programState = 2;}};
    return {calls, firmwareSession: session, state: {execution: 'nuttx'},
        setState (update) {calls.push(update); Object.assign(this.state, update);},
        async startFirmware () {calls.push('replacement-upload');}};
}
test('actual arena Start method restarts the retained program rather than compiling current editor blocks', async () => {
    for (const state of [3, 4, 5]) {
        const p = pane(state); await start.call(p);
        assert.equal(p.calls.find(call => typeof call === 'string'), 'restart');
        assert.equal(p.calls.includes('replacement-upload'), false);
        assert.equal(p.state.status, 'running');
    }
    const loaded = pane(1); await start.call(loaded);
    assert.equal(loaded.calls.find(call => typeof call === 'string'), 'loaded');
});

test('late restart success or failure cannot change a disposed or replacement pane session', async () => {
    for (const fail of [false, true]) {
        for (const dispose of [false, true]) {
            const p = pane(); const original = p.firmwareSession; let resolve, reject;
            p.firmwareSession.restartProgram = () => new Promise((done, error) => {resolve = done; reject = error;});
            const pending = start.call(p);
            if (dispose) p.disposed = true;
            else p.firmwareSession = {replacement: true};
            if (fail) reject(new Error('old error')); else { original.programState = 2; resolve(); }
            await pending;
            assert.equal(p.calls.length, 1);
            assert.equal(p.calls[0].status, 'starting');
        }
    }
});


test('Stop cancels a START waiting for a poll and preserves the retained program', async () => {
    const {session, packets} = fixture(); let release;
    session.tail = new Promise(resolve => {release = resolve;});
    session.programClient.exchange = async packet => {
        packets.push(Array.from(packet));
        const reply = new Uint8Array(20); reply.set([0x71, 1, packet[2], 4]);
        new DataView(reply.buffer).setUint32(4, 1, true); return reply;
    };
    const starting = assert.rejects(session.restartProgram(), {name: 'AbortError'});
    const stopping = session.stopProgram();
    release(); await Promise.all([starting, stopping]);
    assert.deepEqual(packets.map(p => p[2]), [4]);
    assert.equal(session.programState, 4);
    assert.equal(session.retainedProgram, true);
    assert.equal(session.storageBusy, false);
    assert.equal(session.canRestartProgram, true);
});

test('Stop during an in-flight START is queued after it and rejects late running feedback', async () => {
    const {session, packets, feedback} = fixture(); let entered, release;
    const sent = new Promise(resolve => {entered = resolve;});
    session.programClient.exchange = async packet => {
        packets.push(Array.from(packet));
        if (packet[2] === 3) { entered(); await new Promise(resolve => {release = resolve;}); }
        const reply = new Uint8Array(20); reply.set([0x71, 1, packet[2], packet[2] === 4 ? 4 : 2]);
        new DataView(reply.buffer).setUint32(4, 1, true); return reply;
    };
    const starting = assert.rejects(session.restartProgram(), {name: 'AbortError'});
    await sent;
    const stopping = session.stopProgram(); release();
    await Promise.all([starting, stopping]);
    assert.deepEqual(packets.map(p => p[2]), [3, 4]);
    assert.equal(session.programState, 4);
    assert.deepEqual(feedback.at(-1), {spike3Running: false, status: 'Stopped'});
    assert.equal(session.canRestartProgram, true);
});

test('closing an in-flight START suppresses the response observer', async () => {
    const {session, feedback} = fixture(); let entered, release;
    const sent = new Promise(resolve => {entered = resolve;});
    session.programClient.start = async () => {
        entered(); await new Promise(resolve => {release = resolve;}); return {state: 2};
    };
    const starting = assert.rejects(session.restartProgram(), /closed/);
    await sent; const before = feedback.length;
    session.closed = true; release(); await starting;
    assert.equal(feedback.length, before);
    assert.equal(session.completed, true);
});

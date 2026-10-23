// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
// Source/protocol controls only: no Python interpreter or firmware guest is faked here.
import {test} from 'node:test';
import {spawn, spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {LockstepProgram} from '../overlay/scratch-gui/src/lib/bw-sim/routes/renode-lockstep/program.js';
import {openLockstepRoute} from '../overlay/scratch-gui/src/lib/bw-sim/routes/renode-lockstep/route.js';
import {encodePython, crc32} from '../overlay/scratch-gui/src/lib/spike-nuttx/upload-protocol.js';
import net from 'node:net';
import {once} from 'node:events';
import {mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync} from 'node:fs';
import path from 'node:path';
import {prepareDotnetLauncher} from '../scripts/lib/sim-lab-dotnet-launcher.mjs';
import {waitForRenodeStateService, stopRenodeChild, StateServiceTransport, monitorCommand} from '../scripts/lib/sim-lab-renode-guest.mjs';
const compiled = {version: 1, instructions: [[0, 0, 0, 0]]};
let transportCalls = 0;
const unused = {call () { transportCalls++;throw Error('must validate before transport'); }};
test('Lab Python source refuses conflicting, invalid and wrong-backend inputs before emulator startup', async () => {
    for (const pythonSource of ['', '\0', 'x'.repeat(4096), 'é'.repeat(2048), 12, {}]) {
        await assert.rejects(openLockstepRoute({transport: unused, pythonSource}));
    }
    await assert.rejects(openLockstepRoute({transport: unused, program: compiled, pythonSource: 'pass'}), /exactly one/);
    await assert.rejects(openLockstepRoute({transport: unused, backend: 'micropython', pythonSource: 'pass'}), /Only the NuttX/);
    assert.throws(() => new LockstepProgram({transport: unused}), /exactly one/);
    assert.doesNotThrow(() => new LockstepProgram({transport: unused, pythonSource: 'é'.repeat(2047) + 'x'}));
    assert.equal(transportCalls, 0, 'no invalid source reached emulator startup');
});
test('Lab Python upload uses canonical BEGIN_PYTHON, UTF-8 chunks and CRC, holds READY without START', async () => {
    const packets = [];
    const source = 'print("héllo")\n';
    const transport = {async call (op, args) {
        assert.equal(op, 'renode.spike.program.packet');
        const request = Uint8Array.from(args.bytes); packets.push(request);
        const reply = new Uint8Array(20);reply.set([0x71, 1, request[2], 1, 1]);
        return {target: {capabilities: ['nuttx-program-publication/v1']}, lifecycle: {nuttxProgramReply: [...reply]}};
    }};
    const control = new LockstepProgram({transport, pythonSource: source});
    await control.upload();
    const payload = encodePython(source);
    assert.equal(control.stateName, 'ready');assert.equal(control.python, true);
    assert.equal(packets[0][2], 7);assert.equal(packets.at(-1)[2], 2);
    const header = new DataView(packets[0].buffer);
    assert.equal(header.getUint32(8, true), payload.length);
    assert.equal(header.getUint32(12, true), crc32(payload));
    assert.deepEqual(Uint8Array.from(packets.slice(1, -1).flatMap(p => [...p.slice(10)])), payload);
    packets.slice(1, -1).forEach((p, i) => assert.equal(new DataView(p.buffer).getUint16(8, true), i * 10));
    assert.equal(packets.some(p => p[2] === 3), false, 'START remains deferred until after lockstep begin');
    assert.notEqual(control.key, new LockstepProgram({transport, program: compiled}).key);
});

test('required real lockstep mode refuses missing inputs instead of a successful optional skip', () => {
    const result = spawnSync(process.execPath, ['scripts/verify-sim-lab-renode-lockstep.mjs'], {
        encoding: 'utf8', env: {...process.env, BW_SIMLAB_REQUIRED: '1', BW_RENODE: '/nonexistent-robot-lab-renode'}
    });
    assert.notEqual(result.status, 0);assert.match(result.stderr, /Required lockstep input missing/);
    const optional = spawnSync(process.execPath, ['scripts/verify-sim-lab-renode-lockstep.mjs'], {
        encoding: 'utf8', env: {...process.env, BW_SIMLAB_REQUIRED: '0', BW_RENODE: '/nonexistent-robot-lab-renode'}
    });
    assert.equal(optional.status, 0);assert.match(optional.stdout, /SKIP verify-sim-lab-renode-lockstep/);
});

// These children exercise startup supervision only; no firmware is substituted.
const unusedPort = () => new Promise(resolve => {
    const server = net.createServer();
    server.listen(0, '127.0.0.1', () => {
        const {port} = server.address(); server.close(() => resolve(port));
    });
});
test('startup refusal retains bounded diagnostics even when the child exits successfully', async () => {
    const port = await unusedPort();
    const child = spawn(process.execPath, ['-e', 'process.stderr.write("x".repeat(6000)+"startup-marker")'],
        {stdio: ['ignore', 'pipe', 'pipe']});
    await assert.rejects(waitForRenodeStateService(child, port), error => {
        assert.match(error.message, /code=0/);
        assert.match(error.message, /startup-marker/);
        assert.ok(error.message.length < 4300);
        return true;
    });
});
test('startup timeout stops its child and preserves its diagnostic output', async () => {
    const port = await unusedPort();
    const child = spawn(process.execPath, ['-e', 'process.stderr.write("waiting-marker");setInterval(()=>{},1000)'],
        {stdio: ['ignore', 'pipe', 'pipe']});
    await assert.rejects(waitForRenodeStateService(child, port, 500), /within 0.5 s[\s\S]*waiting-marker/);
    assert.notEqual(child.signalCode, null);
});
test('startup spawn errors are reported instead of waiting the whole boot bound', async () => {
    const port = await unusedPort();
    const child = spawn('/nonexistent-robot-lab-renode', [], {stdio: ['ignore', 'pipe', 'pipe']});
    await assert.rejects(waitForRenodeStateService(child, port), /spawn failed: ENOENT/);
});

test('the source .NET launcher execs the owned runtime PID and preserves arguments', {timeout: 5000}, async () => {
    const root = mkdtempSync(path.join(process.cwd(), '.lab-dotnet-launcher-test-'));
    let child, runtimePid;
    try {
        mkdirSync(path.join(root, 'output/bin/Release'), {recursive: true});
        writeFileSync(path.join(root, 'output/bin/Release/Renode.dll'), 'startup-control placeholder');
        mkdirSync(path.join(root, 'bin'));
        writeFileSync(path.join(root, 'bin/dotnet'), '#!/bin/sh\nprintf \'%s\\n\' "$$" "$@"\nexec sleep 60\n', {mode: 0o700});
        const launcher = await prepareDotnetLauncher(root);
        await assert.rejects(prepareDotnetLauncher(root), /EEXIST/, 'never replace an earlier launcher');
        child = spawn(launcher, ['--disable-gui', 'argument with spaces'], {
            env: {...process.env, PATH: `${path.join(root, 'bin')}:${process.env.PATH}`},
            stdio: ['ignore', 'pipe', 'pipe']
        });
        const closed = once(child, 'close');
        const lines = await new Promise((resolve, reject) => {
            let output = '';
            child.once('error', reject);
            child.stdout.on('data', bytes => {
                output += bytes;
                if (output.split('\n').length >= 5) resolve(output.trim().split('\n'));
            });
        });
        runtimePid = Number(lines[0]);
        assert.equal(runtimePid, child.pid, 'the process Node owns must be the Runtime, not its shell parent');
        assert.deepEqual(lines.slice(1), [path.join(root, 'output/bin/Release/Renode.dll'), '--disable-gui', 'argument with spaces']);
        await stopRenodeChild(child);
        await closed;
        assert.equal(child.stdout.closed, true, 'the owned runtime left no pipe holder behind');
    } finally {
        if (child && child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
        // Only the PID emitted by this test's own tiny launch control, if the
        // exec regression recreated a shell parent. Never a guest-reported PID.
        if (runtimePid && runtimePid !== child?.pid) {
            try {process.kill(runtimePid, 'SIGKILL');} catch (e) {if (e.code !== 'ESRCH') throw e;}
        }
        rmSync(root, {recursive: true, force: true});
    }
});

test('owned Runtime cleanup is idempotent and escalates a TERM-resistant child', {timeout: 6000}, async () => {
    const child = spawn(process.execPath, ['-e', 'process.on("SIGTERM",()=>{});console.log("ready");setInterval(()=>{},1000)'],
        {stdio: ['ignore', 'pipe', 'pipe']});
    try {
        await once(child.stdout, 'data');
        const first = stopRenodeChild(child), second = stopRenodeChild(child);
        assert.equal(first, second, 'concurrent cleanup shares one operation');
        await first;
        assert.equal(child.signalCode, 'SIGKILL');
        assert.equal(child.stdout.closed, true);
        assert.equal(stopRenodeChild(child), first);
    } finally {
        if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    }
});

// Synthetic protocol boundaries only. These never substitute for a real guest.
const replyControl = respond => {
    const transport = new StateServiceTransport(0);
    transport.latest = {schemaVersion: 1, type: 'snapshot', seq: 0};
    transport.socket = {write: raw => respond(transport, JSON.parse(raw))};
    return transport;
};
const snapshotControl = seq => ({schemaVersion: 1, type: 'snapshot', seq, clockNs: 5000000});
test('a refused command reports its actual error without waiting for a snapshot', async () => {
    const t = replyControl((transport, request) => transport.lines.push({schemaVersion: 1,
        type: 'result', requestId: request.requestId, seq: 0, accepted: false, error: 'expectedSeq mismatch control'}));
    await assert.rejects(t.command('lockstep.step', {}, 30), /lockstep.step refused.*expectedSeq mismatch control/);
});
test('matching a result preserves an earlier unmatched snapshot', async () => {
    const t = replyControl((transport, request) => {
        const frame = snapshotControl(1);
        transport.lines.push(frame, {schemaVersion: 1, type: 'result', requestId: request.requestId, seq: 0, accepted: true, data: structuredClone(frame)});
    });
    const reply = await t.command('lockstep.step', {}, 30);
    assert.deepEqual(reply.result.data, reply.snapshot);
});
test('an accepted result cannot replace its missing stream frame, and diagnostics retain the reply', async () => {
    const t = replyControl((transport, request) => transport.lines.push({schemaVersion: 1,
        type: 'result', requestId: request.requestId, seq: 0, accepted: true, data: snapshotControl(1)}));
    await assert.rejects(t.command('lockstep.step', {}, 30), /missing fresh snapshot.*expectedSeq=0.*result=.*"accepted":true.*"seq":1/);
});
test('lockstep result/stream disagreement and invalid sequences are refused', async () => {
    for (const mode of ['data', 'result-seq', 'snapshot-seq']) {
        const t = replyControl((transport, request) => transport.lines.push({schemaVersion: 1,
            type: 'result', requestId: request.requestId, seq: mode === 'result-seq' ? 2 : 0,
            accepted: true, data: {...snapshotControl(1), clockNs: mode === 'data' ? 99 : 5000000}},
        snapshotControl(mode === 'snapshot-seq' ? 2 : 1)));
        await assert.rejects(t.command('lockstep.step', {}, 30), /differs from its streamed snapshot|sequence mismatch/);
    }
});
test('stream termination does not become an unrelated reply timeout', async () => {
    const t = replyControl((transport, request) => {
        transport.lines.push({schemaVersion: 1, type: 'result', requestId: request.requestId, seq: 0, accepted: true});
        transport.closed = new Error('state service ended the stream control');
    });
    await assert.rejects(t.command('lockstep.step', {}, 30), /missing fresh snapshot.*ended the stream control/);
});

// A real TCP boundary, not a firmware guest: AntShell redraws a reconnect's
// empty command line only after Enter. Neither IAC nor a prompt proves Start.
const monitorControl = async (t, answer) => {
    const sockets = new Set();
    const lines = [];
    let connections = 0;
    const server = net.createServer(socket => {
        sockets.add(socket);socket.once('close', () => sockets.delete(socket));
        if (++connections === 1) socket.write('(machine-0) ');
        else socket.write(Buffer.from([255, 253, 0]));
        let pending = '';
        socket.on('data', data => {
            pending += data.toString();
            let i;
            while ((i = pending.indexOf('\n')) !== -1) {
                const line = pending.slice(0, i);pending = pending.slice(i + 1);
                lines.push(line);
                if (line === '') socket.write('(machine-0) ');
                else answer(socket, line);
            }
        });
    });
    server.listen(0, '127.0.0.1');await once(server, 'listening');
    t.after(async () => {for (const socket of sockets) socket.destroy();await new Promise(resolve => server.close(resolve));});
    return {port: server.address().port, lines};
};
test('a monitor reconnect wakes the empty line and sends one real Start after its prompt', {timeout: 1000}, async t => {
    const server = await monitorControl(t, (socket, line) => {
        assert.equal(line, 'start');socket.write('Starting emulation\r\n(machine-0) ');
    });
    await monitorCommand(server.port, 'start');
    await monitorCommand(server.port, 'start');
    assert.deepEqual(server.lines, ['', 'start', '', 'start']);
});
test('a monitor prompt without the Start acknowledgement cannot report resumed execution', {timeout: 1000}, async t => {
    const server = await monitorControl(t, socket => socket.end('(machine-0) '));
    await assert.rejects(monitorCommand(server.port, 'start'), /closed before its start acknowledgement/);
    assert.deepEqual(server.lines, ['', 'start']);
});


// Coherence source controls: these are packets/observations, never guest execution.
const coherentFrame = ({publication = 10, state = 3, replySeq, op = 3, result = 0, id = 1} = {}) => {
    const frame = {lifecycle: {}};
    if (publication !== null) frame.lifecycle.nuttxProgram = {publicationSeq: publication, state, error: 0};
    if (replySeq !== undefined) {
        const reply = new Uint8Array(20);reply.set([0x71, 1, op, op === 3 ? 2 : 4]);
        const view = new DataView(reply.buffer);view.setUint32(4, id, true);view.setInt32(8, result, true);
        frame.lifecycle.nuttxProgramReply = [...reply];frame.lifecycle.nuttxProgramReplySeq = replySeq;
    }
    return frame;
};
const coherentControl = () => {
    let seq = 2;
    const program = new LockstepProgram({program: compiled,
        transport: {async call () {return {data: {requestSeq: seq += 2}};}}});
    program.coherentPublications = true;program.uploaded = true;program.state = 3;program.lastReplyOp = 2;
    return program;
};
test('coherent START ACK cannot accept old COMPLETE; only a later status publication completes it', async () => {
    const p = coherentControl();await p.start();
    p.observe(coherentFrame({replySeq: 4}));
    assert.equal(p.idle, true);assert.equal(p.stateName, 'running');assert.equal(p.stateFresh, false);
    p.observe(coherentFrame());assert.equal(p.stateName, 'running');assert.equal(p.stateFresh, false);
    p.observe(coherentFrame({publication: 12}));assert.equal(p.stateName, 'complete');assert.equal(p.stateFresh, true);
    p.observe(coherentFrame({publication: null}));assert.equal(p.stateFresh, false);
});
test('queued Stop submits immediately after START ACK despite unavailable status and replaces its freshness barrier', async () => {
    const p = coherentControl();await p.start();await p.stop();
    p.observe(coherentFrame({publication: null, replySeq: 4}));await Promise.resolve();
    assert.deepEqual(p.sent.map(c => c.op), [3, 4]);assert.equal(p.pending.requestSeq, 6);
    p.observe(coherentFrame({publication: 10, replySeq: 6, op: 4}));
    assert.equal(p.stateName, 'stopped');assert.equal(p.stateFresh, false);
    p.observe(coherentFrame({publication: 10, state: 2}));assert.equal(p.stateName, 'stopped');
    p.observe(coherentFrame({publication: 12, state: 4}));assert.equal(p.stateName, 'stopped');assert.equal(p.stateFresh, true);
});
test('ACK without status establishes a later coherent floor and requires another advance', async () => {
    const p = coherentControl();await p.start();p.observe(coherentFrame({publication: null, replySeq: 4}));
    p.observe(coherentFrame());assert.equal(p.stateFresh, false);assert.equal(p.stateName, 'running');
    p.observe(coherentFrame());assert.equal(p.stateFresh, false);
    p.observe(coherentFrame({publication: 12}));assert.equal(p.stateFresh, true);assert.equal(p.stateName, 'complete');
});
test('pending control ignores stale or absent real ACK sequence and wrong opcode; bad id or failed ACK refuses', async () => {
    const p = coherentControl();await p.start();
    for (const opts of [{replySeq: 2}, {replySeq: 3}, {replySeq: 6}, {replySeq: 4, op: 4}, {}]) {
        p.observe(coherentFrame(opts));assert.ok(p.pending);assert.equal(p.lastReplyOp, 2);
    }
    p.observe(coherentFrame({replySeq: 4, id: 9}));assert.equal(p.failed.code, 'control-refused');
    const malformed = coherentControl();await malformed.start();const bad = coherentFrame({replySeq: 4});
    bad.lifecycle.nuttxProgramReply[0] += 256;malformed.observe(bad);assert.equal(malformed.failed.code, 'control-refused');
    const failed = coherentControl();await failed.start();await failed.stop();
    failed.observe(coherentFrame({publication: null, replySeq: 4, result: -16}));
    assert.equal(failed.failed.result, -16);assert.equal(failed.stateName, 'complete');assert.equal(failed.queue.length, 0);
});
test('coherent status rejects zero/odd/out-of-range publication and refuses reset/wrap', () => {
    for (const publication of [0, 1, 3, -2, 0x100000000, '2']) {
        assert.throws(() => coherentControl().observe(coherentFrame({publication})), /invalid coherent/);
    }
    const p = coherentControl();p.observe(coherentFrame({publication: 0xfffffffe}));
    assert.throws(() => p.observe(coherentFrame({publication: 2})), /reset or wrapped/);
});
test('permanent publication absence never becomes a fresh terminal observation within the unchanged 1200-step bound', async () => {
    const p = coherentControl();await p.start();p.observe(coherentFrame({publication: null, replySeq: 4}));
    for (let i = 0; i < 1200; i++) p.observe(coherentFrame({publication: null}));
    assert.equal(p.stateName, 'running');assert.equal(p.stateFresh, false);
});
test('embedded Python refuses legacy Runtime without coherent publication capability', async () => {
    const p = new LockstepProgram({pythonSource: 'pass', transport: {async call () {return {lifecycle: {}};}}});
    await assert.rejects(p.upload(), /requires coherent program publications/);
});

test('actual Python acceptance functions refuse missing output or stale status within the same bound', async () => {
    const source = readFileSync(new URL('../scripts/verify-sim-lab-python-guest.mjs', import.meta.url), 'utf8');
    const functions = source.slice(source.indexOf('async function step ('), source.indexOf('async function open ('));
    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
    const {step, until} = await new AsyncFunction('assert', 'output', 'frameOf', `${functions};return {step,until};`)(
        assert, frame => frame.lifecycle.nuttxProgramOutput, run => run.frame);
    for (const absent of ['output', 'status', 'freshness']) {
        let ticks = 0;
        const run = {name: 'observation control', frame: {lifecycle: {
            nuttxProgram: {state: 3, error: 0, positions: [0, 0], duties: [0, 0], publicationSeq: 10},
            nuttxProgramOutput: {sequence: 2, text: 'old-terminal-marker', truncated: false}}},
        route: {program: {stateFresh: absent !== 'freshness'}}, states: new Set(), joints: new Map(),
        hub: {sensors: new Map(), read: {motors: [], drives: []}},
        session: {time: 0, tick () {ticks++;this.time += 5;}, async idle () {}}};
        if (absent === 'output') delete run.frame.lifecycle.nuttxProgramOutput;
        if (absent === 'status') delete run.frame.lifecycle.nuttxProgram;
        await assert.rejects(until(run, () => true, 4, 'observation acceptance'), /exceeded 20 ms virtual/);
        assert.equal(ticks, 4);assert.equal(run.steps, 4);
        if (absent === 'output') {assert.equal(run.text, '');assert.equal(run.outputSequence, null);}
        // A current real observation can satisfy the unchanged acceptance next time.
        run.frame.lifecycle.nuttxProgram ??= {state: 3, error: 0, positions: [0, 0], duties: [0, 0], publicationSeq: 12};
        run.frame.lifecycle.nuttxProgramOutput ??= {sequence: 4, text: 'new-marker', truncated: false};
        run.route.program.stateFresh = true;
        await until(run, () => true, 4, 'positive observation');assert.equal(ticks, 5);
        await step(run);assert.equal(run.last.state, 3);
    }
});

test('actual checkpoint window keeps every physical quantum and records available evidence without replaying final missing fields', async () => {
    const source = readFileSync(new URL('../scripts/verify-sim-lab-python-guest.mjs', import.meta.url), 'utf8');
    const functions = source.slice(source.indexOf('async function step ('), source.indexOf('async function open ('));
    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
    const checkpoint = await new AsyncFunction('assert', 'output', 'frameOf', `${functions};return windowCheckpoint;`)(
        assert, frame => frame.lifecycle.nuttxProgramOutput, run => run.frame);
    for (const allAbsent of [false, true]) {
        let ticks = 0;
        const status = {state: 4, error: 0, positions: [0, 0], duties: [0, 0], publicationSeq: 12};
        const run = {name: 'window control', frame: {lifecycle: {}}, route: {program: {stateFresh: true}},
            states: new Set(), joints: new Map(), hub: {sensors: new Map(), read: {motors: [], drives: []}},
            session: {time: 0, tick () {ticks++;this.time += 5;}, async idle () {
                run.frame.lifecycle = !allAbsent && ticks < 60 ? {nuttxProgram: status,
                    nuttxProgramOutput: {sequence: 6, text: 'observed', truncated: false}} : {};
            }}};
        if (allAbsent) await assert.rejects(checkpoint(run, 60, 4, 'Stop'), /no coherent checkpoint in 300 ms/);
        else {
            const observed = await checkpoint(run, 60, 4, 'Stop');
            assert.equal(observed.observedMs, 295);assert.deepEqual(observed.window, {startMs: 0, endMs: 300});
            assert.equal(observed.last.state, 4);assert.equal(observed.output, 'observed');
            assert.equal(run.last.state, null);assert.equal(run.text, '');assert.equal(run.statusFresh, false);
        }
        assert.equal(ticks, 60);assert.equal(run.session.time, 300);
        if (!allAbsent) {
            ticks = 0;run.session.time = 0;
            const originalIdle = run.session.idle;
            run.session.idle = async () => {
                await originalIdle();
                if (ticks === 60) run.frame.lifecycle = {nuttxProgramOutput: {sequence: 8, text: 'WP6_TOO_LATE', truncated: false}};
            };
            await assert.rejects(checkpoint(run, 60, 4, 'Stop', /WP6_TOO_LATE/), /forbidden output observed/);
            assert.equal(ticks, 60, 'output-only late marker is observed independently of absent status');
        }
    }
});

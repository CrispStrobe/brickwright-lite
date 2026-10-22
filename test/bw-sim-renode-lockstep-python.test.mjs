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
import {mkdtempSync, mkdirSync, writeFileSync, rmSync} from 'node:fs';
import path from 'node:path';
import {prepareDotnetLauncher} from '../scripts/lib/sim-lab-dotnet-launcher.mjs';
import {waitForRenodeStateService, stopRenodeChild} from '../scripts/lib/sim-lab-renode-guest.mjs';
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
        return {lifecycle: {nuttxProgramReply: [...reply]}};
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

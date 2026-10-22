// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
// Source/protocol controls only: no Python interpreter or firmware guest is faked here.
import {test} from 'node:test';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {LockstepProgram} from '../overlay/scratch-gui/src/lib/bw-sim/routes/renode-lockstep/program.js';
import {openLockstepRoute} from '../overlay/scratch-gui/src/lib/bw-sim/routes/renode-lockstep/route.js';
import {encodePython, crc32} from '../overlay/scratch-gui/src/lib/spike-nuttx/upload-protocol.js';
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

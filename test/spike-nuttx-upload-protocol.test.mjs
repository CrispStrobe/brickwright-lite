// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {compileFirmwareProgram} from '../overlay/scratch-gui/src/lib/spike-arena/firmware-program.js';
const {validArenaProgram} = createRequire(import.meta.url)('../overlay/scratch-vm/src/extension-support/arena-inputs.js');
import {crc32, encodeInstructions, encodePython, encodeBegin, encodeChunk, encodeCommand,
    decodeReply, NuttXProgramClient, uploadProgram} from '../overlay/scratch-gui/src/lib/spike-nuttx/upload-protocol.js';
const program = {version: 1, instructions: [[1, 0, -1110, 0], [6, 1, -90, 555], [0, 0, 0, 0]]};
function reply (request, {result = 0, state = 1, id, pc = 0, count = 3, received = 0, runtimeError = 0} = {}) {
    const data = new Uint8Array(20), v = new DataView(data.buffer);
    data.set([0x71, 1, request[2], state]);
    v.setUint32(4, id ?? new DataView(request.buffer, request.byteOffset).getUint32(4, true), true);
    v.setInt32(8, result, true);v.setUint16(12, pc, true);v.setUint16(14, count, true);
    v.setUint16(16, received, true);v.setInt16(18, runtimeError, true);return data;
}
test('CRC32 ISO-HDLC and signed little-endian compiler ABI', () => {
    assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
    assert.equal(crc32(new Uint8Array()), 0);
    const data = encodeInstructions(program), v = new DataView(data.buffer);
    assert.equal(data.length, 48);assert.deepEqual([...data.subarray(8, 12)], [0xaa, 0xfb, 0xff, 0xff]);
    assert.equal(v.getInt32(24, true), -90);assert.equal(v.getInt32(28, true), 555);
    const begin = encodeBegin(0x12345678, 3, crc32(data));
    assert.deepEqual([...begin.subarray(0, 12)], [0x70, 1, 0, 0, 0x78, 0x56, 0x34, 0x12, 3, 0, 0, 0]);
    assert.equal(new DataView(begin.buffer).getUint32(12, true), crc32(data));
    assert.equal(encodeInstructions({version: 1, instructions: Array.from({length: 256}, () => [0, 0, 0, 0])}).length, 4096);
});
test('reject compiler ABI and source errors before transport', async () => {
    let calls = 0;const exchange = () => {calls++;throw new Error('unexpected');};
    for (const rows of [[], Array(1), [[0, 0, 0]], [[0, 0, 0, true]], [[1, 2, 0, 0], [0, 0, 0, 0]],
        [[6, 0, 1, 0], [0, 0, 0, 0]], [[3, 3, 2, 0], [0, 0, 0, 0]],
        [[4, 2, 0, 0], [0, 0, 0, 0]], [[1, 0, 0, 0]], Array.from({length: 257}, () => [0, 0, 0, 0])]) {
        await assert.rejects(uploadProgram(exchange, {id: 1, program: {version: 1, instructions: rows}}));
    }
    for (const source of ['', 'x\0y', 'x'.repeat(4096), 'é'.repeat(2048), 123]) {
        await assert.rejects(uploadProgram(exchange, {id: 1, source}));
    }
    await assert.rejects(uploadProgram(exchange, {id: 0, program}));
    await assert.rejects(uploadProgram(exchange, {id: 1, program, source: 'pass'}));
    assert.equal(calls, 0);assert.equal(encodePython('é'.repeat(2047) + 'x').length, 4095);
});
test('all control packets and chunk boundaries are bounded', () => {
    for (const op of [2, 3, 4, 5, 6]) assert.deepEqual([...encodeCommand(op, 1)], [0x70, 1, op, 0, 1, 0, 0, 0]);
    assert.equal(encodeCommand(5, 0).length, 8);
    for (const op of [2, 3, 4, 6]) assert.throws(() => encodeCommand(op, 0));
    for (const id of [-1, 1.5, 0x100000000]) assert.throws(() => encodeCommand(5, id));
    assert.deepEqual([...encodeChunk(1, 0x123, new Uint8Array([9]))], [0x70, 1, 1, 0, 1, 0, 0, 0, 0x23, 1, 9]);
    assert.equal(encodeChunk(1, 4086, new Uint8Array(10)).length, 20);
    for (const [offset, size] of [[0, 0], [0, 11], [-1, 1], [4095, 2], [4096, 1]]) {
        assert.throws(() => encodeChunk(1, offset, new Uint8Array(size)));
    }
});
test('strict replies preserve request and runtime errors separately', () => {
    const request = encodeCommand(5, 99), expected = {op: 5, id: 99};
    const good = reply(request, {state: 5, result: -22, runtimeError: -5, pc: 3, received: 4096});
    assert.deepEqual(decodeReply(good, expected), {op: 5, state: 5, id: 99, result: -22,
        pc: 3, count: 3, received: 4096, runtimeError: -5});
    const framed = new Uint8Array(22);framed.set(good, 1);
    assert.equal(decodeReply(framed.subarray(1, 21), expected).runtimeError, -5);
    for (const [index, value] of [[0, 0], [1, 2], [2, 4], [3, 6]]) {
        const invalid = good.slice();invalid[index] = value;assert.throws(() => decodeReply(invalid, expected));
    }
    assert.throws(() => decodeReply(good.subarray(0, 19), expected));
    assert.throws(() => decodeReply(reply(request, {id: 100}), expected));
    assert.throws(() => decodeReply(reply(request, {count: 4096}), expected));
    assert.throws(() => decodeReply(reply(request, {count: 4095, pc: 257}), expected));
    assert.equal(decodeReply(reply(request, {count: 4095}), expected).count, 4095);
    assert.throws(() => decodeReply(reply(request, {pc: 4}), expected));
    assert.throws(() => decodeReply(reply(request, {received: 4097}), expected));
    assert.equal(decodeReply(reply(encodeCommand(5, 0), {id: 99}), {op: 5, id: 0}).id, 99);
});
test('uploads await every ordered reply, reconstruct payload and commit before start', async () => {
    const requests = [];let busy = false;
    const result = await uploadProgram(async packet => {
        assert.equal(busy, false);busy = true;requests.push(packet.slice());await Promise.resolve();busy = false;
        return reply(packet, {state: packet[2] === 3 ? 2 : 1});
    }, {id: 44, program});
    assert.equal(result.state, 2);assert.deepEqual(requests.map(p => p[2]), [0, 1, 1, 1, 1, 1, 2, 3]);
    const payload = new Uint8Array(48);
    for (const packet of requests.filter(p => p[2] === 1)) {
        assert.ok(packet.length <= 20);payload.set(packet.subarray(10), new DataView(packet.buffer).getUint16(8, true));
    }
    assert.deepEqual(payload, encodeInstructions(program));
    const pythonRequests = [];
    await uploadProgram(async packet => {pythonRequests.push(packet);return reply(packet);}, {id: 1, source: 'é\n', start: false});
    assert.deepEqual(pythonRequests.map(p => p[2]), [7, 1, 2]);
    assert.equal(new DataView(pythonRequests[0].buffer).getUint32(8, true), 3);
    assert.deepEqual(pythonRequests[1].subarray(10), encodePython('é\n'));
});
test('upload failures abort, cleanup failures preserve original error', async () => {
    for (const failedOp of [0, 1, 2, 3]) {
        const seen = [], original = new Error('transport failure');
        await assert.rejects(uploadProgram(async packet => {
            seen.push(packet[2]);if (packet[2] === failedOp) throw original;
            if (packet[2] === 6) throw new Error('cleanup failure');
            return reply(packet);
        }, {id: 1, program}), error => error === original);
        assert.equal(seen.at(-1), 6);
        if (failedOp === 3) assert.deepEqual(seen.slice(-3), [3, 4, 6]);
    }
    const client = new NuttXProgramClient(async packet => reply(packet, {result: -16}), 1);
    await assert.rejects(client.status(), error => error.result === -16 && error.reply.result === -16);
});
test('signal cancellation and Stop serialize cleanup behind the outstanding reply', async () => {
    const controller = new AbortController(), seen = [];
    await assert.rejects(uploadProgram(async packet => {
        seen.push(packet[2]);if (packet[2] === 1) controller.abort();return reply(packet);
    }, {id: 1, program, signal: controller.signal}), {name: 'AbortError'});
    assert.deepEqual(seen, [0, 1, 6]);
    const pre = new AbortController();pre.abort();let calls = 0;
    await assert.rejects(uploadProgram(() => {calls++;}, {id: 1, program, signal: pre.signal}), {name: 'AbortError'});
    assert.equal(calls, 0);
    let release, entered;const inFlight = new Promise(resolve => {entered = resolve;});
    const packets = [], client = new NuttXProgramClient(async packet => {
        packets.push(packet[2]);if (packet[2] === 0) {entered();await new Promise(resolve => {release = resolve;});}
        return reply(packet);
    }, 1);
    const upload = client.upload(program);await inFlight;
    const stopped = client.stop();assert.deepEqual(packets, [0]);release();
    await assert.rejects(upload, {name: 'AbortError'});await stopped;assert.deepEqual(packets, [0, 6, 4]);
    await client.status();assert.equal(packets.at(-1), 5);
});

test('transport accepts the actual compiler contract and every instruction boundary', () => {
    const blocks = {
        hat: {opcode: 'event_whenflagclicked', next: 'wait'},
        wait: {opcode: 'control_wait', inputs: {DURATION: {block: 'seconds'}}},
        seconds: {opcode: 'math_number', shadow: true, fields: {NUM: {value: '0.1'}}}
    };
    const compiled = compileFirmwareProgram({runtime: {targets: [{isOriginal: true,
        blocks: {_blocks: blocks, getScripts: () => ['hat']}}]}});
    assert.equal(validArenaProgram(compiled), true);
    const data = encodeInstructions(compiled);
    assert.equal(new DataView(data.buffer).getInt32(4, true), 100);
    const allOps = {version: 1, instructions: [[1, 1, 1110, 0], [2, 120000, 0, 0],
        [3, 1, 65535, 0], [3, 3, 1, 0], [3, 4, 255, 0], [3, 6, 100, 0],
        [5, 2, 65535, 9], [4, 0, 0, 0], [6, 1, -36000, 1110], [0, 0, 0, 0]]};
    assert.equal(validArenaProgram(allOps), true);assert.equal(encodeInstructions(allOps).length, 160);
});
test('maximum payloads use bounded offsets and remain serial', async () => {
    for (const options of [{program: {version: 1, instructions: Array.from({length: 256}, () => [0, 0, 0, 0])}},
        {source: 'x'.repeat(4095)}]) {
        let received = 0, chunks = 0;
        await uploadProgram(async packet => {
            if (packet[2] === 1) {
                assert.equal(new DataView(packet.buffer).getUint16(8, true), received);
                received += packet.length - 10;chunks++;assert.ok(packet.length <= 20);
            }
            return reply(packet, {count: options.source ? (packet[2] === 2 ? 4095 : 0) : 256, received});
        }, {id: 0xffffffff, ...options, start: false});
        assert.equal(received, options.source ? 4095 : 4096);assert.equal(chunks, 410);
    }
});
test('cancellation after uncertain START stops before abort and failed correlation aborts', async () => {
    const controller = new AbortController(), ops = [];
    await assert.rejects(uploadProgram(async packet => {
        ops.push(packet[2]);if (packet[2] === 3) controller.abort();return reply(packet);
    }, {id: 1, program, signal: controller.signal}), {name: 'AbortError'});
    assert.deepEqual(ops.slice(-3), [3, 4, 6]);
    const mismatched = [];
    await assert.rejects(uploadProgram(async packet => {
        mismatched.push(packet[2]);return reply(packet, {id: packet[2] === 1 ? 2 : 1});
    }, {id: 1, program}), /Mismatched/);
    assert.deepEqual(mismatched, [0, 1, 6]);
});

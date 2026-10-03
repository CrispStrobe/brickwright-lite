// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {exchangeStorage, storageMetadata, DEFERRED_STORAGE_CAPABILITY} from '../overlay/scratch-gui/src/lib/spike-nuttx/storage-exchange.js';
import {encodeCommand, NuttXProgramClient} from '../overlay/scratch-gui/src/lib/spike-nuttx/upload-protocol.js';
import {createRequire} from 'node:module';
const {OPERATIONS} = createRequire(import.meta.url)('../overlay/scratch-vm/src/extension-support/capability-broker.js');
const frame = (pending = true, seq = 12) => ({target: {board: 'spike-prime', firmware: 'brickwright-nuttx',
    transport: 'none', imageSha256: 'a'.repeat(64), capabilities: [DEFERRED_STORAGE_CAPABILITY]},
    lifecycle: {phase: 'ready', generation: 1, connectionGeneration: 2,
        nuttxProgramStorage: {requestSeq: seq, replySeq: pending ? 10 : seq, operation: 8, programId: 1, pending},
        nuttxProgramReply: [0x71, 1, 8, 1, 1, 0, 0, 0, ...Array(12).fill(0)]}});
function harness (frames = [frame(), frame(false)], extra = {}) {
    const calls = [];let index = 0, time = 0;
    const baseline = frame();delete baseline.lifecycle.nuttxProgramStorage;
    const args = {packet: encodeCommand(8, 1), initialFrame: baseline,
        submit: async args => {calls.push(['submit', args]);return frames[index++];},
        sample: async () => {calls.push(['sample']);return frames[index++];},
        now: () => time, wait: async ms => {time += ms;}, ...extra};
    return {calls, args};
}
test('pending stale same-op/id reply waits for exact acknowledgement with one submission', async () => {
    const h = harness([frame(), frame(), frame(false)]);
    const bytes = await exchangeStorage(h.args);
    assert.equal(bytes[2], 8);assert.deepEqual(h.calls.map(c => c[0]), ['submit', 'sample', 'sample']);
});
test('wrong operation, ID or captured sequence cannot complete storage', async () => {
    for (const [key, value] of [['operation', 9], ['programId', 2], ['requestSeq', 14]]) {
        const changed = frame(false);changed.lifecycle.nuttxProgramStorage[key] = value;
        if (key === 'requestSeq') changed.lifecycle.nuttxProgramStorage.replySeq = value;
        const h = harness([frame(), changed]);
        await assert.rejects(exchangeStorage(h.args), /Mismatched/);
        assert.equal(h.calls.filter(c => c[0] === 'submit').length, 1);
    }
    const wrongReply = frame(false);wrongReply.lifecycle.nuttxProgramReply[2] = 9;
    await assert.rejects(exchangeStorage(harness([wrongReply]).args), /mismatched/);
});
test('correlated errno is preserved by client; LOAD never sends START', async () => {
    const failed = frame(false);failed.lifecycle.nuttxProgramReply.splice(8, 4, 254, 255, 255, 255);
    const h = harness([failed]);const client = new NuttXProgramClient(packet => exchangeStorage({...h.args, packet}), 1);
    await assert.rejects(client.save(), e => e.result === -2 && e.reply.op === 8);
    const loaded = frame(false);loaded.lifecycle.nuttxProgramStorage.operation = 9;loaded.lifecycle.nuttxProgramReply[2] = 9;
    const l = harness([loaded]);const loadClient = new NuttXProgramClient(packet => exchangeStorage({...l.args, packet}), 1);
    assert.equal((await loadClient.load()).state, 1);assert.equal(l.calls.length, 1);
});
test('closed session cancels before another RPC and ignores late completion', async () => {
    let closed = false;
    const h = harness([frame(), frame(false)], {wait: async () => {closed = true;}, closed: () => closed});
    await assert.rejects(exchangeStorage(h.args), {name: 'AbortError'});assert.equal(h.calls.length, 1);
    const late = harness([frame(false)], {submit: async () => {closed = true;return frame(false);}, closed: () => closed});
    closed = false;await assert.rejects(exchangeStorage(late.args), {name: 'AbortError'});
});
test('malformed metadata, inconsistent pending, and unbounded values fail closed', () => {
    for (const change of [m => {m.requestSeq = 0;}, m => {m.requestSeq = 3;}, m => {m.replySeq = -2;},
        m => {m.replySeq = 0x100000000;}, m => {m.pending = false;}, m => {m.extra = 0;}, m => {m.programId = true;}]) {
        const f = frame();change(f.lifecycle.nuttxProgramStorage);assert.throws(() => storageMetadata(f), /Invalid/);
    }
});
test('old capability refuses before write and native storage vocabulary rejects nonstorage packets', async () => {
    const h = harness();h.args.initialFrame.target.capabilities = [];
    await assert.rejects(exchangeStorage(h.args), /unavailable/);assert.equal(h.calls.length, 0);
    const validate = OPERATIONS['renode.spike.program.storage.submit'].validate;
    for (const op of [8, 9]) assert.equal(validate({bytes: [...encodeCommand(op, 1)]}), true);
    for (const op of [2, 3, 4, 5, 6]) assert.equal(validate({bytes: [...encodeCommand(op, 1)]}), false);
    assert.equal(validate({bytes: [...encodeCommand(8, 1)], path: '/tmp/program'}), false);
    assert.equal(validate({bytes: [112, 1, 8, 0, 0, 0, 0, 0]}), false);
});
test('generation/target change, read failure and deadline never retry submission', async () => {
    for (const mutate of [f => {f.lifecycle.generation++;}, f => {f.lifecycle.connectionGeneration++;},
        f => {f.target.imageSha256 = 'b'.repeat(64);}, f => {f.lifecycle.phase = 'closed';}]) {
        const f = frame(false);mutate(f);const h = harness([frame(), f]);
        await assert.rejects(exchangeStorage(h.args), /session changed/);assert.equal(h.calls[0][0], 'submit');
    }
    const h = harness([frame()], {sample: async () => {throw new Error('endpoint closed');}});
    await assert.rejects(exchangeStorage(h.args), /endpoint closed/);assert.equal(h.calls.length, 1);
    let time = 0;const timed = harness([frame()], {now: () => time, wait: async () => {time = 29000;}});
    await assert.rejects(exchangeStorage(timed.args), /result is unknown/);assert.equal(timed.calls.length, 1);
});

test('sequence wrap is valid and a completion arriving after the job deadline is ignored', async () => {
    const pending = frame(true, 2);pending.lifecycle.nuttxProgramStorage.replySeq = 0xfffffffe;
    assert.equal((await exchangeStorage(harness([pending, frame(false, 2)], {initialFrame: frame(false, 0xfffffffe)}).args))[2], 8);
    let time = 0;
    const late = harness([], {now: () => time, submit: async () => {time = 30001;return frame(false);}});
    await assert.rejects(exchangeStorage(late.args), /result is unknown/);
});


test('fresh noop-submit snapshot with previous completed SAVE metadata cannot succeed', async () => {
    const old = frame(false, 12);old.seq = 100;
    const fresh = frame(false, 12);fresh.seq = 101;
    const h = harness([fresh], {initialFrame: old});
    await assert.rejects(exchangeStorage(h.args), /reused the previous request sequence/);
    assert.deepEqual(h.calls.map(c => c[0]), ['submit']);
    const valid = harness([frame(false, 14)], {initialFrame: old});
    assert.equal((await exchangeStorage(valid.args))[2], 8);
    const busy = harness([frame(false, 14)], {initialFrame: frame(true, 12)});
    await assert.rejects(exchangeStorage(busy.args), /already pending/);assert.equal(busy.calls.length, 0);
});

const checkpointFrame = (status = 'pending', sequence = 12) => {
    const f = frame(false, sequence);
    f.target.capabilities.push('nuttx-flash-checkpoint/v1');
    f.lifecycle.nuttxFlashCheckpoint = {requestSeq: sequence, programId: 1, status};
    return f;
};
const durableHarness = frames => {
    const h = harness(frames);
    h.args.initialFrame.target.capabilities.push('nuttx-flash-checkpoint/v1');
    return h;
};
test('durable SAVE waits beyond successful firmware ACK for correlated host commit', async () => {
    const h = durableHarness([checkpointFrame(), checkpointFrame(), checkpointFrame('durable')]);
    assert.equal((await exchangeStorage(h.args))[2], 8);
    assert.deepEqual(h.calls.map(c => c[0]), ['submit', 'sample', 'sample']);
});
test('host failure or lost capability never reports successful SAVE or retries writes', async () => {
    for (const status of ['failed', 'missing-capability']) {
        const f = checkpointFrame(status === 'failed' ? 'failed' : 'durable');
        if (status === 'missing-capability') f.target.capabilities.pop();
        const h = durableHarness([f]);
        await assert.rejects(exchangeStorage(h.args), /Host flash checkpoint/);
        assert.equal(h.calls.length, 1);
    }
});
test('stale, malformed or missing host receipt cannot complete successful SAVE', async () => {
    for (const mutate of [f => {f.lifecycle.nuttxFlashCheckpoint.requestSeq = 10;},
        f => {f.lifecycle.nuttxFlashCheckpoint.programId = 2;},
        f => {f.lifecycle.nuttxFlashCheckpoint.extra = true;},
        f => {delete f.lifecycle.nuttxFlashCheckpoint;},
        f => {f.lifecycle.nuttxFlashCheckpoint.status = 'exported';}]) {
        const f = checkpointFrame('durable');mutate(f);
        const h = durableHarness([f]);
        await assert.rejects(exchangeStorage(h.args), /checkpoint/);
        assert.equal(h.calls.length, 1);
    }
});
test('LOAD remains explicit and firmware errno does not wait for a host checkpoint', async () => {
    const loaded = checkpointFrame('pending');
    loaded.lifecycle.nuttxProgramStorage.operation = 9;loaded.lifecycle.nuttxProgramReply[2] = 9;
    const l = durableHarness([loaded]);l.args.packet = encodeCommand(9, 1);
    assert.equal((await exchangeStorage(l.args))[2], 9);assert.equal(l.calls.length, 1);
    const failed = checkpointFrame('pending');failed.lifecycle.nuttxProgramReply[8] = 22;
    const h = durableHarness([failed]);
    const client = new NuttXProgramClient(packet => exchangeStorage({...h.args, packet}), 1);
    await assert.rejects(client.save(), e => e.result === 22);
    assert.equal(h.calls.length, 1);
});

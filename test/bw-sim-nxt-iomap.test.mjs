// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
// Pure ABI/backing-state controls: no RXE execution, Jolt, network or compiler.
import test from 'node:test';
import assert from 'node:assert/strict';
import {SYSCALLS} from '../overlay/scratch-gui/src/lib/bw-sim/routes/nxt-vm/nxt-syscalls.js';
import {readNxtIOMap, writeNxtIOMap} from '../overlay/scratch-gui/src/lib/bw-sim/hubs/nxt/nxt-iomap.js';
import {NxtVm} from '../overlay/scratch-gui/src/lib/bw-sim/routes/nxt-vm/nxt-vm.js';
import {TC} from '../overlay/scratch-gui/src/lib/bw-sim/routes/nxt-vm/rxe-file.js';

const buttons = () => Array.from({length: 4}, (_, i) => ({down: i === 1, downMs: 17,
    shortReleases: 250 + i, longReleases: 10 + i}));
const vm = () => ({
    v: {name: 'Button.mod', offset: 10, count: 3, buffer: [7, 0, 9]},
    _get (id) { return this.v[id]; }, _set (id, value) { this.v[id] = value; },
    _string (id) { return this.v[id]; },
    _byteArray (id) { assert.ok(Array.isArray(this.v[id])); },
    _bytes (id) { return this.v[id].slice(); }, _setBytes (id, bytes) { this.v[id] = bytes.slice(); }
});
const readArgs = ['result', 'name', 'offset', 'count', 'buffer'];
const writeArgs = ['result', 'name', 'offset', 'buffer'];

test('Button projection reads short/long/total counters and held bits from shared backing state', () => {
    const b = buttons();
    for (let i = 0; i < 4; i++) assert.deepEqual(readNxtIOMap(b, 'Button.mod', i * 8 + 2, 3),
        {status: 0, data: [250 + i, 10 + i, (260 + 2 * i) & 255]});
    assert.deepEqual(readNxtIOMap(b, 'Button.mod', 32, 4), {status: 0, data: [0, 128, 0, 0]});
    b[1].shortReleases = 1;
    assert.deepEqual(readNxtIOMap(b, 'Button.mod', 12, 1), {status: 0, data: [12]});
});

test('unknown names, IDs, unmodeled fields and every out-of-range extent refuse without mutation', () => {
    const b = buttons(), before = JSON.stringify(b);
    for (const name of ['Button', 'button.mod', '*.mod', 'Output.mod', 0x40001])
        assert.deepEqual(readNxtIOMap(b, name, 32, 1), {status: 0x90, data: []});
    for (const [offset, count] of [[0, 1], [4, 2], [35, 2], [-1, 0], [36, 1], [37, 0], [2, -1], [NaN, 0]])
        assert.deepEqual(readNxtIOMap(b, 'Button.mod', offset, count), {status: 0x91, data: []});
    assert.equal(JSON.stringify(b), before);
    assert.deepEqual(readNxtIOMap(b, 'Button.mod', 36, 0), {status: 0, data: []});
});

test('only an exact three-counter zero write changes its one button and preserves held state', () => {
    const b = buttons(), before = structuredClone(b);
    assert.equal(writeNxtIOMap(b, 'Button.mod', 10, [0, 0, 0]), 0);
    assert.deepEqual(b[1], {...before[1], shortReleases: 0, longReleases: 0});
    for (const i of [0, 2, 3]) assert.deepEqual(b[i], before[i]);
    assert.deepEqual(readNxtIOMap(b, 'Button.mod', 10, 3), {status: 0, data: [0, 0, 0]});
    assert.equal(readNxtIOMap(b, 'Button.mod', 33, 1).data[0], 128);
    b[1].shortReleases++;
    assert.equal(readNxtIOMap(b, 'Button.mod', 12, 1).data[0], 1);
});

test('partial/nonzero/state writes are atomic refusals; empty bounded writes do nothing', () => {
    const b = buttons(), before = JSON.stringify(b);
    for (const [offset, bytes] of [[10, [0, 0]], [10, [0, 1, 0]], [10, [0, 0, 0, 0]],
        [12, [0]], [32, [0]], [34, [0, 0, 0]], [-6, [0, 0, 0]], [36, [0]]]) {
        assert.equal(writeNxtIOMap(b, 'Button.mod', offset, bytes), 0x91);
        assert.equal(JSON.stringify(b), before);
    }
    assert.equal(writeNxtIOMap(b, '*.mod', 10, [0, 0, 0]), 0x90);
    assert.equal(writeNxtIOMap(b, 'Button.mod', 36, []), 0);
    assert.equal(JSON.stringify(b), before);
});

test('syscall32 has five members, replaces only a successful buffer, and preserves Count', () => {
    const v = vm(), b = buttons();
    SYSCALLS[32].run(v, readArgs, {ioMapRead: (name, offset, count) => readNxtIOMap(b, name, offset, count)});
    assert.deepEqual(v.v.buffer, [251, 11, 6]); assert.equal(v.v.result, 0); assert.equal(v.v.count, 3);
    v.v.name = 'Unknown.mod'; v.v.buffer = [7, 0, 9];
    SYSCALLS[32].run(v, readArgs, {ioMapRead: (name, offset, count) => readNxtIOMap(b, name, offset, count)});
    assert.equal(v.v.result, -112); assert.deepEqual(v.v.buffer, [7, 0, 9]);
    v.v.name = 'Button.mod'; v.v.offset = 35; v.v.count = 2;
    SYSCALLS[32].run(v, readArgs, {ioMapRead: (name, offset, count) => readNxtIOMap(b, name, offset, count)});
    assert.equal(v.v.result, -111); assert.deepEqual(v.v.buffer, [7, 0, 9]);
});

test('read65 clears buffer before ERR_INVALID_SIZE; read64 reaches backend; no extra NUL is appended', () => {
    const v = vm(); v.v.count = 65;
    SYSCALLS[32].run(v, readArgs, {ioMapRead: () => assert.fail('oversized read reached backend')});
    assert.equal(v.v.result, -19); assert.deepEqual(v.v.buffer, []);
    v.v.count = 64;
    SYSCALLS[32].run(v, readArgs, {ioMapRead: (name, offset, count) => {
        assert.equal(count, 64); return {status: 0, data: Array(64).fill(3)};
    }});
    assert.equal(v.v.buffer.length, 64); assert.equal(v.v.count, 64);
});

test('syscall33 has four members and derives binary extent from Buffer, not a Count field', () => {
    const v = vm(); v.v.buffer = [0, 0, 0]; v.v.count = 999;
    const b = buttons();
    SYSCALLS[33].run(v, writeArgs, {ioMapWrite: (name, offset, bytes) => {
        assert.deepEqual([name, offset, bytes], ['Button.mod', 10, [0, 0, 0]]);
        return writeNxtIOMap(b, name, offset, bytes);
    }});
    assert.equal(v.v.result, 0); assert.equal(v.v.count, 999); assert.equal(b[1].down, true);
    assert.deepEqual(v.v.buffer, [0, 0, 0]);
    v.v.buffer = Array(65).fill(0);
    SYSCALLS[33].run(v, writeArgs, {ioMapWrite: () => assert.fail('oversized write reached backend')});
    assert.equal(v.v.result, -19); assert.equal(v.v.buffer.length, 65);
    v.v.buffer = Array(64).fill(0);
    SYSCALLS[33].run(v, writeArgs, {ioMapWrite: (name, offset, bytes) => {
        assert.equal(bytes.length, 64); return 0x91;
    }});
    assert.equal(v.v.result, -111); assert.equal(v.v.buffer.length, 64);
});

test('module input is captured before an aliased successful read replaces its buffer', () => {
    const v = vm(); v.v.buffer = 'Button.mod';
    v._byteArray = () => {}; // instrument argument-order only; typed VM storage is tested below
    SYSCALLS[32].run(v, ['result', 'buffer', 'offset', 'count', 'buffer'], {ioMapRead: name => {
        assert.equal(name, 'Button.mod'); return {status: 0, data: [0, 0, 0]};
    }});
    assert.deepEqual(v.v.buffer, [0, 0, 0]);
});

test('actual VM byte-array checks reject nested/nonbyte buffers and preserve the 32KiB allocation limit', () => {
    const v = new NxtVm();
    v.program = {clumps: [], staticSize: 2, toc: [{type: TC.ARRAY, offset: 0}, {type: TC.UBYTE, offset: 0}]};
    v.s.mem = [1, 0]; v.s.arrays = [null, {elemSize: 1, count: 3, data: [7, 0, 9]}];
    v._byteArray(0); assert.deepEqual(v._bytes(0), [7, 0, 9]);
    v.program.toc[1].type = TC.UWORD;
    assert.throws(() => v._byteArray(0), /byte array/);
    v.program.toc[1].type = TC.ARRAY;
    assert.throws(() => v._byteArray(0), /byte array/);
    v.program.toc[1].type = TC.UBYTE; v.program.staticSize = 32767;
    const before = JSON.stringify(v.s);
    assert.throws(() => v._setBytes(0, Array(64).fill(0)), /memory pool/);
    assert.equal(JSON.stringify(v.s), before);
});

test('syscall32 rejects a late unsupported byte without exposing a partial prefix', () => {
    const v = vm(), b = buttons();
    v.v.count = 4; v.v.buffer = [73, 42, 19];
    SYSCALLS[32].run(v, readArgs, {ioMapRead: (name, offset, count) => readNxtIOMap(b, name, offset, count)});
    assert.equal(v.v.result, -111);
    assert.equal(v.v.count, 4);
    assert.deepEqual(v.v.buffer, [73, 42, 19]);
});

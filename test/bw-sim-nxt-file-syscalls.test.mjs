// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
// ABI controls call the actual wrappers with an interface fake, never a guest or compiler.
import test from 'node:test';
import assert from 'node:assert/strict';
import {SYSCALLS} from '../overlay/scratch-gui/src/lib/bw-sim/routes/nxt-vm/nxt-syscalls.js';
import {NxtVm} from '../overlay/scratch-gui/src/lib/bw-sim/routes/nxt-vm/nxt-vm.js';
import {TC} from '../overlay/scratch-gui/src/lib/bw-sim/routes/nxt-vm/rxe-file.js';

const fake = values => ({
    values: {...values}, writes: [],
    _get (id) { return this.values[id]; },
    _set (id, value) { this.values[id] = value; this.writes.push([id, value]); },
    _string (id) { return this.values[id]; }
});
const call = (id, vm, args, io) => SYSCALLS[id].run(vm, args, io);

test('file opens retain U16 loader words and each distinct Length contract', () => {
    const vm = fake({f: 'proof.dat', n: 99});
    call(0, vm, ['r', 'h', 'f', 'n'], {fileOpenRead: name => {
        assert.equal(name, 'proof.dat'); return {status: 0x87, handle: 0};
    }});
    assert.deepEqual([vm.values.r, vm.values.n], [0x8700, 99]);
    call(0, vm, ['r', 'h', 'f', 'n'], {fileOpenRead: () => ({status: 0, handle: 4, size: 7})});
    assert.deepEqual([vm.values.r, vm.values.h, vm.values.n], [0, 4, 7]);
    call(1, vm, ['r', 'h', 'f', 'n'], {fileOpenWrite: (name, size) => {
        assert.equal(size, 7); return {status: 0, handle: 2};
    }});
    assert.equal(vm.values.n, 7);
    call(2, vm, ['r', 'h', 'f', 'n'], {fileOpenAppend: () => ({status: 0x8d, handle: 0, size: 0})});
    assert.deepEqual([vm.values.r, vm.values.n], [0x8d00, 0]);
});

test('FileRead allocates before I/O, keeps requested extent and terminates actual bytes', () => {
    const vm = fake({h: 3, n: 5});
    const data = [9, 9, 9, 9, 9, 9];
    let allocated = false;
    vm._fileReadBuffer = (id, count) => { assert.equal(id, 'b'); assert.equal(count, 5); allocated = true; return data; };
    call(3, vm, ['r', 'h', 'b', 'n'], {fileRead: (handle, count) => {
        assert.equal(allocated, true); assert.deepEqual([handle, count], [3, 5]);
        return {status: 0x85, handle, data: [65, 0, 66]};
    }});
    assert.deepEqual(data, [65, 0, 66, 0, 9, 9]);
    assert.deepEqual([vm.values.r, vm.values.n], [0x8500, 3]);
    vm.values.n = 5;
    call(3, vm, ['r', 'h', 'b', 'n'], {fileRead: handle => ({status: 0x93, handle, data: []})});
    assert.equal(vm.values.n, 5);
    assert.equal(data[5], 0);
    vm._fileReadBuffer = () => { throw new Error('allocation refused'); };
    assert.throws(() => call(3, vm, ['r', 'h', 'b', 'n'], {fileRead: () => assert.fail('cursor advanced')}), /allocation refused/);
});

test('FileWrite passes the explicit binary extent and clears invalid-handle Length', () => {
    const vm = fake({h: 2, n: 3});
    vm._fileWriteBytes = (id, count) => { assert.deepEqual([id, count], ['b', 3]); return [65, 0, 66]; };
    call(4, vm, ['r', 'h', 'b', 'n'], {fileWrite: (handle, bytes) => {
        assert.deepEqual(bytes, [65, 0, 66]); return {status: 0x84, handle, count: 2};
    }});
    assert.deepEqual([vm.values.r, vm.values.n], [0x8400, 2]);
    vm.values.n = 3;
    call(4, vm, ['r', 'h', 'b', 'n'], {fileWrite: handle => ({status: 0x93, handle, count: 0})});
    assert.deepEqual([vm.values.r, vm.values.n], [0x9300, 0]);
});

test('resolve missing leaves WriteHandle unchanged; rename captures names before aliased result writes', () => {
    const vm = fake({w: 1, f: 'proof.dat', next: 'next.dat', h: 2});
    call(6, vm, ['r', 'h', 'w', 'f'], {fileResolveHandle: () => ({status: 0x88, handle: 255})});
    assert.deepEqual([vm.values.r, vm.values.h, vm.values.w], [0x8800, 255, 1]);
    call(6, vm, ['r', 'h', 'w', 'f'], {fileResolveHandle: () => ({status: 0, handle: 4, write: false})});
    assert.deepEqual([vm.values.h, vm.values.w], [4, 0]);
    call(7, vm, ['f', 'f', 'next'], {fileRename: (oldName, newName) => {
        assert.deepEqual([oldName, newName], ['proof.dat', 'next.dat']); return 0x8f;
    }});
    assert.equal(vm.values.f, 0x8f00);
    call(5, vm, ['r', 'h'], {fileClose: h => { assert.equal(h, 4); return {status: 0}; }});
    call(8, vm, ['r', 'next'], {fileDelete: name => { assert.equal(name, 'next.dat'); return 0x87; }});
    assert.equal(vm.values.r, 0x8700);
});

test('ListFiles captures its pattern before replacing an aliased destination and reports byte zero', () => {
    const vm = fake({list: '*.dat'});
    vm._fileListNames = (id, names) => { assert.equal(id, 'list'); vm.values[id] = names; };
    call(47, vm, ['r', 'list', 'list'], {fileList: pattern => {
        assert.equal(pattern, '*.dat'); return ['one.dat', 'two.dat'];
    }});
    assert.deepEqual(vm.values.list, ['one.dat', 'two.dat']);
    assert.equal(vm.values.r, 0);
});

// Exercise actual allocation methods with a small typed dataspace, without loading/executing an RXE.
const memory = nested => {
    const vm = new NxtVm();
    vm.program = {clumps: [], staticSize: 2, toc: [
        {type: TC.ARRAY, offset: 0},
        ...(nested ? [{type: TC.ARRAY, offset: 0}] : []),
        {type: TC.UBYTE, offset: 0}
    ]};
    vm.s.mem = [1, 0];
    vm.s.arrays = [null, {elemSize: nested ? 2 : 1, count: 0, data: []}];
    return vm;
};

test('actual file buffer methods bound allocation, preserve tails and refuse out-of-buffer writes', () => {
    const vm = memory(false);
    vm._setBytes(0, [7, 8, 9]);
    assert.deepEqual(vm._fileReadBuffer(0, 4), [7, 8, 9, 0, 0]);
    assert.deepEqual(vm._fileWriteBytes(0, 3), [7, 8, 9]);
    const before = JSON.stringify(vm.s);
    assert.throws(() => vm._fileWriteBytes(0, 6), /file write exceeds/);
    assert.throws(() => vm._fileReadBuffer(0, 0xffffffff), /memory pool/);
    assert.equal(JSON.stringify(vm.s), before);
    vm.program.staticSize = 32750;
    assert.throws(() => vm._fileReadBuffer(0, 100), /memory pool/);
    assert.deepEqual(vm._bytes(0), [7, 8, 9, 0, 0]);
});

test('actual nested ListFiles allocation produces C strings and rolls back a partial allocation failure', () => {
    const vm = memory(true);
    vm._fileListNames(0, ['one.dat', 'two.dat']);
    const root = vm._dvOf(0);
    assert.equal(vm._string(1, root, 0), 'one.dat');
    assert.equal(vm._string(1, root, 2), 'two.dat');
    const before = JSON.stringify(vm.s);
    vm.program.staticSize = 32700;
    assert.throws(() => vm._fileListNames(0, ['a', 'b'.repeat(100)]), /memory pool/);
    assert.equal(JSON.stringify(vm.s), before);
    vm._fileListNames(0, []);
    assert.equal(vm._count(0), 0);
    assert.equal(vm.s.arrays.filter(Boolean).length, 1, 'nested arrays freed');
});

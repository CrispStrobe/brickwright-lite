// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
// Actual hub file hooks and cleanup only: no guest is loaded or executed.
import test from 'node:test';
import assert from 'node:assert/strict';
import {NxtVirtualHub} from '../overlay/scratch-gui/src/lib/bw-sim/hubs/nxt/nxt-virtual-hub.js';

test('VM resolve and retirement use program-owned handles while preserving unrelated downloads', () => {
    const hub = new NxtVirtualHub();
    const io = hub._programIo();
    const wire = hub.fileOpenWrite('wire.dat', 2);
    const program = io.fileOpenWrite('program.dat', 20);
    hub.fileWrite(wire.handle, [11]);
    io.fileWrite(program.handle, [88, 89, 90]);
    assert.deepEqual(io.fileResolveHandle('wire.dat'), {status: 0x88, handle: 255});
    assert.deepEqual(io.fileResolveHandle('program.dat'), {status: 0, handle: program.handle, write: true});
    const snapshot = JSON.parse(JSON.stringify(hub.exportState()));
    const restored = new NxtVirtualHub();
    restored.importState(snapshot);
    assert.deepEqual(restored._programIo().fileResolveHandle('program.dat'), io.fileResolveHandle('program.dat'));
    restored._programEnded('abort');
    assert.deepEqual(restored.s.files['program.dat'], [88, 89, 90]);
    assert.equal(restored.s.fileInfo['program.dat'].capacity, 3);
    assert.deepEqual(restored.s.programFileHandles, {});
    assert.equal(restored.s.handles[wire.handle].mode, 'write');
    assert.equal(restored.fileWrite(wire.handle, [12]).status, 0);
    assert.equal(restored.fileClose(wire.handle).status, 0);
    assert.deepEqual(restored.s.files['wire.dat'], [11, 12]);
    assert.equal(hub.s.fileInfo['program.dat'].capacity, 20, 'snapshot has independent state');
});

test('VM close validates the handle and clears only its resolve entry; normal close retains capacity', () => {
    const hub = new NxtVirtualHub();
    const io = hub._programIo();
    const writer = io.fileOpenWrite('open.dat', 12);
    io.fileWrite(writer.handle, [1, 0, 2]);
    assert.equal(io.fileClose(16).status, 0x93);
    assert.equal(io.fileResolveHandle('open.dat').status, 0);
    assert.equal(io.fileClose(writer.handle).status, 0);
    assert.equal(hub.s.fileInfo['open.dat'].capacity, 12);
    assert.deepEqual(io.fileResolveHandle('open.dat'), {status: 0x88, handle: 255});
    assert.equal(io.fileClose(writer.handle).status, 0x88);
    const reader = io.fileOpenRead('open.dat');
    assert.deepEqual(io.fileResolveHandle('open.dat'), {status: 0, handle: reader.handle, write: false});
});

test('prototype names do not masquerade as installed programs', () => {
    const hub = new NxtVirtualHub();
    assert.equal(hub.startProgram('constructor'), 0xc0);
    assert.equal(hub.startProgram('__proto__'), 0xc0);
    assert.equal(hub.vm, null);
});

test('program directory operations respect the shared full handle table without leaking temporary handles', () => {
    const hub = new NxtVirtualHub();
    const io = hub._programIo();
    assert.equal(hub.putFile('one.dat', [1]), 0);
    const handles = Array.from({length: 16}, () => hub.fileOpenRead('one.dat').handle);
    const before = JSON.stringify(hub.s);
    assert.equal(io.fileOpenRead('missing.dat').status, 0x81);
    assert.equal(io.fileOpenWrite('other.dat', 4).status, 0x81);
    assert.equal(io.fileOpenAppend('missing.dat').status, 0x81);
    assert.equal(io.fileRename('one.dat', 'other.dat'), 0x81);
    assert.equal(io.fileDelete('one.dat'), 0x81);
    assert.deepEqual(io.fileList('*.dat'), []);
    assert.equal(JSON.stringify(hub.s), before);
    hub.fileClose(handles[0]);
    assert.deepEqual(io.fileList('*.dat'), ['one.dat']);
    assert.equal(Object.keys(hub.s.handles).length, 15);
});

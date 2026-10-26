// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
// Hosted-only actual compiled-program controls; no compiler or network in this test.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {NxtVirtualHub} from '../overlay/scratch-gui/src/lib/bw-sim/hubs/nxt/nxt-virtual-hub.js';

const bytes = Array.from(readFileSync(new URL('./fixtures/nxt-rxe/file-syscalls.rxe', import.meta.url)));
const expected = [0, 0, 1, 1, 0, 70, 0, 0, 10, 0, 0, 0, 72, 34816, 35584, 34048, 72,
    65, 0, 90, 66, 67, 0, 1, 'renamed.dat', 0, 34560, 777, 0].map(String);
const make = () => {
    const hub = new NxtVirtualHub();
    assert.equal(hub.putFile('files.rxe', bytes), 0);
    assert.equal(hub.startProgram('files.rxe'), 0);
    return hub;
};
const advance = (hub, until) => {
    for (let time = hub.s.timeMs + 5; time <= until; time += 5) { hub.advanceTo(time); hub.publish(); }
};
const shown = hub => hub.events.filter(event => event.kind === 'display' && event.what === 'text').map(event => event.text);

test('one-shot compiler fixture bytes are fixed and source has matching retained digest', () => {
    const digest = value => createHash('sha256').update(value).digest('hex');
    assert.equal(digest(Uint8Array.from(bytes)), 'f2e5f00bf5f6ae3103605d87fe05a657d7d6539bd9624e04e4383ee099974a9b');
    assert.equal(digest(readFileSync(new URL('./fixtures/nxt-rxe/file-syscalls.nxc', import.meta.url))),
        'fb3fc5de2c89917a8571832688981a41473d881aaa41d6ef98fdc4ac83658ac4');
});

test('compiled NXC file calls preserve binary extents, word errors, append and list through normal retirement', () => {
    const hub = make();
    advance(hub, 1500);
    assert.equal(hub.vm.error, null);
    assert.equal(hub.currentProgramName(), null);
    assert.deepEqual(shown(hub), expected);
    assert.equal(hub.s.files['renamed.dat'], undefined);
    assert.deepEqual(hub.s.files['crop.dat'], [88, 89, 90]);
    assert.equal(hub.s.fileInfo['crop.dat'].capacity, 3);
    assert.deepEqual(hub.s.programFileHandles, {});
    assert.deepEqual(hub.s.handles, {});
    const reader = hub.fileOpenRead('crop.dat');
    assert.equal(reader.size, 3);
    assert.deepEqual(hub.fileRead(reader.handle, 4), {status: 0x85, handle: reader.handle, data: [88, 89, 90]});
});

test('STOPPROGRAM crops its own pending writer, preserves unrelated wire handles and restart isolation', () => {
    const hub = make();
    advance(hub, 500);
    assert.equal(hub.currentProgramName(), 'files.rxe');
    assert.deepEqual(shown(hub), expected);
    const wire = hub.fileOpenWrite('wire.dat', 2);
    assert.equal(wire.status, 0);
    hub.fileWrite(wire.handle, [11]);
    assert.equal(hub.stopProgram(), 0);
    assert.deepEqual(hub.s.files['crop.dat'], [88, 89, 90]);
    assert.equal(hub.s.fileInfo['crop.dat'].capacity, 3);
    assert.equal(hub.s.handles[wire.handle].mode, 'write');
    assert.equal(hub.fileWrite(wire.handle, [12]).status, 0);
    assert.equal(hub.fileClose(wire.handle).status, 0);
    assert.deepEqual(hub.s.files['wire.dat'], [11, 12]);
    assert.deepEqual(hub.s.programFileHandles, {});
    assert.equal(hub.fileDelete('crop.dat'), 0);
    assert.equal(hub.startProgram('files.rxe'), 0);
    advance(hub, 2000);
    assert.equal(hub.vm.error, null);
    assert.deepEqual(hub.s.files['crop.dat'], [88, 89, 90]);
});

test('a mid-program JSON snapshot retains appendable capacity, VM handle ownership and deterministic completion', () => {
    const original = make();
    advance(original, 500);
    const saved = original.exportState();
    assert.equal(saved.fileInfo['crop.dat'].capacity, 20);
    assert.equal(Object.keys(saved.programFileHandles).length, 1);
    const restored = new NxtVirtualHub();
    restored.importState(JSON.parse(JSON.stringify(saved)));
    assert.notEqual(restored.s.files, original.s.files);
    advance(original, 1500);
    advance(restored, 1500);
    assert.deepEqual(restored.exportState(), original.exportState());
    assert.equal(restored.s.fileInfo['crop.dat'].capacity, 3);
});

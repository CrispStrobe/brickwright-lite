// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
import test from 'node:test';
import assert from 'node:assert/strict';
import {
    LOADER, MAX_HANDLES, freshFiles, freeFlash,
    openWrite, write, close, openRead, read, remove, findFirst, findNext,
    openDataWrite, openAppend, rename, cropClose, listNames
} from '../overlay/scratch-gui/src/lib/bw-sim/hubs/nxt/nxt-files.js';

const bytes = values => Array.from(values, value => value & 0xff);
const stateCopy = state => JSON.parse(JSON.stringify(state));
const ok = LOADER.SUCCESS;

const createData = (state, name, capacity, content = []) => {
    const opened = openDataWrite(state, name, capacity);
    assert.equal(opened.status, ok);
    if (content.length) assert.equal(write(state, opened.handle, content).status, ok);
    assert.equal(close(state, opened.handle).status, ok);
};

test('fixed uploads keep their all-or-discard close rule while data files commit partial writes', () => {
    const state = freshFiles();

    const fixed = openWrite(state, 'FIXED.DAT', 5);
    assert.equal(fixed.status, ok);
    assert.deepEqual(write(state, fixed.handle, [1, 2, 3, 4, 5, 6]).status, LOADER.EOF_EXPECTED);
    assert.equal(close(state, fixed.handle).status, ok);
    assert.equal(openRead(state, 'FIXED.DAT').status, LOADER.FILE_NOT_FOUND);
    assert.equal(openAppend(state, 'ABSENT.DAT').status, LOADER.FILE_NOT_FOUND);

    const data = openDataWrite(state, 'DATA.DAT', 5);
    assert.equal(data.status, ok);
    assert.equal(freeFlash(state), 65536 - 5);
    assert.equal(write(state, data.handle, [0x41, 0, 0x42]).count, 3);
    assert.equal(close(state, data.handle).status, ok);
    assert.equal(state.fileInfo['DATA.DAT'].capacity, 5);
    assert.deepEqual(state.files['DATA.DAT'], [0x41, 0, 0x42]);

    const reopened = openRead(state, 'DATA.DAT');
    assert.deepEqual({status: reopened.status, size: reopened.size}, {status: ok, size: 3});
    assert.equal(write(state, reopened.handle, [4]).status, LOADER.ILLEGAL_HANDLE);
    assert.deepEqual(read(state, reopened.handle, 8), {
        status: LOADER.END_OF_FILE, handle: reopened.handle, data: [0x41, 0, 0x42]
    });
});

test('data overflow is sticky and trimmed; close retains bytes and reservation until crop', () => {
    const state = freshFiles();
    const opened = openDataWrite(state, 'OVER.DAT', 4);
    assert.equal(opened.status, ok);
    assert.deepEqual(write(state, opened.handle, [10, 11, 12]), {
        status: ok, handle: opened.handle, count: 3
    });
    assert.deepEqual(write(state, opened.handle, [13, 14]), {
        status: LOADER.EOF_EXPECTED, handle: opened.handle, count: 1
    });
    assert.deepEqual(write(state, opened.handle, [15]), {
        status: LOADER.EOF_EXPECTED, handle: opened.handle, count: 0
    });
    assert.equal(close(state, opened.handle).status, ok);
    assert.deepEqual(state.files['OVER.DAT'], [10, 11, 12, 13]);
    assert.equal(state.fileInfo['OVER.DAT'].capacity, 4);
    assert.equal(freeFlash(state), 65536 - 4);

    const partial = openDataWrite(state, 'PARTIAL.DAT', 9);
    assert.equal(write(state, partial.handle, [1, 2, 3]).count, 3);
    assert.deepEqual(cropClose(state, partial.handle), {status: ok, handle: partial.handle});
    assert.deepEqual(state.files['PARTIAL.DAT'], [1, 2, 3]);
    assert.equal(state.fileInfo['PARTIAL.DAT'].capacity, 3);
});

test('append is data-only, reports remaining space, and does not extend an open reader', () => {
    const state = freshFiles();
    createData(state, 'APPEND.DAT', 8, [1, 2, 3]);
    const reader = openRead(state, 'APPEND.DAT');
    const appender = openAppend(state, 'APPEND.DAT');
    assert.deepEqual(appender, {status: ok, handle: appender.handle, size: 5});
    const restored = stateCopy(state);
    assert.equal(write(restored, appender.handle, [4, 5]).status, ok);
    assert.equal(close(restored, appender.handle).status, ok);
    assert.deepEqual(read(restored, reader.handle, 8), {
        status: LOADER.END_OF_FILE, handle: reader.handle, data: [1, 2, 3]
    });
    assert.deepEqual(restored.files['APPEND.DAT'], [1, 2, 3, 4, 5]);
    assert.deepEqual(state.files['APPEND.DAT'], [1, 2, 3], 'snapshot writer must not alias its source state');

    const full = openAppend(restored, 'APPEND.DAT');
    assert.equal(full.status, LOADER.SUCCESS);
    assert.equal(full.size, 3);
    assert.equal(write(restored, full.handle, [6, 7, 8, 9]).status, LOADER.EOF_EXPECTED);
    assert.equal(close(restored, full.handle).status, ok);
    assert.deepEqual(restored.files['APPEND.DAT'], [1, 2, 3, 4, 5, 6, 7, 8]);
    assert.equal(openAppend(restored, 'APPEND.DAT').status, LOADER.FILE_IS_FULL);

    const fixed = openWrite(restored, 'FIXED2.DAT', 1);
    assert.equal(write(restored, fixed.handle, [0]).status, ok);
    assert.equal(close(restored, fixed.handle).status, ok);
    assert.equal(openAppend(restored, 'FIXED2.DAT').status, LOADER.APPEND_NOT_POSSIBLE);
});

test('rename checks destination first, refuses busy sources, then preserves bytes under the new name', () => {
    const state = freshFiles();
    createData(state, 'SOURCE.DAT', 5, [9, 8]);
    createData(state, 'TARGET.DAT', 5, [7]);

    assert.equal(rename(state, 'MISSING.DAT', 'TARGET.DAT'), LOADER.FILE_EXISTS);
    const reader = openRead(state, 'SOURCE.DAT');
    assert.equal(rename(state, 'SOURCE.DAT', 'OTHER.DAT'), LOADER.FILE_IS_BUSY);
    assert.equal(rename(state, 'SOURCE.DAT', 'TARGET.DAT'), LOADER.FILE_EXISTS);
    assert.equal(close(state, reader.handle).status, ok);

    const writer = openAppend(state, 'SOURCE.DAT');
    assert.equal(writer.status, ok);
    assert.equal(rename(state, 'SOURCE.DAT', 'OTHER.DAT'), LOADER.FILE_IS_BUSY);
    assert.equal(close(state, writer.handle).status, ok);

    assert.equal(rename(state, 'MISSING.DAT', 'OTHER.DAT'), LOADER.FILE_NOT_FOUND);
    assert.equal(rename(state, 'SOURCE.DAT', 'OTHER.DAT'), ok);
    assert.equal(openRead(state, 'SOURCE.DAT').status, LOADER.FILE_NOT_FOUND);
    const moved = openRead(state, 'OTHER.DAT');
    assert.equal(moved.status, ok);
    assert.equal(moved.size, 2);
    assert.deepEqual(read(state, moved.handle, 2).data, [9, 8]);
    assert.equal(remove(state, 'OTHER.DAT'), LOADER.FILE_IS_BUSY);
    assert.equal(close(state, moved.handle).status, ok);
    assert.equal(remove(state, 'OTHER.DAT'), ok);

    createData(state, 'RUNNING.RXE', 2, [1]);
    assert.equal(rename(state, 'RUNNING.RXE', 'RENAMED.RXE', 'RUNNING.RXE'), LOADER.FILE_IS_BUSY);
    assert.equal(rename(state, 'RUNNING.RXE', 'RENAMED.RXE'), ok);
});

test('directory listing includes committed empty data files without leaking search handles', () => {
    const state = freshFiles();
    const empty = openDataWrite(state, 'EMPTY.DAT', 7);
    assert.equal(empty.status, ok);
    assert.equal(close(state, empty.handle).status, ok);
    createData(state, 'ALPHA.DAT', 4, [1]);
    createData(state, 'ALPHA.TXT', 4, [2]);

    assert.deepEqual(new Set(listNames(state, '*.DAT')), new Set(['EMPTY.DAT', 'ALPHA.DAT']));
    assert.deepEqual(listNames(state, 'NOPE.*'), []);
    assert.equal(openRead(state, 'EMPTY.DAT').size, 0);
    assert.equal(openRead(state, 'EMPTY.DAT').status, ok);
    assert.equal(openRead(state, 'ALPHA.DAT').status, ok);

    for (let i = 0; i < 10; i++) {
        assert.deepEqual(new Set(listNames(state, 'ALPHA.*')), new Set(['ALPHA.DAT', 'ALPHA.TXT']));
    }
    assert.ok(Object.keys(state.handles).length <= 3, 'repeated list calls must not consume persistent handles');
});

test('zero-capacity creation, shared pools, and prototype-shaped filenames stay bounded', () => {
    const state = freshFiles();
    const zero = openDataWrite(state, 'ZERO.DAT', 0);
    assert.equal(zero.status, ok);
    assert.equal(close(state, zero.handle).status, ok);
    assert.ok(listNames(state, '*.DAT').includes('ZERO.DAT'));
    assert.equal(openRead(state, 'ZERO.DAT').status, LOADER.FILE_NOT_FOUND);

    for (const name of ['__proto__', 'constructor', 'toString']) createData(state, name, 2, [name.length]);
    for (const name of ['__proto__', 'constructor', 'toString']) {
        const opened = openRead(state, name);
        assert.equal(opened.status, ok);
        assert.deepEqual(read(state, opened.handle, 1).data, [name.length]);
        assert.equal(close(state, opened.handle).status, ok);
    }

    const handles = [];
    for (let i = 0; i < MAX_HANDLES; i++) {
        const opened = openRead(state, 'constructor');
        assert.equal(opened.status, ok);
        handles.push(opened.handle);
    }
    assert.equal(openRead(state, 'constructor').status, LOADER.NO_MORE_HANDLES);
    assert.equal(findFirst(state, '*.*').status, LOADER.NO_MORE_HANDLES);
    for (const handle of handles) assert.equal(close(state, handle).status, ok);

    const snapshot = stateCopy(state);
    const restored = stateCopy(snapshot);
    assert.deepEqual(restored.files, state.files);
    assert.deepEqual(restored.fileInfo, state.fileInfo);
    assert.deepEqual(restored.handles, state.handles);
    assert.deepEqual(new Set(listNames(restored, '*.*')), new Set(listNames(state, '*.*')));
    assert.notEqual(restored.files, state.files, 'snapshot restore must not alias the source files map');
});

test('writer-buffer and directory quotas are shared and failed opens do not change state', () => {
    const state = freshFiles();
    const writers = [];
    for (let i = 0; i < 4; i++) {
        const opened = openDataWrite(state, `W${i}.DAT`, 1);
        assert.equal(opened.status, ok);
        writers.push(opened.handle);
    }
    const before = stateCopy(state);
    assert.equal(openDataWrite(state, 'FIFTH.DAT', 1).status, LOADER.NO_WRITE_BUFFERS);
    assert.deepEqual(state, before);
    for (const handle of writers) assert.equal(close(state, handle).status, ok);

    const zeroWriters = [];
    for (let i = 0; i < 4; i++) zeroWriters.push(openDataWrite(state, `Z${i}.DAT`, 0).handle);
    assert.equal(openWrite(state, 'FIXED.DAT', 0).status, LOADER.NO_WRITE_BUFFERS,
        'fixed-upload and program-data writers share the four loader buffers');
    for (const handle of zeroWriters) assert.equal(close(state, handle).status, ok);

    const directory = freshFiles();
    for (let i = 0; i < 127; i++) createData(directory, `F${i}.DAT`, 1);
    const fullDirectory = stateCopy(directory);
    assert.equal(openDataWrite(directory, 'TOO-MANY.DAT', 1).status, LOADER.NO_MORE_FILES);
    assert.deepEqual(directory, fullDirectory);
    assert.equal(remove(directory, 'F0.DAT'), ok);
    createData(directory, 'LAST.DAT', 1);
    assert.equal(Object.keys(directory.files).length, 127);
});

test('directory slots retain loader order across pending uploads, rename, refusal, and snapshot', () => {
    const state = freshFiles();
    const first = openWrite(state, 'Z.DAT', 2);
    assert.equal(first.status, ok);
    createData(state, 'A.DAT', 3, [0x42]);
    assert.equal(write(state, first.handle, [0x41, 0]).status, ok);
    assert.equal(close(state, first.handle).status, ok);
    assert.deepEqual(listNames(state, '*.*'), ['Z.DAT', 'A.DAT']);

    assert.equal(rename(state, 'A.DAT', 'M.DAT'), ok);
    assert.deepEqual(listNames(state, '*.*'), ['Z.DAT', 'M.DAT']);

    const failed = openWrite(state, 'C.DAT', 2);
    assert.equal(failed.status, ok);
    assert.equal(write(state, failed.handle, [0x43]).status, ok);
    assert.equal(close(state, failed.handle).status, ok);
    assert.deepEqual(listNames(state, '*.*'), ['Z.DAT', 'M.DAT']);

    const overlongOld = 'O'.repeat(20);
    assert.equal(rename(state, overlongOld, 'Z.DAT'), LOADER.FILE_EXISTS,
        'an existing destination is reported before validating the source name');
    assert.equal(rename(state, overlongOld, 'MISSING.DAT'), LOADER.ILLEGAL_FILE_NAME);

    const restored = stateCopy(state);
    assert.deepEqual(listNames(restored, '*.*'), ['Z.DAT', 'M.DAT']);
});

// SPDX-License-Identifier: BSD-3-Clause
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {admitEsp32S3Rom, loadEsp32S3Roms, readEsp32S3RomResponse} from '../overlay/scratch-gui/src/lib/bw-debug/esp32s3-firmware.js';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const descriptor = bytes => ({bytes: bytes.length, sha256: digest(bytes)});

test('stream admission fills the pinned window and cancels an oversized body', async () => {
    const bytes = Uint8Array.of(1, 2, 3, 4);
    let pulls = 0;
    let cancelled = false;
    const body = new ReadableStream({
        pull(controller) { pulls++; controller.enqueue(Uint8Array.of(1, 2, 3)); },
        cancel() { cancelled = true; }
    });
    await assert.rejects(readEsp32S3RomResponse({response: {body}, descriptor: descriptor(bytes), name: 'irom'}),
        /response exceeds the pinned 4-byte window/);
    assert.equal(cancelled, true);
    assert.ok(pulls <= 3, 'an oversized/infinite response must not be drained');
    assert.deepEqual(await readEsp32S3RomResponse({response: new Response(bytes), descriptor: descriptor(bytes), name: 'irom'}), bytes);
    await assert.rejects(readEsp32S3RomResponse({response: new Response(bytes.subarray(1)), descriptor: descriptor(bytes), name: 'irom'}),
        /must contain exactly 4 bytes/);
});

test('ROM admission returns the exact verified bytes in a private snapshot', async () => {
    const bytes = Uint8Array.of(0x40, 0, 0x9a, 0xff);
    const expected = Uint8Array.from(bytes);
    const pending = admitEsp32S3Rom({bytes, descriptor: descriptor(bytes), name: 'irom'});
    bytes.fill(0);
    const verified = await pending;
    assert.deepEqual(verified, expected);
    assert.notEqual(verified.buffer, bytes.buffer);
});

test('same-size corruption and wrong-size ROMs are refused before attachment', async () => {
    const bytes = Uint8Array.of(1, 2, 3, 4);
    const pinned = descriptor(bytes);
    await assert.rejects(admitEsp32S3Rom({bytes: Uint8Array.of(1, 2, 3, 5), descriptor: pinned, name: 'drom'}),
        /drom ROM SHA-256/);
    await assert.rejects(admitEsp32S3Rom({bytes: bytes.subarray(1), descriptor: pinned, name: 'irom'}),
        /irom ROM must contain exactly 4 bytes/);
});

test('admission requires bounded bytes and an immutable digest', async () => {
    for (const pin of [{bytes: 0, sha256: 'a'.repeat(64)}, {bytes: 512 * 1024 + 1, sha256: 'a'.repeat(64)},
        {bytes: 4, sha256: 'latest'}, {bytes: 4.5, sha256: 'a'.repeat(64)}]) {
        await assert.rejects(admitEsp32S3Rom({bytes: new Uint8Array(4), descriptor: pin, name: 'irom'}), /bounded ROM/);
    }
    await assert.rejects(loadEsp32S3Roms({base: null}), /document base URL/);
});

test('browser assets resolve under the document base and missing ROMs stay a visible error', async () => {
    const urls = [];
    await assert.rejects(loadEsp32S3Roms({base: 'https://example.test/workbench/', fetcher: async url => {
        urls.push(url);
        return {ok: false};
    }}), /ROM is unavailable/);
    assert.deepEqual(urls.sort(), [
        'https://example.test/workbench/static/esp32s3/esp32s3_drom.bin',
        'https://example.test/workbench/static/esp32s3/esp32s3_rom.bin'
    ]);
});

// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {encodeSource, RawReplResult, MicroPythonProgramClient} from '../overlay/scratch-gui/src/lib/spike-micropython/raw-repl.js';
const bytes = text => new TextEncoder().encode(text);
const banner = bytes('\r\nraw REPL; CTRL-B to exit\r\n>');
test('completion requires ACK, two output delimiters, and prompt across all split boundaries', () => {
    const wire = bytes('OKhéllo\r\n\x04ValueError: example\r\n\x04>');
    for (let split = 1; split < wire.length; split++) {
        const parser = new RawReplResult();
        assert.equal(parser.accept(wire.slice(0, split)), false);
        assert.throws(() => parser.result, /incomplete/);
        assert.equal(parser.accept(wire.slice(split)), true);
        assert.deepEqual(parser.result, {stdout: 'héllo\r\n', stderr: 'ValueError: example\r\n', failed: true});
    }
    const parser = new RawReplResult();
    for (const byte of bytes('OK42\r\n\x04\x04>')) parser.accept(new Uint8Array([byte]));
    assert.deepEqual(parser.result, {stdout: '42\r\n', stderr: '', failed: false});
});
test('protocol mutations cannot become successful execution', () => {
    for (const wire of ['NO42\x04\x04>', 'NK42\x04\x04>', 'OK42\x04\x04?', 'OK42\x04\x04>junk']) {
        assert.throws(() => new RawReplResult().accept(bytes(wire)));
    }
    for (const wire of ['OK42', 'OK42\x04', 'OK42\x04\x04']) {
        const parser = new RawReplResult();
        assert.equal(parser.accept(bytes(wire)), false);
        assert.throws(() => parser.result, /incomplete/);
    }
    const parser = new RawReplResult(); parser.accept(bytes('OK'));
    assert.throws(() => parser.accept(new Uint8Array(65536).fill(65)), /exceeds/);
});
test('source validation prevents UART control injection and uses UTF-8 byte limit', () => {
    for (const source of ['', ' ', null, 'print(1)\x04', 'x\0', 'x\x03', 'x\x7f', 'é'.repeat(8193)]) assert.throws(() => encodeSource(source));
    assert.equal(encodeSource('é'.repeat(8192)).length, 16384);
    assert.deepEqual(encodeSource('a\n\tb\r'), bytes('a\n\tb\r'));
});
test('sequential executions stream bounded source chunks and remain available after Python exception', async () => {
    const writes = [], reads = [banner.slice(0, 8), banner.slice(8), bytes('OK\x04ValueError\x04>'), banner, bytes('OK42\r\n\x04\x04>')];
    let closes = 0;
    const client = new MicroPythonProgramClient({read: async () => reads.shift(), write: async value => writes.push(value), close: async () => closes++});
    assert.equal((await client.execute('x'.repeat(65))).failed, true);
    assert.deepEqual(writes.map(value => value.length), [4, 32, 32, 1, 1]);
    assert.equal((await client.execute('print(42)')).stdout, '42\r\n');
    assert.equal(closes, 0);
    await client.cancel(); await client.cancel(); assert.equal(closes, 1);
});
test('concurrent execution refused; cancellation discards late reads and closes only owned transport', async () => {
    let resolveRead, closes = 0;
    const client = new MicroPythonProgramClient({write: async () => {}, read: () => new Promise(resolve => {resolveRead = resolve;}), close: async () => closes++});
    const running = client.execute('pass');
    await assert.rejects(client.execute('pass'), /busy/);
    await client.cancel(); resolveRead(banner);
    await assert.rejects(running, /abort/i);
    assert.equal(closes, 1);
    await assert.rejects(client.execute('pass'), /closed/);
});
test('timeouts abort pending reads and release ownership; malformed transport closes', async () => {
    let closes = 0;
    const client = new MicroPythonProgramClient({write: async () => {}, read: ({signal}) => new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), {once: true})), close: async () => closes++});
    await assert.rejects(client.execute('while True: pass', {timeoutMs: 100}), /abort/i);
    assert.equal(closes, 1);
    const broken = new MicroPythonProgramClient({write: async () => {}, read: async () => new Uint8Array(), close: async () => closes++});
    await assert.rejects(broken.execute('pass'), /Invalid UART/);
    assert.equal(closes, 2);
});

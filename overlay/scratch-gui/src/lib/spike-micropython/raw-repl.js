// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
// UART protocol only. The host owns the image, emulator, byte pacing and arena.
// https://docs.micropython.org/en/v1.26.0/reference/repl.html#raw-mode-and-raw-paste-mode
const encoder = new TextEncoder();
const banner = encoder.encode('raw REPL; CTRL-B to exit\r\n>');
const LIMIT = 65536;

export function encodeSource (source) {
    if (typeof source !== 'string' || !source.trim() || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(source)) {
        throw new TypeError('Python source must be nonempty and contain no UART control bytes');
    }
    const bytes = encoder.encode(source);
    if (bytes.length > 16384) throw new RangeError('Python source exceeds 16384 UTF-8 bytes');
    return bytes;
}

/** A single execution. Completion requires both EOT frames and the raw prompt. */
export class RawReplResult {
    constructor () { this.phase = 'ack'; this.stdout = []; this.stderr = []; this.count = 0; }
    accept (bytes) {
        if (!(bytes instanceof Uint8Array)) throw new TypeError('Expected UART bytes');
        for (const byte of bytes) {
            if (++this.count > LIMIT) throw new RangeError('MicroPython output exceeds 65536 bytes');
            if (this.phase === 'ack') {
                if (byte !== 79) throw new Error('Missing raw REPL acknowledgment');
                this.phase = 'ack-k';
            } else if (this.phase === 'ack-k') {
                if (byte !== 75) throw new Error('Missing raw REPL acknowledgment');
                this.phase = 'stdout';
            } else if (this.phase === 'stdout' || this.phase === 'stderr') {
                if (byte === 4) this.phase = this.phase === 'stdout' ? 'stderr' : 'prompt';
                else this[this.phase].push(byte);
            } else if (this.phase === 'prompt') {
                if (byte !== 62) throw new Error('Missing final raw REPL prompt');
                this.phase = 'complete';
            } else throw new Error('Unexpected bytes after raw REPL completion');
        }
        return this.phase === 'complete';
    }
    get result () {
        if (this.phase !== 'complete') throw new Error('MicroPython execution is incomplete');
        const decoder = new TextDecoder();
        const stdout = decoder.decode(new Uint8Array(this.stdout));
        const stderr = decoder.decode(new Uint8Array(this.stderr));
        return {stdout, stderr, failed: stderr.length !== 0};
    }
}

/**
 * Exclusive byte transport for an already-owned, booted UART2 session.
 * read({signal}) must block until bytes arrive and honor abort; write(bytes,
 * {signal}) must pace <=32-byte chunks. close() terminates only this session.
 * Cancellation closes the owned emulator even if Python catches Ctrl-C.
 */
export class MicroPythonProgramClient {
    constructor ({read, write, close}) {
        if ([read, write, close].some(fn => typeof fn !== 'function')) throw new TypeError('Incomplete UART transport');
        this.read = read; this.write = write; this.close = close;
        this.closed = false; this.busy = false;
    }
    async execute (source, {timeoutMs = 30000} = {}) {
        const bytes = encodeSource(source);
        if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 300000) throw new RangeError('Invalid execution timeout');
        if (this.closed || this.busy) throw new Error('MicroPython session is closed or busy');
        this.busy = true;
        this.controller = new AbortController();
        const signal = this.controller.signal;
        const timer = setTimeout(() => this.cancel().catch(() => {}), timeoutMs);
        try {
            // Interrupt a boot-time program, enter friendly mode, then raw mode.
            await this.write(new Uint8Array([3, 3, 2, 1]), {signal});
            const received = [];
            let ready = false;
            while (!ready) {
                const chunk = await this.read({signal});
                signal.throwIfAborted();
                if (!(chunk instanceof Uint8Array) || !chunk.length || chunk.length > 4096) throw new Error('Invalid UART read');
                received.push(...chunk);
                if (received.length > 4096) throw new Error('Raw REPL startup exceeds 4096 bytes');
                if (received.length >= banner.length) {
                    ready = banner.every((byte, index) => received[received.length - banner.length + index] === byte);
                }
            }
            for (let offset = 0; offset < bytes.length; offset += 32) {
                signal.throwIfAborted();
                await this.write(bytes.slice(offset, offset + 32), {signal});
            }
            signal.throwIfAborted();
            await this.write(new Uint8Array([4]), {signal});
            const result = new RawReplResult();
            while (true) {
                const chunk = await this.read({signal});
                signal.throwIfAborted();
                if (!(chunk instanceof Uint8Array) || !chunk.length || chunk.length > 4096) throw new Error('Invalid UART read');
                if (result.accept(chunk)) return result.result;
            }
        } catch (error) {
            await this.cancel();
            throw error;
        } finally { clearTimeout(timer); this.busy = false; }
    }
    cancel () {
        if (this.closing) return this.closing;
        this.closed = true;
        this.controller?.abort();
        // The host closes the process, so no blocked read or caught interrupt
        // can retain motor/clock ownership. No calls reach unrelated sessions.
        this.closing = Promise.resolve().then(() => this.close());
        return this.closing;
    }
}

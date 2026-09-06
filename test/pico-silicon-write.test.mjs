/**
 * The silicon write survives a 64-byte-per-packet CDC endpoint (N3c follow-up).
 *
 * The sim lane found it: rp2040js's CDC pulls at most one 64-byte bulk-OUT
 * packet per poll, and a single large write loses everything past the first
 * packet. A REAL Pico's CDC endpoint is 64 bytes too, so `deployMainPy` — which
 * sends each `f.write(b"...")` command as one large write — has almost certainly
 * been truncating long programs on hardware, unmeasured. The fix makes exec and
 * execStart share ONE write discipline (pico-repl.writeChunked): the program
 * goes in <=64-byte packets. These tests drive it against a mock device that
 * accepts exactly one 64-byte packet per write and asserts a 1122-byte program
 * arrives WHOLE — red on the old single-write path (deployMainPy would report a
 * byte-count mismatch and throw).
 *
 * pico-repl.js is pure, so this runs everywhere — no firmware, no emulator.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createPicoRepl, webSerialTransport} from '../overlay/scratch-gui/src/lib/pico-repl.js';

// 1122 bytes of printable, UN-escaped bytes (no ", \\, newline, or control), so
// the device can reconstruct main.py from the f.write(b"...") literals exactly.
const PROGRAM = 'abcdefgh0123 '.repeat(90).slice(0, 1122);

/**
 * A CDC device that delivers ONE 64-byte packet per write (the rest dropped —
 * the truncation the lane is about) and speaks enough raw REPL for exec /
 * execStart / deployMainPy to complete, reconstructing main.py from the f.write
 * commands so os.stat can answer its real length.
 */
function device () {
    let rx = '', outbox = '', cmd = '', mainPy = '';
    const runCmd = () => {
        const w = cmd.match(/f\.write\(b"([\s\S]*)"\)/);
        if (w) { mainPy += w[1]; outbox += 'OK\x04\x04>'; }
        else if (/os\.stat/.test(cmd)) outbox += `OK${mainPy.length}\x04\x04>`;
        else outbox += 'OK\x04\x04>';
        cmd = '';
    };
    return {
        feed (text) {
            const packet = text.slice(0, 64);   // one packet per write; rest dropped
            rx += packet;
            for (const ch of packet) {
                if (ch === '\x01') { outbox += 'raw REPL; CTRL-B to exit\r\n>'; cmd = ''; }     // Ctrl-A
                else if (ch === '\x04') runCmd();                                                // Ctrl-D
                else if (ch === '\x03' || ch === '\x02' || ch === '\r' || ch === '\n') { /* control */ }
                else cmd += ch;
            }
        },
        drain () { const o = outbox; outbox = ''; return o; },
        rx: () => rx,
        mainPy: () => mainPy
    };
}

const mockTransport = (dev) => ({async write (t) { dev.feed(t); }, async read () { return dev.drain(); }});
const seenProgram = (dev) => dev.rx().replace(/[\x01-\x04\r\n]/g, '');

test('a single large write is truncated to one 64-byte packet — the defect the fix is for', () => {
    const dev = device();
    dev.feed(PROGRAM);   // the OLD single-write path
    assert.equal(dev.rx().length, 64,
        'a >64-byte single write should lose everything past the first packet — if not, the mock does not model the bug');
});

test('execStart delivers a 1122-byte program WHOLE through a 64-byte-packet device', async () => {
    const dev = device();
    const repl = createPicoRepl(mockTransport(dev), {timeoutMs: 5000});
    await repl.execStart(PROGRAM);
    assert.equal(seenProgram(dev), PROGRAM, 'the program did not arrive whole — the write was not chunked');
});

test('deployMainPy lands a 1122-byte main.py WHOLE — the silicon install-and-reboot path', async () => {
    const dev = device();
    const repl = createPicoRepl(mockTransport(dev), {timeoutMs: 5000});
    // deployMainPy verifies os.stat == expected and THROWS on a mismatch, so a
    // truncated f.write (the old single-write path) makes this reject by itself.
    const written = await repl.deployMainPy(PROGRAM);
    assert.equal(written, PROGRAM.length, 'deployMainPy reported the wrong byte count');
    assert.equal(dev.mainPy(), PROGRAM, 'main.py did not arrive whole — the f.write commands truncated');
});

/**
 * The WebSerial transport (the Chromium silicon path) measured the same way: a
 * mock port whose writer takes one 64-byte packet per write and whose reader
 * hands back the device's responses. The chunking lives in the REPL layer, so
 * the transport must pass the <=64-byte writes through untouched.
 */
function mockPort (dev) {
    const enc = new TextEncoder(), dec = new TextDecoder();
    const outQ = [];
    const pump = () => { const s = dev.drain(); if (s) outQ.push(enc.encode(s)); };
    return {
        writable: {getWriter: () => ({
            write: async (chunk) => { dev.feed(dec.decode(chunk)); pump(); },
            releaseLock: () => {}
        })},
        readable: {getReader: () => ({
            read: async () => {
                for (let i = 0; i < 200 && !outQ.length; i++) { await new Promise(r => setTimeout(r, 2)); pump(); }
                return outQ.length ? {value: outQ.shift(), done: false} : {value: new Uint8Array(0), done: false};
            },
            cancel: async () => {}, releaseLock: () => {}
        })},
        open: async () => {}, close: async () => {}
    };
}

test('the WebSerial transport passes the chunked writes whole to the port', async () => {
    const dev = device();
    const repl = createPicoRepl(webSerialTransport(mockPort(dev)), {timeoutMs: 5000});
    await repl.execStart(PROGRAM);
    assert.equal(seenProgram(dev), PROGRAM, 'the WebSerial path truncated the program');
});

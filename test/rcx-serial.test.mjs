// The RCX link over Web Serial, against a mock port. No tower, no brick.
//
// What is worth testing here is NOT that bytes go out — it is the two things
// that are easy to get silently wrong at this layer:
//
//   1. the line settings, because 2400/8/odd/1 is not a preference. RCX
//      Internals: "RCX completely ignores messages that have invalid packet
//      checksums", so a wrong parity produces no error, just a brick that
//      never answers; and
//   2. when to STOP listening, because infrared echoes and the reply arrives
//      after the echo. A read that ends early truncates a reply that was
//      perfectly fine on the wire.
import {test} from 'node:test';
import assert from 'node:assert/strict';

import {
    openRcxSerial, requestRcxPort, byteMs,
    RCX_BAUD_RATE, RCX_PARITY, FIRMWARE_BAUD_RATE, FIRMWARE_PARITY,
    LEGO_USB_TOWER, DEFAULT_TIMEOUT_MS
} from '../overlay/scratch-gui/src/lib/rcx/rcx-serial.js';
import {
    encodeCommand, extractReply, replyOpcodeFor, TOGGLE_BIT, OP, RcxSession
} from '../overlay/scratch-gui/src/lib/rcx/rcx-protocol.js';

/**
 * A mock Web Serial port.
 *
 * `script` is called with each frame written and returns the chunks the port
 * should hand back, each with a delay — which is the whole point, because the
 * timing is what this module reasons about. A real adapter delivers on its
 * own schedule and the brick takes a moment to turn the link around.
 */
const mockPort = script => {
    const opened = [];
    const written = [];
    const queue = [];
    let resolveWaiter = null;
    let closedRead = false;

    const push = chunk => {
        queue.push(chunk);
        if (resolveWaiter) {
            const r = resolveWaiter;
            resolveWaiter = null;
            r();
        }
    };

    return {
        opened,
        written,
        open: async settings => {
            opened.push(settings);
        },
        close: async () => {
            closedRead = true;
            if (resolveWaiter) {
                const r = resolveWaiter;
                resolveWaiter = null;
                r();
            }
        },
        writable: {
            getWriter: () => ({
                write: async chunk => {
                    written.push(new Uint8Array(chunk));
                    for (const {after, bytes} of script(new Uint8Array(chunk), written.length)) {
                        setTimeout(() => push(new Uint8Array(bytes)), after);
                    }
                },
                releaseLock: () => {}
            })
        },
        readable: {
            getReader: () => ({
                read: async () => {
                    while (!queue.length && !closedRead) {
                        await new Promise(resolve => {
                            resolveWaiter = resolve;
                        });
                    }
                    if (queue.length) return {value: queue.shift(), done: false};
                    return {value: undefined, done: true};
                },
                cancel: async () => {
                    closedRead = true;
                    if (resolveWaiter) {
                        const r = resolveWaiter;
                        resolveWaiter = null;
                        r();
                    }
                },
                releaseLock: () => {}
            })
        }
    };
};

/**
 * The bytes a real link hears back: the tower's echo, then the brick's reply.
 *
 * Built exactly the way `createFakeTower` in the protocol module builds one,
 * and for a reason worth writing down: the reply opcode is the complement of
 * the SENT opcode INCLUDING its toggle bit, so `toggle` has to be set to
 * whatever bit 3 already is in that complement — otherwise encodeCommand
 * flips it back and the decoder looks for an opcode that was never on the
 * wire. Getting this wrong produces NO_REPLY for a perfectly good exchange,
 * which is indistinguishable from a brick that is switched off.
 */
const echoThenReply = (frame, replyParams = []) => {
    const replyOp = replyOpcodeFor(frame[3]);
    const reply = encodeCommand(replyOp, replyParams,
        {toggle: (replyOp & TOGGLE_BIT) !== 0, checkArity: false});
    return {echo: frame, reply};
};

test('the line settings are the documented ones, not defaults', async () => {
    const port = mockPort(() => []);
    const link = await openRcxSerial(port, {timeoutMs: 40});
    assert.deepEqual(port.opened, [{
        baudRate: 2400, parity: 'odd', dataBits: 8, stopBits: 1
    }]);
    assert.equal(link.settings.baudRate, RCX_BAUD_RATE);
    assert.equal(link.settings.parity, RCX_PARITY);
    await link.close();
});

test('the firmware-download mode changes baud and parity together', async () => {
    const port = mockPort(() => []);
    const link = await openRcxSerial(port, {baudRate: FIRMWARE_BAUD_RATE, timeoutMs: 40});
    // Parity follows the baud rate because the two only ever move together.
    // "4800, odd" is a combination no tool uses and no brick accepts, and the
    // default must not make it reachable by forgetting an argument.
    assert.equal(port.opened[0].baudRate, FIRMWARE_BAUD_RATE);
    assert.equal(port.opened[0].parity, FIRMWARE_PARITY);
    assert.equal(link.settings.parity, FIRMWARE_PARITY);
    await link.close();
});

test('a byte time is derived from the baud rate, not guessed', () => {
    // 11 bit times per byte: start, eight data, parity, stop.
    assert.equal(Math.round(byteMs(2400) * 1000) / 1000, 4.583);
    assert.equal(byteMs(4800), byteMs(2400) / 2);
});

test('echo and reply in separate chunks come back as one buffer', async () => {
    // The failure this guards: a read that stops at the first quiet gap
    // returns the echo alone, and the protocol layer reports NO_REPLY for an
    // exchange that actually succeeded.
    const frame = encodeCommand(OP.ALIVE, [], {toggle: false});
    const port = mockPort(written => {
        const {echo, reply} = echoThenReply(written);
        return [{after: 1, bytes: echo}, {after: 12, bytes: reply}];
    });
    const link = await openRcxSerial(port, {quietMs: 25, timeoutMs: 400});
    const heard = await link.send(frame);
    const decoded = extractReply(frame, heard, 0);
    assert.equal(decoded.ok, true, `${decoded.error}: ${decoded.detail}`);
    await link.close();
});

test('a reply split mid-frame is reassembled', async () => {
    // A USB adapter delivers on its own schedule and will happily cut a frame
    // in half. Nothing above this layer can repair that, because the protocol
    // decoder sees only the buffer it is handed.
    const frame = encodeCommand(OP.ALIVE, [], {toggle: true});
    const port = mockPort(written => {
        const {echo, reply} = echoThenReply(written);
        const cut = Math.floor(reply.length / 2);
        return [
            {after: 1, bytes: echo.slice(0, 2)},
            {after: 4, bytes: echo.slice(2)},
            {after: 9, bytes: reply.slice(0, cut)},
            {after: 14, bytes: reply.slice(cut)}
        ];
    });
    const link = await openRcxSerial(port, {quietMs: 30, timeoutMs: 400});
    const heard = await link.send(frame);
    assert.equal(extractReply(frame, heard, 0).ok, true);
    await link.close();
});

test('a late chunk is not lost; it reaches the next exchange', async () => {
    // THE BUG THIS MODULE WAS RESTRUCTURED TO PREVENT. Racing reader.read()
    // against a timeout abandons the read without cancelling it: it still
    // resolves, and its bytes go nowhere. The next read is then queued behind
    // it and every subsequent chunk lands in a promise nobody awaits.
    //
    // Here the reply arrives AFTER its exchange gave up. It must still be
    // heard — by the following send — rather than vanish.
    const first = encodeCommand(OP.ALIVE, [], {toggle: false});
    const port = mockPort((written, n) => {
        if (n === 1) return [{after: 120, bytes: echoThenReply(written).echo}];
        return [{after: 1, bytes: echoThenReply(written).echo}];
    });
    const link = await openRcxSerial(port, {quietMs: 10, timeoutMs: 35});
    const missed = await link.send(first);
    assert.equal(missed.length, 0, 'the first exchange should time out empty');

    await new Promise(resolve => setTimeout(resolve, 140));
    const second = encodeCommand(OP.ALIVE, [], {toggle: true});
    const heard = await link.send(second);
    // Both the late first echo and the second one are here: nothing was
    // dropped on the floor.
    assert.ok(heard.length >= first.length + second.length,
        `expected the late chunk to survive; heard ${heard.length} bytes`);
    await link.close();
});

test('silence returns an empty buffer rather than hanging', async () => {
    // No tower, no brick, or a detached adapter. "Nothing happened" is a
    // legitimate answer the protocol layer already reports as NO_REPLY; what
    // must not happen is an await that never settles.
    const port = mockPort(() => []);
    const link = await openRcxSerial(port, {quietMs: 10, timeoutMs: 60});
    const started = Date.now();
    const heard = await link.send(encodeCommand(OP.ALIVE, [], {toggle: false}));
    const elapsed = Date.now() - started;
    assert.equal(heard.length, 0);
    assert.ok(elapsed >= 50 && elapsed < 1000, `gave up after ${elapsed} ms`);
    await link.close();
});

test('an RcxSession drives the link end to end', async () => {
    // The point of the whole split: the protocol module never learns what a
    // baud rate is, and this module never learns what an opcode is.
    const port = mockPort(written => {
        const {echo, reply} = echoThenReply(written);
        return [{after: 1, bytes: echo}, {after: 6, bytes: reply}];
    });
    const link = await openRcxSerial(port, {quietMs: 20, timeoutMs: 400});
    const session = new RcxSession(link.send);
    const alive = await session.command(OP.ALIVE);
    assert.equal(alive.ok, true);
    // The toggle alternates across commands, which is the brick-visible half
    // of the protocol and is the session's job, not the link's.
    await session.command(OP.ALIVE);
    assert.notEqual(port.written[0][3], port.written[1][3],
        'the toggle bit must alternate; RCX never runs the same opcode twice in a row');
    await link.close();
});

test('the link refuses to send once closed', async () => {
    const port = mockPort(() => []);
    const link = await openRcxSerial(port, {quietMs: 5, timeoutMs: 20});
    await link.close();
    await assert.rejects(() => link.send(new Uint8Array([0x55])), /closed/);
    // Closing twice is not an error: an error path and a success path both
    // reach it, and neither should have to remember which ran first.
    await link.close();
});

test('an already-open port is neither opened nor closed by this module', async () => {
    // The caller may have opened the port itself — the firmware-download flow
    // reopens at 4800 — and closing a port out from under its owner is worse
    // than leaking it.
    const port = mockPort(() => []);
    let closes = 0;
    port.close = async () => {
        closes++;
    };
    const link = await openRcxSerial(port, {alreadyOpen: true, quietMs: 5, timeoutMs: 20});
    assert.deepEqual(port.opened, [], 'must not reopen a port the caller opened');
    await link.close();
    assert.equal(closes, 0, 'must not close a port it did not open');
});

test('the tower identity is the LEGO pair, and filtering is opt-in', async () => {
    assert.deepEqual(LEGO_USB_TOWER, {usbVendorId: 0x0694, usbProductId: 0x0001});
    // A home-built tower is an ordinary USB-serial adapter and matches no
    // filter. Defaulting to the LEGO pair would show an empty chooser to
    // everyone who built the board in firmware/ir-tower, which reads as
    // broken hardware rather than as a filter.
    const seen = [];
    // `globalThis.navigator` is an accessor under Node 20+, so a plain
    // assignment throws "which has only a getter". defineProperty is the only
    // way to stand one up, and the original descriptor has to go back.
    const original = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
    Object.defineProperty(globalThis, 'navigator', {
        configurable: true,
        value: {serial: {requestPort: async opts => {
            seen.push(opts);
            return {};
        }}}
    });
    try {
        await requestRcxPort();
        await requestRcxPort([LEGO_USB_TOWER]);
        assert.deepEqual(seen, [{}, {filters: [LEGO_USB_TOWER]}]);
    } finally {
        if (original) Object.defineProperty(globalThis, 'navigator', original);
        else delete globalThis.navigator;
    }
});

test('a browser with no Web Serial is told so by name', async () => {
    const original = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
    Object.defineProperty(globalThis, 'navigator', {configurable: true, value: {}});
    try {
        await assert.rejects(() => requestRcxPort(), /no Web Serial/);
    } finally {
        if (original) Object.defineProperty(globalThis, 'navigator', original);
        else delete globalThis.navigator;
    }
});

test('the default timeout covers the longest exchange in a download', () => {
    // 50 payload bytes become 100 on the wire, plus header, opcode and
    // checksum, plus the echo of all of it, plus the reply. Two byte-times
    // per payload byte each way is the floor; the default must clear it with
    // room for the brick's turnaround.
    const worstBytes = 2 * (3 + 2 + 2 * 50 + 2);
    assert.ok(DEFAULT_TIMEOUT_MS > worstBytes * byteMs(RCX_BAUD_RATE),
        `${DEFAULT_TIMEOUT_MS} ms does not cover ${Math.ceil(worstBytes * byteMs())} ms of wire time`);
});

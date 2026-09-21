// SPDX-License-Identifier: Apache-2.0
//
// The ported EV3 blocks send the RIGHT BYTES, not merely some bytes.
//
// The consolidation's headline was that 47 of ev3comprehensive's 74 blocks had
// no live-mode body at all. Giving them bodies fixes the visible half; the
// coverage gate only proves a body exists. A block that assembles the wrong
// opcode, or the right opcode with its arguments transposed, passes every
// other test in this repo and does the wrong thing to the robot — and the way
// you find out is that the motor turns the wrong way.
//
// So these assert exact packets against the EV3 direct-command protocol
// (LEGO's c_com.h framing, bytecodes from lms2012). The framing is:
//
//   len_lo len_hi  msg_lo msg_hi  type  global_lsb  locals<<2|global_msb  …
//
// with len counting everything after the two length bytes, and type 0x80
// meaning DIRECT_COMMAND_NO_REPLY.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {quietConsole} from './helpers/quiet-console.mjs';

quietConsole();

const {loadExtension} = await import('../scripts/spike/load-extension.mjs');
const {bundleSource} = await import('../scripts/spike/bundled-upstream.mjs');

/** Load the extension with a backend that records packets instead of sending. */
const wired = function () {
    const instance = loadExtension(bundleSource('ev3comprehensive'));
    const sent = [];
    instance.ev3.backend = {
        send: async packet => { sent.push(Array.from(packet)); return true; },
        disconnect: async () => {}
    };
    instance.ev3.isConnected = () => true;
    return {
        instance,
        async capture (fn) {
            sent.length = 0;
            await fn();
            assert.equal(sent.length, 1, 'expected exactly one packet');
            return sent[0];
        }
    };
};

/** Strip the 7-byte header, after checking it. */
const body = packet => {
    assert.equal(packet.length - 2, packet[0] | (packet[1] << 8),
        'the length prefix does not describe the packet');
    assert.equal(packet[4], 0x80, 'not a DIRECT_COMMAND_NO_REPLY');
    assert.equal(packet[5], 0x00, 'unexpected global allocation');
    assert.equal(packet[6], 0x00, 'unexpected local allocation');
    return packet.slice(7);
};

test('motor stop names the port bitmask and the brake flag', async () => {
    const w = wired();
    // a3 = opOUTPUT_STOP, 00 = daisy-chain layer, 01 = port A, then brake.
    assert.deepEqual(body(await w.capture(() => w.instance.motorStop({PORT: 'A', BRAKE: 'brake'}))),
        [0xa3, 0x00, 0x01, 0x01]);
    assert.deepEqual(body(await w.capture(() => w.instance.motorStop({PORT: 'A', BRAKE: 'coast'}))),
        [0xa3, 0x00, 0x01, 0x00],
        'coast and brake are the same command with one byte between them, which is ' +
        'exactly the kind of difference a body-exists check cannot see');
});

test('motor ports are a bitmask, so combinations address both motors', async () => {
    const w = wired();
    // a5 = opOUTPUT_SPEED, 81 32 = LC1(50), then a6 = opOUTPUT_START.
    assert.deepEqual(body(await w.capture(() => w.instance.motorRun({PORT: 'A', POWER: 50}))),
        [0xa5, 0x00, 0x01, 0x81, 50, 0xa6, 0x00, 0x01]);
    // A|C = 1|4 = 5. Addressing one motor when the block says two is silent.
    assert.deepEqual(body(await w.capture(() => w.instance.motorRun({PORT: 'A+C', POWER: 50}))),
        [0xa5, 0x00, 0x05, 0x81, 50, 0xa6, 0x00, 0x05]);
    assert.deepEqual(body(await w.capture(() => w.instance.motorRun({PORT: 'ALL', POWER: 50}))),
        [0xa5, 0x00, 0x0f, 0x81, 50, 0xa6, 0x00, 0x0f]);
    // An unrecognised port falls back to A, never to 0: a mask of 0 addresses
    // no motor and is indistinguishable from a dead connection.
    assert.deepEqual(body(await w.capture(() => w.instance.motorRun({PORT: 'nonsense', POWER: 50}))),
        [0xa5, 0x00, 0x01, 0x81, 50, 0xa6, 0x00, 0x01]);
});

test('sound: tone, note and stop', async () => {
    const w = wired();
    // 94 01 = opSOUND TONE, volume LC1(50), LC2(freq), LC2(ms).
    assert.deepEqual(body(await w.capture(() => w.instance.playTone({FREQ: 440, MS: 100}))),
        [0x94, 0x01, 0x81, 50, 0x82, 0xb8, 0x01, 0x82, 0x64, 0x00]);
    // C4 is 262 Hz (0x106) and one beat at the default 120 bpm is 500 ms
    // (0x1f4). This is the assertion that would have caught the first version
    // of playNote, which did MIDI arithmetic on the note NAME: Number("C4") is
    // NaN, and NaN reaches the brick as a frequency of 0 — silence that looks
    // exactly like a disconnected speaker.
    assert.deepEqual(body(await w.capture(() => w.instance.playNote({NOTE: 'C4', DURATION: 1}))),
        [0x94, 0x01, 0x81, 50, 0x82, 0x06, 0x01, 0x82, 0xf4, 0x01]);
    assert.deepEqual(body(await w.capture(() => w.instance.stopSound())),
        [0x94, 0x00]);
});

test('screen: clear, pixel and the UPDATE that makes drawing visible', async () => {
    const w = wired();
    // 84 = opUI_DRAW. 13 = FILLWINDOW, 00 = UPDATE, 02 = PIXEL.
    assert.deepEqual(body(await w.capture(() => w.instance.screenClear())),
        [0x84, 0x13, 0x00, 0x82, 0x00, 0x00, 0x82, 0x00, 0x00, 0x84, 0x00]);
    assert.deepEqual(body(await w.capture(() => w.instance.drawPixel({X: 10, Y: 20}))),
        [0x84, 0x02, 0x01, 0x82, 0x0a, 0x00, 0x82, 0x14, 0x00, 0x84, 0x00]);
    // Every drawing command ends with UPDATE. Without it the EV3 draws into
    // the back buffer and the screen never changes — a block that does
    // everything right and appears to do nothing.
    for (const draw of [
        () => w.instance.drawLine({X1: 0, Y1: 0, X2: 5, Y2: 5}),
        () => w.instance.drawCircle({X: 1, Y: 2, R: 3, FILL: 'outline'}),
        () => w.instance.drawRectangle({X: 1, Y: 2, W: 3, H: 4, FILL: 'filled'}),
        () => w.instance.screenText({TEXT: 'hi', X: 0, Y: 0})
    ]) {
        const bytes = body(await w.capture(draw));
        assert.deepEqual(bytes.slice(-2), [0x84, 0x00], 'no UPDATE, so nothing appears');
    }
});

test('LEDs write the pattern the menu names', async () => {
    const w = wired();
    // 82 = opUI_WRITE, 1b = LED. OFF/GREEN/RED/ORANGE are 0..3.
    assert.deepEqual(body(await w.capture(() => w.instance.setLED({COLOR: 'GREEN'}))),
        [0x82, 0x1b, 0x01]);
    assert.deepEqual(body(await w.capture(() => w.instance.setLED({COLOR: 'ORANGE'}))),
        [0x82, 0x1b, 0x03]);
    assert.deepEqual(body(await w.capture(() => w.instance.ledAllOff())),
        [0x82, 0x1b, 0x00]);
});

test('a filled shape differs from an outline by one bytecode', async () => {
    const w = wired();
    const outline = body(await w.capture(() =>
        w.instance.drawCircle({X: 1, Y: 2, R: 3, FILL: 'outline'})));
    const filled = body(await w.capture(() =>
        w.instance.drawCircle({X: 1, Y: 2, R: 3, FILL: 'filled'})));
    assert.equal(outline[1], 0x04, 'CIRCLE');
    assert.equal(filled[1], 0x18, 'FILLCIRCLE');
    assert.deepEqual(outline.slice(2), filled.slice(2),
        'only the shape bytecode should differ between outline and filled');
});

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

/**
 * Build a block's arguments, REFUSING any name the block does not declare.
 *
 * This exists because of playTone. Its block says "for [DURATION] ms", the
 * implementation read `args.MS`, and the test below asserted
 * `playTone({FREQ, MS})` — written from the implementation rather than from
 * the block. So the body read undefined, sent a duration of zero, and the
 * block was SILENT while its test was green. A golden test taken from the
 * code under test agrees with that code being wrong.
 *
 * Passing arguments through here makes the block's own getInfo() the
 * authority: a test can no longer name an argument the block does not have.
 */
const argsFor = function (info, opcode, values) {
    const block = (info.blocks || []).find(b => b && b.opcode === opcode);
    assert.ok(block, `${opcode} is not a block of this extension`);
    const declared = Object.keys(block.arguments || {});
    for (const name of Object.keys(values)) {
        assert.ok(declared.includes(name),
            `${opcode} has no argument ${name} — it declares ${declared.join(', ') || '(none)'}`);
    }
    return values;
};

/** Load the extension with a backend that records packets instead of sending. */
const wired = function () {
    const instance = loadExtension(bundleSource('ev3comprehensive'));
    const info = instance.getInfo();
    const sent = [];
    instance.ev3.backend = {
        send: async packet => { sent.push(Array.from(packet)); return true; },
        disconnect: async () => {}
    };
    instance.ev3.isConnected = () => true;
    return {
        instance,
        info,
        /** Arguments checked against the block's own declaration. */
        args: (opcode, values) => argsFor(info, opcode, values),
        async capture (fn) {
            sent.length = 0;
            await fn();
            assert.equal(sent.length, 1, 'expected exactly one packet');
            return sent[0];
        }
    };
};

/**
 * Strip the 7-byte header, after checking it.
 *
 * `globals` is how many bytes of the global buffer the command reserves for
 * its reply, and it is not decoration: a command that asks for a reply must
 * also say type 0x00 rather than 0x80, and must reserve room for what it
 * reads back. A reporter that reserved nothing would come back empty and
 * report 0 — a plausible reading, and wrong.
 */
const body = (packet, {globals = 0} = {}) => {
    assert.equal(packet.length - 2, packet[0] | (packet[1] << 8),
        'the length prefix does not describe the packet');
    assert.equal(packet[4], globals === 0 ? 0x80 : 0x00,
        globals === 0 ? 'not a DIRECT_COMMAND_NO_REPLY' :
            'a command that reserves reply space must ask for a reply');
    assert.equal(packet[5], globals, 'unexpected global allocation');
    assert.equal(packet[6] >> 2, 0x00, 'unexpected local allocation');
    return packet.slice(7);
};

test('motor stop names the port bitmask and the brake flag', async () => {
    const w = wired();
    // a3 = opOUTPUT_STOP, 00 = daisy-chain layer, 01 = port A, then brake.
    assert.deepEqual(body(await w.capture(() => w.instance.motorStop(w.args('motorStop', {PORT: 'A', BRAKE: 'brake'})))),
        [0xa3, 0x00, 0x01, 0x01]);
    assert.deepEqual(body(await w.capture(() => w.instance.motorStop(w.args('motorStop', {PORT: 'A', BRAKE: 'coast'})))),
        [0xa3, 0x00, 0x01, 0x00],
        'coast and brake are the same command with one byte between them, which is ' +
        'exactly the kind of difference a body-exists check cannot see');
});

test('motor ports are a bitmask, so combinations address both motors', async () => {
    const w = wired();
    // a5 = opOUTPUT_SPEED, 81 32 = LC1(50), then a6 = opOUTPUT_START.
    assert.deepEqual(body(await w.capture(() => w.instance.motorRun(w.args('motorRun', {PORT: 'A', POWER: 50})))),
        [0xa5, 0x00, 0x01, 0x81, 50, 0xa6, 0x00, 0x01]);
    // A|C = 1|4 = 5. Addressing one motor when the block says two is silent.
    assert.deepEqual(body(await w.capture(() => w.instance.motorRun(w.args('motorRun', {PORT: 'A+C', POWER: 50})))),
        [0xa5, 0x00, 0x05, 0x81, 50, 0xa6, 0x00, 0x05]);
    assert.deepEqual(body(await w.capture(() => w.instance.motorRun(w.args('motorRun', {PORT: 'ALL', POWER: 50})))),
        [0xa5, 0x00, 0x0f, 0x81, 50, 0xa6, 0x00, 0x0f]);
    // An unrecognised port falls back to A, never to 0: a mask of 0 addresses
    // no motor and is indistinguishable from a dead connection.
    assert.deepEqual(body(await w.capture(() => w.instance.motorRun(w.args('motorRun', {PORT: 'nonsense', POWER: 50})))),
        [0xa5, 0x00, 0x01, 0x81, 50, 0xa6, 0x00, 0x01]);
});

test('sound: tone, note and stop', async () => {
    const w = wired();
    // 94 01 = opSOUND TONE, volume LC1(50), LC2(freq), LC2(ms).
    assert.deepEqual(body(await w.capture(() => w.instance.playTone(w.args('playTone', {FREQ: 440, DURATION: 100})))),
        [0x94, 0x01, 0x81, 50, 0x82, 0xb8, 0x01, 0x82, 0x64, 0x00]);
    // C4 is 262 Hz (0x106) and one beat at the default 120 bpm is 500 ms
    // (0x1f4). This is the assertion that would have caught the first version
    // of playNote, which did MIDI arithmetic on the note NAME: Number("C4") is
    // NaN, and NaN reaches the brick as a frequency of 0 — silence that looks
    // exactly like a disconnected speaker.
    assert.deepEqual(body(await w.capture(() => w.instance.playNote(w.args('playNote', {NOTE: 'C4', DURATION: 1})))),
        [0x94, 0x01, 0x81, 50, 0x82, 0x06, 0x01, 0x82, 0xf4, 0x01]);
    assert.deepEqual(body(await w.capture(() => w.instance.stopSound())),
        [0x94, 0x00]);
});

test('screen: clear, pixel and the UPDATE that makes drawing visible', async () => {
    const w = wired();
    // 84 = opUI_DRAW. 13 = FILLWINDOW, 00 = UPDATE, 02 = PIXEL.
    assert.deepEqual(body(await w.capture(() => w.instance.screenClear())),
        [0x84, 0x13, 0x00, 0x82, 0x00, 0x00, 0x82, 0x00, 0x00, 0x84, 0x00]);
    assert.deepEqual(body(await w.capture(() => w.instance.drawPixel(w.args('drawPixel', {X: 10, Y: 20})))),
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
    assert.deepEqual(body(await w.capture(() => w.instance.setLED(w.args('setLED', {COLOR: 'GREEN'})))),
        [0x82, 0x1b, 0x01]);
    assert.deepEqual(body(await w.capture(() => w.instance.setLED(w.args('setLED', {COLOR: 'ORANGE'})))),
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

// ── the four blocks that were wired wrong ────────────────────────────────
//
// Every one of these passed the coverage gate, which only asks whether a
// block has a body. They were found by auditing each block's PORT menu
// against the converter its body used, and by reading the transpiler that
// lowers the same blocks — not by any test. These are that audit, frozen.

test('tank drive: LEFT and RIGHT are POWERS, and the ports are B and C', async () => {
    const w = wired();
    // The bug: LEFT/RIGHT are numbers, and they were passed through the port
    // converter, which strips non-ABCD characters — so "50" became the empty
    // mask, fell back to port A, and BOTH wheels drove the same motor. The
    // speeds actually sent were VALUE, the duration.
    const bytes = body(await w.capture(() =>
        w.instance.tankDrive({LEFT: 50, RIGHT: -50, VALUE: 1, UNIT: 'rotations'})));
    // ac = opOUTPUT_STEP_POWER. Port B = 0x02, port C = 0x04. 360 degrees is
    // one rotation. -50 arrives as 0xce.
    assert.deepEqual(bytes.slice(0, 5), [0xac, 0x00, 0x02, 0x81, 50]);
    const second = bytes.indexOf(0xac, 1);
    assert.deepEqual(bytes.slice(second, second + 5), [0xac, 0x00, 0x04, 0x81, 0xce],
        'the second motor must be port C at the RIGHT power, not port A again');
    // LC4(360) = 83 68 01 00 00, present once per motor.
    assert.equal(bytes.filter((b, i) =>
        b === 0x83 && bytes[i + 1] === 0x68 && bytes[i + 2] === 0x01).length, 2,
    'each motor must be told to turn 360 degrees');
});

test('tank drive in seconds uses the timed opcode, not the stepped one', async () => {
    const w = wired();
    const bytes = body(await w.capture(() =>
        w.instance.tankDrive({LEFT: 50, RIGHT: 50, VALUE: 2, UNIT: 'seconds'})));
    // ad = opOUTPUT_TIME_POWER, and 2 seconds is LC4(2000) = 83 d0 07 00 00.
    assert.equal(bytes[0], 0xad, 'seconds must lower to OUTPUT_TIME_POWER');
    assert.ok(bytes.some((b, i) =>
        b === 0x83 && bytes[i + 1] === 0xd0 && bytes[i + 2] === 0x07),
    '2 seconds must reach the brick as 2000 ms');
    // Before the fix, VALUE was ignored entirely and the motors ran forever.
});

test('steering scales the inner wheel to zero at lock, never into reverse', async () => {
    const w = wired();
    // The transpiler computes `speed - speed * |steering| / 100`. The first
    // version of this used (1 - |s|/50), which reaches a full REVERSE spin at
    // lock — the same program would then drive differently streamed than
    // compiled, which is the one thing a dual-mode extension must not do.
    const locked = body(await w.capture(() =>
        w.instance.steerDrive({STEERING: 100, SPEED: 50, VALUE: 1, UNIT: 'rotations'})));
    assert.equal(locked[4], 50, 'the outer wheel keeps the commanded speed');
    const second = locked.indexOf(0xac, 1);
    assert.equal(locked[second + 4], 0, 'the inner wheel stops; it must not reverse');

    // Turning the other way makes the LEFT wheel the slow one.
    const left = body(await w.capture(() =>
        w.instance.steerDrive({STEERING: -50, SPEED: 80, VALUE: 1, UNIT: 'rotations'})));
    assert.equal(left[4], 40, 'left wheel: 80 - 80*50/100');
    assert.equal(left[left.indexOf(0xac, 1) + 4], 80, 'right wheel keeps full speed');
});

test('motor position and speed read a MOTOR port, not a sensor port', async () => {
    const w = wired();
    // The bug: both carry a motorPorts menu (letters), and both were passed
    // through the SENSOR port converter — parseInt("A") is NaN, which fell
    // back to 0, so every motor reported whatever was on sensor port 1.
    // a8 = opOUTPUT_READ; 60 = GV0(0) for speed, 64 = GV0(4) for position.
    // The tacho reserves 8 global bytes: an int8 speed at 0 and an int32
    // position at 4, read from one reply.
    assert.deepEqual(
        body(await w.capture(() => w.instance.motorPosition(w.args('motorPosition', {PORT: 'D'}))), {globals: 8}),
        [0xa8, 0x00, 0x08, 0x60, 0x64], 'port D is bitmask 8');
    assert.deepEqual(
        body(await w.capture(() => w.instance.motorSpeed(w.args('motorSpeed', {PORT: 'A'}))), {globals: 8}),
        [0xa8, 0x00, 0x01, 0x60, 0x64], 'port A is bitmask 1');
    // And a sensor block must still use INPUT, so the two families cannot
    // quietly converge again.
    const touch = body(await w.capture(() => w.instance.touchSensor(w.args('touchSensor', {PORT: '1'}))), {globals: 4});
    assert.equal(touch[0], 0x99, 'sensor reads must stay on opINPUT_DEVICE');
});

// ── blocks that declared an argument and ignored it ──────────────────────

test('the argument builder refuses a name the block does not declare', () => {
    // The guard itself, proved. Without this, every assertion below could be
    // written against arguments the block has never heard of — which is
    // precisely how playTone stayed silent under a green test.
    const w = wired();
    assert.throws(() => w.args('playTone', {FREQ: 440, MS: 100}),
        /playTone has no argument MS — it declares FREQ, DURATION/);
    assert.doesNotThrow(() => w.args('playTone', {FREQ: 440, DURATION: 100}));
});

test('colour components are selected, not assumed', async () => {
    const w = wired();
    // 99 1c = opINPUT_DEVICE / READY_RAW, three values. READY_RAW did not
    // exist in this extension's subcode table and arrived as 0x00, which is
    // not a valid INPUT_DEVICE subcommand.
    const bytes = body(
        await w.capture(() => w.instance.colorSensorRGB(
            w.args('colorSensorRGB', {PORT: '1', COMPONENT: 'green'}))),
        {globals: 12});
    assert.deepEqual(bytes.slice(0, 2), [0x99, 0x1c]);
    assert.equal(bytes[5], 0x04, 'mode 4 is RGB raw');
    assert.equal(bytes[6], 0x03, 'three values, or there is nothing to select from');
});

test('the IR beacon channel picks a heading/distance PAIR', async () => {
    const w = wired();
    // The transpiler reads EIGHT values in IR_SEEK and indexes them as
    // (channel - 1) * 2, so one read serves all four channels. A single-value
    // read would return channel 1 for every channel and look fine.
    for (const opcode of ['irBeaconHeading', 'irBeaconDistance']) {
        const bytes = body(
            await w.capture(() => w.instance[opcode](
                w.args(opcode, {PORT: '2', CHANNEL: 3}))),
            {globals: 32});
        assert.deepEqual(bytes.slice(0, 2), [0x99, 0x1d], `${opcode}: READY_SI`);
        assert.equal(bytes[5], 0x01, `${opcode}: mode 1 is IR seek`);
        assert.equal(bytes[6], 0x08, `${opcode}: eight values, one per channel field`);
    }
});

test('the timer index is its own timer, and resetting one leaves the others alone', async () => {
    const w = wired();
    // The brick has ONE hardware timer. An implementation that reset it would
    // send every other index backwards, so a reset must SNAPSHOT instead —
    // which is why a reset reads the timer rather than writing it.
    const reset = body(await w.capture(() => w.instance.resetTimer(
        w.args('resetTimer', {TIMER: 2}))), {globals: 4});
    assert.deepEqual(reset, [0x87, 0x60],
        'resetting an index must READ the brick timer (opTIMER_READ), not reset it');
    const read = body(await w.capture(() => w.instance.timerValue(
        w.args('timerValue', {TIMER: 2}))), {globals: 4});
    assert.deepEqual(read, [0x87, 0x60]);
});

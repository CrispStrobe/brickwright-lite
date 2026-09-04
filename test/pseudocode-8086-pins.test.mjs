// PIN I/O — and this is what "reseating an example" has to mean.
//
// A learner's blink program written for an 8051 declares `PIN led = P1.0
// OUTPUT` and says `turn on led`. On an 8086 that is an 8255 port write. The
// mapping P1/P2/P3 -> ports A/B/C is a MAPPING and not a translation: the 8051
// has those three usable ports and the 8255 has exactly three, so the same
// declaration means the same wire on either chip.
//
// The consequence is the whole point: **the program does not change.** Only
// the DEVICE line does. A reseat that required rewriting the pin declarations
// would not be a reseat.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const L = new URL('../overlay/scratch-gui/src/lib/', import.meta.url);
const SB3 = (await import(new URL('../packages/scratch-gui/src/lib/sb3-creator.js', import.meta.url).href)).default;
const { buildPseudocode8086 } = await import(new URL('bw-asm/pseudocode-8086.js', L).href);
const { createI8086DosBench } = await import(new URL('bw-debug/i8086-dos-bench.js', L).href);

async function run (lines) {
    const src = lines.join('\n');
    const c = new SB3();
    c.parse(src);
    const built = await buildPseudocode8086({ project: c.project, source: src });
    const b = await createI8086DosBench({ bytes: built.bytes, format: built.format });
    let n = 0;
    while (n < 500_000 && !b.terminated) { b.step(); n++; }
    const ports = {};
    for (const p of b.target.outputs()) ports[p.port] = p;
    return { built, ports, terminated: b.terminated };
}

test('an 8051 pin program runs unchanged except for its DEVICE line', async () => {
    const r = await run([
        'DEVICE i8086',
        'PIN led = P1.0 OUTPUT',
        'PIN buzzer = P2.3 OUTPUT',
        'WHEN flag clicked:',
        '  turn on led',
        '  turn on buzzer',
    ]);
    assert.deepEqual(r.built.warnings, [], 'nothing had to be worked around');
    assert.equal(r.ports.a.value & 0x01, 0x01, 'P1.0 -> port A bit 0 is high');
    assert.equal(r.ports.b.value & 0x08, 0x08, 'P2.3 -> port B bit 3 is high');
    assert.equal(r.ports.a.dir, 0xff, 'and the chip is driving, not floating');
});

test('two pins on ONE port do not clobber each other', async () => {
    // The reason for a shadow latch. An 8255 output port cannot be safely
    // read-modify-written for this: ports A and B have no bit-set command, so
    // a program that computed the new byte from the old one would work by
    // accident and a program that wrote the bit alone would darken its
    // neighbour. This is what an 8051 does with its own port SFR.
    const r = await run([
        'DEVICE i8086',
        'PIN red = P1.0 OUTPUT',
        'PIN green = P1.7 OUTPUT',
        'WHEN flag clicked:',
        '  turn on red',
        '  turn on green',
        '  turn off red',
    ]);
    assert.equal(r.ports.a.value, 0b10000000,
        'green survived red being turned off — 0b00000000 would mean the second '
        + 'write clobbered the first, and 0b10000001 that the third did nothing');
});

test('toggle flips exactly one bit and leaves the port alone', async () => {
    const r = await run([
        'DEVICE i8086',
        'PIN a0 = P1.0 OUTPUT',
        'PIN a4 = P1.4 OUTPUT',
        'WHEN flag clicked:',
        '  turn on a4',
        '  toggle a0',
        '  toggle a0',
        '  toggle a0',
    ]);
    assert.equal(r.ports.a.value, 0b00010001, 'three toggles leave a0 SET, and a4 untouched');
});

test('ACTIVE LOW inverts at the declaration, not at every use', async () => {
    // A learner who wrote ACTIVE LOW said it once and means it always. If the
    // inversion lived at the use site, `turn on` and `toggle` would need to
    // disagree about what "on" means.
    const r = await run([
        'DEVICE i8086',
        'PIN lamp = P1.2 OUTPUT ACTIVE LOW',
        'WHEN flag clicked:',
        '  turn on lamp',
    ]);
    assert.equal(r.ports.a.value & 0x04, 0x00, '"on" drives the pin LOW');
});

test('the 8255 is configured ONCE, because a mode word clears the latches', async () => {
    // Writing 80h again mid-program would darken every pin the program had
    // lit. Real 8255 behaviour, and exactly the bug a "reconfigure before
    // each write" version would have.
    const r = await run([
        'DEVICE i8086',
        'PIN led = P1.0 OUTPUT',
        'WHEN flag clicked:',
        '  turn on led',
        '  turn on led',
        '  turn on led',
    ]);
    // Counted by writes to the CONTROL PORT, not by a literal -- the word is
    // computed from the declarations now, so its spelling changes with the
    // program while the "exactly one" property must not.
    const ctrlWrites = (r.built.asm.match(/MOV DX, 99[\s\S]{0,60}?OUT DX, AL/g) || []).length;
    assert.equal(ctrlWrites, 1, `the control word is written once, not ${ctrlWrites} times`);
    assert.equal(r.ports.a.value & 0x01, 0x01, 'and the pin is still lit at the end');
});

test('P0 is refused by NAME, not mapped to a fourth port that does not exist', async () => {
    await assert.rejects(() => run([
        'DEVICE i8086',
        'PIN bus = P0.0 OUTPUT',
        'WHEN flag clicked:',
        '  turn on bus',
    ]), /P0 on an 8051 is the multiplexed address\/data bus/);
});

test('a PART is still refused, and the message says why a PIN is different', async () => {
    // A PIN is one wire and this bench has an 8255 to hang it on. A PART is a
    // component with a protocol, and driving one is not a port write.
    await assert.rejects(() => run([
        'DEVICE i8086',
        'PART lcd = LCD1602 ON P1',
        'WHEN flag clicked:',
        '  say "hi"',
    ]), /a PIN is one wire and works|device with a protocol/);
});

// ---------------------------------------------------------------------------
// The input half — what the switch panel exists to drive
// ---------------------------------------------------------------------------

test('a program READS a switch and lights an LED, and the switch decides', async () => {
    // The whole loop: a person flips a toggle, an 8255 input port sees it, the
    // program branches, an output port drives a lamp. Both cases asserted,
    // because a program that lit the LED regardless would pass a one-sided
    // test and would be exactly as broken.
    const src = [
        'DEVICE i8086',
        'PIN btn = P3.2 INPUT ACTIVE LOW',
        'PIN led = P1.0 OUTPUT',
        'WHEN flag clicked:',
        '  REPEAT 3:',
        '    IF (read btn) = 1 THEN:',
        '      turn on led',
    ].join('\n');
    const c = new SB3();
    c.parse(src);
    const built = await buildPseudocode8086({ project: c.project, source: src });

    for (const [held, want] of [[false, 0], [true, 1]]) {
        const b = await createI8086DosBench({ bytes: built.bytes, format: built.format });
        // CLOSED PULLS THE LINE LOW, which is how a breadboard button is wired
        // and what the switch panel sends. ACTIVE LOW on the declaration is
        // what turns that back into "pressed" for the learner.
        if (held) b.target.setInput('ppi1', 'c', 2, 0);
        let n = 0;
        while (n < 500_000 && !b.terminated) { b.step(); n++; }
        const a = b.target.outputs().find((o) => o.port === 'a');
        assert.equal(a.value & 1, want,
            held ? 'held: the LED is lit' : 'open: the LED is dark — an undriven input '
                + 'floats HIGH, so without ACTIVE LOW this program would light either way');
    }
});

test('the control word is computed from ALL declarations, once', async () => {
    // A mode word CLEARS every output latch, so it can be written exactly
    // once -- which means every port's direction must be known before the
    // first pin is touched. That is why direction lives on the PIN line and is
    // not inferred from first use: inferring would need a second mode word,
    // and the second would darken whatever the first had lit.
    const src = [
        'DEVICE i8086',
        'PIN sw = P3.1 INPUT',        // port C lower -> bit 0 of the control word
        'PIN led = P1.0 OUTPUT',      // port A stays an output
        'WHEN flag clicked:',
        '  IF (read sw) = 1 THEN:',
        '    turn on led',
    ].join('\n');
    const c = new SB3();
    c.parse(src);
    const built = await buildPseudocode8086({ project: c.project, source: src });
    const writes = built.asm.match(/MOV DX, 99[\s\S]{0,60}?OUT DX, AL/g) || [];
    assert.equal(writes.length, 1, 'exactly one mode word');
    assert.match(writes[0], /MOV AL, 129\b/,
        '0x81: mode 0, port C LOWER an input, everything else an output');
});

test('port C is two half-ports, so four switches and four LEDs can share it', async () => {
    // The thing that makes port C the handshake port on a real 8255, and here
    // it means a program can read PC0-PC3 while driving PC4-PC7.
    const src = [
        'DEVICE i8086',
        'PIN sw = P3.0 INPUT',
        'PIN lamp = P3.7 OUTPUT',
        'WHEN flag clicked:',
        '  turn on lamp',
    ].join('\n');
    const c = new SB3();
    c.parse(src);
    const built = await buildPseudocode8086({ project: c.project, source: src });
    assert.match(built.asm, /MOV AL, 129\b/,
        'C lower in (0x01), C upper OUT — 0x81, not 0x89');
});

// ---------------------------------------------------------------------------
// Direction: the one mistake the MACHINE cannot report
// ---------------------------------------------------------------------------

test('writing an INPUT pin is refused, because nothing lower could ever tell you', async () => {
    // Measured before this check existed:
    //   OUTPUT + turn on:  latch=0x01  dir=0xff  pins=0x01   the LED lights
    //   INPUT  + turn on:  latch=0x01  dir=0x00  pins=0xff   nothing lights
    //
    // The write reaches the latch, the chip is not driving the port, the pins
    // carry the input. EVERY LAYER IS CORRECT -- that is an 8255 doing exactly
    // what an 8255 does -- so there is no error for the machine to report and
    // no warning it could honestly raise. Only the compiler still knows the
    // declaration said INPUT.
    await assert.rejects(() => run([
        'DEVICE i8086',
        'PIN sw = P1.0 INPUT',
        'WHEN flag clicked:',
        '  turn on sw',
    ]), /declared INPUT and this writes to it[\s\S]*nothing lights/);
});

test('toggling an INPUT pin is refused too — the same write by another name', async () => {
    await assert.rejects(() => run([
        'DEVICE i8086',
        'PIN sw = P2.1 INPUT',
        'WHEN flag clicked:',
        '  toggle sw',
    ]), /declared INPUT and this writes to it/);
});

test('reading an OUTPUT pin is refused, and the message says what it WOULD have answered', async () => {
    // The mirror, and it is not a fault: an 8255 output port reads back the
    // LATCH, so it answers with whatever this program last wrote. It answers
    // something the learner did not ask, which is worse than refusing.
    await assert.rejects(() => run([
        'DEVICE i8086',
        'PIN led = P1.0 OUTPUT',
        'WHEN flag clicked:',
        '  IF (read led) = 1 THEN:',
        '    turn off led',
    ]), /declared OUTPUT and this reads it[\s\S]*reads back the LATCH/);
});

test('and the correct directions still work, so the check is not just refusing', async () => {
    const r = await run([
        'DEVICE i8086',
        'PIN sw = P3.0 INPUT',
        'PIN led = P1.0 OUTPUT',
        'WHEN flag clicked:',
        '  IF (read sw) = 1 THEN:',
        '    turn on led',
    ]);
    assert.deepEqual(r.built.warnings, []);
});

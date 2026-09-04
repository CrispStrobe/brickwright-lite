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
    const ctrlWrites = (r.built.asm.match(/MOV\s+AL,\s*80h/gi) || []).length;
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

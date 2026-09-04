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
    const b = await createI8086DosBench(
        { bytes: built.bytes, format: built.format, chips: built.chips });
    let n = 0;
    while (n < 500_000 && !b.terminated) { b.step(); n++; }
    const ports = {};
    for (const p of b.target.outputs()) ports[p.port] = p;
    return { built, ports, bench: b, terminated: b.terminated };
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
        const b = await createI8086DosBench(
        { bytes: built.bytes, format: built.format, chips: built.chips });
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

// ── ANALOG: a voltage, through a converter the build adds ────────────────

test('an ANALOG pin reads a voltage, and the build says which chip it added', async () => {
    // THE POINT OF THE 0809 RATHER THAN THE 0804. On an STC12, ADC channel n
    // IS physically P1.n. The 0809's eight-channel mux keeps `P1.n -> channel
    // n` a MAPPING, exactly as P1/P2/P3 -> A/B/C already is, so an analog
    // program reseats by changing its DEVICE line and nothing else. A
    // single-channel 0804 would have made it a lookup.
    const src = ['DEVICE i8086', 'PIN pot = P1.3 ANALOG',
        'WHEN flag clicked:', '  say (read pot)'].join('\n');
    const c = new SB3();
    c.parse(src);
    assert.deepEqual(c.warnings || [], [], 'the declaration parses clean');
    const built = await buildPseudocode8086({project: c.project, source: src});

    // A DECLARATION CAUSES A CHIP TO APPEAR -- the 8255 already works that
    // way, and a learner who had to list chips before reading a voltage would
    // have been failed by the tool. But appearing INVISIBLY is the same
    // failure class as a silently chosen default, so it is also said out loud.
    assert.deepEqual(built.chips, [{kind: 'adc0809', name: 'adc1', at: 0x300}]);
    assert.match(built.warnings.join(' '), /ADC0809 at 300h/);
    assert.match(built.warnings.join(' '), /channel 3 for P1\.3/);

    const b = await createI8086DosBench(
        {bytes: built.bytes, format: built.format, chips: built.chips});
    b.machine.chips.adc1.setChannel(3, 3.75);      // 3.75 V of 5 V
    let n = 0;
    while (n < 500_000 && !b.terminated) { b.step(); n++; }
    assert.ok(b.terminated, 'the poll loop finished -- EOC really is asserted');
    // EIGHT bits where an STC12 gives ten. The scaling makes the two devices
    // agree about what "about three quarters" means; the warning says the low
    // two bits are resolution this converter never had.
    assert.deepEqual(b.screenText().filter(Boolean), ['768']);
});

test('the emitted sequence POLLS, because reading early returns the previous conversion', async () => {
    // A conversion takes 64 ADC clocks and START does not clear the output
    // latch, so start-then-read hands back the LAST result -- a program that
    // would look correct from its second call onward and be wrong on its
    // first. That is the silent-wrong class, and the reseat gate could not
    // catch it because the program still runs. So the poll is load-bearing
    // and this asserts it is actually emitted.
    const src = ['DEVICE i8086', 'PIN pot = P1.0 ANALOG',
        'WHEN flag clicked:', '  say (read pot)'].join('\n');
    const c = new SB3();
    c.parse(src);
    const built = await buildPseudocode8086({project: c.project, source: src});
    assert.match(built.asm, /TEST AL, 1/, 'EOC is tested');
    assert.match(built.asm, /JZ BW_ADC\d+/, 'and looped on until it is set');
});

test('an ANALOG pin off P1 is refused, because the channels ARE P1.0-P1.7', async () => {
    // THE PARSER OWNS THIS ONE, and says it better than the back end could:
    // it names the pin and the range. The emitter carries the same check as
    // defence in depth -- it is unreachable through the parser today, and
    // that is the right way round rather than a redundancy to delete, because
    // the back end must not depend on an upstream layer to stay correct.
    const src = ['DEVICE i8086', 'PIN pot = P2.3 ANALOG',
        'WHEN flag clicked:', '  say (read pot)'].join('\n');
    const c = new SB3();
    c.parse(src);
    assert.match((c.warnings || []).join(' '),
        /ANALOG is only available on P1\.0-P1\.7/,
        'refused by name, with the range, rather than reading the wrong channel');
    assert.deepEqual(c.project.stc.pins, [], 'and the bad declaration is not carried forward');
});

// ── A LEVEL, AND A TONE ──────────────────────────────────────────────────

test('`set <pin> to <expr>` writes a LEVEL, not a voltage', async () => {
    // This was nearly lowered to a DAC. The parser calls it a computed LEVEL
    // and every other back end emits `if (VALUE) high else low`, so
    // `set led to 128` means "drive it high" -- not "put 128/255 of Vref on
    // it". A converter here would have run, looked plausible, and meant
    // something else, which is the failure this tier exists to refuse.
    for (const [expr, bit] of [['128', 1], ['0', 0], ['(2 - 2)', 0], ['(3 * 7)', 1]]) {
        const r = await run(['DEVICE i8086', 'PIN led = P1.0 OUTPUT',
            'WHEN flag clicked:', `  set led to ${expr}`]);
        assert.equal(r.ports.a.value & 1, bit, `set led to ${expr}`);
    }
});

test('a tone comes from the speaker, and the LED beside it survives', async () => {
    // THE COLLISION THIS GUARDS. An 8255 port is written whole, and P2 is
    // port B -- so a tone and a lit lamp are two bits of ONE latch. A raw
    // `OUT 61h` beside a pin write leaves the shadow claiming a lamp is lit
    // while the port holds it dark: nothing stops, nothing errors, and there
    // is no diagnostic a learner could act on. Measured by the review lane;
    // the fix is that the tone goes through BW_PORTB like every pin write.
    const r = await run(['DEVICE i8086', 'PIN spk = P2.1 TONE', 'PIN led = P2.3 OUTPUT',
        'WHEN flag clicked:', '  set spk to 440 hz', '  turn on led', '  wait 1 secs']);
    assert.equal(r.ports.b.value, 0b1011,
        'bits 0 and 1 gate the speaker, bit 3 is the LED, and all three are in one latch');
});

test('the tone PLAYED is reported, not the tone asked for', async () => {
    // 4000 Hz, deliberately: its divisor is 298 and one count moves the
    // result 13 Hz, so an off-by-one cannot hide. At 440 Hz it could --
    // 2712, 2713 and 2714 all round back to 440, which is how the review
    // lane's first pitch test passed while being wrong.
    const r = await run(['DEVICE i8086', 'PIN spk = P2.1 TONE',
        'WHEN flag clicked:', '  set spk to 4000 hz', '  wait 1 secs']);
    const tone = r.bench.target.audio()[0];
    assert.equal(tone.hz, 4004, 'an 8254 divides 1193182 by a whole number; 4000 is not one');
    assert.ok(tone.on, 'and it is actually sounding');
    assert.match(r.built.warnings.join(' '), /asks for 4000 Hz and the speaker plays 4004 Hz/,
        'and the build says so rather than echoing back what was typed');
});

test('0 Hz is silence, not a divide by zero', async () => {
    const r = await run(['DEVICE i8086', 'PIN spk = P2.1 TONE',
        'WHEN flag clicked:', '  set spk to 440 hz', '  set spk to 0 hz', '  wait 1 secs']);
    assert.equal(r.bench.target.audio()[0].on, false);
    assert.equal(r.ports.b.value & 3, 0, 'both gate bits are down');
});

test('a TONE pin that is not the speaker is refused by name', async () => {
    // On an 8051 a tone comes out of whatever pin you name. Here it cannot:
    // the speaker is fixed hardware. Silently playing it somewhere else would
    // be a program whose sound comes from a pin it did not name.
    const src = ['DEVICE i8086', 'PIN spk = P1.3 TONE',
        'WHEN flag clicked:', '  set spk to 440 hz'].join('\n');
    const c = new SB3();
    c.parse(src);
    await assert.rejects(
        () => buildPseudocode8086({project: c.project, source: src}),
        /the speaker is not on a pin you can choose/);
});

// ── WAIT UNTIL ──────────────────────────────────────────────────────────

test('`wait until` on a pin finishes when the world changes', async () => {
    const src = ['DEVICE i8086', 'PIN sw = P2.0 INPUT', 'WHEN flag clicked:',
        '  wait until (read sw) = 0', '  say "pressed"'].join('\n');
    const c = new SB3();
    c.parse(src);
    const built = await buildPseudocode8086({project: c.project, source: src});
    assert.deepEqual(built.warnings, [], 'a wait on a pin CAN finish, so nothing is warned');
    const b = await createI8086DosBench(
        {bytes: built.bytes, format: built.format, chips: built.chips});
    let n = 0;
    while (n < 300_000 && !b.terminated) {
        if (n > 5000) b.target.setInput('ppi1', 'b', 0, 0);   // the switch closes
        b.step();
        n++;
    }
    assert.ok(b.terminated, 'the spin ended when the pin went low');
    assert.deepEqual(b.screenText().filter(Boolean), ['pressed']);
});

test('`wait until` on variables alone is warned, and the warning is TRUE', async () => {
    // Not a hunch about style -- it is the whole state of the machine. One
    // script, no interrupt handlers, and a spin whose body is empty writes
    // nothing, so a condition over variables that is false on entry is false
    // forever. The second half of this test is the part that matters: the
    // program really does stop there, so the warning describes what happens
    // rather than what someone suspected might.
    const src = ['DEVICE i8086', 'GLOBAL n', 'WHEN flag clicked:', '  set n to 0',
        '  wait until n = 5', '  say "never"'].join('\n');
    const c = new SB3();
    c.parse(src);
    const built = await buildPseudocode8086({project: c.project, source: src});
    assert.match(built.warnings.join(' '), /tests only variables and constants/);
    const b = await createI8086DosBench(
        {bytes: built.bytes, format: built.format, chips: built.chips});
    let n = 0;
    while (n < 200_000 && !b.terminated) { b.step(); n++; }
    assert.ok(!b.terminated, 'and it really does stop there');
    assert.deepEqual(b.screenText().filter(Boolean), [], 'nothing after the wait ever runs');
});

// ── PIN EVENT HATS ──────────────────────────────────────────────────────

/** Press the switch three times, ACTIVE LOW: pressed = the pin driven low. */
function threePresses (b, n) {
    const phase = Math.floor(n / 400_000);
    b.target.setInput('ppi1', 'b', 0, (phase % 2 === 1 && phase < 6) ? 0 : 1);
}

async function runDriven (lines, drive, cap = 6_000_000) {
    const src = lines.join('\n');
    const c = new SB3();
    c.parse(src);
    assert.deepEqual(c.warnings || [], [], 'parses clean');
    const built = await buildPseudocode8086({project: c.project, source: src});
    const b = await createI8086DosBench(
        {bytes: built.bytes, format: built.format, chips: built.chips});
    let n = 0;
    while (n < cap && !b.terminated) { drive(b, n); b.step(); n++; }
    return {built, bench: b, screen: b.screenText().filter(Boolean)};
}

test('`WHEN <pin> pressed` fires on the EDGE, once per press', async () => {
    // A hat that fired on the LEVEL would run its body thousands of times
    // while a finger rested on the button. Three presses, three runs.
    const r = await runDriven(['DEVICE i8086', 'PIN sw = P2.0 INPUT ACTIVE LOW',
        'WHEN sw pressed:', '  print "hit"'], threePresses);
    assert.deepEqual(r.screen, ['hit', 'hit', 'hit']);
    assert.ok(!r.bench.terminated, 'an event program does not finish, and should not');
});

test('a pin hat runs beside a flag script', async () => {
    const r = await runDriven(['DEVICE i8086', 'PIN sw = P2.0 INPUT ACTIVE LOW',
        'WHEN flag clicked:', '  print "go"',
        'WHEN sw pressed:', '  print "hit"'], threePresses);
    assert.deepEqual(r.screen, ['go', 'hit', 'hit', 'hit']);
});

test('`released` is the other edge, not the same one', async () => {
    const r = await runDriven(['DEVICE i8086', 'PIN sw = P2.0 INPUT ACTIVE LOW',
        'WHEN sw released:', '  print "up"'], threePresses);
    assert.deepEqual(r.screen, ['up', 'up', 'up']);
});

test('one script waits, another frees it — through a variable', async () => {
    // The test that proves `wait until` HANDS OVER under the scheduler. A
    // spin that did not would starve the very hat that can end it, and the
    // program would sit there forever with everything looking correct.
    const r = await runDriven(['DEVICE i8086', 'PIN sw = P2.0 INPUT ACTIVE LOW', 'GLOBAL go',
        'WHEN flag clicked:', '  set go to 0', '  wait until go = 1', '  print "freed"',
        'WHEN sw pressed:', '  set go to 1'], threePresses);
    assert.deepEqual(r.screen, ['freed']);
});

test('a FOREVER that never waits no longer starves anything', async () => {
    // THE WHOLE POINT OF PREEMPTION, and the thing the cooperative scheduler
    // could only warn about. Script one is a tight loop that never yields.
    // Under cooperative scheduling it took the CPU and never gave it back;
    // the timer now takes it away whether the script cooperates or not.
    const src = ['DEVICE i8086', 'GLOBAL n',
        'WHEN flag clicked:', '  FOREVER:', '    change n by 1',
        'WHEN flag clicked:', '  REPEAT 3:', '    print "alive"', '    wait 0.01 secs',
        '  stop all'].join('\n');
    const c = new SB3();
    c.parse(src);
    const built = await buildPseudocode8086({project: c.project, source: src});
    assert.ok(!/never hands control back/.test(built.warnings.join(' ')),
        'and the old warning is gone, because it is no longer true');
    const b = await createI8086DosBench(
        {bytes: built.bytes, format: built.format, chips: built.chips});
    let n = 0;
    while (n < 6_000_000 && !b.terminated) { b.step(); n++; }
    assert.deepEqual(b.screenText().filter(Boolean), ['alive', 'alive', 'alive']);
    assert.ok(b.terminated, 'and the other script could still end the program');
});

test('`wait until` on variables is NOT warned when another script could change them', async () => {
    // The single-script warning says nothing can change the condition. With a
    // second script that claim is false, so making it would be worse than
    // saying nothing.
    const src = ['DEVICE i8086', 'GLOBAL go',
        'WHEN flag clicked:', '  wait until go = 1', '  print "a"',
        'WHEN flag clicked:', '  set go to 1'].join('\n');
    const c = new SB3();
    c.parse(src);
    const built = await buildPseudocode8086({project: c.project, source: src});
    assert.ok(!/tests only variables and constants/.test(built.warnings.join(' ')));
});

// ── PWM: REAL PULSES, FROM A SCHEDULED TASK ─────────────────────────────

/** Duty measured CYCLE-WEIGHTED over a window, which is the only honest way. */
async function measureDuty (pct) {
    const src = ['DEVICE i8086', 'PIN led = P1.0 PWM',
        'WHEN flag clicked:', `  set led to ${pct} percent`,
        '  wait 3 secs', '  stop all'].join('\n');
    const c = new SB3();
    c.parse(src);
    const built = await buildPseudocode8086({project: c.project, source: src});
    const b = await createI8086DosBench(
        {bytes: built.bytes, format: built.format, chips: built.chips});
    // THE WINDOW, NOT THE RUN. Dividing post-warmup "on" time by the whole
    // elapsed time -- which includes the scheduler's 20 ms calibration and
    // the steps before the duty was even set -- made 100% measure 70.6%.
    let n = 0, onMs = 0, warm = 0, startMs = null, lastMs = 0;
    while (n < 12_000_000 && !b.terminated) {
        const t = b.machine.tMs;
        if (warm === 400_000) { startMs = t; lastMs = t; }
        if (startMs !== null) {
            const p = b.target.outputs().find(x => x.port === 'a');
            if (p && (p.value & 1)) onMs += t - lastMs;
            lastMs = t;
        }
        warm++;
        b.step();
        n++;
    }
    const window = startMs === null ? 0 : b.machine.tMs - startMs;
    return {duty: window > 0 ? (onMs / window * 100) : 0, built};
}

test('PWM produces REAL pulses, and the endpoints are exact', async () => {
    // A DAC would have given the same brightness by a different mechanism --
    // a steady voltage that a scope, a motor or an RC filter would disagree
    // with. This pulses the pin, so 0% is off and 100% is on rather than
    // 0 V and 5 V that merely look like it.
    const off = await measureDuty(0);
    assert.equal(off.duty, 0, '0% never turns on');
    const on = await measureDuty(100);
    assert.ok(on.duty > 99.5, `100% never turns off (${on.duty.toFixed(1)}%)`);
});

test('the duty is monotonic and close, with the compression the build warns about', async () => {
    // Measured on this bench: fixed per-phase overhead lands on BOTH waits,
    // so the duty is pulled toward 50%. It is systematic, not noise -- the
    // review lane measured the period steady to six microseconds over 655
    // periods -- so a fade stays a fade and loses a little travel at the ends.
    const points = [];
    for (const p of [10, 25, 50, 75]) points.push({asked: p, got: (await measureDuty(p)).duty});
    for (let i = 1; i < points.length; i++) {
        assert.ok(points[i].got > points[i - 1].got,
            `duty must rise: ${JSON.stringify(points)}`);
    }
    for (const p of points) {
        assert.ok(Math.abs(p.got - p.asked) < 5,
            `${p.asked}% measured ${p.got.toFixed(1)}%`);
    }
});

test('the build says PWM is generated, not hardware, and what that costs', async () => {
    const {built} = await measureDuty(50);
    assert.match(built.warnings.join(' '), /an 8255 has no PWM hardware/);
    assert.match(built.warnings.join(' '), /About 20 levels are distinguishable/);
    assert.match(built.warnings.join(' '), /pulled toward 50/);
});

test('a percentage on a pin that is not PWM is refused by name', async () => {
    const src = ['DEVICE i8086', 'PIN led = P1.0 OUTPUT',
        'WHEN flag clicked:', '  set led to 50 percent'].join('\n');
    const c = new SB3();
    c.parse(src);
    // The parser warns first; the back end refuses if it ever reaches there.
    const warned = /only a PWM pin takes a percentage/.test((c.warnings || []).join(' '));
    if (!warned) {
        await assert.rejects(() => buildPseudocode8086({project: c.project, source: src}),
            /Declare it PWM/);
    }
});

// ── AN EIGHT-DIGIT DISPLAY, WHICH ONLY WORKS BECAUSE IT IS MULTIPLEXED ───

/** The 0-9 patterns, so a test can read the display the way an eye does. */
const SEG_FONT = {0x3F: '0', 0x06: '1', 0x5B: '2', 0x4F: '3', 0x66: '4',
    0x6D: '5', 0x7D: '6', 0x07: '7', 0x7F: '8', 0x6F: '9'};

/** Run, watching which digit is selected and what segments it drives. */
async function readDisplay (body) {
    const src = ['DEVICE i8086', 'PART disp = SEVENSEG8 SEGMENTS P1 SELECT P2.0 P2.1 P2.2',
        'WHEN flag clicked:', ...body, '  wait 2 secs', '  stop all'].join('\n');
    const c = new SB3();
    c.parse(src);
    assert.deepEqual(c.warnings || [], [], 'parses clean');
    const built = await buildPseudocode8086({project: c.project, source: src});
    const b = await createI8086DosBench(
        {bytes: built.bytes, format: built.format, chips: built.chips});
    const seen = new Map();
    let n = 0;
    while (n < 4_000_000 && !b.terminated) {
        const o = b.target.outputs();
        const a = o.find(x => x.port === 'a'), sel = o.find(x => x.port === 'b');
        // Only non-zero segment patterns: a blank digit drives nothing, and
        // the scan blanks the segments before it moves the select lines.
        if (a && sel && a.value) seen.set(sel.value & 7, a.value);
        b.step();
        n++;
    }
    let out = '';
    for (let d = 0; d < 8; d++) out += seen.has(d) ? (SEG_FONT[seen.get(d)] ?? '?') : ' ';
    return {text: out, lit: seen.size, built};
}

test('an eight-digit display shows a number, right-aligned', async () => {
    const r = await readDisplay(['  show number 1207 on disp']);
    assert.equal(r.text, '    1207');
    assert.equal(r.lit, 4, 'only the four digits that carry the number are driven');
});

test('zero still shows a zero — leading blanking never eats the last digit', async () => {
    // A display that goes completely dark for the value 0 reads as broken.
    const r = await readDisplay(['  show number 0 on disp']);
    assert.equal(r.text, '       0');
});

test('`clear` blanks every digit', async () => {
    const r = await readDisplay(['  show number 88 on disp', '  clear disp']);
    assert.equal(r.lit, 0, 'nothing is driven at all');
});

test('filling the buffer is ATOMIC against the scan task', async () => {
    // THE BUG THIS CAUGHT. The digits are written first and the leading zeros
    // blanked second, so a preemption in between let the scan display a digit
    // that was about to be blanked: 1207 read as " 0  1207" -- a stray zero
    // four places left of the number, which looks like a hardware fault
    // rather than a race. The fill is a critical section now, and this test
    // is the measurement that would go wrong again if it stopped being one.
    for (const [n, want] of [[1207, '    1207'], [90, '      90'], [12345678, '12345678']]) {
        const r = await readDisplay([`  show number ${n} on disp`]);
        assert.equal(r.text, want, `show number ${n}`);
    }
});

test('the build says a display costs a script, and why', async () => {
    const r = await readDisplay(['  show number 1 on disp']);
    assert.match(r.built.warnings.join(' '), /adds a script for each to scan it/);
    assert.match(r.built.warnings.join(' '), /ONE digit at a time/);
});

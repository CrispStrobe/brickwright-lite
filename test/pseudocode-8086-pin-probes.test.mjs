/**
 * The PIN lowering, probed for what its own tests could not have asked.
 *
 * The pin gate was written by the author of the lowering, the same afternoon,
 * and it checks the things that lowering was designed to do: two pins on one
 * port not clobbering each other, ACTIVE LOW inverting at the declaration, the
 * control word written exactly once. This file asks the other question — what
 * does a LEARNER do that the design did not anticipate — and it reports a
 * clean result for most of it, which is part of the point.
 *
 * WHAT IS CORRECT, verified rather than assumed: the mode-0 control word for
 * every declaration shape including port C's two independently-directioned
 * halves, and the whole direction stack from the compiler down to the wire.
 *
 * WHAT IS NOT: nothing checks a pin's DIRECTION against its USE. Writing a pin
 * declared INPUT builds silently, and the machine then does exactly the right
 * thing with it — which is why the learner sees nothing happen and gets no
 * diagnostic. That is a compile-time question and the machine cannot answer it.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {INTEGRATED} from './helpers/bw-integrated.mjs';

const L = new URL('../overlay/scratch-gui/src/lib/', import.meta.url);
const SB3Creator = (await import(path.join(INTEGRATED, 'src/lib/sb3-creator.js'))).default;
const {buildPseudocode8086} = await import(new URL('bw-asm/pseudocode-8086.js', L).href);
const {createI8086DosBench} = await import(new URL('bw-debug/i8086-dos-bench.js', L).href);

const forbiddenFetch = () => { throw new Error('the hosted route was reached'); };

async function build (lines) {
    const source = lines.join('\n') + '\n';
    const creator = new SB3Creator();
    creator.parse(source);
    const out = await buildPseudocode8086(
        {project: creator.project, source, warnings: creator.warnings},
        {hostedFetch: forbiddenFetch});
    return out;
}

/** The mode word the program writes into the 8255, read out of the assembly. */
function controlWord (asm) {
    const m = asm.match(/MOV DX, (\d+)\s*\n\s*MOV AL, (\d+)\s*\n\s*OUT DX, AL/);
    return m ? {port: Number(m[1]), word: Number(m[2])} : null;
}

async function run (lines) {
    const out = await build(lines);
    const b = await createI8086DosBench({bytes: out.bytes, format: out.format});
    b.target.run();
    let slices = 0;
    while (!b.terminated && slices++ < 400) b.target.runFor(5e6);
    const ports = {};
    for (const p of b.target.outputs()) ports[p.port] = p;
    return {out, ports};
}

/** The bench itself, run and left alive, so a test can poke the chip the way
 *  a wrong program used to. */
async function bench (lines) {
    const out = await build(lines);
    const b = await createI8086DosBench({bytes: out.bytes, format: out.format});
    b.target.run();
    let slices = 0;
    while (!b.terminated && slices++ < 400) b.target.runFor(5e6);
    return b;
}

const P = (decls, body) => ['DEVICE i8086', ...decls, 'WHEN flag clicked:', ...body];

// ---- the control word, across every declaration shape ---------------------

test('the mode word matches the 8255 encoding for every declaration shape', async () => {
    // Bit 4 = port A input, bit 1 = port B input, bit 3 = port C UPPER, bit 0
    // = port C lower. Port C is two half-ports with independent directions,
    // and getting one of these bits wrong points a port the wrong way while
    // the program still assembles and runs.
    const cases = [
        [['PIN led = P1.0 OUTPUT'], ['  turn on led'], 0x80, 'all output'],
        [['PIN sw = P1.0 INPUT'], ['  IF (read sw) = 1 THEN:', '    say 1'], 0x90, 'A input'],
        [['PIN sw = P2.0 INPUT'], ['  IF (read sw) = 1 THEN:', '    say 1'], 0x82, 'B input'],
        [['PIN sw = P3.0 INPUT'], ['  IF (read sw) = 1 THEN:', '    say 1'], 0x81, 'C lower'],
        [['PIN sw = P3.4 INPUT'], ['  IF (read sw) = 1 THEN:', '    say 1'], 0x88, 'C upper'],
        [['PIN led = P2.0 OUTPUT', 'PIN sw = P3.0 INPUT'],
            ['  turn on led', '  IF (read sw) = 1 THEN:', '    say 1'], 0x81,
        'an output on B and an input on C lower are independent'],
    ];
    for (const [decls, body, want, what] of cases) {
        const cw = controlWord((await build(P(decls, body))).asm);
        assert.ok(cw, `${what}: no control word was emitted`);
        assert.equal(cw.port, 0x63, 'the 8255 control port on this tier is 63h');
        assert.equal(cw.word, want,
            `${what}: expected 0x${want.toString(16)}, got 0x${cw.word.toString(16)}`);
    }
});

test('a program with no pins writes no mode word at all', async () => {
    // Worth pinning: a mode word CLEARS the output latches, so emitting one
    // unconditionally would make every pinless program disturb a board it
    // never mentioned.
    assert.equal(controlWord((await build(P([], ['  say 1']))).asm), null);
});

// ---- direction versus use: the gap ----------------------------------------

test('writing a pin declared INPUT is REFUSED — the gap this pinned is closed', async () => {
    // THIS PINNED A GAP AND THE GAP IS SHUT. It asserted that `turn on` an
    // INPUT pin warned about nothing, with a note saying to assert the message
    // once it did. It does now, so this asserts the message.
    //
    // The reason it had to be the COMPILER is the measurement this file made:
    //   OUTPUT + turn on:  latch=0x01  dir=0xff  pins=0x01   the LED lights
    //   INPUT  + turn on:  latch=0x01  dir=0x00  pins=0xff   nothing lights
    // Every layer correct, nothing to report, only the declaration knows.
    for (const body of [['  turn on sw'], ['  turn off sw'], ['  toggle sw']]) {
        await assert.rejects(() => build(P(['PIN sw = P2.0 INPUT'], body)),
            /declared INPUT and this writes to it/,
            `"${body[0].trim()}" on an INPUT pin must be refused by name`);
    }
});

test('the MACHINE is right, which is why only the compiler could have caught it', async () => {
    // THE FINDING THIS FILE EXISTS FOR, and it has to be driven at the MACHINE
    // now: the compiler refuses to write an INPUT pin, so the wrong program
    // can no longer be built. The 8255 behaviour it demonstrated is unchanged
    // and is the reason the refusal belongs where it does.
    //
    // Port B configured as an INPUT, then the latch written anyway -- exactly
    // what the old compiler output did:
    const r = await run(P(['PIN led = P2.0 OUTPUT'], ['  turn on led']));
    assert.equal(r.ports.b.dir, 0xff, 'an OUTPUT port drives every bit');
    assert.equal(r.ports.b.pins & 0x01, 0x01, 'and the pin carries the 1 -- the LED lights');

    // The same write onto a port the chip is NOT driving. 82h is mode 0 with
    // port B an input; the OUT then lands in a latch nobody reads.
    const b = await bench(P(['PIN led = P2.0 OUTPUT'], ['  turn on led']));
    b.machine._out(0x63, 0x82);          // port B: input
    b.machine._out(0x61, 0x01);          // write the latch anyway
    const port = b.target.outputs().find((o) => o.port === 'b');
    assert.equal(port.value & 0x01, 0x01, 'the write DID reach the latch');
    assert.equal(port.dir, 0x00, 'but the chip is not driving the port');
    assert.equal(port.pins & 0x01, 0x01,
        'so the pin reads the input, not the latch -- nothing the machine can call wrong');
});

test('reading a pin declared OUTPUT is REFUSED — the mirror gap, also closed', async () => {
    // Not a fault at the chip: an 8255 output port reads back the LATCH, so it
    // answers with whatever the program last wrote. It answers something the
    // learner did not ask, which is worse than refusing.
    await assert.rejects(
        () => build(P(['PIN led = P1.0 OUTPUT'], ['  IF (read led) = 1 THEN:', '    turn off led'])),
        /declared OUTPUT and this reads it/);
});

test('the keyboard and the 8255 do not collide on THIS bench, and the reason is the PIC',
    async () => {
        // The concern was real and the answer is architectural: port A at 60h
        // is where a PC's scancode arrives, and any pin program that does not
        // declare an INPUT on P1 configures port A as an OUTPUT. On a machine
        // with a hardware keyboard that would be a program quietly seizing the
        // keyboard's port.
        //
        // It cannot happen here. DOSBOX8086_XT has NO PIC, so there is no IRQ1
        // and no hardware keyboard path at all; this bench's keys are ASCII
        // through the DOS service layer (`sendKeys` -> `dos.type`). The two
        // features cannot interact because only one of them exists.
        //
        // PINNED BECAUSE IT IS A PROPERTY OF THE CONFIG, NOT A LAW. The day a
        // pin program runs on a preset that has a PIC and a keyboard on the
        // 8255, this becomes real — so this test asserts the premise rather
        // than the conclusion.
        const out = await build(P(['PIN led = P2.0 OUTPUT'], ['  turn on led']));
        assert.equal(controlWord(out.asm).word & 0x10, 0,
            'port A is configured as an OUTPUT by a program that never mentions it');

        const {DOSBOX8086_XT} = await import(new URL('bw-board/i8086-dos.js', L).href);
        assert.ok(!DOSBOX8086_XT.chips.some((c) => c.kind === 'pic'),
            'if this config gains a PIC, the port A default above stops being harmless');
    });

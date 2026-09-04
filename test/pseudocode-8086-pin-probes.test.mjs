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

test('KNOWN GAP: writing a pin declared INPUT builds silently', async () => {
    // Nothing compares a pin's declared DIRECTION against how it is USED. The
    // program builds clean and warns about nothing.
    for (const body of [['  turn on sw'], ['  turn off sw'], ['  toggle sw']]) {
        const out = await build(P(['PIN sw = P2.0 INPUT'], body));
        assert.deepEqual(out.warnings, [],
            `"${body[0].trim()}" on an INPUT pin currently warns about nothing — if this now `
            + 'warns, the gap is closed and this test should assert the message instead');
    }
});

test('and the MACHINE is right, which is exactly why the learner sees nothing', async () => {
    // THE WHOLE STACK IS CORRECT HERE and that is the finding. The write lands
    // in the latch, the chip is not driving the port, and the pins carry the
    // input instead — which is what an 8255 does. So the LED does not light,
    // nothing is wrong at any layer the machine can see, and there is nothing
    // for it to report. Only the compiler knows the declaration said INPUT.
    const driven = await run(P(['PIN led = P2.0 OUTPUT'], ['  turn on led']));
    assert.equal(driven.ports.b.dir, 0xff, 'an OUTPUT port drives every bit');
    assert.equal(driven.ports.b.pins & 0x01, 0x01, 'and the pin carries the 1 — the LED lights');

    const undriven = await run(P(['PIN sw = P2.0 INPUT'], ['  turn on sw']));
    assert.equal(undriven.ports.b.value & 0x01, 0x01, 'the write DID reach the latch');
    assert.equal(undriven.ports.b.dir, 0x00, 'but the chip is not driving the port');
    assert.equal(undriven.ports.b.pins & 0x01, 0x01,
        'so the pin reads the input, not the latch — the LED never lights');
});

test('KNOWN GAP: reading a pin declared OUTPUT builds silently', async () => {
    // An 8255 output port reads back its LATCH, which is defensible hardware
    // behaviour and is not what a learner means by "read". `read led` answers
    // "what did I last write", not "what is the wire doing".
    const out = await build(P(['PIN led = P2.0 OUTPUT'],
        ['  IF (read led) = 1 THEN:', '    say 1']));
    assert.deepEqual(out.warnings, [],
        'if this now warns, the gap is closed — assert the message instead');
});

// ---- the one the author bet on, and it is not a defect --------------------

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

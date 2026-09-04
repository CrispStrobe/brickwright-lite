/**
 * The ▶ button for an 8086, driven from PSEUDOCODE, with no network.
 *
 * THE ONLY CLAIM WORTH MAKING is the one a learner can check: text in, and
 * the right characters on the screen. So this gate does not assert that the
 * generator emits a particular string, or that `assemble()` returns bytes,
 * or that a promise resolves. It parses pseudocode with the same compiler
 * the tab loads, calls the same `buildPseudocode8086` the button calls with
 * NO injected assembler, boots the result on `createI8086DosBench` — the
 * module `debug-runner.js` imports — and reads the CGA text page back.
 *
 * That shape is copied deliberately from `test/i8086-asm-examples.test.mjs`,
 * which says why: "a test that calls your code generator directly proves the
 * generator works and proves nothing about the button". The repo's named
 * recurring defect is a test supplying a precondition production never
 * supplies, so the only seam overridden here is the NETWORK, and it is
 * overridden with a function that THROWS — a program that leaked onto the
 * hosted route fails here instead of quietly passing.
 *
 * The remaining gap between this and a real click is the React handler and
 * the `bw-asm-rom-ready` hop. Both ends of that are pinned structurally
 * below (the component must call this module, and must dispatch the event
 * with the slot the .COM needs), the same way `asm-assemble-route.test.mjs`
 * pins the hand-written-assembly half.
 *
 * SUPPORTED IS A CHECKED LIST, NOT A COMMENT. Every entry in the back end's
 * `SUPPORTED` table has a program here that uses it and asserts what it puts
 * on screen; every refusal has a program that must be refused, by the tag it
 * claims. A block that quietly did nothing would fail both halves.
 */

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';

import {REPO, INTEGRATED} from './helpers/bw-integrated.mjs';
import {
    buildPseudocode8086, emitI8086Asm, SUPPORTED, Pseudocode8086Error, boolishTruthTest
} from '../overlay/scratch-gui/src/lib/bw-asm/pseudocode-8086.js';
import {createI8086DosBench} from '../overlay/scratch-gui/src/lib/bw-debug/i8086-dos-bench.js';

// ── Instrument check ────────────────────────────────────────────────────
//
// The pseudocode PARSER has to come from the integrated tree — it is the
// only place `jszip` resolves — and that is a second checkout, therefore a
// second everything. Comparing bytes is what makes a result here
// attributable to this repo. The back end under test is imported from
// `overlay/`, which is the source of truth in git.
const overlayCompiler = readFileSync(path.join(REPO, 'overlay/scratch-gui/src/lib/sb3-creator.js'));
const integratedCompiler = readFileSync(path.join(INTEGRATED, 'src/lib/sb3-creator.js'));

test('instrument: the integrated pseudocode parser is byte-identical to overlay/', () => {
    assert.ok(overlayCompiler.equals(integratedCompiler),
        `the integrated sb3-creator differs from overlay/ (${integratedCompiler.length} vs ` +
        `${overlayCompiler.length} bytes). Run \`node scripts/integrate.mjs\`; until then ` +
        `any result here belongs to a tree this repo does not own.`);
});

const SB3Creator = (await import(path.join(INTEGRATED, 'src/lib/sb3-creator.js'))).default;

/** A network that cannot be used without being noticed. */
const forbiddenFetch = () => {
    throw new Error('a pseudocode program escaped to the hosted assembler');
};

/**
 * Build and run one pseudocode program exactly as the ▶ button does, and
 * hand back what ended up on the screen.
 */
async function runPseudocode (source) {
    const creator = new SB3Creator();
    creator.parse(source);
    const out = await buildPseudocode8086(
        {project: creator.project, source}, {hostedFetch: forbiddenFetch});
    // The chips the program's own declarations require, which is how an
    // ANALOG pin gets a converter to read.
    const bench = await createI8086DosBench(
        {bytes: out.bytes, format: out.format, chips: out.chips});
    bench.target.run();
    // 5 ms slices, the shape the debug session's frame loop pumps in. The cap
    // is generous and finite: a program that has not finished in four
    // simulated seconds of instructions is one this gate reports rather than
    // hangs CI over. `wait` costs no instructions here (INT 15h/86h advances
    // the clock directly), so a program that waits for a minute still
    // finishes in a handful of slices.
    let slices = 0;
    while (!bench.terminated && slices++ < 800) bench.target.runFor(5e6);
    return {out, bench, slices, screen: bench.screenText().filter(Boolean),
        tMs: bench.machine.tMs};
}

/** The refusal a program must produce, or the test fails for not producing it. */
async function refusalFor (source) {
    const creator = new SB3Creator();
    creator.parse(source);
    try {
        await buildPseudocode8086({project: creator.project, source},
            {hostedFetch: forbiddenFetch});
    } catch (e) {
        return e;
    }
    return null;
}

// ── The program a learner actually writes ────────────────────────────────

const COUNTING = `DEVICE i8086
GLOBAL counter
WHEN flag clicked:
  set counter to 0
  REPEAT 10:
    change counter by 1
    say counter
`;

test('"repeat 10 / change counter by 1 / say counter" counts on the screen', async () => {
    const {out, bench, screen, slices} = await runPseudocode(COUNTING);

    // Built HERE. Not "built" — built without the network, which is the
    // entire point of this lane.
    assert.equal(out.route, 'local',
        'the program did not take the in-browser assembler');
    assert.equal(out.format, 'com');
    assert.ok(out.bytes.length > 0, 'the program assembled to nothing');
    assert.deepEqual(out.warnings, [],
        `a plain counting program should build clean; it warned ${JSON.stringify(out.warnings)}`);

    assert.ok(bench.terminated,
        `the program never reached INT 21h/4Ch in ${slices} slices — a program that ` +
        `does not finish looks exactly like a bench that hung`);
    assert.equal(bench.exitCode, 0);

    assert.deepEqual(screen, ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'],
        'the counter did not count');
});

// ── DECISION 2: nothing narrows ──────────────────────────────────────────

test('a variable past 65535 keeps its value — nothing is narrowed to 16 bits', async () => {
    // The failure this forbids, named in the back end's header: a counter
    // that wraps at 65535 where the Scratch version reaches 100000 is a
    // program that runs, prints a wrong number, and blames the learner.
    const {screen} = await runPseudocode(`GLOBAL n
WHEN flag clicked:
  set n to 100000
  say n
  change n by 100000
  say n
  set n to 2147483647
  say n
  set n to -2147483648
  say n
`);
    assert.deepEqual(screen, ['100000', '200000', '2147483647', '-2147483648']);
});

test('REPEAT counts past 65535 too — the 16-bit counter generateC uses is not copied', async () => {
    // `generateC` declares the repeat counter `unsigned int`, which is 16
    // bits on sdcc, so `repeat 70000` runs 4464 times there. This back end
    // uses a 32-bit pair; a regression to a 16-bit counter prints 4464.
    // 70000 rather than a rounder 100000 only because every iteration is
    // really executed here and the gate should not cost a minute.
    const {screen} = await runPseudocode(`GLOBAL n
WHEN flag clicked:
  set n to 0
  REPEAT 70000:
    change n by 1
  say n
`);
    assert.deepEqual(screen, ['70000']);
});

test('a literal too big for 32 bits is refused, not wrapped', async () => {
    const e = await refusalFor(`GLOBAL n
WHEN flag clicked:
  set n to 5000000000
`);
    assert.ok(e instanceof Pseudocode8086Error, 'a 5-billion literal was accepted');
    assert.equal(e.what, 'number out of range');
    assert.match(e.message, /5000000000/, 'the refusal does not quote the number');
});

test('the 32-bit arithmetic agrees with the arithmetic it claims to be', async () => {
    // The runtime routines are the part of this back end that cannot be read
    // off the screen of a counting program: BW_MUL32 (three MULs), BW_UDIV32
    // (a 32-iteration shift-subtract) and the sign handling around it. So
    // they are checked against the semantics they are copying — C `long`,
    // which is two's-complement wrap on overflow, truncating division, and a
    // remainder that takes the DIVIDEND's sign.
    //
    // A fixed table rather than random pairs, so a failure here is the same
    // failure tomorrow. The values are the ones that break naive
    // implementations: the extremes, the 16-bit boundaries, sqrt(2^31), and
    // every combination of signs.
    const PAIRS = [
        [2147483647, 1], [-2147483647, 1], [-2147483647, -1], [2147483647, 2],
        [2147483647, 2147483647], [1, 2147483647], [-1, 3], [7, -2], [-7, -2],
        [100000, 7], [-100000, -7], [65536, 65536], [65535, 2], [46341, 46341],
        [1000000, 1000], [0, 12345], [123456789, -1000]
    ];
    const i32 = x => x | 0;
    // Six pairs per program: the CGA page is 25 rows, and a taller listing
    // would scroll the earliest results off the top before they can be read.
    for (let i = 0; i < PAIRS.length; i += 6) {
        const batch = PAIRS.slice(i, i + 6);
        const source = `GLOBAL a\nGLOBAL b\nWHEN flag clicked:\n` + batch
            .map(([a, b]) => `  set a to ${a}\n  set b to ${b}\n` +
                `  say (a + b)\n  say (a - b)\n  say (a * b)\n` +
                `  say (a / b)\n`).join('');
        const {screen} = await runPseudocode(source);
        const want = batch.flatMap(([a, b]) => [
            String(i32(a + b)), String(i32(a - b)), String(Math.imul(a, b)),
            String(Math.trunc(a / b))
        ]);
        assert.deepEqual(screen, want,
            `32-bit arithmetic disagrees with C long semantics on ${JSON.stringify(batch)}`);
    }
});

test('mod takes the dividend\'s sign, and dividing by zero gives zero', async () => {
    // Both are contracts rather than accidents: `%` in C takes the
    // dividend's sign (Scratch's own mod follows the divisor instead, and
    // the back end WARNS about the difference), and a zero divisor is
    // answered with 0 rather than trapping, because a learner's `x / 0`
    // should not take the machine down.
    const {screen} = await runPseudocode(`GLOBAL a\nGLOBAL b\nWHEN flag clicked:
  set a to 7
  set b to 3
  say (a mod b)
  set a to -7
  say (a mod b)
  set b to -3
  say (a mod b)
  set a to 7
  say (a mod b)
  set b to 0
  say (a / b)
  say (a mod b)
`);
    assert.deepEqual(screen, ['1', '-1', '-1', '1', '0', '0']);
});

// ── DECISION 1: the tick ─────────────────────────────────────────────────

test('wait is exact simulated time, at every duration a learner can type', async () => {
    // INT 15h AH=86h takes microseconds and advances machine time directly,
    // so these are exact rather than quantised. The 18.2065 Hz BIOS tick
    // would make 0.05 s round to one 54.9 ms tick and 0.02 s round to none
    // at all; the 8254 on this bench is clocked from the CPU rather than the
    // PC's 1.193182 MHz and would be 4.19x out. See DECISION 1.
    const before = await runPseudocode(`WHEN flag clicked:\n  say "a"\n`);
    const after = await runPseudocode(`WHEN flag clicked:
  say "a"
  wait 0.05 secs
  wait 0.5 secs
  wait 1 secs
`);
    assert.deepEqual(after.screen, ['a']);
    const waited = after.tMs - before.tMs;
    assert.ok(Math.abs(waited - 1550) < 1,
        `1.55 s of waits took ${waited.toFixed(3)} ms of machine time — the clock is ` +
        `not exact, which is the whole reason INT 15h/86h was chosen over the ` +
        `18.2 Hz tick and the 8254`);
    // And it costs no emulated instructions, which is why a program that
    // waits is still testable at all.
    assert.ok(after.slices <= 4,
        `waiting 1.55 s took ${after.slices} slices; it should cost none`);
});

// ── DECISION 3: the supported list is checked, one program per block ─────

const PROGRAMS = {
    'event_whenflagclicked / looks_say': [
        `WHEN flag clicked:\n  say "hi"\n`, ['hi']],
    'data_setvariableto / data_changevariableby': [
        `GLOBAL n\nWHEN flag clicked:\n  set n to 7\n  change n by -12\n  say n\n`, ['-5']],
    control_repeat: [
        `GLOBAL n\nWHEN flag clicked:\n  set n to 0\n  REPEAT 3:\n    REPEAT 4:\n      change n by 1\n  say n\n`,
        ['12']],
    control_forever: [
        `GLOBAL n\nWHEN flag clicked:\n  set n to 0\n  FOREVER:\n    change n by 1\n    say n\n    IF n = 3 THEN:\n      stop all\n`,
        ['1', '2', '3']],
    'control_if / control_if_else': [
        `GLOBAL n\nWHEN flag clicked:\n  set n to 1\n  IF n = 1 THEN:\n    say "then"\n  ELSE:\n    say "else"\n  IF n = 2 THEN:\n    say "no"\n`,
        ['then']],
    control_repeat_until: [
        `GLOBAL i\nWHEN flag clicked:\n  set i to 0\n  REPEAT UNTIL i > 2:\n    change i by 1\n    say i\n`,
        ['1', '2', '3']],
    'control_wait / looks_sayforsecs': [
        `WHEN flag clicked:\n  say "a" for 0.1 seconds\n  wait 0.1 secs\n  say "b"\n`, ['a', 'b']],
    stc12_print: [
        `WHEN flag clicked:\n  print "text"\n  print 12345\n`, ['text', '12345']],
    'operator_add / subtract / multiply': [
        `WHEN flag clicked:\n  say (100000 + 5)\n  say (3 - 10)\n  say (100000 * 21)\n`,
        ['100005', '-7', '2100000']],
    'operator_divide / mod': [
        `WHEN flag clicked:\n  say (2100000 / 21)\n  say (-7 / 2)\n  say (7 mod 3)\n  say (5 / 0)\n`,
        ['100000', '-3', '1', '0']],
    'operator_lt / gt / equals': [
        `WHEN flag clicked:\n  IF -5 < 1 THEN:\n    say "lt"\n  IF 40000 > 30000 THEN:\n    say "gt"\n  IF 100000 = 100000 THEN:\n    say "eq"\n`,
        ['lt', 'gt', 'eq']],
    'operator_and / or / not': [
        `WHEN flag clicked:\n  IF (1 = 1) and (2 = 2) THEN:\n    say "and"\n  IF (1 = 2) or (2 = 2) THEN:\n    say "or"\n  IF NOT (2 > 3) THEN:\n    say "not"\n`,
        ['and', 'or', 'not']],
    control_stop: [
        `WHEN flag clicked:\n  say "a"\n  stop this script\n  say "b"\n`, ['a']],
    // ── pins and the keypad ──────────────────────────────────────────────
    // These lower to 8255 port writes and reads. They are listed in SUPPORTED,
    // so by the rule below they need programs that actually run them.
    'stc12_setpin / stc12_toggle': [
        `DEVICE i8086\nPIN led = P1.0 OUTPUT\nWHEN flag clicked:\n  turn on led\n  toggle led\n  say "pin"\n`,
        ['pin']],
    stc12_read: [
        // An 8255 input port with nothing driving it reads high, which is what
        // a real one does -- the pins are pulled up and the chip is not driving.
        `DEVICE i8086\nPIN sw = P2.0 INPUT\nWHEN flag clicked:\n  say (read sw)\n`,
        ['1']],
    // ── whole ports ──────────────────────────────────────────────────────
    // Eight bits at once, which is EASIER on an 8255 than one pin: no shadow
    // arithmetic, because there is no neighbour to preserve.
    stc12_setport: [
        `DEVICE i8086\nPORT leds = P2 OUTPUT\nWHEN flag clicked:\n  set leds to 129\n  say "port"\n`,
        ['port']],
    stc12_readport: [
        // An 8255 input port with nothing driving it reads all ones.
        `DEVICE i8086\nPORT sw = P2 INPUT\nWHEN flag clicked:\n  say (read sw)\n`,
        ['255']],
    stc12_whenpin: [
        // The hat ARMS but never fires: an undriven 8255 input reads high, so
        // a pin that is not ACTIVE LOW never reaches "pressed", and the hat
        // sits waiting for the release that comes first. Meanwhile the flag
        // script prints and stops everything -- which is also what makes this
        // the one pin-hat program that can terminate without being driven.
        `DEVICE i8086\nPIN sw = P2.0 INPUT\nWHEN flag clicked:\n  print "ok"\n  stop all\n`
            + `WHEN sw pressed:\n  print "never"\n`,
        ['ok']],
    control_wait_until: [
        // An 8255 input port with nothing driving it reads high, so this one
        // is already true when it is reached and the program runs on.
        `DEVICE i8086\nPIN sw = P2.0 INPUT\nWHEN flag clicked:\n  wait until (read sw) = 1\n  say "on"\n`,
        ['on']],
    stc12_writepin: [
        `DEVICE i8086\nPIN led = P1.0 OUTPUT\nWHEN flag clicked:\n  set led to 128\n  say "lvl"\n`,
        ['lvl']],
    stc12_settone: [
        `DEVICE i8086\nPIN spk = P2.1 TONE\nWHEN flag clicked:\n  set spk to 440 hz\n  say "hz"\n`,
        ['hz']],
    stc12_keypad: [
        // NOTHING PRESSED IS -1, NOT 0, and that is the STC extension's
        // contract verbatim rather than a choice made here: a keypad that
        // answered 0 would be indistinguishable from a pressed key 0.
        `DEVICE i8086\nPART pad = KEYPAD4X4 ROWS P3.0 P3.1 P3.2 P3.3 COLS P2.0 P2.1 P2.2 P2.3\n`
            + `WHEN flag clicked:\n  say (read pad)\n`,
        ['-1']],
};

for (const [what, [source, expect]] of Object.entries(PROGRAMS)) {
    test(`${what} lowers, runs, and prints what it should`, async () => {
        const {bench, screen, slices} = await runPseudocode(source);
        assert.ok(bench.terminated, `did not finish in ${slices} slices`);
        assert.deepEqual(screen, expect);
    });
}

test('every entry in SUPPORTED has a program above that exercises it', () => {
    // The list is the deliverable. An entry nobody runs is a promise, not a
    // fact — and it would look identical to a working one.
    const covered = Object.keys(PROGRAMS).join(' ');
    for (const opcode of Object.keys(SUPPORTED)) {
        const bare = opcode.replace(/^(operator|control|looks|data|event|stc12)_/, '');
        assert.ok(covered.includes(opcode) || covered.includes(bare),
            `${opcode} is listed as supported and no program here runs it`);
    }
});

// ── The refusals, by name ────────────────────────────────────────────────

const REFUSALS = {
    'unsupported hat event_whenkeypressed': `WHEN space key pressed:\n  say "a"\n`,
    'no script': `GLOBAL n\n`,
    'empty script': `WHEN flag clicked:\n`,
    'unsupported block motion_movesteps': `WHEN flag clicked:\n  move 10 steps\n`,
    'unsupported reporter operator_join': `WHEN flag clicked:\n  say ("a" join "b")\n`,
    'unsupported reporter operator_mathop': `WHEN flag clicked:\n  say (sqrt of 9)\n`,
    'custom block': `DEFINE go:\n  say "x"\nWHEN flag clicked:\n  say "y"\n`,
    'sprite script': `SPRITE Cat:\nWHEN flag clicked:\n  say "a"\n`,
    'unsupported block data_addtolist': `LIST xs\nWHEN flag clicked:\n  add 5 to xs\n`,
    // PINS ARE SUPPORTED NOW -- P1/P2/P3 map onto the 8255's ports A/B/C, so
    // an 8051 pin program reseats onto an 8086 unchanged. A PART still is
    // not, and the distinction is real: a PIN is one wire and this bench has
    // a chip to hang it on; a PART is a component with a protocol.
    'part declared': `DEVICE i8086\nPART lcd = LCD1602 ON P1\nWHEN flag clicked:\n  say "hi"\n`
};

for (const [what, source] of Object.entries(REFUSALS)) {
    test(`refused by name: ${what}`, async () => {
        const e = await refusalFor(source);
        assert.ok(e, `this program was accepted and should not have been:\n${source}`);
        assert.equal(e.name, 'Pseudocode8086Error');
        assert.equal(e.what, what);
        // The shape `i8086-asm.js` uses: a prefix that says which stage
        // refused, then a lower-case sentence naming the construct.
        assert.match(e.message, /^8086 pseudocode: /);
        assert.ok(e.message.length > 40,
            `"${e.message}" is too terse to act on — a refusal has to say what to do`);
    });
}

test('a program whose only block is unsupported is REFUSED, never silently emptied', async () => {
    // This is the failure the whole file exists for. `turn led on` is DROPPED
    // by SB3Creator.parse when the DEVICE is one it does not know, so a naive
    // back end sees an empty script, assembles it, runs it, terminates
    // cleanly and prints nothing -- which on a screen is indistinguishable
    // from a bench that failed to start.
    //
    // THIS TEST ASSERTED A REFUSAL FOR `PIN` AND NOW ASSERTS THE OPPOSITE.
    // Pins are lowered: P1/P2/P3 map onto the 8255's ports A/B/C, so the
    // declaration means the same wire on either chip and an 8051 program
    // reseats unchanged. What is still refused is a PART -- a component with a
    // protocol rather than a wire -- and that is what this now pins.
    //
    // Note `turn led on` is NOT the parser's syntax (it is `turn on led`), so
    // the original source here parsed to a hat with no body. That is why the
    // refusal had to be made against the TEXT: there was no block to refuse.
    // The PART refusal is made against the text for the same reason and the
    // same caveat applies.
    const source = `DEVICE i8086\nPART lcd = LCD1602 ON P1\nWHEN flag clicked:\n  say "hi"\n`;
    const e = await refusalFor(source);
    assert.ok(e, 'a program declaring an unmodelled component was accepted');
    assert.equal(e.what, 'part declared');
    assert.match(e.message, /A PIN is one wire and works/,
        'the refusal must say why a PIN is different, or it reads as "no hardware"');
});

test('a refusal names the block and lists what does work', async () => {
    const e = await refusalFor(`WHEN flag clicked:\n  move 10 steps\n`);
    assert.match(e.message, /move \.\.\. steps/,
        'the refusal does not name the block in the learner\'s own spelling');
    assert.match(e.message, /this back end lowers: /,
        'the refusal does not say what IS supported, so it is a dead end');
    for (const spelling of Object.values(SUPPORTED)) {
        assert.ok(e.message.includes(spelling),
            `the refusal's list omits "${spelling}", which SUPPORTED claims works`);
    }
});

// ── `IF flag THEN:` — the block that is not the block that was written ───

test('a bare variable as a condition works, and both spellings of it', async () => {
    // `IF flag THEN:` parses to `flag = "true"`, not to a bare reporter. A
    // back end that does not know that refuses the program with "true is not
    // a number", which is true of the parsed block and nonsense about the
    // written one.
    const {screen} = await runPseudocode(`GLOBAL flag
WHEN flag clicked:
  set flag to 1
  IF flag THEN:
    say "on"
  set flag to 0
  IF NOT flag THEN:
    say "off"
  IF flag THEN:
    say "never"
  say "end"
`);
    assert.deepEqual(screen, ['on', 'off', 'end']);
});

test('the truthiness rule is the compiler\'s own, not a second guess at it', () => {
    // `boolishTruthTest` is transcribed into the back end rather than
    // imported (importing the compiler would drag jszip into a module whose
    // whole point is to need nothing). A transcription that drifts is worse
    // than no transcription, so both are driven against the same table.
    const inp = (v) => (v === null ? [2, null] : [1, [10, v]]);
    const varInput = [3, [12, 'x', 'id'], [10, '']];
    const cases = [
        {OPERAND1: varInput, OPERAND2: inp('true')},
        {OPERAND1: varInput, OPERAND2: inp('TRUE')},
        {OPERAND1: varInput, OPERAND2: inp('false')},
        {OPERAND1: inp('true'), OPERAND2: varInput},
        {OPERAND1: inp('false'), OPERAND2: varInput},
        // Both literals: the right-hand one wins, and that order is the rule.
        {OPERAND1: inp('false'), OPERAND2: inp('true')},
        {OPERAND1: varInput, OPERAND2: inp('3')},
        {OPERAND1: varInput, OPERAND2: varInput}
    ];
    for (const inputs of cases) {
        const b = {opcode: 'operator_equals', inputs};
        assert.deepEqual(boolishTruthTest(b), SB3Creator.boolishTruthTest(b),
            `the back end's copy of boolishTruthTest disagrees with the compiler's ` +
            `on ${JSON.stringify(inputs)}`);
    }
    assert.equal(boolishTruthTest({opcode: 'operator_lt', inputs: {}}), null);
});

// ── Jump range, at a size that would actually break it ───────────────────

test('a program far longer than a conditional jump can reach still builds and runs', async () => {
    // `i8086-asm.js` gives Jcc 127 bytes and REFUSES an out-of-range one.
    // A back end that branched straight to a loop body would assemble every
    // small program here and fail to build on the first real one. 40 ifs is
    // ~3 KB of code, twenty times that reach.
    const source = `GLOBAL n\nWHEN flag clicked:\n  set n to 0\n` +
        Array.from({length: 40}, (_, i) =>
            `  IF n = ${i} THEN:\n    change n by 1\n`).join('') +
        `  say n\n`;
    const {out, bench, screen} = await runPseudocode(source);
    assert.ok(out.bytes.length > 2000,
        `only ${out.bytes.length} bytes — this program is not long enough to test ` +
        `what it claims to test`);
    assert.ok(bench.terminated);
    assert.deepEqual(screen, ['40']);
});

// ── The two ends the node harness cannot click through ───────────────────

const importer = readFileSync(
    path.join(REPO, 'overlay/scratch-gui/src/components/tw-pseudocode/pseudocode-importer.jsx'),
    'utf8');

test('the ▶ button exists, and it calls THIS module rather than its own copy', () => {
    assert.match(importer, /data-testid="bw-run-8086"/,
        'there is no 8086 run button, so nothing in production reaches this back end');
    assert.match(importer, /onClick=\{this\.runPseudocodeOn8086\}/,
        'the button does not call the handler');
    assert.match(importer, /lib\/bw-asm\/pseudocode-8086\.js/,
        'the component does not import the back end this gate tests — a second ' +
        'copy of the lowering is exactly how the two would drift apart');
    assert.match(importer, /buildPseudocode8086\(\{project: creator\.project, source: src\}\)/,
        'the component does not call buildPseudocode8086 with BOTH the project and ' +
        'the source; without the source a PIN program is silently emptied');
});

test('the button is offered for the 8086 family and decided in one place', () => {
    // `asmTargetForDevice` is the only function that says what an 8086 is
    // (asm-assemble-route.test.mjs rule 1). A second spelling test here
    // would be a second place that can disagree.
    assert.match(importer,
        /asmTargetForDevice\(this\.currentDevice\(\)\) === 'i8086'/,
        'the button decides what an 8086 is by itself instead of asking the ' +
        'one function that knows');
});

test('the built image is dispatched as a .COM, not as a ROM', () => {
    // A .COM loaded as a ROM at F0000 executes nothing, and a machine that
    // executes nothing looks exactly like one that failed to start — the
    // sentence i8086-dos-bench.js opens with. slotId/profile carry that.
    const handler = importer.slice(importer.indexOf('async runPseudocodeOn8086'));
    const body = handler.slice(0, handler.indexOf('\n    }\n'));
    assert.match(body, /bw-asm-rom-ready/,
        'the handler never hands the image to the bench');
    assert.match(body, /slotId: out\.slotId/);
    assert.match(body, /profile: out\.profile/);
});

test('a refusal reads differently from a breakage in the status line', () => {
    // 'this program uses a block we do not lower' and 'the assembler is
    // broken' are not the same sentence, and conflating them sent people
    // hunting for a syntax error in a working program (the lesson
    // assemble-route.js already paid for).
    assert.match(importer, /name === 'Pseudocode8086Error'/,
        'the handler does not distinguish a refusal from a failure');
    assert.match(importer, /run8086Refused/);
    assert.match(importer, /run8086Failed/);
});

// ── The emitter's own contract, where it is not observable on screen ─────

test('the generated assembly is a .COM the learner can read', () => {
    const creator = new SB3Creator();
    creator.parse(COUNTING);
    const {asm} = emitI8086Asm(creator.project, {source: COUNTING});
    assert.match(asm, /^ORG 100h$/m, 'not a .COM');
    assert.match(asm, /^END BW_MAIN$/m);
    // Every conditional jump in GENERATED code must hop exactly over one
    // near JMP. `i8086-asm.js` gives Jcc 8 bits of reach and REFUSES an
    // out-of-range one (longJumps is off in assemble-route.js), so a Jcc
    // aimed at the top of a loop body would assemble fine on every small
    // program and then fail to build on the first big one — the worst kind
    // of bug to ship, because nothing here would have caught it.
    //
    // The RUNTIME helpers below BW_EXIT are exempt and deliberately so: they
    // are fixed text of fixed length, they cannot grow with the program, and
    // every one of them is executed by the programs above.
    const body = asm.slice(asm.indexOf('BW_MAIN:'), asm.indexOf('\nBW_EXIT:'));
    let conditionals = 0;
    for (const line of body.split('\n')) {
        const m = line.match(/^\s+(J[A-Z]+)\s+(BW_\w+)/);
        if (!m || m[1] === 'JMP') continue;
        conditionals++;
        assert.match(m[2], /^BW_[KTBL]\d+$/,
            `${line.trim()} is a conditional jump at an arbitrary label; generated ` +
            `code must branch over a near JMP so it can never exceed Jcc's 127-byte reach`);
    }
    assert.ok(conditionals > 0,
        'no conditional jumps were scanned, so this check proved nothing');
});

test('the assembly names the learner\'s own variables, not BW_V0', () => {
    // The generated source is put in the ASM tab to be READ. A listing whose
    // every operand is BW_V3 teaches nothing about which variable it is.
    const creator = new SB3Creator();
    creator.parse(COUNTING);
    const {asm} = emitI8086Asm(creator.project, {source: COUNTING});
    assert.match(asm, /MOV \[BW_V_counter\], AX/,
        'the variable "counter" is not recognisable in the assembly it became');
    assert.match(asm, /BW_V_counter DW 0, 0\s+; the variable "counter"/);
});

test('the component leaves the generated assembly where it can be read', () => {
    assert.match(importer, /buffers: \{\.\.\.st\.buffers, asm: out\.asm\}/,
        'the assembly the blocks became is thrown away, so a learner cannot see it');
});

// ── TWO SCRIPTS, WHICH USED TO BE A REFUSAL ─────────────────────────────

test('two WHEN scripts interleave, on a clock that is POLLED', async () => {
    // This was refused, and the stated reason was that a cooperative
    // scheduler needs a clock that can be polled while "the clock on this
    // bench (INT 15h/86h) blocks". INT 15h does block -- but the 8254 does
    // not: counter 0 can be latched and read at any time, and the difference
    // between two readings is elapsed time. So the premise was wrong rather
    // than the conclusion being hard.
    const {screen, bench} = await runPseudocode(
        'DEVICE i8086\n'
        + 'WHEN flag clicked:\n  REPEAT 3:\n    print "a"\n    wait 0.01 secs\n'
        + 'WHEN flag clicked:\n  REPEAT 3:\n    print "b"\n    wait 0.01 secs\n');
    assert.ok(bench.terminated, 'both scripts finished and the program exited');
    assert.deepEqual(screen, ['a', 'b', 'a', 'b', 'a', 'b']);
});

test('the interleaving follows the CLOCK, not a round-robin', async () => {
    // The test that can tell a real scheduler from a turn-taking one. A
    // round-robin would give "f S f S f S f S"; honouring the requested
    // delays gives the fast script twice as many turns. If this ever reads
    // as strict alternation, the wake times have stopped being consulted.
    const {screen} = await runPseudocode(
        'DEVICE i8086\n'
        + 'WHEN flag clicked:\n  REPEAT 4:\n    print "f"\n    wait 0.01 secs\n'
        + 'WHEN flag clicked:\n  REPEAT 2:\n    print "S"\n    wait 0.02 secs\n');
    // The COUNTS are the property; the exact order at a tie (both scripts due
    // in the same instant) is a scan-order detail and pinning it made this
    // test fail when the timing was FIXED rather than when it broke.
    assert.equal(screen.filter(x => x === 'f').length, 4);
    assert.equal(screen.equals ? 0 : screen.filter(x => x === 'S').length, 2);
    assert.ok(!screen.every((x, i) => x === (i % 2 ? 'S' : 'f')),
        'strict f/S alternation would mean the wake times are not being consulted');
});

test('`stop this script` ends one task; `stop all` ends the program', async () => {
    // With one script these coincide, which is why the distinction never had
    // to exist before.
    const one = await runPseudocode(
        'DEVICE i8086\n'
        + 'WHEN flag clicked:\n  print "x"\n  stop this script\n  print "never"\n'
        + 'WHEN flag clicked:\n  REPEAT 2:\n    print "y"\n    wait 0.01 secs\n');
    assert.deepEqual(one.screen, ['x', 'y', 'y'], 'the other script ran on');

    const all = await runPseudocode(
        'DEVICE i8086\n'
        + 'WHEN flag clicked:\n  wait 0.05 secs\n  print "late"\n'
        + 'WHEN flag clicked:\n  print "first"\n  stop all\n');
    assert.deepEqual(all.screen, ['first'], 'the waiting script never woke');
});

test('a scheduled program says that it grew a scheduler', async () => {
    const {out} = await runPseudocode(
        'DEVICE i8086\n'
        + 'WHEN flag clicked:\n  print "a"\n'
        + 'WHEN flag clicked:\n  print "b"\n');
    assert.match(out.warnings.join(' '), /cooperative scheduler/);
    assert.match(out.warnings.join(' '), /polled rather than waited on/);
});

test('ONE script still takes the straight-line path', async () => {
    // No scheduler, no per-script stacks, no polled clock -- there is nothing
    // to schedule, and every existing program should keep paying nothing for
    // the feature it does not use.
    const {out} = await runPseudocode(
        'DEVICE i8086\nWHEN flag clicked:\n  print "solo"\n  wait 0.01 secs\n  print "done"\n');
    assert.ok(!/BW_YIELD/.test(out.asm), 'no dispatcher is emitted');
    assert.match(out.asm, /INT 15H/i, 'and `wait` is still the blocking BIOS call');
    assert.ok(out.bytes.length < 200, `still small (${out.bytes.length} bytes)`);
});

test('a scheduled `wait` waits the RIGHT length, not merely some length', async () => {
    // THE BUG THIS CATCHES, WHICH SHIPPED FOR AN HOUR. The scheduler first
    // assumed counter 0 ran at a PC's 1193182 Hz. On this bench it is fed the
    // CPU's cycle count instead, so it runs at clockHz -- and every wait came
    // out 4.19x short. Every interleaving test still passed, because they
    // compare ORDER and order was unaffected. Only absolute time showed it.
    const base = await runPseudocode(
        'DEVICE i8086\nWHEN flag clicked:\n  print "x"\nWHEN flag clicked:\n  print "y"\n');
    const short = await runPseudocode(
        'DEVICE i8086\nWHEN flag clicked:\n  wait 0.1 secs\n  print "x"\n'
        + 'WHEN flag clicked:\n  print "y"\n');
    const long = await runPseudocode(
        'DEVICE i8086\nWHEN flag clicked:\n  wait 0.3 secs\n  print "x"\n'
        + 'WHEN flag clicked:\n  print "y"\n');

    // The startup calibration costs two centisecond edges, so it is measured
    // once and subtracted rather than hidden in a loose tolerance.
    const overhead = base.tMs;
    assert.ok(overhead > 15 && overhead < 30, `calibration cost ${overhead} ms`);
    const waited = short.tMs - overhead;
    assert.ok(Math.abs(waited - 100) < 5, `0.1 secs waited ${waited.toFixed(1)} ms`);
    // And it SCALES -- a constant offset would satisfy the check above.
    const delta = long.tMs - short.tMs;
    assert.ok(Math.abs(delta - 200) < 5, `0.1s -> 0.3s moved ${delta.toFixed(1)} ms`);
});

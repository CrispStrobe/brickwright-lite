/**
 * The pseudocode a learner writes that nobody thought to test.
 *
 * `test/pseudocode-8086.test.mjs` drives real programs to a real screen, which
 * is the right shape — but every case in it was chosen by the person who wrote
 * the lowering, so it is evidence about the constructs its author imagined.
 * That is the same limit `bw-board/VERIFICATION.md` records for a corpus, and
 * a code generator is the worst case of it: the largest input space and the
 * smallest test surface, with no corpus of 525 pseudocode programs to fall
 * back on.
 *
 * So this file asks the question a census would ask if there were anything to
 * census: what does a LEARNER write? Empty and negative loop counts, a
 * variable read before it is set, a negative `change by` that crosses zero,
 * four levels of nesting, both arms of an IF reached in the same run, an
 * `and` whose first operand is false, and the boundary cases of REPEAT UNTIL.
 *
 * WHAT IT FOUND, so a reader knows what this file is worth: the control flow
 * is correct in every one of those, and the two defects below are in the
 * PARSER rather than the lowering. Reporting a clean result for the thing
 * probed is part of the point — a designed probe that finds nothing is
 * evidence, where no probe at all is not.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {INTEGRATED} from './helpers/bw-integrated.mjs';

const SB3Creator = (await import(path.join(INTEGRATED, 'src/lib/sb3-creator.js'))).default;
const {buildPseudocode8086} =
    await import('../overlay/scratch-gui/src/lib/bw-asm/pseudocode-8086.js');
const {createI8086DosBench} =
    await import('../overlay/scratch-gui/src/lib/bw-debug/i8086-dos-bench.js');

/** A build that reaches the network fails here rather than quietly passing. */
const forbiddenFetch = () => { throw new Error('the hosted route was reached'); };

/** Parse, lower, assemble, boot, and read the CGA text page — the whole path. */
async function run (source) {
    const creator = new SB3Creator();
    creator.parse(source);
    const out = await buildPseudocode8086(
        {project: creator.project, source}, {hostedFetch: forbiddenFetch});
    const bench = await createI8086DosBench({bytes: out.bytes, format: out.format});
    bench.target.run();
    let slices = 0;
    while (!bench.terminated && slices++ < 800) bench.target.runFor(5e6);
    return {screen: bench.screenText().filter(Boolean), terminated: bench.terminated, out};
}

/** The opcodes the PARSER produced, which is what separates "the lowering is
 *  wrong" from "the block never reached the lowering". */
function parsedOpcodes (source) {
    const creator = new SB3Creator();
    creator.parse(source);
    return [...new Set((JSON.stringify(creator.project).match(/"opcode":"[a-z_0-9]+"/g) || [])
        .map((s) => s.slice(10, -1)))];
}

const P = (body) => `DEVICE i8086\nGLOBAL n\nGLOBAL m\nWHEN flag clicked:\n${body}`;

// ---- what a learner writes ------------------------------------------------

const CASES = {
    // Loop counts a learner reaches by accident before reaching them on purpose.
    'REPEAT 0 runs the body zero times': [
        P('  set n to 7\n  REPEAT 0:\n    set n to 99\n  say n\n'), ['7']],
    'REPEAT with a negative count runs the body zero times': [
        P('  set n to 7\n  REPEAT -3:\n    set n to 99\n  say n\n'), ['7']],
    'REPEAT 1 runs the body exactly once': [
        P('  set n to 0\n  REPEAT 1:\n    change n by 1\n  say n\n'), ['1']],
    'REPEAT UNTIL whose condition is already true runs zero times': [
        P('  set n to 9\n  REPEAT UNTIL n > 2:\n    say 111\n  say n\n'), ['9']],

    // Variables before they exist, and arithmetic through zero.
    'a variable read before it is ever set reads as 0': [
        P('  say m\n'), ['0']],
    'change by, on a variable that was never set': [
        P('  change m by 4\n  say m\n'), ['4']],
    'change by a negative': [
        P('  set n to 5\n  change n by -3\n  say n\n'), ['2']],
    'change by a negative that crosses zero stays signed': [
        P('  set n to 1\n  change n by -4\n  say n\n'), ['-3']],

    // Nesting, which is where a lowering that reuses a register breaks.
    'four levels of nested REPEAT multiply': [
        P('  set n to 0\n  REPEAT 2:\n    REPEAT 2:\n      REPEAT 2:\n        REPEAT 2:\n'
          + '          change n by 1\n  say n\n'), ['16']],
    'IF inside REPEAT UNTIL inside REPEAT': [
        P('  set n to 0\n  REPEAT 2:\n    set m to 0\n    REPEAT UNTIL m > 1:\n'
          + '      change m by 1\n      IF m = 2 THEN:\n        change n by 1\n  say n\n'), ['2']],
    'nested IF inside IF': [
        P('  set n to 5\n  IF n > 1 THEN:\n    IF n > 4 THEN:\n      say 111\n'), ['111']],

    // Both arms of one IF reached in a single run — a lowering that emitted
    // both branches, or fell through, still "works" for a program that only
    // ever takes one of them.
    'IF/ELSE reaches the else arm twice and the then arm once': [
        P('  set n to 0\n  REPEAT 3:\n    change n by 1\n    IF n > 2 THEN:\n'
          + '      say 111\n    ELSE:\n      say 222\n'), ['222', '222', '111']],

    // Boolean operators with a false first operand, which is where a
    // short-circuit that jumps to the wrong label shows up.
    'and with a false first operand takes the else arm': [
        P('  set n to 5\n  IF (n > 9) and (n < 10) THEN:\n    say 111\n  ELSE:\n    say 222\n'),
        ['222']],
    'or with a false first operand still takes the then arm': [
        P('  set n to 5\n  IF (n > 9) or (n = 5) THEN:\n    say 111\n'), ['111']],
    'not of a comparison': [
        P('  set n to 5\n  IF not (n > 9) THEN:\n    say 111\n'), ['111']],

    // The arithmetic edge the module header promises.
    'mod by zero is zero rather than a fault': [
        P('  set n to (7 mod 0)\n  say n\n'), ['0']],
};

for (const [name, [source, want]] of Object.entries(CASES)) {
    test(`learner probe: ${name}`, async () => {
        const r = await run(source);
        assert.ok(r.terminated, 'the program did not finish inside the slice budget');
        assert.deepEqual(r.screen.slice(0, want.length), want,
            `screen was ${JSON.stringify(r.screen)}`);
    });
}

// ---- two defects these probes found, both in the PARSER --------------------

test('KNOWN DEFECT: `IF cond:` without THEN silently deletes the whole branch', async () => {
    // THE WORST SHAPE A DEFECT CAN HAVE, and a learner is the one who pays.
    // Omitting THEN is a plausible typo — every other block here ends in a
    // bare colon. The parser does not produce a control_if, does not produce
    // the condition, and DROPS THE BODY. The program then builds clean, runs,
    // emits no warning, and prints plausible output with a branch missing.
    //
    // This is the parser (sb3-creator), not the 8086 lowering: the opcode
    // never reaches the back end, so the back end cannot refuse it. Recorded
    // here because this is the file that found it.
    const withThen = 'DEVICE i8086\nGLOBAL n\nWHEN flag clicked:\n  set n to 1\n'
        + '  IF n = 1 THEN:\n    say 111\n  say 222\n';
    const without = withThen.replace('IF n = 1 THEN:', 'IF n = 1:');

    assert.ok(parsedOpcodes(withThen).includes('control_if'), 'the correct form must parse');
    const good = await run(withThen);
    assert.deepEqual(good.screen, ['111', '222']);

    // PINNED AS IT STANDS. When the parser learns to refuse this, the first
    // assertion goes RED and this test should become: the build REFUSES, or
    // warns by name. Either is an improvement; silence is not.
    assert.ok(!parsedOpcodes(without).includes('control_if'),
        'if this now parses, the defect is fixed — assert the corrected behaviour instead');
    const bad = await run(without);
    assert.deepEqual(bad.screen, ['222'],
        'the branch is silently gone: 111 never printed');
    assert.deepEqual(bad.out.warnings, [],
        'and nothing warned — which is what makes it dangerous rather than merely wrong');
});

test('KNOWN DEFECT: a variable named x or y loses to the motion block', async () => {
    // `GLOBAL x` then `set x to 5` parses as motion_setx, not as an
    // assignment, even though the variable was declared on the line above.
    // The 8086 back end then refuses by name — so this one FAILS LOUDLY,
    // which is why it is the lesser of the two. The refusal talks about a
    // motion block the learner never wrote, which is the part worth fixing.
    for (const [name, opcode] of [['x', 'motion_setx'], ['y', 'motion_sety']]) {
        const src = `DEVICE i8086\nGLOBAL ${name}\nWHEN flag clicked:\n`
            + `  set ${name} to 5\n  say ${name}\n`;
        assert.ok(parsedOpcodes(src).includes(opcode),
            `if ${name} no longer parses as ${opcode}, the defect is fixed`);
        await assert.rejects(() => run(src), /not supported/,
            'at least it refuses rather than silently doing something else');
    }
    // A name one character longer is fine, which is what makes the collision
    // surprising rather than a general naming rule.
    assert.ok(parsedOpcodes('DEVICE i8086\nGLOBAL xs\nWHEN flag clicked:\n  set xs to 5\n')
        .includes('data_setvariableto'));
});

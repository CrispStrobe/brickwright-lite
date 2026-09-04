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
    // parseWarnings MIRRORS THE PRODUCTION CALLER (pseudocode-importer.jsx).
    // It did not, and that is why the trigger below could not fire: the
    // harness reproduced the old call shape, in which the parser's warnings
    // were dropped between parse and build, so `out.warnings` was empty here
    // for the same reason it was empty in the app.
    const out = await buildPseudocode8086(
        {project: creator.project, source, parseWarnings: creator.warnings},
        {hostedFetch: forbiddenFetch});
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

test('`IF cond:` without THEN drops the branch — but no longer in silence', async () => {
    // WAS "silently deletes the whole branch", and the silence is fixed. The
    // deletion is not, and the two halves deserve separating because only one
    // of them was ever the dangerous part.
    //
    // Omitting THEN is a plausible typo: every other block here ends in a bare
    // colon. The parser still produces no control_if, no condition and no
    // body — that is a LANGUAGE decision, not a bug, and whether `IF cond:`
    // should be accepted belongs to whoever owns the syntax.
    //
    // What WAS a bug is that the learner was never told. The parser diagnoses
    // this precisely and always did; its warnings were being dropped between
    // `creator.parse()` and `buildPseudocode8086()`, because the caller passed
    // `creator.project` and not `creator.warnings`. Three sources of warnings
    // existed, the build enumerated two, and the comment there said "both are
    // shown; neither is silent" — which was true of the two it knew about.
    //
    // A second defect hid inside the first: `i8086` was not a registered
    // device, so every 8086 program also warned `Unknown DEVICE "i8086"` on
    // line 1. Surfacing warnings without registering the device would have put
    // a spurious warning on every correct program, which is how a fix becomes
    // noise. Both are fixed together.
    const withThen = 'DEVICE i8086\nGLOBAL n\nWHEN flag clicked:\n  set n to 1\n'
        + '  IF n = 1 THEN:\n    say 111\n  say 222\n';
    const without = withThen.replace('IF n = 1 THEN:', 'IF n = 1:');

    assert.ok(parsedOpcodes(withThen).includes('control_if'), 'the correct form must parse');
    const good = await run(withThen);
    assert.deepEqual(good.screen, ['111', '222']);

    // A CORRECT PROGRAM WARNS ABOUT NOTHING. This is the assertion that stops
    // the fix from becoming noise: if `i8086` ever falls out of the device
    // table again, every program starts shouting and this goes red first.
    assert.deepEqual(good.out.warnings, [], 'the correct form is clean');

    // STILL PINNED: the branch is dropped. If the parser ever learns to accept
    // a bare colon, this goes red and the test should assert the branch RUNS.
    assert.ok(!parsedOpcodes(without).includes('control_if'),
        'if this now parses, the language decision was made — assert 111 prints instead');
    const bad = await run(without);
    assert.deepEqual(bad.screen, ['222'], 'the branch is still gone: 111 never printed');

    // NO LONGER SILENT, and this is the half that was worth fixing. The
    // learner is told the line, the problem, and the correction.
    assert.ok(bad.out.warnings.length > 0, 'the build now reports what the parser found');
    assert.ok(bad.out.warnings.some((w) => /Malformed IF/.test(w) && /THEN/.test(w)),
        `a warning must name the fix, got: ${JSON.stringify(bad.out.warnings)}`);
    assert.ok(bad.out.warnings.some((w) => /unexpected indentation/i.test(w)),
        'and the orphaned body is reported too, so the dropped lines are visible');
    assert.ok(bad.out.warnings.every((w) => /^Line \d+:/.test(w)),
        'every warning carries a line number — a diagnostic without one is a riddle');
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

// ---------------------------------------------------------------------------
// A SECOND ROUND, asking what the warnings are WORTH.
//
// The first round found that the parser's diagnoses never reached the learner.
// Once they did, nothing checked they were any good — so this round feeds the
// parser a learner's plausible typos and asks which produce a warning that
// names the line and the fix, and which produce SILENCE.
//
// Twelve were tried. Ten already warned well. Two did not, and both are the
// same shape as the defect that started this: a program that builds, runs, and
// does something other than what it looks like, with nothing said.
// ---------------------------------------------------------------------------

const warnsOf = (source) => { const c = new SB3Creator(); c.parse(source); return c.warnings; };
const HDR = 'DEVICE i8086\nGLOBAL n\nWHEN flag clicked:\n  set n to 0\n';

test('an UNDER-INDENTED body is reported — it used to be silent', async () => {
    // The commonest beginner error there is. The body is at the same indent as
    // the IF, so it is not the body: the parser builds an EMPTY control_if and
    // an UNCONDITIONAL say. The learner sees 111 print when their condition is
    // false and concludes they cannot read their own program.
    const bad = HDR + '  IF n = 1 THEN:\n  say 111\n';
    const good = HDR + '  IF n = 1 THEN:\n    say 111\n';

    assert.deepEqual(warnsOf(good), [], 'the correct form stays clean');
    const w = warnsOf(bad);
    assert.ok(w.length > 0, 'the under-indented form must not be silent');
    assert.ok(w.some((x) => /Empty body/.test(x) && /indent/.test(x)),
        `the warning must name the fix, got: ${JSON.stringify(w)}`);
    assert.ok(w.every((x) => /^Line \d+:/.test(x)), 'with a line number');

    // AND THE BEHAVIOUR IT WARNS ABOUT IS REAL: n is 0, the condition is
    // false, and 111 prints anyway because it was never inside the IF.
    const ran = await run(bad);
    assert.deepEqual(ran.screen, ['111'],
        'the say is unconditional — which is exactly what the warning now says');
});

test('a deliberately empty block is reported too, and that is intended', () => {
    // The parser cannot tell "I meant it to be empty" from "my indentation is
    // wrong", a body-less control block is dead code either way, and this is a
    // WARNING rather than a refusal. Pinned so the choice is visible: if it is
    // ever made smarter, this is the test that says what it used to do.
    assert.ok(warnsOf(HDR + '  IF n = 1 THEN:\n').some((w) => /Empty body/.test(w)));
    assert.ok(warnsOf(HDR + '  REPEAT 3:\n').some((w) => /Empty body/.test(w)));
});

test('the plausible typos that already warned well — regression cover', () => {
    // Ten of twelve probed cases were already diagnosed properly. Reporting
    // that is part of the point: a designed probe that finds nothing is
    // evidence, where no probe is not. Pinned so they stay diagnosed.
    const cases = [
        ['  REPEAT 3\n    say 111\n', /Unknown command/],
        ['  ELSE:\n    say 111\n', /ELSE block without matching IF/],
        ['  say\n', /Unknown command/],
        ['  set n to\n', /Unknown command/],
        ['  wiggle 5\n', /Unknown command/],
        ['  REPEAT UNTIL n = 3\n    change n by 1\n', /Unknown command/],
    ];
    for (const [body, re] of cases) {
        const w = warnsOf(HDR + body);
        assert.ok(w.some((x) => re.test(x)), `${JSON.stringify(body)} -> ${JSON.stringify(w)}`);
    }
});

test('KNOWN DEFECT: `IF n = THEN:` builds a nonsense condition in silence', () => {
    // The second silent case, NOT fixed and pinned as it stands.
    //
    // The IF regex matches with a condition of `n =`, and parseCondition falls
    // back to the bare-value path: OPERAND1 becomes the literal STRING "n ="
    // and OPERAND2 the literal "true". So the branch compares two pieces of
    // text and is permanently false. No warning.
    //
    // Not fixed here because the fallback is legitimate — a bare value IS a
    // valid condition in this language — so the fix is a judgement about when
    // an operand is missing rather than merely unusual, and that belongs with
    // the syntax rather than with the person passing through. When somebody
    // makes it, this goes RED and should assert the warning instead.
    const w = warnsOf(HDR + '  IF n = THEN:\n    say 111\n');
    assert.deepEqual(w, [],
        'if this now warns, the defect is fixed — assert the warning instead of the silence');
});

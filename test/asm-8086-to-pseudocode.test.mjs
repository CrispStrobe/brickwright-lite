/**
 * The ASM reader (plan task L1): 8086 assembly the ▶ button lowered reads
 * back into the dialect and re-lowers to the SAME assembly.
 *
 * Round trip, not resemblance: for each program, pseudocode → asm A → lift →
 * pseudocode' → asm B, and A must equal B byte for byte. The emitter numbers
 * its labels deterministically, so identical assembly means identical AST.
 *
 * The other half of the doctrine is counted refusal: hand-written assembly is
 * refused as foreign with the reason, the scheduler form is refused by name
 * with its script count, and an anchor the lifter does not handle yet names
 * itself. The census at the end prints, for every anchor the emitter can
 * write, whether this reader lifts it — so the gap is a number, not a mood.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import {INTEGRATED} from './helpers/bw-integrated.mjs';
import {emitI8086Asm, SUPPORTED} from '../overlay/scratch-gui/src/lib/bw-asm/pseudocode-8086.js';
import asm8086ToPseudocode, {renderExpr} from '../overlay/scratch-gui/src/lib/bw-asm/asm-8086-to-pseudocode.js';
import I8086_ASM_EXAMPLES from '../overlay/scratch-gui/src/lib/bw-asm/examples-i8086.js';

const SB3Creator = (await import(path.join(INTEGRATED, 'src/lib/sb3-creator.js'))).default;

const lower = source => {
    const creator = new SB3Creator();
    creator.parse(source);
    const out = emitI8086Asm(creator.project, {source});
    return typeof out === 'string' ? out : out.asm;
};

const CORPUS = {
    counting: `DEVICE i8086
GLOBAL counter
GLOBAL total
WHEN flag clicked:
  set counter to 0
  set total to 5
  REPEAT 10:
    change counter by 1
    IF counter > 5 THEN:
      say counter
    ELSE:
      say "small"
    wait 0.5 secs
  REPEAT UNTIL counter = 20:
    change counter by 1
  say total * 2 + 1
`,
    operators: `DEVICE i8086
GLOBAL a
GLOBAL b
WHEN flag clicked:
  set a to 17 / 3
  set b to a mod 4
  IF a < b and not b = 2 or a > 1 THEN:
    print a
  wait until a = 5
  FOREVER:
    say "hi there"
    change a by 0 - 1
    stop all
`,
    nested: `DEVICE i8086
GLOBAL i
GLOBAL j
WHEN flag clicked:
  set i to 0
  REPEAT 3:
    set j to 0
    REPEAT UNTIL j > 2:
      IF i = j THEN:
        say i * 10 + j
      change j by 1
    change i by 1
  wait 2 secs
  say "done"
`,
    quoted: `DEVICE i8086
GLOBAL n
WHEN flag clicked:
  say "she said \\"hi\\" and left"
  set n to 3
  say "plain"
`,
    negative: `DEVICE i8086
GLOBAL n
WHEN flag clicked:
  set n to 0 - 70000
  say n
  say n - 1
`
};

for (const [name, source] of Object.entries(CORPUS)) {
    test(`round trip: ${name} lifts and re-lowers to identical assembly`, () => {
        const A = lower(source);
        const r = asm8086ToPseudocode(A);
        assert.ok(r.ok, r.ok ? '' : r.error.message);
        assert.equal(r.stats.refused, 0);
        const B = lower(r.pseudocode);
        assert.equal(B, A, `${name}: the lifted program re-lowers differently`);
        assert.ok(r.stats.lifted >= 3, `${name}: only ${r.stats.lifted} statements lifted`);
    });
}

test('the lifted text is the dialect a learner wrote, not a register dump', () => {
    const r = asm8086ToPseudocode(lower(CORPUS.counting));
    assert.match(r.pseudocode, /^DEVICE i8086\nGLOBAL counter\nGLOBAL total\nWHEN flag clicked:\n/);
    assert.match(r.pseudocode, /\n  REPEAT 10:\n    change counter by 1\n    IF counter > 5 THEN:\n      say counter\n    ELSE:\n      say "small"\n/);
    assert.doesNotMatch(r.pseudocode, /\b(AX|DX|BW_V_|PUSH|POP)\b/);
});

test('hand-written assembly is refused as foreign, with the reason, not lifted as noise', () => {
    let foreign = 0;
    for (const ex of I8086_ASM_EXAMPLES) {
        const r = asm8086ToPseudocode(ex.source);
        assert.equal(r.ok, false, `${ex.id}: a stranger's program was "lifted"`);
        assert.equal(r.error.kind, 'foreign', `${ex.id}: refused for the wrong reason: ${r.error.message}`);
        assert.match(r.error.message, /no Brickwright anchors/);
        assert.equal(r.stats.refused, 1);
        foreign++;
    }
    assert.ok(foreign >= 10, `only ${foreign} hand-written programs in the fixture set`);
});

test('two WHEN scripts are the scheduler form, refused by name with the count', () => {
    const A = lower(`DEVICE i8086
GLOBAL a
WHEN flag clicked:
  set a to 1
WHEN flag clicked:
  say a
`);
    const r = asm8086ToPseudocode(A);
    assert.equal(r.ok, false);
    assert.equal(r.error.kind, 'refused');
    assert.match(r.error.message, /scheduler form \(2 WHEN scripts\)/);
});

test('an anchor the reader does not handle names the feature and is counted', () => {
    // Pins: the emitter writes an 8255 setup comment before the first `; pin`,
    // so the refusal must name pins, not quote the prose.
    const A = lower(`DEVICE i8086
PIN led = P1.0 OUTPUT
WHEN flag clicked:
  turn on led
  toggle led
  say "pin"
`);
    const r = asm8086ToPseudocode(A);
    assert.equal(r.ok, false);
    assert.equal(r.error.kind, 'refused');
    assert.match(r.error.message, /"pin" statement is not lifted yet/);
    assert.equal(r.stats.refused, 1);
    // and the one anchor the dialect can carry in a plain script
    const B = lower('DEVICE i8086\nGLOBAL a\nWHEN flag clicked:\n  set a to 1\n  say "x" for 1 seconds\n');
    const rb = asm8086ToPseudocode(B);
    assert.equal(rb.ok, false);
    assert.match(rb.error.message, /"say for secs" statement is not lifted yet/);
    assert.equal(rb.stats.lifted, 1, 'the statement before the refusal was lifted and counted');
});

test('a corrupted shape is a named shape refusal at its line, never a silent guess', () => {
    const A = lower(CORPUS.counting);
    // Turn the ">" comparison into something the emitter never writes.
    const broken = A.replace('    CMP BX, AX\n    JB BW_T6', '    CMP BX, AX\n    JA BW_T6');
    assert.notEqual(broken, A, 'the fixture no longer contains the shape this test corrupts');
    const r = asm8086ToPseudocode(broken);
    assert.equal(r.ok, false);
    assert.match(r.error.message, /^line \d+: expected JB/);
});

test('renderExpr parenthesises only where the tree needs it', () => {
    const v = n => ({type: 'var', name: n});
    const bin = (op, a, b) => ({type: 'bin', op, a, b});
    assert.equal(renderExpr(bin('+', bin('*', v('a'), v('b')), v('c'))), 'a * b + c');
    assert.equal(renderExpr(bin('*', bin('+', v('a'), v('b')), v('c'))), '(a + b) * c');
    assert.equal(renderExpr(bin('-', v('a'), bin('-', v('b'), v('c')))), 'a - (b - c)');
    assert.equal(renderExpr({type: 'not', a: bin('=', v('a'), v('b'))}), 'not (a = b)');
    assert.equal(renderExpr({type: 'str', value: 'x'}), '"x"');
    assert.equal(renderExpr({type: 'str', value: 'a \\"b\\" c'}), '"a \\"b\\" c"', 'source escapes pass through untouched');
});

test('census: which of the emitter\'s anchors this reader lifts (printed, and the lifted set may only grow)', () => {
    // One program per SUPPORTED opcode where a single-script program can carry it.
    const probes = {
        data_setvariableto: 'set a to 1', data_changevariableby: 'change a by 1',
        control_repeat: 'REPEAT 2:\n    say a', control_forever: 'FOREVER:\n    say a',
        control_if: 'IF a = 1 THEN:\n    say a', control_if_else: 'IF a = 1 THEN:\n    say a\n  ELSE:\n    say a',
        control_repeat_until: 'REPEAT UNTIL a = 1:\n    change a by 1', control_wait: 'wait 1 secs',
        control_stop: 'stop all', looks_say: 'say a', stc12_print: 'print a',
        operator_add: 'say a + 1', operator_subtract: 'say a - 1', operator_multiply: 'say a * 2',
        operator_divide: 'say a / 2', operator_mod: 'say a mod 2', operator_lt: 'say a < 2',
        operator_gt: 'say a > 2', operator_equals: 'say a = 2', operator_and: 'say a = 1 and a = 2',
        operator_or: 'say a = 1 or a = 2', operator_not: 'say not a = 1',
        control_wait_until: 'wait until a = 1', event_broadcast: 'broadcast "x"',
        looks_sayforsecs: 'say "x" for 1 seconds'
    };
    const lifted = [];
    const refused = [];
    const unprobed = [];
    for (const opcode of Object.keys(SUPPORTED)) {
        if (!probes[opcode]) { unprobed.push(opcode); continue; }
        let A;
        try {
            A = lower(`DEVICE i8086\nGLOBAL a\nWHEN flag clicked:\n  set a to 0\n  ${probes[opcode]}\n`);
        } catch (e) {
            unprobed.push(`${opcode} (emitter refused: ${String(e.message).slice(0, 60)})`);
            continue;
        }
        const r = asm8086ToPseudocode(A);
        (r.ok && lower(r.pseudocode) === A ? lifted : refused).push(opcode);
    }
    console.log(`# L1 census: lifted ${lifted.length}, refused ${refused.length}, unprobed ${unprobed.length} of ${Object.keys(SUPPORTED).length} anchors`);
    console.log(`#   refused: ${refused.join(', ') || 'none'}`);
    console.log(`#   unprobed: ${unprobed.join(', ') || 'none'}`);
    const MUST_LIFT = ['data_setvariableto', 'data_changevariableby', 'control_repeat', 'control_forever', 'control_if',
        'control_if_else', 'control_repeat_until', 'control_wait', 'control_stop', 'looks_say', 'stc12_print',
        'operator_add', 'operator_subtract', 'operator_multiply', 'operator_divide', 'operator_mod',
        'operator_lt', 'operator_gt', 'operator_equals', 'operator_and', 'operator_or', 'operator_not',
        'control_wait_until'];
    for (const op of MUST_LIFT) assert.ok(lifted.includes(op), `${op} used to lift and no longer does`);
});

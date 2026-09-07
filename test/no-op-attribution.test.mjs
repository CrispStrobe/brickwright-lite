// The no-op clause of the attribution rule, pinned at its boundary.
//
// A driver branch whose emitted function does nothing (only `(void)param`
// casts) is a REFUSAL, not an implementation — that is how tone stops counting
// as a 3-family verb (its 8051 branch is a "not yet implemented" stub and its
// arm branch a `(void)freq` no-op). The danger is over-reach: a real minimal
// body — a getter that RETURNS a value — must stay an implementation. This test
// fixes that boundary so a change to the rule that swallows getters goes red.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { noOp, stubbed8051, deriveVerbFamilies } from '../scripts/gen-part-profiles.mjs';

// noOp() takes the JS text of a branch's consequent (the `{ out.push(...) }`).
// The emitted C lines are single-quoted literals, exactly as the emitter writes
// them (noOp reads single-quote/backtick literals, not JSON double-quotes).
const branch = (...cLines) => `{ out.push(${cLines.map((l) => `'${l}'`).join(', ')}); }`;

test('a (void)param-only function body is a no-op (a refusal)', () => {
    assert.equal(noOp(branch('static void tone_set(unsigned int freq)', '{', '    (void)freq;', '}')), true);
    assert.equal(noOp(branch('static void tone_set(unsigned int freq) { (void)freq; }')), true, 'one-liner no-op');
    assert.equal(noOp(branch('static void x(int a, int b) { (void)a; (void)b; }')), true, 'multiple (void) casts');
});

test('a getter that returns a value is NOT a no-op (it is a real implementation)', () => {
    // The mutation guard: this is exactly the body the rule must NOT swallow.
    assert.equal(noOp(branch('static int bw_motor_get_speed(int motor) { (void)motor; return _motor_speed; }')), false);
    assert.equal(noOp(branch('static int bar_get(int x)', '{', '    (void)x;', '    return _bar;', '}')), false);
    // and a body that actually drives hardware is obviously not a no-op
    assert.equal(noOp(branch('static void y(int a) { (void)a; PORTB |= 1; }')), false);
});

test('a co-gate that emits no function (a collision/setup block) is neither', () => {
    // stubbed8051 must ignore blocks that name a verb + core but push no driver.
    assert.equal(noOp(branch('/* P1.3 clash */', 'collision(msg);')), false,
        'a block with no static function is not classified a no-op');
});

test('stubbed8051 flags a verb with a stub 8051 branch, not one with a real one', () => {
    const src = [
        "if (this._cUses.foo && this._core === '8051') {",
        "  out.push('static void foo_set(int x) { (void)x; }', '');",   // stub
        "}",
        "if (this._cUses.bar && this._core === '8051') {",
        "  out.push('static int bar_get(int x) { (void)x; return _bar; }', '');",  // real getter
        "}",
        // a collision-style co-gate that emits no driver — must be ignored
        "if (this._core === '8051' && this._cUses.baz && !chip.pca) {",
        "  collision('baz clashes');",
        "}",
    ].join('\n');
    const s = stubbed8051(src);
    assert.ok(s.has('foo'), 'foo has only a stub 8051 branch — it must be flagged');
    assert.ok(!s.has('bar'), 'bar has a real (value-returning) 8051 branch — it must NOT be flagged');
    assert.ok(!s.has('baz'), 'baz co-gates a core but emits no driver — it must NOT be flagged');
});

test('the real emitter: tone is the only 8051 base-dialect exception, and it is avr-only', async () => {
    const { readFileSync } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    const { join, dirname } = await import('node:path');
    const EMITTER = join(dirname(fileURLToPath(import.meta.url)), '..',
        'overlay/scratch-gui/src/lib/sb3-creator.js');
    const src = readFileSync(EMITTER, 'utf8');
    assert.deepEqual([...stubbed8051(src)].sort(), ['tone']);
    assert.deepEqual(deriveVerbFamilies(src).tone, ['avr']);
});

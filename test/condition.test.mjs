// Unit tests for the pause-point condition parser.
//
// This file exists because `condition.js` is the one place in the debugger
// where a wrong answer is INVISIBLE. A misparsed condition does not throw and
// does not draw anything red — the pause point simply never fires, and the
// user concludes that breakpoints are broken. Every test below is a way that
// could happen.
//
// Run: npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCondition } from '../overlay/scratch-gui/src/lib/bw-debug/condition.js';

const ok = (src) => {
    const c = parseCondition(src);
    assert.ok(!c.error, `expected "${src}" to parse, got: ${c.error}`);
    return c;
};
const rejected = (src) => {
    const c = parseCondition(src);
    assert.ok(c.error, `expected "${src}" to be REJECTED, but it parsed`);
    return c.error;
};

// ── the grammar ──────────────────────────────────────────────────────────

test('compares a variable against a number', () => {
    const c = ok('counter > 10');
    assert.equal(c.test({counter: 11}), true);
    assert.equal(c.test({counter: 10}), false);
    assert.deepEqual(c.names, ['counter']);
});

test('two-character operators are not read as one character plus junk', () => {
    // The bug this guards: OP_ORDER scanning '>' before '>=' would split
    // "counter >= 10" into left="counter", right="= 10", and reject it — or
    // worse, parse it as > and be quietly off by one at the boundary.
    assert.equal(ok('counter >= 10').test({counter: 10}), true);
    assert.equal(ok('counter <= 10').test({counter: 10}), true);
    assert.equal(ok('counter != 10').test({counter: 10}), false);
    assert.equal(ok('counter <> 10').test({counter: 11}), true);
    assert.equal(ok('counter == 10').test({counter: 10}), true);
});

test('= means equals, because that is what a Scratch user writes', () => {
    assert.equal(ok('counter = 10').test({counter: 10}), true);
    assert.equal(ok('counter = 10').test({counter: 11}), false);
});

test('operands may be either way round', () => {
    assert.equal(ok('10 < counter').test({counter: 11}), true);
    assert.equal(ok('10 > counter').test({counter: 11}), false);
});

test('whitespace is optional', () => {
    assert.equal(ok('counter>10').test({counter: 11}), true);
});

test('negative numbers', () => {
    assert.equal(ok('counter > -5').test({counter: -1}), true);
    assert.equal(ok('counter < -5').test({counter: -1}), false);
});

test('decimals are accepted even though variables are integers', () => {
    // A 16-bit int can never equal 1.5, but `speed > 1.5` is perfectly
    // meaningful and a user will write it. Rejecting it taught nothing.
    assert.equal(ok('speed > 1.5').test({speed: 2}), true);
    assert.equal(ok('speed > 1.5').test({speed: 1}), false);
});

test('variable names may contain spaces, as Scratch allows', () => {
    const c = ok('my counter > 3');
    assert.deepEqual(c.names, ['my counter']);
    assert.equal(c.test({'my counter': 4}), true);
});

// ── and / or ─────────────────────────────────────────────────────────────

test('and / or combine comparisons', () => {
    assert.equal(ok('a > 1 and b > 1').test({a: 2, b: 2}), true);
    assert.equal(ok('a > 1 and b > 1').test({a: 2, b: 0}), false);
    assert.equal(ok('a > 1 or b > 1').test({a: 0, b: 2}), true);
    assert.equal(ok('a > 1 or b > 1').test({a: 0, b: 0}), false);
});

test('AND / Or are case-insensitive', () => {
    assert.equal(ok('a > 1 AND b > 1').test({a: 2, b: 2}), true);
    assert.equal(ok('a > 1 Or b > 1').test({a: 2, b: 0}), true);
});

test('a variable whose name merely contains "and" is not split', () => {
    // "band level" must not become "b" ... "level".
    const c = ok('band level > 3');
    assert.deepEqual(c.names, ['band level']);
    assert.equal(c.test({'band level': 4}), true);
});

test('both names of a two-variable comparison are reported', () => {
    assert.deepEqual(ok('a > b').names, ['a', 'b']);
});

// ── what it must refuse ──────────────────────────────────────────────────

test('an unparseable condition is REJECTED, never silently true or false', () => {
    // This is the whole safety property. A condition that cannot be understood
    // must produce a reason the UI can show. Treating it as true pauses every
    // time; treating it as false looks like a broken breakpoint.
    for (const bad of [
        '',
        '   ',
        'counter',              // no comparison
        '> 10',                 // no left operand
        'counter * 2 > limit',  // arithmetic is out of the grammar
        '(a > 1) and (b > 1)',  // parentheses are out of the grammar
        'max(a, b) > 1'         // function calls are out of the grammar
    ]) {
        const why = rejected(bad);
        assert.equal(typeof why, 'string');
        assert.ok(why.length > 0, `"${bad}" was rejected with an empty reason`);
    }
});

test('it is a parser, not eval — code in a condition does not run', () => {
    // A project file is untrusted input in an editor whose point is that
    // children open each other's projects. If this ever regresses to
    // `new Function`, these become live code with full page access.
    globalThis.__pwned = false;
    for (const attack of [
        'globalThis.__pwned = true',
        '1 > 0; globalThis.__pwned = true',
        'a > 1 || (globalThis.__pwned = true)',
        '${globalThis.__pwned = true}',
        'constructor.constructor("globalThis.__pwned=true")()'
    ]) {
        const c = parseCondition(attack);
        if (!c.error) c.test({a: 5});   // even if it parses, it must not execute
        assert.equal(globalThis.__pwned, false, `"${attack}" executed code`);
    }
});

// ── unknown variables ────────────────────────────────────────────────────

test('an unknown name makes the comparison false rather than throwing', () => {
    const c = ok('ghost > 1');
    assert.doesNotThrow(() => c.test({}));
    assert.equal(c.test({}), false);
});

test('a non-numeric variable value is false, not NaN-compared', () => {
    const c = ok('label > 1');
    assert.equal(c.test({label: 'hello'}), false);
    assert.equal(c.test({label: undefined}), false);
    assert.equal(c.test({label: null}), false);
});

test('names are exposed so the UI can warn about a typo', () => {
    // The parser deliberately cannot tell a typo from a not-yet-created
    // variable, so it reports the names and lets the caller decide. If this
    // ever stops being populated, the "no variable named X" warning in
    // debug-runner.js goes silently dead — which is the failure mode that
    // makes a pause point never fire with nothing on screen to explain it.
    assert.deepEqual(ok('counter > limit').names, ['counter', 'limit']);
    assert.deepEqual(ok('a > 1 and b > 2').names, ['a', 'b']);
});

test('source is preserved verbatim for round-tripping into the project file', () => {
    assert.equal(ok('  counter > 10  ').source, 'counter > 10');
});

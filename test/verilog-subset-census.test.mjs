// THE CENSUS SAYS ZERO, SO THE DETECTOR HAS TO BE SHOWN ALIVE.
//
// scripts/measure-verilog-subset.mjs answers the question
// docs/PSEUDOCODE-TO-VERILOG.md left open — "how much pseudocode is actually in
// the [combinational] subset?" — and its headline number is 0 of 282. A zero is
// the one result that is indistinguishable from a broken scan, so this file
// exists to make the difference visible: fixtures that MUST count, fixtures
// that MUST NOT, and the reasons named.
//
// The corpus number itself is deliberately NOT asserted. It is a fact about
// example programs, which are allowed to change; pinning it would turn an
// ordinary corpus edit into a red build. It is reported as a diagnostic.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync, existsSync} from 'node:fs';
import path from 'node:path';
import {analyse, parsePins, codeOf} from '../scripts/measure-verilog-subset.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const EXAMPLES = path.join(ROOT, 'overlay/scratch-gui/examples');

// A program that IS in the subset: two 1-bit inputs, one output, no time, no
// state, no analog. If the scan cannot see this, its zero means nothing.
const IN_SUBSET = `DEVICE STC12C5A60S2
CLOCK 11059200
PIN a = P1.0 INPUT
PIN b = P1.1 INPUT
PIN y = P1.2 OUTPUT

# y is a AND b — this is a gate, and nothing here is a program
WHEN flag clicked:
  IF a AND b THEN:
    turn on y
`;

test('THE LIVENESS TEST: a program in the subset is counted', () => {
    const r = analyse(IN_SUBSET);
    assert.equal(r.hasAnyBoolean, true, 'the AND was not seen at all');
    assert.equal(r.hasSubsetExpression, true,
        'a boolean over two 1-bit INPUT pins must count — if this fails, the corpus zero is meaningless');
    assert.deepEqual(r.blockers, [], `nothing here is time or state, got: ${r.blockers.join(', ')}`);
    assert.equal(r.wholeProgramCombinational, true);
    assert.equal(r.oneBitIn, 2);
});

test('each disqualifier is detected, by name', () => {
    const cases = [
        ['wait 0.5 seconds', 'wait (time)'],
        ['  FOREVER:', 'FOREVER (loop)'],
        ['  REPEAT 4:', 'REPEAT (loop)'],
        ['  set count to 1', 'set (variable state)'],
        ['  change count by 1', 'change (variable state)']
    ];
    for (const [line, why] of cases) {
        const r = analyse(`${IN_SUBSET}\n${line}\n`);
        assert.ok(r.blockers.includes(why), `"${line}" should be blocked as "${why}", got: ${r.blockers.join(', ')}`);
        assert.equal(r.wholeProgramCombinational, false, `"${line}" must take the program out of the subset`);
    }
});

test('an ANALOG pin disqualifies: it is not a 1-bit input', () => {
    const r = analyse(IN_SUBSET.replace('PIN b = P1.1 INPUT', 'PIN b = P1.1 ANALOG'));
    assert.ok(r.blockers.includes('analog/PWM pin'));
    assert.equal(r.hasSubsetExpression, false, 'a boolean touching an analog pin is not in the subset');
});

test('a boolean over VARIABLES is not a boolean over 1-bit inputs', () => {
    // This is the shape every real hit in the corpus has: comparisons on
    // multi-bit program variables. Counting it would inflate the census into
    // saying a subtab has something to show when it has not.
    const r = analyse(`DEVICE STC12C5A60S2
PIN k = P1.0 INPUT
PIN y = P1.2 OUTPUT
WHEN flag clicked:
  IF hit >= 0 AND key < 0 THEN:
    turn on y
`);
    assert.equal(r.hasAnyBoolean, true, 'the AND is there');
    assert.equal(r.hasSubsetExpression, false, 'but no operand is a 1-bit input pin');
});

test('comments and headers are not code', () => {
    assert.equal(codeOf('  turn on y   # AND this is prose'), 'turn on y');
    const r = analyse(`DEVICE X
PIN a = P1.0 INPUT
PIN y = P1.1 OUTPUT
# a comment mentioning AND and wait and FOREVER
WHEN flag clicked:
  turn on y
`);
    assert.equal(r.hasAnyBoolean, false, 'an AND inside a comment is not an expression');
    assert.deepEqual(r.blockers, [], 'wait/FOREVER inside a comment do not disqualify');
});

test('pin kinds are read as declared', () => {
    const pins = parsePins('PIN led1 = P1.0 OUTPUT ACTIVE LOW\nPIN ldr = P1.3 ANALOG\nPIN btn = P1.4 INPUT\n');
    assert.equal(pins.get('led1'), 'OUTPUT');
    assert.equal(pins.get('ldr'), 'ANALOG');
    assert.equal(pins.get('btn'), 'INPUT');
});

test('the census still runs over a real corpus, and reports what it found', t => {
    const dirs = readdirSync(EXAMPLES).filter(d => existsSync(path.join(EXAMPLES, d, 'program.bw')));
    assert.ok(dirs.length > 100, `only ${dirs.length} programs found — the scan is looking in the wrong place`);
    const rows = dirs.map(d => analyse(readFileSync(path.join(EXAMPLES, d, 'program.bw'), 'utf8')));
    const withExpr = rows.filter(r => r.hasSubsetExpression).length;
    const whole = rows.filter(r => r.wholeProgramCombinational).length;
    // Reported, not asserted — see the header.
    t.diagnostic(`${rows.length} programs: ${withExpr} with a subset expression, ${whole} wholly combinational`);
    assert.ok(rows.some(r => r.blockers.length > 0), 'no program has any disqualifier — the scan is not reading bodies');
});

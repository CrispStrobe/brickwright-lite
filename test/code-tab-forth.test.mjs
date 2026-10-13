/**
 * Blocks ⇄ Forth for the Code tab's Forth tab (overlay/.../bw-lang/forth.js):
 * zForth as it runs on the DOS bench (static/roms/forth.exe). This checks the
 * two-way contract — generate → read → generate is a fixed point — on the
 * supported subset (globals, set/change, arithmetic, comparisons, and/or/not,
 * say, if / if-else, loops, no-argument custom blocks), plus the canonical
 * shape and the refusals. The shipped forth.exe actually running the generated
 * code (including the loops) is asserted in dos-compile.test.mjs.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const SOURCE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'overlay', 'scratch-gui');
const SB3Creator = (await import(path.join(SOURCE, 'src/lib/sb3-creator.js'))).default;
const {generateForth, default: forthToPseudocode} =
    await import(path.join(SOURCE, 'src/lib/bw-lang/forth.js'));

const project = src => { const c = new SB3Creator(); c.parse(src); return c.project; };

const SUPPORTED = {
    assignment: `GLOBAL n
GLOBAL total
WHEN flag clicked:
  set n to 5
  set total to 0
  change total by n
  say total
`,
    arithmetic: `GLOBAL a
WHEN flag clicked:
  set a to ((3 + 4) * 2)
  say (a - 1)
  say (a / 2)
`,
    branches: `GLOBAL a
GLOBAL b
WHEN flag clicked:
  set a to 7
  set b to 2
  IF (a > 3) and not (b = 4) THEN:
    say "yes"
  ELSE:
    say "no"
`,
    strings: `WHEN flag clicked:
  say "hello"
  say "world"
`,
    repeat: `GLOBAL i
WHEN flag clicked:
  set i to 0
  REPEAT 3:
    change i by 1
    say i
`,
    forever: `GLOBAL n
WHEN flag clicked:
  set n to 0
  FOREVER:
    change n by 1
`,
    repeatUntil: `GLOBAL n
WHEN flag clicked:
  set n to 0
  REPEAT UNTIL (n > 3):
    say n
    change n by 1
`,
    nestedLoops: `GLOBAL a
GLOBAL b
WHEN flag clicked:
  REPEAT 2:
    set b to 0
    REPEAT 3:
      change b by 1
      say b
`,
    customBlock: `DEFINE greet:
  say "hi"
  say "there"
WHEN flag clicked:
  greet
  greet
`,
    customBlockGlobals: `GLOBAL total
DEFINE bump:
  change total by 1
  say total
WHEN flag clicked:
  set total to 0
  bump
  bump
`,
    procCallsProc: `DEFINE inner:
  say "in"
DEFINE outer:
  say "out"
  inner
WHEN flag clicked:
  outer
`
};

for (const [name, src] of Object.entries(SUPPORTED)) {
    test(`forth: "${name}" round-trips to the same Forth text`, () => {
        const a = generateForth(project(src));
        assert.equal(a.ok, true, a.reasons.join('; '));
        const back = forthToPseudocode(a.forth);
        assert.deepEqual(back.warnings, [], `the reader degraded:\n${back.pseudocode}`);
        const b = generateForth(project(back.pseudocode));
        assert.equal(b.ok, true, b.reasons.join('; '));
        assert.equal(b.forth, a.forth);
    });
}

test('forth: the canonical shape — var globals at top, body inside : main … ; main', () => {
    const r = generateForth(project(SUPPORTED.assignment));
    assert.equal(r.ok, true);
    assert.match(r.forth, /^\( --- variables --- \)\nvar n\nvar total\n\( --- program --- \)\n: main\n/);
    assert.match(r.forth, /\n;\nmain\n$/);
    assert.match(r.forth, /^ {2}5 n !$/m);
    assert.match(r.forth, /^ {2}n @ total \+!$/m);
    assert.match(r.forth, /^ {2}total @ \. cr$/m);
});

test('forth: a REPEAT counts a _r cell with a marker', () => {
    const r = generateForth(project(SUPPORTED.repeat));
    assert.equal(r.ok, true);
    // `i` is a reserved Forth word, so the namer rewrites it to `i_`.
    assert.match(r.forth, /^\( --- variables --- \)\nvar i_\nvar _r0\n/);
    assert.match(r.forth, /\( repeat \)\n {2}3 _r0 !\n {2}begin\n/);
    assert.match(r.forth, /^ {4}_r0 @ 0 > if$/m);
    assert.match(r.forth, /^ {4}-1 _r0 \+!$/m);
    assert.match(r.forth, /^ {4}_r0 @ 0 <=$/m);
});

test('forth: FOREVER is begin … again; REPEAT UNTIL guards with 1/0', () => {
    const f = generateForth(project(SUPPORTED.forever));
    assert.equal(f.ok, true);
    assert.match(f.forth, /\( forever \)\n {2}begin\n {4}1 n \+!\n {2}again\n/);
    const u = generateForth(project(SUPPORTED.repeatUntil));
    assert.equal(u.ok, true);
    assert.match(u.forth, /\( repeat-until \)\n {2}begin\n {4}n @ 3 > if\n {6}1\n {4}else\n/);
    assert.match(u.forth, /^ {6}0$/m);
    assert.match(u.forth, /^ {2}until$/m);
});

test('forth: a custom block is a : word … ; defined before main', () => {
    const r = generateForth(project(SUPPORTED.customBlock));
    assert.equal(r.ok, true);
    assert.match(r.forth, /\( --- program --- \)\n: greet\n {2}\." hi" cr\n {2}\." there" cr\n;\n: main\n {2}greet\n {2}greet\n;\nmain\n$/);
});

test('forth: callees are defined before callers', () => {
    const r = generateForth(project(SUPPORTED.procCallsProc));
    assert.equal(r.ok, true);
    // `inner` must appear before `outer` (outer calls inner).
    assert.ok(r.forth.indexOf('\n: inner\n') < r.forth.indexOf('\n: outer\n'), r.forth);
});

test('forth: the GPIO words pin!/pin@ read back as set pin / read pin (the device bridge)', () => {
    // `pin!`/`pin@` are baked into the DOS Forth binary (dosmain.c prelude), so a
    // hand-written Code-tab program can drive the 8-pin GPIO strip. The reader
    // must render them faithfully — not throw on an "unknown word" — so the
    // pseudocode view of a pin program stays clean.
    const src = [
        ': main',
        '  3 1 pin!',
        '  5 0 pin!',
        '  2 42 pin!',
        '  3 pin@ 0 > if',
        '    4 1 pin!',
        '  fi',
        ';',
        'main', ''
    ].join('\n');
    const r = forthToPseudocode(src);
    assert.deepEqual(r.warnings, []);
    assert.ok(r.pseudocode.includes('set pin 3 high'), r.pseudocode);
    assert.ok(r.pseudocode.includes('set pin 5 low'), r.pseudocode);
    assert.ok(r.pseudocode.includes('set pin 2 to 42'), r.pseudocode);
    assert.ok(r.pseudocode.includes('IF ((read pin 3) > 0) THEN:'), r.pseudocode);
});

test('forth: the GPIO blocks generate pin! / pin@ (blocks → Forth)', () => {
    // The pseudocode the reader writes compiles to the bwgpio_setpin/_readpin
    // blocks (sb3-creator), and the generator turns those back into pin!/pin@.
    // This closes the half that was missing: a pin block can now become Forth.
    const src = [
        'WHEN flag clicked:',
        '  set pin 3 high',
        '  set pin 5 low',
        '  set pin 2 to 42',
        '  IF ((read pin 3) > 0) THEN:',
        '    set pin 4 high',
        ''
    ].join('\n');
    const r = generateForth(project(src));
    assert.equal(r.ok, true, JSON.stringify(r.reasons));
    assert.deepEqual(r.warnings, []);
    assert.ok(r.forth.includes('3 1 pin!'), r.forth);
    assert.ok(r.forth.includes('5 0 pin!'), r.forth);
    assert.ok(r.forth.includes('2 42 pin!'), r.forth);
    assert.ok(r.forth.includes('4 1 pin!'), r.forth);
    assert.ok(/3 pin@ 0 > if/.test(r.forth), r.forth);
});

test('forth: set/read pin pseudocode compiles to the bwgpio opcodes', () => {
    const p = project([
        'WHEN flag clicked:',
        '  set pin 3 high',
        '  set pin 2 to 42',
        '  IF ((read pin 5) > 0) THEN:',
        '    set pin 1 low',
        ''
    ].join('\n'));
    const json = JSON.stringify(p);
    assert.ok(json.includes('bwgpio_setpin'), 'expected a bwgpio_setpin block');
    assert.ok(json.includes('bwgpio_readpin'), 'expected a bwgpio_readpin block');
});

test('forth: GPIO pins round-trip Forth → pseudocode → blocks → Forth', () => {
    const forthSrc = [
        ': main',
        '  3 1 pin!',
        '  5 0 pin!',
        '  2 42 pin!',
        '  3 pin@ 0 > if',
        '    4 1 pin!',
        '  fi',
        ';',
        'main', ''
    ].join('\n');
    const pseudo = forthToPseudocode(forthSrc).pseudocode;
    const r = generateForth(project(pseudo));
    assert.equal(r.ok, true, JSON.stringify(r.reasons));
    for (const w of ['3 1 pin!', '5 0 pin!', '2 42 pin!', '4 1 pin!', '3 pin@']) {
        assert.ok(r.forth.includes(w), `round-trip dropped "${w}":\n${r.forth}`);
    }
});

const REFUSE = {
    customArgs: {
        src: 'DEFINE double (n):\n  set result to (n * 2)\nWHEN flag clicked:\n  double 5\n',
        frag: 'takes arguments'
    },
    recursion: {
        src: 'DEFINE loopy:\n  say "x"\n  loopy\nWHEN flag clicked:\n  loopy\n',
        frag: 'calls itself or forms a cycle'
    },
    join: {src: 'GLOBAL n\nWHEN flag clicked:\n  say ("n is " join n)\n', frag: 'cannot join text'}
};
for (const [name, {src, frag}] of Object.entries(REFUSE)) {
    test(`forth: "${name}" is refused by name`, () => {
        const r = generateForth(project(src));
        assert.equal(r.ok, false);
        assert.equal(r.forth, '');
        assert.ok(r.reasons.some(x => x.includes(frag)),
            `expected a reason naming "${frag}", got ${JSON.stringify(r.reasons)}`);
    });
}

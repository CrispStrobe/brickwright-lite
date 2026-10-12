/**
 * Blocks ⇄ Forth for the Code tab's Forth tab (overlay/.../bw-lang/forth.js):
 * zForth as it runs on the DOS bench (static/roms/forth.exe). This checks the
 * two-way contract — generate → read → generate is a fixed point — on the v1
 * subset, plus the canonical shape and the refusals. The shipped forth.exe
 * actually running the generated code is asserted in dos-compile.test.mjs.
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

// Programs the v1 subset supports: globals, set/change, arithmetic, comparisons,
// and/or/not, say (number + string), if / if-else.
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
    // set / change / say are RPN; reads are `X @`, writes `<v> X !`.
    assert.match(r.forth, /^ {2}5 n !$/m);
    assert.match(r.forth, /^ {2}n @ total \+!$/m);
    assert.match(r.forth, /^ {2}total @ \. cr$/m);
});

const REFUSE = {
    loop: {src: 'GLOBAL n\nWHEN flag clicked:\n  REPEAT 3:\n    say n\n', frag: 'loops are not supported'},
    custom: {src: 'DEFINE greet:\n  say "hi"\nWHEN flag clicked:\n  greet\n', frag: 'custom blocks are not supported'},
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

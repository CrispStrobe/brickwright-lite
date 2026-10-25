import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {SB3Creator, projectOpcodes, runProgram} from './helpers/bw-vm.mjs';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';

// Task E17: the Arcade export refused `letter n of s` by name ("operator_letter_of
// as a value"), so text indexing imported from Arcade could not go back. It is
// now `s.charAt(n - 1)` (String_::charAt, "" out of range like Scratch's letter).

const vars = run => Object.fromEntries(run.vm.runtime.targets.flatMap(t => Object.values(t.variables))
    .map(v => [v.name.replace(/^Game_/, ''), v.value]));
const unprefixed = globals => Object.fromEntries(Object.entries(globals).map(([k, v]) => [k.replace(/^Game_/, ''), v]));
const exportOf = run => projectToArcade(run.creator.project,
    {costumeSvg: (t, c) => run.creator.assets.get(c.assetId)?.data});

test('Arcade text indexing imports, exports, runs in original PXT and reimports with the same values', async () => {
    const source = `let s = "hello"
let i = 2
let k = 0
let neg = -1
let num = 12345
let a = s[i]
let b = s.charAt(i + 1)
let c = s[0]
let d = s[9]
let e = s[k - 1]
let f = s[neg]
let g = s.length
let h = ("" + num)[1]
let m = ("" + num).length`;
    const names = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'm'];
    const expected = await runPxtArcade(source);
    assert.deepEqual(names.map(n => expected[n]), ['l', 'l', 'h', '', '', '', 5, '2', 5]);
    const check = (actual, where) => {
        for (const n of names) assert.equal(String(actual[n]), String(expected[n]), `${n} ${where}`);
    };
    const imported = arcadeToPseudocode(source);
    assert.deepEqual(imported.unsupported, []);
    const run = await runProgram(imported.code, {frames: 2, uploads: imported.costumes, storage: true});
    assert.deepEqual(run.errors, []);
    assert.ok(projectOpcodes(run.creator.project).has('operator_letter_of'));
    check(vars(run), 'in the Scratch VM');

    const exported = exportOf(run);
    assert.deepEqual(exported.unsupported, []);
    assert.doesNotMatch(exported.ts, /_na\b/);
    const pxt = await runPxtArcade(exported.ts);
    check(unprefixed(pxt), 'in the exported original PXT');

    const reimported = arcadeToPseudocode(exported.ts);
    assert.deepEqual(reimported.unsupported, []);
    const rerun = await runProgram(reimported.code, {frames: 2, uploads: reimported.costumes, storage: true});
    assert.deepEqual(rerun.errors, []);
    check(vars(rerun), 'after reimport');
});

test('Scratch letter-of edges (0, negative, past the end, a number) keep Scratch values in exported PXT', async () => {
    const program = `DEVICE ARCADE
SPRITE Game:
WHEN flag clicked:
  set s to "hello"
  set n to 0
  set r0 to letter 0 of s
  set r1 to letter n of s
  set r2 to letter 6 of s
  set r3 to letter 2 of 12345
  set r4 to length of 12345
  set r5 to letter (n - 2) of s
  set len to length of s
  set r6 to letter len of s
  set r7 to letter 1 of (s join "!")
  set r8 to letter (n + 1) of s
  set done to 1
`;
    const names = ['r0', 'r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'r7', 'r8'];
    const run = await runProgram(program, {frames: 2, storage: true});
    assert.deepEqual(run.errors, []);
    const scratch = vars(run);
    assert.deepEqual(names.map(n => String(scratch[n])), ['', '', '', '2', '5', '', 'o', 'h', 'h']);
    const exported = exportOf(run);
    assert.deepEqual(exported.unsupported, []);
    const pxt = unprefixed(await runPxtArcade(exported.ts, {waitForGlobals: {Game_done: 1}}));
    for (const n of names) assert.equal(String(pxt[n]), String(scratch[n]), `${n} in exported original PXT`);
});

test('letter-of indexes go out and come back unchanged: literal folded, (i + 1) as charAt(i), otherwise charAt(n - 1)', () => {
    const creator = new SB3Creator();
    creator.parse(`DEVICE ARCADE
SPRITE Game:
WHEN flag clicked:
  set s to "hello"
  set i to 2
  set a to letter 3 of s
  set b to letter (i + 1) of s
  set c to letter i of s
`);
    assert.deepEqual(creator.warnings, []);
    const first = projectToArcade(creator.project, {});
    assert.deepEqual(first.unsupported, []);
    assert.match(first.ts, /Game_a = \("" \+ Game_s\)\.charAt\(2\)$/m);
    assert.match(first.ts, /Game_b = \("" \+ Game_s\)\.charAt\(Game_i\)$/m);
    assert.match(first.ts, /Game_c = \("" \+ Game_s\)\.charAt\(Game_i - 1\)$/m);
    // Each index reads back as the one it was written from, and goes out the same again.
    const back = arcadeToPseudocode(first.ts);
    assert.deepEqual(back.unsupported, []);
    assert.match(back.code, /set Game_a to \(letter 3 of /);
    assert.match(back.code, /set Game_b to \(letter \(Game_i \+ 1\) of /);
    assert.match(back.code, /set Game_c to \(letter Game_i of /);
    const again = new SB3Creator();
    again.parse(back.code);
    assert.deepEqual(again.warnings, []);
    const second = projectToArcade(again.project, {});
    assert.deepEqual(second.unsupported, []);
    const index = (ts, name) => ts.match(new RegExp(`${name} = .*\\.charAt\\((.*)\\)$`, 'm'))[1];
    assert.equal(index(second.ts, 'Game_a'), '2');
    assert.equal(index(second.ts, 'Game_b'), 'Game_i');
    assert.equal(index(second.ts, 'Game_c'), 'Game_i - 1');
});

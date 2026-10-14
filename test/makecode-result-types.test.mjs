/**
 * MakeCode re-export: the types of copied procedure results and of string
 * globals (task E16 of docs/OPEN-TASKS-2026-09-29.md, found by E14).
 *
 * The importer turns `g = f(3)` into `f 3` + `set _mc1 to f_result` + `set g
 * to _mc1`, and a `let s: string` with no value into `set s to 0` before its
 * text. export.js typed a variable from its `set`s alone and read a copy of
 * another variable as a number, so `_mc1 = f_result` was declared `let _mc1 =
 * 0` and pxt refused the re-export of every procedure that returns text:
 * "Type 'string' is not assignable to type 'number'".
 *
 * variableTypes (export.js) now spreads what a variable holds along its
 * copies, to a fixed point, and declares a variable that holds both text and
 * numbers `any` (as E13 does for a parameter); a parameter typed `any` gives
 * both to a variable set from it, and such a variable passed to a procedure
 * makes that parameter `any`.
 *
 * Every export is compiled by the pinned pxt-microbit when the runtime is
 * synced, and the imported program is run in the MakeCode simulator before
 * and after the round trip.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import util from 'node:util';
import {fileURLToPath} from 'node:url';

import {SOURCE} from './helpers/bw-integrated.mjs';
import {microbitToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/microbit-translate.js';
import {ev3ToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/ev3-translate.js';
import {exportToMakeCode} from '../overlay/scratch-gui/src/lib/bw-makecode/export.js';
import {exportToMakeCodeEv3} from '../overlay/scratch-gui/src/lib/bw-makecode/export-ev3.js';
import {PXT_GLUE_JS} from '../overlay/scratch-gui/src/lib/bw-makecode/pxt-runtime.js';
import {compileMakeCode, runMakeCodeSim, makeCodeSimAvailable} from '../scripts/lib/makecode-sim.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CREATOR = path.join(SOURCE, 'src', 'lib', 'sb3-creator.js');
const {default: SB3Creator} = fs.existsSync(CREATOR) ? await import(CREATOR) : {default: null};
const SKIP = SB3Creator ? false : 'needs overlay/scratch-gui/src/lib/sb3-creator.js (npm run sync:sb3-creator)';
const SKIP_PXT = SKIP || (makeCodeSimAvailable() ? false : 'MakeCode runtime not synced (npm run sync:makecode)');
const EV3_DIR = path.join(ROOT, 'packages/scratch-gui/static/makecode/ev3');
const SKIP_EV3 = SKIP_PXT || (fs.existsSync(path.join(EV3_DIR, 'pxtworker.js')) ? false : 'pxt-ev3 not synced (npm run sync:makecode)');

const parse = source => {
    const creator = new SB3Creator();
    const project = creator.parse(source);
    assert.deepEqual(creator.warnings || [], []);
    return project;
};
const exportBw = source => exportToMakeCode(parse(`DEVICE MICROBIT\n\n${source}`));
const trip = ts => {
    const imported = microbitToPseudocode(ts);
    assert.deepEqual(imported.unsupported, []);
    return exportToMakeCode(parse(imported.code));
};
const lines = ts => ts.split('\n');
const pxtAccepts = async ts => {
    try {
        await compileMakeCode(ts);
        return true;
    } catch (e) {
        return e.message;
    }
};

// One program per rule: [what, dialect source, lines the export must contain].
const CASES = [
    ['a copy of a text variable is text', `WHEN flag clicked:
  set t to "a"
  set c to t
  show text c
`, ['let c = ""', 'c = t']],
    ['a copy of a procedure\'s text result is text (the importer\'s `_mcN = f_result`)', `WHEN flag clicked:
  name 3
  set _mc1 to name_result
  show text _mc1

DEFINE name (n):
  set name_result to ("x" join n)
  stop this script
`, ['let _mc1 = ""', 'let name_result = ""', 'function name(n: number) {', '_mc1 = name_result']],
    ['a copy set before its source is set: the order of the scripts does not matter', `WHEN flag clicked:
  set b to a
  show text b

WHEN flag clicked:
  set a to c
  set c to "z"
`, ['let a = ""', 'let b = ""', 'let c = ""']],
    ['copies in a cycle, one given text → all text', `WHEN flag clicked:
  set a to b
  set b to a
  set a to "t"
  show text b
`, ['let a = ""', 'let b = ""']],
    ['a copy of a number stays a number', `WHEN flag clicked:
  set n to 5
  set m to n
  show number m
`, ['let n = 5', 'let m = 0', 'm = n']],
    ['a copy of a variable nothing sets is a number (its 0)', `WHEN flag clicked:
  set k to w
  show number k
`, ['let k = 0', 'let w = 0', 'k = w']],
    ['text and a number → any (the leading value folded into it, as for any variable)', `WHEN flag clicked:
  set v to 0
  show text v
  set v to "a"
  show text v
`, ['let v: any = 0', 'v = "a"']],
    ['text and the 0 of a variable nothing sets → any', `WHEN flag clicked:
  set k to "a"
  show text k
  set k to w
  show text k
`, ['let k: any = "a"', 'k = w']],
    ['a string global imported with no value (`set s to 0`) then given a text result → any', `WHEN flag clicked:
  set s to 0
  name 3
  set _mc1 to name_result
  set s to _mc1
  show text s

DEFINE name (n):
  set name_result to ("x" join n)
  stop this script
`, ['let s: any = 0', 'let _mc1 = ""', 's = _mc1']],
    ['a text-and-number variable passed to a procedure → that parameter is any', `WHEN flag clicked:
  set r to 0
  set v to 0
  size v
  set v to "a"
  size v

DEFINE size (p):
  set r to length of p
`, ['let v: any = 0', 'function size(p: any) {']],
    ['a variable set from an `any` parameter holds both → any', `WHEN flag clicked:
  keep "x"
  keep 5

DEFINE keep (p):
  set held to p
`, ['function keep(p: any) {', 'let held: any = 0', '    held = p']]
];

for (const [what, source, expected] of CASES) {
    test(`variable type: ${what}`, {skip: SKIP}, async () => {
        const ex = exportBw(source);
        assert.deepEqual(ex.unsupported, []);
        for (const line of expected) assert.ok(lines(ex.ts).includes(line), `${line}\n---\n${ex.ts}`);
        if (!SKIP_PXT) assert.equal(await pxtAccepts(ex.ts), true, ex.ts);
    });
}

// A text-and-number variable that is computed with stays a number: as `any`,
// TypeScript would concatenate where Scratch adds (`any + 1` of "5" is "51",
// Scratch's 6), so pxt's refusal is kept rather than a silent wrong value.
const COMPUTED = [
    ['added to', `  set v to v + 1\n  show number v\n`],
    ['changed by', `  change v by 1\n  show number v\n`],
    ['compared with a number', `  IF v < 10 THEN:\n    show text v\n`]
];
for (const [what, use] of COMPUTED) {
    test(`variable type: text and a number, ${what} → stays a number, refused by pxt as before`, {skip: SKIP}, async () => {
        const ex = exportBw(`WHEN flag clicked:\n  set v to 0\n  show number v\n  set v to "5"\n${use}`);
        assert.deepEqual(ex.unsupported, []);
        assert.ok(lines(ex.ts).includes('let v = 0'), ex.ts);
        if (!SKIP_PXT) assert.match(String(await pxtAccepts(ex.ts)), /is not assignable to type 'number'/);
    });
}

test('variable type: text and a number, compared with a text → any (JavaScript compares two texts as Scratch does)', {skip: SKIP}, async () => {
    const ex = exportBw(`WHEN flag clicked:\n  set v to 0\n  show number v\n  set v to "a"\n  IF v = "a" THEN:\n    show text v\n`);
    assert.deepEqual(ex.unsupported, []);
    assert.ok(lines(ex.ts).includes('let v: any = 0'), ex.ts);
    if (!SKIP_PXT) assert.equal(await pxtAccepts(ex.ts), true, ex.ts);
});

test('variable type: a copy held as a full `data_variable` reporter block is spread too', {skip: SKIP}, async () => {
    // The parser writes a variable in a slot as [12, name, id]; a project saved
    // by the editor can hold the same read as its own reporter block.
    const project = parse(`DEVICE MICROBIT\n\n${CASES[0][1]}`);
    let replaced = 0;
    for (const target of project.targets) {
        for (const [id, b] of Object.entries(target.blocks)) {
            const slot = b && b.opcode === 'data_setvariableto' && b.inputs.VALUE && b.inputs.VALUE[1];
            if (!Array.isArray(slot) || slot[0] !== 12) continue;
            const reporter = `${id}-reporter`;
            target.blocks[reporter] = {opcode: 'data_variable', next: null, parent: id, inputs: {},
                fields: {VARIABLE: [slot[1], slot[2]]}, shadow: false, topLevel: false};
            b.inputs.VALUE = [3, reporter, [10, '']];
            replaced++;
        }
    }
    assert.equal(replaced, 1);
    const ex = exportToMakeCode(project);
    for (const line of ['let c = ""', 'c = t']) assert.ok(lines(ex.ts).includes(line), `${line}\n---\n${ex.ts}`);
    if (!SKIP_PXT) assert.equal(await pxtAccepts(ex.ts), true, ex.ts);
});

// Imported MakeCode: procedures that return text, a `let s: string` with no
// value and one `= null`. Its serial output is the reading.
const RESULTS = `let label = ""
let s: string
let u: string = null
function name(n: number): string {
    return "x" + n
}
function twice(t: string): string {
    return t + t
}
label = name(3)
s = twice(label)
u = name(45)
serial.writeLine(s)
serial.writeValue("a", label.length)
serial.writeValue("b", s.length)
serial.writeValue("c", twice(name(12)).length)
serial.writeValue("d", u.length)
`;

const serialOf = async ts => {
    const run = await runMakeCodeSim(await compileMakeCode(ts), {ms: 1000});
    assert.equal(run.error, null);
    return run.serial.map(line => line.text.trim()).filter(Boolean);
};

test('imported text results: typed back, a fixed point, and pxt compiles it', {skip: SKIP}, async () => {
    const once = trip(RESULTS);
    for (const line of ['let label = ""', 'let s: any = 0', 'let u: any = 0', 'let name_result = ""', 'let twice_result = ""',
        'let _mc1 = ""', 'let _mc2 = ""', 'function name(n: number) {', 'function twice(t: string) {']) {
        assert.ok(lines(once.ts).includes(line), `${line}\n---\n${once.ts}`);
    }
    assert.equal(trip(once.ts).ts, once.ts, 'the second round trip changes nothing');
    if (!SKIP_PXT) assert.equal(await pxtAccepts(once.ts), true, once.ts);
});

test('imported text results: the re-export prints what the original prints (MakeCode simulator)', {skip: SKIP_PXT, timeout: 300000}, async () => {
    const original = await serialOf(RESULTS);
    assert.deepEqual(original, ['x3x3', 'a:2', 'b:4', 'c:6', 'd:3']);
    assert.deepEqual(await serialOf(trip(RESULTS).ts), original);
});

test('before E16 the copies were `= 0`, and pxt refused the re-export', {skip: SKIP_PXT}, async () => {
    // The receipt for the defect: this export, declared as before.
    const before = trip(RESULTS).ts
        .replace(/^let (\w+): any = 0$/gm, 'let $1 = 0')
        .replace(/^let (_mc\d+) = ""$/gm, 'let $1 = 0');
    assert.match(String(await pxtAccepts(before)), /Type 'string' is not assignable to type 'number'/);
});

let ev3Sandbox = null;
async function compileEv3 (ts) {
    if (!ev3Sandbox) {
        const quiet = () => {};
        const e = {setTimeout, clearTimeout, setInterval, clearInterval, setImmediate, clearImmediate,
            TextEncoder: util.TextEncoder, TextDecoder: util.TextDecoder, Buffer,
            console: {log: quiet, debug: quiet, info: quiet, warn: quiet, error: quiet},
            pxtTargetBundle: JSON.parse(fs.readFileSync(path.join(EV3_DIR, 'target.json'), 'utf8'))};
        e.global = e;
        e.self = e;
        e.eval = src => vm.runInContext(src, e, {filename: 'eval'});
        vm.createContext(e, {codeGeneration: {strings: false, wasm: false}});
        vm.runInContext(fs.readFileSync(path.join(EV3_DIR, 'pxtworker.js'), 'utf8'), e, {filename: 'pxtworker.js'});
        vm.runInContext(PXT_GLUE_JS, e, {filename: 'pxt-glue.js'});
        ev3Sandbox = e;
    }
    const files = {'pxt.json': JSON.stringify({name: 't', dependencies: {ev3: '*'}, files: ['main.ts']}), 'main.ts': ts};
    return JSON.parse(JSON.stringify(await ev3Sandbox.bwMakeCode.compile(files, {})));
}

test('EV3 shares it: a text result and a string global re-export and compile in pxt-ev3', {skip: SKIP_EV3, timeout: 300000}, async () => {
    const source = `let s: string
let label = ""
function name(n: number): string {
    return "x" + n
}
label = name(3)
s = name(4)
brick.showString(label, 1)
brick.showString(s, 2)
`;
    assert.equal((await compileEv3(source)).success, true);
    const imported = ev3ToPseudocode(source);
    assert.deepEqual(imported.unsupported, []);
    const ex = exportToMakeCodeEv3(parse(imported.code));
    for (const line of ['let label = ""', 'let s: any = 0', 'let _mc1 = ""']) assert.ok(lines(ex.ts).includes(line), `${line}\n---\n${ex.ts}`);
    // A text-and-number variable is shown as text, not as a number.
    assert.ok(ex.ts.includes('brick.showString(("" + s), 2)'), ex.ts);
    const compiled = await compileEv3(ex.ts);
    assert.equal(compiled.success, true, JSON.stringify((compiled.diagnostics || []).slice(0, 3)));
});

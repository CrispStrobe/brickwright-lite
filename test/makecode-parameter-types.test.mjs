/**
 * MakeCode re-export: each custom-block parameter's type (task E13 of
 * docs/OPEN-TASKS-2026-09-29.md, found by E12).
 *
 * A Scratch procedure argument has no type, and export.js declared every one
 * `: number`, so a procedure called with text (`f("")`, `f("0")`, a string
 * parameter of an imported MakeCode program) was refused by pxt on re-export:
 * "Argument of type '""' is not assignable to parameter of type 'number'".
 * procedureParameterTypes (export.js) now infers each parameter's type from
 * what its calls pass and how its body reads it; a `<p>` parameter is
 * boolean; a parameter given both text and numbers is `any`, which
 * pxt-microbit and pxt-ev3 accept.
 *
 * Each inference rule has its own case below, written in the dialect (as a
 * Lite user writes it) or as MakeCode TypeScript imported first; every
 * export is compiled by the pinned pxt-microbit when the runtime is synced.
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
import {compileMakeCode, makeCodeSimAvailable} from '../scripts/lib/makecode-sim.mjs';

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
const signature = (ts, name) => (ts.match(new RegExp(`^function ${name}\\(.*\\) \\{$`, 'm')) || [null])[0];
const pxtAccepts = async ts => {
    try {
        await compileMakeCode(ts);
        return true;
    } catch (e) {
        return e.message;
    }
};

// One program per rule: [what, dialect source, expected signature, expected calls].
const CASES = [
    ['a call passes text → string', `WHEN flag clicked:
  greet "Ada"
  greet ""

DEFINE greet (who):
  show text who
`, 'function greet(who: string) {', ['greet("Ada")', 'greet("")']],
    ['a call passes a number → number', `WHEN flag clicked:
  twice 4

DEFINE twice (n):
  show number n * 2
`, 'function twice(n: number) {', ['twice(4)']],
    ['a <p> parameter → boolean, given the reporter itself', `WHEN flag clicked:
  set r to 0
  gate (button a pressed)

DEFINE gate <on>:
  IF on THEN:
    set r to 1
  set r to on
`, 'function gate(on: boolean) {', ['gate(input.buttonIsPressed(Button.A))', '    r = (on ? 1 : 0)']],
    ['text in one call, a number in another → any', `WHEN flag clicked:
  echo "hi"
  echo 5

DEFINE echo (p):
  show text p
`, 'function echo(p: any) {', ['echo("hi")', 'echo(5)']],
    ['shown as text, given a number → any (a number there does not compile)', `WHEN flag clicked:
  label 7

DEFINE label (p):
  show text p
`, 'function label(p: any) {', ['label(7)']],
    ['a text that reads as a number, used in arithmetic → number, passed as one', `WHEN flag clicked:
  set r to 0
  bump "5"

DEFINE bump (n):
  set r to n + 1
`, 'function bump(n: number) {', ['bump(5)']],
    ['its length is taken, the call passes "0" → string, the "0" kept', `WHEN flag clicked:
  set r to 0
  size "0"

DEFINE size (s):
  set r to length of s
`, 'function size(s: string) {', ['size("0")']],
    ['its length is taken but it is also added to → number (arithmetic outweighs the hint)', `WHEN flag clicked:
  set r to 0
  mix "5"

DEFINE mix (n):
  set r to (length of n) + n
`, 'function mix(n: number) {', ['mix(5)']],
    ['passed on to a text parameter → string (a flow, back and forth)', `WHEN flag clicked:
  show2 "hi" 1
  relay "0"

DEFINE relay (q):
  show2 q 2

DEFINE show2 (p) (n):
  show text p
  show number n
`, 'function relay(q: string) {', ['relay("0")', '    show2(q, 2)']],
    ['given a text variable → string', `WHEN flag clicked:
  set name to "Bo"
  greet name

DEFINE greet (who):
  show text who
`, 'function greet(who: string) {', ['greet(name)']],
    ['a variable set from a string parameter is text', `WHEN flag clicked:
  keep "x"

DEFINE keep (v):
  set greeting to v
`, 'function keep(v: string) {', ['let greeting = ""', '    greeting = v']],
    ['nothing tells → number, as before', `WHEN flag clicked:
  set r to 0

DEFINE idle (p):
  set r to 1
`, 'function idle(p: number) {', []]
];

for (const [what, source, expected, calls] of CASES) {
    test(`parameter type: ${what}`, {skip: SKIP}, async () => {
        const ex = exportBw(source);
        assert.deepEqual(ex.unsupported, []);
        const name = expected.match(/^function (\w+)/)[1];
        assert.equal(signature(ex.ts, name), expected, ex.ts);
        for (const line of calls) assert.ok(ex.ts.split('\n').includes(line), `${line}\n---\n${ex.ts}`);
        if (!SKIP_PXT) assert.equal(await pxtAccepts(ex.ts), true, ex.ts);
    });
}

test('before E13 every parameter was `: number`, and pxt refused the text calls', {skip: SKIP_PXT}, async () => {
    // The receipt for the defect: the export of the first case, typed as before.
    const ex = exportBw(CASES[0][1]);
    const before = ex.ts.replace('who: string', 'who: number');
    assert.match(String(await pxtAccepts(before)), /not assignable to parameter of type 'number'/);
});

// Imported MakeCode: the types the original declared come back, and a second
// trip changes nothing (a fixed point).
const TYPED = `let r = 0
let label2 = ""
function f(p: string): number {
    if (p) {
        return 1
    }
    return 2
}
function pad(s: string, n: number) {
    label2 = s
    basic.showString(s)
    r = n + 1
}
function hello(who: string) {
    pad(who, 3)
}
r = f("")
r = f("0")
pad("ab", 1)
hello("0")
`;

test('imported MakeCode with string parameters: typed back, a fixed point, and pxt compiles it', {skip: SKIP}, async () => {
    const once = trip(TYPED);
    for (const line of ['function f(p: string) {', 'function pad(s: string, n: number) {', 'function hello(who: string) {']) {
        assert.ok(once.ts.split('\n').includes(line), `${line}\n---\n${once.ts}`);
    }
    for (const line of ['f("")', 'f("0")', 'pad("ab", 1)', 'hello("0")']) assert.ok(once.ts.includes(line), line);
    assert.equal(trip(once.ts).ts, once.ts, 'the second round trip changes nothing');
    if (!SKIP_PXT) assert.equal(await pxtAccepts(once.ts), true, once.ts);
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

test('EV3 shares the inference: string and any parameters compile in pxt-ev3', {skip: SKIP_EV3, timeout: 300000}, async () => {
    const source = `let r = 0
function f(p: string): number {
    if (p) {
        return 1
    }
    return 2
}
r = f("")
r = f("0")
`;
    assert.equal((await compileEv3(source)).success, true);
    const imported = ev3ToPseudocode(source);
    assert.deepEqual(imported.unsupported, []);
    const ex = exportToMakeCodeEv3(parse(imported.code));
    assert.ok(ex.ts.includes('function f(p: string) {'), ex.ts);
    const compiled = await compileEv3(ex.ts);
    assert.equal(compiled.success, true, JSON.stringify((compiled.diagnostics || []).slice(0, 3)));
    // `any` is accepted by pxt-ev3 too (the mixed case).
    const mixed = exportToMakeCodeEv3(parse(`DEVICE EV3\n\n${CASES[3][1]}`));
    assert.ok(mixed.ts.includes('function echo(p: any) {'), mixed.ts);
    assert.equal((await compileEv3(`function echo(p: any) {\n    console.log("" + p)\n}\necho("hi")\necho(5)\n`)).success, true);
});

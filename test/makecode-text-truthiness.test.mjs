/**
 * Text truthiness in the shared MakeCode importer base (task E12 of
 * docs/OPEN-TASKS-2026-09-29.md, found by E10): translate-base.js, which
 * the micro:bit and the EV3 importers share.
 *
 * MakeCode's "" is false and every other text ("0" too) true. The base wrote
 * a bare value in a condition as `not (s = 0)`, which is Scratch's
 * comparison: "" = 0 is false (a blank side compares as text) and "0" = 0
 * true, so `if (s)`, `!s` and `while (!s)` on "" and "0" were inverted — in
 * Lite's VM, and in the re-export, which pxt refused outright
 * (`s == 0`: "Operator '==' cannot be applied to types 'string' and
 * 'number'"). A text (known text, or a reference DECLARED `: string`) is now
 * tested by its length, `not ((length of s) = 0)`, as E10 did for the Arcade
 * path. A number keeps `not (n = 0)`.
 *
 * Measured three ways, each reading a variable 1 (true branch) / 2 (false):
 * the original in pxt-microbit's simulator, the import in Lite's VM, the
 * re-export in the simulator again. pxt-ev3 ships no headless simulator
 * here; its compiler takes the original and the re-export, and the language
 * semantics (pxt-core's) are run in the micro:bit simulator, since the
 * program uses no EV3 API.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import util from 'node:util';
import {fileURLToPath} from 'node:url';

import {SOURCE, INTEGRATED} from './helpers/bw-integrated.mjs';
import {microbitToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/microbit-translate.js';
import {ev3ToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/ev3-translate.js';
import {exportToMakeCode} from '../overlay/scratch-gui/src/lib/bw-makecode/export.js';
import {exportToMakeCodeEv3} from '../overlay/scratch-gui/src/lib/bw-makecode/export-ev3.js';
import {stringTypedReferences} from '../overlay/scratch-gui/src/lib/bw-makecode/translate-base.js';
import {parseMakeCodeTs} from '../overlay/scratch-gui/src/lib/bw-makecode/ts-import.js';
import {PXT_GLUE_JS} from '../overlay/scratch-gui/src/lib/bw-makecode/pxt-runtime.js';
import {compileMakeCode, runMakeCodeSim, makeCodeSimAvailable} from '../scripts/lib/makecode-sim.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CAN_RUN = fs.existsSync(path.join(INTEGRATED, 'node_modules', 'scratch-vm', 'src', 'index.js')) &&
    fs.existsSync(path.join(SOURCE, 'src', 'lib', 'sb3-creator.js'));
const {runProgram} = CAN_RUN ? await import('./helpers/bw-vm.mjs') : {};
const SKIP_VM = CAN_RUN ? false : 'needs the integrated tree and its scratch-vm — run `npm run integrate` and install';
const SKIP_SIM = SKIP_VM || (makeCodeSimAvailable() ? false : 'MakeCode runtime not synced (npm run sync:makecode)');
const EV3_DIR = path.join(ROOT, 'packages/scratch-gui/static/makecode/ev3');
const SKIP_EV3 = SKIP_SIM || (fs.existsSync(path.join(EV3_DIR, 'pxtworker.js')) ? false : 'pxt-ev3 not synced (npm run sync:makecode)');

// The readings, r1..r10: if (s), !s, if (t), !t with s = "", t = "0";
// while (!s) counted; !s and !t as values (through a function); a
// `p: string` parameter called with "" and "0"; s = "a" (a control).
const PARAMETER_CALLS = 'r8 = f("")\nr9 = f("0")\n';
const READINGS = `let s = ""
let t = "0"
${Array.from({length: 10}, (_, i) => `let r${i + 1} = 0`).join('\n')}
function id(v: boolean): boolean { return v }
function f(p: string): number { if (p) { return 1 } return 2 }
if (s) { r1 = 1 } else { r1 = 2 }
if (!s) { r2 = 1 } else { r2 = 2 }
if (t) { r3 = 1 } else { r3 = 2 }
if (!t) { r4 = 1 } else { r4 = 2 }
while (!s) { s = "b"; r5 += 1 }
s = ""
if (id(!s)) { r6 = 1 } else { r6 = 2 }
if (id(!t)) { r7 = 1 } else { r7 = 2 }
${PARAMETER_CALLS}s = "a"
if (s) { r10 = 1 } else { r10 = 2 }
`;
// pxt-microbit 9.1.1's simulator, measured on READINGS (2026-10-13).
const MAKECODE = [2, 1, 1, 2, 1, 1, 2, 2, 1, 1];
// Before E12, Lite's VM (micro:bit and EV3 alike): 9 of the 9 readings wrong.
const BEFORE = [1, 2, 2, 1, 0, 2, 1, 1, 2, 1];
// The re-export types every procedure parameter `: number` (export.js), so
// `f("")` does not compile there whatever the condition: that program leaves
// the two parameter calls out (r8 = r9 = 0).
const WITHOUT_PARAMETER_CALLS = READINGS.replace(PARAMETER_CALLS, '');
const MAKECODE_WITHOUT = [2, 1, 1, 2, 1, 1, 2, 0, 0, 1];
const PRINT = Array.from({length: 10}, (_, i) => `serial.writeValue("r${i + 1}", r${i + 1})`).join('\n') + '\n';

const readings = run => {
    const by = {};
    for (const target of run.vm.runtime.targets) {
        for (const v of Object.values(target.variables || {})) if (/^r\d+$/.test(v.name)) by[v.name] = Number(v.value);
    }
    return MAKECODE.map((_, i) => by[`r${i + 1}`]);
};
async function simReadings (ts) {
    const run = await runMakeCodeSim(await compileMakeCode(ts), {ms: 1000});
    assert.equal(run.error, null);
    const by = {};
    for (const line of run.serial) {
        const m = /^(r\d+):(-?\d+)/.exec(line.text.trim());
        if (m) by[m[1]] = Number(m[2]);
    }
    return MAKECODE.map((_, i) => by[`r${i + 1}`]);
}

const TARGETS = {
    'micro:bit': {translate: microbitToPseudocode, source: ts => ts + PRINT, exportTs: project => exportToMakeCode(project)},
    EV3: {translate: ev3ToPseudocode, source: ts => ts, exportTs: project => exportToMakeCodeEv3(project)}
};

for (const [name, target] of Object.entries(TARGETS)) {
    test(`${name}: a text in a condition is tested by its length; Lite's VM reads MakeCode's truth`, {skip: SKIP_VM}, async () => {
        const imported = target.translate(target.source(READINGS));
        assert.deepEqual(imported.unsupported, []);
        for (const line of [
            'IF not ((length of s) = 0) THEN:', 'IF not (not ((length of s) = 0)) THEN:',
            'IF not ((length of t) = 0) THEN:', 'IF not (not ((length of t) = 0)) THEN:',
            'REPEAT UNTIL not ((length of s) = 0):', 'IF not ((length of p) = 0) THEN:'
        ]) assert.ok(imported.code.includes(line), `${line}\n---\n${imported.code}`);
        assert.doesNotMatch(imported.code, /not \((s|t|p) = 0\)/);
        const run = await runProgram(imported.code, {frames: 30});
        assert.deepEqual(run.errors, []);
        assert.deepEqual(readings(run), MAKECODE, `before E12 this read ${BEFORE.join(' ')}`);
        assert.deepEqual(target.exportTs(run.creator.project).unsupported, []);
    });
}

test('micro:bit: the original and the re-export read the same in pxt-microbit\'s simulator', {skip: SKIP_SIM, timeout: 300000}, async () => {
    assert.deepEqual(await simReadings(READINGS + PRINT), MAKECODE);
    const run = await runProgram(microbitToPseudocode(WITHOUT_PARAMETER_CALLS + PRINT).code, {frames: 30});
    assert.deepEqual(readings(run), MAKECODE_WITHOUT);
    const ex = exportToMakeCode(run.creator.project);
    assert.doesNotMatch(ex.ts, /\b[st] == 0\b/);
    assert.deepEqual(await simReadings(ex.ts), MAKECODE_WITHOUT);
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

test('EV3: pxt-ev3 compiles the original and the re-export, which reads MakeCode\'s truth', {skip: SKIP_EV3, timeout: 300000}, async () => {
    assert.equal((await compileEv3(READINGS)).success, true);
    const run = await runProgram(ev3ToPseudocode(WITHOUT_PARAMETER_CALLS).code, {frames: 30});
    assert.deepEqual(readings(run), MAKECODE_WITHOUT);
    const ex = exportToMakeCodeEv3(run.creator.project);
    const compiled = await compileEv3(ex.ts);
    assert.equal(compiled.success, true, JSON.stringify((compiled.diagnostics || []).slice(0, 3)));
    // No EV3 API in it: pxt-core's semantics, run in the micro:bit simulator.
    assert.deepEqual(await simReadings(`${ex.ts}\n${PRINT}`), MAKECODE_WITHOUT);
});

test('a number keeps `not (n = 0)`; only text and string-typed references change', () => {
    const {code, unsupported} = microbitToPseudocode(`let n = 0
let label: string = "x"
function g(p: number) { if (p) { basic.showNumber(1) } }
function h(p: string) { if (!p) { basic.showNumber(2) } }
function k(q: string) { let p = 5; if (p) { basic.showNumber(3) } if (q) { basic.showNumber(4) } }
if (n) { basic.showNumber(5) }
if (!n) { basic.showNumber(6) }
if (label) { basic.showNumber(7) }
if ("" + n) { basic.showNumber(8) }
g(1)
h("")
k("")
`);
    assert.deepEqual(unsupported, []);
    const define = fn => code.split(/^(?=DEFINE )/m).find(s => s.startsWith(`DEFINE ${fn} `));
    assert.match(code, /IF not \(n = 0\) THEN:/);
    assert.match(code, /IF not \(not \(n = 0\)\) THEN:/);
    assert.match(code, /IF not \(\(length of label\) = 0\) THEN:/, 'a `let x: string` with no text value');
    assert.match(code, /IF not \(\(length of \(.* join n\)\) = 0\) THEN:/, 'a join is text');
    assert.match(define('g'), /IF not \(p = 0\) THEN:/, 'a number parameter');
    assert.match(define('h'), /IF not \(not \(\(length of p\) = 0\)\) THEN:/, 'a string parameter');
    assert.match(define('k'), /IF not \(p = 0\) THEN:/, 'a local number shadows nothing outside');
    assert.match(define('k'), /IF not \(\(length of q\) = 0\) THEN:/);
});

test('stringTypedReferences: declared text by scope, not by name', () => {
    const ast = parseMakeCodeTs(`let a: string = ""
let b: string[] = []
let c = ""
function f(a: number, d: string) { return a + d.length }
function g() { let d = 1; return d + a.length + b.length + c.length }
function h(n: number) { if (n) { let x = 1 } else { let x: string = ""; n = x.length } }
`);
    const marked = [];
    const refs = stringTypedReferences(ast);
    const walk = node => {
        if (!node || typeof node !== 'object') return;
        if (Array.isArray(node)) return node.forEach(walk);
        if (node.type === 'Identifier' && refs.has(node)) marked.push(node.name);
        for (const v of Object.values(node)) if (v && typeof v === 'object') walk(v);
    };
    walk(ast);
    // f's `d` (its parameter) and g's `a` (the global); not f's `a`, g's `d`,
    // b (string[]), c (text by value: isText's), nor h's `x`, which h binds
    // both as a number and as text.
    assert.deepEqual(marked.sort(), ['a', 'd']);
});

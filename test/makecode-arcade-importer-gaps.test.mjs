/**
 * Three Arcade importer gaps found by E9 (task E10 of
 * docs/OPEN-TASKS-2026-09-29.md), each measured three ways: the original
 * program in the pinned pxt-arcade 4.2.1 simulator, its import in Lite's VM,
 * and that import exported back (E2) in the simulator again.
 *
 * (1) TEXT TRUTHINESS on the fixed-sprite path. MakeCode's "" is false and
 *     every other text ("0" included) true. The base translator tested a bare
 *     value as `not (s = 0)`, which is Scratch's comparison: "" = 0 is false
 *     (a blank side compares as text) and "0" = 0 true, so both came out
 *     inverted, in conditions and (through E9's branch form) in values.
 *     Now the length is tested: `not ((length of s) = 0)`.
 * (2) FUNCTIONS ON THE FIXED-SPRITE PATH were defined after the last sprite,
 *     i.e. on it, whatever called them: a call from the sprite running the
 *     program found no such block, and a reporter gave 0 (the export refused
 *     it: "needs a known procedure name"). Now a function is defined on every
 *     sprite with a script that calls it, directly or through another
 *     function; one nobody calls stays on the setup sprite.
 * (3) `predicateBranches` (a second lowering of `&&`/`||` in an If/While/For
 *     test) was unreachable except through a `switch`: lowerLazyValues did not
 *     enter switch cases, so `&&`, `||`, `? :` and `i++` there stayed as
 *     written (`k++` and `f || n > 0` as values were refused or kept as text).
 *     lowerLazyValues now lowers case bodies; with that, no lazy operator is
 *     left in any If/While/For test and predicateBranches was removed.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {lowerLazyValues} from '../overlay/scratch-gui/src/lib/bw-makecode/lower-lazy-values.js';
import {parseMakeCodeTs} from '../overlay/scratch-gui/src/lib/bw-makecode/ts-import.js';
import {arcadeSimAvailable, compileArcade, runArcadeSim} from '../scripts/lib/makecode-arcade-sim.mjs';
import {SB3Creator, runProgram} from './helpers/bw-vm.mjs';

const SIM = arcadeSimAvailable() ? false : 'MakeCode runtime not synced (npm run sync:makecode) — no pxt-arcade compiler and simulator';
const pxtLog = async files => {
    const run = await runArcadeSim(await compileArcade(files), {ms: 500});
    assert.equal(run.error ?? null, null);
    return run.serial.map(line => line.text).join('');
};
const handlePath = code => /arcade create template/.test(code);

async function importAndRun (source) {
    const imported = arcadeToPseudocode(source);
    const creator = new SB3Creator();
    creator.parse(imported.code);
    assert.deepEqual(creator.warnings, []);
    const run = await runProgram(imported.code, {frames: 6});
    assert.deepEqual(run.errors, []);
    return {imported, creator, lite: (run.vm.runtime.bwArcadeDeviceState?.serial ?? '').replace(/\n/g, '')};
}

// ── (1) text truthiness, fixed-sprite path (no sprites, no runtime words)
const TEXT = `let s = ""
let t = "0"
if (s) { console.log("s-true") } else { console.log("s-false") }
if (!s) { console.log("nots-true") } else { console.log("nots-false") }
if (t) { console.log("t-true") } else { console.log("t-false") }
if (!t) { console.log("nott-true") } else { console.log("nott-false") }
s = "a"
if (s) { console.log("a-true") } else { console.log("a-false") }
while (!s) { s = "b" }
function id(v: any) { return v }
console.log(id(!s))
console.log(id(!t))
function f(p: string) { if (p) { console.log("p-true") } else { console.log("p-false") } }
f("")
f("0")
`;
// What pxt-arcade 4.2.1 logs (measured); the fixed path's truth values are 1/0.
const TEXT_LOG = 's-falsenots-truet-truenott-falsea-truefalsefalsep-falsep-true';

test('text truthiness on the fixed-sprite path is MakeCode\'s: "" false, "0" true', async () => {
    const {imported, creator, lite} = await importAndRun(TEXT);
    assert.equal(handlePath(imported.code), false, 'the fixed-sprite path');
    assert.deepEqual(imported.unsupported, []);
    assert.match(imported.code, /IF not \(\(length of s\) = 0\) THEN:/);
    assert.match(imported.code, /IF not \(\(length of \(arcade local p\)\) = 0\) THEN:/, 'a string parameter');
    assert.doesNotMatch(imported.code, /not \((s|t|arcade local p) = 0\)/);
    // The two logged truth values are 1/0 on this path.
    assert.equal(lite, TEXT_LOG.replace('a-truefalsefalse', 'a-true00'));
    assert.deepEqual(projectToArcade(creator.project).unsupported, []);
});

test('text truthiness: pxt-arcade logs the same for the original and for the export', {skip: SIM, timeout: 300000}, async () => {
    const {creator, lite} = await importAndRun(TEXT);
    assert.equal(await pxtLog(TEXT), TEXT_LOG);
    assert.equal(await pxtLog(projectToArcade(creator.project).files), lite);
});

// ── (2) functions on the fixed-sprite path with two sprites. info.showScore
// is a call the handle path does not take, so the program stays on the fixed
// path; its setup runs on `a`, the first sprite, and `b` is the last.
const FUNCTIONS = `let a = sprites.create(img\`1\`, SpriteKind.Player)
let b = sprites.create(img\`2\`, SpriteKind.Enemy)
function dbl(x: number) { return x * 2 }
function quad(x: number) { return dbl(dbl(x)) }
function unused() { console.log("never") }
info.showScore(true)
console.log(dbl(3))
console.log(quad(1))
`;
const sections = code => Object.fromEntries(code.split(/^(?=SPRITE )/m).filter(s => /^SPRITE /.test(s))
    .map(s => [/^SPRITE (\w+):/.exec(s)[1], s]));

test('a function is defined on the sprite whose script calls it, not after the last sprite', async () => {
    const {imported, creator, lite} = await importAndRun(FUNCTIONS);
    assert.equal(handlePath(imported.code), false, 'the fixed-sprite path');
    assert.deepEqual(imported.unsupported, ['info.showScore()']);
    const {a, b} = sections(imported.code);
    for (const fn of ['dbl', 'quad', 'unused']) {
        assert.match(a, new RegExp(`^DEFINE ${fn}\\b`, 'm'), `${fn} on a, the sprite running the program`);
        assert.doesNotMatch(b, new RegExp(`^DEFINE ${fn}\\b`, 'm'), `${fn} not on b, which calls nothing`);
    }
    assert.equal(lite, '64');
    assert.deepEqual(projectToArcade(creator.project).unsupported, []);
});

test('functions: pxt-arcade logs the same for the original and for the export', {skip: SIM, timeout: 300000}, async () => {
    const {creator} = await importAndRun(FUNCTIONS);
    assert.equal(await pxtLog(FUNCTIONS), '64');
    assert.equal(await pxtLog(projectToArcade(creator.project).files), '64');
});

// ── (3) a switch's case bodies are lowered like any other statements
const SWITCH = `let mySprite = sprites.create(img\`1\`, SpriteKind.Player)
let n = 1
let f = false
let calls = 0
function side(): boolean { calls += 1; return true }
function run() {
    switch (n) {
        case 1:
            if (f && side()) { console.log("both") } else { console.log("not both") }
            if (!f || side()) { console.log("either") }
            let r = f ? 10 : 20
            console.log(r)
            let k = 5
            let j = k++
            console.log(j)
            console.log(k)
            console.log(f || n > 0)
            break
        default:
            console.log("d")
    }
    console.log(calls)
}
run()
`;

test('&&, ||, ? : and i++ inside a switch case run as MakeCode runs them', async () => {
    const {imported, lite} = await importAndRun(SWITCH);
    assert.equal(handlePath(imported.code), true);
    assert.deepEqual(imported.unsupported, []);
    // side() is never called: `f && side()` and `!f || side()` short-circuit.
    assert.equal(lite, 'not botheither2056true0');
});

test('switch: pxt-arcade logs the same for the original and for the export', {skip: SIM, timeout: 300000}, async () => {
    const {creator, lite} = await importAndRun(SWITCH);
    assert.equal(await pxtLog(SWITCH), 'not botheither2056true0');
    assert.equal(await pxtLog(projectToArcade(creator.project).files), lite);
});

/** Every If/While/For test that still holds `&&` or `||` after lowering. */
const lazyTests = program => {
    const found = [];
    const lazy = node => node?.type === 'Binary' && ['&&', '||'].includes(node.op) ||
        node?.type === 'Unary' && node.op === '!' && lazy(node.argument);
    const visit = node => {
        if (!node || typeof node !== 'object') return;
        if (['If', 'While', 'For'].includes(node.type) && lazy(node.test)) found.push(node.type);
        for (const value of Object.values(node)) if (Array.isArray(value)) value.forEach(visit); else visit(value);
    };
    visit(program);
    return found;
};

test('after lowerLazyValues no If/While/For test holds && or || (why predicateBranches was removed)', () => {
    const shapes = [
        'if (a && b) { n = 1 }', 'while (a || b) { n += 1 }', 'for (let i = 0; i < 3 && !a; i++) { n = i }',
        'switch (n) { case 1: if (a && b) { n = 2 } break; default: while (!(a || b)) { n = 3 } }',
        'game.onUpdate(function () { switch (n) { case 1: for (let i = 0; a && i < 2; i++) { n = i } } })',
        'function g() { switch (n) { case 2: switch (m) { case 3: if (a || b && c) { n = 1 } } } }',
        'namespace q { export function h() { if (a && b) { n = 1 } } }'
    ];
    for (const shape of shapes) assert.deepEqual(lazyTests(lowerLazyValues(parseMakeCodeTs(shape))), [], shape);
    // And over every Arcade program the importer tests translate (E9's corpus).
    const corpus = JSON.parse(fs.readFileSync(new URL('./fixtures/makecode/arcade-import-inputs.json', import.meta.url), 'utf8'));
    let parsed = 0;
    for (const source of corpus.sources) {
        const ts = typeof source === 'string' ? source : source['main.ts'];
        if (!ts) continue;
        let program;
        try { program = parseMakeCodeTs(ts); } catch { continue; }
        parsed++;
        assert.deepEqual(lazyTests(lowerLazyValues(program)), [], ts.slice(0, 200));
    }
    assert.ok(parsed > 300, `parsed ${parsed} corpus programs`);
});

// N2b — the 8086 C route's numeric model: a 16-bit int, stated and refused by
// name. (Step 1 of this file pinned the ceiling: generateC typed every Scratch
// number `static long`, SmallerC's tiny (.COM) model has no `long`, so no
// program that stored a number compiled. Step 2 moved the emitter upstream to
// a per-core scalar type — `int` on i8086 — with a literal outside
// -32768..32767 refusing the whole program by name.) This file now pins:
// (1) SmallerC still fails by name on `long`, so the ceiling is real and the
// route's defence-in-depth guard has something to guard; (2) a numeric program
// COMPILES AND BUILDS through the route; (3) a literal past 16 bits is refused
// BEFORE the compiler with the emitter's own sentence, naming the literal and
// the range; (4) the emitter refusal for an unimplemented verb reaches the
// learner by name too, not as "the compiler produced no assembly". The reach
// over the gallery is measured by scripts/measure-i8086-numeric-reach.mjs.
//
// TRAP, written here so the next reader does not re-fall into it: a numeric
// VARIABLE emits `long`, but `set x to 5` does NOT — `x`/`y` are sprite
// COORDINATES (motion blocks), not variables. A corpus sweep keyed on
// "set <name> to <number>" would miscount x/y as variables; key on the emitted
// `long` instead, which is what cUsesLong does.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {dirname} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const L = new URL('../overlay/scratch-gui/src/lib/', import.meta.url);
const distUrl = new URL('smallerc-wasm/dist/', L);
const require = createRequire(import.meta.url);
const EXPORTS = {smlrpp: 'createSmlrpp', smlrc: 'createSmlrc'};
async function importFactory (name) {
    const url = new URL(`${name}.js`, distUrl);
    const source = await readFile(url, 'utf8');
    const filename = fileURLToPath(url);
    const module = {exports: {}};
    Function('module', 'exports', 'require', '__filename', '__dirname',
        source.replace(new RegExp(`export default ${EXPORTS[name]};\\s*$`), ''))(
        module, module.exports, require, filename, dirname(filename));
    return module.exports;
}
let cached = null;
async function toolchain () {
    if (!cached) {
        const {HEADERS} = await import(new URL('headers.js', distUrl).href);
        cached = {factories: await Promise.all(['smlrpp', 'smlrc'].map(importFactory)),
            headers: HEADERS, resolve: (n) => pathToFileURL(fileURLToPath(new URL(n, distUrl))).href};
    }
    return cached;
}
async function nodeCompileC (code, options) {
    const {compileWithToolchain} = await import(new URL('smallerc-wasm/compiler.js', L).href);
    return compileWithToolchain(code, options, await toolchain());
}
const sb3 = () => import(new URL('sb3-creator.js', L).href);
const route = () => import(new URL('bw-asm/assemble-route.js', L).href);

const cFor = async (src) => { const SB = (await sb3()).default; const c = new SB(); c.parse(src); return c.generateC(); };

const NUMERIC = 'DEVICE i8086\nPIN led = P1.0 OUTPUT\nWHEN flag clicked:\n  set counter to 5\n  turn on led';
const PIN_ONLY = 'DEVICE i8086\nPIN led = P1.0 OUTPUT\nWHEN flag clicked:\n  turn on led\n  turn off led';

test('SmallerC itself still fails by name on `long` — the ceiling the int-16 model exists for', async () => {
    const out = await nodeCompileC('static long counter = 0;\nint main(void) { counter = 5; return 0; }', {target: 'i8086'});
    assert.equal(out.success, false, 'SmallerC -seg16 must reject long');
    assert.match(out.error || '', /Unexpected token long/, 'the failure is specifically on `long`');
});

test('generateC types an i8086 numeric variable as `static int`, and no `long` reaches the C', async () => {
    const c = await cFor(NUMERIC);
    assert.match(c, /static int counter = 0;/, 'a stored number is a 16-bit int on this core');
    assert.doesNotMatch(c, /\blong\b/, 'no long token may reach SmallerC');
    assert.match(c, /-32768\.\.32767/, 'the emitted header states the range');
    // the sprite-coordinate trap: x/y are motion, not variables -> no variable at all
    const withXY = await cFor('DEVICE i8086\nPIN led = P1.0 OUTPUT\nWHEN flag clicked:\n  set x to 5\n  turn on led');
    assert.doesNotMatch(withXY, /static (int|long) x/, '`set x to 5` is a sprite coordinate, not a variable');
});

test('a numeric-variable program now COMPILES AND BUILDS through the route', {timeout: 120000}, async () => {
    const {compileC8086} = await route();
    const built = await compileC8086(await cFor(NUMERIC), {compileC: nodeCompileC});
    assert.ok(built.bytes && built.bytes.length, 'the numeric program must build to an image');
});

test('a literal past 16 bits is refused BEFORE the compiler, by name, with the range', async () => {
    const {compileC8086, AsmRouteError} = await route();
    const neverCompile = () => { throw new Error('the compiler must not be reached'); };
    const big = await cFor(NUMERIC.replace('set counter to 5', 'set counter to 40000'));
    assert.match(big, /^\/\* No C emitted for DEVICE I8086/, 'precondition: the emitter refused');
    await assert.rejects(
        () => compileC8086(big, {compileC: neverCompile}),
        (e) => {
            assert.ok(e instanceof AsmRouteError, 'refusal is an AsmRouteError');
            assert.equal(e.reason, 'source');
            assert.match(e.message, /40000/, 'names the literal');
            assert.match(e.message, /-32768 to 32767/, 'names the range');
            assert.match(e.message, /16-bit int/, 'names the model');
            assert.match(e.message, /N2b/, 'points at the tracking id');
            return true;
        });
});

test('an unimplemented verb\'s emitter refusal reaches the learner by name, not as "no assembly"', async () => {
    const {compileC8086, AsmRouteError} = await route();
    const neverCompile = () => { throw new Error('the compiler must not be reached'); };
    const withAdc = await cFor([
        'DEVICE i8086',
        'PIN led = P1.0 OUTPUT',
        'PIN pot = P1.1 ANALOG',
        'WHEN flag clicked:',
        '  set counter to read pot',
        '  turn on led'
    ].join('\n'));
    assert.match(withAdc, /No C emitted/, 'precondition: ADC has no i8086 C branch yet');
    assert.match(withAdc, /This program also uses: adc/,
        'the structured emitter refusal must name ADC before routing');
    await assert.rejects(() => compileC8086(withAdc, {compileC: neverCompile}), (e) => {
        assert.ok(e instanceof AsmRouteError);
        assert.equal(e.reason, 'source');
        assert.match(e.message, /This program also uses: adc/, 'names the verb');
        assert.doesNotMatch(e.message, /produced no assembly/);
        return true;
    });
});

test('a program with no hardware gets HOST C, and the route says so by name (31 of 280 gallery programs)', async () => {
    const {compileC8086, AsmRouteError, isHostC} = await route();
    const hostC = await cFor('WHEN flag clicked:\n  set counter to 5\n  say counter');
    assert.ok(isHostC(hostC), 'precondition: no PIN/PART line means host C');
    const neverCompile = () => { throw new Error('the compiler must not be reached'); };
    await assert.rejects(() => compileC8086(hostC, {compileC: neverCompile}), (e) => {
        assert.ok(e instanceof AsmRouteError);
        assert.match(e.message, /HOST C/); assert.match(e.message, /Add a PIN or PART line/);
        return true;
    });
    assert.equal(isHostC(await cFor(PIN_ONLY)), false, 'device C is not host C');
});

test('cUsesLong stays as defence in depth: keys on an emitted long, not on a comment', async () => {
    const {cUsesLong, emitterRefusal} = await route();
    assert.equal(cUsesLong(await cFor(NUMERIC)), false, 'the int-16 emitter produces no long');
    assert.equal(cUsesLong('static long x;\nint main(void){ return 0; }'), true);
    assert.equal(cUsesLong('/* this takes a long time */\nint main(void){ return 0; }'), false);
    assert.equal(emitterRefusal('int main(void){ return 0; }'), null, 'ordinary C is not a refusal');
});

test('a pin-only i8086 program still builds (the model changed nothing for it)', {timeout: 120000}, async () => {
    const {compileC8086} = await route();
    const built = await compileC8086(await cFor(PIN_ONLY), {compileC: nodeCompileC});
    assert.ok(built.bytes && built.bytes.length, 'a pin program must still build to an image');
});

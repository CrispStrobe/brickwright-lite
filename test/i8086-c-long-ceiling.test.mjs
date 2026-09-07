// N2b — the 8086 C route cannot compile a numeric variable, named honestly.
//
// SmallerC's tiny (.COM) model has no `long`, but generateC types every Scratch
// number as `static long`. So a program that stores a number ("set counter to
// 5") reaches the compiler and dies on a raw "Unexpected token long". This test
// pins three things: (1) the compiler really does fail by that name on the C
// generateC emits; (2) the C route now REFUSES before the compiler with a
// learner-actionable sentence; (3) a pin/shift-register program — which stores
// no number — is NOT refused. When N2b's fix lands (int-16 or a long-capable
// SmallerC), this file is where the exclusion is re-measured.
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

test('generateC types a numeric variable as `static long` (the thing SmallerC cannot take)', async () => {
    const c = await cFor(NUMERIC);
    assert.match(c, /static long counter = 0;/, 'a stored number must be emitted as long');
    // the sprite-coordinate trap: x/y are motion, not variables -> no long
    const withXY = await cFor('DEVICE i8086\nPIN led = P1.0 OUTPUT\nWHEN flag clicked:\n  set x to 5\n  turn on led');
    assert.doesNotMatch(withXY, /static long/, '`set x to 5` is a sprite coordinate, not a variable — no long');
});

test('SmallerC itself fails by name on the emitted `long`', async () => {
    const out = await nodeCompileC(await cFor(NUMERIC), {target: 'i8086'});
    assert.equal(out.success, false, 'SmallerC must reject the long-typed program');
    assert.match(out.error || '', /Unexpected token long/, 'the failure is specifically on `long`');
});

test('the C route REFUSES a numeric-variable program before the compiler, by name', async () => {
    const {compileC8086, AsmRouteError} = await route();
    // A seam that throws if the compiler is ever reached — the refusal must be
    // BEFORE it, so this never runs.
    const neverCompile = () => { throw new Error('the compiler must not be reached'); };
    const numericC = await cFor(NUMERIC);
    await assert.rejects(
        () => compileC8086(numericC, {compileC: neverCompile}),
        (e) => {
            assert.ok(e instanceof AsmRouteError, 'refusal is an AsmRouteError');
            assert.match(e.message, /number variable/, 'names the cause a learner can act on');
            assert.match(e.message, /no 32-bit long|has no .*long/i, 'names the SmallerC long limit');
            assert.match(e.message, /N2b/, 'points at the tracking id');
            return true;
        });
});

test('cUsesLong keys on the emitted long, not the pseudocode', async () => {
    const {cUsesLong} = await route();
    assert.equal(cUsesLong(await cFor(NUMERIC)), true);
    assert.equal(cUsesLong(await cFor(PIN_ONLY)), false, 'a pin-only program has no long');
    // a comment that merely says "long" must not trip it
    assert.equal(cUsesLong('/* this takes a long time */\nint main(void){ return 0; }'), false);
});

test('a pin-only i8086 program is NOT refused (the route still compiles + assembles it)', async () => {
    const {compileC8086} = await route();
    const built = await compileC8086(await cFor(PIN_ONLY), {compileC: nodeCompileC});
    assert.ok(built.bytes && built.bytes.length, 'a pin program must still build to an image');
});

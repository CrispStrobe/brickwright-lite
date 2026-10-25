/**
 * Executes the vendored SmallerC WASM. This file exists because of the defect
 * this repo has now found eight times: a property nothing drives is a property
 * nothing tests, and it looks identical to a passing one. A vendored .wasm that
 * no test runs is exactly that shape, so every assertion below runs the real
 * modules out of dist/ rather than inspecting them.
 *
 * Two specific traps are pinned here, both found by measurement during the
 * build (see lib/smallerc-wasm/BUILD-INFO.md):
 *
 *  1. STACK_SIZE. Emscripten's default 64 KiB stack makes smlrc, a recursive
 *     descent parser, produce a WRONG ANSWER at 17 levels of nested `if` --
 *     a bogus "Undeclared identifier" for a variable declared at the top of
 *     the function, not a crash and not a stack-overflow message.
 *  2. EXIT_RUNTIME. ucpp writes through stdio and relies on the flush at exit.
 *     Built with EXIT_RUNTIME=0 it exits 0 and leaves a ZERO-BYTE .i, and
 *     smlrc then emits a well-formed, empty `bits 16` file. A pass and a
 *     silent total failure are byte-distinguishable only if something looks.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {dirname} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const distUrl = new URL('../overlay/scratch-gui/src/lib/smallerc-wasm/dist/', import.meta.url);
const require = createRequire(import.meta.url);

const EXPORTS = {smlrpp: 'createSmlrpp', smlrc: 'createSmlrc'};

/**
 * Same CJS trick the SDCC harness uses, and for the same reason: the glue is
 * an ES module whose Emscripten body still needs the CommonJS scope. Asserting
 * the export line is present before stripping it is the point -- it proves the
 * BROWSER entry point still exists while the test exercises the Node branch.
 */
async function importFactory (name) {
    const url = new URL(`${name}.js`, distUrl);
    const source = await readFile(url, 'utf8');
    assert.match(source, new RegExp(`export default ${EXPORTS[name]};`),
        `${name}.js is not browser-importable`);
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
        cached = {
            factories: await Promise.all(['smlrpp', 'smlrc'].map(importFactory)),
            headers: HEADERS,
            resolve: name => pathToFileURL(fileURLToPath(new URL(name, distUrl))).href
        };
    }
    return cached;
}

const compiler = () => import('../overlay/scratch-gui/src/lib/smallerc-wasm/compiler.js');

test('two isolated WASM stages turn C into 16-bit NASM', {timeout: 30000}, async () => {
    const {compileWithToolchain} = await compiler();
    const result = await compileWithToolchain(
        'int add(int a, int b) { return a + b; }\nint main(void) { return add(2, 3); }\n',
        {target: 'i8086'}, await toolchain());
    assert.equal(result.error, undefined);
    assert.equal(result.success, true);
    assert.equal(result.format, 'nasm');
    // The whole point of -seg16: 16-bit code, 16-bit words.
    assert.match(result.asm, /^bits 16$/m);
    assert.match(result.asm, /^_add:$/m);
    assert.match(result.asm, /^_main:$/m);
    assert.match(result.asm, /\bmov\s+bp,\s*sp\b/);
    assert.doesNotMatch(result.asm, /\be[abcd]x\b/, '32-bit registers mean -seg16 was lost');
});

test('the preprocessor stage really runs: function-like macros and #if', {timeout: 30000}, async () => {
    const {compileWithToolchain} = await compiler();
    // Every construct here is one smlrc's BUILT-IN preprocessor rejects, so a
    // pass proves smlrpp ran and its output reached smlrc. If smlrpp were
    // skipped this is an "Invalid or unsupported preprocessor directive".
    const result = await compileWithToolchain([
        '#define SQ(x) ((x) * (x))',
        '#define N 3',
        '#if N > 2',
        'int big = 1;',
        '#elif N == 2',
        'int big = 2;',
        '#endif',
        'int main(void) { return SQ(N) + big; }'
    ].join('\n'), {target: 'i8086'}, await toolchain());
    assert.equal(result.error, undefined);
    assert.equal(result.success, true);
    // SQ(3) folds to 9 at compile time; seeing the constant proves the macro
    // was expanded rather than passed through.
    assert.match(result.asm, /mov\s+ax,\s*9\b/);
    assert.match(result.asm, /^_big:$/m);
});

test('bundled freestanding headers resolve without a network fetch', {timeout: 30000}, async () => {
    const {compileWithToolchain} = await compiler();
    const result = await compileWithToolchain(
        '#include <stdint.h>\n#include <stddef.h>\nuint16_t w = 65535u;\nint main(void) { return (int)sizeof(w); }\n',
        {target: 'i8086'}, await toolchain());
    assert.equal(result.error, undefined);
    assert.equal(result.success, true);
    assert.match(result.asm, /^_w:$/m);
});

test('hosted headers are absent on purpose, and say so at the #include', {timeout: 30000}, async () => {
    const {compileWithToolchain} = await compiler();
    // There is no libc and no linker on this path. #include <stdio.h> must
    // fail HERE, where the learner can see the cause, rather than compiling
    // clean and dying later on an undefined _printf.
    const result = await compileWithToolchain(
        '#include <stdio.h>\nint main(void) { printf("hi"); return 0; }\n',
        {target: 'i8086'}, await toolchain());
    assert.equal(result.success, false);
    assert.match(result.error, /stdio\.h/);
});

test('a bad program is diagnosed, not silently dropped', {timeout: 30000}, async () => {
    const {compileWithToolchain} = await compiler();
    const result = await compileWithToolchain(
        'int main(void) { return undeclared_thing; }\n', {target: 'i8086'}, await toolchain());
    assert.equal(result.success, false);
    // smlrc prints its diagnosis on STDOUT and exits 1. Capturing only stderr
    // would leave this empty -- which is what makes the assertion worth having.
    assert.match(result.error, /undeclared_thing/i);
});

test('STACK_SIZE canary: 24 nested ifs still compile correctly', {timeout: 30000}, async () => {
    const {compileWithToolchain} = await compiler();
    const depth = 24; // measured failure threshold on a 64 KiB stack is 17
    const src = ['int main(void) {', 'int x = 0;']
        .concat(Array.from({length: depth}, (_, i) => `if (x < ${i}) {`))
        .concat(['x = 1;'])
        .concat(Array.from({length: depth}, () => '}'))
        .concat(['return x;', '}']).join('\n');
    const result = await compileWithToolchain(src, {target: 'i8086'}, await toolchain());
    // The 64 KiB build fails this with `Undeclared identifier 'x'` -- for a
    // variable declared on line 2. That bogus diagnosis is the signature.
    assert.equal(result.error, undefined);
    assert.equal(result.success, true);
    assert.doesNotMatch(result.asm, /Compilation failed/);
    // One `cmp` per nesting level: proves the whole body survived, not just
    // that a file was produced.
    assert.ok((result.asm.match(/^\s+cmp\b/gm) || []).length >= depth,
        'nested bodies were dropped -- the classic small-stack corruption');
});

test('EXIT_RUNTIME canary: the preprocessor actually flushes its output', {timeout: 30000}, async () => {
    const {compileWithToolchain} = await compiler();
    // Built with EXIT_RUNTIME=0 the .i is zero bytes and smlrc emits a valid
    // but EMPTY `bits 16` file. Asserting real code came out is the only thing
    // that tells those two apart.
    const result = await compileWithToolchain(
        'int counter;\nint main(void) { counter = 7; return counter; }\n',
        {target: 'i8086'}, await toolchain());
    assert.equal(result.success, true);
    assert.match(result.asm, /^_counter:$/m);
    assert.match(result.asm, /\bmov\b/, 'no instructions: the .i was empty');
});

test('unsupported targets are refused rather than silently compiled as 8086', async () => {
    const {compileWithToolchain, localTargetSupported} = await compiler();
    assert.equal(localTargetSupported('i8086'), true);
    assert.equal(localTargetSupported('I8086'), true);
    assert.equal(localTargetSupported('stc12c5a60s2'), false);
    assert.equal(localTargetSupported(''), false);
    assert.equal(localTargetSupported(undefined), false);
    const result = await compileWithToolchain('int main(void){return 0;}',
        {target: 'z80'}, await toolchain());
    assert.equal(result.success, false);
    assert.equal(result.unsupported, true);
});

test('empty source is refused before a stage is started', async () => {
    const {compileWithToolchain} = await compiler();
    for (const bad of ['', '   \n\t ', null, undefined, 42]) {
        const result = await compileWithToolchain(bad, {target: 'i8086'}, await toolchain());
        assert.equal(result.success, false, `accepted ${JSON.stringify(bad)}`);
    }
});

// C IN, A RUNNING PROGRAM OUT — the whole browser-side chain, in one test.
//
//   C source -> SmallerC (BSD-2, compiled to WASM) -> NASM `bits 16`
//            -> our assembler (variant 80186) -> a .COM
//            -> the DOS bench -> an exit code
//
// Every link is local. Nothing here touches the network, which is the point:
// this is the path that works on a school firewall and on a plane.
//
// WHAT THIS ADDS OVER test/smallerc-wasm.test.mjs, which already proves the
// compiler: that test stops at assembly TEXT. This one carries the text
// through the assembler and the machine and checks the NUMBER THE C COMPUTES.
// Between those two stages sits the piece that has nothing to do with either
// tool and had to be discovered:
//
// SMALLERC EMITS A MODULE, NOT A PROGRAM. `_main` is a function and nothing
// calls it. Without the startup its own linker would supply, the machine runs
// the compiler's data and epilogue as an entry point, terminates in single
// digits and exits 0 — and a program that exits immediately is indistinguish-
// able from one that ran. Two hand probes were written and believed before
// that was the answer, which is why the assertion below is on the VALUE and
// not on "it terminated".
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

/** The WASM glue is an ES module whose Emscripten body wants CommonJS scope. */
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
        cached = {
            factories: await Promise.all(['smlrpp', 'smlrc'].map(importFactory)),
            headers: HEADERS,
            resolve: (name) => pathToFileURL(fileURLToPath(new URL(name, distUrl))).href
        };
    }
    return cached;
}

/** The real compiler, reached the way Node can reach it. The browser uses
 *  compile(), which resolves the same modules against document.baseURI. */
async function nodeCompileC (code, options) {
    const {compileWithToolchain} = await import(new URL('smallerc-wasm/compiler.js', L).href);
    return compileWithToolchain(code, options, await toolchain());
}

const route = () => import(new URL('bw-asm/assemble-route.js', L).href);
const bench = () => import(new URL('bw-debug/i8086-dos-bench.js', L).href);

/** Compile, assemble, boot, and hand back the exit code. */
async function runC (source, timeout = 2_000_000) {
    const {compileC8086} = await route();
    const built = await compileC8086(source, {compileC: nodeCompileC});
    const {createI8086DosBench} = await bench();
    // THE 186, and it is not optional: the compiler emits LEAVE in every
    // function epilogue. On an 8086 bench that is an undefined opcode, and the
    // program terminates cleanly with the wrong answer -- which is how the
    // gap was found rather than reasoned about.
    const b = await createI8086DosBench({
        bytes: built.bytes, format: built.format, variant: '80186'});
    let n = 0;
    while (n < timeout && !b.terminated) { b.step(); n++; }
    return {built, terminated: b.terminated, exitCode: b.exitCode, steps: n, screen: b.screenText()};
}

test('a C program compiles, assembles and RETURNS WHAT C SAYS', {timeout: 60000}, async () => {
    // Ordinary learner C: a global, a function with an argument, a loop,
    // arithmetic. 0+1+4+9+16+25+36+49 = 140.
    const r = await runC(`
int total;
int square(int n) { return n * n; }
int main(void) {
    int i;
    total = 0;
    for (i = 0; i < 8; i++) total = total + square(i);
    return total;
}
`);
    assert.ok(r.terminated, `the program did not reach its own exit in ${r.steps} steps`);
    assert.equal(r.exitCode, 140,
        'the exit code is the number the C source computes. If this is 0 with a tiny step '
        + 'count, the startup stub is missing and the machine ran the data section.');
    assert.ok(r.steps > 50,
        `${r.steps} steps is too few to have run this loop — an immediate exit is what a `
        + 'missing entry point looks like, and it would otherwise pass a terminated check');
});

test('the compiler reaches for 80186 instructions from ORDINARY C, so the route asks for one', async () => {
    // This is why compileC8086 assembles as '80186' rather than 8086: LEAVE is
    // in every function epilogue SmallerC emits. Assembling as an 8086 refuses
    // the compiler's own output at the first function, which is not a fact
    // about the learner's program.
    const {compileC8086} = await route();
    const built = await compileC8086('int f(int a) { return a + 1; }\nint main(void) { return f(1); }\n',
        {compileC: nodeCompileC});
    assert.match(built.asm, /\bleave\b/i, 'SmallerC emitted LEAVE for a plain function');

    const {assemble} = await import(new URL('bw-board/i8086-asm.js', L).href);
    assert.throws(() => assemble(built.asm, {}),
        /"LEAVE" is an 80186 instruction and this is an 8086/,
        'and an 8086 refuses it by name — so the variant is load-bearing, not decoration');
});

test('a C program that will not compile is refused with the compiler diagnostics', async () => {
    const {compileC8086} = await route();
    await assert.rejects(
        () => compileC8086('int main(void) { return nope; }\n', {compileC: nodeCompileC}),
        (e) => {
            // The message must not be a bare "failed" — smlrc prints its
            // diagnosis on STDOUT, and a caller that captured only stderr
            // would throw the whole explanation away.
            assert.match(String(e.message), /compiler|assembl/i);
            return true;
        });
});

test('the startup calls main and hands its value to DOS — both halves asserted', async () => {
    const {compileC8086} = await route();
    const built = await compileC8086('int main(void) { return 7; }\n', {compileC: nodeCompileC});
    assert.match(built.asm, /call\s+_main/i, 'something calls main');
    assert.match(built.asm, /mov\s+ah,\s*4Ch/i, 'and its return value leaves through INT 21h/4Ch');
    assert.equal((built.asm.match(/^\s*bits\s+16/gim) || []).length, 1,
        'exactly one `bits 16` — the compiler emits one and the startup emits one, '
        + 'and two is a duplicate directive rather than a harmless repeat');
});

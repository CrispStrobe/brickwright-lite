/**
 * The vendored 8051 compiler has to compile the app's OWN output — and when it
 * refuses a program that really is wrong, it has to say why.
 *
 * THE HISTORY, because this file is where it is written down.
 *
 * 1. The harness was losing the compiler's diagnosis. Emscripten's default exit
 *    path throws ExitStatus and unwinds before the buffered stderr is flushed,
 *    so a stage that diagnosed the program and exited(1) — the ordinary way a
 *    compiler reports a bad program — arrived with an EMPTY error list. The
 *    whole app could then say was "compiler produced no /work/main.asm", which
 *    names the missing file and not one thing about the cause. Five consecutive
 *    red CI runs of the debugger browser gate were spent on that sentence. The
 *    `quit`/`onAbort` handlers in sdcc-wasm/compiler.js recover it; the second
 *    test here is what keeps them.
 *
 * 2. With the diagnosis visible (2026-08-30) the vendored SDCC 4.5.0 mcs51
 *    build turned out to be unable to compile the idle fast-forward `generateC`
 *    emits into main() of every 8051 program that needs the cooperative
 *    scheduler. It reported `null function or function signature mismatch` on
 *    the app's output and a `FATAL Compiler Internal Error` at SDCCast.c:3528
 *    on a ten-line reduction. This file pinned that as a deliberate red-when-
 *    repaired assertion.
 *
 * 3. REPAIRED 2026-08-31 at the build layer, and the cause was neither the C
 *    nor any function-pointer cast: the Emscripten link took the default 64 KiB
 *    stack (emsdk >= 3.1.27), while SDCC's recursive AST walk goes ~158 KB deep
 *    on nested control flow. With ASSERTIONS=0 nothing checked, so the walk ran
 *    the stack pointer 95 KB past the bottom of its region and overwrote SDCC's
 *    own static data — which is why the same defect could present as a null
 *    indirect call, an out-of-bounds access, an "Undefined identifier" for a
 *    symbol declared three lines up, a bogus "too many parameters", or a hang.
 *    17 of the 44 generated 8051 examples failed; native SDCC, with its 8 MB
 *    stack, compiled all 44 in silence. emu8051-stc's build-sdcc-wasm.yml now
 *    links with -sSTACK_SIZE=8388608 -sSTACK_OVERFLOW_CHECK=1, and its
 *    acceptance suite byte-compares three real generateC() programs against
 *    native SDCC instead of hand-written fixtures only.
 *
 * So the first test below is the inversion of the old defect assertion: the
 * shape that could not compile now must. Keep it pointed at the app's real
 * output — a fixture that is not what generateC emits is how this rotted the
 * first time.
 */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {dirname, join} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import test from 'node:test';

import {compileWithToolchain} from '../overlay/scratch-gui/src/lib/sdcc-wasm/compiler.js';
import {INTEGRATED, REPO} from './helpers/bw-integrated.mjs';

const distUrl = new URL('../overlay/scratch-gui/src/lib/sdcc-wasm/dist/', import.meta.url);
const require = createRequire(import.meta.url);
const decodeBase64 = text => Uint8Array.from(Buffer.from(text, 'base64'));

async function importFactory (name) {
    const source = await readFile(new URL(`${name}.js`, distUrl), 'utf8');
    const module = {exports: {}};
    const filename = fileURLToPath(new URL(`${name}.js`, distUrl));
    Function('module', 'exports', 'require', '__filename', '__dirname',
        source.replace(/export default createSDCC;\s*$/, ''))(
        module, module.exports, require, filename, dirname(filename));
    return module.exports;
}

let cached = null;
async function toolchain () {
    if (cached) return cached;
    const packed = JSON.parse(await readFile(new URL('runtime.json', distUrl), 'utf8'));
    cached = {
        factories: await Promise.all(['cc1', 'sdcc', 'sdas8051', 'sdld'].map(importFactory)),
        runtime: new Map(Object.entries(packed.files).map(([name, data]) => [name, decodeBase64(data)])),
        resolve: name => pathToFileURL(fileURLToPath(new URL(name, distUrl))).href
    };
    return cached;
}

/** The idle fast-forward, reduced to the ten lines that used to reproduce the fault. */
const IDLE_SHAPE = `#include <stc12.h>
static volatile unsigned int bw_ms;
static unsigned char bw_calm;
void main(void) {
    for (;;) {
        unsigned int pass_ms = bw_ms;
        if (bw_ms == pass_ms) { if (++bw_calm >= 2u) { bw_calm = 0u; } }
        else bw_calm = 0u;
    }
}
`;

/** A program that is genuinely wrong, and stays wrong however the build changes. */
const REAL_ERROR = `#include <stc12.h>
void main(void) {
    bw_no_such_thing = 1;
    while (1) ;
}
`;

const isIntelHex = hex => /^:[0-9A-Fa-f]{8}/.test(hex.trim()) && /:00000001FF/i.test(hex);

test('the vendored SDCC compiles the idle fast-forward generateC emits',
    {timeout: 120000}, async () => {
        const result = await compileWithToolchain(IDLE_SHAPE, {target: 'stc12c5a60s2', symbols: true},
            await toolchain());

        assert.equal(result.success, true,
            'THE OFFLINE 8051 PATH IS BROKEN AGAIN. This is the shape generateC emits into '
            + 'main() whenever a program needs the cooperative scheduler, and LOCAL_8051_TARGETS '
            + 'has no fallback to the hosted compiler by design, so every 8051 Run ends here. '
            + `The compiler said: ${result.error}\n`
            + 'If the message is a WASM trap ("null function or function signature mismatch", '
            + '"memory access out of bounds") or a diagnosis of a symbol that is plainly '
            + 'declared, suspect the STACK rather than the program: SDCC decorates its AST by '
            + 'recursion and overruns a small Emscripten stack silently. See -sSTACK_SIZE in '
            + 'emu8051-stc/.github/workflows/build-sdcc-wasm.yml, and this file\'s header.');
        assert.ok(isIntelHex(result.hex), 'and what comes back is an Intel hex image');
        assert.ok(result.bytes > 100, `a real image, not a stub (${result.bytes} bytes)`);
    });

test('a refused program still comes back with the compiler\'s own words, not just a missing file',
    {timeout: 120000}, async () => {
        const result = await compileWithToolchain(REAL_ERROR, {target: 'stc12c5a60s2', symbols: true},
            await toolchain());

        assert.equal(result.success, false, 'this program really is wrong');
        // The point of this half of the file: the message carries the DIAGNOSIS.
        assert.match(result.error, /error 20: Undefined identifier 'bw_no_such_thing'/,
            'the compiler said what went wrong and the harness must pass it on. If this is empty '
            + 'again, Emscripten\'s exit path is eating stderr — see the `quit` handler in '
            + 'overlay/scratch-gui/src/lib/sdcc-wasm/compiler.js.');
        assert.match(result.error, /exited with status 1/, 'and that the stage exited rather than hung');
        // Deduplicated: quit() fires twice when an exit is followed by a trap.
        assert.equal(result.error.match(/exited with status 1/g).length, 1,
            'a message that repeats itself reads like two separate failures');
    });

test('a REAL generated 8051 program — scheduler, tasks and idle block — compiles to a hex',
    {timeout: 180000}, async () => {
        // Generated here rather than pasted in, so this tracks the transpiler.
        // 76-multimeter is the example that carries two cooperative tasks, and
        // therefore the idle fast-forward; a single-script program does not.
        const SB3Creator = (await import(join(INTEGRATED, 'src/lib/sb3-creator.js'))).default;
        const program = await readFile(
            join(REPO, 'overlay/scratch-gui/examples/76-multimeter/program.bw'), 'utf8');
        const creator = new SB3Creator();
        creator.parse(program);
        const code = creator.generateC();

        assert.match(code, /bw_calm/,
            '76-multimeter stopped emitting the idle fast-forward — pick another example that '
            + 'still does, or this test no longer covers the shape that broke the toolchain');
        assert.match(code, /PCON \|= 0x01/, 'and the 8051 spelling of it');

        const result = await compileWithToolchain(code, {target: 'stc12c5a60s2', symbols: true},
            await toolchain());
        assert.equal(result.success, true,
            `the app's own output does not compile offline: ${result.error}`);
        assert.ok(isIntelHex(result.hex), 'and it is an Intel hex image');
        assert.ok(result.bytes > 2000, `a whole program (${result.bytes} bytes of hex)`);

        // Compiling is not enough for the thing this repair is FOR. The debug
        // session needs a symbol table, and the first program that ever got far
        // enough to ask for one exposed a second defect underneath: a `case 0:`
        // emits no instructions of its own, so the C-line record for every
        // task's entry state was dropped and buildSymbolTable could only say
        // "bw_task0: no code address for state 0". See addCLineRecords.
        assert.equal(result.symbols_error, null,
            'the program compiles but the debugger cannot be told where anything is');
        assert.ok(result.symbols, 'so there is a symbol table');
        const tasks = result.symbols.scheduler.tasks;
        assert.ok(tasks.length >= 2, `both cooperative tasks are mapped (${tasks.length})`);
        for (const task of tasks) {
            assert.ok(task.yields.length > 0, `${task.name} has yield points`);
            assert.equal(task.yields[0].state, 0, `${task.name} is mapped from its entry state`);
            assert.ok(Number.isInteger(task.yields[0].addr) && task.yields[0].addr > 0,
                `${task.name} state 0 has a real code address, not a hole`);
        }
    });

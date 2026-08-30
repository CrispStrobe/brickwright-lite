/**
 * When the local 8051 compiler refuses a program, it must say WHY — and what
 * it currently refuses is the app's own output.
 *
 * TWO FACTS, MEASURED 2026-08-30, and the reason this file exists.
 *
 * 1. The harness was losing the compiler's diagnosis. Emscripten's default exit
 *    path throws ExitStatus and unwinds before the buffered stderr is flushed,
 *    so a stage that diagnosed the program and exited(1) — the ordinary way a
 *    compiler reports a bad program — arrived with an EMPTY error list. The
 *    whole app could then say was "compiler produced no /work/main.asm", which
 *    names the missing file and not one thing about the cause. Five consecutive
 *    red CI runs of the debugger browser gate were spent on that sentence.
 *
 * 2. With the diagnosis visible, the cause is not subtle, and it is not in the
 *    program. The vendored SDCC 4.5.0 mcs51 stage dies on the idle fast-forward
 *    that `generateC` emits into main() of EVERY 8051 program — unconditionally,
 *    at sb3-creator.js's `_core === '8051'` branch, so no project avoids it. On
 *    the app's own generated C it exits reporting `null function or function
 *    signature mismatch`; on the ten-line reduction below it manages a
 *    `FATAL Compiler Internal Error` first.
 *
 *    A null indirect call is a WASM table miss, which is a statement about the
 *    BINARY rather than about SDCC: three separate rewrites of the same idle
 *    logic (nested if, else-if chain, post-increment then test) all die, and
 *    native SDCC 4.2.0 compiles the identical preprocessed text through the
 *    identical `--c1mode` in silence. So the repair belongs to whoever builds
 *    static/sdcc-wasm — the Emscripten link, not the C.
 *
 *    While it stands, the shipped app cannot start an 8051 debug session at
 *    all: LOCAL_8051_TARGETS routing has no fallback to the hosted service, by
 *    design, so every 8051 Run ends in this refusal.
 *
 * The second test below therefore asserts a DEFECT, deliberately. It is the
 * only honest way to have the tree state a live failure without shipping red:
 * when the vendored toolchain is repaired that test goes red, and the fix is to
 * delete it, re-wire scripts/verify-debug-frames-watch.mjs into build.yml, and
 * drop its KNOWN_UNWIRED row in test/gate-coverage.test.mjs.
 */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {dirname} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import test from 'node:test';

import {compileWithToolchain} from '../overlay/scratch-gui/src/lib/sdcc-wasm/compiler.js';

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

async function toolchain () {
    const packed = JSON.parse(await readFile(new URL('runtime.json', distUrl), 'utf8'));
    return {
        factories: await Promise.all(['cc1', 'sdcc', 'sdas8051', 'sdld'].map(importFactory)),
        runtime: new Map(Object.entries(packed.files).map(([name, data]) => [name, decodeBase64(data)])),
        resolve: name => pathToFileURL(fileURLToPath(new URL(name, distUrl))).href
    };
}

/** The idle fast-forward, reduced to the ten lines that reproduce the fault. */
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

test('a refused program comes back with the compiler\'s own words, not just a missing file',
    {timeout: 60000}, async () => {
        const result = await compileWithToolchain(IDLE_SHAPE, {target: 'stc12c5a60s2', symbols: true},
            await toolchain());

        assert.equal(result.success, false, 'this input is the known-bad one; see the header');
        // The point of the whole file: the message carries the DIAGNOSIS.
        assert.match(result.error, /error 9: FATAL Compiler Internal Error/,
            'the compiler said what went wrong and the harness must pass it on. If this is empty '
            + 'again, Emscripten\'s exit path is eating stderr — see the `quit` handler in '
            + 'overlay/scratch-gui/src/lib/sdcc-wasm/compiler.js.');
        assert.match(result.error, /SDCCast\.c/, 'including where, which is what makes it reportable');
        assert.match(result.error, /exited with status 1/, 'and that the stage exited rather than hung');
        // Deduplicated: quit() fires twice when an exit is followed by a trap.
        assert.equal(result.error.match(/exited with status 1/g).length, 1,
            'a message that repeats itself reads like two separate failures');
    });

test('DEFECT, still live: the vendored SDCC cannot compile the idle fast-forward generateC emits',
    {timeout: 60000}, async () => {
        const result = await compileWithToolchain(IDLE_SHAPE, {target: 'stc12c5a60s2', symbols: true},
            await toolchain());

        assert.equal(result.success, false,
            'THIS TEST GOING RED IS GOOD NEWS: the vendored SDCC 4.5.0 mcs51 build now compiles the '
            + 'idle fast-forward, so the offline 8051 path works and the 8051 debug session can '
            + 'start. Delete this test, re-wire scripts/verify-debug-frames-watch.mjs into '
            + '.github/workflows/build.yml, and remove its row from KNOWN_UNWIRED in '
            + 'test/gate-coverage.test.mjs — in that one commit, once the gate is seen green.');
    });

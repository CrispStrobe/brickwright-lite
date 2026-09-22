// Code-tab DOS toolchain routes: Pascal via ACK, GW-BASIC — built on the
// compile-on-DOS mechanism (dos-compile.js). The MECHANISM is proven (a real
// compiler .EXE runs on the browser DOS bench and its output is read back);
// what remains per toolchain is its exact command sequence and output name,
// which depend on the real fetched binaries. Those carry `verified: false` and
// are NOT yet offered as code-tab language buttons — a route that might type the
// wrong command is worse than an honest "coming once verified". Confirm each
// against its media-lab bundle on a real run, set `verified: true`, then wire
// the language button.

import {compileAndRunOnDos} from './dos-compile.js';

// DOS-NATIVE toolchains only: the compiler/interpreter is ITSELF a 16-bit DOS
// program, so it runs on the DOS bench (dos-compile.js). GW-BASIC qualifies —
// GWBASIC.EXE is a real DOS .EXE (so do MASM/LINK). A HOST cross-compiler does
// NOT belong here (see HOSTED_TOOLCHAINS + the ACK note below).
/** @type {Record<string, object>} */
export const DOS_TOOLCHAINS = Object.freeze({
    // uBASIC (Adam Dunkels; Danyil Bohdan fork), BSD-3-Clause — a real 16-bit
    // MS-DOS interpreter cross-compiled with ia16-elf-gcc (media-lab project
    // `ubasic-dos`, ships as static/roms/ubasic.exe). It is an INTERPRETER, not
    // a compiler: it reads its program from PROG.BAS (INT 21h) and PRINTS the
    // result during its own run — so there is no output FILE (`outputName:
    // null`, `run: false`), and the caller reads the screen from the compile
    // stage. Needs the 80186 variant (ia16 emits LEAVE/PUSH imm/IMUL). VERIFIED:
    // test/dos-compile.test.mjs runs it on the real bench and reads back `42`.
    'ubasic': {
        id: 'ubasic', label: 'BASIC (uBASIC on DOS)', language: 'basic', kind: 'dos-native',
        source: 'ubasic-dos',                  // media-lab project; BSD-3-Clause interpreter
        compiler: 'ubasic.exe', compilerFormat: 'exe',
        variant: '80186',                      // ia16-elf-gcc targets the 186 instruction set
        sourceName: 'PROG.BAS', outputName: null,           // interpreted; output is on screen, not a file
        run: false, verified: true
    },
    'gwbasic': {
        id: 'gwbasic', label: 'GW-BASIC (on DOS)', language: 'basic', kind: 'dos-native',
        source: 'gwbasic',                     // MIT GW-BASIC source (Microsoft, 2020) — needs a built GWBASIC.EXE
        compiler: 'GWBASIC.EXE', compilerFormat: 'exe',
        sourceName: 'PROG.BAS', outputName: null,           // interpreted, not compiled to a file
        runKeys: 'LOAD"PROG.BAS\rRUN\r', run: false, verified: false
    }
});

// HOSTED toolchains: the compiler is a HOST program, so it does NOT run on the
// DOS bench — it compiles on a server and returns an 8086 .COM the bench then
// runs (the pattern SmallerC's hosted assembler already uses, HOSTED_ASSEMBLER
// in assemble-route.js). ACK is exactly this: its own docs say "ACK's compiler
// is a host tool (`ack -mmsdos86`)", it "runs on a modern host", NOT on the
// 8086. So libre Pascal via ACK needs a compile ENDPOINT, not compile-on-DOS —
// which is why an earlier `pascal-ack` DOS route was wrong and is corrected to
// this. `endpoint` is null until such a server is stood up.
/** @type {Record<string, object>} */
export const HOSTED_TOOLCHAINS = Object.freeze({
    'pascal-ack': {
        id: 'pascal-ack', label: 'Pascal (ACK)', language: 'pascal', kind: 'hosted',
        source: 'ack',                         // media-lab ACK project (BSD-3), built on the host
        endpoint: null,                        // a server running `ack -mmsdos86 -O`
        outputFormat: 'com', verified: false
    }
});

/**
 * Run a code-tab program through a DOS toolchain: fetch its binaries, mount the
 * source, and compile+run on the DOS bench. The toolchain fetcher is injected —
 * a test stubs it; production fetches the media-lab bundle (URL + sha per the
 * project's fetch.sh) — so this module needs no network and no bundled binaries.
 *
 * @param {string} routeId a key of DOS_TOOLCHAINS
 * @param {Uint8Array|string} source the user's program text/bytes
 * @param {object} opts
 * @param {(route: object) => Promise<{compiler: Uint8Array, support?: object}>} opts.fetchToolchain
 * @param {string} [opts.variant]
 * @param {number} [opts.maxSteps]
 * @returns {Promise<object>} the compileAndRunOnDos result
 */
export async function runDosToolchain(routeId, source, opts = {}) {
    const route = DOS_TOOLCHAINS[routeId];
    if (!route) {
        if (HOSTED_TOOLCHAINS[routeId]) {
            throw new Error(`${routeId} is a HOSTED toolchain (a host cross-compiler): ` +
                'it compiles on a server and returns a .COM, it does not run on the DOS ' +
                'bench — use its endpoint, not runDosToolchain');
        }
        throw new Error(`unknown DOS toolchain route: ${routeId}`);
    }
    if (typeof opts.fetchToolchain !== 'function') {
        throw new Error('runDosToolchain needs a fetchToolchain(route) => {compiler, support?}');
    }
    const {compiler, support} = await opts.fetchToolchain(route);
    if (!(compiler instanceof Uint8Array)) throw new Error('fetchToolchain returned no compiler bytes');
    return compileAndRunOnDos({
        compiler, compilerFormat: route.compilerFormat,
        support: support || {},
        sources: {[route.sourceName]: source},
        compileKeys: route.compileKeys, runKeys: route.runKeys,
        outputName: route.outputName, run: !!route.run,
        // A route may pin the CPU variant it was built for (uBASIC needs the
        // 80186 core: ia16-elf-gcc emits 186 opcodes). An explicit opts.variant
        // still wins, for a caller that knows better.
        variant: opts.variant || route.variant, maxSteps: opts.maxSteps
    });
}

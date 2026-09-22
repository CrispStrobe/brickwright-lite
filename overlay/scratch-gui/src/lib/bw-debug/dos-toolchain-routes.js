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
import {runCpmProgram} from './cpm-compile.js';

// DOS-NATIVE toolchains only: the compiler/interpreter is ITSELF a 16-bit DOS
// program, so it runs on the DOS bench (dos-compile.js). GW-BASIC qualifies —
// GWBASIC.EXE is a real DOS .EXE (so do MASM/LINK). A HOST cross-compiler does
// NOT belong here (see HOSTED_TOOLCHAINS + the ACK note below).
/** @type {Record<string, object>} */
export const DOS_TOOLCHAINS = Object.freeze({
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

// CP/M-80 (Z80) toolchain routes. Unlike the DOS routes above, the compiler is
// a HOST cross-compiler that emits a Z80 CP/M `.COM` (ACK's `z80`+`cpm` backend
// gives libre Pascal/C/Modula-2; SDCC gives libre C). The `.COM` does not run on
// the DOS bench — it runs on the CP/M bench (cpm-compile.js → cpm-z80.js), the
// Z80/CP/M twin of the DOS service layer. So, like the ACK-for-8086 route, these
// need a compile ENDPOINT (a server running `ack -mcpm` / `sdcc -mz80`); what is
// proven HERE is the second half — running a produced `.COM` correctly on the
// browser CP/M layer (test/cpm-z80.test.mjs runs a real SDCC-compiled program).
/** @type {Record<string, object>} */
export const CPM_TOOLCHAINS = Object.freeze({
    'ack-z80-cpm': {
        id: 'ack-z80-cpm', label: 'Pascal / C / Modula-2 (ACK, via CP/M)',
        language: 'pascal', kind: 'hosted-cpm',
        source: 'ack',            // Amsterdam Compiler Kit (BSD-3), z80 + cpm backend
        target: 'z80/cpm',
        endpoint: null,           // a server running `ack -mcpm -O`
        outputFormat: 'com',
        // The RUN path is proven (a cross-compiled Z80 CP/M .COM runs on the
        // bench); the ACK z80/cpm host build was not reproduced here, so the
        // route stays unverified and un-buttoned until an endpoint is stood up.
        runProven: true, verified: false
    },
    'sdcc-z80-cpm': {
        id: 'sdcc-z80-cpm', label: 'C (SDCC, via CP/M)', language: 'c', kind: 'hosted-cpm',
        source: 'sdcc',           // SDCC (GPL) z80 backend
        target: 'z80/cpm',
        endpoint: null,           // a server running `sdcc -mz80` + a CP/M crt0
        outputFormat: 'com',
        // A real SDCC-compiled Z80 CP/M .COM runs correctly on the bench
        // (test/cpm-z80.test.mjs); only the compile endpoint is not stood up.
        runProven: true, verified: false
    }
});

/**
 * Run a Z80 CP/M `.COM` a host cross-compiler already produced, on the browser
 * CP/M bench — the stage-two half of a hosted CP/M route. The compile stage
 * (fetching the toolchain, running `ack -mcpm`) is an endpoint's job; this is
 * the run.
 *
 * @param {string} routeId a key of CPM_TOOLCHAINS
 * @param {Uint8Array} com the produced `.COM` bytes
 * @param {object} [opts]
 * @param {Record<string,Uint8Array|string>} [opts.files] data files to mount
 * @param {string|number[]} [opts.keys]
 * @param {number} [opts.maxSteps]
 * @returns {Promise<object>} the runCpmProgram result
 */
export async function runCpmToolchain(routeId, com, opts = {}) {
    const route = CPM_TOOLCHAINS[routeId];
    if (!route) throw new Error(`unknown CP/M toolchain route: ${routeId}`);
    if (!(com instanceof Uint8Array)) {
        throw new Error('runCpmToolchain needs the produced .COM bytes (a host cross-compiler emits them)');
    }
    return runCpmProgram({bytes: com, files: opts.files, keys: opts.keys, maxSteps: opts.maxSteps});
}

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
        variant: opts.variant, maxSteps: opts.maxSteps
    });
}

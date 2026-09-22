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

/** @type {Record<string, object>} */
export const DOS_TOOLCHAINS = Object.freeze({
    'pascal-ack': {
        id: 'pascal-ack', label: 'Pascal (ACK, on DOS)', language: 'pascal',
        source: 'ack',                         // media-lab project that provides the toolchain
        compiler: 'ACK.EXE', compilerFormat: 'exe',
        sourceName: 'PROG.PAS', outputName: 'PROG.COM',
        compileKeys: 'ack -mpc86 PROG.PAS -o PROG.COM\r',   // best-effort — verify live
        run: true, verified: false
    },
    'gwbasic': {
        id: 'gwbasic', label: 'GW-BASIC (on DOS)', language: 'basic',
        source: 'gwbasic',                     // MIT GW-BASIC source (Microsoft, 2020)
        compiler: 'GWBASIC.EXE', compilerFormat: 'exe',
        sourceName: 'PROG.BAS', outputName: null,           // interpreted, not compiled
        runKeys: 'LOAD"PROG.BAS\rRUN\r', run: false, verified: false
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
    if (!route) throw new Error(`unknown DOS toolchain route: ${routeId}`);
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

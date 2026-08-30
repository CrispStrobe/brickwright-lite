/**
 * SDCC 4.5.0 as WebAssembly — lazy-loaded, behind a flag.
 *
 * NOT the default compiler. Byte-identity with native SDCC is not yet verified.
 * Enabled by: localStorage.setItem('bw-use-wasm-compiler', '1')
 *
 * The WASM artifacts (sdcc.js/wasm, sdas8051.js/wasm, sdld.js/wasm, include/)
 * are served as static assets from the build, fetched on first compile, and
 * immutably cached. Total: ~1.6 MiB gzip.
 *
 * The compile function matches the server API shape so the debug-runner can
 * consume it without modification — it returns { success, hex, symbols, ... }.
 *
 * Licence: SDCC is GPL-2+. This is a distribution of SDCC. Source tarball SHA-256
 * in BUILD-INFO.md. mcs51 port only.
 */

import {buildSymbolTable} from './symtab.js';

let loaded = false;
let sdcc = null;
let sdas = null;
let sdld = null;

/**
 * Whether the WASM compiler flag is set.
 */
export function isEnabled () {
    try {
        return localStorage.getItem('bw-use-wasm-compiler') === '1';
    } catch {
        return false;
    }
}

/**
 * Load the WASM toolchain. Called once on first compile.
 * @param {string} base - base URL for the static assets (e.g. document.baseURI)
 */
async function loadToolchain (base) {
    if (loaded) return;
    const resolve = (name) => new URL(`static/sdcc-wasm/${name}`, base).href;

    // Each Emscripten module is a factory function that returns a promise
    const [sdccMod, sdasMod, sdldMod] = await Promise.all([
        import(/* webpackIgnore: true */ resolve('sdcc.js')),
        import(/* webpackIgnore: true */ resolve('sdas8051.js')),
        import(/* webpackIgnore: true */ resolve('sdld.js'))
    ]);

    // Initialise each with locateFile pointing at the static dir
    const locateFile = (name) => resolve(name);
    sdcc = await (sdccMod.default || sdccMod)({ locateFile });
    sdas = await (sdasMod.default || sdasMod)({ locateFile });
    sdld = await (sdldMod.default || sdldMod)({ locateFile });
    loaded = true;
}

/**
 * Compile C source to Intel HEX using the WASM toolchain.
 *
 * Matches the server's POST /compile response shape:
 *   { success, hex?, error?, symbols?, symbols_error? }
 *
 * @param {string} code - C source
 * @param {object} opts
 * @param {string} opts.target - device target (e.g. 'stc12c5a60s2')
 * @param {boolean} opts.symbols - whether to extract symbol table
 * @returns {Promise<object>}
 */
export async function compile (code, { target = 'stc12c5a60s2', symbols = false } = {}) {
    try {
        await loadToolchain(document.baseURI);
    } catch (e) {
        return { success: false, error: `WASM toolchain failed to load: ${e.message}` };
    }

    try {
        // Write source to the virtual filesystem
        sdcc.FS.writeFile('/input.c', code);

        // Run sdcc: compile C → .asm
        const sdccArgs = [
            '-mmcs51',
            `--model-${target.includes('stc89') ? 'small' : 'small'}`,
            ...(symbols ? ['--debug'] : []),
            '-c', '/input.c',
            '-o', '/input.rel'
        ];
        const sdccResult = sdcc.callMain(sdccArgs);
        if (sdccResult !== 0) {
            const stderr = ''; // TODO: capture stderr from Emscripten
            return { success: false, error: `sdcc exited with code ${sdccResult}. ${stderr}` };
        }

        // Run sdas8051: assemble (sdcc already does this, but if needed)
        // For the mcs51 port, sdcc calls the assembler internally

        // Run sdld: link → .ihx
        const sdldArgs = [
            '-nui',
            '-i', '/output.ihx',
            '/input.rel'
        ];
        const sdldResult = sdld.callMain(sdldArgs);
        if (sdldResult !== 0) {
            return { success: false, error: `sdld exited with code ${sdldResult}` };
        }

        // Read the output
        const hex = sdcc.FS.readFile('/output.ihx', { encoding: 'utf8' });

        const result = {
            success: true,
            hex,
            base64: btoa(hex)
        };

        // Protocol 004 symbol extraction is implemented locally. It remains
        // fail-closed: the linked .cdb, not the compile-only one, must carry
        // every address used by the debugger.
        if (symbols) {
            try {
                const candidates = ['/output.cdb', '/input.cdb'];
                const cdbPath = candidates.find(path => sdcc.FS.analyzePath(path).exists);
                if (!cdbPath) throw new Error('the WASM link wrote no .cdb file');
                const cdb = sdcc.FS.readFile(cdbPath, {encoding: 'utf8'});
                result.symbols = buildSymbolTable(cdb, code, {target, device: target});
                result.symbols_error = null;
            } catch (e) {
                result.symbols = null;
                result.symbols_error = `local symbol extraction failed: ${e.message}`;
            }
        }

        return result;
    } catch (e) {
        return { success: false, error: `WASM compilation failed: ${e.message}` };
    }
}

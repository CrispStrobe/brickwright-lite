/**
 * Can this runtime run the local toolchain at all?
 *
 * TN6a's gate, and it exists because of a measurement rather than a guess.
 * `@yowasp/yosys`'s WebAssembly needs **WasmGC**, and its module also uses the
 * 2024 exception-handling opcodes (`try_table`, 0x1f). Node 20 cannot load it
 * even with `--experimental-wasm-gc`; the compile fails at that opcode.
 *
 * WHY THAT MATTERS MORE HERE THAN USUALLY. The local tier exists for people
 * without a fast connection or with sources that may not leave their machine —
 * and the audience this project names FIRST is school Chromebooks, which are
 * exactly the devices most likely to be running an older browser. So "downloads
 * 78 MB and then cannot start" is a realistic outcome for the very users the
 * tier is for, and the only honest response is to find out BEFORE downloading
 * anything.
 *
 * The backend selector is already fail-closed: a backend that cannot run is not
 * offered, because a picker entry nobody can select is a lie the front end tells
 * for us. This is what makes `localAvailable` answerable.
 *
 * Feature-probed, never version-sniffed. A user agent string is a claim; a
 * module that compiles is a fact.
 *
 * @module
 */

/** The smallest module that requires WasmGC: a struct type in a recursion group. */
const WASM_GC_PROBE = Uint8Array.from([
    0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00,
    0x01, 0x06, 0x01, 0x5f, 0x01, 0x7f, 0x00
]);

/** A tag section — the exception-handling family the toolchain compiles against. */
const WASM_EH_PROBE = Uint8Array.from([
    0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00,
    0x01, 0x04, 0x01, 0x60, 0x00, 0x00,
    0x0d, 0x03, 0x01, 0x00, 0x00
]);

const compiles = bytes => {
    try {
        if (typeof WebAssembly === 'undefined') return false;
        new WebAssembly.Module(bytes);
        return true;
    } catch {
        return false;
    }
};

/**
 * @returns {{wasm: boolean, wasmGC: boolean, exceptions: boolean,
 *            canRunLocalToolchain: boolean, missing: string[]}}
 */
export function detectWasmCapabilities (impl = null) {
    const test = impl || compiles;
    const wasm = typeof WebAssembly !== 'undefined';
    const wasmGC = wasm && test(WASM_GC_PROBE);
    const exceptions = wasm && test(WASM_EH_PROBE);

    const missing = [];
    if (!wasm) missing.push('WebAssembly');
    if (wasm && !wasmGC) missing.push('WasmGC');
    if (wasm && !exceptions) missing.push('exception handling');

    return {wasm, wasmGC, exceptions,
        canRunLocalToolchain: wasm && wasmGC && exceptions,
        missing};
}

/**
 * A reason a user can act on, or null when the toolchain can run.
 *
 * Deliberately names the missing feature rather than saying "unsupported
 * browser": a reader who is told "WasmGC" can look it up, and one who is told
 * "unsupported" can only guess whether updating would help.
 */
export function localToolchainRefusal (caps = detectWasmCapabilities()) {
    if (caps.canRunLocalToolchain) return null;
    if (!caps.wasm) {
        return {code: 'no-webassembly',
            reason: 'This browser has no WebAssembly, so the local toolchain cannot run here.'};
    }
    return {code: 'wasm-features-missing',
        reason: `The local toolchain needs ${caps.missing.join(' and ')}, which this browser `
            + 'does not provide. A newer browser would fix it. Nothing has been downloaded — '
            + 'this is checked before the 78 MB, not after.'};
}

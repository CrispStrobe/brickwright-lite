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

/**
 * A module every WebAssembly runtime accepts: one empty function type.
 *
 * THE CONTROL, and it exists because its absence hid a real bug. The first
 * version of the GC probe below declared a type-section size of 6 where its
 * payload was 5 bytes. Every runtime rejected it as malformed — "section (code
 * 1, Type) extends past" — so the probe reported "no WasmGC" EVERYWHERE,
 * including on Chromium 151, which supports it perfectly well. The local tier
 * would have been refused on every browser forever, with a confident message
 * naming a feature that was present.
 *
 * A probe that cannot tell "the feature is missing" from "the probe is broken"
 * is worse than no probe. If this control fails to compile, the detector says so
 * rather than blaming the runtime.
 */
const WASM_CONTROL_PROBE = Uint8Array.from([
    0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00,
    0x01, 0x04, 0x01, 0x60, 0x00, 0x00
]);

/**
 * WasmGC: a struct type definition. Section size 5 = count + 0x5f + field count
 * + i32 + immutability.
 * Verified 2026-09-16: rejected by Node 20 ("Unknown type code 0x5f"), accepted
 * by Chromium 151.
 */
const WASM_GC_PROBE = Uint8Array.from([
    0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00,
    0x01, 0x05, 0x01, 0x5f, 0x01, 0x7f, 0x00
]);

/**
 * Exception handling as the toolchain actually uses it: a function body
 * containing `try_table` (0x1f), the 2024 proposal.
 *
 * NOT a tag section. An earlier version of this probe tested for one, and Node
 * 20 accepts tag sections happily while failing to compile yosys at opcode 0x1f
 * — so that probe passed on a runtime that cannot run the toolchain, which is
 * the exact failure mode a capability check exists to prevent.
 * Verified 2026-09-16: rejected by Node 20, accepted by Chromium 151.
 */
const WASM_EH_PROBE = Uint8Array.from([
    0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00,
    0x01, 0x04, 0x01, 0x60, 0x00, 0x00,
    0x03, 0x02, 0x01, 0x00,
    0x0a, 0x08, 0x01, 0x06,
    0x00, 0x1f, 0x40, 0x00, 0x0b,
    0x0b
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
    const controlPassed = wasm && test(WASM_CONTROL_PROBE);
    const wasmGC = controlPassed && test(WASM_GC_PROBE);
    const exceptions = controlPassed && test(WASM_EH_PROBE);

    const missing = [];
    if (!wasm) missing.push('WebAssembly');
    if (wasm && !controlPassed) missing.push('a working probe');
    if (controlPassed && !wasmGC) missing.push('WasmGC');
    if (controlPassed && !exceptions) missing.push('exception handling (try_table)');

    return {wasm, controlPassed, wasmGC, exceptions,
        canRunLocalToolchain: controlPassed && wasmGC && exceptions,
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
    if (!caps.controlPassed) {
        // Not the runtime's fault, and saying otherwise would send someone to
        // upgrade a browser that was never the problem.
        return {code: 'probe-broken',
            reason: 'The capability check itself failed on a module every runtime accepts, '
                + 'so it cannot tell whether this browser supports the toolchain. Refusing '
                + 'rather than guessing — and this is a bug here, not in your browser.'};
    }
    return {code: 'wasm-features-missing',
        reason: `The local toolchain needs ${caps.missing.join(' and ')}, which this browser `
            + 'does not provide. A newer browser would fix it. Nothing has been downloaded — '
            + 'this is checked before the 78 MB, not after.'};
}

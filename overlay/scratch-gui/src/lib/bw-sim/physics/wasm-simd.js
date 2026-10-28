// A minimal standard SIMD instruction: v128.const followed by drop.
// No shared memory, threads or optional relaxed SIMD features are required.
const PROBE = new Uint8Array([
    0, 97, 115, 109, 1, 0, 0, 0,
    1, 4, 1, 96, 0, 0,
    3, 2, 1, 0,
    10, 23, 1, 21, 0, 253, 12,
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    26, 11
]);

export const supportsWasmSimd = (wasm = globalThis.WebAssembly) => {
    if (!wasm || typeof wasm.validate !== 'function') return false;
    try {
        return wasm.validate(PROBE);
    } catch (error) {
        return false;
    }
};

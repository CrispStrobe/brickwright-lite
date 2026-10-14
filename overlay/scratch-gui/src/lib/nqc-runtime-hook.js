/**
 * Give the RCX extension a local compiler, so it never needs the network.
 *
 * The extension (CrispStrobe/lego_rcx) looks for `runtime.nqcCompile` at call
 * time and uses the hosted service only if it is absent. It looks it up every
 * time rather than caching, precisely so a host may install it late — which is
 * what this does, at VM construction, before any extension has loaded.
 *
 * THE CONTRACT IS `(source, target) -> {ok, bytes, log}`, and it is the
 * extension's, not ours. Get a key name wrong and nothing throws: the
 * extension reads `result.ok` as undefined, reports "compilation failed", and
 * the user is told their program is broken when it is not. The shape is
 * asserted in test/nqc-wasm.test.mjs against the same entry point.
 *
 * WHY THE IMPORT IS DYNAMIC. The glue and the .wasm are 358 kB and the great
 * majority of sessions never touch an RCX. `import()` inside the call means
 * the cost is paid by the first compile and by nothing else; installing the
 * hook itself costs one closure.
 */

/**
 * @param {object} vm the scratch-vm instance
 * @returns {boolean} true if the hook was installed
 */
const installNqcCompiler = function (vm) {
    const runtime = vm && vm.runtime;
    if (!runtime) return false;
    // Idempotent, and it does not overwrite. A host that has already supplied
    // its own compiler — a desktop build shelling out to a native nqc, say —
    // has a better one than this, and must win.
    if (typeof runtime.nqcCompile === 'function') return false;

    runtime.nqcCompile = async function (source, target) {
        try {
            const {compile} = await import(
                /* webpackChunkName: "nqc-wasm" */ './nqc-wasm/compiler.js');
            return await compile(source, target);
        } catch (e) {
            // A load failure has to arrive as a refusal in the shape above,
            // not as a rejected promise: the extension awaits this without a
            // catch, and an exception there would surface as an unhandled
            // rejection with the fallback never tried.
            return {ok: false, log: `the local NQC compiler could not be loaded: ${e && e.message || e}`};
        }
    };
    return true;
};

export default installNqcCompiler;
export {installNqcCompiler};

/**
 * NQC as WebAssembly: NQC source in, an `.rcx` image out, with no network.
 *
 * WHY THIS IS VENDORED AND SDCC IS NOT
 * ------------------------------------
 * NQC is MPL-2.0. This app is BSD-3-Clause, and `scripts/verify-no-gpl-in-build.mjs`
 * gates what may enter the build output — MPL is not what it blocks, so unlike
 * SDCC this ships in the bundle, and the RCX path works offline and on any
 * platform the browser runs on. There is a server route too
 * (CrispStrobe/legacy-lego-compiler); it exists for hosts that have not got
 * this module, and is strictly the slower of the two.
 *
 * WHAT THIS IS NOT
 * ----------------
 * It compiles. It does not talk to a brick. The bytes it returns are handed to
 * `lib/rcx/rcx-protocol.js`, which frames them for the infrared link, and
 * neither module imports the other.
 *
 * Nor does it put firmware on the brick. NQC's output runs on LEGO's standard
 * firmware, which is proprietary and which the user supplies; see
 * docs/RCX-FIRMWARE.md. A successful compile against an empty brick produces
 * an image that will not run, and that is not a bug here.
 *
 * THE OUTPUT IS A CONTAINER, NOT A PAYLOAD. A `.rcx` file begins with the
 * ASCII magic `RCXI` and holds one chunk per task and subroutine; the caller
 * downloads them one at a time. `isRcxImage()` below is the cheap check that
 * what came back is that, rather than a compiler diagnostic that happened to
 * reach a file.
 */

/**
 * The targets NQC itself accepts after `-T`, spelled as NQC spells them.
 *
 * Only RCX and RCX2 are things this app has hardware notions of; the other
 * four are accepted because refusing them would be this module inventing a
 * restriction the compiler does not have. RCX2 is the default because it is
 * what firmware 0309 — the one anyone still has — presents.
 */
export const NQC_TARGETS = Object.freeze(['RCX', 'RCX2', 'CM', 'Scout', 'Spy', 'Swan']);
export const NQC_DEFAULT_TARGET = 'RCX2';

export function normaliseTarget (target) {
    const wanted = String(target || '').trim().toLowerCase();
    if (!wanted) return NQC_DEFAULT_TARGET;
    return NQC_TARGETS.find(name => name.toLowerCase() === wanted) || null;
}

/** `RCXI`, the first four bytes of every image NQC emits. */
export function isRcxImage (bytes) {
    return bytes instanceof Uint8Array && bytes.length >= 4 &&
        bytes[0] === 0x52 && bytes[1] === 0x43 && bytes[2] === 0x58 && bytes[3] === 0x49;
}

const IS_NODE = typeof process === 'object' && typeof process?.versions?.node === 'string';

let loaded = null;

/**
 * Load the Emscripten glue.
 *
 * The shipped file is UMD with one appended `export default` line (see
 * build.sh step 4), so a browser can simply `import()` it. Node cannot: the
 * glue's Node branch expects the CommonJS scope (`require`, `__dirname`) it
 * uses to reach `fs`, and an `import()` throws `require is not defined` before
 * anything runs. So Node evaluates the SAME source as CommonJS, minus only the
 * trailing export line — byte-for-byte the program the browser runs, which is
 * the only thing that makes the test suite evidence about the shipped path.
 *
 * Lifted deliberately from src/lib/smallerc-wasm/compiler.js rather than
 * abstracted into a shared helper: the two differ in which line is stripped,
 * and a shared helper that took that as a parameter would be longer than
 * either copy and harder to read than both.
 */
async function importGlue (url) {
    if (!IS_NODE) return (await import(/* webpackIgnore: true */ url)).default;
    const [{readFile}, {createRequire}, {dirname}, {fileURLToPath}] = await Promise.all([
        import(/* webpackIgnore: true */ 'node:fs/promises'),
        import(/* webpackIgnore: true */ 'node:module'),
        import(/* webpackIgnore: true */ 'node:path'),
        import(/* webpackIgnore: true */ 'node:url')
    ]);
    const file = url.startsWith('file:') ? fileURLToPath(url) : url;
    const source = await readFile(file, 'utf8');
    const module = {exports: {}};
    Function('module', 'exports', 'require', '__filename', '__dirname',
        source.replace(/\nexport default createNQC;\s*$/, ''))(
        module, module.exports, createRequire(file), file, dirname(file));
    return module.exports.default || module.exports;
}

/**
 * @param {string} [dir] directory holding nqc.js and nqc.wasm, with a trailing
 *                       slash. Defaults to where each environment actually has
 *                       them: `static/nqc-wasm/` off the page in a browser,
 *                       and the vendored `dist/` under Node — which is what
 *                       lets the test suite drive THIS function rather than a
 *                       loader of its own, so the loading is covered too.
 * @returns {Promise<object>} {factory, resolve}
 *
 * Memoised on first success, and deliberately without regard to `dir`: a
 * process that wanted two different builds of NQC at once would be doing
 * something this module has no answer for, and silently serving it the first
 * one is better than pretending.
 */
export async function loadToolchain (dir) {
    if (loaded) return loaded;
    const from = dir || (typeof document === 'object' ?
        new URL('static/nqc-wasm/', document.baseURI).href :
        new URL('dist/', import.meta.url).href);
    loaded = (async () => {
        const resolve = name => new URL(name, from).href;
        return {factory: await importGlue(resolve('nqc.js')), resolve};
    })();
    try {
        return await loaded;
    } catch (e) {
        loaded = null;
        throw e;
    }
}

/**
 * @param {string} code NQC source
 * @param {string} [target] one of NQC_TARGETS
 * @param {object} toolchain from loadToolchain()
 * @returns {Promise<object>} {ok, bytes?, log, target}
 *
 * The result shape is the one `runtime.nqcCompile` promises its callers —
 * `{ok, bytes, log}` — because the RCX extension treats the local and the
 * served compiler as interchangeable and picks whichever it finds. Changing
 * these key names breaks that substitution silently, with the extension
 * falling back to the network and nobody noticing anything but latency.
 */
export async function compileWithToolchain (code, target, toolchain) {
    const wanted = normaliseTarget(target);
    if (!wanted) {
        return {ok: false, log: `unknown NQC target "${target}"; expected one of ${NQC_TARGETS.join(', ')}`,
            target: String(target)};
    }
    if (typeof code !== 'string' || !code.trim()) {
        return {ok: false, log: 'no NQC source was supplied', target: wanted};
    }

    const log = [];
    // NQC reports diagnostics on STDERR and nothing useful on stdout, but both
    // are kept: a compiler that starts saying something on stdout should be
    // heard rather than silently ignored, and the cost of being wrong the
    // other way is an error message the user cannot see.
    let aborted = null;
    // The stage's exit code leaks into the host process under Node — the same
    // Emscripten behaviour documented at length in the SmallerC wrapper, where
    // it turned a passing test file into a red one. Read it, then put back
    // whatever the host had.
    const hostExitCode = IS_NODE ? process.exitCode : undefined;
    let status = 0;
    const module = await toolchain.factory({
        thisProgram: 'nqc',
        noInitialRun: true,
        locateFile: file => toolchain.resolve(file),
        preRun: [M => {
            M.FS.writeFile('/program.nqc', code);
        }],
        print: line => log.push(line),
        printErr: line => log.push(line),
        quit: code_ => {
            if (code_) status = code_;
        },
        onAbort: why => {
            aborted = String(why);
        }
    });
    let rc = 0;
    try {
        // `-TRCX2`, not `-T RCX2`: NQC's option parser takes the target as
        // part of the flag and rejects the separated form with a bare "Usage
        // error", which says nothing about which option was wrong.
        rc = module.callMain([`-T${wanted}`, '-O/program.rcx', '/program.nqc']);
    } catch (e) {
        aborted = aborted || String(e && e.message || e);
    }
    if (IS_NODE) {
        if (!status && process.exitCode) status = process.exitCode;
        process.exitCode = hostExitCode;
    }
    const text = log.join('\n');
    if (aborted) return {ok: false, log: text ? `${text}\n${aborted}` : aborted, target: wanted};

    let bytes = null;
    try {
        bytes = new Uint8Array(module.FS.readFile('/program.rcx'));
    } catch {
        bytes = null;
    }

    // NQC's own exit status is the authority on whether it succeeded, but it
    // is not sufficient: a compiler that exits 0 having written nothing, or
    // having written something that is not an image, must not be reported as
    // a success to a caller that is about to send those bytes to a brick.
    if (rc !== 0 || status !== 0 || !bytes) {
        return {ok: false, log: text || `nqc exited ${rc || status} without producing an image`, target: wanted};
    }
    if (!isRcxImage(bytes)) {
        return {ok: false, target: wanted,
            log: `${text}\nnqc exited 0 but its output does not begin with the RCXI magic`.trim()};
    }
    return {ok: true, bytes, log: text, target: wanted};
}

/**
 * The convenience entry point: loads the toolchain if it is not loaded and
 * compiles. `compileWithToolchain` stays separate so a test can inject a
 * locally loaded toolchain and never touch `document.baseURI`.
 */
export async function compile (code, target, base) {
    return compileWithToolchain(code, target, await loadToolchain(base));
}

export default compile;

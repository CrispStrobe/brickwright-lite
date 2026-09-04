/**
 * SmallerC (smlrpp + smlrc) as two isolated single-threaded WASM stages.
 *
 * WHAT THIS PRODUCES, AND WHAT IT DELIBERATELY DOES NOT
 * -----------------------------------------------------
 * `compile()` turns C into NASM `bits 16` assembly text for the 8086, and stops
 * there. It does not assemble, link, or produce a binary image. That is not an
 * unfinished edge: SmallerC's own linker (smlrl) and driver (smlrcc) are NOT
 * built or shipped, because smlrcc drives its stages with fork/exec, which
 * WebAssembly has no equivalent of -- the orchestration below IS the driver.
 *
 * The caller that turns this assembly into bytes is `bw-board/i8086-asm.js`.
 * As of this commit that assembler is MASM-dialect and rejects SmallerC's
 * output on line 1 (`BITS` is not a directive it knows); `SECTION`, `RESB` and
 * NASM's `align`/`alignb` are likewise unknown. So this module is CORRECT and
 * TESTED on its own terms and is NOT yet reachable end-to-end. Wiring it up
 * needs a NASM front end in the assembler, which lives in the vendored
 * bw-board tree (`npm run sync:bwboard` overwrites local edits) and is
 * therefore out of this module's reach. See ROADMAP.md 3.8.2b.
 *
 * Nothing in the app imports this yet, on purpose: an unreachable compiler
 * that reports honestly beats one wired into a UI that cannot consume it.
 */
import {HEADERS} from './dist/headers.js';

/**
 * Targets this compiler can serve locally. Keyed the way
 * `bw-asm/assemble-route.js` canonicalises a device, so a caller that already
 * did `asmTargetForDevice()` can pass the result straight in.
 *
 * `-seg16` is the flag that makes this 16-bit: in cgx86.c it selects
 * FormatSegmented with SizeOfWord = 2. Without it smlrc emits 32-bit code.
 */
const LOCAL_TARGETS = Object.freeze({
    i8086: Object.freeze({model: '-seg16', word: 2})
});

let loaded = null;

export function localTargetSupported (target) {
    return Object.prototype.hasOwnProperty.call(LOCAL_TARGETS, String(target || '').toLowerCase());
}

const IS_NODE = typeof process === 'object' && typeof process?.versions?.node === 'string';

/**
 * Load one Emscripten glue module.
 *
 * Identical in shape to the SDCC loader, and for the identical reason: the
 * shipped glue is an ES module (the build appends `export default`), but its
 * Emscripten body still expects the CommonJS scope (`require`, `__dirname`)
 * that its Node branch uses to reach `fs`. `import()`ing it under Node throws
 * `require is not defined` before a stage runs. So Node executes the SAME
 * source as CommonJS, minus only the trailing export line -- byte-for-byte the
 * program the browser runs. That is what lets the test suite drive the real
 * entry point instead of a hand-built toolchain of its own.
 */
async function importGlue (url, exportName) {
    if (!IS_NODE) return import(/* webpackIgnore: true */ url);
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
        source.replace(new RegExp(`export default ${exportName};\\s*$`), ''))(
        module, module.exports, createRequire(file), file, dirname(file));
    return module.exports;
}

async function loadToolchain (base) {
    if (loaded) return loaded;
    loaded = (async () => {
        const resolve = name => new URL(`static/smallerc-wasm/${name}`, base).href;
        const [pp, cc] = await Promise.all([
            importGlue(resolve('smlrpp.js'), 'createSmlrpp'),
            importGlue(resolve('smlrc.js'), 'createSmlrc')
        ]);
        // Headers are bundled, not fetched: they are 7 KB, and keeping them out
        // of the network means this compiler makes no request at all once its
        // two modules are in cache.
        return {factories: [pp, cc].map(m => m.default || m), headers: HEADERS, resolve};
    })();
    try { return await loaded; } catch (e) { loaded = null; throw e; }
}

function mkdirp (FS, name) {
    let current = '';
    for (const part of name.split('/').filter(Boolean)) {
        current += `/${part}`;
        try { FS.mkdir(current); } catch { /* exists */ }
    }
}

/**
 * Run one stage in its own MEMFS. Stages are isolated and artifacts are copied
 * between them explicitly, because WebAssembly has no fork/exec and a shared
 * filesystem would let one stage's leftovers masquerade as the next one's
 * input -- which is precisely the failure this module's tests exist to catch.
 */
async function runTool (factory, name, args, resolve, files) {
    if (typeof factory !== 'function') throw new Error(`${name}.js did not export a module factory`);
    const out = [];
    const err = [];
    let aborted = null;
    let status = 0;
    const module = await factory({
        thisProgram: name,
        arguments: args,
        locateFile: file => resolve(file),
        preRun: [M => {
            mkdirp(M.FS, '/work');
            for (const [path, text] of Object.entries(files)) {
                mkdirp(M.FS, `/work/${path}`.slice(0, `/work/${path}`.lastIndexOf('/')));
                M.FS.writeFile(`/work/${path}`, text);
            }
            M.FS.chdir('/work');
        }],
        // Both tools report to STDOUT, not stderr: smlrc prints `Error in
        // "file" (line:col)` on stdout and exits 1. Capturing only stderr
        // would throw the whole diagnosis away and leave the app able to say
        // nothing but "no output was produced" -- the same trap the SDCC
        // harness documents.
        print: line => out.push(line),
        printErr: line => err.push(line),
        quit: code => { if (code) status = code; },
        onAbort: why => { aborted = String(why); }
    });
    return {module, out, err, aborted, status, text: out.concat(err).join('\n')};
}

function readOrNull (FS, path) {
    try { return FS.readFile(path, {encoding: 'utf8'}); } catch { return null; }
}

/**
 * @param {string} code           C source
 * @param {object} options        {target, headers}
 * @param {object} toolchain      {factories: [smlrpp, smlrc], headers, resolve}
 * @returns {Promise<object>}     {success, asm?, error?, unsupported?, target, format}
 *
 * `toolchain` is an explicit argument so tests can inject a locally loaded one
 * and never touch `document.baseURI`. That seam is the only reason `compile`
 * and `compileWithToolchain` are separate exports.
 */
export async function compileWithToolchain (code, options, toolchain) {
    const target = String(options?.target || 'i8086').toLowerCase();
    if (!localTargetSupported(target)) {
        return {success: false, unsupported: true, target, error: `SmallerC does not build for ${target} locally`};
    }
    if (typeof code !== 'string' || !code.trim()) {
        return {success: false, target, error: 'no C source was supplied'};
    }
    const {model} = LOCAL_TARGETS[target];
    const headers = {...toolchain.headers, ...(options?.headers || {})};

    // Stage 1 -- smlrpp (ucpp). smlrc has a built-in preprocessor, but it
    // handles only object-like #define, #include, #ifdef/#ifndef/#else/#endif,
    // #undef and #line. It rejects function-like macros, #if <expr>, #elif,
    // #pragma and #error. Running ucpp first is what makes ordinary C work.
    // -zI drops ucpp's compiled-in host include path (which does not exist in
    // MEMFS); -I /work is where the bundled headers were staged.
    const pp = await runTool(toolchain.factories[0], 'smlrpp',
        ['-zI', '-I', '/work', '-o', '/work/main.i', '/work/main.c'],
        toolchain.resolve, {...headers, 'main.c': code});
    if (pp.aborted) return {success: false, target, error: `preprocessor aborted: ${pp.aborted}`};
    const preprocessed = readOrNull(pp.module.FS, '/work/main.i');

    // An EMPTY .i is the dangerous case, not a missing one. ucpp writes through
    // stdio and relies on the flush at exit; a build made with EXIT_RUNTIME=0
    // exits 0 and leaves main.i zero-length, and smlrc then "succeeds" on an
    // empty translation unit and emits a well-formed `bits 16` file with no
    // code in it -- a failure indistinguishable from a pass. The build sets
    // EXIT_RUNTIME=1; this check is the belt to that braces.
    if (preprocessed === null || preprocessed.trim() === '') {
        return {
            success: false,
            target,
            error: pp.text.trim() ||
                'preprocessor produced no output (empty .i -- check EXIT_RUNTIME in build.sh)'
        };
    }

    // Stage 2 -- smlrc. Fresh module, fresh MEMFS; only the .i crosses over.
    const cc = await runTool(toolchain.factories[1], 'smlrc',
        [model, '/work/main.i', '/work/main.asm'],
        toolchain.resolve, {'main.i': preprocessed});
    if (cc.aborted) return {success: false, target, error: `compiler aborted: ${cc.aborted}`};
    const asm = readOrNull(cc.module.FS, '/work/main.asm');
    if (asm === null) {
        return {success: false, target, error: cc.text.trim() || 'compiler produced no /work/main.asm'};
    }
    // smlrc writes a partial listing and appends "Compilation failed." rather
    // than deleting the file, so the file existing proves nothing on its own.
    if (/^; Compilation failed\.$/m.test(asm) || cc.status !== 0) {
        return {success: false, target, error: cc.text.trim() || 'compilation failed'};
    }
    if (!/^bits 16$/m.test(asm)) {
        return {success: false, target, error: `expected 16-bit output; smlrc emitted ${asm.slice(0, 40)}`};
    }
    return {
        success: true,
        target,
        asm,
        format: 'nasm',
        // Named so a future caller cannot mistake this for something the
        // current i8086-asm.js can consume. See the header comment.
        dialect: 'nasm-bits16',
        warnings: pp.text.trim() ? [pp.text.trim()] : []
    };
}

export async function compile (code, options = {}) {
    const base = typeof document === 'object' && document?.baseURI ? document.baseURI : globalThis.location?.href;
    return compileWithToolchain(code, options, await loadToolchain(base));
}

export default compile;

/**
 * The two GUI roots used by tests have different authority:
 *
 * - SOURCE is the owned `overlay/scratch-gui` tree in this checkout.
 * - INTEGRATED is `packages/scratch-gui`, used only as the GUI dependency
 *   scope and for build artifacts produced by integration.
 *
 * Root tests load owned modules from SOURCE. The resolve hook registered by
 * every root test command supplies their bare GUI dependencies from
 * INTEGRATED. Loading source from the generated packages tree made a stale
 * integration copy look authoritative and made source tests depend on a
 * build-preparation step unrelated to the behavior under test.
 *
 * `BW_INTEGRATED_ROOT` overrides only the dependency/build root so a worktree
 * may deliberately use an external prepared GUI. No sibling checkout is
 * discovered automatically, and owned module imports still come from SOURCE.
 * The override is announced because a second dependency registry can change a
 * result even though it cannot replace the source being tested.
 */
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {existsSync} from 'node:fs';
import {pathToFileURL} from 'node:url';

// Everything loaded through here — the Scratch VM, its extensions, the
// integrated GUI — logs on load and on run (the VM alone wrote 597 KB in one
// corpus walk). A test child's console output is RAW on the runner's stdout
// pipe and is the "Unable to deserialize cloned data" flake (docs/GATES-THAT-
// CANNOT-FAIL.md, species 26), so the stdout-bound console methods are
// captured once, here, for every test that loads through this helper — ONLY
// when this process IS a test child (the runner's NODE_TEST_CONTEXT is set AND
// the entry file is a *.test.mjs; a probe script spawned by a test inherits
// the variable but not the entry): a plain `node probe.mjs` that imports this
// helper keeps its console, and test-setup.test copies this file
// alone into a fixture, so the capture is inlined rather than imported (the
// same shape as test/helpers/quiet-console.mjs). warn/error are left alone:
// stderr is a separate pipe with no frames, and the announcement below must
// stay visible. A test that wants the lines has `consoleCapture.lines`; a
// test that wants to PRINT uses t.diagnostic().
export const consoleCapture = (() => {
    const lines = [];
    const isTestChild = Boolean(process.env.NODE_TEST_CONTEXT) && /\.test\.m?js$/.test(String(process.argv[1] || '').replace(/\\/g, '/'));
    if (!isTestChild) return {lines, restore () {}};
    const prior = new Map(['log', 'info', 'debug'].map(m => [m, console[m]]));
    for (const m of prior.keys()) console[m] = (...args) => { lines.push([m, ...args]); };
    return {lines, restore () { for (const [m, fn] of prior) console[m] = fn; }};
})();

const here = path.dirname(fileURLToPath(import.meta.url));
export const REPO = path.join(here, '..', '..');
export const SOURCE = path.join(REPO, 'overlay', 'scratch-gui');

export const INTEGRATED = process.env.BW_INTEGRATED_ROOT
    ? path.resolve(process.env.BW_INTEGRATED_ROOT)
    : path.join(REPO, 'packages', 'scratch-gui');

if (process.env.BW_INTEGRATED_ROOT) {
    process.stderr.write(
        `[bw gate] reading the integrated tree from ${INTEGRATED} (BW_INTEGRATED_ROOT), ` +
        `not from this checkout. The corpus is still read from ${REPO}/overlay.\n`);
}

/** An owned GUI module. Generated packages/ source is never an import input. */
export function sourceFile (relativePath) {
    const file = path.join(SOURCE, relativePath);
    if (!existsSync(file)) {
        throw new Error(`Missing owned GUI source file: ${file}.`);
    }
    return file;
}

export function importSource (relativePath) {
    return import(pathToFileURL(sourceFile(relativePath)).href);
}

/**
 * A file inside the prepared GUI dependency registry. Some patched dependency
 * source entries are intentionally absent from package exports, so tests name
 * that file explicitly instead of asking Node to reinterpret package exports.
 */
export function guiDependencyFile (relativePath) {
    const file = path.join(INTEGRATED, 'node_modules', relativePath);
    if (!existsSync(file)) {
        throw new Error(`Missing prepared GUI dependency file: ${file}.`);
    }
    return file;
}

export function importGuiDependency (relativePath) {
    return import(pathToFileURL(guiDependencyFile(relativePath)).href);
}

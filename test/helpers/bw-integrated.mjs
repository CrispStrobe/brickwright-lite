/**
 * Where the INTEGRATED tree lives — `packages/scratch-gui`, produced by
 * `scripts/integrate.mjs`, GUI dependency installation and the VM/paint/render
 * overlay steps. Some generated files are historically also tracked in Git.
 *
 * Runtime integration tests load the compiler, VM and live emulator adapters
 * from here so they exercise the assembled application and its dependencies.
 * Source-only tests import overlay/ directly and use root development deps.
 *
 * `BW_INTEGRATED_ROOT` overrides the location so the gates can run from a git
 * worktree with an intentionally external prepared GUI. No sibling checkout
 * is discovered automatically. Using the override is announced on stderr, because
 * reading a second checkout's tree is exactly how three false readings were
 * produced here on 2026-08-20 — a second checkout is a second registry, a second
 * everything. The gates' own instrument checks compare the overlay's compiler
 * against the integrated copy byte-for-byte, so a divergence between the two
 * trees fails loudly instead of being measured.
 */
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {existsSync, readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const REPO = path.join(here, '..', '..');

export const INTEGRATED = process.env.BW_INTEGRATED_ROOT
    ? path.resolve(process.env.BW_INTEGRATED_ROOT)
    : path.join(REPO, 'packages', 'scratch-gui');

if (process.env.BW_INTEGRATED_ROOT) {
    process.stderr.write(
        `[bw gate] reading the integrated tree from ${INTEGRATED} (BW_INTEGRATED_ROOT), ` +
        `not from this checkout. The corpus is still read from ${REPO}/overlay.\n`);
}

const setupHint = 'Prepare the GUI using README.md#development-and-tests, ' +
    'then run npm run check:setup -- --integrated.';

/** Explicit runtime import; an existing tracked mirror is not setup evidence. */
export function integratedFile (relativePath) {
    const file = path.join(INTEGRATED, relativePath);
    if (!existsSync(path.join(INTEGRATED, 'package.json')) || !existsSync(file)) {
        throw new Error(`Missing integrated runtime file: ${file}. ${setupHint}`);
    }
    const owned = path.join(REPO, 'overlay', 'scratch-gui', relativePath);
    if (existsSync(owned) && !readFileSync(owned).equals(readFileSync(file))) {
        throw new Error(`Integrated runtime differs from this checkout's overlay: ${file}. ${setupHint}`);
    }
    return file;
}

export function importIntegrated (relativePath) {
    return import(pathToFileURL(integratedFile(relativePath)).href);
}

/** Do not let Node resolve a missing GUI dependency from an ancestor checkout. */
export function requireIntegrated (packageName) {
    integratedFile(`node_modules/${packageName}/package.json`);
    return createRequire(path.join(INTEGRATED, 'package.json'))(packageName);
}

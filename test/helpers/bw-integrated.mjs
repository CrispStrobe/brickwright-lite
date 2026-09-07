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

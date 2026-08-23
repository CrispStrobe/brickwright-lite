/**
 * Where the INTEGRATED tree lives — `packages/scratch-gui`, produced by
 * `scripts/integrate.mjs` plus `npm install` and gitignored.
 *
 * The gates import the compiler and scratch-vm from there rather than from
 * `overlay/`, because that is the only place `jszip` and `scratch-vm` resolve:
 * the repo root has no node_modules and CI never installs one. The corpus itself
 * is always read from `overlay/`, which is the source of truth in git.
 *
 * `BW_INTEGRATED_ROOT` overrides the location so the gates can run from a git
 * worktree, where `packages/scratch-gui` is 78k tracked files and is normally
 * left out of the sparse checkout. Using it is announced on stderr, because
 * reading a second checkout's tree is exactly how three false readings were
 * produced here on 2026-08-20 — a second checkout is a second registry, a second
 * everything. The gates' own instrument checks compare the overlay's compiler
 * against the integrated copy byte-for-byte, so a divergence between the two
 * trees fails loudly instead of being measured.
 */
import path from 'node:path';
import {fileURLToPath} from 'node:url';

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

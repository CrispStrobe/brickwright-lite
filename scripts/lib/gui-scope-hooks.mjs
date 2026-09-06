/**
 * Module-resolution hooks: give root tests the GUI package's dependency scope.
 *
 * overlay/scratch-gui/src is the GUI's source — integrate.mjs copies it into
 * packages/scratch-gui/src, where its bare imports (avr8js, rp2040js, jszip…)
 * resolve from THAT package's node_modules. A root test that imports an overlay
 * module directly is therefore importing GUI code from outside the GUI's
 * resolution scope; node walks up from overlay/… and finds nothing, and the
 * test fails on a clean runner with "Cannot find package 'avr8js'". It passed
 * on this VPS only because a stray node_modules two directories above the
 * worktree happened to hold avr8js — which is how the boundary went unnoticed.
 *
 * These hooks are the boundary, stated once: when a BARE specifier fails to
 * resolve, retry it from packages/scratch-gui/package.json. Nothing else —
 * relative and absolute specifiers are never touched, and nothing outside
 * packages/scratch-gui is ever consulted. The corpus job runs without
 * node_modules at all, so there the fallback finds nothing and behaviour is
 * unchanged by design.
 *
 * VISIBLE, NOT SILENT: with BW_GUI_SCOPE_LOG=<file> every re-resolution is
 * appended as `specifier\tparentURL`, and the unit-test step prints the sorted
 * summary. The boundary is a measured list; the day it grows, someone sees it.
 *
 * Registered from scripts/lib/register-gui-scope.mjs via `node --import`.
 * test/gui-scope-resolution.test.mjs proves both halves (fails without,
 * resolves with) and that the unit-test invocation carries the --import.
 */
import {existsSync, appendFileSync} from 'node:fs';
import {fileURLToPath, pathToFileURL} from 'node:url';
import path from 'node:path';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const guiPackageJson = path.join(repoRoot, 'packages', 'scratch-gui', 'package.json');
const guiParentURL = pathToFileURL(guiPackageJson).href;
const guiHasDeps = existsSync(path.join(repoRoot, 'packages', 'scratch-gui', 'node_modules'));
const logFile = process.env.BW_GUI_SCOPE_LOG || '';

const isBare = specifier => !/^(?:\.{1,2}\/|\/|[a-zA-Z]:[\\/]|file:|node:|data:|#)/.test(specifier);
const NOT_FOUND = new Set(['ERR_MODULE_NOT_FOUND', 'ERR_PACKAGE_PATH_NOT_EXPORTED']);

export async function resolve (specifier, context, nextResolve) {
    try {
        return await nextResolve(specifier, context);
    } catch (err) {
        if (!guiHasDeps || !isBare(specifier) || !NOT_FOUND.has(err && err.code)) throw err;
        if (context.parentURL === guiParentURL) throw err; // already retried once
        const result = await nextResolve(specifier, {...context, parentURL: guiParentURL});
        if (logFile) {
            try { appendFileSync(logFile, `${specifier}\t${context.parentURL || '(entry)'}\n`); } catch { /* the log is a courtesy, never a failure */ }
        }
        return result;
    }
}

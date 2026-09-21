/**
 * Copy vendored overlay files into the packages/ mirror webpack compiles.
 *
 * WHY A SYNC MUST DO THIS AT ALL
 * ------------------------------
 * `0eb9a6a74` synced the sb3-creator emitter into overlay/ and did not run
 * `npm run integrate`. packages/scratch-gui/src/lib/sb3-creator.js kept the
 * pre-bump bytes, so `grep -c escapeTextLiteral` on it returned 0, and a commit
 * titled "Pin sb3-creator past the literal that corrupted itself on every save"
 * shipped a build that still corrupted the literal. Every identity gate stayed
 * green: they compare the OVERLAY against upstream, and the overlay was right.
 *
 * WHY THIS IS NOT `npm run integrate`
 * -----------------------------------
 * integrate copies the WHOLE overlay/scratch-gui tree and rewrites the mirror's
 * package.json. Calling it from a sync would sweep any unrelated in-progress
 * overlay edit into packages/ and hand whoever ran the sync a diff they did not
 * make — a live hazard with several sessions working in this repo at once. This
 * copies ONLY the files named, which are the ones the caller just wrote, so its
 * blast radius is exactly the caller's own scope.
 *
 * NOTHING IS SKIPPED QUIETLY
 * --------------------------
 * An earlier draft `continue`d past a source it could not read and past a
 * target that did not exist. That is the SILENT-SKIP shape
 * scripts/audit-gate-shapes.mjs exists to find, and it found this file — a
 * skip on the filesystem's answer, in a loop, with nothing reporting it. Both
 * are handled instead: a missing target is CREATED, exactly as integrate would
 * create it, because every path passed here is one the caller just wrote; and
 * an unreadable source is RETURNED for the caller to report rather than
 * dropped.
 *
 * @param {Array<string>} files absolute paths of the overlay files just written
 * @param {string} mirrorDir absolute path of the mirror directory
 * @param {{readFile:Function, writeFile:Function}} fs injected for testability
 * @returns {Promise<{copied: string[], unreadable: string[]}>}
 */
export async function mirrorIntoPackages (files, mirrorDir, fs) {
    const { readFile, writeFile } = fs;
    const join = (a, b) => `${a.replace(/\/$/, '')}/${b}`;
    const base = (p) => p.slice(p.lastIndexOf('/') + 1);
    const copied = [];
    const unreadable = [];
    for (const src of files) {
        const name = base(src);
        const ours = await readFile(src, 'utf8').catch(() => null);
        if (ours === null) { unreadable.push(name); continue; }
        const target = join(mirrorDir, name);
        const theirs = await readFile(target, 'utf8').catch(() => null);
        if (ours === theirs) continue;
        await writeFile(target, ours);
        copied.push(name);
    }
    return { copied, unreadable };
}

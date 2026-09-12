import { existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * THE ONE PLACE THAT KNOWS HOW A VENDORED FILE DIFFERS FROM ITS UPSTREAM BY
 * CONSTRUCTION.
 *
 * `sync-bw-board.mjs` rewrites a deep import as it copies a file in, because the
 * relative path that is correct inside the bw-board checkout is wrong from the
 * vendored location. The result is a vendored file that does NOT match upstream
 * byte for byte and never will, no matter how converged the two repositories
 * are: the difference is something the sync ITSELF put there.
 *
 * WHY THIS MODULE EXISTS RATHER THAN THE CONSTANT LIVING IN THE SYNC. Two
 * instruments were measuring the same question and disagreeing. `--check` applies
 * the rewrite before comparing and reports cortex-m0-machine.js as `ok`;
 * test/vendor-identity.test.mjs compared raw bytes and saw a divergence, so the
 * file had to be DECLARED as forward-ported work in
 * docs/VENDOR-DIVERGENCE-I8086-MACHINE.md -- an inventory whose own `why` says it
 * records "forward-ported work". The file carries none. A sync reproduces lite's
 * bytes exactly, which was measured rather than assumed: run
 * `sync-bw-board.mjs --only cortex-m0-machine.js` against a checkout at the pin
 * and the file's hash does not move.
 *
 * That is species 37 -- a number that travels without its instrument -- in its
 * structural form: 13 DIFFERS against 14 declared, with no defect anywhere, and
 * a gap that reads exactly like a stale declaration. The remedy the species
 * prescribes is one instrument, so both callers now import this.
 *
 * THE QUESTION A VENDORED FILE SHOULD BE ASKED is not "does this match upstream"
 * -- lite never had that -- but "is this what a sync would produce". Applying the
 * rewrite to the upstream text before comparing asks exactly that, and it is the
 * strictly stronger question, because it still refuses every difference the sync
 * would not have made.
 *
 * WHAT A GREEN FROM THE IDENTITY GATE NOW MEANS, AND WHAT IT DOES NOT. It used
 * to certify *this file matches upstream*. It now certifies *this file matches
 * what the sync would produce* -- strictly stronger against drift, and SILENT ON
 * WHETHER THE SYNC'S OUTPUT IS CORRECT. Those are different claims and the
 * difference is reachable: this table is global, not scoped to one file, so a
 * vendored file at a different nesting depth carrying the same import would be
 * rewritten to `../../../` where that is wrong, would break, and the gate would
 * report ok -- correctly, because that IS what the sync produced. The gate is not
 * wrong there; its question is simply not that one. Undrifted is not the same as
 * correct, and a green here is evidence of the first only. (lego-ac found this
 * boundary by reading the module rather than reasoning about it.)
 *
 * WHY GLOBAL IS NONETHELESS RIGHT: the sync imports this same table and applies
 * it the same way, so gate and sync agree BY CONSTRUCTION rather than by two
 * people keeping two copies in step. Sharing the module does more work than
 * sharing a constant would.
 *
 * THE RATCHET IN test/vendor-identity.test.mjs IS THE LOAD-BEARING PART OF THIS
 * DESIGN, not a nicety attached to it. Every pair must be exercised by BOTH trees
 * -- upstream holding the text it rewrites FROM, the vendored tree the text it
 * rewrites TO. Without it this table is a place to bury divergences: add a pair,
 * and any difference matching it stops being reported by anything. With it, a
 * pair that describes nothing fails loudly. That requirement is the difference
 * between one instrument and a blind spot with good manners.
 *
 * A property worth knowing, since it was checked rather than hoped for: the pair
 * matches a SINGLE-QUOTED literal. Reformatting upstream to double quotes stops
 * the sync rewriting and stops the gate forgiving in the same move, so the file
 * surfaces as a divergence instead of silently slipping through. It fails safe.
 *
 * ADDING AN ENTRY HERE WIDENS WHAT THE IDENTITY GATE FORGIVES. It is a
 * transformation lite applies to EVERY vendored copy of that text, not a licence
 * for one file to differ: the sync must actually perform it, or the two callers
 * are back to disagreeing and the gate is the one that will be wrong.
 */

/**
 * cortex-m0-machine.js deep-imports rp2040js's core BY FILE PATH because the
 * package's exports map exposes only '.' and './gdb-tcp-server'. The path is
 * correct in the bw-board checkout and wrong from the vendored location, so the
 * sync rewrites it to reach packages/scratch-gui/node_modules from
 * src/lib/bw-board/ -- three levels up. A plain file path bypasses the exports
 * map, which a bare 'rp2040js/dist/…' specifier would trip over in webpack 5.
 */
/**
 * ONE REWRITE, AND ITS DEPTH IS DERIVED RATHER THAN WRITTEN DOWN.
 *
 * `from` is the text upstream holds. `reaches` is what the specifier is trying
 * to get to, with the `../` run stripped off -- because the number of `../`s is
 * the ONLY part that depends on where the copy lands, and it is therefore the
 * only part a table must not assert.
 *
 * The module's own header already named the hazard this closes: the table is
 * global, so a vendored file at a DIFFERENT nesting depth carrying the same
 * import would have been rewritten to `../../../` where that is wrong, would
 * break, and the identity gate would still have reported ok -- correctly, since
 * that IS what the sync produced. The gate was not wrong; its question was not
 * that one. Deriving the depth means there is no second question to ask.
 */
export const DEEP_IMPORT_REWRITES = [
    {
        // cortex-m0-machine.js deep-imports rp2040js's core BY FILE PATH because
        // the package's exports map exposes only '.' and './gdb-tcp-server'. A
        // plain file path bypasses the exports map, which a bare
        // 'rp2040js/dist/...' specifier would trip over in webpack 5.
        from: `'../node_modules/rp2040js/dist/esm/cortex-m0-core.js'`,
        reaches: 'node_modules/rp2040js/dist/esm/cortex-m0-core.js'
    }
];

/**
 * How many `../` a file in `vendoredRoot` needs to reach the node_modules a
 * bundler will resolve for it -- i.e. the distance to the nearest ancestor that
 * owns a package.json.
 *
 * WHY A MIRROR LIST RATHER THAN A SPECIAL CASE FOR `overlay/`. Lite keeps each
 * vendored tree twice, and only one of the pair sits under a package: measured,
 * `packages/scratch-gui/package.json` exists and nothing above
 * `overlay/scratch-gui/src/lib/bw-board` does. The twin is not something this
 * module should know -- it is already in the manifest, as the second entry of
 * `vendoredRoots` -- so the caller passes the pair and the depth is read off
 * whichever member of it is under a package. Hardcoding `overlay -> packages`
 * here would replace one written-down constant with another.
 *
 * @param {string} vendoredRoot   repo-relative, e.g. 'packages/x/src/lib/bw-board'
 * @param {object} opts
 * @param {string} opts.repoRoot  absolute path to the repository root
 * @param {string[]} [opts.mirrors] the other vendored roots for the same tree
 * @returns {number} the number of levels up
 */
export function nodeModulesDepth (vendoredRoot, {repoRoot, mirrors = []}) {
    // THE NEAREST PACKAGE BOUNDARY ACROSS THE WHOLE MIRROR SET, not the first
    // one found. Measured while writing this: walking up from the overlay root
    // alone returns 5, because no ancestor of it owns a package.json until the
    // REPOSITORY ROOT does -- and the monorepo's own package.json is not the
    // package a bundler resolves this import from. The packages twin returns 3,
    // which is the depth the hardcoded string had. Taking the first answer gave
    // a confidently wrong number; taking the nearest gives the right one for
    // both members of the pair, which is correct because the two mirrors have
    // identical structure below their mirror root.
    const depths = [];
    for (const root of [vendoredRoot, ...mirrors]) {
        const parts = root.split('/').filter(Boolean);
        for (let up = 1; up <= parts.length; up++) {
            const dir = parts.slice(0, parts.length - up);
            if (existsSync(join(repoRoot, ...dir, 'package.json'))) { depths.push(up); break; }
        }
    }
    if (depths.length) return Math.min(...depths);
    throw new Error(
        `vendor rewrite depth is underivable for '${vendoredRoot}': no ancestor of it ` +
        `or of [${mirrors.join(', ')}] owns a package.json, so there is no node_modules ` +
        'to count towards. Refusing to guess a depth: a wrong one produces a file that ' +
        'imports nothing and a gate that calls it correct.');
}

/** Upstream text as the sync would write it into `vendoredRoot`. */
export function applyVendorRewrites (text, vendoredRoot, opts) {
    if (typeof vendoredRoot !== 'string' || !opts || typeof opts.repoRoot !== 'string') {
        throw new TypeError(
            'applyVendorRewrites needs the vendored root and {repoRoot} — the rewrite ' +
            'depth is derived from where the copy lands, so a caller that does not say ' +
            'where it lands cannot be answered.');
    }
    const depth = nodeModulesDepth(vendoredRoot, opts);
    for (const {from, reaches} of DEEP_IMPORT_REWRITES) {
        const to = from.replace(/(['"])(?:\.\.\/)+/, (m, q) => q + '../'.repeat(depth));
        text = text.replaceAll(from, to);
    }
    return text;
}

/** The pair a given root produces, for gates that want to see both sides. */
export function rewritePairs (vendoredRoot, opts) {
    const depth = nodeModulesDepth(vendoredRoot, opts);
    return DEEP_IMPORT_REWRITES.map(({from, reaches}) => [
        from, from.replace(/(['"])(?:\.\.\/)+/, (m, q) => q + '../'.repeat(depth))
    ]);
}

/**
 * SB3-CREATOR: THE SAME PROBLEM, A DIFFERENT SHAPE.
 *
 * bw-board and bw-circuit-ui are vendored as WHOLE DIRECTORIES whose filenames
 * match upstream, so a vendored path maps to an upstream path by identity and a
 * directory walk finds the set. sb3-creator is not: fourteen named files are
 * copied out of `src/utils/` into lite's own `lib/` AND RENAMED
 * (`pythonToPseudocode.js` -> `sb3-creator-python.js`), because they land beside
 * lite's own modules rather than in a mirror of the upstream tree.
 *
 * The rename forces a second transformation. A file that imports a sibling by
 * its upstream name would import nothing after the copy, so the sync rewrites
 * those specifiers as it goes. Measured 2026-09-12: five of the fourteen differ
 * from upstream for this reason and only this reason — with the rewrite applied,
 * all fourteen are byte-identical at the pin.
 *
 * BOTH TABLES LIVE HERE FOR THE REASON IN THIS MODULE'S HEADER. Until today the
 * map and the rewrite lived only inside `sync-sb3creator.mjs`, which does its
 * work at import time and so cannot be read by a test. That is why sb3-creator
 * had no judge-test while the other two upstreams did, and why
 * `vendor-identity.test.mjs` carried the note "sb3-creator already has a CI
 * pin-proof though no judge-test consumes it yet". A gate cannot check a
 * transformation it has no way to apply.
 */
export const SB3_CREATOR_FILES = Object.freeze([
    ['sb3-creator.js', 'src/utils/sb3Creator.js'],
    ['trace-oracle.js', 'src/utils/traceOracle.js'],
    ['sb3-creator-examples.js', 'src/utils/examples.js'],
    ['sb3-creator-python.js', 'src/utils/pythonToPseudocode.js'],
    ['sb3-creator-micropython.js', 'src/utils/micropythonToPseudocode.js'],
    ['pico-repl.js', 'src/utils/picoRepl.js'],
    ['sb3-creator-javascript.js', 'src/utils/javascriptToPseudocode.js'],
    ['sb3-creator-c.js', 'src/utils/cToPseudocode.js'],
    ['sb3-creator-runtime.js', 'src/utils/runtimeRegistry.generated.js'],
    ['sb3-creator-scratchruntime.js', 'src/utils/scratchRuntime.js'],
    ['sb3-creator-chostruntime.js', 'src/utils/cHostRuntime.js'],
    ['sb3-creator-chost.js', 'src/utils/cHostToPseudocode.js'],
    ['sb3-creator-basic.js', 'src/utils/basicToPseudocode.js'],
    ['cubeDirections.js', 'src/utils/cubeDirections.js'],
]);

/**
 * The import remapping the sb3-creator sync performs by construction.
 *
 * THIS IS THE SYNC'S ACTUAL TABLE, SIX ENTRIES, NOT A DERIVATION OF THE RENAME
 * MAP ABOVE — and the difference is a finding rather than an accident.
 *
 * Deriving it from SB3_CREATOR_FILES yields THIRTEEN rewrites: every file whose
 * vendored name differs from its upstream name. The sync performs six. So seven
 * possible renames are unhandled, and a vendored file that imported one of them
 * by its upstream name (`./sb3Creator.js`, `./traceOracle.js`, `./examples.js`,
 * ...) would be copied in with an import pointing at a file that does not exist.
 *
 * A GATE MUST APPLY THE RULE THE SYNC APPLIES, not the rule it ought to. Using
 * the derived thirteen here would make the comparison green against a transform
 * nothing performs — a check true about something other than what it is about.
 * The seven-entry gap is asserted separately, as the latent hazard it is.
 */
export const SB3_CREATOR_IMPORT_REWRITES = Object.freeze([
    ['pythonToPseudocode.js', 'sb3-creator-python.js'],
    ['micropythonToPseudocode.js', 'sb3-creator-micropython.js'],
    ['runtimeRegistry.generated.js', 'sb3-creator-runtime.js'],
    ['scratchRuntime.js', 'sb3-creator-scratchruntime.js'],
    ['cHostRuntime.js', 'sb3-creator-chostruntime.js'],
    ['cHostToPseudocode.js', 'sb3-creator-chost.js']
]);

/** Every rename the file map implies — the superset the sync does NOT fully cover. */
export const SB3_CREATOR_POSSIBLE_REWRITES = Object.freeze(
    SB3_CREATOR_FILES
        .map(([local, up]) => [up.replace(/^src\/utils\//, ''), local])
        .filter(([from, to]) => from !== to));

export function applySb3CreatorRewrites (text) {
    let out = text;
    for (const [from, to] of SB3_CREATOR_IMPORT_REWRITES) {
        out = out.replace(
            new RegExp(`(['"])\\./${from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\1`, 'g'),
            `'./${to}'`);
    }
    return out;
}

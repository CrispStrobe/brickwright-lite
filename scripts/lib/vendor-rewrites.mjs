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
export const DEEP_IMPORT_REWRITES = [
    [`'../node_modules/rp2040js/dist/esm/cortex-m0-core.js'`,
        `'../../../node_modules/rp2040js/dist/esm/cortex-m0-core.js'`],
];

/** Upstream text as the sync would write it into the vendored tree. */
export function applyVendorRewrites (text) {
    for (const [from, to] of DEEP_IMPORT_REWRITES) text = text.replaceAll(from, to);
    return text;
}

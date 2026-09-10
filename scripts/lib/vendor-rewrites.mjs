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

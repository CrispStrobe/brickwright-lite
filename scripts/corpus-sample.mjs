/**
 * Choosing the rotating slice of the corpus a differential run compares.
 *
 * Its own module, and exported, because the previous version was a one-line
 * `pairs.slice(offset, offset + count)` buried inside a network-bound CLI, and
 * it was wrong in a way no gate could reach: an offset at or past the end
 * produced an EMPTY sample, whereupon the caller's loop ran zero comparisons,
 * its failure flag stayed false, and the run exited 0. A green that compared
 * nothing is the exact failure this differential exists to catch in the
 * emitter; it must not be the harness's own behaviour.
 *
 * The caller cannot bound the offset itself — only the corpus walk knows how
 * many eligible pairs the gallery yields today (224 on 2026-09-03, against a
 * caller wrapping at a hardcoded 200, so the last 24 were unreachable).
 */

/**
 * `count` items from `offset`, wrapping, never empty.
 *
 * @param {Array} pairs every eligible pair, in corpus order
 * @param {number} count how many to compare this run
 * @param {number} offset where to start; any integer, wrapped into range
 * @returns {{sample: Array, start: number, wrapped: boolean}}
 */
export function wrappedSample (pairs, count, offset) {
    if (!Array.isArray(pairs) || pairs.length === 0) {
        throw new Error('corpus sample: no eligible pairs at all');
    }
    const n = Math.trunc(Number(count));
    if (!Number.isFinite(n) || n < 1) {
        throw new Error(`corpus sample: count must be at least 1, got ${count}`);
    }
    const raw = Math.trunc(Number(offset)) || 0;
    // Two-step modulo: JS `%` keeps the sign, so a negative offset would index
    // backwards off the front of the array and yield undefined entries.
    const start = ((raw % pairs.length) + pairs.length) % pairs.length;
    const take = Math.min(n, pairs.length);
    const sample = Array.from({length: take}, (_, i) => pairs[(start + i) % pairs.length]);
    return {sample, start, wrapped: start !== raw};
}

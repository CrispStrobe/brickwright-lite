/**
 * Two-level logic minimisation — Quine–McCluskey. Turns a set of minterms into a
 * small cover of prime implicants, so a circuit synthesised from a truth table
 * reads like a designed circuit instead of one AND-term per 1-row. This is the
 * classic digital-logic minimisation (the algorithm behind a Karnaugh map),
 * done exactly rather than by hand.
 *
 * An implicant is a cube `{mask, val}`: `mask` marks the FIXED bits (a 1 = the
 * variable matters), `val` their values. A minterm `m` is covered when
 * `(m & mask) === (val & mask)`. A bit position `i` corresponds to input `i`.
 *
 * Pure and framework-free; unit-tested (the cover must reproduce the function).
 *
 * @module
 */

const popcount = x => { let c = 0; while (x) { x &= x - 1; c++; } return c; };
const covers = (imp, m) => (m & imp.mask) === (imp.val & imp.mask);

/**
 * The prime implicants of a function over `n` variables, given its `minterms`
 * (output 1) and optional `dontcares` (output may be anything). Standard QM
 * column-merging: combine cubes that differ in one fixed bit until none merge;
 * whatever never merged is prime.
 *
 * @returns {Array<{mask:number, val:number}>}
 */
export function primeImplicants (n, minterms, dontcares = []) {
    const full = (1 << n) - 1;
    let current = [...new Set([...minterms, ...dontcares])].map(m => ({mask: full, val: m}));
    const primes = [];
    const key = imp => `${imp.mask}:${imp.val & imp.mask}`;

    while (current.length) {
        const used = new Set();
        const nextMap = new Map();
        for (let i = 0; i < current.length; i++) {
            for (let j = i + 1; j < current.length; j++) {
                const a = current[i];
                const b = current[j];
                if (a.mask !== b.mask) continue;
                const diff = (a.val ^ b.val) & a.mask;
                if (diff && (diff & (diff - 1)) === 0) { // exactly one fixed bit differs
                    const merged = {mask: a.mask & ~diff, val: a.val & ~diff};
                    nextMap.set(key(merged), merged);
                    used.add(i); used.add(j);
                }
            }
        }
        // Anything not merged this round is a prime implicant.
        const seen = new Set(primes.map(key));
        current.forEach((imp, i) => {
            if (!used.has(i) && !seen.has(key(imp))) { primes.push(imp); seen.add(key(imp)); }
        });
        current = [...nextMap.values()];
    }
    return primes;
}

/**
 * A small cover of `minterms` chosen from `primes`: take the essential prime
 * implicants (the only cube covering some minterm), then greedily cover the rest
 * with whichever prime covers the most still-uncovered minterms. Not guaranteed
 * globally minimal (that is Petrick's method), but always a valid, small cover.
 *
 * @returns {Array<{mask:number, val:number}>}
 */
export function minimalCover (minterms, primes) {
    const need = new Set(minterms);
    const chosen = [];
    const take = imp => { chosen.push(imp); for (const m of [...need]) if (covers(imp, m)) need.delete(m); };

    // Essential primes: a minterm covered by exactly one prime forces that prime.
    for (const m of minterms) {
        const covering = primes.filter(p => covers(p, m));
        if (covering.length === 1 && need.has(m)) take(covering[0]);
    }
    // Greedy for the remainder.
    const pool = primes.filter(p => !chosen.includes(p));
    while (need.size) {
        let best = null;
        let bestCount = -1;
        for (const p of pool) {
            if (chosen.includes(p)) continue;
            let c = 0;
            for (const m of need) if (covers(p, m)) c++;
            if (c > bestCount) { bestCount = c; best = p; }
        }
        if (!best || bestCount <= 0) break; // should not happen: primes always cover
        take(best);
    }
    return chosen;
}

/**
 * Minimise a single output to a sum-of-products cover.
 *
 * @param {number} n  number of input variables
 * @param {number[]} minterms  input codes where the output is 1 (bit i = input i)
 * @param {number[]} [dontcares]
 * @returns {Array<Array<{index:number, value:0|1}>>}  each term is a list of
 *   literals (input index + required value); an empty term means the tautology
 *   (output is constant 1), an empty cover means constant 0.
 */
export function minimizeOutput (n, minterms, dontcares = []) {
    if (minterms.length === 0) return [];               // constant 0
    if (minterms.length + dontcares.length >= (1 << n) && minterms.length === (1 << n)) return [[]]; // constant 1
    const primes = primeImplicants(n, minterms, dontcares);
    const cover = minimalCover(minterms, primes);
    return cover.map(imp => {
        const lits = [];
        for (let i = 0; i < n; i++) if ((imp.mask >> i) & 1) lits.push({index: i, value: (imp.val >> i) & 1});
        return lits;
    });
}

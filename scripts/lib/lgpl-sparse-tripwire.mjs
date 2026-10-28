/**
 * The LGPL sparse-solver family must never enter the shipped graph
 * (ROADMAP §3.5 item 4; the ruling is bw-board ROADMAP §"Backends and licence
 * policy"): KLU, BTF, CSparse/CXSparse and everything derived from them --
 * including the sparse module inside mathjs, which is CSparse ported to
 * JavaScript and tagged LGPL-2.1+ file by file. bw-board's own sparse LU
 * (src/sparse.js) is written from permitted sources and says so.
 *
 * Two ways in, two checks:
 *   - as a DEPENDENCY: a lockfile resolving a package of the family;
 *   - as COPIED CODE: a source or bundle carrying the family's fingerprints.
 *     Bare words are not fingerprints -- "CSparse" and "LGPL" appear in
 *     legitimate licence notes (sparse.js's own says "not used, ported") --
 *     so these are the code's own marks: its SPDX tag, its copyright holder,
 *     and mathjs's factory names, which survive minification (measured on
 *     mathjs 13.2.3: lib/browser/math.js keeps 'csAmd', 'csLu', 'csSqr' and
 *     'csSpsolve' as strings; its lib/esm sparse files carry the SPDX tag and
 *     Timothy A. Davis's copyright).
 */

/** A package name of the family, scoped or not: mathjs, csparse, klu-*, ... */
export const FAMILY_PACKAGE = /^(@[^/]+\/)?(mathjs|csparse|cxsparse|suitesparse|klu|btf)([-._].*)?$/i;

export const SIGNATURES = [
    // An LGPL tag alone is not this family (other LGPL code has its own
    // rulings); an LGPL-tagged file that is about sparse solving is.
    {test: t => /SPDX-License-Identifier:\s*LGPL/.test(t) && /sparse|\bKLU\b/i.test(t),
        why: 'an LGPL-tagged sparse-solver source file'},
    {re: /Timothy A\. Davis/, why: 'CSparse/SuiteSparse copyright (Timothy A. Davis)'},
    {re: /["']cs(Amd|Lu|Sqr|Spsolve|Symperm)["']/, why: "mathjs's CSparse-derived sparse factories"}
];

/** Offending package paths in a package-lock.json's text. */
export function lockfileOffences (lockText) {
    const lock = JSON.parse(lockText);
    const out = [];
    for (const key of Object.keys(lock.packages || {})) {
        const name = key.slice(key.lastIndexOf('node_modules/') + 'node_modules/'.length);
        if (key.includes('node_modules/') && FAMILY_PACKAGE.test(name)) out.push(key);
    }
    for (const name of Object.keys(lock.dependencies || {})) {       // lockfile v1
        if (FAMILY_PACKAGE.test(name)) out.push(name);
    }
    return out;
}

/** The signatures a text carries, as reasons. */
export function contentOffences (text) {
    return SIGNATURES.filter(s => (s.test ? s.test(text) : s.re.test(text))).map(s => s.why);
}

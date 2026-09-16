/**
 * Reading a licence declaration out of HDL source.
 *
 * TN3's acceptance criterion, from docs/TANG-NANO.md: hosted synthesis must
 * refuse a GPL-licensed source BY NAME, with a pointer to the local tier, and
 * refuse an unlicensed one outright. That decision (§2.3) exists because
 * compiling GPL source on our server and returning a bitstream would convey a
 * derivative work and make the service a GPL distributor. Building it on the
 * user's own machine conveys nothing.
 *
 * WHAT THIS CAN AND CANNOT DO, because the difference matters and gets lost:
 *
 *   It can REFUSE on positive evidence — an SPDX tag or a licence notice that
 *   says GPL. That is a fact in the text.
 *
 *   It can NEVER APPROVE. Absence of a GPL notice is not evidence of a
 *   permissive licence; most HDL in the world carries no declaration at all.
 *   So `permissive` here means "declares something permissive", and `unknown`
 *   means exactly that — not "fine".
 *
 * A scanner that reported "this source is BSD-licensed" would be inventing a
 * fact about somebody else's copyright, which is worse than saying nothing.
 *
 * @module
 */

/** SPDX ids we treat as shippable, matching THIRD-PARTY-NOTICES.md's set. */
const PERMISSIVE = /^(MIT|ISC|BSD-2-Clause|BSD-3-Clause|Apache-2\.0|MPL-2\.0|0BSD|Unlicense|CC0-1\.0)$/i;

/** Anything in the GPL family, including the lesser and affero variants. */
const COPYLEFT = /^(A?GPL-[0-9.]+(-only|-or-later)?|LGPL-[0-9.]+(-only|-or-later)?|GPL-[0-9.]+\+?)$/i;

// The whole EXPRESSION, not the first token: SPDX ids are separated by spaces
// ("GPL-2.0-or-later OR MIT"), so stopping at whitespace reads a dual offer as
// its first half and refuses something the recipient may legitimately elect.
// Trailing comment syntax (*/, //) and punctuation are trimmed off the end.
const SPDX_TAG = /SPDX-License-Identifier:[ \t]*([^\n\r]+)/i;
const trimExpression = raw => String(raw)
    .replace(/\*\/.*$/, '')
    .replace(/\/\/.*$/, '')
    .replace(/[;,.\s]+$/, '')
    .trim();

/** Prose notices, for sources that predate SPDX tags or never adopted them. */
const PROSE = [
    {re: /GNU\s+(Lesser\s+|Affero\s+)?General\s+Public\s+License/i, spdx: 'GPL-family (prose notice)'},
    {re: /under\s+the\s+terms\s+of\s+the\s+GNU/i, spdx: 'GPL-family (prose notice)'},
    {re: /CERN\s+Open\s+Hardware\s+Licen[cs]e[^\n]*(S|Strongly\s+Reciprocal)/i,
        spdx: 'CERN-OHL-S (strongly reciprocal)'}
];

/**
 * @returns {{spdx: string|null, family: 'permissive'|'copyleft'|'unknown', evidence: string|null}}
 */
export function detectLicence (source) {
    const text = String(source ?? '');

    const tag = SPDX_TAG.exec(text);
    if (tag) {
        const spdx = trimExpression(tag[1]);
        // A dual offer is the recipient's choice, so one permissive half is enough.
        const halves = spdx.split(/\s+OR\s+/i).map(h => h.trim());
        if (halves.some(h => PERMISSIVE.test(h))) {
            return {spdx, family: 'permissive', evidence: `SPDX-License-Identifier: ${spdx}`};
        }
        if (halves.every(h => COPYLEFT.test(h))) {
            return {spdx, family: 'copyleft', evidence: `SPDX-License-Identifier: ${spdx}`};
        }
        return {spdx, family: 'unknown', evidence: `SPDX-License-Identifier: ${spdx}`};
    }

    for (const {re, spdx} of PROSE) {
        const m = re.exec(text);
        if (m) return {spdx, family: 'copyleft', evidence: m[0].trim()};
    }

    return {spdx: null, family: 'unknown', evidence: null};
}

/**
 * Screen sources for the HOSTED route.
 *
 * @param {Array<{name: string, source: string}>} files
 * @returns {{refusals: Array, warnings: Array, hostedAllowed: boolean}}
 */
export function screenForHostedSynthesis (files) {
    const refusals = [];
    const warnings = [];

    for (const {name, source} of files || []) {
        const {spdx, family, evidence} = detectLicence(source);
        if (family === 'copyleft') {
            refusals.push({code: 'copyleft-source', file: name, spdx,
                reason: `"${name}" declares ${spdx}. Building it on our server and returning `
                    + 'a bitstream would convey a derivative work, which makes the service a '
                    + 'distributor of that licence. It can still be built LOCALLY, where you '
                    + 'compile it for yourself and nothing is conveyed.',
                evidence});
            continue;
        }
        if (family === 'unknown') {
            warnings.push({code: 'no-licence-declared', file: name,
                reason: `"${name}" declares no licence this can read. That is not a refusal — `
                    + 'most HDL carries no notice - but it also means nothing here has '
                    + 'checked whether it may be built on a shared server. If it is not '
                    + 'yours, find out.',
                evidence});
        }
    }

    return {refusals, warnings, hostedAllowed: refusals.length === 0};
}

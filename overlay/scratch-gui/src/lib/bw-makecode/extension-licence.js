/**
 * Licence classification for MakeCode extensions, shared by the vendoring sync
 * (scripts/sync-makecode-extensions.mjs) and the browser's on-demand fetch
 * (extension-fetch.js). Plain functions, no Node or DOM APIs.
 */

/** Licences that let us redistribute an extension with the app. */
export const REDISTRIBUTABLE = ['MIT', 'BSD-2-Clause', 'BSD-3-Clause', 'Apache-2.0', 'ISC', '0BSD', 'Zlib'];

/**
 * The licences an on-the-fly fetch (and the vendoring sync) accepts. The same
 * list as REDISTRIBUTABLE: everything else (GPL, LGPL, MPL, CC-*, no licence,
 * an unrecognised text) is refused by name.
 */
export const ALLOWED_LICENCES = REDISTRIBUTABLE;

/**
 * The licence a LICENSE text states, by its own wording, or null. Deliberately
 * narrow: a text this does not recognise is refused, not guessed at.
 */
export function licenceOf (text) {
    const t = String(text).replace(/\s+/g, ' ');
    // The heading may follow a copyright line (as in microsoft/pxt-neopixel); both
    // MIT sentences must be there.
    if (/\bMIT License\b/.test(t) && /Permission is hereby granted, free of charge/.test(t) &&
        /The above copyright notice and this permission notice shall be included/.test(t)) return 'MIT';
    if (/Apache License,? Version 2\.0/.test(t)) return 'Apache-2.0';
    if (/Redistribution and use in source and binary forms/.test(t)) return /Neither the name/.test(t) ? 'BSD-3-Clause' : 'BSD-2-Clause';
    if (/Permission to use, copy, modify, and\/or distribute this software for any purpose/.test(t)) return 'ISC';
    if (/This software is provided ['"`]?as-is['"`]?, without any express or implied warranty/i.test(t) &&
        /altered source versions must be plainly marked/i.test(t)) return 'Zlib';
    return null;
}

/** Normalise the SPDX-ish spelling a pxt.json `license` field may use. */
const spdxOf = value => {
    const v = String(value || '').trim().replace(/\s+/g, '-').toLowerCase();
    return {mit: 'MIT', 'bsd-2-clause': 'BSD-2-Clause', 'bsd-3-clause': 'BSD-3-Clause', 'apache-2.0': 'Apache-2.0',
        'apache2': 'Apache-2.0', isc: 'ISC', zlib: 'Zlib', '0bsd': '0BSD'}[v] || (v ? String(value).trim() : null);
};

/** The first `Copyright (c) <holder>` line of a licence text, without the year, or null. */
export function holderOf (text) {
    const m = /^[ \t>*#]*Copyright\b(?:\s*\(c\)|\s*©)?\s*(?:\d{4}(?:\s*[-,]\s*\d{4})*\s*,?\s*)?([^\n]*)$/im.exec(String(text || ''));
    const holder = m && m[1].replace(/\.?\s*All rights reserved\.?\s*$/i, '').trim().replace(/[.,]$/, '');
    return holder || null;
}

/**
 * Decide an extension's licence from its LICENSE text and its pxt.json
 * `license` field. The text decides; the manifest may only agree with it.
 * Returns {allowed, licence, holder, reason}. A missing LICENSE, an
 * unrecognised text, a licence off the allow-list, or a manifest that names a
 * different licence than the text all refuse (allowed false, with a reason).
 */
export function decideLicence ({licenceText, pxtLicense}) {
    const manifest = spdxOf(pxtLicense);
    if (!licenceText) return {allowed: false, licence: null, holder: null, reason: 'it has no LICENSE file'};
    const licence = licenceOf(licenceText);
    const holder = holderOf(licenceText);
    if (!licence) return {allowed: false, licence: null, holder, reason: 'its LICENSE is not a licence on the allow-list (' + ALLOWED_LICENCES.join(', ') + ')'};
    if (!ALLOWED_LICENCES.includes(licence)) return {allowed: false, licence, holder, reason: `${licence} is not on the allow-list (${ALLOWED_LICENCES.join(', ')})`};
    if (manifest && manifest !== licence) return {allowed: false, licence, holder, reason: `its LICENSE says ${licence} but its pxt.json says ${manifest}`};
    if (!holder) return {allowed: false, licence, holder, reason: 'its LICENSE names no copyright holder'};
    return {allowed: true, licence, holder, reason: null};
}

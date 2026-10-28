/**
 * Licence classification for MakeCode extensions, shared by the vendoring sync
 * (scripts/sync-makecode-extensions.mjs) and the browser's on-demand fetch
 * (extension-fetch.js). Plain functions, no Node or DOM APIs.
 */

/** Licences that let us redistribute an extension with the app. */
export const REDISTRIBUTABLE = ['MIT', 'BSD-2-Clause', 'BSD-3-Clause', 'Apache-2.0', 'ISC', '0BSD'];

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
    return null;
}

/**
 * Import a MakeCode project from a share link.
 *
 * This is the cheapest route into MakeCode by a wide margin — no hex
 * records, no LZMA, no steganography — because pxt's cloud already
 * serves the project as JSON: `GET https://makecode.com/api/{id}/text`
 * returns the same {filename: contents} map that embedded-source.js
 * works so hard to dig out of a binary. One endpoint covers Arcade,
 * micro:bit, Calliope and every other target.
 *
 * It is not a REPLACEMENT for the file importer, it is the other half:
 * this one needs the network, and the file importer is what works in the
 * packaged app, on a school laptop with no internet, and on the .hex a
 * pupil already has in their downloads folder.
 *
 * The share id is what the URL ends with. Both shapes are real:
 *   https://arcade.makecode.com/S12345-67890-12345-67890
 *   https://makecode.microbit.org/_bWfCf0hRXCXh
 *
 * @module
 */

import {parseFiles, describeProject} from './embedded-source.js';

const API_BASE = 'https://makecode.com/api';

/** Hosts we will talk to. A share link is a URL from a user; treat it as one. */
const ALLOWED_HOSTS = [
    'makecode.com',
    'www.makecode.com',
    'arcade.makecode.com',
    'makecode.microbit.org',
    'makecode.calliope.cc',
    'makecode.adafruit.com',
    'minecraft.makecode.com',
    'maker.makecode.com'
];

/**
 * Pull the share id out of whatever the user pasted — a full URL, a
 * `/#pub:` fragment, or the bare id.
 *
 * @param {string} input
 * @returns {string|null}
 */
export function parseShareId (input) {
    if (!input) return null;
    const trimmed = String(input).trim();

    // A bare id: `_` + 12 chars, or the persistent `S`-prefixed form.
    if (/^_[A-Za-z0-9]{6,}$/.test(trimmed)) return trimmed;
    if (/^S?\d{5}(-\d{5}){2,}$/.test(trimmed)) return trimmed;

    let url;
    try {
        url = new URL(trimmed);
    } catch (e) {
        return null;
    }
    if (!ALLOWED_HOSTS.includes(url.hostname)) return null;

    const fromHash = /(?:^|[#/])(?:pub:)?(_[A-Za-z0-9]{6,}|S?\d{5}(?:-\d{5}){2,})/.exec(
        `${url.pathname}${url.hash}`);
    return fromHash ? fromHash[1] : null;
}

/**
 * @param {string} input a share URL or id
 * @param {object} [opts]
 * @param {function} [opts.fetch] injected for tests and for the Tauri build
 * @returns {Promise<{id: string, meta: object, files: object, source: string, project: object}>}
 */
export async function fetchSharedProject (input, opts = {}) {
    const id = parseShareId(input);
    if (!id) throw new Error('That does not look like a MakeCode share link');
    const doFetch = opts.fetch || (typeof fetch === 'function' ? fetch : null);
    if (!doFetch) throw new Error('No fetch available to load the share link');

    const res = await doFetch(`${API_BASE}/${encodeURIComponent(id)}/text`);
    if (!res.ok) {
        throw new Error(res.status === 404
            ? 'MakeCode has no project with that share id'
            : `MakeCode returned ${res.status} for that share link`);
    }
    const source = await res.text();
    const files = parseFiles(source);
    if (!files) throw new Error('MakeCode returned something that is not a project');

    // pxt.json carries the name and the target; the share endpoint does
    // not repeat them, so read them from the project itself.
    let meta = {};
    try {
        const cfg = JSON.parse(files['pxt.json'] || '{}');
        meta = {name: cfg.name || '', pxtTarget: (cfg.targetVersions || {}).target || ''};
    } catch (e) { /* a project without a readable pxt.json is still a project */ }

    return {id, meta, files, source, project: describeProject(meta)};
}

// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// The whole LDraw.org Parts Library, read on demand: the Robot Lab vendors only the
// parts its palette ships (static/ldraw/, scripts/sync-ldraw-parts.mjs); any other of
// the ~23,700 catalogue parts is fetched from the ldraw-stl mirror when a learner adds
// it (the palette's "+", part-meta/catalog-parts.js).
//
// The mirror (https://github.com/CrispStrobe/ldraw-stl, scripts/build-library.mjs) is
// the CC BY files of the official complete.zip, unmodified: one zip cut into chunks,
// with an index of where each file's compressed bytes are (files.json), the catalogue
// (catalog.json: number, title, category, keywords, type) and manifest.json (source
// complete.zip, its sha256 and date). A file is one HTTP range request on a chunk,
// inflated here; a server that ignores Range gets each chunk fetched once instead.
// GitHub Pages answers cross-origin GETs with Access-Control-Allow-Origin: *, and a
// single-range Range header needs no preflight.

export const LDRAW_CATALOG_BASE = 'https://crispstrobe.github.io/ldraw-stl/library/';

/** Inflates raw deflate bytes in a browser (DecompressionStream); node --test passes zlib's. */
export const browserInflateRaw = async bytes => {
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
};

const concat = parts => {
    const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
    let o = 0;
    for (const p of parts) {
        out.set(p, o);
        o += p.length;
    }
    return out;
};

/**
 * @param {object} [options]
 * @param {string} [options.base] the mirror's library/ URL (with the trailing slash)
 * @param {typeof fetch} [options.fetchImpl]
 * @param {(bytes: Uint8Array) => Promise<Uint8Array>|Uint8Array} [options.inflateRaw]
 * @returns {Promise<{manifest: object, tag: string, has: (path: string) => boolean,
 *          read: (path: string) => Promise<string>, catalog: () => Promise<object[]>, fetched: () => string[]}>}
 *          paths are library-relative and lower case ('parts/3001.dat', 'p/stud.dat');
 *          catalog() lists {part: '3001.dat', title, category, keywords, type}
 */
export const openLDrawCatalog = async ({base = LDRAW_CATALOG_BASE, fetchImpl = globalThis.fetch, inflateRaw = browserInflateRaw} = {}) => {
    const json = async file => {
        const response = await fetchImpl(`${base}${file}`);
        if (!response.ok) throw new Error(`LDraw catalogue ${file}: HTTP ${response.status}`);
        return response.json();
    };
    const [manifest, files] = await Promise.all([json('manifest.json'), json('files.json')]);
    const {chunkSize, chunks} = manifest;
    const whole = new Map();
    const texts = new Map();
    const fetched = [];
    let ranges = null; // null: not known yet; true: the server answers 206; false: it does not
    let catalog = null;

    const wholeChunk = c => {
        if (!whole.has(c)) {
            whole.set(c, fetchImpl(`${base}${chunks[c].file}`).then(async r => {
                if (!r.ok) throw new Error(`LDraw catalogue ${chunks[c].file}: HTTP ${r.status}`);
                return new Uint8Array(await r.arrayBuffer());
            }));
        }
        return whole.get(c);
    };
    const slice = async (c, s, e) => {
        if (ranges !== false) {
            const r = await fetchImpl(`${base}${chunks[c].file}`, {headers: {Range: `bytes=${s}-${e - 1}`}});
            if (r.status === 206) {
                ranges = true;
                return new Uint8Array(await r.arrayBuffer());
            }
            if (!r.ok) throw new Error(`LDraw catalogue ${chunks[c].file}: HTTP ${r.status}`);
            ranges = false;
            const all = new Uint8Array(await r.arrayBuffer());
            whole.set(c, Promise.resolve(all));
            return all.subarray(s, e);
        }
        return (await wholeChunk(c)).subarray(s, e);
    };
    const bytes = async (start, end) => {
        const parts = [];
        for (let c = Math.floor(start / chunkSize); c * chunkSize < end; c++) {
            parts.push(await slice(c, Math.max(start, c * chunkSize) - c * chunkSize, Math.min(end, (c + 1) * chunkSize) - c * chunkSize));
        }
        return parts.length === 1 ? parts[0] : concat(parts);
    };
    const has = path => Object.prototype.hasOwnProperty.call(files, path);
    const read = path => {
        if (!texts.has(path)) {
            if (!has(path)) return Promise.reject(new Error(`LDraw catalogue: no ${path}`));
            const [start, csize, , method] = files[path];
            fetched.push(path);
            texts.set(path, bytes(start, start + csize)
                .then(data => (method === 8 ? inflateRaw(data) : data))
                .then(data => new TextDecoder().decode(data)));
        }
        return texts.get(path);
    };
    return {
        manifest,
        /** Names this library build (a stored part remembers which one it was derived from). */
        tag: `${manifest.source.date}/${manifest.zip.sha256.slice(0, 12)}`,
        has,
        read,
        catalog: async () => {
            if (!catalog) {
                catalog = json('catalog.json').then(({parts}) => parts.map(([name, title, category, keywords, type]) =>
                    ({part: `${name}.dat`, title, category, keywords, type})));
            }
            return catalog;
        },
        /** The library paths read so far (their attribution is in each file's header). */
        fetched: () => [...fetched]
    };
};

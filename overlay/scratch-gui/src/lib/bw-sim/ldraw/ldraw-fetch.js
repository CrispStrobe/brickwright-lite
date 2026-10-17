// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// Loads the LDraw files a model needs from the app's vendored subset
// (static/ldraw/, scripts/sync-ldraw-parts.mjs) into memory, so the
// synchronous geometry reader (ldraw-geometry.js) and the scene builder can
// use them. Same-origin only; the closure is discovered by parsing each file's
// type-1 references, in waves, so a model costs one round trip per nesting
// level rather than one per file.

import {parseLDraw, refKey, SEARCH_DIRS} from './ldraw-geometry.js';

export const LDRAW_BASE = 'static/ldraw/';

/**
 * @param {string[]} parts part file names, e.g. ['45601.dat', '54696p01.dat']
 * @param {object} [options]
 * @param {typeof fetch} [options.fetchImpl]
 * @param {string} [options.base]
 * @param {boolean} [options.withConfig] also load LDConfig.ldr (the colour table), readable as 'LDConfig.ldr'
 * @returns {Promise<{read: (path: string) => string|undefined, files: Map<string, string>, missing: string[]}>}
 *          read() takes library-relative paths ('parts/3001.dat', 'p/4-4cyli.dat');
 *          missing lists references found in no search directory
 */
export const fetchLDrawClosure = async (parts, {fetchImpl = globalThis.fetch, base = LDRAW_BASE, withConfig = false} = {}) => {
    const files = new Map();
    const missing = [];
    const tried = new Set();
    // One reference resolves to the first search directory that has it.
    const resolveOne = async ref => {
        const key = refKey(ref);
        for (const dir of SEARCH_DIRS) {
            const path = dir + key;
            if (files.has(path)) return path;
            if (!dir) continue;
            const response = await fetchImpl(`${base}${path}`);
            if (response.ok) {
                files.set(path, await response.text());
                return path;
            }
        }
        missing.push(ref);
        return null;
    };
    let wave = [...new Set(parts.map(refKey))];
    while (wave.length) {
        const found = await Promise.all(wave.filter(k => !tried.has(k)).map(k => {
            tried.add(k);
            return resolveOne(k);
        }));
        const next = new Set();
        for (const path of found) {
            if (!path) continue;
            for (const r of parseLDraw(files.get(path)).refs) {
                const k = refKey(r.file);
                if (!tried.has(k)) next.add(k);
            }
        }
        wave = [...next];
    }
    if (withConfig) {
        const response = await fetchImpl(`${base}LDConfig.ldr`);
        if (response.ok) files.set('ldconfig.ldr', await response.text());
        else missing.push('LDConfig.ldr');
    }
    return {read: p => files.get(p.toLowerCase()), files, missing};
};

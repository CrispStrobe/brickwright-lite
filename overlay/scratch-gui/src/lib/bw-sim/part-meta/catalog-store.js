// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// The parts a learner added from the LDraw catalogue (catalog-parts.js), kept on this
// device with the library build they came from and the attribution of their files. Kept
// apart from the deriver so the Sim Lab chunk carries only this; the deriver loads when
// a part is added.

export const CATALOG_PARTS_KEY = 'bw-sim-catalog-parts';

/**
 * The added parts kept on this device. `storage` is localStorage (or a stand-in).
 * Each entry: {meta, decoration, library (the catalogue build), credit: {title, author, license, url}}.
 */
export const createCatalogPartStore = (storage = globalThis.localStorage) => {
    const load = () => {
        try {
            const value = JSON.parse(storage?.getItem(CATALOG_PARTS_KEY) || 'null');
            return value && value.version === 1 && value.parts && typeof value.parts === 'object' ? value.parts : {};
        } catch {
            return {};
        }
    };
    const save = parts => {
        try {
            storage?.setItem(CATALOG_PARTS_KEY, JSON.stringify({version: 1, parts}));
            return true;
        } catch {
            return false; // private mode or full storage: the part still works until the page closes
        }
    };
    return {
        all: () => Object.entries(load()).map(([part, entry]) => ({part, ...entry})),
        get: part => load()[part] || null,
        put: (part, entry) => save({...load(), [part]: entry}),
        remove: part => {
            const parts = load();
            delete parts[part];
            return save(parts);
        }
    };
};

/** Attribution of one LDraw file (CC BY: creator, licence, source), from its header. */
export const creditOf = (path, text) => {
    const field = re => (re.exec(text) || [])[1]?.trim() || '';
    return {
        path,
        title: (text.split(/\r?\n/, 1)[0] || '').replace(/^0\s*/, '').trim(),
        author: field(/^\s*0\s+Author:\s*(.+)$/m),
        license: field(/^\s*0\s+!LICENSE\s+(.+)$/m),
        url: `https://library.ldraw.org/library/official/${path}`
    };
};

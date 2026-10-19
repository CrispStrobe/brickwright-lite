// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// The part catalogue, loaded in two pieces (sim-lab.js): the core — the hand-made
// parts every shipped model uses — is there at once; the rest (the System and
// Technic parts scripts/derive-part-meta.mjs derives from LDraw) is fetched when
// the palette first needs it (Build) or a model names a part the core lacks, and
// is added to the SAME Map, so everyone holding the catalogue sees it complete.
// A part is never refused for not being loaded yet: catalogFor loads first.

import {referencedFiles} from './ldraw-model.js';

/**
 * @param {object} options
 * @param {Map<string, object>} options.core the catalogue's first piece (part → PartMeta)
 * @param {() => Promise<Map<string, object>>} options.loadRest fetches the rest (part → PartMeta)
 * @returns {{catalog: Map, loadFullCatalog: () => Promise<Map>, catalogFor: (text: string) => Promise<Map>, loaded: () => boolean}}
 */
export const createLazyCatalog = ({core, loadRest}) => {
    const catalog = core;
    let pending = null;
    let done = false;
    /** Loads the rest into `catalog`, once (a failed fetch may be tried again). */
    const loadFullCatalog = () => {
        if (!pending) {
            pending = loadRest().then(rest => {
                for (const [part, meta] of rest) if (!catalog.has(part)) catalog.set(part, meta);
                done = true;
                return catalog;
            }, error => {
                pending = null;
                throw error;
            });
        }
        return pending;
    };
    /**
     * The catalogue, holding every part the LDraw text names that it has at all: a name not in
     * what is loaded (a derived part, an MPD's sub-model, a part no catalogue has) loads the rest first.
     */
    const catalogFor = async text => {
        if (done) return catalog;
        for (const name of referencedFiles(text)) {
            if (!catalog.has(name)) return loadFullCatalog();
        }
        return catalog;
    };
    return {catalog, loadFullCatalog, catalogFor, loaded: () => done};
};

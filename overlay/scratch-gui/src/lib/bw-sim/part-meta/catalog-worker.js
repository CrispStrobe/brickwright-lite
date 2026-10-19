// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// Derives one LDraw catalogue part off the main thread (its own chunk,
// bw-sim-catalog-worker): most parts take milliseconds, a few large ones seconds,
// and the editor must stay responsive meanwhile. The page sends the part and its
// LDraw closure and gets catalog-parts.js's result back; it ends the worker after
// one part, or when it takes too long (sim-lab.js deriveCatalogPart).

import {catalogPartMeta} from './catalog-parts.js';
import {validatePartMeta} from '../contracts.js';
import {BUILTIN_KINDS} from '../kinds/index.js';
import {MIN_ENGAGE_LDU} from '../kinds/pin-axle.js';

self.onmessage = e => {
    const {part, files} = e.data;
    const map = new Map(files);
    try {
        const result = catalogPartMeta(part, p => map.get(p.toLowerCase()),
            {validate: validatePartMeta, kinds: BUILTIN_KINDS.connectors, minEngage: MIN_ENGAGE_LDU});
        self.postMessage({ok: true, result});
    } catch (error) {
        self.postMessage({ok: false, error: error.message});
    }
};

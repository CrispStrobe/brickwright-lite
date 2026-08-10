/**
 * Sidecar loader (webpack build) — lite's version of the vite-only original.
 *
 * bw-circuit-ui uses import.meta.glob (vite-only). This uses require.context
 * (webpack-only) to do the same: eagerly load every JSON sidecar from
 * parts-data/ and register it.
 *
 * Import from circuit-tab.jsx's load(), not module-level — it pulls 115
 * JSON files (~464 KiB) into the importing chunk.
 *
 * @module
 */

import { registerSidecar } from './parts-registry.js';

const ctx = require.context('../parts-data', false, /\.json$/);

let count = 0;
for (const key of ctx.keys()) {
    const sidecar = ctx(key);
    const data = sidecar.default ?? sidecar;
    if (data && data.kind) {
        registerSidecar(data);
        count++;
    }
}

/** How many sidecars registered — consumers can sanity-check. */
export const SIDECAR_COUNT = count;

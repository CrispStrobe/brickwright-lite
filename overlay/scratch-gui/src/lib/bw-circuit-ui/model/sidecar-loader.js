/**
 * Sidecar loader (webpack) — uses require.context instead of import.meta.glob.
 * @module
 */
import { registerSidecar } from './parts-registry.js';

const ctx = require.context('../parts-data', false, /\.json$/);
let count = 0;
for (const key of ctx.keys()) {
    const sidecar = ctx(key);
    const data = sidecar.default ?? sidecar;
    if (data && data.kind) { registerSidecar(data); count++; }
}
export const SIDECAR_COUNT = count;

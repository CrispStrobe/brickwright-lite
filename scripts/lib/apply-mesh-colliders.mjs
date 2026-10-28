// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
import {deriveBoxes} from './derive-mesh-colliders.mjs';
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
/** Admit whole exact known lists, never silently overwrite a partly edited part. */
export const applyMeshColliders = (meta, entries, read) => {
    const pending = [];
    for (const [part, entry] of Object.entries(entries)) {
        const p = meta.parts.find(m => m.part === part);
        if (!p) throw new Error(`${part}: missing metadata`);
        const previous = entry.previousColliders;
        if (!Array.isArray(previous)) throw new Error(`${part}: missing previous collider list`);
        const boxes = deriveBoxes(part, entry, read);
        const at = entry.replaces ?? 0;
        const count = entry.replaces === undefined ? previous.length : entry.previousDerivedCount;
        if (!Number.isInteger(count) || count <= 0 || at < 0 || at + count > previous.length) throw new Error(`${part}: invalid replacement range`);
        const generated = [...previous.slice(0, at), ...boxes, ...previous.slice(at + count)];
        const original = [...previous.slice(0, at), entry.replaced, ...previous.slice(at + count)];
        if (![previous, original, generated].some(x => equal(p.colliders, x))) throw new Error(`${part}: colliders are neither exact original, published nor generated list`);
        pending.push([p, generated]);
    }
    // Validate every part before mutating any: one corrupt entry leaves the document intact.
    for (const [p, generated] of pending) p.colliders = generated;
    return meta;
};

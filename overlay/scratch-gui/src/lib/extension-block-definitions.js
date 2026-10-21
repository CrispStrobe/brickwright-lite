// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
// Extension refreshes repeat static definitions when a project or menu changes.
// Keep identical factories; deliberately replace changed definitions (theme,
// language, dropdown callback), instead of treating each refresh as a new block.
const registered = new WeakMap();
const equal = (a, b) => {
    if (Object.is(a, b)) return true;
    if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
    const keys = Object.keys(a);
    return keys.length === Object.keys(b).length && keys.every(k => Object.prototype.hasOwnProperty.call(b, k) && equal(a[k], b[k]));
};
const copy = value => {
    if (!value || typeof value !== 'object') return value; // retain callback identity
    return Array.isArray(value) ? value.map(copy) : Object.fromEntries(Object.entries(value).map(([k, v]) => [k, copy(v)]));
};
export const defineStaticExtensionBlocks = (blockly, definitions) => {
    if (!registered.has(blockly)) registered.set(blockly, new Map());
    const known = registered.get(blockly);
    for (const definition of definitions) {
        const type = definition.type;
        const previous = blockly.Blocks[type];
        const cached = known.get(type);
        if (previous && previous === cached?.factory && equal(definition, cached.definition)) continue;
        // This is an intentional replacement. Restore the old factory if a bad
        // definition throws, so an extension refresh cannot erase a working block.
        const snapshot = copy(definition);
        delete blockly.Blocks[type];
        try {
            blockly.defineBlocksWithJsonArray([definition]);
        } catch (error) {
            if (previous) blockly.Blocks[type] = previous;
            else delete blockly.Blocks[type];
            throw error;
        }
        known.set(type, {definition: snapshot, factory: blockly.Blocks[type]});
    }
};

// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// A Robot Lab example made of blocks (static/sim-lab/programs/*.blocks.json: an extension's blocks
// for one sprite, for a brick that has no pseudocode words yet — the NXT's legonxt). The file holds
// a sprite's blocks as project.json does (scratch-vm's sb3 serialisation: an input is [1, shadow],
// [2, block] or [3, block, shadow], a field [value, id]); `vm.shareBlocksToTarget` takes the VM's own
// block objects ({id, inputs: {NAME: {name, block, shadow}}, fields: {NAME: {name, value}}, …}),
// which is what vmBlocksOf turns them into. Pure: no VM, no DOM.

const inputOf = (name, value) => {
    const [kind, block, shadow] = value;
    // 1: a shadow alone; 2: a block, no shadow; 3: a block over a shadow.
    if (kind === 1) return {name, block, shadow: block};
    if (kind === 3) return {name, block, shadow: shadow ?? null};
    return {name, block, shadow: null};
};

/**
 * @param {Object<string, object>} blocks project.json blocks by id
 * @returns {object[]} the VM's block objects, in the file's order
 */
export const vmBlocksOf = blocks => Object.entries(blocks).map(([id, b]) => ({
    id,
    opcode: b.opcode,
    next: b.next ?? null,
    parent: b.parent ?? null,
    shadow: Boolean(b.shadow),
    topLevel: Boolean(b.topLevel),
    ...(b.topLevel ? {x: b.x ?? 0, y: b.y ?? 0} : {}),
    inputs: Object.fromEntries(Object.entries(b.inputs || {}).map(([name, v]) => [name, inputOf(name, v)])),
    fields: Object.fromEntries(Object.entries(b.fields || {}).map(([name, v]) => [name, {name, value: v[0], ...(v[1] ? {id: v[1]} : {})}]))
}));

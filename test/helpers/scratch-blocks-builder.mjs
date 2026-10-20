// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
/**
 * Scratch 3 project blocks, written by hand for tests (an extension's own blocks, for extensions
 * that have no pseudocode words: the stock `ev3`, `legonxt`). The serialisation is the project.json
 * one (scratch-vm src/serialization/sb3.js reads it): a block's inputs are [1, shadow] for a value
 * or an extension menu that takes reporters, [2, block] for a boolean or a substack; a menu that
 * takes no reporters is a field of the block.
 */
export const blocksBuilder = () => {
    let n = 0;
    const blocks = {};
    const make = (opcode, {shadow = false, top = false} = {}) => {
        const id = `${shadow ? 's' : 'b'}${++n}`;
        blocks[id] = {opcode, next: null, parent: null, inputs: {}, fields: {}, shadow, topLevel: top, ...(top ? {x: 40 + 400 * (n % 3), y: 40} : {})};
        return id;
    };
    const api = {
        blocks,
        /** A shadow holding one field: a number, a text, an extension menu. */
        shadow (opcode, field, value, parent) {
            const id = make(opcode, {shadow: true});
            blocks[id].fields[field] = [String(value), null];
            blocks[id].parent = parent;
            return id;
        },
        num (value, parent, opcode = 'math_number') { return api.shadow(opcode, 'NUM', value, parent); },
        /**
         * A block: values {NAME: number} become number shadows, menus {NAME: [menuOpcode, field, value]}
         * menu shadows, fields {NAME: value} fields, conditions/substacks {NAME: blockId} block inputs.
         */
        block (opcode, {values = {}, menus = {}, fields = {}, blocksIn = {}, top = false} = {}) {
            const id = make(opcode, {top});
            const b = blocks[id];
            // {NAME: 3} a math_number; {NAME: {value: 2, op: 'math_positive_number'}} another number shadow.
            for (const [k, v] of Object.entries(values)) b.inputs[k] = [1, typeof v === 'object' ? api.num(v.value, id, v.op) : api.num(v, id)];
            for (const [k, [menuOpcode, field, value]] of Object.entries(menus)) b.inputs[k] = [1, api.shadow(menuOpcode, field, value, id)];
            for (const [k, v] of Object.entries(fields)) b.fields[k] = [String(v), null];
            for (const [k, child] of Object.entries(blocksIn)) {
                b.inputs[k] = [2, child];
                blocks[child].parent = id;
            }
            return id;
        },
        /** Links blocks into a stack (next/parent); returns the first. */
        stack (...ids) {
            for (let i = 0; i < ids.length; i++) {
                if (i > 0) blocks[ids[i]].parent = ids[i - 1];
                if (i < ids.length - 1) blocks[ids[i]].next = ids[i + 1];
            }
            return ids[0];
        }
    };
    return api;
};

import MENU_TABLE from '../extension-menu-table.js';

// Syntax only. Receiver, writer, alias and currentness authority still belongs
// to each consumer of the original project graph, never a readableView clone.
const menus = Object.freeze({arrays_mutateReference: 'referenceMutations',
    arrays_referenceTake: 'referenceTakeOperations'});
export const isArrayMenuSelector = (block, name) => name === 'OP' &&
    typeof block?.opcode === 'string' && Object.hasOwn(menus, block.opcode);
const pair = value => Array.isArray(value) && value.length === 2 && Object.keys(value).length === 2 &&
    typeof value[0] === 'string' && value[1] === null;

export function arrayMenuLiteral(target, block, name) {
    if (!isArrayMenuSelector(block, name)) return null;
    const menu = menus[block.opcode];
    if (MENU_TABLE[block.opcode]?.OP !== '+' + menu) return null;
    const blocks = target?.blocks;
    if (!blocks || typeof blocks !== 'object') return null;
    const owners = Object.entries(blocks).filter(([, value]) => value === block);
    if (owners.length !== 1) return null;
    const [id] = owners[0], fields = block.fields || {}, inputs = block.inputs || {};
    // A synthetic field beside a physical input is never a selector proof.
    if (Object.hasOwn(fields, name)) {
        if (Object.hasOwn(inputs, name)) return null;
        return pair(fields[name]) ? fields[name][0] : null;
    }
    const slot = inputs[name];
    if (!Array.isArray(slot) || slot.length !== 2 || Object.keys(slot).length !== 2 || slot[0] !== 1) return null;
    const value = slot[1];
    if (Array.isArray(value)) return value.length === 2 && Object.keys(value).length === 2 && value[0] === 10 &&
        typeof value[1] === 'string' ? value[1] : null;
    if (typeof value !== 'string' || !Object.hasOwn(blocks, value)) return null;
    const shadow = blocks[value];
    if (!shadow || Object.values(blocks).filter(node => node === shadow).length !== 1 || shadow.shadow !== true || shadow.topLevel !== false ||
        shadow.parent !== id || shadow.next !== null ||
        Object.keys(shadow).some(key => !['opcode', 'parent', 'next', 'inputs', 'fields', 'shadow', 'topLevel'].includes(key)) ||
        !shadow.inputs || Object.keys(shadow.inputs).length || !shadow.fields) return null;
    const field = shadow.opcode === 'arrays_menu_' + menu ? menu :
        shadow.opcode === 'text' ? 'TEXT' : null;
    if (!field || Object.keys(shadow.fields).join('|') !== field || !pair(shadow.fields[field])) return null;
    // The selector must have one current physical owner/slot edge. A stored
    // parent label alone cannot authorize a shared or detached shadow.
    let incoming = 0;
    for (const node of Object.values(blocks)) {
        if (node?.next === value) incoming++;
        for (const edge of Object.values(node?.inputs || {})) {
            if (!Array.isArray(edge)) continue;
            if (edge[1] === value) incoming++;
            if (edge[2] === value) incoming++;
        }
    }
    return incoming === 1 ? shadow.fields[field][0] : null;
}

// Syntax classification only, used to REVOKE element facts for an unknown
// operation. It cannot establish any receiver, element or allocation fact.
export const isKnownArrayMenuOperation = (block, operation) => typeof operation === 'string' &&
    (block?.opcode === 'arrays_mutateReference' ?
        ['push','unshift','set','insertAt','pop','shift','removeAt','removeElement','reverse','length'].includes(operation) :
        block?.opcode === 'arrays_referenceTake' && ['pop','shift','removeAt'].includes(operation));

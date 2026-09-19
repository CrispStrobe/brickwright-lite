/**
 * The gate-builder palette catalogue — the categorised list of things you can
 * drag onto the canvas. Pure data derived from GATE_DEFS (the one gate
 * definition source) plus the special I/O and memory nodes and the starter
 * templates, so the palette UI stays a thin view over it and is unit-tested
 * without a browser.
 *
 * @module
 */
import {GATE_DEFS} from './gate-builder.js';

// Which gate types sit in which category. Every GATE_DEFS key appears exactly
// once (guarded by the unit test) so nothing the codegen understands is hidden.
const GATE_CATEGORIES = [
    {id: 'logic', label: 'Logic', types: ['and', 'or', 'not', 'buffer', 'cinv', 'xor', 'nand', 'nor', 'xnor']},
    {id: 'arith', label: 'Arithmetic', types: ['add', 'sub', 'mul', 'shl', 'shr']},
    {id: 'compare', label: 'Compare', types: ['eq', 'neq', 'lt', 'gt', 'lte', 'gte']},
    {id: 'mux', label: 'Select', types: ['mux']},
    {id: 'seq', label: 'Sequential', types: ['dff', 'tff', 'srff', 'jkff']},
    {id: 'bus', label: 'Bus', types: ['slice', 'concat']}
];

/**
 * Build the palette: a list of {id, label, items[]} sections. Each item is a
 * drag descriptor the canvas turns into a node:
 *   {kind:'gate', gtype, label}  |  {kind:'in'|'out', label}
 *   {kind:'memory', label}       |  {kind:'template', label, model}
 *
 * @param {Array} [templates] starter designs ({label, model|nodes/edges}) for a Templates section
 * @returns {Array} palette sections
 */
export function buildPaletteCatalog (templates = []) {
    const sections = [];

    sections.push({id: 'io', label: 'In / Out', items: [
        {kind: 'in', label: 'Input'},
        {kind: 'out', label: 'Output'},
        {kind: 'const', label: 'Constant'}
    ]});

    for (const cat of GATE_CATEGORIES) {
        sections.push({
            id: cat.id,
            label: cat.label,
            items: cat.types.map(gtype => ({
                kind: 'gate',
                gtype,
                label: (GATE_DEFS[gtype] && GATE_DEFS[gtype].label) || gtype.toUpperCase()
            }))
        });
    }

    sections.push({id: 'mem', label: 'Memory', items: [
        {kind: 'memory', label: 'RAM'}
    ]});

    if (templates && templates.length) {
        sections.push({
            id: 'templates',
            label: 'Templates',
            items: templates.map(t => ({kind: 'template', label: t.label, model: t.model || t}))
        });
    }

    return sections;
}

/** Flatten the catalogue to a searchable item list (each item keeps its section label). */
export function paletteItems (sections) {
    return sections.flatMap(s => s.items.map(item => ({...item, section: s.label})));
}

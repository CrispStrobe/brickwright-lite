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
import {t} from './l10n.js';

// Which gate types sit in which category. Every GATE_DEFS key appears exactly
// once (guarded by the unit test) so nothing the codegen understands is hidden.
const GATE_CATEGORIES = [
    {id: 'logic', types: ['and', 'or', 'not', 'buffer', 'cinv', 'xor', 'nand', 'nor', 'xnor']},
    {id: 'arith', types: ['add', 'sub', 'mul', 'shl', 'shr']},
    {id: 'compare', types: ['eq', 'neq', 'lt', 'gt', 'lte', 'gte']},
    {id: 'mux', types: ['mux']},
    {id: 'seq', types: ['dff', 'tff', 'srff', 'jkff']},
    {id: 'bus', types: ['slice', 'concat']}
];

/**
 * Build the palette: a list of {id, label, items[]} sections. Each item is a
 * drag descriptor the canvas turns into a node:
 *   {kind:'gate', gtype, label}  |  {kind:'in'|'out', label}
 *   {kind:'memory', label}       |  {kind:'template', label, model}
 *
 * EVERY SECTION AND FIXED ITEM NAME IS TRANSLATED. The labels used to be
 * English literals here, and the i18n guard could not see them: it is scoped to
 * files that import the translation helpers, and this file imported none — so
 * the whole palette stayed English while the surface around it was bilingual.
 * Section ids now carry the meaning and `t(locale, 'palette.<id>')` supplies the
 * words. Gate labels still come from GATE_DEFS, which is the one gate
 * definition source and names them the way a schematic does (AND, XOR) in every
 * language; a TEMPLATE's label is its own content, not a UI string.
 *
 * @param {Array} [templates] starter designs ({label, model|nodes/edges}) for a Templates section
 * @param {Array} [blocks] saved subcircuits
 * @param {string} [locale] the reader's locale; defaults to English
 * @returns {Array} palette sections
 */
export function buildPaletteCatalog (templates = [], blocks = [], locale) {
    const sections = [];
    const L = id => t(locale, `palette.${id}`);

    sections.push({id: 'io', label: L('io'), items: [
        {kind: 'in', label: L('in')},
        {kind: 'out', label: L('out')},
        {kind: 'const', label: L('const')}
    ]});

    for (const cat of GATE_CATEGORIES) {
        sections.push({
            id: cat.id,
            label: L(cat.id),
            items: cat.types.map(gtype => ({
                kind: 'gate',
                gtype,
                label: (GATE_DEFS[gtype] && GATE_DEFS[gtype].label) || gtype.toUpperCase()
            }))
        });
    }

    sections.push({id: 'display', label: L('display'), items: [
        {kind: 'led', label: L('led')},
        {kind: 'ledbank', label: L('ledbank')},
        {kind: 'seg7', label: L('seg7')}
    ]});

    sections.push({id: 'mem', label: L('mem'), items: [
        {kind: 'memory', label: L('memory')},
        {kind: 'tunnel', label: L('tunnel')}
    ]});

    if (blocks && blocks.length) {
        sections.push({
            id: 'blocks',
            label: L('blocks'),
            items: blocks.map(b => ({kind: 'template', label: b.label, model: b.model}))
        });
    }

    if (templates && templates.length) {
        sections.push({
            id: 'templates',
            label: L('templates'),
            items: templates.map(t => ({kind: 'template', label: t.label, model: t.model || t}))
        });
    }

    return sections;
}

/** Flatten the catalogue to a searchable item list (each item keeps its section label). */
export function paletteItems (sections) {
    return sections.flatMap(s => s.items.map(item => ({...item, section: s.label})));
}

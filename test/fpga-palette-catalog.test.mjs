/**
 * The palette catalogue is a thin, pure view over GATE_DEFS. These assert it
 * exposes every gate the codegen understands (exactly once), keeps the special
 * I/O + memory nodes, and folds in templates — so the palette UI can stay dumb.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {buildPaletteCatalog, paletteItems} from '../overlay/scratch-gui/src/lib/bw-fpga/palette-catalog.js';
import {GATE_DEFS} from '../overlay/scratch-gui/src/lib/bw-fpga/gate-builder.js';

test('every GATE_DEFS type appears in exactly one gate palette item', () => {
    const items = paletteItems(buildPaletteCatalog());
    const gtypes = items.filter(i => i.kind === 'gate').map(i => i.gtype);
    const expected = Object.keys(GATE_DEFS).sort();
    assert.deepEqual([...gtypes].sort(), expected, 'palette gates must match GATE_DEFS exactly');
    assert.equal(gtypes.length, new Set(gtypes).size, 'no gate listed twice');
});

test('the catalogue carries the special I/O and memory nodes', () => {
    const items = paletteItems(buildPaletteCatalog());
    assert.ok(items.some(i => i.kind === 'in'), 'an Input node');
    assert.ok(items.some(i => i.kind === 'out'), 'an Output node');
    assert.ok(items.some(i => i.kind === 'memory'), 'a RAM node');
});

test('each gate item carries a human label from GATE_DEFS', () => {
    const items = paletteItems(buildPaletteCatalog());
    const and = items.find(i => i.gtype === 'and');
    assert.equal(and.label, GATE_DEFS.and.label);
    assert.equal(and.section, 'Logic');
});

test('templates become their own section only when provided', () => {
    assert.ok(!buildPaletteCatalog().some(s => s.id === 'templates'), 'none by default');
    const withT = buildPaletteCatalog([{label: 'Blinky', model: {nodes: [], edges: []}}]);
    const section = withT.find(s => s.id === 'templates');
    assert.ok(section, 'a Templates section appears');
    assert.equal(section.items[0].kind, 'template');
    assert.equal(section.items[0].label, 'Blinky');
});

test('a blocks list becomes a Blocks section that drops as templates', () => {
    const cat = buildPaletteCatalog([], [{id: 'demux', label: '1:2 Demux', model: {nodes: [], edges: []}}]);
    const blocks = cat.find(s => s.id === 'blocks');
    assert.ok(blocks, 'a Blocks section appears');
    assert.equal(blocks.items[0].kind, 'template', 'blocks drop via the template path');
    assert.equal(blocks.items[0].label, '1:2 Demux');
});

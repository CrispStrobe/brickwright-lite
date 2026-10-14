/**
 * The shared gate glyphs — one source of truth for the CLI, the schematic view,
 * and the interactive canvas. These assert each cell family produces its own
 * recognisable shape (not a generic box) so the three surfaces stay in step.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {gateShape, OP_GLYPH} from '../overlay/scratch-gui/src/lib/bw-fpga/glyphs.js';

const box = {x: 0, y: 0, width: 60, height: 40};

test('primitive gates get distinct shapes, not a labelled box', () => {
    assert.match(gateShape({...box, type: 'and'}), /<path class="gate" d="M .*A /, 'AND is a flat-back D');
    assert.match(gateShape({...box, type: 'or'}), /<path class="gate" d="M .*Q /, 'OR is a curved body');
    assert.match(gateShape({...box, type: 'xor'}), /class="gate-line"/, 'XOR adds the extra arc');
    assert.match(gateShape({...box, type: 'not'}), /<polygon class="gate".*<circle class="gate"/s, 'NOT is a triangle + bubble');
    assert.match(gateShape({...box, type: 'mux'}), /<polygon class="gate"/, 'MUX is a trapezoid');
    for (const t of ['and', 'or', 'xor', 'not', 'mux']) {
        assert.doesNotMatch(gateShape({...box, type: t}), /class="gate-label"/, `${t} needs no text fallback`);
    }
});

test('a register draws as a clocked box with an edge triangle', () => {
    const svg = gateShape({...box, type: 'adff'});
    assert.match(svg, /<rect class="gate"/, 'the register body');
    assert.match(svg, /class="gate-line" d="M 0 13 L 9 20 L 0 27"/, 'the clock-edge triangle');
    assert.match(svg, />aDFF</, 'tagged aDFF');
});

test('arithmetic/comparator cells render their operator glyph', () => {
    assert.match(gateShape({...box, type: 'add'}), /class="gate-op"[^>]*>\+</);
    assert.match(gateShape({...box, type: 'neq'}), /class="gate-op"[^>]*>≠</);
    assert.match(gateShape({...box, type: 'reduce_or'}), /class="gate-op"[^>]*>≥1</);
    assert.equal(OP_GLYPH.eq, '=');
});

test('slice/concat are compact bus-tap bars, never full boxes', () => {
    const slice = gateShape({x: 0, y: 0, width: 16, height: 30, type: 'slice', hi: 3, lo: 0});
    assert.match(slice, /class="bus-tap"/);
    assert.match(slice, /class="bus-label"[^>]*>3:0</, 'labels the bit range');
    assert.doesNotMatch(slice, /class="gate"/, 'no gate box');
    // a single-bit slice labels just the one index
    assert.match(gateShape({x: 0, y: 0, width: 16, height: 30, type: 'slice', hi: 2, lo: 2}), />2</);
});

test('an unknown cell type falls back to an uppercased label box', () => {
    const svg = gateShape({...box, type: 'weird'});
    assert.match(svg, /<rect class="gate"/);
    assert.match(svg, /class="gate-label"[^>]*>WEIRD</);
});

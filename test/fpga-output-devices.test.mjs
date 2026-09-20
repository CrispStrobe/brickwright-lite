/**
 * The seven-segment decoder, proved against its font. The generated gate model,
 * evaluated EXHAUSTIVELY over all 16 inputs, must light exactly the segments the
 * hex font specifies — and synthesise to legal Verilog. The font is the oracle;
 * this also stress-tests the truth-table synthesiser on a real 4→7 function.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {SEG7_FONT, SEGMENTS, decodeSeg7, sevenSegDecoderModel, sevenSegSvg, seg7Value, ledValue, ledBankValues} from '../overlay/scratch-gui/src/lib/bw-fpga/output-devices.js';
import {evalModel} from '../overlay/scratch-gui/src/lib/bw-fpga/gate-eval.js';
import {modelToVerilog} from '../overlay/scratch-gui/src/lib/bw-fpga/gate-builder.js';

test('the font covers every hex digit with exactly the seven segments', () => {
    assert.equal(SEG7_FONT.length, 16);
    for (const glyph of SEG7_FONT) {
        assert.deepEqual(Object.keys(glyph).sort(), [...SEGMENTS].sort());
        for (const s of SEGMENTS) assert.ok(glyph[s] === 0 || glyph[s] === 1);
    }
    // 8 lights all seven; 1 lights only b and c — the recognisable anchors.
    assert.deepEqual(SEG7_FONT[8], {a: 1, b: 1, c: 1, d: 1, e: 1, f: 1, g: 1});
    assert.deepEqual(SEG7_FONT[1], {a: 0, b: 1, c: 1, d: 0, e: 0, f: 0, g: 0});
});

test('decodeSeg7 wraps out-of-range values into 0–15', () => {
    assert.deepEqual(decodeSeg7(0), SEG7_FONT[0]);
    assert.deepEqual(decodeSeg7(16), SEG7_FONT[0]);
    assert.deepEqual(decodeSeg7(-1), SEG7_FONT[15]);
});

test('the synthesised decoder is legal HDL', () => {
    assert.deepEqual(modelToVerilog(sevenSegDecoderModel()).problems, []);
});

test('the decoder lights exactly the font, for every input (0–F)', () => {
    const model = sevenSegDecoderModel();
    for (let v = 0; v < 16; v++) {
        const inputs = {d0: v & 1, d1: (v >> 1) & 1, d2: (v >> 2) & 1, d3: (v >> 3) & 1};
        const {outputs, settled} = evalModel(model, inputs);
        assert.equal(settled, true, `settles at ${v}`);
        for (const s of SEGMENTS) {
            assert.equal(outputs[`seg_${s}`], SEG7_FONT[v][s],
                `digit ${v.toString(16)} segment ${s}`);
        }
    }
});

test('sevenSegSvg lights exactly the font segments (from a value or a segment map)', () => {
    const litCount = svg => (svg.match(/data-on="1"/g) || []).length;
    for (let v = 0; v < 16; v++) {
        const want = SEGMENTS.filter(s => SEG7_FONT[v][s]).length;
        assert.equal(litCount(sevenSegSvg(v)), want, `value ${v.toString(16)}`);
    }
    // A direct segment map drives the segments without decoding.
    const only_a = sevenSegSvg({a: 1});
    assert.match(only_a, /class="bw-seg bw-seg-a" data-on="1"/);
    assert.match(only_a, /bw-seg-b" data-on="0"/);
    assert.equal(litCount(only_a), 1);
    // Well-formed: one polygon per segment, all seven present.
    const svg = sevenSegSvg(8);
    assert.equal((svg.match(/<polygon/g) || []).length, 7);
    for (const s of SEGMENTS) assert.match(svg, new RegExp(`bw-seg-${s}`));
});

test('seg7Value reads the 4-bit number off d0..d3 live values (LSB = d0)', () => {
    const edges = [
        {source: 'n0', target: 'disp', targetHandle: 'd0'},
        {source: 'n1', target: 'disp', targetHandle: 'd1'},
        {source: 'n2', target: 'disp', targetHandle: 'd2'},
        {source: 'n3', target: 'disp', targetHandle: 'd3'}
    ];
    assert.equal(seg7Value('disp', edges, {n0: 1, n1: 0, n2: 1, n3: 0}), 0b0101);
    assert.equal(seg7Value('disp', edges, {n0: 1, n1: 1, n2: 1, n3: 1}), 15);
    assert.equal(seg7Value('disp', edges, {}), 0); // nothing driven → 0
});

test('ledValue reads the single bit driving an LED (undefined if unwired)', () => {
    const edges = [{source: 'g', target: 'led', targetHandle: 'in'}];
    assert.equal(ledValue('led', edges, {g: 1}), 1);
    assert.equal(ledValue('led', edges, {g: 0}), 0);
    assert.equal(ledValue('led', [], {g: 1}), undefined);
});

test('ledBankValues reads each bit of a bank from its d0..d(n-1) inputs', () => {
    const edges = [
        {source: 'g0', target: 'bank', targetHandle: 'd0'},
        {source: 'g1', target: 'bank', targetHandle: 'd1'},
        {source: 'g2', target: 'bank', targetHandle: 'd2'}
        // d3 intentionally unwired
    ];
    const vals = {g0: 1, g1: 0, g2: 1};
    assert.deepEqual(ledBankValues('bank', edges, vals, 4), [1, 0, 1, undefined]);
    assert.deepEqual(ledBankValues('bank', [], vals, 2), [undefined, undefined]);
});

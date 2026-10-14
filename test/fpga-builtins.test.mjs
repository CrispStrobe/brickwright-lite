/**
 * The built-in composite blocks (decoder/demux) are real gate models that must
 * be logically correct and synthesise cleanly. Checked exhaustively against the
 * maths — the same oracle idea as the learning-path grader.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {BUILTINS} from '../overlay/scratch-gui/src/lib/bw-fpga/builtins.js';
import {evalModel} from '../overlay/scratch-gui/src/lib/bw-fpga/gate-eval.js';
import {modelToVerilog} from '../overlay/scratch-gui/src/lib/bw-fpga/gate-builder.js';

const byId = id => BUILTINS.find(b => b.id === id).model;

test('every built-in block synthesises without a codegen problem', () => {
    for (const b of BUILTINS) assert.deepEqual(modelToVerilog(b.model).problems, [], `${b.id}`);
});

test('the 2:4 decoder is one-hot for every select', () => {
    const dec = byId('decoder2to4');
    for (let s1 = 0; s1 < 2; s1++) {
        for (let s0 = 0; s0 < 2; s0++) {
            const o = evalModel(dec, {s0, s1}).outputs;
            const expected = [0, 0, 0, 0]; expected[(s1 << 1) | s0] = 1;
            assert.deepEqual([o.y0, o.y1, o.y2, o.y3], expected, `s1=${s1} s0=${s0}`);
        }
    }
});

test('the 1:2 demux routes in to y0/y1 by sel', () => {
    const dem = byId('demux1to2');
    for (const din of [0, 1]) {
        for (const sel of [0, 1]) {
            const o = evalModel(dem, {in: din, sel}).outputs;
            assert.equal(o.y0, din & (sel ? 0 : 1), `y0 din=${din} sel=${sel}`);
            assert.equal(o.y1, din & sel, `y1 din=${din} sel=${sel}`);
        }
    }
});

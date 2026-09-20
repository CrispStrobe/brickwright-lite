/**
 * Memory-mapped I/O — the Code↔FPGA bridge, proved as a round-trip: a program
 * writes input registers, one bus cycle drives the FPGA design and reads its
 * outputs back into registers, and the program sees the hardware's answer. The
 * gate evaluator is the oracle for what the hardware computes; MMIO is just the
 * address map around it. Pure — no browser, no emulator.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultMmioMap, mmioInputs, runMmioCycle} from '../overlay/scratch-gui/src/lib/bw-fpga/mmio.js';

const adder = {
    nodes: [
        {id: 'a', kind: 'in', name: 'a', width: 4}, {id: 'b', kind: 'in', name: 'b', width: 4},
        {id: 'g', kind: 'gate', type: 'add', width: 4}, {id: 'sum', kind: 'out', name: 'sum', width: 4}
    ],
    edges: [
        {from: {node: 'a', port: 'out'}, to: {node: 'g', port: 'a'}},
        {from: {node: 'b', port: 'out'}, to: {node: 'g', port: 'b'}},
        {from: {node: 'g', port: 'out'}, to: {node: 'sum', port: 'in'}}
    ]
};

const counter = {
    nodes: [
        {id: 'clk', kind: 'in', name: 'clk'}, {id: 'one', kind: 'const', value: 1, width: 4},
        {id: 'q', kind: 'gate', type: 'dff', width: 4}, {id: 'add', kind: 'gate', type: 'add', width: 4},
        {id: 'count', kind: 'out', name: 'count', width: 4}
    ],
    edges: [
        {from: {node: 'clk', port: 'out'}, to: {node: 'q', port: 'clk'}},
        {from: {node: 'q', port: 'out'}, to: {node: 'add', port: 'a'}},
        {from: {node: 'one', port: 'out'}, to: {node: 'add', port: 'b'}},
        {from: {node: 'add', port: 'out'}, to: {node: 'q', port: 'd'}},
        {from: {node: 'q', port: 'out'}, to: {node: 'count', port: 'in'}}
    ]
};

test('the default map addresses inputs at 0x00.. and outputs at 0x10.., skipping clk', () => {
    assert.deepEqual(defaultMmioMap(adder), [
        {addr: 0x00, port: 'a', dir: 'in', width: 4},
        {addr: 0x01, port: 'b', dir: 'in', width: 4},
        {addr: 0x10, port: 'sum', dir: 'out', width: 4}
    ]);
    // the clock is the bus cycle, not a register the program pokes
    assert.deepEqual(defaultMmioMap(counter), [{addr: 0x10, port: 'count', dir: 'out', width: 4}]);
});

test('a program writes inputs, the FPGA computes, the program reads the output', () => {
    const map = defaultMmioMap(adder);
    assert.deepEqual(mmioInputs(map, {0x00: 5, 0x01: 9}), {a: 5, b: 9});
    const {regs} = runMmioCycle(adder, map, {0x00: 5, 0x01: 9});
    assert.equal(regs[0x10], 14, 'sum reads back at its address');
    // wraps in the design's width, exactly as the hardware would
    assert.equal(runMmioCycle(adder, map, {0x00: 12, 0x01: 7}).regs[0x10], 3);
});

test('a memory-mapped counter increments each bus cycle', () => {
    const map = defaultMmioMap(counter);
    let regs = {}; let cs = {}; const reads = [];
    for (let i = 0; i < 6; i++) { const o = runMmioCycle(counter, map, regs, cs); reads.push(o.regs[0x10]); regs = o.regs; cs = o.clockState; }
    assert.deepEqual(reads, [0, 1, 2, 3, 4, 5]);
});

test('an unwritten input register reads as 0 (the design ties it low)', () => {
    const {regs} = runMmioCycle(adder, defaultMmioMap(adder), {0x00: 6}); // b unwritten
    assert.equal(regs[0x10], 6, '6 + 0');
});

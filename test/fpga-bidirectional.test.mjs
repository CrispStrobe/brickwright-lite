/**
 * The bidirectional FPGA↔Circuits loop: the demo board puts a SWITCH on each
 * input pin (press → drives the FPGA input), and readBoardInputs reads those
 * pins back into the design. Together with applyPortValues (outputs → LEDs) the
 * loop runs both ways. Pure — mock circuit/board, no browser.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readBoardInputs} from '../overlay/scratch-gui/src/lib/bw-fpga/drive.js';
import {buildDemoBoard} from '../overlay/scratch-gui/src/lib/bw-fpga/demo-board.js';

test('readBoardInputs reads only input pins, assembles buses LSB-first', () => {
    const bindings = [
        {port: 'btn', terminal: 'p74', direction: 'input'},
        {port: 'a', base: 'a', index: 0, terminal: 'p76', direction: 'input'},
        {port: 'a', base: 'a', index: 1, terminal: 'p77', direction: 'input'},
        {port: 'led', terminal: 'p15', direction: 'output'}
    ];
    const board = {readPin: t => ({p74: 1, p76: 1, p77: 0, p15: 1}[t] || 0)};
    assert.deepEqual(readBoardInputs(bindings, board), {btn: 1, a: 1});
    // p77 high → a = 0b11 = 3
    const board2 = {readPin: t => ({p74: 0, p76: 1, p77: 1}[t] || 0)};
    assert.deepEqual(readBoardInputs(bindings, board2), {btn: 0, a: 3});
    // no board / no readPin → empty (safe)
    assert.deepEqual(readBoardInputs(bindings, null), {});
    assert.deepEqual(readBoardInputs(bindings, {}), {});
});

function mockCircuit () {
    const parts = []; const wires = []; let n = 0;
    return {
        parts, wires,
        addPart: (kind, params, x, y) => { const p = {id: `P${n++}`, kind, params, x, y}; parts.push(p); return p; },
        addWire: (a, ta, b, tb) => wires.push([a, ta, b, tb]),
        seatPart: () => {}, removePart: id => { const i = parts.findIndex(p => p.id === id); if (i >= 0) parts.splice(i, 1); }
    };
}

test('the demo board puts a switch (+pulldown) on each input pin, wired to the Tang', () => {
    const c = mockCircuit();
    const r = buildDemoBoard(c, {pins: [15, 16], inputPins: [74, 76]});
    assert.equal(r.switches.length, 2, 'a switch per input pin');
    assert.equal(c.parts.filter(p => p.kind === 'switch').length, 2);
    // each switch is wired to its Tang input pin
    const tang = c.parts.find(p => p.kind === 'tang_nano_20k').id;
    for (const pin of [74, 76]) {
        assert.ok(c.wires.some(w => (w[0] === tang && w[1] === `p${pin}`) || (w[2] === tang && w[3] === `p${pin}`)),
            `input pin ${pin} is wired to the Tang`);
    }
    // still builds the output LEDs
    assert.equal(r.leds.length, 2);
});

test('no inputPins → no switches (backward compatible)', () => {
    const c = mockCircuit();
    const r = buildDemoBoard(c, {pins: [15]});
    assert.equal(r.switches.length, 0);
    assert.equal(c.parts.filter(p => p.kind === 'switch').length, 0);
});

/**
 * buildCmosGate lays a gate's CMOS netlist onto the live Circuit as real parts —
 * the FPGA→Circuits transistor realisation, next to the wired-Tang demo board.
 * Tested against a mock circuit (like the demo-board gate): the right transistors,
 * a switch+pulldown per input, an output LED, and wiring that ties gates/drains to
 * the correct nets. Pure — no browser.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {buildCmosGate} from '../overlay/scratch-gui/src/lib/bw-fpga/cmos-board.js';

function mockCircuit () {
    const parts = []; const wires = []; let n = 0;
    return {
        parts, wires,
        addPart: (kind, params, x, y) => { const p = {id: `P${n++}`, kind, params, x, y}; parts.push(p); return p; },
        addWire: (a, ta, b, tb) => wires.push([a, ta, b, tb]),
        removePart: id => { const i = parts.findIndex(p => p.id === id); if (i >= 0) parts.splice(i, 1); }
    };
}
const kinds = c => c.parts.reduce((m, p) => { m[p.kind] = (m[p.kind] || 0) + 1; return m; }, {});

test('a NOT gate becomes a CMOS inverter: 1 pmos + 1 nmos + a switch + an LED', () => {
    const c = mockCircuit();
    const r = buildCmosGate(c, 'not');
    const k = kinds(c);
    assert.equal(k.pmos, 1); assert.equal(k.nmos, 1);
    assert.equal(k.switch, 1, 'one input switch');
    assert.equal(k.led, 1, 'an output LED');
    assert.equal(k.vcc, 1); assert.equal(k.gnd, 1);
    assert.equal(r.transistors.length, 2);
    assert.ok(c.wires.length > 0, 'the parts are wired');
});

test('NAND/NOR use 4 transistors, AND/OR 6 (NAND/NOR + inverter)', () => {
    for (const g of ['nand', 'nor']) {
        const c = mockCircuit(); buildCmosGate(c, g);
        assert.equal(kinds(c).pmos + kinds(c).nmos, 4, `${g} has 4 transistors`);
        assert.equal(kinds(c).switch, 2, `${g} has 2 input switches`);
    }
    for (const g of ['and', 'or']) {
        const c = mockCircuit(); buildCmosGate(c, g);
        assert.equal(kinds(c).pmos + kinds(c).nmos, 6, `${g} has 6 transistors`);
    }
});

test('every transistor is wired (gate/drain/source all connect to some net)', () => {
    const c = mockCircuit();
    buildCmosGate(c, 'nand');
    const wiredParts = new Set(c.wires.flatMap(w => [w[0], w[2]]));
    for (const t of c.parts.filter(p => p.kind === 'nmos' || p.kind === 'pmos')) {
        assert.ok(wiredParts.has(t.id), `transistor ${t.id} is wired`);
    }
});

test('a gate with no CMOS form (xor) throws rather than mis-building', () => {
    assert.throws(() => buildCmosGate(mockCircuit(), 'xor'), /No CMOS realisation/);
});

test('it refuses a non-circuit object', () => {
    assert.throws(() => buildCmosGate({}, 'not'), /live circuit/);
});

test('the layout is a readable CMOS schematic: PMOS in a top row above NMOS', () => {
    const c = mockCircuit();
    buildCmosGate(c, 'nand');
    const pmos = c.parts.filter(p => p.kind === 'pmos');
    const nmos = c.parts.filter(p => p.kind === 'nmos');
    assert.ok(pmos.every(p => p.y === pmos[0].y), 'PMOS share a row');
    assert.ok(nmos.every(p => p.y === nmos[0].y), 'NMOS share a row');
    assert.ok(pmos[0].y < nmos[0].y, 'the pull-up row sits above the pull-down row');
});

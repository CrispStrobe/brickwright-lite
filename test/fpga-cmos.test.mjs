/**
 * A logic gate → its CMOS transistor realisation, proved: the transistor netlist,
 * switch-level simulated (nmos conducts on gate=1, pmos on gate=0, output pulled
 * to whichever rail a conducting path reaches), computes the SAME Boolean function
 * as the gate — exhaustively. This is the honest FPGA→Circuits bridge: the Circuit
 * tab has nmos/pmos, so "build this gate in circuits" means build it from these,
 * and this test proves the topology is right. Pure — no SPICE, no browser.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {gateToCmos, switchLevelEval} from '../overlay/scratch-gui/src/lib/bw-fpga/cmos.js';

const FN = {
    not: a => (a ? 0 : 1),
    buffer: a => (a ? 1 : 0),
    nand: (a, b) => ((a & b) ? 0 : 1),
    nor: (a, b) => ((a | b) ? 0 : 1),
    and: (a, b) => (a & b),
    or: (a, b) => (a | b)
};

test('every CMOS gate computes its Boolean function for every input', () => {
    for (const [type, fn] of Object.entries(FN)) {
        const nl = gateToCmos(type);
        assert.ok(nl, `${type} has a CMOS form`);
        assert.ok(nl.transistors.every(t => t.kind === 'nmos' || t.kind === 'pmos'), `${type} uses only nmos/pmos`);
        for (let bits = 0; bits < (1 << nl.inputs.length); bits++) {
            const inp = {}; nl.inputs.forEach((nm, i) => { inp[nm] = (bits >> i) & 1; });
            const got = switchLevelEval(nl, inp);
            assert.equal(got, fn(...nl.inputs.map(nm => inp[nm])), `${type} at ${JSON.stringify(inp)}`);
        }
    }
});

test('the classic transistor counts (a CMOS inverter is 2, NAND/NOR are 4)', () => {
    assert.equal(gateToCmos('not').transistors.length, 2);
    assert.equal(gateToCmos('nand').transistors.length, 4);
    assert.equal(gateToCmos('nor').transistors.length, 4);
    assert.equal(gateToCmos('and').transistors.length, 6); // NAND + inverter
    // every gate is balanced: equal pull-up (pmos) and pull-down (nmos)
    for (const type of Object.keys(FN)) {
        const t = gateToCmos(type).transistors;
        assert.equal(t.filter(x => x.kind === 'pmos').length, t.filter(x => x.kind === 'nmos').length, `${type} is complementary`);
    }
});

test('a type with no discrete CMOS form here returns null (kept as logic)', () => {
    assert.equal(gateToCmos('xor'), null);
    assert.equal(gateToCmos('add'), null);
});

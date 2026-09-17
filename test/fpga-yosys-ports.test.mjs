/**
 * Reading a design's ports out of a Yosys netlist — the input side of the
 * bridge. Every claim has a case that trips it and one that must not.
 *
 * The fixtures are hand-written in Yosys's own JSON shape rather than produced
 * by running Yosys: the point is to parse what Yosys writes, and a fixture that
 * came out of the tool we do not yet run would prove nothing about the parser
 * and would need 261 MB of toolchain to regenerate.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readPorts, topModule, checkWidths, detectClockPort} from '../overlay/scratch-gui/src/lib/bw-fpga/yosys.js';
import {parseCst} from '../overlay/scratch-gui/src/lib/bw-fpga/cst.js';
import {bridge} from '../overlay/scratch-gui/src/lib/bw-fpga/port-bridge.js';

const require = createRequire(import.meta.url);
const PART = require('bw-circuit-ui/parts-data/tang_nano_20k.json');
const codes = list => list.map(x => x.code).sort();

const netlist = (ports, {name = 'top', marked = true, extra = null} = {}) => {
    const modules = {[name]: {attributes: marked ? {top: 1} : {}, ports}};
    if (extra) modules[extra] = {attributes: {}, ports: {}};
    return {modules};
};

test('the top module is the one Yosys marked', () => {
    const n = netlist({led: {direction: 'output', bits: [2]}}, {extra: 'helper'});
    assert.equal(topModule(n).name, 'top');
    assert.equal(readPorts(n).top, 'top');
});

test('a single unmarked module is still unambiguous', () => {
    const n = netlist({led: {direction: 'output', bits: [2]}}, {name: 'blinky', marked: false});
    assert.equal(readPorts(n).top, 'blinky');
});

test('several modules and no mark is a NAMED refusal, not a guess', () => {
    const n = netlist({led: {direction: 'output', bits: [2]}}, {marked: false, extra: 'helper'});
    const {top, problems} = readPorts(n);
    assert.equal(top, null, 'guessing which module the constraints are for is worse than refusing');
    assert.deepEqual(codes(problems), ['no-top-module']);
});

test('an empty netlist says synthesis produced nothing', () => {
    const {problems} = readPorts({modules: {}});
    assert.deepEqual(codes(problems), ['no-top-module']);
    assert.match(problems[0].reason, /produced nothing/);
});

test('directions and widths are read; a bus is ONE port with several bits', () => {
    const {ports} = readPorts(netlist({
        clk: {direction: 'input', bits: [2]},
        q: {direction: 'output', bits: [3, 4, 5, 6]}
    }));
    assert.equal(ports.clk.direction, 'input');
    assert.equal(ports.clk.width, 1);
    assert.equal(ports.q.width, 4, 'a 4-bit bus is one port of width 4, not four ports');
});

test('a direction Yosys would never write is refused by name', () => {
    const {ports, problems} = readPorts(netlist({weird: {direction: 'sideways', bits: [2]}}));
    assert.deepEqual(ports, {});
    assert.deepEqual(codes(problems), ['no-ports', 'unknown-direction']);
});

test('a module with no ports cannot reach a pin, and says so', () => {
    assert.deepEqual(codes(readPorts(netlist({})).problems), ['no-ports']);
});

test('design and constraints meet: a rename is caught from both sides', () => {
    const {ports} = readPorts(netlist({
        led: {direction: 'output', bits: [2]},
        btn: {direction: 'input', bits: [3]}
    }));
    // The .cst still places the OLD name, and never places btn.
    const {constraints} = parseCst('IO_LOC "led_old" 73;');
    const {bindings, refusals} = bridge({constraints, part: PART, netlistPorts: ports});
    assert.deepEqual(bindings, []);
    assert.deepEqual(codes(refusals), ['port-not-in-design', 'port-unplaced', 'port-unplaced']);
});

test('a bus placed one bit short is caught by counting, not by eye', () => {
    const {ports} = readPorts(netlist({q: {direction: 'output', bits: [3, 4, 5, 6]}}));
    const {constraints} = parseCst('IO_LOC "q[0]" 73;\nIO_LOC "q[1]" 74;\nIO_LOC "q[2]" 75;');
    const {bindings} = bridge({constraints, part: PART, netlistPorts: ports});
    assert.equal(bindings.length, 3);
    const problems = checkWidths(ports, bindings);
    assert.deepEqual(codes(problems), ['width-mismatch']);
    assert.match(problems[0].reason, /4 bit\(s\) wide .* 3 bit\(s\) are placed/);
});

test('a fully placed bus is silent', () => {
    const {ports} = readPorts(netlist({q: {direction: 'output', bits: [3, 4]}}));
    const {constraints} = parseCst('IO_LOC "q[0]" 73;\nIO_LOC "q[1]" 74;');
    const {bindings} = bridge({constraints, part: PART, netlistPorts: ports});
    assert.deepEqual(checkWidths(ports, bindings), []);
});

test('the clock port is the single-bit input named like one', () => {
    // Exact clk/clock, then clock-ish (sys_clk, clk_i). A multi-bit port is data,
    // never a clock, so width gates before the name.
    assert.equal(detectClockPort({
        clk: {direction: 'input', width: 1},
        rst_n: {direction: 'input', width: 1},
        led: {direction: 'output', width: 4}
    }), 'clk');
    assert.equal(detectClockPort({
        sys_clk: {direction: 'input', width: 1},
        d: {direction: 'input', width: 8}
    }), 'sys_clk');
    // An exact name wins over a merely clock-ish one.
    assert.equal(detectClockPort({
        clk_i: {direction: 'input', width: 1},
        clock: {direction: 'input', width: 1}
    }), 'clock');
});

test('a design with no clock has no clock port, and data is never mistaken for one', () => {
    assert.equal(detectClockPort({
        btn: {direction: 'input', width: 1},
        led: {direction: 'output', width: 1}
    }), null);
    // "clock" as an OUTPUT, or a multi-bit "clk_bus", is not the input clock.
    assert.equal(detectClockPort({
        clock: {direction: 'output', width: 1},
        clk_data: {direction: 'input', width: 4}
    }), null);
    assert.equal(detectClockPort({}), null);
    assert.equal(detectClockPort(null), null);
});

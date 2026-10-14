/**
 * The waveform lane-builder: a per-cycle trace becomes drawable square waves.
 * A multi-bit output expands into one lane per bit (MSB first), a boolean or bit
 * string reads correctly, and an undefined value stays 'x' — never coerced to a
 * confident low. Pure, so no digitaljs and no browser.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {traceToLanes, laneWavePoints} from '../overlay/scratch-gui/src/lib/bw-fpga/waveform.js';

// A 3-cycle trace of a 4-bit counter: 0,1,2 on `led`, plus a 1-bit `done`.
const TRACE = [
    {cycle: 0, values: {led: 0, done: false}},
    {cycle: 1, values: {led: 1, done: false}},
    {cycle: 2, values: {led: 2, done: true}}
];
const PORTS = {
    clk: {direction: 'input', width: 1},
    led: {direction: 'output', width: 4},
    done: {direction: 'output', width: 1}
};

test('only outputs become lanes; a bus expands to one lane per bit, MSB first', () => {
    const {lanes} = traceToLanes(TRACE, PORTS);
    const names = lanes.map(l => l.name);
    assert.deepEqual(names, ['led[3]', 'led[2]', 'led[1]', 'led[0]', 'done'],
        'four bits of led (MSB first) then the 1-bit done; clk (an input) is not a lane');
});

test('bit values are read LSB-correct across the cycles', () => {
    const {lanes} = traceToLanes(TRACE, PORTS);
    const byName = Object.fromEntries(lanes.map(l => [l.name, l.samples]));
    // led counts 0,1,2 -> LSB toggles 0,1,0; bit1 is 0,0,1; higher bits stay 0.
    assert.deepEqual(byName['led[0]'], [0, 1, 0]);
    assert.deepEqual(byName['led[1]'], [0, 0, 1]);
    assert.deepEqual(byName['led[3]'], [0, 0, 0]);
    assert.deepEqual(byName.done, [0, 0, 1], 'a boolean reads as its own bit');
});

test('a bit string value and an undefined value are handled honestly', () => {
    const {lanes} = traceToLanes(
        [{cycle: 0, values: {y: '10'}}, {cycle: 1, values: {}}],
        {y: {direction: 'output', width: 2}});
    const byName = Object.fromEntries(lanes.map(l => [l.name, l.samples]));
    assert.deepEqual(byName['y[0]'], [0, 'x'], 'LSB of "10" is 0; a missing value is x, not 0');
    assert.deepEqual(byName['y[1]'], [1, 'x'], 'MSB of "10" is 1');
});

test('laneWavePoints steps and holds, and reports x-spans separately', () => {
    const {points, unknown} = laneWavePoints([0, 1, 1, 'x', 0], {cycleW: 10, laneH: 20, pad: 2});
    // low at y=18, high at y=2; the line holds each level for one cycle width.
    assert.match(points, /^0,18 10,18/, 'cycle 0 low, held for one cycle width');
    assert.match(points, /10,2 20,2 20,2 30,2/, 'a rising edge then a held high across two cycles');
    assert.deepEqual(unknown, [[30, 40]], 'the x cycle is a reported span, not a drawn level');
    // after x, the line resumes without a false vertical edge from the x gap.
    assert.match(points, /40,18 50,18$/, 'cycle 4 low resumes');
});

test('an empty trace yields empty lanes, not a throw', () => {
    const {lanes, cycles} = traceToLanes([], PORTS);
    assert.equal(cycles.length, 0);
    assert.ok(lanes.every(l => l.samples.length === 0));
});

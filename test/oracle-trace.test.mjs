import {test} from 'node:test';
import assert from 'node:assert/strict';

import {compareTraces, normalizeTrace, parseUcsimTrace, parseVcd} from '../scripts/oracle-trace.mjs';

test('oracle traces normalize cycles, pin case, ordering, and repeated levels', () => {
    const trace = normalizeTrace([
        {cycle: 32, pin: 'd13', value: 1},
        {cycle: 16, pin: 'D13', value: 0},
        {cycle: 16, pin: 'D13', value: 0},
    ], {clockHz: 16_000_000});
    assert.deepEqual(trace, [
        {timeNs: 1000n, pin: 'D13', value: 0},
        {timeNs: 2000n, pin: 'D13', value: 1},
    ]);
});

test('oracle comparison reports the first observable mismatch', () => {
    const expected = normalizeTrace([{timeNs: 0, pin: 'D13', value: 0}]);
    const actual = normalizeTrace([{timeNs: 1, pin: 'D13', value: 1}]);
    const result = compareTraces(expected, actual);
    assert.equal(result.equal, false);
    assert.equal(result.index, 0);
    assert.deepEqual(result.expected, {timeNs: '0', pin: 'D13', value: 0});
});

test('VCD scalar changes become canonical pin edges', () => {
    const vcd = `$timescale 1 ns $end\n`
        + `$var wire 1 ! PORTB[5] $end\n$enddefinitions $end\n`
        + `#0\n0!\n#8\n1!\n#16\n1!\n#24\n0!\n`;
    assert.deepEqual(parseVcd(vcd, {signals: {'PORTB[5]': 'D13'}}), [
        {timeNs: 0n, pin: 'D13', value: 0},
        {timeNs: 8n, pin: 'D13', value: 1},
        {timeNs: 24n, pin: 'D13', value: 0},
    ]);
});

test('VCD compact timescales emitted by simavr are accepted', () => {
    const vcd = `$timescale 10ns $end\n$var wire 1 ! D13 $end\n$enddefinitions $end\n`
        + `$dumpvars\nx!\n$end\n#31\n1!\n#210137\n0!\n`;
    assert.deepEqual(parseVcd(vcd), [
        {timeNs: 310n, pin: 'D13', value: 1},
        {timeNs: 2_101_370n, pin: 'D13', value: 0},
    ]);
});

test('ucsim-stc PIN trace rows become canonical board edges', () => {
    const trace = parseUcsimTrace([
        '72518\tPIN\t1.5 PP L',
        '77039\tPIN\t1.5 PP H',
        'ignored\tPC\t0001',
        '77401\tPIN\t1.5 PP L',
    ].join('\n'));
    assert.deepEqual(trace, [
        {timeNs: 72518n, pin: 'P1.5', value: 0},
        {timeNs: 77039n, pin: 'P1.5', value: 1},
        {timeNs: 77401n, pin: 'P1.5', value: 0},
    ]);
});

import {test} from 'node:test';
import assert from 'node:assert/strict';

import {compareTraces, normalizeTrace, parseVcd} from '../scripts/oracle-trace.mjs';

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

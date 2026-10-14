// traceToCsv: the column policy is the contract — t_ms decimal, machine
// words hex bit patterns, user variables decimal, variable columns the
// union across rows so late-appearing variables get empty cells, not
// silence.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {traceToCsv} from '../overlay/scratch-gui/src/lib/bw-debug/trace-csv.js';

const row = (over = {}) => ({
    seq: 0, why: 'halt', pc: 0x012f, bytes: [0xc3], text: 'CLR   C',
    a: 0x97, b: 0, r: [1, 2, 3, 4, 5, 6, 7, 8], bank: 0,
    dptr: 0x1234, sp: 0x23, psw: 0x80, tNs: 1_500_000n,
    sfr: {P1: 0xfc, TMOD: 0x01},
    ...over
});

test('columns, hex policy, BigInt time', () => {
    const csv = traceToCsv([row()]);
    const [header, line] = csv.trim().split('\n');
    assert.match(header, /^seq,t_ms,why,pc,bytes,asm,a,b,dptr,sp,psw,bank,r0/);
    assert.ok(header.endsWith('P1,TMOD'), header);
    assert.ok(line.includes('1.500000'), 't_ms decimal ms');
    assert.ok(line.includes('0x012F'), 'pc hex, four digits');
    assert.ok(line.includes('0x97'), 'registers hex');
});

test('variable union: late variables get empty early cells', () => {
    const csv = traceToCsv([
        row({seq: 0, variables: {counter: 3}}),
        row({seq: 1, variables: {counter: 4, total: 12}}),
    ]);
    const [header, r0, r1] = csv.trim().split('\n');
    assert.ok(header.endsWith('var_counter,var_total'));
    assert.ok(r0.endsWith('3,'), `first row has no total: ${r0.slice(-12)}`);
    assert.ok(r1.endsWith('4,12'));
});

test('quoting: commas and quotes in assembly text survive', () => {
    const csv = traceToCsv([row({text: 'MOV   A,"x"'})]);
    assert.ok(csv.includes('"MOV   A,""x"""'), csv.split('\n')[1]);
});

test('disasm objects and missing fields degrade to empty cells', () => {
    const csv = traceToCsv([row({text: {text: 'NOP'}, a: undefined, sfr: {}})]);
    const line = csv.trim().split('\n')[1];
    assert.ok(line.includes('NOP'));
    assert.ok(line.includes(',,'), 'missing register is an empty cell');
});

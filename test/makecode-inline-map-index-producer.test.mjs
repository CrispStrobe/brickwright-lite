// Row 2f: in the procedure-constraint validator (no Array value graph), a
// fully inline `[literal].map(callback)[k]` with a constant k below the
// literal's length is the callback's result; every other shape stays opaque.
import test from 'node:test';
import assert from 'node:assert/strict';
import {parseMakeCodeTs} from '../overlay/scratch-gui/src/lib/bw-makecode/ts-import.js';
import {validateProcedureConstraintSource} from '../overlay/scratch-gui/src/lib/bw-makecode/source-value-producers.js';

const head='function twice(value: number) { return value * 2; }\nfunction sum(left: number, right: number) { return left + right; }\n';
const check=tail=>validateProcedureConstraintSource(parseMakeCodeTs(head+tail));

test('an inline map index below the literal length reads the callback result',()=>{
    assert.deepEqual(check('let r = sum(1, [2, 3].map(value => twice(value))[1]);'),[]);
});

test('other map index shapes stay unproved',()=>{
    for(const tail of [
        'let r = sum(1, [2, 3].map(value => twice(value))[2]);',
        'let m = [2, 3].map(value => twice(value)); let r = sum(1, m[0]);',
        'let xs = [2, 3]; let r = sum(1, xs.map(value => twice(value))[0]);',
        'let r = sum(1, [2, 3].map((value, index, all) => twice(value))[0]);',
        'let i = 0; let r = sum(1, [2, 3].map(value => twice(value))[i]);',
        'let r = sum(1, [2, 3].map(value => "text")[0]);',
    ])assert.match(check(tail).join('\n'),/sum\.right requires Number/,tail);
});

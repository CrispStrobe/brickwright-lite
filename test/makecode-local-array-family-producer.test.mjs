// Row 2f, import side of the exported loop: a function-local push-only Array
// family read in bounds (the exporter's lowered map loop, or a constant index)
// carries its pushed values into the procedure-constraint validator.
import test from 'node:test';
import assert from 'node:assert/strict';
import {parseMakeCodeTs} from '../overlay/scratch-gui/src/lib/bw-makecode/ts-import.js';
import {validateProcedureConstraintSource} from '../overlay/scratch-gui/src/lib/bw-makecode/source-value-producers.js';

const helpers=`function __bwCompareLess(left: any, right: any): boolean { return left < right }
function __bwBinaryAdd(left: any, right: any): any { return left + right }
function __bwUnaryAdd(value: any): number { return +value }
function eff(value: number): number { return value }
function comb(left: number, right: number): number { return left + right }
let result = 0
`;
const body=`function __bwStartup() {
    let a: number = 0
    let s: number[] = null
    let r: number[] = null
    let n: number = 0
    let o: number[] = null
    let i: number = 0
    let v: number = 0
    a = eff((0 + 1))
    s = []
    s.push((0 + 2))
    s.push((0 + 3))
    r = s
    n = r.length
    o = []
    i = (0 + 0)
    while (__bwCompareLess(i, n)) {
        v = r[i]
        o.push(eff(v))
        i = __bwBinaryAdd(__bwUnaryAdd(i), (0 + 1))
    }
    result = comb(a, o[1])
}
__bwStartup()`;
const check=text=>validateProcedureConstraintSource(parseMakeCodeTs(helpers+text));

test('the lowered map loop and a constant index of its result carry pushed Number values',()=>{
    assert.deepEqual(check(body),[]);
    assert.deepEqual(check(body.replace('result = comb(a, o[1])','result = comb(a, s[1])')),[]);
});

test('breaking push-only, loop or bounds evidence keeps the reads unproved',()=>{
    for(const [name,edit] of Object.entries({
        'a pop from the receiver': body.replace('r = s\n','r = s\n    s.pop()\n'),
        'an escaping alias': body.replace('r = s\n','r = s\n    foreign(r)\n'),
        'an index write': body.replace('r = s\n','r = s\n    r[0] = 1\n'),
        'a step of two': body.replace('(0 + 1))\n    }','(0 + 2))\n    }'),
        'a counter not starting at zero': body.replace('i = (0 + 0)','i = (0 + 1)'),
        'a result index past the receiver pushes': body.replace('o[1]','o[2]'),
        'a constant index past the straight pushes': body.replace('result = comb(a, o[1])','result = comb(a, s[2])'),
    })){assert.notEqual(edit,body,name);assert.ok(check(edit).length>0,name);}
});

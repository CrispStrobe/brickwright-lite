// Row 2f, VM side: the importer lowers `map` to a `repeat while I < LEN` loop
// over push-only local Arrays. The VM proves a Number-constrained argument
// read from that loop, and from a constant index of its result, and refuses
// any edit that breaks the push-only, canonical-loop or in-bounds evidence.
import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {runProgram,clearStrayTimers} from './helpers/bw-vm.mjs';

const source='function twice(value: number) { return value * 2; }\nfunction sum(left: number, right: number) { return left + right; }\nlet total = sum(twice(1), [2, 3].map(value => twice(value))[1]);';
const lowered=()=>{const imported=arcadeToPseudocode(source);assert.deepEqual(imported.unsupported,[]);return imported.code;};
const execute=async code=>{const run=await runProgram(code,{frames:20});
    try{return {errors:run.errors,total:run.vm.runtime.targets.flatMap(t=>Object.values(t.variables)).find(v=>v.name.replace(/^Game_/,'')==='total')?.value};}
    finally{run.vm.stopAll();run.vm.quit();clearStrayTimers();}};
const refused=errors=>errors.some(error=>/lacks complete primitive domain evidence/.test(String(error)));

test('a lowered map loop and a constant index of its result prove Number arguments',async()=>{
    const code=lowered();
    assert.match(code,/arcade repeat while compare value/);
    const result=await execute(code);assert.deepEqual(result.errors,[]);assert.equal(result.total,8);
});

test('edits that break the loop or push-only evidence are refused',async()=>{
    const code=lowered();
    const edits={
        'a step of two': c=>c.replace(/op "\+" with \(\(0 \+ \(1\)\)\)\)/,'op "+" with ((0 + (2))))'),
        'a pop from the receiver': c=>c.replace(/(\n(\s*)arcade set local (__bwMapValue\d+) to \(length of array reference \(arcade local (__bwMapValue\d+)\)\))/,'\n$2mutate array reference (arcade local $4) op "pop" index (0) value (0)$1'),
        'an index past the straight pushes': c=>c.replace(/item \(1\) of array reference/,'item (2) of array reference'),
    };
    for(const [name,edit] of Object.entries(edits)){
        const changed=edit(code);assert.notEqual(changed,code,name+' applies');
        assert.ok(refused((await execute(changed)).errors),name);
    }
});

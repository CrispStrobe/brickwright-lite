// Row 2i: two export-side Array proofs reused by the named-array second export.
// (1) A read in the FIRST statement of the then-branch of `if truthy(x)` on the
//     same cell, with no call in that statement, cannot see a null/undefined
//     reset of x. (2) A named write that runs once before the named Array is
//     re-created cannot touch the new allocation's slots.
// The positive original-PXT comparison is makecode-arcade-named-arrays.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createArrayReferenceExportAuthority} from '../overlay/scratch-gui/src/lib/bw-makecode/array-reference-export-authority.js';
import {runProgram,clearStrayTimers} from './helpers/bw-vm.mjs';

const verdicts=async(code,opcode)=>{
    const run=await runProgram(code,{frames:0,storage:true});
    try{
        const project=run.creator.project,authority=createArrayReferenceExportAuthority(project,{});
        const out=[];
        for(const target of project.targets)for(const block of Object.values(target.blocks||{}))if(block.opcode===opcode)out.push(authority.validateInput(target,block).ok);
        return out;
    }finally{run.vm.quit();clearStrayTimers();}
};
const guarded=body=>`DEVICE ARCADE
GLOBAL box
GLOBAL other
GLOBAL count
SPRITE Game:
WHEN arcade source starts:
  new array "a" = [1,2]
  set box to (reference to named array ("a"))
  set other to (reference to named array ("a"))
  set box to (null value)
${body}`;

test('a then-branch first-statement read under truthy(x) ignores the null reset of x',async()=>{
    assert.deepEqual(await verdicts(guarded(`  IF truthiness of value (box) THEN:
    set count to (length of array reference (box))
  ELSE:
    set count to 0`),'arrays_referenceLength'),[true]);
});

test('near misses keep the null reset: unguarded, after a write, other guard, else branch',async()=>{
    for(const [label,body]of [
        ['unguarded','  set count to (length of array reference (box))'],
        ['second statement after a null write','  IF truthiness of value (box) THEN:\n    set box to (null value)\n    set count to (length of array reference (box))'],
        ['guard on another variable','  IF truthiness of value (other) THEN:\n    set count to (length of array reference (box))'],
        ['else branch','  IF truthiness of value (box) THEN:\n    set count to 0\n  ELSE:\n    set count to (length of array reference (box))'],
        ['negated guard','  IF not (truthiness of value (box)) THEN:\n    set count to (length of array reference (box))']
    ])assert.deepEqual(await verdicts(guarded(body),'arrays_referenceLength'),[false],label);
});

const slots=(before,between)=>`DEVICE ARCADE
GLOBAL box
GLOBAL row
SPRITE Game:
WHEN arcade source starts:
  new array "a" = [1]
${before}
  new array "a" = [[2,3],4]
  set box to (reference to named array ("a"))
${between}
  set row to (item (0) of array reference (box))
  mutate array reference (row) op "push" index (0) value (5)`;

test('a named delete before the re-creation keeps the new slots; one after it does not',async()=>{
    assert.deepEqual(await verdicts(slots('  delete array "a"',''),'arrays_mutateReference'),[true]);
    assert.deepEqual(await verdicts(slots('','  set item (0) of array "a" to 7'),'arrays_mutateReference'),[false]);
});

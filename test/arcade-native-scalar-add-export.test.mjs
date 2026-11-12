import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import SB3Creator from '../overlay/scratch-gui/src/lib/sb3-creator.js';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {closedRemovalScalarAddition} from '../overlay/scratch-gui/src/lib/bw-makecode/scalar-export-flow.js';
const creator=code=>{const result=new SB3Creator();result.parse(code);assert.deepEqual(result.errors,[]);assert.deepEqual(result.warnings,[]);return result;};
const output=instance=>{const before=structuredClone(instance.project),result=projectToArcade(instance.project);assert.deepEqual(instance.project,before);return result;};

test('opaque source Arrays and scalar removal conversion export without a native flat-Array requirement',()=>{
    const source=readFileSync(new URL('./fixtures/makecode/pxt-array-coercion-source.ts',import.meta.url),'utf8');
    const imported=arcadeToPseudocode(source);assert.deepEqual(imported.unsupported,[]);
    const instance=creator(imported.code),blocks=instance.project.targets.flatMap(target=>Object.values(target.blocks||{}));
    assert.ok(blocks.some(block=>block.opcode==='arcade_sourceValueBinary'));
    assert.ok(blocks.some(block=>block.opcode==='arrays_referenceRemove'));
    const exported=output(instance);assert.deepEqual(exported.unsupported,[]);
    const returned=arcadeToPseudocode(exported.files);assert.deepEqual(returned.unsupported,[]);
});

test('a scalar reset does not remove native Array join proof for a later aliased Array operand',()=>{
    const instance=creator(`DEVICE ARCADE
GLOBAL alias
GLOBAL item
GLOBAL text
SPRITE Game:
WHEN flag clicked:
  set alias to (convert value (0) op "+")
  new array "named"
  push 5 to array "named"
  set alias to (reference to named array ("named"))
  set item to item 0 of array "named"
  set text to (calculate value (alias) op "+" with ("!"))`);
    const exported=output(instance);assert.deepEqual(exported.unsupported,[]);
    assert.match(exported.ts,/\.join\(","\)/,'actual Array operand still needs the genuine PXT join bridge');
    const returned=arcadeToPseudocode(exported.files);assert.deepEqual(returned.unsupported,[]);
});


test('scalar removal addition declines variable, local and captured inputs despite primitive initializers',()=>{
    // The safety query must reject these actual Creator reporter shapes even
    // before another pass establishes their lexical ownership. They are not
    // executed here and confer no runtime/capture authority.
    for(const operand of ['rhs','arcade local rhs','arcade captured rhs']){
        const instance=creator(`DEVICE ARCADE
GLOBAL alias
GLOBAL rhs
GLOBAL result
SPRITE Game:
WHEN flag clicked:
  set rhs to 0
  arcade set local rhs to 0
  new array "named"
  set alias to (reference to named array ("named"))
  arcade set captured rhs to (alias)
  set result to (calculate value (remove value (5) from array reference (alias)) op "+" with (${operand}))`);
        const target=instance.project.targets.find(row=>Object.values(row.blocks||{}).some(block=>block.opcode==='arrays_valueBinary'));
        assert.ok(Object.values(target.blocks).some(block=>block.opcode==='arcade_setCaptured'));
        const addition=Object.values(target.blocks).find(block=>block.opcode==='arrays_valueBinary');
        assert.equal(closedRemovalScalarAddition(target.blocks,addition),false,operand);
    }
});

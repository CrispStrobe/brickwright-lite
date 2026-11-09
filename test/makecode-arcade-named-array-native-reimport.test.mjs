// Reimport lowers the exporter's named-array operation helpers back to the
// native blocks, and a registry copy to the native named reference only where
// the registry provably holds its created Array. Recognition starts from a
// getter use, so each program reads one item.
import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {runProgram} from './helpers/bw-vm.mjs';

const code=`DEVICE ARCADE
SPRITE Game:
WHEN flag clicked:
  hide
  new array "items" = [1,2,3]
  set alias to reference to named array ("items")
  set first to item 0 of array "items"
  remove item 0 of array "items"
  set last to pop from array "items"
  set located to index of 2 in array "items"
  set count to length of array reference (alias)`;
const exported=async()=>{
    const run=await runProgram(code,{frames:20,storage:true});
    try{const out=projectToArcade(run.creator.project,{costumeSvg:(t,c)=>run.creator.assets.get(c.assetId)?.data});assert.deepEqual(out.unsupported,[]);return out.ts;}
    finally{run.vm.quit();}
};

test('named pop, indexOf and remove helpers and a live registry copy reimport as native blocks',async()=>{
    const ts=await exported();
    for(const helper of ['__bwNamedArrayRemove','__bwNamedArrayPop','__bwNamedArrayIndexOf'])assert.ok(ts.includes(helper),helper+' exported');
    const imported=arcadeToPseudocode(ts);assert.deepEqual(imported.unsupported,[]);
    assert.match(imported.code,/remove item \(.*\) of array "__bwNamedArray_items"/);
    assert.match(imported.code,/pop from array "__bwNamedArray_items"/);
    assert.match(imported.code,/index of \(.*\) in array "__bwNamedArray_items"/);
    assert.match(imported.code,/set Game_alias to reference to named array \("__bwNamedArray_items"\)/);
    for(const helper of ['__bwNamedArrayRemove','__bwNamedArrayPop','__bwNamedArrayIndexOf'])assert.ok(!imported.code.includes(helper),helper+' lowered');
    const run=await runProgram(imported.code,{frames:20,uploads:imported.costumes,storage:true});
    try{
        const vars=Object.fromEntries(run.vm.runtime.targets.flatMap(t=>Object.values(t.variables)).map(v=>[v.name.replace(/^Game_/,''),v.value]));
        assert.deepEqual(run.errors,[]);assert.equal(vars.first,1);assert.equal(vars.last,3);assert.equal(vars.located,0);assert.equal(vars.count,1);
    }finally{run.vm.quit();}
});

test('a registry copy after an intervening call stays the stored variable',async()=>{
    const ts=(await exported()).replace(/(\n\s*)(Game_alias = __bwNamedArray_items)/,'$1touch()$1$2')+'\nfunction touch() {}\n';
    assert.match(ts,/touch\(\)\s*\n\s*Game_alias = __bwNamedArray_items/);
    const imported=arcadeToPseudocode(ts);
    assert.ok(!/set Game_alias to reference to named array/.test(imported.code),'an unproved copy is not a native reference');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';
import {runProgram,clearStrayTimers} from './helpers/bw-vm.mjs';
const source=`function increment(x:number):number {x++;let y=1;y++;return x+y}
function sum():number {let total=0;for(let x=0;x<3;x++)for(let y=0;y<2;y++)total+=increment(x)+y;return total}
let result=sum()
let callback=0
control.runInParallel(function(){let x=0;x+=2;let y=4;y--;callback=x+y})
let done=1
done+=0`;

test('local x/y updates match declarations through nested loops, callback locals and renamed procedure parameters',async()=>{
    const expected=await runPxtArcade(source,{waitForGlobals:{callback:5}});assert.equal(expected.result,27);
    const imported=arcadeToPseudocode(source);assert.deepEqual(imported.unsupported,[]);
    const check=run=>{assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);const values=Object.fromEntries(run.vm.runtime.targets.flatMap(t=>Object.values(t.variables)).map(v=>[v.name.replace(/^Game_/,''),v.value]));for(const name of ['result','callback','done'])assert.equal(values[name],expected[name],name);};
    try{
        const run=await runProgram(imported.code,{frames:100});check(run);
        check(await runProgram(run.creator.decompile(),{frames:100}));
        const exported=projectToArcade(run.creator.project);assert.deepEqual(exported.unsupported,[]);
        const oracle=await runPxtArcade(exported.files,{waitForGlobals:{callback:5}});for(const name of ['result','callback','done'])assert.equal(oracle[name]??oracle['Game_'+name],expected[name],name+' exported');
    }finally{clearStrayTimers();}
});

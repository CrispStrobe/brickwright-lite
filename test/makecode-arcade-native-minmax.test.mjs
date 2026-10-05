import test from 'node:test';
import assert from 'node:assert/strict';
import {runProgram} from './helpers/bw-vm.mjs';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
const vars=run=>Object.fromEntries(run.vm.runtime.targets.flatMap(t=>Object.values(t.variables)).map(v=>[v.name.replace(/^Game_/,''),v.value]));
test('exported authored minimum and maximum preserve Scratch numeric conversion, including NaN',async()=>{
    const code=`DEVICE ARCADE
SPRITE Game:
WHEN flag clicked:
  hide
  set minimum to min of (convert value ("NaN") op "+") and 3
  set maximum to max of (convert value ("NaN") op "+") and 3
  set text to max of "not a number" and 7
  set blank to min of "" and 2
  set normal to min of -1.5 and 2`;
    const expected={minimum:0,maximum:3,text:7,blank:0,normal:-1.5};
    const check=run=>{for(const [name,value]of Object.entries(expected))assert.equal(vars(run)[name],value,name);assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);};
    const run=await runProgram(code,{frames:30,storage:true});check(run);
    const output=projectToArcade(run.creator.project,{costumeSvg:(t,c)=>run.creator.assets.get(c.assetId)?.data});assert.deepEqual(output.unsupported,[]);
    const original=await runPxtArcade(output.ts);for(const [name,value]of Object.entries(expected))assert.equal(original['Game_'+name],value,name);
    const imported=arcadeToPseudocode(output.ts);assert.deepEqual(imported.unsupported,[]);check(await runProgram(imported.code,{frames:60,uploads:imported.costumes,storage:true}));
});

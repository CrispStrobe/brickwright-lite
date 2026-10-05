import test from 'node:test';
import assert from 'node:assert/strict';
import {runProgram} from './helpers/bw-vm.mjs';
// Task E1 keeps the import half of these round trips; the export half (projectToArcade, then compiling or running the exported TypeScript in PXT, then re-importing it) returns with task E2 (docs/OPEN-TASKS-2026-09-29.md).
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
  set normal to min of (-1.5) and 2`;
    // `min of -1.5 and 2` unparenthesised is misread by the pinned dialect
    // (a variable named "min of" minus the text "1.5 and 2", no warning);
    // the importer writes negative operands parenthesised.
    const expected={minimum:0,maximum:3,text:7,blank:0,normal:-1.5};
    const check=run=>{for(const [name,value]of Object.entries(expected))assert.equal(vars(run)[name],value,name);assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);};
    const run=await runProgram(code,{frames:30,storage:true});check(run);
});

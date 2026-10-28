import test from 'node:test';
import assert from 'node:assert/strict';
import {BUFFER_CONTROLLER_CODE} from './fixtures/arcade-buffer-controller.mjs';
import {runProgram,stepFrames,clearStrayTimers} from './helpers/bw-vm.mjs';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';
const values=run=>Object.fromEntries(run.vm.runtime.targets.flatMap(t=>Object.values(t.variables)).map(v=>[v.name.replace(/^Game_/,''),v.value]));

test('authored Buffer fixture responds to controller inputs and preserves exported original behaviour',async()=>{
  try {
    const run=await runProgram(BUFFER_CONTROLLER_CODE,{frames:20,storage:true});
    assert.deepEqual(run.creator.warnings,[]);assert.deepEqual(run.errors,[]);
    assert.equal(values(run).currentNumber,513);assert.equal(values(run).hex,'01020304');
    const press=async key=>{run.vm.postIOData('keyboard',{key,isDown:true});await stepFrames(run.vm,8);run.vm.postIOData('keyboard',{key,isDown:false});await stepFrames(run.vm,8);};
    await press(' ');assert.equal(values(run).currentNumber,4660);assert.equal(values(run).hex,'34120304');
    await press('b');assert.equal(Number(values(run).phase),1);assert.equal(values(run).hex,'34120304');
    await press('z');assert.equal(values(run).copyHex,'63120304');assert.equal(values(run).hex,'34120304');
    await press('ArrowDown');assert.equal(values(run).hex,'34120309');
    const recreated=await runProgram(run.creator.decompile(),{frames:20,storage:true});assert.equal(values(recreated).hex,'01020304');assert.deepEqual(recreated.errors,[]);
    const exported=projectToArcade(JSON.parse(run.vm.toJSON()));assert.deepEqual(exported.unsupported,[]);
    assert.match(exported.ts,/let bytes: Buffer = null/);assert.match(exported.ts,/let copy: Buffer = null/);
    assert.ok(!exported.ts.includes('[buffer reference'),'saved heap placeholders never become exported buffer initializers');
    const original=await runPxtArcade(exported.files,{buttonActions:{afterGlobals:{hex_:'01020304'},steps:[{button:5,held:true,delay:80},{button:5,held:false,delay:80},{button:6,held:true,delay:80},{button:6,held:false,delay:80},{button:4,held:true,delay:80},{button:4,held:false,delay:80}]},waitForGlobals:{hex_:'34120309'}});
    assert.equal(original.currentNumber,4660);assert.equal(original.copyHex,'63120304');assert.equal(original.hex_,'34120309');
  }finally{clearStrayTimers();}
});

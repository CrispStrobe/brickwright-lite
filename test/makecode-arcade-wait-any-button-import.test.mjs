import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {runProgram,stepFrames,clearStrayTimers} from './helpers/bw-vm.mjs';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';
const source='let before=1;controller.pauseUntilAnyButtonIsPressed();let after=2';
const values=run=>Object.fromEntries(run.vm.runtime.targets.flatMap(t=>Object.values(t.variables)).map(v=>[v.name.replace(/^Game_/,''),v.value]));
test('controller wait imports suspend until a genuine button press and roundtrip',async()=>{
    const original=await runPxtArcade(source,{buttonActions:{afterGlobals:{before:1},steps:[{button:5,held:true,delay:80},{button:5,held:false,delay:80}]}});
    assert.equal(original.after,2);
    const imported=arcadeToPseudocode(source);assert.deepEqual(imported.unsupported,[]);assert.match(imported.code,/arcade wait until any button pressed/);
    const cycle=async imported=>{
        const run=await runProgram(imported.code,{frames:5,storage:true});assert.equal(values(run).before,1);assert.notEqual(values(run).after,2);
        await stepFrames(run.vm,5);assert.notEqual(values(run).after,2,'elapsed frames do not substitute for a button');
        run.vm.postIOData('keyboard',{key:'z',isDown:true});await stepFrames(run.vm,5);run.vm.postIOData('keyboard',{key:'z',isDown:false});
        assert.equal(values(run).after,original.after);assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);return run;
    };
    try {
        const run=await cycle(imported);await cycle({...imported,code:run.creator.decompile()});
        const exported=projectToArcade(run.creator.project);assert.deepEqual(exported.unsupported,[]);assert.match(exported.ts,/controller.pauseUntilAnyButtonIsPressed\(\)/);
        const again=arcadeToPseudocode(exported.ts);assert.deepEqual(again.unsupported,[]);await cycle(again);
        const pxt=await runPxtArcade(exported.files,{buttonActions:{afterGlobals:{before:1},steps:[{button:5,held:true,delay:80},{button:5,held:false,delay:80}]}});assert.equal(pxt.after??pxt.Game_after,2);
    }finally{clearStrayTimers();}
});
test('controller wait with arguments keeps a diagnostic',()=>{assert.match(arcadeToPseudocode('controller.pauseUntilAnyButtonIsPressed(1)').unsupported.join('\n'),/requires no arguments/);});

import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade,projectJsonToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';
import {runProgram,stepFrames,clearStrayTimers} from './helpers/bw-vm.mjs';
import {conditionalArraySource,conditionalArrayExpected as expected} from './fixtures/arcade-conditional-array-entry.mjs';
// HOSTED ONLY: original pinned SDK/simulator and actual Lite VM. No renderer;
// visible Blocks/Code/graphics/controller acceptance remains separate.
const check=run=>{
    const variables=run.vm.runtime.targets.filter(t=>t.isOriginal).flatMap(t=>Object.values(t.variables));
    for(const[name,value]of Object.entries(expected)){
        const actual=variables.filter(v=>v.name.replace(/^(?:Game_)+/,'')===name);
        assert.equal(actual.length,1,name+' has one actual binding');assert.equal(actual[0].value,value,name);
    }
    assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);
};
const original=async source=>{
    const observed=await runPxtArcade(source,{waitForGlobals:expected});
    for(const[name,value]of Object.entries(expected))assert.equal(observed[name],value,name+' in original SDK');
};
test('conditional Array startup publication retains paint results through SDK, native generations and SB3 reopen',async()=>{
    let source=conditionalArraySource();await original(source);
    // Initial result/count are -99; only the real paint callback sets 1 and 2.
    // Equal direct/JSON files denote one program, qualified once per generation.
    for(let generation=0;generation<3;generation++){
        const imported=arcadeToPseudocode(source);assert.deepEqual(imported.unsupported,[]);
        const run=await runProgram(imported.code,{frames:40,storage:true});
        try{
            check(run);
            if(generation<2){
                const direct=projectToArcade(run.creator.project),json=projectJsonToArcade(JSON.stringify(run.creator.project));
                assert.deepEqual(direct.unsupported,[]);assert.deepEqual(json.unsupported,[]);assert.deepEqual(direct.files,json.files);
                assert.match(json.ts,/\.indexOf\(/);assert.match(json.ts,/game\.onPaint\(/);
                await original(json.files);source=json.files;
            }else{
                const archive=Buffer.from(await(await run.vm.saveProjectSb3()).arrayBuffer());
                await run.vm.loadProject(archive);run.vm.greenFlag();await stepFrames(run.vm,40);check(run);
                const fresh=await runProgram('SPRITE Placeholder:\nWHEN flag clicked:\n  hide',{frames:0,storage:true});
                try{fresh.vm.stopAll();await fresh.vm.loadProject(archive);fresh.vm.greenFlag();await stepFrames(fresh.vm,40);check(fresh);}
                finally{fresh.vm.stopAll();fresh.vm.quit();clearStrayTimers();}
            }
        }finally{run.vm.stopAll();run.vm.quit();clearStrayTimers();}
    }
});

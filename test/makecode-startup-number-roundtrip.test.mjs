import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade,projectJsonToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';
import {runProgram,stepFrames,clearStrayTimers} from './helpers/bw-vm.mjs';
import {startupNumberSource,startupNumberExpected as initialExpected} from './fixtures/arcade-startup-number-game.mjs';

// HOSTED ONLY: complete pinned original Arcade SDK/simulator and actual Lite VM.
// Source checks in project-readonly-number-operands.test.mjs are separate.
const expected={...initialExpected,painted:1};
const check=(run,route)=>{
    assert.deepEqual(run.errors,[],route+' runtime diagnostics');
    assert.deepEqual(run.creator.warnings,[],route+' Creator diagnostics');
    const variables=run.vm.runtime.targets.filter(t=>t.isOriginal).flatMap(t=>Object.values(t.variables));
    for(const[name,value]of Object.entries(expected)){
        const actual=variables.filter(v=>v.name.replace(/^(?:Game_)+/,'')===name);
        assert.equal(actual.length,1,route+': '+name+' has one actual binding');
        assert.equal(actual[0].value,value,route+': '+name);
    }
};
const original=async source=>{const observed=await runPxtArcade(source,{waitForGlobals:{result:14,painted:1}});for(const[name,value]of Object.entries(expected))assert.equal(observed[name],value,name+' in original SDK');};

test('readonly startup Math operands retain actual values through both routes, original Arcade and SB3 reopen',async()=>{
    let source=startupNumberSource(true).replace('let result=0;','let painted=0;let result=0;').replace('function(){sample();}','function(){sample();painted=1;}');
    assert.match(source,/painted=1;/);await original(source);
    // The two public export routes must produce identical complete files.
    // Qualify that one actual SDK program once per generation, without replaying
    // duplicate source merely because it came from the other equal route.
    for(let generation=0;generation<3;generation++){
        const imported=arcadeToPseudocode(source);assert.deepEqual(imported.unsupported,[]);
        const run=await runProgram(imported.code,{frames:40,storage:true});
        try{
            check(run,'generation '+generation);
            if(generation<2){
                const direct=projectToArcade(run.creator.project),json=projectJsonToArcade(JSON.stringify(run.creator.project));
                assert.deepEqual(direct.unsupported,[]);assert.deepEqual(json.unsupported,[]);assert.deepEqual(direct.files,json.files);
                assert.match(json.ts,/Math\.min\(/);assert.match(json.ts,/game\.onPaint\(/);
                await original(json.files);source=json.files;
            }else{
                const archive=Buffer.from(await(await run.vm.saveProjectSb3()).arrayBuffer());
                await run.vm.loadProject(archive);run.vm.greenFlag();await stepFrames(run.vm,40);check(run,'same VM reopen');
                const fresh=await runProgram('SPRITE Placeholder:\nWHEN flag clicked:\n  hide',{frames:0,storage:true});
                try{fresh.vm.stopAll();await fresh.vm.loadProject(archive);fresh.vm.greenFlag();await stepFrames(fresh.vm,40);check(fresh,'fresh VM reopen');}
                finally{fresh.vm.stopAll();fresh.vm.quit();clearStrayTimers();}
            }
        }finally{run.vm.stopAll();run.vm.quit();clearStrayTimers();}
    }
});

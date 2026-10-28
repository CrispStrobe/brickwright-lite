import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {runProgram,clearStrayTimers} from './helpers/bw-vm.mjs';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';

test('source clocks remain separate and shadowed or argument-bearing clocks are diagnosed',()=>{
    const imported=arcadeToPseudocode('let sceneClock=game.runtime();let programClock=control.millis();programClock+=0;sceneClock+=0;');
    assert.deepEqual(imported.unsupported,[]);assert.match(imported.code,/arcade scene runtime milliseconds/);assert.match(imported.code,/arcade program runtime milliseconds/);assert.ok(!imported.code.includes('timer * 1000'));
    for(const source of ['game.runtime(1)','control.millis(1)','let control=3;control.millis()','let game=3;game.runtime()'])assert.ok(arcadeToPseudocode(source).unsupported.length,source);
});

test('export keeps scene/program clocks and resets Scratch timer without rebasing either clock',async()=>{
    const code=`DEVICE ARCADE
SPRITE Game:
WHEN flag clicked:
  set firstProgram to arcade program runtime milliseconds
  set firstScene to arcade scene runtime milliseconds
  wait 0.04 seconds
  set program40 to arcade program runtime milliseconds
  set scene40 to arcade scene runtime milliseconds
  arcade push scene
  set pushedScene to arcade scene runtime milliseconds
  reset timer
  wait 0.04 seconds
  set timer40 to timer * 1000
  set program80 to arcade program runtime milliseconds
  arcade pop scene
  set restoredScene to arcade scene runtime milliseconds
  set done to 1
`;
    let run;
    try {
        run=await runProgram(code,{frames:0});assert.deepEqual(run.creator.warnings,[]);
        const exported=projectToArcade(run.creator.project);assert.deepEqual(exported.unsupported,[]);assert.match(exported.ts,/game.runtime\(\)/);assert.match(exported.ts,/control.millis\(\)/);assert.match(exported.ts,/__bwResetScratchTimer\(\)/);
        const original=await runPxtArcade(exported.files,{fakeClock:true});
        for(const [name,value] of Object.entries({firstProgram:0,firstScene:0,program40:40,scene40:20,pushedScene:0,timer40:40,program80:80,restoredScene:20,done:1}))assert.equal(original[name]??original['Game_'+name],value,name);
        const restored=arcadeToPseudocode(exported.files);assert.deepEqual(restored.unsupported,[]);assert.match(restored.code,/arcade program runtime milliseconds/);assert.match(restored.code,/arcade scene runtime milliseconds/);
    } finally {run?.vm.quit?.();clearStrayTimers();}
});

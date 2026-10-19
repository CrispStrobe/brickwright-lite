import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';
import {runProgram,stepFrames,clearStrayTimers} from './helpers/bw-vm.mjs';
const bindClock=(run,now)=>{
    const runtime=run.vm.runtime;runtime.updateCurrentMSecs=()=>{runtime.currentMSecs=now();};runtime.currentMSecs=now();runtime.ioDevices.clock.resetProjectTimer();
    // The existing BlockUtility stack timers read runtime.currentMSecs too.
    // Keep the sequencer work budget on its real host clock.
};
const values=run=>Object.fromEntries(run.vm.runtime.targets.flatMap(t=>Object.values(t.variables)).map(v=>[v.name.replace(/^Game_/,''),v.value]));

test('managed function while loops finish at the original initial tick before flag and queued music',async()=>{
    const source='function work():number {let n=0;while(n<3){n++}return control.millis()}let measured=work();let immediate=1;immediate+=0;music.play(music.tonePlayable(440,20),music.PlaybackMode.InBackground);let launched=control.millis();let done=1;done+=0';
    const original=await runPxtArcade(source,{fakeClock:true,recordSound:true});assert.equal(original.measured,0);assert.equal(original.launched,0);assert.equal(original.immediate,1);assert.equal(original.$sound.length,1);assert.equal(original.$sound[0].time,0);
    const imported=arcadeToPseudocode(source);assert.deepEqual(imported.unsupported,[]);
    let run;
    try{
        run=await runProgram(imported.code,{frames:0});bindClock(run,()=>0);await stepFrames(run.vm,1);assert.deepEqual(run.errors,[]);
        assert.equal(values(run).measured,0);assert.equal(values(run).immediate,1);assert.equal(values(run).launched,0);assert.equal(values(run).done,1);
        const log=run.vm.runtime.bwArcadeMusicLog;assert.equal(log.length,1);assert.deepEqual(log[0].bytes,original.$sound[0].bytes);assert.ok(log[0].time<=1000/30+1,'native audio remains in its first qualified physics frame');
    }finally{run?.vm.quit?.();clearStrayTimers();}
    const exported=projectToArcade(run.creator.project);assert.deepEqual(exported.unsupported,[]);assert.ok(!exported.ts.includes('pause(20)'));
    const oracle=await runPxtArcade(exported.files,{fakeClock:true,recordSound:true});assert.equal(oracle.measured??oracle.Game_measured,0);assert.equal(oracle.launched??oracle.Game_launched,0);assert.equal(oracle.immediate??oracle.Game_immediate,1);assert.deepEqual(oracle.$sound,original.$sound);
});

test('explicit function waits survive export while stop and restart cancel pending calls',async()=>{
    const source='function delayed():number{let n=0;while(n<3){n++}pause(40);return 7}let result=delayed();result+=0;let done=1;done+=0';
    const observe='\nlet oracleElapsed=control.millis();oracleElapsed+=0';
    const original=await runPxtArcade(source+observe,{fakeClock:true});assert.equal(original.result,7);assert.equal(original.oracleElapsed,40);
    const imported=arcadeToPseudocode(source);assert.deepEqual(imported.unsupported,[]);
    let run,now=0;
    try{
        run=await runProgram(imported.code,{frames:0});bindClock(run,()=>now);await stepFrames(run.vm,2);assert.equal(values(run).done,0);
        run.vm.stopAll();assert.equal(run.vm.runtime.threads.length,0);now=40;await stepFrames(run.vm,2);assert.equal(values(run).done,0);
        run.vm.greenFlag();await stepFrames(run.vm,2);assert.equal(values(run).done,0);now=80;await stepFrames(run.vm,2);assert.equal(values(run).done,1);assert.equal(values(run).result,7);assert.equal(run.vm.runtime.ioDevices.clock.projectTimer()*1000,40);assert.deepEqual(run.errors,[]);
    }finally{run?.vm.quit?.();clearStrayTimers();}
    const exported=projectToArcade(run.creator.project);assert.deepEqual(exported.unsupported,[]);assert.match(exported.ts,/pause\(0\.04 \* 1000\)/);assert.ok(!exported.ts.includes('pause(20)'));
    // Observe the real SDK project clock separately: scene game.runtime()
    // and control.millis() have a distinct known exporter clock boundary.
    const oracle=await runPxtArcade({...exported.files,'main.ts':exported.files['main.ts']+observe},{fakeClock:true});assert.equal(oracle.result??oracle.Game_result,7);assert.equal(oracle.oracleElapsed,40);
});

test('ordinary Scratch hat and command-procedure loops retain scheduling pauses and stop guards',async()=>{
    let run;
    try{
        run=await runProgram('DEVICE ARCADE\nSPRITE Game:\nWHEN flag clicked:\n  set count to 0\n  REPEAT UNTIL count > 1:\n    change count by 1\n  stop all\nDEFINE regular:\n  REPEAT UNTIL count > 2:\n    change count by 1\n',{frames:4});
        const exported=projectToArcade(run.creator.project);assert.deepEqual(exported.unsupported,[]);
        assert.ok((exported.ts.match(/pause\(20\)/g)||[]).length>=2);assert.match(exported.ts,/_dead\(_t\)/);assert.match(exported.ts,/_stopAll\(\)/);
    }finally{run?.vm.quit?.();clearStrayTimers();}
});

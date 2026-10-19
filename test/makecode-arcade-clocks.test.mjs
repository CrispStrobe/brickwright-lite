import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {loadExtensionClass} from './helpers/bw-extensions.mjs';
import {runProgram,clearStrayTimers} from './helpers/bw-vm.mjs';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';
const values=run=>Object.fromEntries(run.vm.runtime.targets.flatMap(t=>Object.values(t.variables)).map(v=>[v.name.replace(/^Game_/,''),v.value]));
const source='let frames="";function tick(){frames+=control.millis()+":"+game.runtime()+","}game.onUpdate(tick);game.addScenePushHandler(function(){game.onUpdate(tick)});let s0=game.runtime();let g0=control.millis();pause(40);let s1=game.runtime();let g1=control.millis();game.pushScene();let s2=game.runtime();let g2=control.millis();pause(40);let s3=game.runtime();let g3=control.millis();game.popScene();let s4=game.runtime();let g4=control.millis();pause(40);let s5=game.runtime();let g5=control.millis();let atDone=frames;let done=1;done+=0';
const code=`DEVICE ARCADE
SPRITE Game:
WHEN flag clicked:
  set frames to ""
  set s0 to (arcade scene runtime milliseconds)
  set g0 to (arcade program runtime milliseconds)
  wait 0.04 seconds
  set s1 to (arcade scene runtime milliseconds)
  set g1 to (arcade program runtime milliseconds)
  arcade push scene
  set s2 to (arcade scene runtime milliseconds)
  set g2 to (arcade program runtime milliseconds)
  wait 0.04 seconds
  set s3 to (arcade scene runtime milliseconds)
  set g3 to (arcade program runtime milliseconds)
  arcade pop scene
  set s4 to (arcade scene runtime milliseconds)
  set g4 to (arcade program runtime milliseconds)
  wait 0.04 seconds
  set s5 to (arcade scene runtime milliseconds)
  set g5 to (arcade program runtime milliseconds)
  set atDone to frames
  set done to 1
WHEN arcade updates:
  set frames to (frames join ((arcade program runtime milliseconds) join (":" join ((arcade scene runtime milliseconds) join ","))))`;

async function replay(code){
    const run=await runProgram(code,{frames:0});let now=1000;
    run.vm.stopAll();run.vm.runtime.bwArcadeProgramClock={now:()=>now};run.vm.runtime.updateCurrentMSecs=()=>{run.vm.runtime.currentMSecs=now;};run.vm.runtime.currentMSecs=now;run.vm.greenFlag();
    // Replay the original witnessed order: main resumes at a wait boundary
    // before that timestamp's frame. Scene activation starts a zero-delta frame.
    for(const [elapsed,delta]of [[0,0],[20,20],[40,0],[60,20],[80,0],[100,20],[120,0]]){
        now=1000+elapsed;run.vm.runtime._step(delta);await new Promise(resolve=>setImmediate(resolve));
    }
    return run;
}

test('distinct scene and program clocks match original witnessed waits and scene restoration through Code',async()=>{
    const expected=await runPxtArcade(source,{fakeClock:true});
    assert.deepEqual([expected.s1,expected.g1,expected.s2,expected.g2,expected.s4,expected.g4,expected.s5,expected.g5],[20,40,0,40,20,80,40,120]);
    assert.equal(expected.atDone,'0:0,20:20,40:0,60:20,80:20,100:40,');
    let run,again;
    try{
        run=await replay(code);assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);
        for(const name of ['s0','g0','s1','g1','s2','g2','s3','g3','s4','g4','s5','g5','atDone'])assert.equal(values(run)[name],expected[name],name);
        again=await replay(run.creator.decompile());for(const name of ['s1','g1','s4','g4','s5','g5','atDone'])assert.equal(values(again)[name],expected[name],name+' Code');
    }finally{run?.vm.quit?.();again?.vm.quit?.();clearStrayTimers();}
});

test('program clock remains independent of Scratch timer resets and latches at stop with a fresh restart epoch',async()=>{
    const code='DEVICE ARCADE\nSPRITE Game:\nWHEN flag clicked:\n  set initial to (arcade program runtime milliseconds)\n  wait 0.04 seconds\n  reset timer\n  set resetProgram to (arcade program runtime milliseconds)\n  set resetScratch to timer\n  wait 0.02 seconds\n  set laterProgram to (arcade program runtime milliseconds)\n  set laterScratch to timer';
    let run;try{
        run=await runProgram(code,{frames:0});let now=1000;run.vm.stopAll();run.vm.runtime.bwArcadeProgramClock={now:()=>now};run.vm.runtime.updateCurrentMSecs=()=>{run.vm.runtime.currentMSecs=now;};run.vm.runtime.currentMSecs=now;run.vm.greenFlag();
        for(const t of [1000,1040,1060]){now=t;run.vm.runtime._step(0);await new Promise(resolve=>setImmediate(resolve));}
        assert.deepEqual(run.errors,[]);assert.equal(values(run).resetProgram,40);assert.equal(values(run).resetScratch,0);assert.equal(values(run).laterProgram,60);assert.equal(values(run).laterScratch,0.02);
        const primitive=run.vm.runtime._primitives.arcade_programMillis;run.vm.stopAll();now=1200;assert.equal(primitive({},{}),60);run.vm.runtime.currentMSecs=now;run.vm.greenFlag();run.vm.runtime._step(0);assert.equal(values(run).initial,0);assert.equal(primitive({},{}),0);
    }finally{run?.vm.quit?.();clearStrayTimers();}
});

test('production clock advances without scene frames and malformed or reentrant injected clocks report errors',async()=>{
    const runtime=new EventEmitter(),errors=[];runtime.on('BLOCKS_ERROR',message=>errors.push(String(message)));const native=new(loadExtensionClass('arcade'))(runtime);
    const first=native.programMillis();await new Promise(resolve=>setTimeout(resolve,25));assert.ok(native.programMillis()>=first+15);assert.equal(native.sceneMillis(),0);
    let now=1000;runtime.bwArcadeProgramClock={now:()=>now};runtime.emit('PROJECT_START');now=1040;assert.equal(native.programMillis(),40);now=1030;assert.equal(native.programMillis().bwUndefined,true);assert.match(errors.at(-1),/moved backwards/);
    now=1100;let restart=false;runtime.bwArcadeProgramClock={now:()=>{if(restart){restart=false;runtime.emit('PROJECT_START');}return now;}};runtime.emit('PROJECT_START');restart=true;now=1140;assert.equal(native.programMillis().bwUndefined,true);assert.match(errors.at(-1),/run changed/);assert.equal(native.programMillis(),0);
    now=NaN;assert.equal(native.programMillis().bwUndefined,true);assert.match(errors.at(-1),/invalid/);
});

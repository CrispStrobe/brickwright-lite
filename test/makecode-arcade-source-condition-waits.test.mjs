// Native-only minimal source fixtures. No original SDK dependency or execution.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {runProgram,stepFrames,clearStrayTimers} from './helpers/bw-vm.mjs';
import {REPO,guiDependencyFile} from './helpers/bw-integrated.mjs';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {createArcadeDiscreteTimers} from './helpers/arcade-discrete-timers.mjs';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
const source=`let done=false
let updates=0
let after=0
game.onUpdate(function(){updates+=1;done=true})
pauseUntil(function(){return done})
after+=1`;
const values=run=>Object.fromEntries(run.vm.runtime.targets.filter(t=>t.isOriginal).flatMap(t=>Object.values(t.variables)).map(v=>[v.name.replace(/^Game_/,''),v.value]));
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const close=run=>{run?.vm.stopAll();run?.vm.quit();clearStrayTimers();};
async function start(text,{code,archive}={}) {
 const imported=arcadeToPseudocode(text);assert.deepEqual(imported.unsupported,[]);assert.deepEqual(imported.warnings,[]);
 for(const file of ['util/bw-source-condition-waits.js','util/bw-primitive-owner.js','util/bw-arcade-exceptions.js','extensions/crispstrobe/arcade/frame-phase.js','extensions/crispstrobe/arcade/poll-events.js'])
  assert.equal(readFileSync(guiDependencyFile('scratch-vm/src/'+file),'utf8'),readFileSync(path.join(REPO,'overlay/scratch-vm/src',file),'utf8'),file);
 const run=await runProgram(code||imported.code,{frames:0,frameAuthority:'timed',retainExtensionTimers:true});
 if(archive){run.vm.stopAll();await run.vm.loadProject(archive);run.vm.greenFlag();}
 return run;
}
async function bootstrap(run) {
 // Production real timer authority is independent of this first awaited step.
 // No fake timer callback or authored-state injection makes the predicate true.
 await stepFrames(run.vm,1,0);
}
async function until(check,ms=750) {const end=performance.now()+ms;while(!check()){if(performance.now()>end)assert.fail('native source fixture deadline');await sleep(5);}}

test('actual source wait yields to real scene update and resumes once after poll delivery',{timeout:2500},async()=>{
 let run;try{run=await start(source);await bootstrap(run);await until(()=>Number(values(run).after)===1);assert.ok(Number(values(run).updates)>0);
 const driver=run.vm.runtime._arcadeFramePhase;await driver.requestContinuation();await sleep(60);assert.equal(Number(values(run).after),1);assert.deepEqual(run.errors,[]);
 }finally{close(run);}
});
test('optimistic true reads actual query once and never enrolls its wait',{timeout:2500},async()=>{
 let run;try{run=await start('let after=0;pauseUntil(function(){return game.runtime()>=0});after+=1');await bootstrap(run);
 assert.equal(Number(values(run).after),1);assert.equal(run.calls.get('arcade_sceneMillis'),1);assert.equal(run.vm.runtime._arcadeFramePhase.ext._pollEvents?.size||0,0);assert.deepEqual(run.errors,[]);
 }finally{close(run);}
});
test('two actual source callers share queue without overlapping samples',{timeout:2500},async()=>{
 let run;try{run=await start(`let done=false;let first=0;let second=0;game.onUpdate(function(){done=true});control.runInParallel(function(){pauseUntil(function(){return done});first+=1});pauseUntil(function(){return done});second+=1`);
 await bootstrap(run);await until(()=>Number(values(run).first)===1&&Number(values(run).second)===1);await sleep(70);
 assert.equal(Number(values(run).first),1);assert.equal(Number(values(run).second),1);assert.deepEqual(run.errors,[]);
 }finally{close(run);}
});
test('stop and genuine same-VM reload cancel old wait before a fresh generation',{timeout:3500},async()=>{
 let run;try{run=await start('let after=0;pauseUntil(function(){return false});after+=1');await bootstrap(run);await sleep(20);
 const old=run.vm.runtime.threads.filter(t=>t.peekStack()&&t.blockContainer.getBlock(t.peekStack())?.opcode==='control_wait_until');assert.ok(old.length);
 const archive=Buffer.from(await(await run.vm.saveProjectSb3()).arrayBuffer());run.vm.stopAll();await sleep(80);assert.equal(Number(values(run).after),0);
 await run.vm.loadProject(archive);run.vm.greenFlag();await bootstrap(run);await sleep(80);assert.equal(Number(values(run).after),0);
 assert.ok(old.every(t=>!run.vm.runtime.threads.includes(t)));assert.deepEqual(run.errors,[]);
 }finally{close(run);}
});
for(const mutation of ['graph','cache','primitive'])test('positive-first current '+mutation+' replacement refuses before predicate resampling',{timeout:3000},async()=>{
 let run;try{run=await start('let after=0;pauseUntil(function(){return game.runtime()<0});after+=1');await bootstrap(run);await sleep(15);
 const rt=run.vm.runtime,thread=rt.threads.find(t=>t.peekStack()&&t.blockContainer.getBlock(t.peekStack())?.opcode==='control_wait_until');assert.ok(thread,'actual false wait must first be parked');
 const queried=run.calls.get('arcade_sceneMillis');assert.ok(queried>=1,'actual Number query executed before adversary');
 const block=thread.blockContainer.getBlock(thread.peekStack());
 if(mutation==='graph')block.inputs.CONDITION={...block.inputs.CONDITION};
 if(mutation==='cache')thread.blockContainer._cache._executeCached={};
 if(mutation==='primitive')rt._primitives.control_wait_until=()=>{};
 await until(()=>run.errors.some(e=>e.includes('Source pauseUntil')));assert.equal(Number(values(run).after),0);assert.equal(run.calls.get('arcade_sceneMillis'),queried,'no condition query after ownership loss');
 }finally{close(run);}
});
test('minimal source retains actual wait ABI through Code/same/fresh SB3 and export reimport',{timeout:6500},async()=>{
 let run;let code,archive,exported;
 try{run=await start(source);await bootstrap(run);await until(()=>Number(values(run).after)===1);
 code=run.creator.decompile();archive=Buffer.from(await(await run.vm.saveProjectSb3()).arrayBuffer());
 exported=projectToArcade(run.creator.project);assert.deepEqual(exported.unsupported,[]);assert.deepEqual(exported.warnings,[]);
 run.vm.stopAll();await run.vm.loadProject(archive);run.vm.greenFlag();await bootstrap(run);await until(()=>Number(values(run).after)===1);assert.deepEqual(run.errors,[]);
 }finally{close(run);}
 for(const variant of [{text:source,code},{text:source,archive},{text:exported.files}]){
  try{run=await start(variant.text,variant);await bootstrap(run);await until(()=>Number(values(run).after)===1);assert.deepEqual(run.errors,[]);}finally{close(run);}
 }
});
test('optional source pauseUntil timeout remains explicitly refused rather than ignored',()=>{
 const result=arcadeToPseudocode('pauseUntil(function(){return false},50)');assert.ok(result.unsupported.length>0);
});


test('synchronous actual condition queries run initially, at queue zero and at50 only',{timeout:2500},async()=>{
 let run;try{run=await start('let after=0;pauseUntil(function(){return control.millis()>=50});after+=1');
 const clock=createArcadeDiscreteTimers();run.vm.stopAll();run.vm.runtime.bwArcadeProgramClock=clock;
 run.vm.runtime.updateCurrentMSecs=()=>{run.vm.runtime.currentMSecs=clock.now();};run.vm.greenFlag();
 const before=run.calls.get('arcade_programMillis')||0;await bootstrap(run);assert.equal((run.calls.get('arcade_programMillis')||0)-before,1);
 await clock.advanceTo(0);assert.equal((run.calls.get('arcade_programMillis')||0)-before,2);assert.equal(Number(values(run).after),0);
 await clock.advanceTo(49);assert.equal((run.calls.get('arcade_programMillis')||0)-before,2);
 await clock.advanceTo(50);assert.equal((run.calls.get('arcade_programMillis')||0)-before,3);assert.equal(Number(values(run).after),1);
 await clock.advanceTo(100);assert.equal((run.calls.get('arcade_programMillis')||0)-before,3);assert.deepEqual(run.errors,[]);
 }finally{close(run);}
});
test('same managed caller rereads the actual captured local cell',{timeout:2500},async()=>{
 let run;try{run=await start('let after=0;function install(){let done=false;game.onUpdate(function(){done=true});pauseUntil(function(){return done});after+=1}install()');
 await bootstrap(run);await until(()=>Number(values(run).after)===1);assert.deepEqual(run.errors,[]);
 }finally{close(run);}
});
test('actual dispose while parked cannot advance obsolete source caller',{timeout:2500},async()=>{
 let run;try{run=await start('let after=0;pauseUntil(function(){return false});after+=1');await bootstrap(run);
 const targets=[...run.vm.runtime.targets];await run.vm.clear();await sleep(80);
 const old=Object.fromEntries(targets.flatMap(t=>Object.values(t.variables)).map(v=>[v.name.replace(/^Game_/,''),v.value]));assert.equal(Number(old.after),0);assert.deepEqual(run.errors,[]);
 }finally{close(run);}
});

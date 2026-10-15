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
 const variable=run.vm.runtime.targets.flatMap(t=>Object.values(t.variables)).find(v=>v.name.replace(/^Game_/,'')==='after');assert.ok(variable);await run.vm.clear();await sleep(80);
 assert.equal(Number(variable.value),0);assert.deepEqual(run.errors,[]);
 }finally{close(run);}
});


const asyncHelper=`let checks=0;let updates=0;let done=false;let after=0;
function condition(){checks+=1;pause(10);return checks>=3&&done}
game.onUpdate(function(){updates+=1;done=true});pauseUntil(function(){return condition()});after+=1`;
test('actual async effectful helper conditions retain managed lineage while independent scene updates progress',{timeout:4000},async()=>{
 let run;try{run=await start(asyncHelper);await bootstrap(run);await until(()=>Number(values(run).after)===1,1500);
 assert.equal(Number(values(run).checks),3,'one initial and two actual poll evaluations; no delivery reread');assert.ok(Number(values(run).updates)>1,'real scene worker progressed during condition suspension');
 await sleep(70);assert.equal(Number(values(run).checks),3);assert.equal(Number(values(run).after),1);assert.deepEqual(run.errors,[]);
 }finally{close(run);}
});
test('optimistic true effectful helper executes once and never enrolls',{timeout:2500},async()=>{
 let run;try{run=await start('let checks=0;let after=0;function condition(){checks+=1;return true}pauseUntil(function(){return condition()});after+=1');await bootstrap(run);
 assert.equal(Number(values(run).checks),1);assert.equal(Number(values(run).after),1);assert.equal(run.vm.runtime._arcadeFramePhase.ext._pollEvents?.size||0,0);assert.deepEqual(run.errors,[]);
 }finally{close(run);}
});
for(const mutation of ['args','parent','inputs','defined'])test('positive-first child cache '+mutation+' replacement refuses before actual condition effects',{timeout:3000},async()=>{
 let run;try{run=await start('let after=0;pauseUntil(function(){return game.runtime()<0});after+=1');await bootstrap(run);await sleep(10);
 const rt=run.vm.runtime,thread=rt.threads.find(t=>t.peekStack()&&t.blockContainer.getBlock(t.peekStack())?.opcode==='control_wait_until');assert.ok(thread);
 const cache=thread.blockContainer._cache._executeCached[thread.peekStack()],op=cache._ops.find(o=>o.opcode==='arcade_sceneMillis');assert.ok(op);
 const before=run.calls.get('arcade_sceneMillis');assert.ok(before>0);
 if(mutation==='args')op._argValues={...op._argValues};
 if(mutation==='parent')op._parentValues={...op._parentValues};
 if(mutation==='inputs')op._inputs={...op._inputs};
 if(mutation==='defined')op._definedBlockFunction=false;
 await until(()=>run.errors.some(e=>e.includes('Source pauseUntil')));assert.equal(Number(values(run).after),0);assert.equal(run.calls.get('arcade_sceneMillis'),before);
 }finally{close(run);}
});
test('one refused wait removes only its entry while independent actual waiter completes',{timeout:3500},async()=>{
 let run;try{run=await start('let bad=0;let good=0;control.runInParallel(function(){pauseUntil(function(){return control.millis()<0});bad+=1});pauseUntil(function(){return game.runtime()>=80});good+=1');await bootstrap(run);
 const rt=run.vm.runtime,thread=rt.threads.find(t=>t.peekStack()&&t.blockContainer._cache._executeCached[t.peekStack()]?._ops.some(o=>o.opcode==='arcade_programMillis'));assert.ok(thread,'first real waiter admitted');
 const op=thread.blockContainer._cache._executeCached[thread.peekStack()]._ops.find(o=>o.opcode==='arcade_programMillis');const before=run.calls.get('arcade_programMillis');assert.ok(before>0);op._argValues={...op._argValues};
 await until(()=>Number(values(run).good)===1,1500);assert.equal(Number(values(run).bad),0);assert.equal(run.calls.get('arcade_programMillis'),before);assert.ok(run.errors.some(e=>e.includes('Source pauseUntil')));
 }finally{close(run);}
});
test('Stop during actual async helper suspension cannot deliver or resume old wait',{timeout:3000},async()=>{
 let run;try{run=await start('let checks=0;let after=0;function condition(){checks+=1;pause(200);return true}pauseUntil(function(){return condition()});after+=1');await bootstrap(run);assert.equal(Number(values(run).checks),1);assert.equal(Number(values(run).after),0);
 run.vm.stopAll();await sleep(260);assert.equal(Number(values(run).after),0);assert.equal(Number(values(run).checks),1);assert.deepEqual(run.errors,[]);
 }finally{close(run);}
});

test('initial pre-input hook refuses preexisting cached argument corruption before the first new-run effect',{timeout:3000},async()=>{
 let run;try{run=await start('let after=0;pauseUntil(function(){return game.runtime()<0});after+=1');await bootstrap(run);
 const rt=run.vm.runtime,container=rt.targets.find(t=>Object.values(t.blocks._blocks).some(b=>b.opcode==='control_wait_until')).blocks;
 const block=Object.values(container._blocks).find(b=>b.opcode==='control_wait_until'),cache=container._cache._executeCached[block.id];assert.ok(cache);
 const op=cache._ops.find(o=>o.opcode==='arcade_sceneMillis');assert.ok(op);const before=run.calls.get('arcade_sceneMillis');assert.ok(before>0);
 run.vm.stopAll();run.vm.greenFlag();assert.equal(container._cache._executeCached[block.id],cache,'actual project restart retains the genuine cache');op._argValues.unowned='corrupt';
 await bootstrap(run);await until(()=>run.errors.some(e=>e.includes('Source pauseUntil')));assert.equal(run.calls.get('arcade_sceneMillis'),before);assert.equal(Number(values(run).after),0);
 }finally{close(run);}
});
test('ordinary Scratch wait-until retains stock yielding beside a genuine source phase',{timeout:2500},async()=>{
 let run;try{const imported=arcadeToPseudocode('let after=0;pauseUntil(function(){return false});after+=1');assert.deepEqual(imported.unsupported,[]);
 const code=imported.code.replaceAll('WHEN arcade source starts:','WHEN flag clicked:')+'\nSPRITE SourceSeed:\nWHEN arcade source starts:\n  arcade set background color to 0\n';
 run=await start('let after=0;pauseUntil(function(){return false});after+=1',{code});await bootstrap(run);
 const rt=run.vm.runtime,thread=rt.threads.find(t=>t.peekStack()&&t.blockContainer.getBlock(t.peekStack())?.opcode==='control_wait_until');assert.ok(thread);
 assert.equal(thread.status,thread.constructor.STATUS_RUNNING);assert.equal(Number(values(run).after),0);assert.equal(rt._arcadeFramePhase.ext._pollEvents?.size||0,0);assert.deepEqual(run.errors,[]);
 }finally{close(run);}
});


for(const mutation of ['opcode','id'])test('initial actual Blocks root refuses restarted cached '+mutation+' selector corruption before condition effects',{timeout:3000},async()=>{
 let run;try{run=await start('let after=0;pauseUntil(function(){return game.runtime()<0});after+=1');await bootstrap(run);
 const rt=run.vm.runtime,container=rt.targets.find(t=>Object.values(t.blocks._blocks).some(b=>b.opcode==='control_wait_until')).blocks;
 const block=Object.values(container._blocks).find(b=>b.opcode==='control_wait_until'),cache=container._cache._executeCached[block.id];assert.ok(cache);
 const before=run.calls.get('arcade_sceneMillis');assert.ok(before>0,'real predicate effect must first occur before this adversary');
 const other=Object.values(container._cache._executeCached).find(c=>c.id!==block.id&&c._parentValues===null&&c._parentKey===null&&c._ops?.at(-1)===c&&container.getBlock(c.id)?.opcode===c.opcode);
 if(mutation==='id')assert.ok(other,'different genuine current cached command root must exist');
 run.vm.stopAll();run.vm.greenFlag();assert.equal(container._cache._executeCached[block.id],cache);
 if(mutation==='opcode')cache.opcode='data_variable';else cache.id=other.id;
 await bootstrap(run);await until(()=>run.errors.some(e=>e.includes('Source pauseUntil')));
 assert.equal(run.calls.get('arcade_sceneMillis'),before,'current CONDITION must not execute after selector corruption');assert.equal(Number(values(run).after),0);
 }finally{close(run);}
});

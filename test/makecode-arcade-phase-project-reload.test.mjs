import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {runProgram,clearStrayTimers} from './helpers/bw-vm.mjs';
import {VM_SRC} from './helpers/bw-extensions.mjs';
const require=createRequire(import.meta.url),dispatch=require(VM_SRC+'/dispatch/central-dispatch.js');

test('actual SB3 reload retains one built-in instance and rearms its disposed source driver only after successful load',async()=>{
 let run;
 try{
  run=await runProgram('SPRITE Game:\nWHEN arcade source starts:\n  set marker to 1',{frames:0,storage:true});
  const runtime=run.vm.runtime,service=run.vm.extensionManager._loadedExtensions.get('arcade'),adapter=dispatch.services[service],driver=runtime._arcadeFramePhase;
  assert.equal(adapter._inst._runtime,runtime);assert.equal(driver.ext,adapter._inst);assert.equal(driver.disposed,false);assert.equal(runtime.listenerCount('ARCADE_FRAME'),1);
  const observations=[];runtime.on('RUNTIME_DISPOSED',()=>observations.push({disposed:driver.disposed,source:driver.hasSourceProject()}));
  const archive=Buffer.from(await(await run.vm.saveProjectSb3()).arrayBuffer());
  await run.vm.loadProject(archive);
  assert.ok(observations.length);assert.ok(observations.every(row=>row.disposed&&!row.source),'actual project clear cancels source authority before success');
  assert.equal(run.vm.extensionManager._loadedExtensions.get('arcade'),service);assert.equal(dispatch.services[service],adapter);assert.equal(runtime._arcadeFramePhase,driver);assert.equal(driver.ext._runtime,runtime);
  assert.equal(driver.disposed,false);assert.equal(driver.hasSourceProject(),true);assert.equal(runtime.listenerCount('ARCADE_FRAME'),1);assert.deepEqual(run.errors,[]);
  driver.detach();assert.equal(driver.disposed,true);
  await run.vm.loadProject(archive);
  assert.equal(runtime._arcadeFramePhase,driver);assert.equal(driver.disposed,true,'an explicitly detached driver cannot be rearmed by a later project');assert.equal(driver.hasSourceProject(),false);assert.equal(runtime.listenerCount('ARCADE_FRAME'),1);
 }finally{run?.vm.quit();clearStrayTimers();}
});

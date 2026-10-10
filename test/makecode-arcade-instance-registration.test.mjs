import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {runProgram,stepFrames} from './helpers/bw-vm.mjs';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';
import {INSTANCE_REGISTRATION_SOURCE as source,INSTANCE_ORACLE_INPUT as input} from './fixtures/arcade-instance-registration.mjs';
const values=run=>Object.fromEntries(run.vm.runtime.targets.flatMap(t=>Object.values(t.variables)).map(v=>[v.name.replace(/^Game_/,''),v.value]));
test('instance destruction retains live number/boolean captures, replacement, handle binding and yielding order through roundtrips',async()=>{
 const expected=await runPxtArcade(source+input,{waitForGlobals:{finished:2}});
 const exercise=async imported=>{
  assert.deepEqual(imported.unsupported,[]);
  const run=await runProgram(imported.code,{frames:3,uploads:imported.costumes,storage:true});
  for(let i=0;i<100 && values(run).finished!==1;i++){await stepFrames(run.vm,1,20);await new Promise(resolve=>setTimeout(resolve,5));}
  assert.equal(values(run).completed,1);assert.equal(values(run).trace,'I12i13KX');
  assert.equal(Object.keys(run.vm.runtime.bwArcadeDeviceState.sprites).length,1);
  run.vm.postIOData('keyboard',{key:' ',isDown:true});run.vm.postIOData('keyboard',{key:' ',isDown:false});
  for(let i=0;i<100 && values(run).finished!==2;i++){await stepFrames(run.vm,1,20);await new Promise(resolve=>setTimeout(resolve,5));}
  assert.equal(values(run).trace,expected.trace);assert.equal(values(run).completed,2);
  assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);return run;
 };
 const imported=arcadeToPseudocode(source);assert.match(imported.code,/arcade register instance destruction/);
 const run=await exercise(imported);
 await exercise({...imported,code:run.creator.decompile()});
 const exported=projectToArcade(run.creator.project,{costumeSvg:(t,c)=>run.creator.assets.get(c.assetId)?.data});assert.deepEqual(exported.unsupported,[]);
 const oracle=await runPxtArcade(exported.ts+input,{waitForGlobals:{finished:2}});assert.equal(oracle.trace,expected.trace);
 await exercise(arcadeToPseudocode(exported.files));
 await run.vm.loadProject(Buffer.from(await(await run.vm.saveProjectSb3()).arrayBuffer()));run.vm.greenFlag();
 for(let i=0;i<100 && values(run).finished!==1;i++){await stepFrames(run.vm,1,20);await new Promise(resolve=>setTimeout(resolve,5));}
 assert.equal(values(run).trace,'I12i13KX');
});
test('invalid instance destruction callbacks remain diagnosed',()=>{
 for(const callback of ['1','function(a){}','function(){},1']){
  const imported=arcadeToPseudocode(`let sprite=sprites.create(img\`1\`,SpriteKind.Enemy);sprite.onDestroyed(${callback})`);
  assert.ok(imported.unsupported.length,callback);
 }
});

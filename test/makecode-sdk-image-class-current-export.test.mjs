import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {runArcadeSourceCode} from './helpers/arcade-source-program.mjs';
import {clearStrayTimers} from './helpers/bw-vm.mjs';
import {source} from './fixtures/arcade/sdk-image-class-callables.mjs';
const check=(run,width=2)=>{
 assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);
 const vars=run.vm.runtime.targets.flatMap(target=>Object.values(target.variables));
 assert.deepEqual(['width','height','same','different'].map(name=>vars.find(variable=>variable.name===name).value),[width,2,true,true]);
};
test('current Image factory edit exports genuine current callbacks and reimports actual clone identities',async()=>{
 const runs=[];try{
  const translated=arcadeToPseudocode(source,{sdkImagePrototype:true});assert.deepEqual(translated.unsupported,[]);
  const native=await runArcadeSourceCode(translated.code,{frames:48});runs.push(native);check(native);
  const project=JSON.parse(native.vm.toJSON());
  const factory=project.targets.flatMap(target=>Object.values(target.blocks)).find(block=>block.opcode==='arcade_createImage');
  assert.deepEqual(factory.inputs.WIDTH,[1,[4,'2']]);factory.inputs.WIDTH[1][1]='3';
  const edited=await runArcadeSourceCode(native.creator.decompile(project),{frames:48});runs.push(edited);check(edited,3);
  const exported=projectToArcade(project,{classCallablePrototype:true,sdkImagePrototype:true});
  assert.deepEqual(exported.unsupported,[]);assert.deepEqual(exported.warnings,[]);
  assert.match(exported.ts,/image\.create\(3, 2\)/);assert.match(exported.ts,/read: \(\) => Image/);assert.match(exported.ts,/input: Image\) =>/);
  assert.doesNotMatch(exported.ts,/let (?:copied|captured): Image = null/);
  const reimported=arcadeToPseudocode(exported.files,{sdkImagePrototype:true});assert.deepEqual(reimported.unsupported,[]);
  const fresh=await runArcadeSourceCode(reimported.code,{frames:64});runs.push(fresh);check(fresh,3);
 }finally{for(const run of runs){run.vm.stopAll();run.vm.quit();}clearStrayTimers();}
});

test('zero by zero owned Images remain distinct real clone results through class export and reimport',async()=>{
 const runs=[];const zeroSource=source.replace('image.create(2,2)','image.create(0,0)');
 const zeroCheck=run=>{assert.deepEqual(run.errors,[]);const vars=run.vm.runtime.targets.flatMap(target=>Object.values(target.variables));assert.deepEqual(['width','height','same','different'].map(name=>vars.find(variable=>variable.name===name).value),[0,0,true,true]);};
 try{
  const translated=arcadeToPseudocode(zeroSource,{sdkImagePrototype:true});assert.deepEqual(translated.unsupported,[]);
  const native=await runArcadeSourceCode(translated.code,{frames:48});runs.push(native);zeroCheck(native);
  const exported=projectToArcade(JSON.parse(native.vm.toJSON()),{classCallablePrototype:true,sdkImagePrototype:true});assert.deepEqual(exported.unsupported,[]);assert.match(exported.ts,/image\.create\(0, 0\)/);
  const imported=arcadeToPseudocode(exported.files,{sdkImagePrototype:true});assert.deepEqual(imported.unsupported,[]);
  const fresh=await runArcadeSourceCode(imported.code,{frames:64});runs.push(fresh);zeroCheck(fresh);
 }finally{for(const run of runs){run.vm.stopAll();run.vm.quit();}clearStrayTimers();}
});

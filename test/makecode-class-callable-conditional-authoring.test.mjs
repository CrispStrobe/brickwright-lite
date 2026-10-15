import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {runProgram,stepFrames,clearStrayTimers} from './helpers/bw-vm.mjs';
import {importGuiDependency} from './helpers/bw-integrated.mjs';
import {effectSource} from './fixtures/arcade-class-callable-conditional-source.mjs';
const BW=(await importGuiDependency('scratch-vm/src/util/bw-values.js')).default;
const check=run=>{
 assert.deepEqual(run.creator.warnings,[]);assert.deepEqual(run.errors,[]);
 const cells=run.vm.runtime.targets.flatMap(target=>Object.values(target.variables));
 const read=name=>BW.decode(cells.find(cell=>cell.name===name).value);
 assert.deepEqual(['numberResult','textResult','absentResult'].map(read),[3,'ok',undefined]);
 const heap=run.vm.runtime._arcadeFramePhase.ext._objectHeap;
 assert.deepEqual(['value','display','image'].map(name=>BW.decode(heap.get(read('state'),name))),[4,3,3]);
 assert.equal(heap.get(read('present'),'state'),read('state'));
 assert.equal(BW.decode(heap.get(read('absent'),'state')),undefined);
};
test('conditional class results preserve serial Void effects and actual absent Undefined through portable authoring',async()=>{
 const translated=arcadeToPseudocode({'main.ts':effectSource});assert.deepEqual(translated.unsupported,[]);
 const runs=[];
 try{
  const run=await runProgram(translated.code,{frames:80});runs.push(run);check(run);
  const project=JSON.parse(run.vm.toJSON()),exported=projectToArcade(project);
  assert.deepEqual(exported.unsupported,[]);assert.deepEqual(exported.warnings,[]);
  assert.match(exported.ts,/apply<T>\(action: \(state: State\) => T\): T/);
  assert.doesNotMatch(exported.ts,/let voidResult|: any = "undefined"/);
  for(const mutate of [
   (target,body)=>{body.condition.inputs.CONDITION=[1,[4,'1']];},
   (target,body)=>{body.presentReturn.inputs.VALUE=[1,[10,'wrong']];},
   (target,body)=>{body.absentReturn.inputs.VALUE=[1,[4,'1']];},
   (target,body)=>{body.followup.inputs.METHOD=[1,[10,'missing']];},
   (target,body)=>{body.call.inputs.ARGS=[1,[10,'[]']];},
  ]){
   const edited=structuredClone(project),target=edited.targets.find(t=>Object.values(t.blocks).some(b=>b.opcode==='procedures_prototype'&&b.mutation.proccode.includes('Holder_apply')));
   const [protoID]=Object.entries(target.blocks).find(([,b])=>b.opcode==='procedures_prototype'&&b.mutation.proccode.includes('Holder_apply'));
   const definition=Object.values(target.blocks).find(b=>b.opcode==='procedures_definition'&&b.inputs.custom_block[1]===protoID);
   const save=target.blocks[definition.next],condition=target.blocks[save.next],result=target.blocks[condition.inputs.SUBSTACK[1]];
   const first=target.blocks[result.next],second=target.blocks[first.next],presentReturn=target.blocks[second.next];
   mutate(target,{condition,call:target.blocks[result.inputs.VALUE[1]],followup:target.blocks[first.inputs.VALUE[1]],presentReturn,absentReturn:target.blocks[condition.next]});
   assert.ok(projectToArcade(edited).unsupported.length,'edited branch must retain its exact connected producer proof');
  }

  const reimport=arcadeToPseudocode(exported.files);assert.deepEqual(reimport.unsupported,[]);
  const replay=await runProgram(reimport.code,{frames:80});runs.push(replay);check(replay);
  const code=await runProgram(run.creator.decompile(project),{frames:80});runs.push(code);check(code);
  const saved=Buffer.from(await(await run.vm.saveProjectSb3()).arrayBuffer());
  const oldHeap=run.vm.runtime._arcadeFramePhase.ext._objectHeap;
  const oldState=run.vm.runtime.targets.flatMap(target=>Object.values(target.variables)).find(cell=>cell.name==='state').value;
  await run.vm.loadProject(saved);run.vm.greenFlag();await stepFrames(run.vm,80);check(run);
  assert.throws(()=>oldHeap.inspect(oldState),/stale|unknown|generation|reference/i);
  run.vm.greenFlag();await stepFrames(run.vm,80);check(run);
  const fresh=await runProgram('SPRITE Placeholder:\nWHEN flag clicked:\n  hide',{frames:0});runs.push(fresh);
  await fresh.vm.loadProject(saved);fresh.vm.greenFlag();await stepFrames(fresh.vm,80);check(fresh);
 }finally{runs.forEach(run=>run.vm.quit());clearStrayTimers();}
});

test('Void action pause precedes followups and Stop retires its actual read ticket',async()=>{
 const {runTimedArcadeProgram}=await import('./helpers/arcade-timed-native.mjs');
 const paused=effectSource.replace('state.value+=1;','pause(40);state.value+=1;');
 const translated=arcadeToPseudocode({'main.ts':paused});assert.deepEqual(translated.unsupported,[]);
 for(const stop of [false,true]){
  const run=await runTimedArcadeProgram(translated.code,{milliseconds:0,retainExtensionTimers:true});
  try{
   const cells=run.vm.runtime.targets.flatMap(target=>Object.values(target.variables)),ref=cells.find(cell=>cell.name==='state').value;
   const heap=run.vm.runtime._arcadeFramePhase.ext._objectHeap;
   const state=()=>['value','display','image'].map(name=>BW.decode(heap.get(ref,name)));
   assert.deepEqual(state(),[3,2,2]);await run.clock.advanceTo(39);assert.deepEqual(state(),[3,2,2]);
   if(stop){run.vm.stopAll();await run.clock.advanceTo(80);assert.deepEqual(state(),[3,2,2]);}
   else{await run.clock.advanceTo(40);check(run);}
   assert.deepEqual(run.errors,[]);
  }finally{run.vm.quit();clearStrayTimers();}
 }
});

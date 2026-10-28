import test from 'node:test';
import assert from 'node:assert/strict';
import {editEventMessageCode} from '../scripts/lib/arcade-event-gui-edits.mjs';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {runProgram,stepFrames,clearStrayTimers} from './helpers/bw-vm.mjs';
import {eventAuthoringFiles,eventSample} from './fixtures/arcade-event-authoring-game.mjs';

const values=run=>Object.fromEntries(run.vm.runtime.targets.filter(target=>target.isOriginal).flatMap(target=>Object.values(target.variables)).map(variable=>[variable.name.replace(/^(?:Game_)+/,''),variable.value]));
const check=(run,sample)=>{assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);for(const [key,value]of Object.entries(sample))assert.equal(values(run)[key],value,key);};
const press=async run=>{run.vm.postIOData('keyboard',{key:' ',isDown:true});await stepFrames(run.vm,25);};

test('Code message edit changes the live event handler as well as the stopped saved trace',async()=>{
 const runs=[];
 try{
  const options={value:2,player:3};
  const first=await runProgram(arcadeToPseudocode(eventAuthoringFiles(options)).code,{frames:3,storage:true});runs.push(first);
  check(first,eventSample(options));await press(first);check(first,eventSample({...options,pressed:true}));
  first.vm.stopAll();
  const code=first.creator.decompile(JSON.parse(first.vm.toJSON()));
  assert.equal(code.match(/"H"/g).length,2,'saved variable and actual callback each contain H');
  const edited=editEventMessageCode(code);assert.ok(!edited.includes('"H"'));
  const next=await runProgram(edited,{frames:3,storage:true});runs.push(next);
  check(next,eventSample({...options,message:'PLAY'}));await press(next);check(next,eventSample({...options,message:'PLAY',pressed:true}));
  assert.throws(()=>editEventMessageCode('no message'),/missing from Code/);
 }finally{for(const run of runs)run.vm.quit();clearStrayTimers();}
});

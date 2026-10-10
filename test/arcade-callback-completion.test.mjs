import test from 'node:test';
import assert from 'node:assert/strict';
import {setTimeout as delay} from 'node:timers/promises';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {runProgram,clearStrayTimers} from './helpers/bw-vm.mjs';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';

import {CALLBACK_COMPLETION_SOURCE as source} from './fixtures/arcade-callback-completion.mjs';

test('completed yielding collision callbacks resume their inline successors before another physics tick',async()=>{
 const expected=await runPxtArcade(source,{dependencies:{device:'*','color-coded-tilemap':'*'}});
 assert.ok(expected.after<expected.before,'original physics continues during the pause');
 for(const key of ['inB','inC','finalX'])assert.equal(expected[key],expected.after,`original ${key}`);
 const imported=arcadeToPseudocode(source);assert.deepEqual(imported.unsupported,[]);
 const run=await runProgram(imported.code,{frames:0,uploads:imported.costumes,storage:true});
 const values=()=>Object.fromEntries(run.vm.runtime.targets.flatMap(t=>Object.values(t.variables)).map(v=>[v.name.replace(/^Game_/,''),v.value]));
 const started=performance.now();run.vm.start();
 try{
  while(!values().done){assert.ok(performance.now()-started<5000,'native callback completes');await delay(5);}
  const actual=values();assert.ok(actual.after<actual.before,'native physics continues during the pause');
  for(const key of ['inB','inC','finalX'])assert.equal(actual[key],actual.after,`native ${key}`);
  assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);
 }finally{run.vm.quit();clearStrayTimers();}
});

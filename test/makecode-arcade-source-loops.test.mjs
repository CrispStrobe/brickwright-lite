import test from 'node:test';
import assert from 'node:assert/strict';
import SB3Creator from '../overlay/scratch-gui/src/lib/sb3-creator.js';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {loadExtensionClass} from './helpers/bw-extensions.mjs';
import {EventEmitter} from 'node:events';
import {runProgram,stepFrames,clearStrayTimers} from './helpers/bw-vm.mjs';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';

test('source loops retain reevaluated bounds and break guards through Code and export',()=>{
 const imported=arcadeToPseudocode('let limit=5;let count=0;for(let i=0;i<limit;i++){count++;limit--;}while(count<5){count++;if(count==4){break;}}');
 assert.deepEqual(imported.unsupported,[]);assert.match(imported.code,/WHEN arcade source starts:/);
 assert.match(imported.code,/arcade repeat while/);assert.doesNotMatch(imported.code,/REPEAT (?:5|limit):|REPEAT UNTIL|FOREVER:/);
 const c=new SB3Creator();c.parse(imported.code);assert.deepEqual(c.warnings,[]);
 const code=c.decompile();const d=new SB3Creator();d.parse(code);assert.deepEqual(d.warnings,[]);
 const blocks=c.project.targets.flatMap(t=>Object.values(t.blocks));
 assert.equal(blocks.filter(b=>b.opcode==='arcade_sourceWhile').length,2);
 assert.ok(blocks.some(b=>b.opcode==='arcade_whenSourceStarts'));
 const exported=projectToArcade(c.project);assert.deepEqual(exported.unsupported,[]);
 assert.match(exported.files['main.ts'],/while \(/);assert.doesNotMatch(exported.files['main.ts'],/pause\(20\)/);
 const reimport=arcadeToPseudocode(exported.files);assert.deepEqual(reimport.unsupported,[]);
 assert.match(reimport.code,/arcade repeat while/);
});

test('source loop primitive branches only on its current Boolean input',()=>{
 const Arcade=loadExtensionClass('arcade'),a=new Arcade(new EventEmitter());
 const blocks=a.getInfo().blocks;
 assert.ok(blocks.some(b=>b.opcode==='whenSourceStarts'&&b.isEdgeActivated===false));
 assert.ok(blocks.some(b=>b.opcode==='sourceWhile'&&b.arguments.CONDITION));
 const branches=[];const util={startBranch:(...args)=>branches.push(args)};
 a.sourceWhile({CONDITION:false},util);assert.deepEqual(branches,[]);
 a.sourceWhile({CONDITION:true},util);assert.deepEqual(branches,[[1,true]]);
});


test('reevaluated source loops execute from genuine startup and survive fresh SB3 reload',async()=>{
 const source='let limit=5;let count=0;for(let i=0;i<limit;i++){count++;limit--;}while(count<5){count++;if(count==4){break;}}console.log(count);console.log(limit)';
 const original=await runPxtArcade(source,{fakeClock:true});
 const imported=arcadeToPseudocode(source);assert.deepEqual(imported.unsupported,[]);
 const runs=[];
 const check=run=>{assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);const values=Object.fromEntries(run.vm.runtime.targets.flatMap(t=>Object.values(t.variables)).map(v=>[v.name.replace(/^Game_/,''),v.value]));assert.equal(values.count,original.count);assert.equal(values.limit,original.limit);};
 try{
  const run=await runProgram(imported.code,{frames:40,uploads:imported.costumes,storage:true});runs.push(run);check(run);
  const code=await runProgram(run.creator.decompile(),{frames:40,uploads:imported.costumes,storage:true});runs.push(code);check(code);
  const fresh=await runProgram('SPRITE Placeholder:\nWHEN flag clicked:\n  hide',{frames:0,storage:true});runs.push(fresh);fresh.vm.stopAll();await fresh.vm.loadProject(run.buffer);fresh.vm.greenFlag();await stepFrames(fresh.vm,40);check(fresh);
  const exported=projectToArcade(run.creator.project);assert.deepEqual(exported.unsupported,[]);
  const exportedOriginal=await runPxtArcade(exported.files,{fakeClock:true});assert.equal(exportedOriginal.count??exportedOriginal.Game_count,original.count);assert.equal(exportedOriginal.limit??exportedOriginal.Game_limit,original.limit);
  const reimport=arcadeToPseudocode(exported.files);assert.deepEqual(reimport.unsupported,[]);const again=await runProgram(reimport.code,{frames:40,uploads:reimport.costumes,storage:true});runs.push(again);check(again);
 }finally{for(const run of runs)run.vm.quit();clearStrayTimers();}
});


test('source for loops keep expression initializers, multiple declarations and omitted tests',()=>{
 for(const source of ['let i=7;let total=0;for(i=0;i<3;i++){total+=i}', 'let total=0;for(let i=0,j=2;i<j;i++){total+=j}', 'let count=0;for(;;){count++;if(count==3){break;}}']) {
  const imported=arcadeToPseudocode(source);assert.deepEqual(imported.unsupported,[],source);
  const c=new SB3Creator();c.parse(imported.code);assert.deepEqual(c.warnings,[],source);
  assert.match(imported.code,/arcade repeat while/);
  const exported=projectToArcade(c.project);assert.deepEqual(exported.unsupported,[],source);
 }
 const expression=arcadeToPseudocode('let i=7;for(i=0;i<3;i++){}');assert.match(expression.code,/set i to .*0/);
 const multiple=arcadeToPseudocode('for(let i=0,j=2;i<j;i++){}');assert.match(multiple.code,/set j to .*2/);
});

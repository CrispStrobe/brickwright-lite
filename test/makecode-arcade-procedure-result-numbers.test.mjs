import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {runArcadeSourceCode as runProgram} from './helpers/arcade-source-program.mjs';
import {stepFrames,clearStrayTimers} from './helpers/bw-vm.mjs';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';

// Arcade 2c, part 3: a procedure result reaches a Number formal only when
// every actual return is proven Number and no path falls through. Traces
// follow the selected PXT staging order (conditional arguments first).
const helpers='let yes=true\nlet trace=0\nfunction tap(n:number){trace=trace*10+n;return n}\nfunction pair(a:number,b:number){return a*10+b}\n';
const refusal=/^Procedure parameter constraint: pair\.a requires Number from actual producers$/;
const unsupported=source=>arcadeToPseudocode(helpers+source).unsupported;

test('procedure results whose every return is proven Number reach a Number formal',()=>{
 assert.deepEqual(unsupported('let v=pair(tap(1),pair(tap(2),3))'),[]);
 assert.deepEqual(unsupported('let v=pair(tap(1),yes?pair(tap(2),yes?tap(3):tap(8)):tap(7))'),[]);
 assert.deepEqual(unsupported('function f(x:boolean){if(x){return 1}return tap(2)}\nlet v=pair(f(true),1)'),[]);
});

test('a non-Number return path, a fall-through path or a resultless cycle stays refused',()=>{
 const cases={
  'Text return path':'function f(x:boolean){if(x){return 1}return "a"}\nlet v=pair(f(true),1)',
  'Boolean return path':'function f(x:boolean){if(x){return 1}return x}\nlet v=pair(f(true),1)',
  'any Text return':'function f(){return <any>"a"}\nlet v=pair(f(),1)',
  'falls through':'function f(x:boolean){if(x){return 1}}\nlet v=pair(f(true),1)',
  'bare return':'function f(x:boolean){if(x){return}return 1}\nlet v=pair(f(true),1)',
  'resultless cycle':'function loop(n:number):any{return loop(n)}\nlet v=pair(loop(1),1)',
 };
 for(const [name,source]of Object.entries(cases))assert.ok(unsupported(source).some(message=>refusal.test(message)),name+' -> '+JSON.stringify(unsupported(source)));
});

const source=helpers+'trace=0\nlet nestedValue=pair(tap(1),yes?pair(tap(2),yes?tap(3):tap(8)):tap(7))\nlet nestedTrace=trace\ntrace=0\nlet directValue=pair(pair(tap(1),tap(2)),tap(3))\nlet directTrace=trace\n';
const expected={nestedValue:33,nestedTrace:321,directValue:123,directTrace:123};
test('proven procedure results keep values and order across native, Code, fresh SB3, export and reimport',{timeout:300000},async()=>{
 const runs=[];
 const check=run=>{assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);
  const vars=Object.fromEntries(run.vm.runtime.targets.flatMap(t=>Object.values(t.variables)).map(v=>[v.name.replace(/^Game_/,''),v.value]));
  for(const [name,value]of Object.entries(expected))assert.equal(vars[name],value,name);};
 const execute=async imported=>{assert.deepEqual(imported.unsupported,[]);const run=await runProgram(imported.code,{frames:12,storage:true});runs.push(run);check(run);return run;};
 try{
  const imported=arcadeToPseudocode(source),direct=await execute(imported);
  await execute({...imported,code:direct.creator.decompile()});
  const fresh=await runProgram('SPRITE Placeholder:\nWHEN flag clicked:\n  hide',{frames:0,storage:true});runs.push(fresh);
  await fresh.vm.loadProject(Buffer.from(await(await direct.vm.saveProjectSb3()).arrayBuffer()));fresh.vm.greenFlag();await stepFrames(fresh.vm,12);check(fresh);
  const exported=projectToArcade(direct.creator.project);assert.deepEqual(exported.unsupported,[]);
  const original=await runPxtArcade(exported.files,{fakeClock:true});
  for(const [name,value]of Object.entries(expected))assert.equal(original[name]??original['Game_'+name],value,name);
  await execute(arcadeToPseudocode(exported.files));
 }finally{runs.forEach(run=>run.vm.quit());clearStrayTimers();}
});

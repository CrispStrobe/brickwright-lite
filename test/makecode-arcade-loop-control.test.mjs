import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {runProgram,stepFrames,clearStrayTimers} from './helpers/bw-vm.mjs';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';
import {runTimedArcadeProgram,restartTimedArcadeRun} from './helpers/arcade-timed-native.mjs';
const values=run=>Object.fromEntries(run.vm.runtime.targets.flatMap(t=>Object.values(t.variables)).map(v=>[v.name.replace(/^Game_/,''),v.value]));
const fixtures=[
 ['nested break remainder','let trace="";for(let i=0;i<5;i++){if(i==2){if(true){break;trace+="BAD1"};trace+="BAD2"};trace+=""+i};let done=1',['trace']],
 ['for continue and update','let updates=0;let sum=0;function advance(i:number){updates++;return i+1};for(let i=0;i<6;i=advance(i)){if(i==1){continue;sum+=100};if(i==4){break;sum+=200};sum+=i};let done=1',['updates','sum']],
 ['while continue and nested ownership','let trace="";let i=0;while(i<4){i++;if(i==2){continue;trace+="BAD"};for(let j=0;j<3;j++){if(j==1){break;trace+="BAD2"};trace+=""+i+j};trace+="X"};let done=1',['trace','i']],
 ['for-of continue and mutation','let values=[1,2,3,4];let sum=0;for(let n of values){if(n==1){values.push(5)};if(n==2){continue;sum+=100};if(n==5){break;sum+=200};sum+=n};let done=1',['sum']],
 ['switch break and continue','let trace="";for(let i=0;i<4;i++){switch(i){case 0:if(true){break;trace+="BAD1"};trace+="BAD2";break;case 1:continue;case 2:trace+="C";break;default:trace+="D"};trace+="X"};let done=1',['trace']],
 ['loop inside a switch case','let sum=0;let choice=2;switch(choice){case 1:sum=100;break;case 2:for(let i=0;i<5;i++){if(i==1)continue;if(i==3){break;sum+=200};sum+=i};break;default:sum=300};let done=1',['sum']],
 ['do while continue checks posttest once','let checks=0;let count=0;function check(){checks++;return false};do{count++;if(count>3)break;continue;count+=100}while(check());let done=1',['checks','count'],{checks:1,count:1}],
 ['do while break skips posttest','let checks=0;let count=0;function check(){checks++;return true};do{count++;break;count+=100}while(check());let done=1',['checks','count']],
 ['namespace do while posttest binding','namespace State {export let count=0;do{count++}while(count<3)};let count=State.count;let done=1',['count']],
 ['enum and interface source entry','interface Marker {value:number};enum Limit {End=4};let sum=0;for(let i=0;i<Limit.End;i++){if(i==1)continue;if(i==3)break;sum+=i};let done=1',['sum']],
 ['condition and update side effects','let checks=0;let updates=0;let sum=0;function check(i:number){checks++;return i<5};function advance(i:number){updates++;return i+1};for(let i=0;check(i);i=advance(i)){if(i==1)continue;if(i==3)break;sum+=i};let done=1',['checks','updates','sum']],
 ['recursive function exit cells','function calculate(n:number):number{let sum=0;for(let i=0;i<4;i++){if(i==1){if(n>0){sum+=calculate(n-1)}else{sum+=1};continue;sum+=100};if(i==3){break;sum+=200};sum+=n};return sum};let first=calculate(3);let second=calculate(1);let done=1',['first','second']],
 ['overlapping function exit cells','let first=-1;let second=-1;function calculate(n:number):number{let sum=0;for(let i=0;i<7;i++){pause(20);if(i==1){continue;sum+=100};if(i==n){break;sum+=200};sum+=i};return sum};control.runInParallel(function(){first=calculate(2)});second=calculate(5);while(first==-1){pause(10)};let done=1',['first','second']],
 ['exit cell name hygiene','let __bwLoopExit1=7;let sum=0;for(let i=0;i<5;i++){if(i==1)continue;if(i==3)break;sum+=i};let hygiene=__bwLoopExit1;let done=1',['hygiene','sum']],
 ['function reentry exit cells','function calculate(n:number):number{let sum=0;for(let i=0;i<n;i++){if(i==1){continue;sum+=100};if(i==3){break;sum+=200};sum+=i};return sum};let first=calculate(6);let second=calculate(2);let done=1',['first','second']]
];
for(const [name,source,names,standard]of fixtures)test(name+(standard?' keeps native standards and original exported roundtrips':' agrees with original PXT and complete roundtrips'),async t=>{
 const observed=await runPxtArcade(source,{fakeClock:true});const original=standard || observed;const runs=[];
 if(standard)await t.test('selected original SDK do-while continue preserves the posttest boundary',{todo:'Pinned SDK compiler jumps continue to body, skipping posttest; bounded original discrepancy retained — see docs/ARCADE-888-OPEN-FAILURES.md'},()=>assert.deepEqual(Object.fromEntries(names.map(n=>[n,observed[n]])),standard));
 const check=run=>{for(const n of names)assert.equal(values(run)[n],original[n],n);assert.equal(values(run).done,1);assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);};
 const timed=name==='overlapping function exit cells';
 const execute=async imported=>{assert.deepEqual(imported.unsupported,[]);const run=timed?await runTimedArcadeProgram(imported.code,{milliseconds:200,storage:true}):await runProgram(imported.code,{frames:50,storage:true});runs.push(run);check(run);return run;};
 try{
  const imported=arcadeToPseudocode(source),run=await execute(imported);
  const generated=new Set([...imported.code.matchAll(/arcade set local (__bwLoopExit\d+)/g)].map(m=>m[1]));const flags=run.creator.project.targets.flatMap(t=>t.variables?Object.values(t.variables):[]).filter(v=>generated.has(v[0]));assert.deepEqual(flags,[],'exit flags never become shared Scratch variables');
  await execute({...imported,code:run.creator.decompile()});
  const exported=projectToArcade(run.creator.project);assert.deepEqual(exported.unsupported,[]);
  const emitted=await runPxtArcade(exported.files,{fakeClock:true});for(const n of names)assert.equal(emitted[n],original[n],n+' exported');
  await execute(arcadeToPseudocode(exported.files));
  run.vm.stopAll();const saved=Buffer.from(await(await run.vm.saveProjectSb3()).arrayBuffer());await run.vm.loadProject(saved);if(timed)await restartTimedArcadeRun(run,200);else{run.vm.greenFlag();await stepFrames(run.vm,50);}check(run);
 }finally{for(const run of runs)run.vm.quit();clearStrayTimers();}
});
test('unimplemented switch fallthrough remains explicit',()=>assert.match(arcadeToPseudocode('for(let i=0;i<4;i++){switch(i){case 0:continue;case 1:i++;case 2:break;}}').unsupported.join('\n'),/falls through/));

test('a fresh VM recreates recursive exit cells from the saved SB3',async()=>{
 const [,source,names]=fixtures.find(([name])=>name==='recursive function exit cells');
 const expected=await runPxtArcade(source,{fakeClock:true});const imported=arcadeToPseudocode(source);assert.deepEqual(imported.unsupported,[]);const runs=[];
 try{
  const authored=await runProgram(imported.code,{frames:50,storage:true});runs.push(authored);
  const saved=Buffer.from(await(await authored.vm.saveProjectSb3()).arrayBuffer());authored.vm.stopAll();
  const fresh=await runProgram('SPRITE Placeholder:\nWHEN flag clicked:\n  hide',{frames:0,storage:true});runs.push(fresh);fresh.vm.stopAll();await fresh.vm.loadProject(saved);fresh.vm.greenFlag();await stepFrames(fresh.vm,50);
  for(const name of names)assert.equal(values(fresh)[name],expected[name],name);assert.equal(values(fresh).done,1);assert.deepEqual(fresh.errors,[]);
 }finally{for(const run of runs)run.vm.quit();clearStrayTimers();}
});

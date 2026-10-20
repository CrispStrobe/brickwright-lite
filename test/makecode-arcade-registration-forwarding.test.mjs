import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {runProgram,stepFrames,clearStrayTimers} from './helpers/bw-vm.mjs';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';

const source=`let pressed=0;let overlaps=0;
function onA(handler:()=>void){controller.A.onEvent(ControllerButtonEvent.Pressed,handler)}
function onGoal(handler:()=>void){if(!handler)return;sprites.onOverlap(SpriteKind.Player,SpriteKind.Enemy,function(first,second){first.destroy();handler()})}
function keyHandler(){pressed+=1;pause(20);pressed+=1}
onA(keyHandler);onGoal(function(){overlaps+=1});
let first=sprites.create(img\`1\`,SpriteKind.Player);let second=sprites.create(img\`2\`,SpriteKind.Enemy);
let ready=1;ready+=0;`;
const values=run=>Object.fromEntries(run.vm.runtime.targets.flatMap(t=>Object.values(t.variables)).map(v=>[v.name.replace(/^Game_/,''),v.value]));

test('known callable registration retains button yield and overlap lifetime across Code, export and fresh SB3',async()=>{
 const actions={afterGlobals:{ready:1},steps:[{delay:40,button:5,held:true},{delay:80,button:5,held:false}]};
 const original=await runPxtArcade(source,{fakeClock:true,buttonActions:actions,waitForGlobals:{pressed:2,overlaps:1}});
 assert.equal(original.pressed,2);assert.equal(original.overlaps,1);
 const runs=[];
 const check=run=>{const observed=values(run);for(const name of ['pressed','overlaps','ready'])assert.equal(observed[name],original[name],name);assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);};
 const drive=async run=>{
  let now=0;run.vm.stopAll();run.vm.runtime.bwArcadeProgramClock={now:()=>now};
  run.vm.runtime.updateCurrentMSecs=()=>{run.vm.runtime.currentMSecs=now;};run.vm.runtime.currentMSecs=0;run.vm.greenFlag();
  for(let i=0;i<3;i++){now=i*20;await stepFrames(run.vm,1,i?20:0);}
  run.vm.postIOData('keyboard',{key:' ',isDown:true});
  for(let i=3;i<10;i++){now=i*20;await stepFrames(run.vm,1,20);}
  run.vm.postIOData('keyboard',{key:' ',isDown:false});check(run);
 };
 const execute=async imported=>{assert.deepEqual(imported.unsupported,[]);assert.deepEqual(imported.warnings,[]);const run=await runProgram(imported.code,{frames:0,uploads:imported.costumes,storage:true});runs.push(run);await drive(run);return run;};
 try{
  const imported=arcadeToPseudocode(source),run=await execute(imported);
  await execute({...imported,code:run.creator.decompile()});
  const fresh=await runProgram('SPRITE Placeholder:\nWHEN flag clicked:\n  hide',{frames:0,storage:true});runs.push(fresh);fresh.vm.stopAll();await fresh.vm.loadProject(Buffer.from(await(await run.vm.saveProjectSb3()).arrayBuffer()));await drive(fresh);
  const out=projectToArcade(run.creator.project,{costumeSvg:(target,costume)=>run.creator.assets.get(costume.assetId)?.data});assert.deepEqual(out.unsupported,[]);
  const prefix=/let Game_ready\b/.test(out.ts)?'Game_':'';
  const exported=await runPxtArcade(out.files,{fakeClock:true,buttonActions:{...actions,afterGlobals:{[prefix+'ready']:1}},waitForGlobals:{[prefix+'pressed']:2,[prefix+'overlaps']:1}});
  for(const name of ['pressed','overlaps','ready'])assert.equal(exported[prefix+name],original[name],name+' original export');
  await execute(arcadeToPseudocode(out.files));
 }finally{for(const run of runs)run.vm.quit();clearStrayTimers();}
});

test('stored or shadowed callback values still require actual closure support',()=>{
 for(const body of ['let callback:any=0;function onA(handler:()=>void){controller.A.onEvent(ControllerButtonEvent.Pressed,handler)};onA(callback)',
  'function save(handler:()=>void){let stored=handler};save(function(){})']){
  assert.ok(arcadeToPseudocode(body).unsupported.length>0);
 }
});

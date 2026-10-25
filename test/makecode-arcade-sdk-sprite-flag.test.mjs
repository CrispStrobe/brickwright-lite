import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {runProgram,clearStrayTimers} from './helpers/bw-vm.mjs';
import {runTimedArcadeProgram,restartTimedArcadeRun} from './helpers/arcade-timed-native.mjs';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';
import BW from '../overlay/scratch-vm/src/util/bw-values.js';
const cases={
  "virtual": "let trace=\"\";class Actor extends sprites.ExtendableSprite{constructor(art:Image){super(art,SpriteKind.Player);this.setFlag(SpriteFlag.Ghost,true)}setFlag(flag:number,on:boolean){trace=trace+\"V\";super.setFlag(flag,on)}}let actor=new Actor(img`1`);let initial=actor.flags;actor.setFlag(SpriteFlag.Ghost,false);let cleared=actor.flags;actor.x=-20;actor.setFlag(SpriteFlag.StayInScreen,true);let beforePhysics=actor.x;actor.setFlag(SpriteFlag.Ghost|SpriteFlag.RelativeToCamera,true);let combined=actor.flags;actor.setFlag(SpriteFlag.Ghost,false);let remaining=actor.flags;let same=sprites.allOfKind(SpriteKind.Player)[0]===actor;let imageSame=actor.image===actor.image;pause(20);let afterPhysics=actor.x;trace=trace+\"\";initial+=0;cleared+=0;beforePhysics+=0;combined+=0;remaining+=0;afterPhysics+=0;",
  "scene": "class Actor extends sprites.ExtendableSprite{constructor(art:Image){super(art,SpriteKind.Player)}}let first=new Actor(img`1`);let firstId=first.id;game.pushScene();let second=new Actor(img`1`);let secondId=second.id;first.setFlag(SpriteFlag.Ghost,true);let oldFlags=first.flags;let currentFlags=second.flags;let currentSame=sprites.allOfKind(SpriteKind.Player)[0]===second;game.popScene();let oldSame=sprites.allOfKind(SpriteKind.Player)[0]===first;second.setFlag(SpriteFlag.RelativeToCamera,true);let poppedFlags=second.flags;let restoredFlags=first.flags;firstId+=0;secondId+=0;oldFlags+=0;currentFlags+=0;poppedFlags+=0;restoredFlags+=0;"
};
// Values observed once in the selected original SDK, including complete masks.
const expected={
  "virtual": {
    "trace": "VVVVV",
    "initial": 7168,
    "cleared": 0,
    "beforePhysics": -20,
    "combined": 7688,
    "remaining": 520,
    "same": true,
    "imageSame": true,
    "afterPhysics": -20
  },
  "scene": {
    "firstId": 0,
    "secondId": 0,
    "oldFlags": 7168,
    "currentFlags": 0,
    "currentSame": true,
    "oldSame": true,
    "poppedFlags": 512,
    "restoredFlags": 7168
  }
};
const variables=run=>Object.fromEntries(run.vm.runtime.targets.flatMap(target=>Object.values(target.variables)).map(value=>[value.name.replace(/^Game_/,'').replace(/^x_$/,'x'),BW.decode(value.value)]));
for(const[name,source]of Object.entries(cases))test('SDK Sprite.setFlag '+name+' preserves flags and all authoring routes',async()=>{
 const want=expected[name],runs=[];
 const check=run=>{assert.deepEqual(run.errors,[]);const observed=variables(run);for(const[key,value]of Object.entries(want))assert.equal(observed[key],value,key);};
 const execute=async imported=>{assert.deepEqual(imported.unsupported,[]);assert.deepEqual(imported.warnings,[]);const run=await runTimedArcadeProgram(imported.code,{milliseconds:240,storage:true,uploads:imported.costumes||[]});runs.push(run);assert.deepEqual(run.creator.warnings,[]);check(run);return run;};
 try{
  const imported=arcadeToPseudocode(source),run=await execute(imported);
  await execute({...imported,code:run.creator.decompile()});
  const exported=projectToArcade(run.creator.project,{costumeSvg:(_target,costume)=>run.creator.assets.get(costume.assetId)?.data});assert.deepEqual(exported.unsupported,[]);assert.deepEqual(exported.warnings,[]);assert.match(exported.ts,/setFlag\(/);
  const original=await runPxtArcade(exported.files,{fakeClock:true});for(const[key,value]of Object.entries(want))assert.equal(original[key]??original['Game_'+key],value,key+' original export');
  await execute(arcadeToPseudocode(exported.files));
  const saved=Buffer.from(await(await run.vm.saveProjectSb3()).arrayBuffer());
  run.vm.stopAll();await run.vm.loadProject(saved);await restartTimedArcadeRun(run,240);check(run);
  const fresh=await runProgram('SPRITE Placeholder:\nWHEN flag clicked:\n  hide',{frames:0,storage:true,frameAuthority:'timed'});runs.push(fresh);fresh.vm.stopAll();await fresh.vm.loadProject(saved);await restartTimedArcadeRun(fresh,240);check(fresh);
 }finally{runs.forEach(run=>run.vm.quit());clearStrayTimers();}
});

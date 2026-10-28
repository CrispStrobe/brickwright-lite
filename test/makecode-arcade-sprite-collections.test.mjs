import {runTimedArcadeProgram, restartTimedArcadeRun} from './helpers/arcade-timed-native.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {runProgram,stepFrames} from './helpers/bw-vm.mjs';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';
const vars=run=>Object.fromEntries(run.vm.runtime.targets.flatMap(t=>Object.values(t.variables)).map(v=>[v.name.replace(/^Game_/,''),v.value]));

test('allOfKind snapshots preserve sprite identity, kind changes and destroyed references through executable roundtrips', {todo:"Array export authority cannot yet prove the Array receiver \u2014 see docs/ARCADE-888-OPEN-FAILURES.md"},async()=>{
    const source=`let first=sprites.create(img\`2\`,SpriteKind.Player)
let second=sprites.create(img\`7\`,SpriteKind.Player)
let food=sprites.create(img\`5\`,SpriteKind.Food)
let actors=sprites.allOfKind(SpriteKind.Player)
let alias=actors
let another=sprites.allOfKind(SpriteKind.Player)
let sameArray=actors===alias
let freshArray=actors!==another
let sameSprite=actors[0]===first
let countBefore=actors.length
let noEnemies=sprites.allOfKind(SpriteKind.Enemy).length
function steer(items:Sprite[]){for(let actor of items){actor.x+=10};return items}
let returned=steer(actors)
let sameReturn=returned===actors
let firstMoved=first.x
let secondMoved=second.x
first.setKind(SpriteKind.Food)
let playersAfterKind=sprites.allOfKind(SpriteKind.Player).length
let foodAfterKind=sprites.allOfKind(SpriteKind.Food).length
first.setKind(SpriteKind.Food)
second.destroy()
let playersAfterDestroy=sprites.allOfKind(SpriteKind.Player).length
let retainedCount=actors.length
actors[1].setPosition(30,40)
let retainedX=second.x
let retainedY=second.y
let retainedIdentity=actors[1]===second
alias.removeAt(0)
let mutatedCount=actors.length
let independentCount=another.length
let currentFood=sprites.allOfKind(SpriteKind.Food)
let foodIdentity=currentFood.indexOf(first)
let otherFoodIdentity=currentFood.indexOf(food)`;
    const expected=await runPxtArcade(source);
    const names=['sameArray','freshArray','sameSprite','countBefore','noEnemies','sameReturn','firstMoved','secondMoved','playersAfterKind','foodAfterKind','playersAfterDestroy','retainedCount','retainedX','retainedY','retainedIdentity','mutatedCount','independentCount','foodIdentity','otherFoodIdentity'];
    assert.equal(expected.countBefore,2);assert.equal(expected.playersAfterDestroy,0);assert.equal(expected.retainedCount,2);assert.equal(expected.independentCount,2);
    const check=run=>{const actual=vars(run);for(const name of names)assert.equal(actual[name],expected[name],name);assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);};
    const execute=async imported=>{assert.deepEqual(imported.unsupported,[]);const run=await runTimedArcadeProgram(imported.code,{milliseconds:200,uploads:imported.costumes,storage:true});check(run);return run;};
    const imported=arcadeToPseudocode(source),run=await execute(imported);
    assert.ok(run.creator.project.targets.some(t=>Object.values(t.blocks).some(b=>b.opcode==='arcade_spritesOfKind')));
    await execute({...imported,code:run.creator.decompile()});
    const exportProject=run=>projectToArcade(run.creator.project,{costumeSvg:(t,c)=>run.creator.assets.get(c.assetId)?.data});
    const exported=exportProject(run);assert.deepEqual(exported.unsupported,[]);assert.match(exported.ts,/: Sprite\[\]/);
    const pxt=await runPxtArcade(exported.ts);for(const name of names)assert.equal(pxt[name],expected[name],name+' in exported PXT');
    const again=await execute(arcadeToPseudocode(exported.ts));
    const secondExport=exportProject(again);assert.deepEqual(secondExport.unsupported,[]);
    const twice=await runPxtArcade(secondExport.ts);for(const name of names)assert.equal(twice[name],expected[name],name+' after second PXT export');
    const old=vars(run).actors;
    await run.vm.loadProject(Buffer.from(await(await run.vm.saveProjectSb3()).arrayBuffer()));await restartTimedArcadeRun(run,200);check(run);
    assert.notEqual(vars(run).actors,old,'restarted project has a fresh reference scope');
});


test('fixed kind aliases retain actual sprite identity for queries and destruction',async()=>{
    const imported=arcadeToPseudocode(`let kind=0
let hero=sprites.create(img\`2\`,SpriteKind.Player)
let enemy=sprites.create(img\`7\`,SpriteKind.Enemy)
hero.setKind(kind)
let players=sprites.allOfKind(kind)
let before=players.length
let same=players[0]===hero
sprites.destroyAllSpritesOfKind(kind)
let after=sprites.allOfKind(kind).length
let enemies=sprites.allOfKind(SpriteKind.Enemy).length`);
    assert.deepEqual(imported.unsupported,[]);
    const run=await runProgram(imported.code,{frames:10,uploads:imported.costumes,storage:true});
    try {assert.deepEqual([vars(run).before,vars(run).same,vars(run).after,vars(run).enemies],[1,true,0,1]);assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);}
    finally {run.vm.stopAll();run.vm.quit();}
});

test('unknown sprite-kind producers remain named diagnostics',()=>{
    const imported=arcadeToPseudocode('let kind=unknown()\nlet actors=sprites.allOfKind(kind)');
    assert.ok(imported.unsupported.some(reason=>reason.includes('unknown')));
});


const destroySnapshotSource=`namespace SpriteKind { export const Custom=SpriteKind.create() }
let callbacks=0
let positions=0
let __bwDestroyKindSprite1=73
sprites.onDestroyed(SpriteKind.Custom,function(sprite){
    callbacks+=1
    positions+=sprite.x
    let replacement=sprites.create(img\`7\`,SpriteKind.Custom)
    replacement.setPosition(90,60)
})
let first=sprites.create(img\`2\`,SpriteKind.Custom)
first.setPosition(10,60)
let second=sprites.create(img\`3\`,SpriteKind.Custom)
second.setPosition(20,60)
let player=sprites.create(img\`5\`,SpriteKind.Player)
let retained=sprites.allOfKind(SpriteKind.Custom)
sprites.destroyAllSpritesOfKind(SpriteKind.Custom)
pause(100)
let survivors=sprites.allOfKind(SpriteKind.Custom).length
let players=sprites.allOfKind(SpriteKind.Player).length
let retainedCount=retained.length
let retainedIdentity=retained[0]===first
let retainedX=first.x
first.destroy()
second.destroy()
sprites.destroyAllSpritesOfKind(SpriteKind.Food)
let protectedValue=__bwDestroyKindSprite1
let finished=1`;

test('destroyAllSpritesOfKind removes a snapshot, preserving callbacks, other kinds and retained handles across roundtrips',async()=>{
    const source=destroySnapshotSource;
    const expected=await runPxtArcade(source,{waitForGlobals:{protectedValue:73}});
    assert.equal(expected.callbacks,2);assert.equal(expected.positions,30);
    assert.equal(expected.survivors,2);assert.equal(expected.players,1);
    const names=['callbacks','positions','survivors','players','retainedCount','retainedIdentity','retainedX','protectedValue'];
    const check=run=>{const actual=vars(run);for(const name of names)assert.equal(actual[name],expected[name],name);assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);};
    const execute=async imported=>{assert.deepEqual(imported.unsupported,[]);const run=await runTimedArcadeProgram(imported.code,{milliseconds:200,uploads:imported.costumes,storage:true});check(run);return run;};
    const imported=arcadeToPseudocode(source),run=await execute(imported);
    const opcodes=new Set(run.creator.project.targets.flatMap(t=>Object.values(t.blocks).map(b=>b.opcode)));
    assert.ok(opcodes.has('arcade_spritesOfKind'));assert.ok(opcodes.has('arcade_destroySprite'));
    await execute({...imported,code:run.creator.decompile()});
    const exported=projectToArcade(run.creator.project,{costumeSvg:(t,c)=>run.creator.assets.get(c.assetId)?.data});
    assert.deepEqual(exported.unsupported,[]);
    const original=await runPxtArcade(exported.ts,{waitForGlobals:{protectedValue:73}});
    for(const name of names)assert.equal(original[name],expected[name],name+' in exported PXT');
    await execute(arcadeToPseudocode(exported.ts));
    await run.vm.loadProject(Buffer.from(await(await run.vm.saveProjectSb3()).arrayBuffer()));
    await restartTimedArcadeRun(run,200);check(run);
});

test('destroyAllSpritesOfKind rejects unknown producers, effects and duration explicitly',()=>{
    for(const call of ['sprites.destroyAllSpritesOfKind(kind)','sprites.destroyAllSpritesOfKind(SpriteKind.Enemy,effects.fire)','sprites.destroyAllSpritesOfKind(SpriteKind.Enemy,effects.fire,100)']){
        const imported=arcadeToPseudocode((call.endsWith('(kind)')?'let kind=unknown()\n':'')+call);
        assert.ok(imported.unsupported.some(reason=>reason.includes(call.endsWith('(kind)')?'unknown':'sprites.destroyAllSpritesOfKind')),call);
    }
});

test('destroyAllSpritesOfKind on an empty scene is an executable no-op',async()=>{
    const imported=arcadeToPseudocode('sprites.destroyAllSpritesOfKind(SpriteKind.Enemy)\nlet finished=1');
    assert.deepEqual(imported.unsupported,[]);
    const run=await runProgram(imported.code,{frames:10,uploads:imported.costumes,storage:true});
    assert.equal(vars(run).finished,1);assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);
});


test('native snapshot destruction finishes actual pauses across editable and saved routes',async()=>{
 const imported=arcadeToPseudocode(destroySnapshotSource);assert.deepEqual(imported.unsupported,[]);const runs=[];
 const expected={callbacks:2,positions:30,survivors:2,players:1,retainedCount:2,retainedIdentity:true,retainedX:10,protectedValue:73,finished:1};
 const check=run=>{const actual=vars(run);for(const [name,value] of Object.entries(expected))assert.equal(actual[name],value,name);assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);};
 try {
  const execute=async input=>{assert.deepEqual(input.unsupported,[]);const run=await runTimedArcadeProgram(input.code,{milliseconds:200,uploads:input.costumes,storage:true});runs.push(run);check(run);return run;};
  const run=await execute(imported);await execute({...imported,code:run.creator.decompile()});
  const out=projectToArcade(run.creator.project,{costumeSvg:(t,c)=>run.creator.assets.get(c.assetId)?.data});assert.deepEqual(out.unsupported,[]);await execute(arcadeToPseudocode(out.files));
  await run.vm.loadProject(Buffer.from(await(await run.vm.saveProjectSb3()).arrayBuffer()));await restartTimedArcadeRun(run,200);check(run);
 } finally {for(const run of runs){run.vm.stopAll();run.vm.quit();}}
});

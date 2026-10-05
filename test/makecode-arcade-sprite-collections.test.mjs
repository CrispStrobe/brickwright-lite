import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
// Task E1 keeps the import half of these round trips; the export half (projectToArcade, then compiling or running the exported TypeScript in PXT, then re-importing it) returns with task E2 (docs/OPEN-TASKS-2026-09-29.md).
import {runProgram,stepFrames} from './helpers/bw-vm.mjs';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';
const vars=run=>Object.fromEntries(run.vm.runtime.targets.flatMap(t=>Object.values(t.variables)).map(v=>[v.name.replace(/^Game_/,''),v.value]));

test('allOfKind snapshots preserve sprite identity, kind changes and destroyed references through executable roundtrips',async()=>{
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
    const execute=async imported=>{assert.deepEqual(imported.unsupported,[]);const run=await runProgram(imported.code,{frames:100,uploads:imported.costumes,storage:true});check(run);return run;};
    const imported=arcadeToPseudocode(source),run=await execute(imported);
    assert.ok(run.creator.project.targets.some(t=>Object.values(t.blocks).some(b=>b.opcode==='arcade_spritesOfKind')));
    await execute({...imported,code:run.creator.decompile()});
    const old=vars(run).actors;
    await run.vm.loadProject(Buffer.from(await(await run.vm.saveProjectSb3()).arrayBuffer()));run.vm.greenFlag();await stepFrames(run.vm,100);check(run);
    assert.notEqual(vars(run).actors,old,'restarted project has a fresh reference scope');
});


test('unsupported dynamic sprite-kind queries remain named diagnostics',()=>{
    const imported=arcadeToPseudocode(`let kind=0
let actors=sprites.allOfKind(kind)`);
    assert.ok(imported.unsupported.some(reason=>reason.includes('sprites.allOfKind')));
});

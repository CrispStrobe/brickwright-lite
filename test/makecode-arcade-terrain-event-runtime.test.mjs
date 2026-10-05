import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {runProgram,stepFrames} from './helpers/bw-vm.mjs';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';
import {TERRAIN_MAP} from './fixtures/arcade-terrain.mjs';
const vars=run=>Object.fromEntries(run.vm.runtime.targets.flatMap(t=>Object.values(t.variables)).map(v=>[v.name.replace(/^Game_/,''),v.value]));
async function execute(source,names){
    const expected=await runPxtArcade(source);
    const imported=arcadeToPseudocode(source);
    for(const reason of imported.unsupported)assert.match(reason,/terrain collision physics|terrain event callbacks require verified/);
    const run=await runProgram(imported.code,{frames:160,uploads:imported.costumes,storage:true}),actual=vars(run);
    for(const name of names)assert.equal(actual[name],expected[name],name);
    assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);return run;
}
test('wall handler lists retain registration order and matching-kind snapshot when a callback changes kind',async()=>{
    await execute(`${TERRAIN_MAP}
let hero=sprites.create(img\`5 5
5 5\`,SpriteKind.Player)
hero.setPosition(30,12)
let order=""
let oldKindSecond=false
let retainedVelocity=0
scene.onHitWall(SpriteKind.Player,function(sprite:Sprite,location:tiles.Location){order+="A";sprite.setKind(SpriteKind.Food);sprite.vx=-60})
scene.onHitWall(SpriteKind.Player,function(sprite:Sprite,location:tiles.Location){order+="B";oldKindSecond=sprite.vx===-60})
scene.onHitWall(SpriteKind.Food,function(sprite:Sprite,location:tiles.Location){order+="C"})
hero.vx=60
hero.x=32
retainedVelocity=hero.vx
let orderAtReturn=order
let done=order==="AB"`,['orderAtReturn','oldKindSecond','retainedVelocity','done']);
});
test('wall callbacks mutate map and flags before default velocity response, and destruction retains the handler snapshot',async()=>{
    await execute(`${TERRAIN_MAP}
let hero=sprites.create(img\`5 5
5 5\`,SpriteKind.Player)
hero.setPosition(30,12)
let order=""
let sawOpenWall=false
scene.onHitWall(SpriteKind.Player,function(sprite:Sprite,location:tiles.Location){order+="A";tiles.setWallAt(location,false);sprite.setFlag(SpriteFlag.GhostThroughWalls,true)})
scene.onHitWall(SpriteKind.Player,function(sprite:Sprite,location:tiles.Location){order+="B";sawOpenWall=!tiles.tileAtLocationIsWall(location)})
hero.vx=60
hero.x=32
let retainedVelocity=hero.vx
let victim=sprites.create(img\`5 5
5 5\`,SpriteKind.Enemy)
victim.setPosition(30,20)
let destroyedOrder=""
scene.onHitWall(SpriteKind.Enemy,function(sprite:Sprite,location:tiles.Location){destroyedOrder+="C";sprite.destroy()})
scene.onHitWall(SpriteKind.Enemy,function(sprite:Sprite,location:tiles.Location){destroyedOrder+="D"})
victim.x=32
let deadCount=sprites.allOfKind(SpriteKind.Enemy).length`,['order','sawOpenWall','retainedVelocity','destroyedOrder','deadCount']);
});
test('a yielding wall callback holds its explicit movement caller until completion',async()=>{
    await execute(`${TERRAIN_MAP}
let hero=sprites.create(img\`5 5
5 5\`,SpriteKind.Player)
hero.setPosition(30,12)
let order=""
let completed=false
scene.onHitWall(SpriteKind.Player,function(sprite:Sprite,location:tiles.Location){order+="A";sprite.vx=-40;pause(30);completed=true;order+="B"})
hero.vx=60
hero.x=32
order+="C"
let orderAtReturn=order
let callerSawCompletion=completed
let finalVelocity=hero.vx`,['orderAtReturn','callerSawCompletion','finalVelocity']);
});
test('stopping a project cancels a suspended physics frame before its callback can resume',async()=>{
    const source=`${TERRAIN_MAP}
let hero=sprites.create(img\`5 5
5 5\`,SpriteKind.Player)
hero.setPosition(30,12)
let entered=false
let enteredCount=0
let resumed=false
scene.onHitWall(SpriteKind.Player,function(sprite:Sprite,location:tiles.Location){entered=true;enteredCount++;pause(1000000);resumed=true})
hero.vx=60`;
    const imported=arcadeToPseudocode(source),run=await runProgram(imported.code,{frames:25,uploads:imported.costumes,storage:true});
    assert.equal(vars(run).entered,true);assert.equal(vars(run).resumed,false);
    const count=vars(run).enteredCount;run.vm.stopAll();await stepFrames(run.vm,10);assert.equal(vars(run).resumed,false);assert.equal(vars(run).enteredCount,count,'stop must not create another physics callback on later frames');assert.deepEqual(run.errors,[]);
});


test('two captured cells retain later updates and mutations across repeated wall callbacks',async()=>{
    await execute(`${TERRAIN_MAP}
let hero=sprites.create(img\`5 5
5 5\`,SpriteKind.Player)
hero.setPosition(30,12)
let order=""
let total=0
function install(amount:number,tag:string){
    let counter=amount
    let label=tag
    scene.onHitWall(SpriteKind.Player,function(sprite:Sprite,location:tiles.Location){counter++;order+=label;total+=counter;sprite.vx=0})
    counter+=10
    label+="!"
}
install(1,"A")
hero.vx=60
hero.x=32
hero.setPosition(30,12)
hero.vx=60
hero.x=32
let done=total===25`,['order','total','done']);
});
test('explicit yielding callbacks can overlap a frame callback, as the original scheduler permits',async()=>{
    // Original pinned probes with 30/200/500ms waits all reached maxActive=2.
    // Whether one or both B completions precede caller C depends on cadence;
    // compare concurrent calls and caller completion rather than that timing.
    const source=`${TERRAIN_MAP}
let hero=sprites.create(img\`5 5
5 5\`,SpriteKind.Player)
hero.setPosition(30,12)
let calls=0
let active=0
let maxActive=0
let completed=false
scene.onHitWall(SpriteKind.Player,function(sprite:Sprite,location:tiles.Location){calls++;active++;maxActive=Math.max(maxActive,active);pause(200);sprite.vx=-40;active--;completed=true})
hero.vx=60
hero.x=32
let callerSawCompletion=completed
let finalVelocity=hero.vx`;
    const expected=await runPxtArcade(source),imported=arcadeToPseudocode(source);
    const run=await runProgram(imported.code,{frames:0,uploads:imported.costumes,storage:true});
    // Drive the real VM scheduler at its ordinary cadence for the real wait.
    run.vm.start();await new Promise(resolve=>setTimeout(resolve,700));run.vm.quit();
    assert.equal(expected.maxActive,2);assert.equal(vars(run).maxActive,expected.maxActive);
    assert.equal(vars(run).callerSawCompletion,expected.callerSawCompletion);assert.equal(vars(run).finalVelocity,expected.finalVelocity);
    assert.deepEqual(run.errors,[]);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {runProgram,stepFrames} from './helpers/bw-vm.mjs';
import {compile} from '../scripts/lib/pxt-node.mjs';
const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-8,`${actual} != ${expected}`);
const sprites=run=>Object.values(run.vm.runtime.bwArcadeDeviceState.sprites);
async function execute(source){
    const imported=arcadeToPseudocode(source);assert.deepEqual(imported.unsupported,[]);
    const run=await runProgram(imported.code,{frames:3,uploads:imported.costumes,storage:true});
    assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);run.imported=imported;return run;
}
async function roundtrip(source,exercise){
    const run=await execute(source);await exercise(run);
    const code=await runProgram(run.creator.decompile(),{frames:3,uploads:run.imported.costumes,storage:true});assert.deepEqual(code.creator.warnings,[]);await exercise(code);
    const exported=projectToArcade(run.creator.project,{costumeSvg:(t,c)=>run.creator.assets.get(c.assetId)?.data});assert.deepEqual(exported.unsupported,[]);
    const built=await compile('arcade',exported.files);assert.equal(built.success,true,JSON.stringify(built.diagnostics));await exercise(await execute(exported.ts));
    const saved=await run.vm.saveProjectSb3();await run.vm.loadProject(Buffer.from(await saved.arrayBuffer()));run.vm.greenFlag();await stepFrames(run.vm,3);await exercise(run);
    return exported;
}

test('controller bindings retain zero axes, normalize diagonals and stop on release',async()=>{
    const source=`let first=sprites.create(img\`1\`,SpriteKind.Player)
let second=sprites.create(img\`2\`,SpriteKind.Food)
first.setPosition(30,30)
second.setPosition(80,30)
first.vy=30
controller.moveSprite(first,100,0)
controller.moveSprite(second)
controller.B.onEvent(ControllerButtonEvent.Pressed,function(){controller.moveSprite(first,30,0)})`;
    const exported=await roundtrip(source,async run=>{
        const [first,second]=sprites(run);assert.equal(first.controller.vy,0);assert.equal(second.controller.vy,100);
        // The pinned PXT ArcadePhysicsEngine (game/physics.ts) moves each frame by
        // Fx.idiv(Fx.imul(vx + oldVx, Math.idiv(dtMs, 2)), 1000) in 24.8 fixed point.
        // A VM frame is 1/30 s (dtMs 33.3, so 16 per half step): three frames move
        // 3 * 819/256 straight (vx 100) and 3 * 579/256 diagonal (vx 181*100/256).
        // (The WIP recorded 9.99609375 and 7.06640625 from the real-time simulator,
        // whose frame times vary.)
        const pxtFrames=(vx,frames)=>frames*Math.trunc(Math.trunc(Math.round(vx*256)*2*16)/1000)/256;
        assert.equal(pxtFrames(100,3),9.59765625);assert.equal(pxtFrames(181*100/256,3),6.78515625);
        const before={x:first.x,y:first.y,x2:second.x,y2:second.y};
        run.vm.postIOData('keyboard',{key:'ArrowRight',isDown:true});run.vm.postIOData('keyboard',{key:'ArrowDown',isDown:true});await stepFrames(run.vm,3);
        assert.equal(first.vx,100);assert.equal(first.vy,30);near(first.x-before.x,pxtFrames(100,3));near(first.y-before.y,pxtFrames(30,3));
        assert.equal(second.vx,181*100/256);assert.equal(second.vy,181*100/256);near(second.x-before.x2,pxtFrames(181*100/256,3));near(second.y-before.y2,pxtFrames(181*100/256,3));
        run.vm.postIOData('keyboard',{key:'ArrowRight',isDown:false});run.vm.postIOData('keyboard',{key:'ArrowDown',isDown:false});await stepFrames(run.vm,1);
        assert.equal(first.vx,0);assert.equal(first.vy,30);assert.equal(second.vx,0);assert.equal(second.vy,0);
        run.vm.postIOData('keyboard',{key:'z',isDown:true});await stepFrames(run.vm,3);run.vm.postIOData('keyboard',{key:'z',isDown:false});
        assert.equal(first.controller.vx,30);run.vm.postIOData('keyboard',{key:'ArrowRight',isDown:true});await stepFrames(run.vm,2);assert.equal(first.vx,30);
        run.vm.postIOData('keyboard',{key:'ArrowRight',isDown:false});await stepFrames(run.vm,1);
    });
    assert.match(exported.ts,/controller\.moveSprite\(first, 100, 0\)/);assert.match(exported.ts,/controller\.moveSprite\(second, 100, 100\)/);
});

test('a binding follows the sprite instance, supports dynamic speeds and disabling',async()=>{
    await roundtrip(`let hero:Sprite=null
controller.moveSprite(hero,100,100)
hero=sprites.create(img\`1\`,SpriteKind.Player)
let original=hero
let speed=60
controller.moveSprite(hero,speed,0)
hero=sprites.create(img\`2\`,SpriteKind.Food)
controller.A.onEvent(ControllerButtonEvent.Pressed,function(){controller.moveSprite(original,0,0)})`,async run=>{
        const [first,second]=sprites(run);assert.equal(first.controller.vx,60);assert.equal(second.controller,undefined);
        run.vm.postIOData('keyboard',{key:'ArrowLeft',isDown:true});await stepFrames(run.vm,2);assert.equal(first.vx,-60);assert.equal(second.vx,0);
        run.vm.postIOData('keyboard',{key:' ',isDown:true});await stepFrames(run.vm,2);run.vm.postIOData('keyboard',{key:' ',isDown:false});assert.equal(first.vx,0);assert.equal(first.controller.vx,0);
        run.vm.postIOData('keyboard',{key:'ArrowLeft',isDown:false});await stepFrames(run.vm,1);
    });
});

test('literal projectile callbacks and local destruction callbacks use native handles',async()=>{
    await roundtrip(`let origin=sprites.create(img\`11\`,SpriteKind.Player)
origin.setPosition(42,35)
let count=0
function launch(){let local=sprites.createProjectileFromSide(img\`22\`,0,0);local.onDestroyed(function(){count+=1});local.destroy()}
launch()
launch()
controller.A.onEvent(ControllerButtonEvent.Pressed,function(){let shot=sprites.createProjectileFromSprite(img\`33\`,origin,0,0);shot.lifespan=2000})
game.onUpdateInterval(1000,function(){let food=sprites.createProjectile(img\`44\`,0,0,SpriteKind.Food);food.setPosition(80,70)})`,async run=>{
        const count=run.vm.runtime.targets.flatMap(t=>Object.values(t.variables)).find(v=>v.name==='count');assert.equal(Number(count.value),2);
        run.vm.postIOData('keyboard',{key:' ',isDown:true});await stepFrames(run.vm,3);run.vm.postIOData('keyboard',{key:' ',isDown:false});
        const shot=sprites(run).find(s=>s.kind==='Projectile');assert.equal(shot.x,42);assert.equal(shot.y,35);assert.ok(shot.lifespan>1800);
        await stepFrames(run.vm,30);const food=sprites(run).find(s=>s.kind==='Food');assert.equal(food.x,80);assert.equal(food.y,70);
    });
});


test('projectile kind zero follows PXT defaulting and numeric builtins retain identity',async()=>{
    await roundtrip(`let zero=sprites.createProjectile(img\`1\`,0,0,0)
let player=sprites.createProjectile(img\`2\`,0,0,SpriteKind.Player)
let food=sprites.createProjectile(img\`3\`,0,0,2)
let enemy=sprites.createProjectile(img\`4\`,0,0,3)`,async run=>{
        assert.deepEqual(sprites(run).map(s=>s.kind),['Projectile','Projectile','Food','Enemy']);
    });
    const imported=arcadeToPseudocode(`let kind=4;let sprite=sprites.create(img\`1\`,kind)`);
    assert.ok(imported.unsupported.some(gap=>gap.includes('kind expression support')));
});

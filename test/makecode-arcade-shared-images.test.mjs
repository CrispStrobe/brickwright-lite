import test from 'node:test';
import assert from 'node:assert/strict';
import {runProgram, SB3Creator} from './helpers/bw-vm.mjs';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {compile} from '../scripts/lib/pxt-node.mjs';
const out = creator => projectToArcade(creator.project,{costumeSvg:(t,c)=>creator.assets.get(c.assetId)?.data});
const sprites = run => Object.values(run.vm.runtime.bwArcadeDeviceState.sprites);
async function execute(source) {
    const imported = arcadeToPseudocode(source); assert.deepEqual(imported.unsupported,[]);
    const run = await runProgram(imported.code,{frames:10,uploads:imported.costumes,storage:true});
    assert.deepEqual(run.creator.warnings,[]); assert.deepEqual(run.errors,[]); return run;
}
async function reexport(run) {
    const recreated = new SB3Creator(); recreated.parse(run.creator.decompile()); assert.deepEqual(recreated.warnings,[]);
    for(const c of run.creator.project.targets.flatMap(t=>t.costumes||[])) assert.ok(c.assetId);
    const exported = out(run.creator); assert.deepEqual(exported.unsupported,[]);
    const built=await compile('arcade',exported.files); assert.equal(built.success,true,JSON.stringify(built.diagnostics));
    return execute(exported.ts);
}

test('sprite image aliases share pixels and masks, survive owner destruction, and export as Image references', async () => {
    const source=`let hero = sprites.create(img\`1 2\`, SpriteKind.Player)
let foe = sprites.create(img\`3 4\`, SpriteKind.Enemy)
let saved = hero.image
let alias = saved
foe.setImage(alias)
hero.image.setPixel(0,0,0)
hero.image.replace(2,5)
hero.destroy()
let third = sprites.create(img\`7\`, SpriteKind.Food)
third.setImage(saved)
third.image.setPixel(1,0,8)`;
    const run=await execute(source);
    const state=sprites(run); assert.equal(state.length,2);
    assert.equal(state[0].image,state[1].image);
    assert.deepEqual([...state[0].image.pixels],[0,8]); assert.deepEqual([...state[0].mask],[0,1]);
    assert.equal(state[1].width,2); assert.equal(state[1].height,1);
    const rerun=await reexport(run); assert.equal(sprites(rerun)[0].image,sprites(rerun)[1].image);
    assert.deepEqual([...sprites(rerun)[1].image.pixels],[0,8]);
    const saved=await run.vm.saveProjectSb3();await run.vm.loadProject(Buffer.from(await saved.arrayBuffer()));
    run.vm.greenFlag();for(let i=0;i<10;i++)run.vm.runtime._step();
    assert.equal(sprites(run)[0].image,sprites(run)[1].image);
});

test('frame resources preserve edits across switches and share between different sprite templates', async () => {
    const source=`let __bwFrames_test = [img\`1 2\`, img\`3 4\`]
let hero = sprites.create(img\`1 2\`, SpriteKind.Player)
let foe = sprites.create(img\`5 6\`, SpriteKind.Enemy)
hero.setImage(__bwFrames_test[((Math.round(0)%2)+2)%2])
foe.setImage(__bwFrames_test[((Math.round(0)%2)+2)%2])
hero.image.fill(7)
hero.setImage(__bwFrames_test[((Math.round(1)%2)+2)%2])
hero.image.setPixel(1,0,8)
hero.setImage(__bwFrames_test[((Math.round(0)%2)+2)%2])
foe.image.setPixel(0,0,0)
controller.A.onEvent(ControllerButtonEvent.Pressed,function(){hero.setImage(__bwFrames_test[((Math.round(1)%2)+2)%2])})`;
    const run=await execute(source);assert.equal(sprites(run)[0].image,sprites(run)[1].image);
    assert.deepEqual([...sprites(run)[0].image.pixels],[0,7]);assert.deepEqual([...sprites(run)[1].mask],[0,1]);
    run.vm.postIOData('keyboard',{key:' ',isDown:true});for(let i=0;i<4;i++)run.vm.runtime._step();
    assert.deepEqual([...sprites(run)[0].image.pixels],[3,8]); assert.notEqual(sprites(run)[0].image,sprites(run)[1].image);
    const rerun=await reexport(run);assert.equal(sprites(rerun)[0].image,sprites(rerun)[1].image);
    assert.deepEqual([...sprites(rerun)[0].image.pixels],[0,7]);
});

test('equal literal image expressions remain separate resources when a shared sprite switches image', async () => {
    const run=await execute(`let hero=sprites.create(img\`1\`,SpriteKind.Player)
let foe=sprites.create(img\`1\`,SpriteKind.Enemy)
foe.setImage(hero.image)
hero.image.fill(7)
hero.setImage(img\`1\`)
hero.image.fill(2)`);
    assert.notEqual(sprites(run)[0].image,sprites(run)[1].image);
    assert.deepEqual(sprites(run).map(s=>[...s.image.pixels]),[[2],[7]]);
    const again=await reexport(run);assert.deepEqual(sprites(again).map(s=>[...s.image.pixels]),[[2],[7]]);
});

test('creation callbacks share images selected from the same random frame array', async () => {
    const run=await execute(`let frames = [img\`1 2\`]
sprites.onCreated(SpriteKind.Player,function(sprite){sprite.setImage(Math.pickRandom(frames));sprite.image.fill(7)})
sprites.create(img\`1 2\`,SpriteKind.Player)
sprites.create(img\`3 4\`,SpriteKind.Player)`);
    assert.equal(sprites(run).length,2);assert.equal(sprites(run)[0].image,sprites(run)[1].image);
    assert.deepEqual([...sprites(run)[1].image.pixels],[7,7]);
    const again=await reexport(run);assert.equal(sprites(again)[0].image,sprites(again)[1].image);
});

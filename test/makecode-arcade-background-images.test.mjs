import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {runProgram,stepFrames} from './helpers/bw-vm.mjs';
import {compile} from '../scripts/lib/pxt-node.mjs';
const vars=run=>Object.fromEntries(run.vm.runtime.targets.flatMap(t=>Object.values(t.variables)).map(v=>[v.name.replace(/^Game_/,''),v.value]));
async function execute(source,frames){
    const imported=arcadeToPseudocode(source);assert.deepEqual(imported.unsupported,[],JSON.stringify(imported.unsupported));
    const run=await runProgram(imported.code,{frames,uploads:imported.costumes,storage:true});assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);run.imported=imported;return run;
}
async function roundtrip(source,verify,frames=10){
    const run=await execute(source,frames);verify(run);
    const code=await runProgram(run.creator.decompile(),{frames,uploads:run.imported.costumes,storage:true});assert.deepEqual(code.errors,[]);assert.deepEqual(code.creator.warnings,[]);verify(code);
    const exported=projectToArcade(run.creator.project,{costumeSvg:(t,c)=>run.creator.assets.get(c.assetId)?.data});assert.deepEqual(exported.unsupported,[]);
    const built=await compile('arcade',exported.files);assert.equal(built.success,true,JSON.stringify({diagnostics:built.diagnostics,ts:exported.ts}));verify(await execute(exported.ts,frames));
    const saved=await run.vm.saveProjectSb3();await run.vm.loadProject(Buffer.from(await saved.arrayBuffer()));run.vm.greenFlag();await stepFrames(run.vm,frames);verify(run);return {run,exported};
}

test('background images share mutable resource identity with sprites and procedure results',async()=>{
    const source=`function getBackground(){return scene.backgroundImage()}
let picture=image.create(5,3)
picture.fill(7)
scene.setBackgroundColor(2)
scene.setBackgroundImage(picture)
let alias=getBackground()
let copy=alias.clone()
let hero=sprites.create(picture,SpriteKind.Player)
let other=sprites.create(copy,SpriteKind.Food)
alias.setPixel(0,0,2)
let width=scene.backgroundImage().width
let sample=hero.image.getPixel(0,0)`;
    const {exported}=await roundtrip(source,run=>{
        const state=run.vm.runtime.bwArcadeDeviceState,sprites=Object.values(state.sprites),v=vars(run);
        assert.equal(state.backgroundColor,2);assert.equal(state.backgroundImage,sprites[0].image);assert.notEqual(state.backgroundImage,sprites[1].image);
        assert.deepEqual([...state.backgroundImage.pixels],[2,...Array(14).fill(7)]);assert.deepEqual([...sprites[1].image.pixels],Array(15).fill(7));assert.equal(Number(v.width),5);assert.equal(Number(v.sample),2);
    });assert.match(exported.ts,/\): Image/);assert.match(exported.ts,/scene\.setBackgroundImage\(picture\)/);
});

test('literal backgrounds, clearing and lazy screen images retain exact pixels through export',async()=>{
    await roundtrip(`let hero=sprites.create(img\`1\`,SpriteKind.Player)
scene.setBackgroundImage(img\`7 .\n. 2\`)
let old=scene.backgroundImage()
scene.setBackgroundImage(null)
let fresh=scene.backgroundImage()
fresh.setPixel(159,119,5)
let width=fresh.width
let height=fresh.height
let oldSample=old.getPixel(1,1)
let newSample=fresh.getPixel(159,119)`,run=>{
        const state=run.vm.runtime.bwArcadeDeviceState,v=vars(run);
        assert.equal(state.backgroundImage.width,160);assert.equal(state.backgroundImage.height,120);assert.equal(state.backgroundImage.pixels.at(-1),5);
        assert.equal(Number(v.width),160);assert.equal(Number(v.height),120);assert.equal(Number(v.oldSample),2);assert.equal(Number(v.newSample),5);assert.notEqual(v.old,v.fresh);
    });
});

test('forever callbacks spawn independent literal projectiles alongside background mutations',async()=>{
    await roundtrip(`let surface=image.create(4,2)
scene.setBackgroundImage(surface)
let hero=sprites.create(img\`1\`,SpriteKind.Player)
let ticks=0
forever(function(){ticks+=1;scene.backgroundImage().setPixel(0,0,7);let shot=sprites.createProjectileFromSprite(img\`2\`,hero,0,0);shot.destroy()})`,run=>{
        const state=run.vm.runtime.bwArcadeDeviceState;assert.equal(state.backgroundImage.pixels[0],7);assert.ok(Number(vars(run).ticks)>=2);assert.equal(Object.values(state.sprites).length,1);
        assert.ok(run.calls.get('arcade_spawnProjectile')>=2);
    },25);
});

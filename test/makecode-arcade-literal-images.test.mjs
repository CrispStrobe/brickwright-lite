import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {runProgram,stepFrames} from './helpers/bw-vm.mjs';
// Task E1 keeps the import half of these round trips; the export half (projectToArcade, then compiling or running the exported TypeScript in PXT, then re-importing it) returns with task E2 (docs/OPEN-TASKS-2026-09-29.md).
const vars=run=>Object.fromEntries(run.vm.runtime.targets.flatMap(t=>Object.values(t.variables)).map(v=>[v.name.replace(/^Game_/,''),v.value]));
async function execute(imported){
    assert.deepEqual(imported.unsupported,[]);
    const run=await runProgram(imported.code,{frames:15,uploads:imported.costumes,storage:true});
    assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);return run;
}
async function roundtrip(source,check){
    const imported=arcadeToPseudocode(source),run=await execute(imported);check(run);
    check(await execute({...imported,code:run.creator.decompile()}));
    await run.vm.loadProject(Buffer.from(await(await run.vm.saveProjectSb3()).arrayBuffer()));run.vm.greenFlag();await stepFrames(run.vm,15);check(run);
}
test('literal Image variables preserve shared identity through procedures and backgrounds',async()=>{
    await roundtrip(`function paint(surface:Image){surface.setPixel(0,0,7)}
let picture=img\`2 . 5\n. 3 .\`
let alias=picture
let hero=sprites.create(picture,SpriteKind.Player)
let other=sprites.create(alias,SpriteKind.Food)
scene.setBackgroundImage(picture)
paint(alias)
let width=picture.width
let sample=hero.image.getPixel(0,0)`,run=>{
        const state=run.vm.runtime.bwArcadeDeviceState,[hero,other]=Object.values(state.sprites);
        assert.equal(hero.image,other.image);assert.equal(hero.image,state.backgroundImage);
        assert.deepEqual([...hero.image.pixels],[7,0,5,0,3,0]);assert.equal(Number(vars(run).width),3);assert.equal(Number(vars(run).sample),7);
    });
});
test('literal evaluations in Image-returning procedures allocate independently on every call',async()=>{
    await roundtrip(`function picture(){return img\`2 .\n. 5\`}
let first=picture()
let alias=first
let second=picture()
let hero=sprites.create(first,SpriteKind.Player)
let other=sprites.create(second,SpriteKind.Food)
first.fill(7)
let old=second
second=picture()
let third=sprites.create(second,SpriteKind.Enemy)
old.setPixel(0,0,3)
let sample=alias.getPixel(1,1)`,run=>{
        const [a,b,c]=Object.values(run.vm.runtime.bwArcadeDeviceState.sprites);
        assert.notEqual(a.image,b.image);assert.notEqual(b.image,c.image);
        assert.deepEqual([...a.image.pixels],[7,7,7,7]);assert.deepEqual([...b.image.pixels],[3,0,0,5]);assert.deepEqual([...c.image.pixels],[2,0,0,5]);assert.equal(Number(vars(run).sample),7);
    });
});
test('Image-only literal programs and repeated background literals retain original pixels',async()=>{
    await roundtrip(`function install(){scene.setBackgroundImage(img\`2 .\n. 5\`)}
let picture=img\`3 .\n. 7\`
let alias=picture
alias.setPixel(1,0,5)
install()
let old=scene.backgroundImage()
old.fill(7)
install()
let original=old.getPixel(1,1)
let sample=picture.getPixel(1,0)`,run=>{
        const state=run.vm.runtime.bwArcadeDeviceState;
        assert.equal(Object.values(state.sprites).length,0);assert.deepEqual([...state.backgroundImage.pixels],[2,0,0,5]);
        assert.equal(Number(vars(run).original),7);assert.equal(Number(vars(run).sample),5);
    });
});
test('builtin gallery constants retain shared identity across reads and direct sprite creation',async()=>{
    await roundtrip(`let first=sprites.duck.duck3
let second=sprites.duck.duck3
let hero=sprites.create(sprites.duck.duck3,SpriteKind.Player)
let other=sprites.create(second,SpriteKind.Food)
scene.setBackgroundImage(first)
first.setPixel(0,0,7)
let copied=first.clone()
copied.setPixel(0,0,2)
let third=sprites.create(copied,SpriteKind.Enemy)
let sample=second.getPixel(0,0)`,run=>{
        const state=run.vm.runtime.bwArcadeDeviceState,[a,b,c]=Object.values(state.sprites);
        assert.equal(a.image,b.image);assert.equal(a.image,state.backgroundImage);assert.notEqual(a.image,c.image);
        assert.equal(a.image.width,16);assert.equal(a.image.height,16);assert.equal(a.image.pixels[0],7);assert.equal(c.image.pixels[0],2);
        assert.equal(Number(vars(run).sample),7);
    });
});

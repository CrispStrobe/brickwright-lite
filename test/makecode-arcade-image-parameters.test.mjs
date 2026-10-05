import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
// Task E1 keeps the import half of these round trips; the export half (projectToArcade, then compiling or running the exported TypeScript in PXT, then re-importing it) returns with task E2 (docs/OPEN-TASKS-2026-09-29.md).
import {runProgram, SB3Creator, stepFrames} from './helpers/bw-vm.mjs';

const value = (run, name) => run.vm.runtime.targets.flatMap(t => Object.values(t.variables)).find(v => v.name === name)?.value;
async function execute(source) {
    const imported = arcadeToPseudocode(source);
    assert.deepEqual(imported.unsupported, [], JSON.stringify(imported.unsupported));
    const run = await runProgram(imported.code, {frames: 30, uploads: imported.costumes, storage: true});
    assert.deepEqual(run.errors, []); assert.deepEqual(run.creator.warnings, []);
    return run;
}

test('image arguments retain identity through forwarded, recursive and local-alias calls', async () => {
    const source = `let picture=image.create(4,2)
let copied=picture.clone()
function paint(canvas: Image, color: number) {
    let alias=canvas
    alias.fill(color)
    alias.setPixel(0,0,2)
    alias.fillRect(1,0,2,1,5)
    alias.drawLine(0,1,3,1,7)
}
function forward(surface: Image) { paint(surface,3) }
function recurse(surface: Image, depth: number) {
    if(depth>0) { recurse(surface,depth-1) }
    surface.setPixel(depth,0,depth+1)
}
forward(picture)
recurse(copied,2)
let sampled=picture.getPixel(3,0)
let separate=copied.getPixel(2,0)
let width=picture.width
let hero=sprites.create(picture,SpriteKind.Player)`;
    const run = await execute(source);
    assert.equal(value(run,'sampled'),3); assert.equal(value(run,'separate'),3); assert.equal(value(run,'width'),4);
    const state = Object.values(run.vm.runtime.bwArcadeDeviceState.sprites);
    assert.deepEqual([...state[0].image.pixels],[2,5,5,3,7,7,7,7]);
    const read = run.vm.runtime._primitives.arcade_imagePixel;
    assert.deepEqual([0,1,2,3].map(x => read({IMAGE:value(run,'copied'),X:x,Y:0},{})),[1,2,3,0]);
    const fromCode = await runProgram(run.creator.decompile(),{frames:30,storage:true});
    assert.deepEqual(fromCode.errors,[]); assert.equal(value(fromCode,'sampled'),3); assert.equal(value(fromCode,'separate'),3);
    const saved = await run.vm.saveProjectSb3(); await run.vm.loadProject(Buffer.from(await saved.arrayBuffer())); run.vm.greenFlag();
    await stepFrames(run.vm,30); assert.equal(value(run,'sampled'),3); assert.equal(value(run,'separate'),3);
});

test('callback sprite images and direct image expressions can be passed into procedures', async () => {
    const run = await execute(`function paint(surface: Image) { surface.fill(7) }
let sampled=0
sprites.onCreated(SpriteKind.Player,function(sprite){paint(sprite.image);sampled=sprite.image.getPixel(0,0)})
let hero=sprites.create(img\`1 1\`,SpriteKind.Player)
paint(image.create(2,2))
paint(hero.image.clone())`);
    assert.equal(value(run,'sampled'),7);
    assert.deepEqual([...Object.values(run.vm.runtime.bwArcadeDeviceState.sprites)[0].image.pixels],[7,7]);
});

test('standalone image procedures work and parameter names shadow global image bindings', async () => {
    const run = await execute(`let picture=image.create(2,1)
function paint(surface: Image) { surface.fill(7) }
function number(picture: number) { info.changeScoreBy(picture) }
paint(picture)
number(4)
let sampled=picture.getPixel(0,0)`);
    assert.equal(value(run,'sampled'),7); assert.equal(run.vm.runtime.bwArcadeDeviceState.score,4);
    const invalid = arcadeToPseudocode(`let picture=image.create(2,1)
function number(picture: number) { picture.fill(7) }
number(4)`);
    assert.ok(invalid.unsupported.some(x=>x.includes('picture.fill')),JSON.stringify(invalid));
    const creator = new SB3Creator(); creator.parse(run.creator.decompile()); assert.deepEqual(creator.warnings,[]);
});

test('procedures create multiple sprites from passed images without copying shared resources', async () => {
    const run = await execute(`let picture=image.create(2,1)
picture.fill(5)
function spawn(surface: Image) { let local=sprites.create(surface,SpriteKind.Enemy);local.x=40 }
spawn(picture)
spawn(picture.clone())
picture.fill(7)`);
    const sprites = Object.values(run.vm.runtime.bwArcadeDeviceState.sprites);
    assert.equal(sprites.length,2);assert.equal(sprites[0].x,40);assert.equal(sprites[1].x,40);
    assert.notEqual(sprites[0].image,sprites[1].image);
    assert.deepEqual([...sprites[0].image.pixels],[7,7]);assert.deepEqual([...sprites[1].image.pixels],[5,5]);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
// Task E1 keeps the import half of these round trips; the export half (projectToArcade, then compiling or running the exported TypeScript in PXT, then re-importing it) returns with task E2 (docs/OPEN-TASKS-2026-09-29.md).
import {runProgram,stepFrames} from './helpers/bw-vm.mjs';
const value=(run,name)=>run.vm.runtime.targets.flatMap(t=>Object.values(t.variables)).find(v=>v.name===name)?.value;
const sprites=run=>Object.values(run.vm.runtime.bwArcadeDeviceState.sprites);
const imagePixels=run=>sprites(run).map(s=>{run.vm.runtime._primitives.arcade_spriteImage({ID:s.id},{});return [...s.image.pixels];});
async function execute(source){
    const imported=arcadeToPseudocode(source);assert.deepEqual(imported.unsupported,[],JSON.stringify(imported));
    const run=await runProgram(imported.code,{frames:40,uploads:imported.costumes,storage:true});
    assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);run.imported=imported;return run;
}

test('registration affects later sprites and preserves runtime registration order',async()=>{
    const run=await execute(`let count=0
let first=sprites.create(img\`1\`,SpriteKind.Player)
sprites.onCreated(SpriteKind.Player,function(sprite){count+=1;sprite.image.fill(7)})
let second=sprites.create(img\`1\`,SpriteKind.Player)
let sampled=second.image.getPixel(0,0)
let observed=count`);
    assert.deepEqual(imagePixels(run),[[1],[7]]);assert.equal(value(run,'observed'),1);assert.equal(value(run,'sampled'),7);
    const saved=await run.vm.saveProjectSb3();await run.vm.loadProject(Buffer.from(await saved.arrayBuffer()));run.vm.greenFlag();await stepFrames(run.vm,40);
    assert.deepEqual(imagePixels(run),[[1],[7]]);assert.equal(value(run,'observed'),1);
});

test('repeated procedure registrations retain independent mutable captured locals and arguments',async()=>{
    const run=await execute(`function install(color: number,start: number){
    let offset=start
    sprites.onCreated(SpriteKind.Player,function(sprite){sprite.x=offset;sprite.image.fill(color);offset+=1})
    offset+=10
}
install(3,10)
install(4,20)
let first=sprites.create(img\`1\`,SpriteKind.Player)
let firstX=first.x
let second=sprites.create(img\`1\`,SpriteKind.Player)
let secondX=second.x`);
    assert.equal(value(run,'firstX'),30);assert.equal(value(run,'secondX'),31);
    assert.deepEqual(imagePixels(run),[[4],[4]]);
    const fromCode=await runProgram(run.creator.decompile(),{frames:40,storage:true,uploads:run.imported.costumes});
    assert.deepEqual(fromCode.errors,[]);assert.equal(value(fromCode,'firstX'),30);assert.equal(value(fromCode,'secondX'),31);
});

test('bindings initialized after registration and captured images stay live after procedure return',async()=>{
    const run=await execute(`let saved=image.create(2,1)
function install(sprite: Image){
    sprites.onCreated(SpriteKind.Player,function(target){target.setImage(sprite);sprite.fill(color)})
    let color=7
}
install(saved)
let hero=sprites.create(img\`1\`,SpriteKind.Player)
let sampled=saved.getPixel(0,0)`);
    assert.equal(value(run,'sampled'),7);assert.deepEqual([...sprites(run)[0].image.pixels],[7,7]);
});

test('nested registrations retain the outer callback sprite and become active for later creation',async()=>{
    const run=await execute(`sprites.onCreated(SpriteKind.Player,function(owner){
    sprites.onCreated(SpriteKind.Enemy,function(child){child.x=owner.x})
})
let hero=sprites.create(img\`1\`,SpriteKind.Player)
hero.x=35
let enemy=sprites.create(img\`1\`,SpriteKind.Enemy)
let sampled=enemy.x`);
    assert.equal(value(run,'sampled'),35);
});

test('runtime kind expressions remain an explicit import gap',()=>{
    const imported=arcadeToPseudocode('let kind=SpriteKind.Player\nsprites.onCreated(kind,function(sprite){sprite.x=10})\nlet hero=sprites.create(img`1`,SpriteKind.Player)');
    assert.ok(imported.unsupported.some(reason=>reason.includes('runtime kind expressions')),JSON.stringify(imported));
});

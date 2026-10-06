import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {runProgram,stepFrames} from './helpers/bw-vm.mjs';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';
const vars=run=>Object.fromEntries(run.vm.runtime.targets.flatMap(t=>Object.values(t.variables)).map(v=>[v.name.replace(/^Game_/,''),v.value]));

test('Arcade constructor, atomic positioning and fixed-point writes match original PXT through all conversion paths',async()=>{
    const source=`let seen=""
sprites.onCreated(SpriteKind.Player,function(sprite:Sprite){seen=sprite.toString()})
let hero=sprites.create(img\`1\`,SpriteKind.Player)
let centered=hero.toString()
let callbackCenter=seen
hero.setPosition(12.123,23.456)
let fractional=hero.toString()
hero.setPosition(hero.y+0.123,hero.x+0.456)
let simultaneous=hero.toString()
hero.x=12.123
hero.y=-23.456
let direct=hero.toString()
hero.left=-12.123
hero.bottom=23.456
let edges=hero.toString()
hero.setPosition(-12.123,-23.456)
let negative=hero.toString()
hero.setPosition(-12.123,-23.456)
let repeated=hero.toString()
let wide=sprites.create(img\`11\n11\n11\`,SpriteKind.Player)
let evenOdd=wide.toString()
let otherImage=image.create(3,5)
otherImage.fill(2)
let dynamic=sprites.create(otherImage,SpriteKind.Player)
let dynamicCenter=dynamic.toString()
let dynamicCallback=seen
hero.setImage(otherImage)
let resized=hero.toString()
hero.destroy()
hero.setVelocity(-6.123,7.456)
hero.ax=0.123
hero.ay=-0.456
let velocity=hero.toString()
let accelerationX=hero.ax
let accelerationY=hero.ay
hero.vx=8388608.5
hero.vy=-8388608.5
let overflow=hero.toString()
hero.setPosition(12.123,23.456)
let retained=hero.toString()`;
    const expected=await runPxtArcade(source);
    assert.equal(expected.centered,'0(79.5,59.5)->(0,0)');
    assert.equal(expected.callbackCenter,expected.centered);
    assert.equal(expected.fractional,'0(12.125,23.45703125)->(0,0)');
    assert.equal(expected.direct,'0(12.12109375,-23.453125)->(0,0)');
    assert.equal(expected.dynamicCenter,'2(79.5,59.5)->(0,0)');
    const names=['centered','callbackCenter','fractional','simultaneous','direct','edges','negative','repeated','evenOdd','dynamicCenter','dynamicCallback','resized','velocity','accelerationX','accelerationY','overflow','retained'];
    const check=run=>{const actual=vars(run);for(const name of names)assert.equal(actual[name],expected[name],name);assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);};
    const execute=async imported=>{assert.deepEqual(imported.unsupported,[]);const run=await runProgram(imported.code,{frames:80,uploads:imported.costumes,storage:true});check(run);return run;};
    const imported=arcadeToPseudocode(source),run=await execute(imported);
    const opcodes=Object.values(run.creator.project.targets.flatMap(t=>Object.values(t.blocks))).map(b=>b.opcode);
    assert.ok(opcodes.includes('arcade_setSpritePosition'));assert.ok(opcodes.includes('arcade_createSprite'));assert.ok(opcodes.includes('arcade_createImageSprite'));
    await execute({...imported,code:run.creator.decompile()});
    const exported=projectToArcade(run.creator.project,{costumeSvg:(t,c)=>run.creator.assets.get(c.assetId)?.data});assert.deepEqual(exported.unsupported,[]);
    const originalExported=await runPxtArcade(exported.ts);
    for(const name of names)assert.equal(originalExported[name],expected[name],name+' in executed PXT export');
    await execute(arcadeToPseudocode(exported.ts));
    await run.vm.loadProject(Buffer.from(await(await run.vm.saveProjectSb3()).arrayBuffer()));run.vm.greenFlag();await stepFrames(run.vm,80);check(run);
});

test('positioned factory runs creation callbacks before atomic placement, including in exported PXT',async()=>{
    const source=`let seenX=0
let seenY=0
sprites.onCreated(SpriteKind.Player,function(sprite:Sprite){seenX=sprite.x;seenY=sprite.y;sprite.x=42})
let hero=sprites.create(img\`1\`,SpriteKind.Player)
hero.setPosition(12.123,23.456)
let placed=hero.toString()`;
    const imported=arcadeToPseudocode(source);assert.deepEqual(imported.unsupported,[]);
    const code=imported.code.replace(/arcade create template ("[^"]+") kind ("[^"]+") width 1 height 1/,'arcade spawn template $1 kind $2 x 12.123 y 23.456 width 1 height 1').replace(/^  arcade set position of .*\n/m,'');
    const expected=await runPxtArcade(source);assert.equal(expected.seenX,79.5);assert.equal(expected.seenY,59.5);
    const names=['seenX','seenY','placed'];
    const run=await runProgram(code,{frames:40,uploads:imported.costumes,storage:true});assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);
    for(const name of names)assert.equal(vars(run)[name],expected[name],name);
    const exported=projectToArcade(run.creator.project,{costumeSvg:(t,c)=>run.creator.assets.get(c.assetId)?.data});assert.deepEqual(exported.unsupported,[]);
    const actual=await runPxtArcade(exported.ts);for(const name of names)assert.equal(actual[name],expected[name],name+' in exported PXT');
    const returned=arcadeToPseudocode(exported.ts);assert.deepEqual(returned.unsupported,[]);
    const again=await runProgram(returned.code,{frames:40,uploads:returned.costumes,storage:true});assert.deepEqual(again.errors,[]);
    for(const name of names)assert.equal(vars(again)[name],expected[name],name+' after export/reimport');
});

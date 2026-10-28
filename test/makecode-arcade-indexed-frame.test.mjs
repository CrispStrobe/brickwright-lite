import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {runProgram,stepFrames} from './helpers/bw-vm.mjs';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';
const require=createRequire(import.meta.url);
const engine=require('../overlay/scratch-vm/src/extensions/crispstrobe/arcade/image.js')([],require('../overlay/scratch-vm/src/extensions/crispstrobe/arcade/image-pxt.js'));
const capture=`
pause(60)
let raster=""
let digits="0123456789abcdef"
for(let y=0;y<120;y++)for(let x=0;x<160;x++)raster+=digits.charAt(screen.getPixel(x,y))
`;
const setup=`scene.setBackgroundColor(9)
scene.setBackgroundImage(img\`. 2 . 3
4 . 5 .\`)
let first=sprites.create(img\`2 . 2
. 5 .
2 . 2\`,SpriteKind.Player)
first.setPosition(1.25,2.75)
first.z=-3
let second=sprites.create(img\`. 7 .
7 . 7\`,SpriteKind.Enemy)
second.setPosition(2.75,2.25)
second.z=-3
`;
const frame=run=>run.vm.runtime.bwArcadeDeviceState.sceneFrame;
const pixels=run=>Array.from(frame(run).pixels);
const expectedPixels=raster=>Array.from(raster,ch=>parseInt(ch,16));
const fixtures=[
 ['odd dimensions, clipping and equal z/id order',setup],
 ['inverted z order and transparent holes',setup+'first.z=10\nsecond.z=-7\n'],
 ['fractional scaling',setup+'first.setScale(1.5)\nsecond.setScale(2)\n'],
 ['invisible sprite',setup+'first.setFlag(SpriteFlag.Invisible,true)\n'],
 ['camera offsets and relative sprite',setup+'scene.centerCameraAt(170,130)\nfirst.setPosition(169.75,130.25)\nsecond.setFlag(SpriteFlag.RelativeToCamera,true)\n'],
];
for(const [name,source] of fixtures)test('indexed scene frame matches entire original PXT plane: '+name,async()=>{
 const original=await runPxtArcade(source+capture);assert.equal(original.raster.length,160*120);
 const imported=arcadeToPseudocode(source);assert.deepEqual(imported.unsupported,[]);
 const run=await runProgram(imported.code,{frames:8,uploads:imported.costumes,storage:true});assert.deepEqual(run.errors,[]);
 assert.deepEqual(pixels(run),expectedPixels(original.raster));
 const identity=frame(run),buffer=identity.pixels;await stepFrames(run.vm,2);
 assert.strictEqual(frame(run),identity);assert.strictEqual(frame(run).pixels,buffer);
 assert.deepEqual(identity.coverage,['background','tilemap','sprites','modernSpeech','particles']);assert.ok(identity.remaining.includes('hud'));
});

test('indexed compositor clips layers, preserves duplicate colour indices and destination identity',()=>{
 const destination={width:4,height:3,pixels:new Uint8Array(12)},buffer=destination.pixels;
 const image={width:3,height:2,pixels:Uint8Array.from([1,0,2,0,3,0]),palette:[null,'#111111','#111111','#333333']};
 engine.composeFrame(destination,15,null,[{image,x:-1,y:0,z:0,id:5}]);
 assert.deepEqual([...buffer],[15,2,15,15,3,15,15,15,15,15,15,15]);assert.strictEqual(destination.pixels,buffer);
 engine.composeFrame(destination,4,null,[{image,x:100,y:100,z:0,id:1}]);assert.ok(buffer.every(x=>x===4));
});

test('scene frame state is suspended and restored without exposing incomplete screen reporters',async()=>{
 const imported=arcadeToPseudocode(setup);const run=await runProgram(imported.code,{frames:8,uploads:imported.costumes,storage:true});
 const old=frame(run),buffer=old.pixels;
 const invoke=(opcode,args={})=>run.vm.runtime.getOpcodeFunction('arcade_'+opcode)(args,{});
 await invoke('pushScene');invoke('setBackgroundColor',{COLOR:7});await stepFrames(run.vm,2);const child=frame(run);
 assert.notStrictEqual(child,old);assert.ok(child.pixels.every(x=>x===7));
 await invoke('popScene');assert.strictEqual(frame(run),old);assert.strictEqual(old.pixels,buffer);
 // screen reads are the composed frame; see makecode-arcade-screen-paint.test.mjs
 assert.deepEqual(arcadeToPseudocode('let snapshot=screen.clone()').unsupported,[]);
 assert.deepEqual(arcadeToPseudocode('game.onPaint(function(){screen.fill(2)})').unsupported,[]);
});

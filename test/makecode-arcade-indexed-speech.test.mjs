import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {runProgram} from './helpers/bw-vm.mjs';
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
let actor=sprites.create(img\`2 2 2
2 . 2
2 2 2\`,SpriteKind.Player)
actor.setPosition(80,60)
actor.z=2
`;
const cover=`let art=image.create(30,30)
art.fill(7)
let cover=sprites.create(art,SpriteKind.Enemy)
cover.setPosition(80,48)
`;
const cases=[
 ['foreground and box colour',setup+'actor.sayText("Hi",undefined,false,2,5)\n'],
 ['explicit zero box overwrites coloured background',setup+'actor.sayText("Hi",undefined,false,2,0)\n'],
 ['multiline text',setup+'actor.sayText("Hi\\nÄ",undefined,false,2,5)\n'],
 ['unicode font selection',setup+'actor.sayText("中文",undefined,false,2,5)\n'],
 ['same-z later sprite covers speech',setup+cover+'cover.z=2\nactor.sayText("Hi",undefined,false,2,5)\n'],
 ['lower-z sprite is behind speech',setup+cover+'cover.z=1\nactor.sayText("Hi",undefined,false,2,5)\n'],
 ['invisible owner suppresses modern speech',setup+'actor.sayText("Hi")\nactor.setFlag(SpriteFlag.Invisible,true)\n'],
 ['speech replacement',setup+'actor.sayText("Before")\nactor.sayText("After",undefined,false,2,0)\n'],
 ['speech clear',setup+'actor.sayText("Before")\nactor.sayText("")\n'],
 ['expired speech',setup+'actor.sayText("Hi",1)\n'],
 ['parent scene restores speech',setup+'actor.sayText("Hi")\ngame.pushScene()\ngame.popScene()\n'],
];
for(const [name,source] of cases)test('modern indexed speech equals complete original PXT frame: '+name,async()=>{
 const original=await runPxtArcade(source+capture);assert.equal(original.raster.length,19200);
 const imported=arcadeToPseudocode(source);assert.deepEqual(imported.unsupported,[]);
 const run=await runProgram(imported.code,{frames:8,uploads:imported.costumes,storage:true});assert.deepEqual(run.errors,[]);
 const frame=run.vm.runtime.bwArcadeDeviceState.sceneFrame;
 assert.deepEqual([...frame.pixels],Array.from(original.raster,ch=>parseInt(ch,16)));
 assert.ok(frame.coverage.includes('modernSpeech'));assert.ok(frame.remaining.includes('legacySpeech'));
});
test('masked scene drawing writes zero and preserves untouched pixels across clipping and order',()=>{
 const destination={width:3,height:2,pixels:new Uint8Array(6)};
 const image={width:3,height:2,pixels:Uint8Array.from([0,4,0,5,0,6])};
 engine.composeFrame(destination,9,null,[{image,writes:Uint8Array.from([1,0,1,0,1,0]),x:0,y:0,z:0,id:0}]);
 assert.deepEqual([...destination.pixels],[0,9,0,9,0,9]);
 engine.composeFrame(destination,9,null,[{image,writes:Uint8Array.from([1,1,0,0,1,1]),x:-1,y:1,z:0,id:0}]);
 assert.deepEqual([...destination.pixels],[9,9,9,4,9,9]);
});

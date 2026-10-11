import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {runProgram} from './helpers/bw-vm.mjs';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';
const setup=`scene.setBackgroundColor(9)
let bubble:Sprite=null
sprites.onCreated(-1,function(s){bubble=s})
let actor=sprites.create(img\`. . . .\n. . . .\n. 2 2 .\n. 2 2 .\`,SpriteKind.Player)
actor.setPosition(80,60)
`;
const capture=`pause(60)
let bx=bubble.x
let by=bubble.y
let bw=bubble.width
let bh=bubble.height
let raster=""
let digits="0123456789abcdef"
for(let y=0;y<120;y++)for(let x=0;x<160;x++)raster+=digits.charAt(screen.getPixel(x,y))
`;
const cases=[
 ['unscaled transparent rows',''],
 ['uniform double scale','actor.setScale(2)\n'],
 ['anisotropic fractional scale','actor.sx=2\nactor.sy=1.5\n'],
 ['fractional downscale','actor.setScale(0.75)\n'],
 ['quarter-turn bounding box','actor.setScale(2)\nactor.rotationDegrees=90\n'],
 ['oblique bounding box','actor.sx=2\nactor.sy=1.5\nactor.rotationDegrees=37\n'],
 ['blank artwork degenerate hitbox','actor.setImage(image.create(4,4))\n'],
 ['capture offset before yielding creation changes scale',`actor.setScale(2)
sprites.onCreated(-1,function(s){pause(30);actor.sy=3})
`]
];
for(const [name,body] of cases)test('legacy speech owner hitbox matches original full frame: '+name,async()=>{
 const source=setup+body+'actor.say("Hi",undefined,2,5)\n';
 const original=await runPxtArcade(source+capture);
 const imported=arcadeToPseudocode(source);assert.deepEqual(imported.unsupported,[]);
 const run=await runProgram(imported.code,{frames:40,uploads:imported.costumes,storage:true});
 assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);
 const state=run.vm.runtime.bwArcadeDeviceState,b=Object.values(state.sprites).find(s=>s.kind==='-1');
 assert.deepEqual([b.x,b.y,b.width,b.height],[original.bx,original.by,original.bw,original.bh]);
 assert.equal(original.raster.length,19200);
 assert.deepEqual([...state.sceneFrame.pixels],Array.from(original.raster,ch=>parseInt(ch,16)));
});

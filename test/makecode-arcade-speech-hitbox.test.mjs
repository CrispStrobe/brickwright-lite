import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {clearStrayTimers} from './helpers/bw-vm.mjs';
import {runTimedArcadeProgram} from './helpers/arcade-timed-native.mjs';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';
const setup=`scene.setBackgroundColor(9)
let bubble:Sprite=null
sprites.onCreated(-1,function(s){bubble=s})
let actor=sprites.create(img\`. . . .\n. . . .\n. 2 2 .\n. 2 2 .\`,SpriteKind.Player)
actor.setPosition(80,60)
`;
const captureDelay=60, creationDelay=30;
const capture=`pause(${captureDelay})
let bubbleKind=bubble.kind()
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
sprites.onCreated(-1,function(s){pause(${creationDelay});actor.sy=3})
`,creationDelay]
];
for(const [name,body,createdWait=0] of cases)test('legacy speech owner hitbox matches original full frame: '+name,async()=>{
 const source=setup+body+'actor.say("Hi",undefined,2,5)\n';
 const original=await runPxtArcade(source+capture);
 const imported=arcadeToPseudocode(source);assert.deepEqual(imported.unsupported,[]);
 const run=await runTimedArcadeProgram(imported.code,{milliseconds:createdWait+captureDelay,uploads:imported.costumes,storage:true});
 try {
  assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);
  const state=run.vm.runtime.bwArcadeDeviceState,b=Object.values(state.sprites).find(s=>s.kind===original.bubbleKind);
  assert.deepEqual([b.x,b.y,b.width,b.height],[original.bx,original.by,original.bw,original.bh]);
  assert.equal(original.raster.length,19200);
  assert.deepEqual([...state.sceneFrame.pixels],Array.from(original.raster,ch=>parseInt(ch,16)));
 } finally {run.vm.stopAll();run.vm.quit();clearStrayTimers();}
});


test('legacy speech creation retains its original offset across the actual yielding deadline',async()=>{
 const imported=arcadeToPseudocode(setup+cases.at(-1)[1]+'actor.say("Hi",undefined,2,5)\n');
 assert.deepEqual(imported.unsupported,[]);
 const run=await runTimedArcadeProgram(imported.code,{milliseconds:0,uploads:imported.costumes,storage:true});
 try {
  const sprites=()=>Object.values(run.vm.runtime.bwArcadeDeviceState.sprites);
  const actor=()=>sprites().find(sprite=>sprite.kind===1000),bubble=()=>sprites().find(sprite=>sprite.kind===-1);
  await run.clock.advanceTo(creationDelay-1);assert.equal(actor().sy,2);assert.equal(bubble().y,60);
  await run.clock.advanceTo(creationDelay);assert.equal(actor().sy,3);assert.equal(bubble().y,50);
  await run.clock.advanceTo(creationDelay+captureDelay);
  assert.deepEqual([bubble().x,bubble().y,bubble().width,bubble().height],[80,50,16,12]);
  assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);
 } finally {run.vm.stopAll();run.vm.quit();clearStrayTimers();}
});

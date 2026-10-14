import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {runProgram,stepFrames} from './helpers/bw-vm.mjs';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';
const value=(run,name)=>run.vm.runtime.targets.flatMap(t=>Object.values(t.variables)).find(v=>v.name===name)?.value;
const observer=`let bubble:Sprite=null
let creations=0
let destructions=0
sprites.onCreated(-1,function(sprite){bubble=sprite;creations+=1})
sprites.onDestroyed(-1,function(sprite){destructions+=1})
`;
const setup=`scene.setBackgroundColor(9)
let actor=sprites.create(img\`2 2\n2 2\`,SpriteKind.Player)
actor.setPosition(80,60)
actor.z=3
`;
const capture=`
pause(60)
let raster=""
let digits="0123456789abcdef"
for(let y=0;y<120;y++)for(let x=0;x<160;x++)raster+=digits.charAt(screen.getPixel(x,y))
let bid=bubble.id
let bx=bubble.x
let by=bubble.y
let bz=bubble.z
let bw=bubble.width
let bh=bubble.height
let flags=bubble.flags
`;
const cases=[
 ['native identity and frame', 'actor.say("Hi",undefined,2,5)\n',1,0,true],
 ['invisible owner retains independent bubble','actor.say("Hi",undefined,2,5)\nactor.setFlag(SpriteFlag.Invisible,true)\n',1,0,true],
 ['same-z later sprite covers the bubble','actor.say("Hi",undefined,2,5)\nlet cover=sprites.create(image.create(30,30),SpriteKind.Enemy)\ncover.image.fill(7)\ncover.setPosition(80,50)\ncover.z=4\n',1,0,true],
 ['same-z earlier sprite is below the bubble','let cover=sprites.create(image.create(30,30),SpriteKind.Enemy)\ncover.image.fill(7)\ncover.setPosition(80,50)\ncover.z=4\nactor.say("Hi",undefined,2,5)\n',1,0,true],
 ['clear destroys native bubble','actor.say("Hi",undefined,2,5)\nactor.say("")\n',1,1,false],
 ['null clears native bubble','actor.say("Hi",undefined,2,5)\nactor.say(null)\n',1,1,false],
 ['undefined clears native bubble','actor.say("Hi",undefined,2,5)\nactor.say(undefined)\n',1,1,false],
 ['replacement creates a new native ID','actor.say("Before",undefined,2,5)\nactor.say("After",undefined,2,5)\n',2,1,true],
 ['duplicate persistent say retains ID','actor.say("Hi",undefined,2,5)\nactor.say("Hi",undefined,2,5)\n',1,0,true],
 ['expiry destroys native bubble','actor.say("Hi",1,2,5)\n',1,1,false],
 ['destroyed owner leaves original independent bubble alive','actor.say("Hi",10,2,5)\nactor.destroy()\n',1,0,true],
 ['parent restores its scene-owned bubble','actor.say("Hi",undefined,2,5)\ngame.pushScene()\npause(80)\ngame.popScene()\n',1,0,true],
 ['parent bubble expires after scene suspension','actor.say("Hi",50,2,5)\ngame.pushScene()\npause(100)\ngame.popScene()\n',1,1,false],
];
async function execute(source,frames=40){
 const imported=arcadeToPseudocode(source);assert.deepEqual(imported.unsupported,[],JSON.stringify(imported.unsupported));
 const run=await runProgram(imported.code,{frames,uploads:imported.costumes,storage:true});
 assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);return {...run,imported};
}
for(const [name,body,created,destroyed,alive] of cases)test('native legacy bubble equals original IDs and complete frame: '+name,async()=>{
 const source=observer+setup+body;
 const original=await runPxtArcade(source+capture);
 const run=await execute(source);
 assert.equal(original.creations,created);assert.equal(original.destructions,destroyed);
 assert.equal(value(run,'creations'),created);assert.equal(value(run,'destructions'),destroyed);
 const state=run.vm.runtime.bwArcadeDeviceState;
 assert.equal(original.raster.length,19200);
 assert.deepEqual([...state.sceneFrame.pixels],Array.from(original.raster,ch=>parseInt(ch,16)));
 const native=Object.values(state.sprites).filter(s=>s.kind==='-1');assert.equal(native.length,alive?1:0);
 if(alive){
  const b=native[0];assert.deepEqual([b.pxtId,b.x,b.y,b.z,b.width,b.height,b.flags],
   [original.bid,original.bx,original.by,original.bz,original.bw,original.bh,original.flags]);
  assert.ok(state.physicsEngine.members.includes(b));
 }
 assert.equal(run.vm.runtime.getOpcodeFunction('arcade_spriteCount')({KIND:'-1'},{}),0);
});
const yielding=observer+setup+`let blank=-1
let beforeX=-1
let order=0
sprites.onCreated(-1,function(sprite){
 blank=sprite.image.getPixel(0,0)
 beforeX=sprite.x
 order=order*10+1
 pause(50)
 actor.setPosition(100,70)
 let nested=sprites.create(img\`7\`,SpriteKind.Enemy)
 order=order*10+2
})
actor.say("Hi",undefined,2,5)
let completed=order
let sampled=bubble.image.getPixel(2,2)
let later=sprites.create(img\`6\`,SpriteKind.Food)
`;
test('blank native creation callbacks yield before flags, pixels, owner position and caller continuation',async()=>{
 const original=await runPxtArcade(yielding+capture);
 const run=await execute(yielding);
 for(const name of ['blank','beforeX','order','completed','sampled'])assert.equal(value(run,name),original[name],name);
 assert.deepEqual([original.blank,original.beforeX,original.completed],[0,80,12]);
 const state=run.vm.runtime.bwArcadeDeviceState;
 assert.deepEqual([...state.sceneFrame.pixels],Array.from(original.raster,ch=>parseInt(ch,16)));
 assert.deepEqual(Object.values(state.sprites).map(s=>[s.kind,s.pxtId]),[['Player',0],['-1',1],['Enemy',2],['Food',3]]);
 const b=Object.values(state.sprites).find(s=>s.kind==='-1');
 assert.deepEqual([b.x,b.y,b.z,b.flags],[original.bx,original.by,original.bz,original.flags]);
});
test('native bubble callbacks and pixels survive Code, Blocks, saved SB3 and original exported execution',async()=>{
 const run=await execute(yielding);
 const expected=[...run.vm.runtime.bwArcadeDeviceState.sceneFrame.pixels];
 const out=projectToArcade(run.creator.project,{costumeSvg:(target,costume)=>run.creator.assets.get(costume.assetId)?.data});
 assert.deepEqual(out.unsupported,[]);
 const original=await runPxtArcade({...out.files,'main.ts':out.files['main.ts']+capture});
 assert.deepEqual(expected,Array.from(original.raster,ch=>parseInt(ch,16)));
 const again=await execute(out.files);assert.deepEqual([...again.vm.runtime.bwArcadeDeviceState.sceneFrame.pixels],expected);
 const code=await runProgram(run.creator.decompile(),{frames:40,uploads:run.imported.costumes,storage:true});assert.deepEqual(code.errors,[]);
 assert.deepEqual([...code.vm.runtime.bwArcadeDeviceState.sceneFrame.pixels],expected);
 const saved=await run.vm.saveProjectSb3();await run.vm.loadProject(Buffer.from(await saved.arrayBuffer()));
 run.vm.greenFlag();await stepFrames(run.vm,40);assert.deepEqual(run.errors,[]);
 assert.deepEqual([...run.vm.runtime.bwArcadeDeviceState.sceneFrame.pixels],expected);
 assert.equal(value(run,'creations'),1);assert.equal(value(run,'completed'),12);
});
test('yielding native bubble destruction completes before replacement and clear return',async()=>{
 const source=observer+setup+`let order=0
sprites.onDestroyed(-1,function(sprite){order=order*10+1;pause(50);order=order*10+2})
actor.say("Before",undefined,2,5)
actor.say("After",undefined,2,5)
let afterReplacement=order
actor.say("")
let afterClear=order
`;
 const original=await runPxtArcade(source+capture);const run=await execute(source);
 assert.deepEqual([original.afterReplacement,original.afterClear,original.creations,original.destructions],[12,1212,2,2]);
 for(const name of ['afterReplacement','afterClear','creations','destructions'])assert.equal(value(run,name),original[name],name);
 assert.deepEqual([...run.vm.runtime.bwArcadeDeviceState.sceneFrame.pixels],Array.from(original.raster,ch=>parseInt(ch,16)));
});
test('native bubble expiry completes its yielding callback while the frame resumes',async()=>{
 const source=observer+setup+`let order=0
sprites.onDestroyed(-1,function(sprite){order=order*10+1;pause(50);order=order*10+2})
actor.say("Hi",1,2,5)
pause(150)
let afterExpiry=order
`;
 const original=await runPxtArcade(source+capture);const run=await execute(source);
 assert.deepEqual([original.afterExpiry,original.creations,original.destructions],[12,1,1]);
 for(const name of ['afterExpiry','creations','destructions'])assert.equal(value(run,name),original[name],name);
 assert.deepEqual([...run.vm.runtime.bwArcadeDeviceState.sceneFrame.pixels],Array.from(original.raster,ch=>parseInt(ch,16)));
});
test('replacement image from a creation callback shares native pixels with the PXT text renderer',async()=>{
 const source=observer+setup+`let replacement=image.create(20,16)
sprites.onCreated(-1,function(sprite){sprite.setImage(replacement)})
actor.say("Hi",undefined,2,5)
let sampled=replacement.getPixel(2,2)
let shared=bubble.image==replacement
`;
 const original=await runPxtArcade(source+capture);const run=await execute(source);
 assert.equal(original.shared,true);assert.equal(Boolean(value(run,'shared')),true);assert.equal(value(run,'sampled'),original.sampled);
 assert.deepEqual([...run.vm.runtime.bwArcadeDeviceState.sceneFrame.pixels],Array.from(original.raster,ch=>parseInt(ch,16)));
 const native=Object.values(run.vm.runtime.bwArcadeDeviceState.sprites).find(s=>s.kind==='-1');
 assert.deepEqual([native.width,native.height],[original.bw,original.bh]);
});

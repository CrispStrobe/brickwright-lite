import test from 'node:test';
import assert from 'node:assert/strict';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';
import {loadExtensionClass,stubRuntime} from './helpers/bw-extensions.mjs';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {runProgram} from './helpers/bw-vm.mjs';
const capture=`
pause(60)
let raster=""
let digits="0123456789abcdef"
for(let y=0;y<120;y++)for(let x=0;x<160;x++)raster+=digits.charAt(screen.getPixel(x,y))
let negativeKindCount=sprites.allOfKind(-1).length
let bx=bubble.x
let by=bubble.y
let bz=bubble.z
`;
const observer=`let bubble:Sprite=null\nsprites.onCreated(-1,function(s){bubble=s})\n`;
const cases=[
 {name:'world coordinates at camera centre',x:180,y:120},
 {name:'left edge retains original world clipping',x:100,y:120},
 {name:'right edge retains original world clipping',x:260,y:120},
 {name:'top edge moves bubble below owner',x:180,y:61},
 {name:'offscreen owner does not clamp its bubble',x:400,y:120},
 {name:'relative owner preserves camera flag',x:80,y:60,relative:true},
 {name:'relative owner at top edge',x:3,y:2,relative:true},
 {name:'world to relative flag change',x:80,y:60,toggle:true},
];
function sourceFor(c){return `scene.setBackgroundColor(0)
let actor=sprites.create(img\`2 2\n2 2\`,SpriteKind.Player)
actor.setPosition(${c.x},${c.y})
actor.z=3
actor.setFlag(SpriteFlag.Invisible,true)
scene.centerCameraAt(180,120)
${c.relative?'actor.setFlag(SpriteFlag.RelativeToCamera,true)':''}
actor.say("Hi",undefined,2,5)
${c.toggle?'actor.setFlag(SpriteFlag.RelativeToCamera,true)':''}
`;}
for(const c of cases)test('legacy bridge matches complete original PXT bubble frame: '+c.name,async()=>{
 const original=await runPxtArcade(observer+sourceFor(c)+capture);
 assert.equal(original.raster.length,19200);
 assert.equal(original.negativeKindCount,0,'PXT negative kinds are excluded from kind collections');
 const Arcade=loadExtensionClass('arcade');const ext=new Arcade(stubRuntime());
 const id=ext.spawnSprite({KIND:'Player',X:c.x,Y:c.y,WIDTH:2,HEIGHT:2});
 const owner=ext._inst._sprite(id);owner.mask=Uint8Array.from([2,2,2,2]);owner.z=3;
 owner.flags=128|(c.relative?512:0);
 ext.centerCameraAt({X:180,Y:120});ext._updateCamera();
 ext.spriteSay({ID:id,TEXT:'Hi',DURATION:-1,ANIMATED:false,FOREGROUND:2,BACKGROUND:5,MODE:'legacy'});
 if(c.toggle)owner.flags|=512;
 ext._advance(.03);ext._advance(.03);
 const entry=ext._inst._speech.get(id),bubble=entry.renderer.sayBubbleSprite;
 assert.deepEqual([...entry.raster.pixels],Array.from(original.raster,ch=>parseInt(ch,16)));
 assert.deepEqual([bubble.x,bubble.y,bubble.z],[original.bx,original.by,original.bz]);
 assert.equal(!!(bubble.flags&2),!!(owner.flags&512));
 // Native allocation is integrated; complete frame coverage remains separately gated.
 assert.ok(ext._state().sceneFrame.remaining.includes('legacySpeech'));
 assert.equal(Object.values(ext._state().sprites).length,2);
 const native=ext._state().sprites[entry.nativeBubbleId];
 assert.equal(native.kind,'-1');assert.equal(native.pxtId,1);
});
test('legacy camera speech remains editable and executes after Code/Blocks/MakeCode roundtrip',async()=>{
 const imported=arcadeToPseudocode(sourceFor(cases[0]));assert.deepEqual(imported.unsupported,[]);
 const run=await runProgram(imported.code,{frames:4,uploads:imported.costumes,storage:true});
 assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);
 const exported=projectToArcade(run.creator.project,{costumeSvg:(target,costume)=>run.creator.assets.get(costume.assetId)?.data});
 assert.deepEqual(exported.unsupported,[]);
 const original=await runPxtArcade(observer+exported.files['main.ts']+capture);
 const direct=await runPxtArcade(observer+sourceFor(cases[0])+capture);
 assert.equal(original.raster,direct.raster);
 const again=arcadeToPseudocode(exported.files);assert.deepEqual(again.unsupported,[]);
 const rerun=await runProgram(again.code,{frames:4,uploads:again.costumes,storage:true});assert.deepEqual(rerun.errors,[]);
 assert.equal(Object.values(rerun.vm.runtime.bwArcadeDeviceState.speech)[0].mode,'legacy');
});

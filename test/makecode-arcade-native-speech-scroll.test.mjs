import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {runProgram} from './helpers/bw-vm.mjs';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';
const latin="ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const source=(duration,text=latin)=>`scene.setBackgroundColor(9)
let actor=sprites.create(img\`2\`,SpriteKind.Player)
actor.setPosition(80,60)
let spoken=false
let ticks=0
game.onUpdate(function(){ticks+=1;if(!spoken && ticks>=3){actor.say(${JSON.stringify(text)},${duration},2,5);spoken=true}})
`;
const capture=end=>`let observed:Sprite=null
sprites.onCreated(-1,function(s){observed=s})
let trace=""
let planes=""
let bubbleFrames=""
let frame=0
let elapsed=0
let nextSample=0
let scrollDone=false
game.currentScene().eventContext.registerFrameHandler(150,function(){
 if(scrollDone)return
 let dt=game.eventContext().deltaTime
 trace+=dt+",";
 elapsed+=dt
 if(observed){
  let art=observed.image
  let pixels=""
  let digits="0123456789abcdef"
  for(let y=0;y<art.height;y++)for(let x=0;x<art.width;x++)pixels+=digits.charAt(art.getPixel(x,y))
  bubbleFrames+=frame+"|"+pixels+";"
 }
 if(elapsed>=nextSample){
  let raster=""
  let digits="0123456789abcdef"
  for(let y=0;y<120;y++)for(let x=0;x<160;x++)raster+=digits.charAt(screen.getPixel(x,y))
  planes+=frame+"|"+raster+";"
  nextSample+=0.5
 }
 frame++
 if(elapsed>=${end})scrollDone=true
})
`;
for(const [name,duration,end,text] of [
 ['persistent loop','undefined',8,latin],
 ['duration adjusts scrolling speed','5000',3,latin],
 ['international font loop','undefined',8,'你好世界天地玄黄宇宙洪荒日月盈昃辰宿列张']
])
test('native speech replays original completed frames: '+name,async()=>{
 const original=await runPxtArcade(source(duration,text)+capture(end),{waitForGlobals:{scrollDone:true}});
 await fs.writeFile('artifacts/arcade-native-speech-scroll-'+name.replaceAll(' ','-')+'-oracle.json',JSON.stringify(original)+'\n');
 const deltas=original.trace.split(',').filter(Boolean).map(Number);
 const images=new Map(original.bubbleFrames.split(';').filter(Boolean).map(s=>{const i=s.indexOf('|');return [Number(s.slice(0,i)),s.slice(i+1)];}));
 const planes=new Map(original.planes.split(';').filter(Boolean).map(s=>{const i=s.indexOf('|');return [Number(s.slice(0,i)),s.slice(i+1)];}));
 assert.ok(deltas.length>=planes.size);assert.ok(planes.size>=6);
 assert.ok(deltas.reduce((a,b)=>a+b,0)>=end);
 const imported=arcadeToPseudocode(source(duration,text));assert.deepEqual(imported.unsupported,[]);
 const run=await runProgram(imported.code,{frames:1,uploads:imported.costumes,storage:true});
 assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);
 assert.equal(Object.keys(run.vm.runtime.bwArcadeDeviceState.speech || {}).length,0,'authored update callback waits for next frame');
 for(let i=0;i<deltas.length;i++){
  run.vm.runtime.emit('ARCADE_FRAME',deltas[i]*1000);
  await new Promise(resolve=>setImmediate(resolve));
  if(images.has(i)){
   const bubble=Object.values(run.vm.runtime.bwArcadeDeviceState.sprites).find(s=>s.kind==='-1');
   assert.ok(bubble,'native bubble exists at original frame '+i);
   const pixels=Array.from(bubble.image.pixels,p=>p.toString(16)).join('');
   assert.equal(pixels,images.get(i),name+' bubble image frame '+i);
  }
  if(planes.has(i)){
   const frame=run.vm.runtime.bwArcadeDeviceState.sceneFrame;
   assert.equal(planes.get(i).length,19200);
   assert.deepEqual([...frame.pixels],Array.from(planes.get(i),ch=>parseInt(ch,16)),name+' frame '+i+' elapsed '+deltas.slice(0,i+1).reduce((a,b)=>a+b,0));
  }
 }
 assert.deepEqual(run.errors,[]);
 assert.ok(new Set(planes.values()).size>=3,'actual original beginning, scrolling and later text planes differ');
 if(duration==='undefined'){
  const sequence=[...images.values()],initial=sequence[0];
  const changed=sequence.findIndex(pixels=>pixels!==initial);
  assert.ok(changed>0,'original starting hold precedes scrolling');
  assert.ok(sequence.lastIndexOf(initial)>changed,'original scroll loop returns to its initial image');
 }
});

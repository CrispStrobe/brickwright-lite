import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {loadExtensionClass} from './helpers/bw-extensions.mjs';
import {runProgram,stepFrames,clearStrayTimers} from './helpers/bw-vm.mjs';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {ARCADE_PALETTE,svgToPixels} from '../overlay/scratch-gui/src/lib/bw-makecode/pixel-image.js';
const Arcade=loadExtensionClass('arcade');
const colors=['#102030',...ARCADE_PALETTE.slice(1)];colors[1]='#123456';colors[2]='#123456';colors[15]='#abcdef';
const hex=colors.map(color=>color.slice(1)).join('');
const other=[...colors];other[0]='#010203';other[1]='#654321';other[2]='#fedcba';
const otherHex=other.map(color=>color.slice(1)).join('');
function fixture(){
 const runtime=new EventEmitter(),skins=new Map(),drawables=new Map();let skinId=0,drawableId=0;
 runtime.requestRedraw=()=>{};runtime.startHats=()=>[];
 runtime.renderer={createSVGSkin(svg){const id=++skinId;skins.set(id,svg);return id;},
  updateSVGSkin(id,svg){assert.ok(skins.has(id));skins.set(id,svg);},destroySkin(id){skins.delete(id);},
  createDrawable(group){const id=++drawableId;drawables.set(id,{group});return id;},destroyDrawable(id){drawables.delete(id);},
  updateDrawableSkinId(id,skin){drawables.get(id).skin=skin;},updateDrawableVisible(id,visible){drawables.get(id).visible=visible;},
  updateDrawablePosition(){},updateDrawableScale(){},setDrawableOrder(){}};
 const arcade=new Arcade(runtime);
 const image=arcade.createImage({WIDTH:2,HEIGHT:1});
 arcade.setImagePixel({IMAGE:image,X:0,Y:0,COLOR:1});arcade.setImagePixel({IMAGE:image,X:1,Y:0,COLOR:2});
 const id=arcade.createImageSprite({IMAGE:image,KIND:'Player',TEMPLATE:''});
 return {runtime,arcade,skins,drawables,image,id};
}

test('global palette recolors solid background, mutable image, sprite, tilemap and speech without changing indices',()=>{
 const g=fixture(),a=g.arcade;
 a.setBackgroundColor({COLOR:0});a.setBackgroundImage({IMAGE:g.image});
 a.setTilemap({DATA:JSON.stringify({columns:1,rows:1,tileSize:4,indices:[0],walls:[0],images:[{width:2,height:1,pixels:[1,2]}]})});
 a.spriteSay({ID:g.id,TEXT:'A',DURATION:-1,ANIMATED:false,FOREGROUND:15,BACKGROUND:1,MODE:'text'});
 const before=a._image(g.image).pixels.slice(), spriteEntry=a._inst._imageSkins.get(g.id), backgroundEntry=a._inst._background;
 a.setPalette({DATA:hex.toUpperCase()});
 assert.deepEqual(a._state().palette,colors);
 assert.deepEqual(a._image(g.image).pixels,before);
 assert.match(g.skins.get(backgroundEntry.skin),/#102030/,'background index zero is an opaque project color');
 for(const skin of [spriteEntry.skinId,a._inst._backgroundImage.skin,a._inst._tilemapDrawable.skin])assert.match(g.skins.get(skin),/#123456/);
 const speech=a._inst._speech.get(g.id);assert.match(g.skins.get(speech.skinId),/#abcdef/);assert.match(g.skins.get(speech.skinId),/#123456/);
 a.setPalette({DATA:otherHex});
 assert.strictEqual(a._inst._imageSkins.get(g.id),spriteEntry);assert.strictEqual(a._inst._background,backgroundEntry);
 assert.match(g.skins.get(spriteEntry.skinId),/#654321/);assert.match(g.skins.get(spriteEntry.skinId),/#fedcba/);
 assert.deepEqual(a._image(g.image).pixels,before);
 assert.equal(a.spritePixel({ID:g.id,X:0,Y:0}),1);assert.equal(a.spritePixel({ID:g.id,X:1,Y:0}),2);
});

test('palette persists globally across scenes, refreshes restored layers and resets only on project restart',()=>{
 const g=fixture(),a=g.arcade;a.setBackgroundColor({COLOR:1});
 a.spriteSay({ID:g.id,TEXT:'A',DURATION:-1,ANIMATED:false,FOREGROUND:15,BACKGROUND:1,MODE:'text'});
 const skin=a._inst._imageSkins.get(g.id).skinId,bg=a._inst._background.skin,speech=a._inst._speech.get(g.id).skinId;
 a.setPalette({DATA:hex});a.pushScene({});a.setPalette({DATA:otherHex});a.popScene({});
 assert.deepEqual(a._state().palette,other);for(const id of [skin,bg,speech])assert.match(g.skins.get(id),/#654321/);
 g.runtime.emit('PROJECT_STOP_ALL');assert.deepEqual(a._state().palette,other);
 g.runtime.emit('PROJECT_START');assert.deepEqual(a._state().palette,['#000000',...ARCADE_PALETTE.slice(1)]);
 assert.equal(g.skins.size,0);
 const peer=fixture();assert.deepEqual(peer.arcade._state().palette,['#000000',...ARCADE_PALETTE.slice(1)],'different runtimes do not share palette state');
});

test('invalid palette updates reject atomically without altering palette, images or renderer resources',()=>{
 const g=fixture(),a=g.arcade;a.setPalette({DATA:hex});const before=[...g.skins.entries()];
 for(const data of ['',hex.slice(6),hex+'000000','g'+hex.slice(1),'#'+hex,' '+hex,hex.match(/.{6}/g).join(' ')]){
  assert.throws(()=>a.setPalette({DATA:data}),/exactly 16 RGB colors/);
  assert.deepEqual(a._state().palette,colors);assert.deepEqual([...g.skins.entries()],before);
 }
});

const source=`let picture=img\`1 2\`
let hero=sprites.create(picture,SpriteKind.Player)
scene.setBackgroundColor(0)
scene.setBackgroundImage(picture)
let first=hero.image.getPixel(0,0)
let second=hero.image.getPixel(1,0)`;
const project=main=>({'main.ts':main,'pxt.json':JSON.stringify({name:'palette-control',dependencies:{device:'*'},files:['main.ts'],palette:colors})});
const extension=run=>run.vm.runtime._primitives.arcade_setPalette;
const state=run=>run.vm.runtime.bwArcadeDeviceState;

test('static project palette reaches native runtime, indexed costumes, decompile and saved SB3',async()=>{
 const imported=arcadeToPseudocode(project(source));assert.deepEqual(imported.unsupported,[]);
 assert.match(imported.code,/arcade set palette hex/);
 for(const costume of imported.costumes){const pixels=svgToPixels(costume.svg);if(pixels)assert.deepEqual(pixels.palette,[null,...colors.slice(1)]);}
 for(const code of [imported.code]){
  const run=await runProgram(code,{frames:12,uploads:imported.costumes,storage:true});
  try{
   assert.ok(extension(run));assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);assert.deepEqual(state(run).palette,colors);
   const again=await runProgram(run.creator.decompile(),{frames:12,uploads:imported.costumes,storage:true});assert.deepEqual(again.errors,[]);assert.deepEqual(state(again).palette,colors);
   const saved=await run.vm.saveProjectSb3();await run.vm.loadProject(Buffer.from(await saved.arrayBuffer()));run.vm.greenFlag();await stepFrames(run.vm,12);assert.deepEqual(state(run).palette,colors);
  }finally{clearStrayTimers();}
 }
});

test('runtime palette changes export through the original API and retain pixel identity after reimport',async()=>{
 const original=project(source+`\nimage.setPalette(hex\`${otherHex}\`)\nlet paletteDone=true\npause(40)`);
 const imported=arcadeToPseudocode(original);assert.deepEqual(imported.unsupported,[]);
 const run=await runProgram(imported.code,{frames:20,uploads:imported.costumes,storage:true});
 try{
  assert.deepEqual(run.errors,[]);assert.deepEqual(state(run).palette,other);
  const exported=projectToArcade(run.creator.project,{costumeSvg:(target,costume)=>run.creator.assets.get(costume.assetId)?.data});assert.deepEqual(exported.unsupported,[]);
  assert.match(exported.ts,/image\.setPalette\(Buffer\.fromHex\(/);
  const expected=await runPxtArcade(original,{inspectDisplay:true});
  const actual=await runPxtArcade(exported.files,{inspectDisplay:true,waitForGlobals:{paletteDone:true}});
  const unpack=value=>'#'+[value&255,(value>>>8)&255,(value>>>16)&255].map(byte=>byte.toString(16).padStart(2,'0')).join('');
  assert.deepEqual(expected.$display.palette.map(unpack),other);assert.deepEqual(actual.$display.palette,expected.$display.palette);
  assert.equal(expected.first,1);assert.equal(expected.second,2);assert.equal(actual.first,1);assert.equal(actual.second,2);
  assert.deepEqual(actual.$display.screen,expected.$display.screen);
  const back=arcadeToPseudocode(exported.files);assert.deepEqual(back.unsupported,[]);
  const reimported=await runProgram(back.code,{frames:20,uploads:back.costumes,storage:true});assert.deepEqual(reimported.errors,[]);assert.deepEqual(state(reimported).palette,other);
 }finally{clearStrayTimers();}
});

test('malformed static project palettes and unsupported runtime buffers remain named diagnostics',()=>{
 for(const palette of [colors.slice(1),colors.concat('#000000'),colors.map((color,index)=>index===2?'red':color)])assert.ok(arcadeToPseudocode({...project(source),'pxt.json':JSON.stringify({palette})}).unsupported.some(message=>message.includes('Invalid project palette')));
 assert.ok(arcadeToPseudocode(source+'\nimage.setPalette(hex`000000`)').unsupported.some(message=>message.includes('48 RGB bytes')));
 assert.ok(arcadeToPseudocode(source+'\nimage.setPalette(Buffer.fromHex(" '+hex+'"))').unsupported.some(message=>message.includes('without whitespace')));
 assert.ok(arcadeToPseudocode(source+'\nimage.setPalette(control.createBuffer(48))').unsupported.some(message=>message.includes('image.setPalette')));
});


test('palette text expressions and unexecuted branches retain authored timing across import and export',async()=>{
 const original=project(source+`\nlet paletteText="${otherHex}"\nif(false){image.setPalette(hex\`${hex}\`)}\nimage.setPalette(Buffer.fromHex(paletteText))\nlet paletteDone=true\npause(40)`);
 const imported=arcadeToPseudocode(original);assert.deepEqual(imported.unsupported,[]);
 const run=await runProgram(imported.code,{frames:20,uploads:imported.costumes,storage:true});
 try{
  assert.deepEqual(run.errors,[]);assert.deepEqual(state(run).palette,other);
  const exported=projectToArcade(run.creator.project,{costumeSvg:(target,costume)=>run.creator.assets.get(costume.assetId)?.data});assert.deepEqual(exported.unsupported,[]);
  const expected=await runPxtArcade(original,{inspectDisplay:true});
  const actual=await runPxtArcade(exported.files,{inspectDisplay:true,waitForGlobals:{paletteDone:true}});
  assert.deepEqual(actual.$display.palette,expected.$display.palette);
  assert.deepEqual(actual.$display.screen,expected.$display.screen);
  const back=arcadeToPseudocode(exported.files);assert.deepEqual(back.unsupported,[]);
  const again=await runProgram(back.code,{frames:20,uploads:back.costumes,storage:true});assert.deepEqual(again.errors,[]);assert.deepEqual(state(again).palette,other);
 }finally{clearStrayTimers();}
});


test('original Arcade palette state also persists after child scene changes and pop',async()=>{
 const observed=await runPxtArcade(project(`image.setPalette(hex\`${hex}\`)\ngame.pushScene()\nimage.setPalette(hex\`${otherHex}\`)\ngame.popScene()\npause(40)`),{inspectDisplay:true});
 const unpack=value=>'#'+[value&255,(value>>>8)&255,(value>>>16)&255].map(byte=>byte.toString(16).padStart(2,'0')).join('');
 assert.deepEqual(observed.$display.palette.map(unpack),other);
});


test('palette index zero creates the default scene background even without an explicit color setter',()=>{
 const g=fixture();g.arcade.setPalette({DATA:hex});
 assert.match(g.skins.get(g.arcade._inst._background.skin),/#102030/);
 g.arcade.pushScene({});assert.match(g.skins.get(g.arcade._inst._background.skin),/#102030/);
});


test('palette-only programs and simple static sprites use native display state without artificial image operations',async()=>{
 for(const main of [`image.setPalette(hex\`${otherHex}\`)`, 'let hero=sprites.create(img`1 2`,SpriteKind.Player)']){
  const imported=arcadeToPseudocode(project(main));assert.deepEqual(imported.unsupported,[]);
  const run=await runProgram(imported.code,{frames:12,uploads:imported.costumes,storage:true});
  try{assert.deepEqual(run.errors,[]);assert.deepEqual(state(run).palette,main.startsWith('image.')?other:colors);}finally{clearStrayTimers();}
 }
});


test('a palette API name in a comment does not create an unsupported runtime palette diagnostic',()=>{
 const imported=arcadeToPseudocode('let hero=sprites.create(img`1 2`,SpriteKind.Player)\n// image.setPalette(hex`not executed`)');
 assert.deepEqual(imported.unsupported,[]);
});

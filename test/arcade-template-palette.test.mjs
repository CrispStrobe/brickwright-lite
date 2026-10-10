import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {loadExtensionClass} from './helpers/bw-extensions.mjs';
import {runProgram,stepFrames,clearStrayTimers} from './helpers/bw-vm.mjs';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {imageToSvg,ARCADE_PALETTE} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-assets.js';
import {applyProjectPalette,DEFAULT_PROJECT_PALETTE} from '../overlay/scratch-gui/src/lib/arcade-project-palette.js';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';
const Arcade=loadExtensionClass('arcade');
const colors=[...DEFAULT_PROJECT_PALETTE];colors[1]='#123456';colors[2]='#654321';
const hex=colors.map(c=>c.slice(1)).join('');
function fixture({vector=false}={}){
 const runtime=new EventEmitter(),skins=new Map(),targets=[];let nextSkin=100;
 runtime.startHats=()=>[];runtime.requestRedraw=()=>{};
 runtime.renderer={createSVGSkin(svg){const id=nextSkin++;skins.set(id,svg);return id;},updateSVGSkin(id,svg){assert.ok(skins.has(id));skins.set(id,svg);},
  destroySkin(id){assert.ok(skins.delete(id));},updateDrawableSkinId(){},updateDrawablePosition(){},setDrawableOrder(){},
  createDrawable(){return 500;},destroyDrawable(){},updateDrawableScale(){},updateDrawableVisible(){}};
 const palette=[...ARCADE_PALETTE];palette[1]='#aabbcc';palette[2]='#aabbcc';
 const svg=vector?'<svg width="12" height="4"><path d="M0 0L12 4"/></svg>':imageToSvg({width:3,height:1,pixels:[1,2,0]},{palette});
 const asset={data:svg},costume={dataFormat:'svg',asset,rotationCenterX:6,rotationCenterY:2};
 runtime.getSpriteTargetByName=()=>({makeClone(){const target={drawableID:targets.length,currentCostume:0,
  getCostumes:()=>[costume],setXY(x,y){this.position=[x,y];},setVisible(){},setSize(size){this.size=size;},setCostume(){}};
  targets.push(target);return target;}});
 runtime.addTarget=()=>{};runtime.disposeTarget=target=>runtime.emit('targetWasRemoved',target);
 const arcade=new Arcade(runtime),spawn=()=>arcade.createSprite({TEMPLATE:'hero',KIND:'Player',WIDTH:3,HEIGHT:1});
 return {runtime,skins,targets,arcade,spawn,asset,svg};
}
test('palette adopts existing indexed template clones without changing assets, geometry or indices',()=>{
 const f=fixture(),id=f.spawn(),sprite=f.arcade._state().sprites[id];
 assert.equal(sprite.image,undefined);const geometry=[sprite.x,sprite.y,sprite.width,sprite.height];
 f.arcade.setPalette({DATA:hex});
 assert.deepEqual([...sprite.image.pixels],[1,2,0]);assert.deepEqual([sprite.x,sprite.y,sprite.width,sprite.height],geometry);
 assert.equal(f.asset.data,f.svg);assert.deepEqual(sprite.image.palette,[null,'#aabbcc','#aabbcc',...ARCADE_PALETTE.slice(3)]);
 const skin=f.arcade._inst._imageSkins.get(id).skinId;
 assert.match(f.skins.get(skin),/#123456/);assert.match(f.skins.get(skin),/#654321/);
 assert.deepEqual(f.targets[0].position,[(sprite.x-80)*3,(60-sprite.y)*3]);assert.equal(f.targets[0].size,75);
 const count=f.skins.size;f.arcade.setPalette({DATA:hex});assert.equal(f.skins.size,count);
 assert.equal(f.arcade._inst._imageSkins.get(id).skinId,skin);
 f.arcade.destroySprite({ID:id});assert.equal(f.arcade._inst._imageSkins.size,0);assert.equal(f.skins.has(skin),false);
});
test('template created after startup palette and later costume reload both use global colors',()=>{
 const f=fixture();f.arcade.setPalette({DATA:hex});const id=f.spawn();
 assert.deepEqual([...f.arcade._state().sprites[id].image.pixels],[1,2,0]);
 const first=f.arcade._inst._imageSkins.get(id).skinId;assert.match(f.skins.get(first),/#123456/);
 f.arcade.setSpriteCostume({ID:id,COSTUME:0});const second=f.arcade._inst._imageSkins.get(id).skinId;
 assert.notEqual(first,second);assert.equal(f.skins.has(first),false);assert.match(f.skins.get(second),/#654321/);
 f.runtime.emit('PROJECT_START');assert.equal(f.arcade._inst._imageSkins.size,0);assert.equal(f.skins.size,0);
});
test('unreadable vector template is not recolored or assigned a fabricated indexed image',()=>{
 const f=fixture({vector:true}),id=f.spawn();f.arcade.setPalette({DATA:hex});
 assert.equal(f.arcade._state().sprites[id].image,null);assert.equal(f.arcade._inst._imageSkins.size,0);assert.equal(f.asset.data,f.svg);
});
test('simple template game retains live assets through GUI palette, SB3, Code and original Arcade export',async()=>{
 const imported=arcadeToPseudocode('let hero=sprites.create(img`1 2`,SpriteKind.Player)\nlet ready=true');assert.deepEqual(imported.unsupported,[]);
 const run=await runProgram(imported.code,{frames:12,storage:true,uploads:imported.costumes});
 const liveSvg=(target,costume)=>run.vm.runtime.targets.find(t=>t.isOriginal&&t.getName()===target.name)
  ?.getCostumes().find(c=>c.assetId===costume.assetId)?.asset?.decodeText();
 try{
  await applyProjectPalette(run.vm,colors);run.vm.greenFlag();await stepFrames(run.vm,12);
  const sprite=Object.values(run.vm.runtime.bwArcadeDeviceState.sprites)[0];assert.deepEqual([...sprite.image.pixels],[1,2]);
  const project=JSON.parse(run.vm.toJSON()),exported=projectToArcade(project,{costumeSvg:liveSvg});
  assert.deepEqual(exported.unsupported,[]);assert.deepEqual(exported.warnings,[]);
  const original=await runPxtArcade(exported.files,{inspectDisplay:true,waitForGlobals:{ready:true}});
  const unpack=v=>'#'+[v&255,(v>>>8)&255,(v>>>16)&255].map(b=>b.toString(16).padStart(2,'0')).join('');
  assert.deepEqual(original.$display.palette.map(unpack),colors);
  const back=arcadeToPseudocode(exported.files);assert.deepEqual(back.unsupported,[]);
  const again=await runProgram(back.code,{frames:12,storage:true,uploads:back.costumes});assert.deepEqual(again.errors,[]);assert.deepEqual(again.vm.runtime.bwArcadeDeviceState.palette,colors);
  const code=run.creator.decompile(project),codeRun=await runProgram(code,{frames:12,storage:true,uploads:imported.costumes});assert.deepEqual(codeRun.errors,[]);assert.deepEqual(codeRun.vm.runtime.bwArcadeDeviceState.palette,colors);
  const saved=await run.vm.saveProjectSb3();await run.vm.loadProject(Buffer.from(await saved.arrayBuffer()));run.vm.greenFlag();await stepFrames(run.vm,12);
  assert.deepEqual([...Object.values(run.vm.runtime.bwArcadeDeviceState.sprites)[0].image.pixels],[1,2]);
 }finally{clearStrayTimers();}
});

test('runtime-only palette import uses indexed templates without a static pxt.json palette or image-mutation trigger',async()=>{
 const source=`let hero=sprites.create(img\`1 2\`,SpriteKind.Player)\nimage.setPalette(hex\`${hex}\`)\nlet ready=true`;
 const imported=arcadeToPseudocode(source);assert.deepEqual(imported.unsupported,[]);assert.match(imported.code,/arcade create template/);
 const run=await runProgram(imported.code,{frames:12,storage:true,uploads:imported.costumes});
 try{
  assert.deepEqual(run.errors,[]);assert.deepEqual(run.vm.runtime.bwArcadeDeviceState.palette,colors);
  assert.deepEqual([...Object.values(run.vm.runtime.bwArcadeDeviceState.sprites)[0].image.pixels],[1,2]);
  // Both originals wait for the same point; without it the first one races the first frame.
  // A global assigned only once is not published by the simulator, so assign it again.
  const expected=await runPxtArcade(source+'\nready=true',{inspectDisplay:true,waitForGlobals:{ready:true}});const exported=projectToArcade(run.creator.project,{costumeSvg:(target,costume)=>run.creator.assets.get(costume.assetId)?.data});
  assert.deepEqual(exported.unsupported,[]);
  const actual=await runPxtArcade(exported.files,{inspectDisplay:true,waitForGlobals:{ready:true}});
  assert.deepEqual(actual.$display.palette,expected.$display.palette);assert.deepEqual(actual.$display.screen,expected.$display.screen);
 }finally{clearStrayTimers();}
});

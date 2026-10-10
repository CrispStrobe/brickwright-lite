import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {runInNewContext} from 'node:vm';
import {STATIC} from '../scripts/lib/pxt-node.mjs';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {runProgram,stepFrames} from './helpers/bw-vm.mjs';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';
import {IMAGE_COPY_SOURCE} from './fixtures/arcade-image-copyfrom.mjs';
import {loadExtensionClass,stubRuntime} from './helpers/bw-extensions.mjs';
const require=createRequire(import.meta.url);
const engine=require('../overlay/scratch-vm/src/extensions/crispstrobe/arcade/image.js')([],require('../overlay/scratch-vm/src/extensions/crispstrobe/arcade/image-pxt.js'));
const original=fs.readFileSync(`${STATIC}/arcade/sim/common-sim.js`,'utf8');
const context={pxsim:{RefObject:class{}},ImageMethods:{}};
const end=original.indexOf('pxsim.RefImage = RefImage;');
runInNewContext(original.slice(original.indexOf('class RefImage extends'),end+'pxsim.RefImage = RefImage;'.length),context);
const start=original.indexOf('function copyFrom(img');
const endCopy=original.indexOf('ImageMethods.copyFrom = copyFrom;',start);
assert.ok(start>=0 && endCopy>start);
runInNewContext(original.slice(start,endCopy)+'\nImageMethods.copyFrom=copyFrom;',context);

test('copyFrom matches original PXT for matching and mismatched dimensions, zero fill and self-copy',()=>{
 let cases=0;
 for(const [width,height] of [[0,0],[1,1],[3,5],[8,7]])for(const [sw,sh] of [[width,height],[width+1,height],[width,height+1],[height,width]]){
  const image={width,height,pixels:Uint8Array.from({length:width*height},(_,i)=>(i+1)%16)},buffer=image.pixels;
  const source={width:sw,height:sh,pixels:Uint8Array.from({length:sw*sh},(_,i)=>i%16)};
  const ref=new context.pxsim.RefImage(width,height,4),from=new context.pxsim.RefImage(sw,sh,4);
  ref.data.set(image.pixels);from.data.set(source.pixels);
  context.ImageMethods.copyFrom(ref,from);engine.copyFrom(image,source);
  assert.deepEqual([...image.pixels],[...ref.data],`${width}x${height} from ${sw}x${sh}`);assert.strictEqual(image.pixels,buffer);
  context.ImageMethods.copyFrom(ref,ref);engine.copyFrom(image,image);
  assert.deepEqual([...image.pixels],[...ref.data]);assert.strictEqual(image.pixels,buffer);cases++;
 }
 assert.equal(cases,16);
});
const source=`let art=img\`1 2 3
4 5 6\`
let sourceArt=img\`. 7 .
8 . 9\`
let alias=art
let before=art.clone()
let hero=sprites.create(art,SpriteKind.Player)
let calls=0
function sourceImage():Image{calls++;return sourceArt}
function copyTo(sprite:Sprite,source:Image){sprite.image.copyFrom(source)}
alias.copyFrom(sourceImage())
let zero=art.getPixel(0,0)
let copied=art.getPixel(1,0)
let cloned=before.getPixel(0,0)
sourceArt.fill(2)
let independent=art.getPixel(1,0)
art.copyFrom(image.create(1,1))
let mismatch=art.getPixel(1,0)
copyTo(hero,sourceArt)
let viaSprite=art.getPixel(2,1)
art.copyFrom(art)
let selfPixel=art.getPixel(1,0)
let done=zero===0 && copied===7 && cloned===1 && independent===7 && mismatch===7 && viaSprite===2 && selfPixel===2 && calls===1`;
const names=['zero','copied','cloned','independent','mismatch','viaSprite','selfPixel','calls','done'];
const values=run=>Object.fromEntries(run.vm.runtime.targets.flatMap(t=>Object.values(t.variables)).map(v=>[v.name.replace(/^(?:Game_)+/,''),v.value]));
test('in-place image copy aliases and once-only source survive Code/Blocks, exported original PXT and SB3 reload',async()=>{
 const expected=await runPxtArcade(source);assert.equal(expected.done,true);
 const check=run=>{assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);for(const name of names)assert.equal(values(run)[name],expected[name],name);
  assert.deepEqual([...Object.values(run.vm.runtime.bwArcadeDeviceState.sprites)[0].image.pixels],[2,2,2,2,2,2]);};
 const execute=async imported=>{assert.deepEqual(imported.unsupported,[]);const run=await runProgram(imported.code,{frames:8,uploads:imported.costumes,storage:true});check(run);return run;};
 const imported=arcadeToPseudocode(source);assert.match(imported.code,/arcade copy pixels into image/);const run=await execute(imported);
 await execute({...imported,code:run.creator.decompile()});
 const exported=projectToArcade(run.creator.project,{costumeSvg:(t,c)=>run.creator.assets.get(c.assetId)?.data});assert.deepEqual(exported.unsupported,[]);assert.match(exported.ts,/\.copyFrom\(/);
 const pxt=await runPxtArcade(exported.files);for(const name of names)assert.equal(pxt[name],expected[name],name+' exported');
 await execute(arcadeToPseudocode(exported.files));
 await run.vm.loadProject(Buffer.from(await(await run.vm.saveProjectSb3()).arrayBuffer()));run.vm.greenFlag();await stepFrames(run.vm,8);check(run);
});
test('dedicated image copy block keeps identity and destination palette across inactive scenes',()=>{
 const Arcade=loadExtensionClass('arcade'),ext=new Arcade(stubRuntime());
 const block=ext.getInfo().blocks.find(b=>b.opcode==='copyImageFrom');assert.equal(block.blockType,'command');assert.ok(block.arguments.IMAGE && block.arguments.SOURCE);
 const target=ext.createImage({WIDTH:3,HEIGHT:2}),from=ext.createImage({WIDTH:3,HEIGHT:2});
 const image=ext._image(target),buffer=image.pixels;image.palette=[null,'#111111'];
 ext._image(from).pixels.set([0,2,0,3,0,4]);ext._image(from).palette=[null,'#222222'];
 ext.pushScene({});ext.copyImageFrom({IMAGE:target,SOURCE:from});
 assert.strictEqual(ext._image(target),image);assert.strictEqual(image.pixels,buffer);assert.deepEqual([...image.pixels],[0,2,0,3,0,4]);assert.deepEqual(image.palette,[null,'#111111']);
 ext.popScene({});assert.strictEqual(ext._image(target),image);
});
test('copyFrom wrong arity and unknown source images retain named refusals',()=>{
 for(const source of ['let art=image.create(3,3);art.copyFrom()','let art=image.create(3,3);art.copyFrom(7)','let art=image.create(3,3);art.copyFrom(art,art)','let art=7;art.copyFrom(image.create(3,3))'])assert.ok(arcadeToPseudocode(source).unsupported.length,source);
});

test('real controller keys copy sprite pixels and preserve them after a mismatched copy',async()=>{
 const expected=await runPxtArcade(IMAGE_COPY_SOURCE+`
controller.A.setPressed(true)
pause(25)
controller.A.setPressed(false)
controller.B.setPressed(true)
pause(25)
let copiedPixel=actor.image.getPixel(1,0)
let completed=copyPhase===2`);
 assert.equal(expected.completed,true);assert.equal(expected.copiedPixel,7);
 const imported=arcadeToPseudocode(IMAGE_COPY_SOURCE);assert.deepEqual(imported.unsupported,[]);
 const run=await runProgram(imported.code,{frames:8,uploads:imported.costumes,storage:true});
 const pixels=()=>[...Object.values(run.vm.runtime.bwArcadeDeviceState.sprites)[0].image.pixels];
 assert.deepEqual(pixels(),[2,2,2,2,2,2]);
 run.vm.postIOData('keyboard',{key:' ',isDown:true});await stepFrames(run.vm,6);run.vm.postIOData('keyboard',{key:' ',isDown:false});
 assert.deepEqual(pixels(),[0,7,0,7,0,7]);
 run.vm.postIOData('keyboard',{key:'z',isDown:true});await stepFrames(run.vm,6);run.vm.postIOData('keyboard',{key:'z',isDown:false});
 assert.deepEqual(pixels(),[0,7,0,7,0,7]);assert.equal(values(run).copyPhase,2);assert.deepEqual(run.errors,[]);
});

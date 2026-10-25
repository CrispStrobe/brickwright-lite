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
import {IMAGE_SCROLL_SOURCE} from './fixtures/arcade-image-scroll.mjs';
import {loadExtensionClass,stubRuntime} from './helpers/bw-extensions.mjs';
const require=createRequire(import.meta.url);
const engine=require('../overlay/scratch-vm/src/extensions/crispstrobe/arcade/image.js')([],require('../overlay/scratch-vm/src/extensions/crispstrobe/arcade/image-pxt.js'));
const original=fs.readFileSync(`${STATIC}/arcade/sim/common-sim.js`,'utf8');
const context={pxsim:{RefObject:class{}},ImageMethods:{}};
const end=original.indexOf('pxsim.RefImage = RefImage;');
runInNewContext(original.slice(original.indexOf('class RefImage extends'),end+'pxsim.RefImage = RefImage;'.length),context);
for(const name of ['clone','drawImageCore','drawTransparentImage','scroll']){
 const start=original.indexOf(`function ${name}(img`);assert.ok(start>=0,name);
 let finish=original.indexOf('{',start)+1,depth=1;
 while(depth && finish<original.length){if(original[finish]==='{')depth++;if(original[finish]==='}')depth--;finish++;}
 assert.equal(depth,0,name);runInNewContext(original.slice(start,finish)+`\nImageMethods.${name}=${name};`,context);
}
test('image scroll pixels and offset coercion match untouched original PXT across clipping boundaries',()=>{
 let cases=0;
 for(const [width,height] of [[1,1],[3,5],[8,7]])for(const dx of [-20,-2,-1.75,-0,0,1.75,2,20,NaN,Infinity,4294967297])for(const dy of [-20,-1.75,0,1.75,20,NaN]){
  const image={width,height,pixels:Uint8Array.from({length:width*height},(_,i)=>i%16)},buffer=image.pixels;
  const reference=new context.pxsim.RefImage(width,height,4);reference.data.set(image.pixels);
  context.ImageMethods.scroll(reference,dx,dy);engine.scroll(image,dx,dy);
  assert.deepEqual([...image.pixels],[...reference.data],`${width}x${height} scroll ${dx},${dy}`);
  assert.strictEqual(image.pixels,buffer);assert.equal(image.width,width);assert.equal(image.height,height);cases++;
 }
 assert.equal(cases,198);
});
const source=`let art=img\`1 2 3
4 . 5
6 7 8\`
let alias=art
let copy=art.clone()
let hero=sprites.create(art,SpriteKind.Player)
let calls=0
let order=0
function dx(){calls++;order=order*10+1;return 1.75}
function dy(){calls++;order=order*10+2;return -1.75}
function slide(sprite:Sprite){sprite.image.scroll(0,1)}
alias.scroll(dx(),dy())
let shifted=art.getPixel(1,0)
let transparent=art.getPixel(2,0)
let copied=copy.getPixel(0,0)
slide(hero)
let afterSprite=art.getPixel(1,1)
let done=calls===2 && order===12 && shifted===4 && transparent===0 && copied===1 && afterSprite===4`;
const names=['calls','order','shifted','transparent','copied','afterSprite','done'];
const values=run=>Object.fromEntries(run.vm.runtime.targets.flatMap(t=>Object.values(t.variables)).map(v=>[v.name.replace(/^(?:Game_)+/,''),v.value]));
test('mutable scroll aliases and once-only x/y arguments survive Code/Blocks, SB3 and original MakeCode export',async()=>{
 const expected=await runPxtArcade(source);assert.equal(expected.done,true);
 const check=run=>{assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);for(const name of names)assert.equal(values(run)[name],expected[name],name);
  assert.deepEqual([...Object.values(run.vm.runtime.bwArcadeDeviceState.sprites)[0].image.pixels],[0,0,0,0,4,0,0,6,7]);};
 const execute=async imported=>{assert.deepEqual(imported.unsupported,[]);const run=await runProgram(imported.code,{frames:8,uploads:imported.costumes,storage:true});check(run);return run;};
 const imported=arcadeToPseudocode(source);assert.match(imported.code,/arcade scroll image/);const run=await execute(imported);
 await execute({...imported,code:run.creator.decompile()});
 const exported=projectToArcade(run.creator.project,{costumeSvg:(t,c)=>run.creator.assets.get(c.assetId)?.data});assert.deepEqual(exported.unsupported,[]);assert.match(exported.ts,/\.scroll\(/);
 const original=await runPxtArcade(exported.files);for(const name of names)assert.equal(original[name],expected[name],name+' exported');
 await execute(arcadeToPseudocode(exported.files));
 await run.vm.loadProject(Buffer.from(await(await run.vm.saveProjectSb3()).arrayBuffer()));run.vm.greenFlag();await stepFrames(run.vm,8);check(run);
});
test('dedicated scroll block keeps alias identity and mutates an inactive scene image',()=>{
 const Arcade=loadExtensionClass('arcade'),ext=new Arcade(stubRuntime());
 const block=ext.getInfo().blocks.find(b=>b.opcode==='scrollImage');assert.equal(block.blockType,'command');assert.ok(block.arguments.X && block.arguments.Y);
 const ref=ext.createImage({WIDTH:3,HEIGHT:2}),image=ext._image(ref);image.pixels.set([1,2,3,4,5,6]);
 ext.pushScene({});ext.scrollImage({IMAGE:ref,X:-1,Y:0});assert.strictEqual(ext._image(ref),image);assert.deepEqual([...image.pixels],[2,3,0,5,6,0]);
 ext.popScene({});assert.strictEqual(ext._image(ref),image);
});
test('image scroll wrong arity and unknown image bindings retain refusals',()=>{
 for(const source of ['let art=image.create(3,3);art.scroll()','let art=image.create(3,3);art.scroll(1)','let art=image.create(3,3);art.scroll(1,2,3)','let art=7;art.scroll(1,2)'])assert.ok(arcadeToPseudocode(source).unsupported.length,source);
});

test('controller buttons scroll the attached sprite image horizontally then vertically',async()=>{
 const expected=await runPxtArcade(IMAGE_SCROLL_SOURCE+`
controller.A.setPressed(true)
pause(25)
controller.A.setPressed(false)
controller.B.setPressed(true)
pause(25)
let observedPixel=actor.image.getPixel(2,0)
let completed=scrollPhase===2`);
 assert.equal(expected.completed,true);assert.equal(expected.observedPixel,5);
 const imported=arcadeToPseudocode(IMAGE_SCROLL_SOURCE);assert.deepEqual(imported.unsupported,[]);
 const run=await runProgram(imported.code,{frames:8,uploads:imported.costumes,storage:true});
 const pixels=()=>[...Object.values(run.vm.runtime.bwArcadeDeviceState.sprites)[0].image.pixels];
 assert.deepEqual(pixels(),[2,0,0,0,5,0,0,0,7]);
 run.vm.postIOData('keyboard',{key:' ',isDown:true});await stepFrames(run.vm,6);run.vm.postIOData('keyboard',{key:' ',isDown:false});
 assert.deepEqual(pixels(),[0,2,0,0,0,5,0,0,0]);
 run.vm.postIOData('keyboard',{key:'z',isDown:true});await stepFrames(run.vm,6);run.vm.postIOData('keyboard',{key:'z',isDown:false});
 assert.deepEqual(pixels(),[0,0,5,0,0,0,0,0,0]);assert.equal(values(run).scrollPhase,2);assert.deepEqual(run.errors,[]);
});

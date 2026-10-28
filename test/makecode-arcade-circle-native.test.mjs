import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {loadExtensionClass} from './helpers/bw-extensions.mjs';
import {createArcadeRuntimeMock} from './helpers/arcade-runtime-mock.mjs';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
const require=createRequire(import.meta.url);
const engine=require('../overlay/scratch-vm/src/extensions/crispstrobe/arcade/image.js')([],require('../overlay/scratch-vm/src/extensions/crispstrobe/arcade/image-pxt.js'));
const oracle=JSON.parse(fs.readFileSync(new URL('./fixtures/arcade/image-circle-pixels.json',import.meta.url),'utf8'));
const value=text=>{text=text.replace(/^<any>/,'');if(text==='undefined')return undefined;if(text==='NaN')return NaN;if(text==='Infinity')return Infinity;return text[0]==='"'||['true','false','null'].includes(text)?JSON.parse(text):Number(text);};

test('native circle pixels match every complete selected original radius, clipping and color case',()=>{
 assert.equal(oracle.cases.length,57);
 for(const entry of oracle.cases){
  const image={width:entry.width,height:entry.height,pixels:new Uint8Array(entry.width*entry.height).fill(oracle.background)};
  assert.equal(engine.draw(image,entry.method,...entry.args.map(value)),true);
  assert.deepEqual(Array.from(image.pixels),entry.pixels,entry.name+' '+entry.label);
 }
});

test('circle Blocks use their own radius input and fixed operation fields',()=>{
 const actual=new (loadExtensionClass('arcade'))(createArcadeRuntimeMock()),info=actual.getInfo();
 for(const opcode of ['drawImageCircle','drawSpriteCircle']){
  const block=info.blocks.find(block=>block.opcode===opcode);assert.ok(block);
  assert.equal(block.arguments.OP.menu,'imageCircleOperations');assert.ok(block.arguments.RADIUS);
  assert.equal(block.arguments.W,undefined);assert.equal(block.arguments.H,undefined);
 }
 assert.equal(info.menus.imageCircleOperations.acceptReporters,false);
 assert.deepEqual(Array.from(info.menus.imageCircleOperations.items),['drawCircle','fillCircle']);
});

test('typed Image circle conversion keeps four authored arguments and refuses malformed calls',()=>{
 const imported=arcadeToPseudocode('function paint(to:Image,r:number){to.drawCircle(2,3,r,17);to.fillCircle(4,5,r,-1)}let canvas=image.create(9,9);paint(canvas,2.9)');
 assert.deepEqual(imported.unsupported,[]);
 assert.match(imported.code,/arcade draw image circle drawCircle/);
 assert.match(imported.code,/arcade draw image circle fillCircle/);
 assert.match(imported.code,/radius/);
 for(const args of ['1,2,3','1,2,3,4,5']){
  const bad=arcadeToPseudocode('let canvas=image.create(9,9);canvas.drawCircle('+args+')');
  assert.ok(bad.unsupported.some(reason=>reason.includes('requires center x/y, radius and color')));
  assert.doesNotMatch(bad.code,/arcade draw image circle drawCircle/);
 }
});

import test from 'node:test';import assert from 'node:assert/strict';import {EventEmitter} from 'node:events';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {parseMakeCodeTs} from '../overlay/scratch-gui/src/lib/bw-makecode/ts-import.js';
import {lowerLiveFontMetrics} from '../overlay/scratch-gui/src/lib/bw-makecode/live-font-metrics.js';
import {sourceScalarDeclarations} from '../overlay/scratch-gui/src/lib/bw-makecode/source-scalar-declarations.js';
import {loadExtensionClass} from './helpers/bw-extensions.mjs';
test('six direct live metrics have Number provenance without literal replacement',()=>{
 for(const font of ['font5','font8','font12'])for(const property of ['charWidth','charHeight']){
  const source=`let result=image.${font}.${property};let masked=result|0`,r=arcadeToPseudocode(source);assert.deepEqual(r.unsupported,[]);assert.ok(r.code.includes(`arcade font "${font}" metric "${property}"`));
  assert.deepEqual(sourceScalarDeclarations(lowerLiveFontMetrics(parseMakeCodeTs(`let result=image.${font}.${property}`))),[{name:'result',type:'Number'}]);
 }
});
test('font aliases, writes, unknown selections and lexical shadows remain diagnosed',()=>{
 for(const source of ['let font=image.font5;let result=font.charHeight','image.font5.charHeight=9','image.font5.charHeight++','let result=image.font5.data','let result=image.font99.charHeight','function f(image:any){return image.font5.charHeight|0}','function f(){let n=image.font5.charHeight;let image:any;return n|0}','let image:any;let result=image.font5.charHeight|0'])assert.ok(arcadeToPseudocode(source).unsupported.length,source);
});
test('native metric fields share the live original renderer objects across scenes and reset on restart',()=>{
 const runtime=new EventEmitter();runtime.targets=[];runtime.startHats=()=>[];const wrapper=new(loadExtensionClass('arcade'))(runtime),native=wrapper._inst,info=wrapper.getInfo();
 const block=info.blocks.find(b=>b.opcode==='fontMetric');assert.ok(block);assert.equal(info.menus[block.arguments.FONT.menu].acceptReporters,false);assert.equal(info.menus[block.arguments.PROPERTY.menu].acceptReporters,false);
 for(const [FONT,width,height]of [['font5',6,5],['font8',6,8],['font12',12,12]]){assert.equal(native.fontMetric({FONT,PROPERTY:'charWidth'}),width);assert.equal(native.fontMetric({FONT,PROPERTY:'charHeight'}),height);}
 const original=native._pxtText();original.image.font5.charHeight=9;assert.equal(native.fontMetric({FONT:'font5',PROPERTY:'charHeight'}),9);native.pushScene();native.popScene();assert.equal(native._pxtText(),original);assert.equal(native.fontMetric({FONT:'font5',PROPERTY:'charHeight'}),9);
 runtime.emit('PROJECT_START');assert.notEqual(native._pxtText(),original);assert.equal(native.fontMetric({FONT:'font5',PROPERTY:'charHeight'}),5);
 assert.throws(()=>native.fontMetric({FONT:'font5',PROPERTY:'charHeight'},{thread:{peekStack:()=> 'metric'},target:{blocks:{getBlock:()=>({inputs:{FONT:{block:'dynamic'}}})}}}),/fixed fields/);
 for(const args of [{FONT:'custom',PROPERTY:'charHeight'},{FONT:'font5',PROPERTY:'width'}])assert.throws(()=>native.fontMetric(args),/builtin FONT/);
});

test('native fixed font selectors reject opaque values without invoking toString',()=>{
 const runtime=new EventEmitter();runtime.targets=[];runtime.startHats=()=>[];const native=new(loadExtensionClass('arcade'))(runtime)._inst;
 const originalModule=native._textModule;let conversions=0;const opaque={toString(){conversions++;return 'font5'}};
 for(const FONT of [opaque,['font5'],new String('font5'),undefined,null,5])assert.throws(()=>native.fontMetric({FONT,PROPERTY:'charHeight'}),/builtin FONT/);
 const property={toString(){conversions++;return 'charHeight'}};
 for(const PROPERTY of [property,['charHeight'],new String('charHeight'),undefined,null,5])assert.throws(()=>native.fontMetric({FONT:'font5',PROPERTY}),/numeric PROPERTY/);
 assert.equal(conversions,0);assert.equal(native._textModule,originalModule,'invalid selectors cannot initialize or change renderer font objects');
 assert.equal(native.fontMetric({FONT:'font5',PROPERTY:'charHeight'}),5);
});

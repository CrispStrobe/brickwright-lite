import test from 'node:test';
import assert from 'node:assert/strict';
import {parseMakeCodeTs} from '../overlay/scratch-gui/src/lib/bw-makecode/ts-import.js';
import {proveClassCallableSource} from '../overlay/scratch-gui/src/lib/bw-makecode/class-callable-source-flow.js';
import {source} from './fixtures/arcade/sdk-image-class-callables.mjs';
const prove=value=>proveClassCallableSource(parseMakeCodeTs(value,{retainCallableMetadata:true,retainParentheses:true}),{sdkImagePrototype:true});
test('Image class source proof requires actual safe factory and clone producers',()=>{
 assert.equal(prove(source).eligible,true,JSON.stringify(prove(source).unsupported));
 assert.equal(prove(source.replace('image.create(2,2)','image.create(0,0)')).eligible,true);
 assert.equal(proveClassCallableSource(parseMakeCodeTs(source,{retainCallableMetadata:true})).eligible,false);
});
test('Image annotations, aliases and neighboring writers cannot create source producer authority',()=>{
 for(const bad of ['20 as Image','unknown as Image','image.create(-1,2)','image.create(2001,2)','image.create(width,2)','image.create<number>(2,2)','image.create(2,2).clone(1)'])assert.equal(prove(source.replace('image.create(2,2)',bad)).eligible,false,bad);
 for(const [before,after] of [['let picture=new Picture(imageValue);','imageValue=20 as any;let picture=new Picture(imageValue);'],['let imageValue=image.create(2,2);','let imageValue:Image;'],['let imageValue=image.create(2,2);','let imageValue:Image;let alias=imageValue;imageValue=image.create(2,2);'],['let copied=picture.apply','let opaque:Image=unknown;let copied=picture.apply']])assert.equal(prove(source.replace(before,after)).eligible,false,after);
 assert.equal(prove('class Image{constructor(){}}'+source).eligible,false);
 assert.equal(prove('let image=unknown;'+source).eligible,false);
 for(const prefix of ['image.create=unknown;','image=unknown;','image.create=(w:number,h:number)=>{return 20};'])assert.equal(prove(prefix+source).eligible,false,prefix);
});
test('a nominal ordinary class named Image keeps its actual managed class domain',()=>{
 const nominal='class Image{value:number;constructor(value:number){this.value=value}}class Holder{read:(picture:Image)=>number;constructor(){this.read=(picture:Image)=>{return picture.value}}}let picture=new Image(5);let holder=new Holder();let n=holder.read(picture);';
 assert.equal(prove(nominal).eligible,true,JSON.stringify(prove(nominal).unsupported));
 assert.equal(proveClassCallableSource(parseMakeCodeTs(nominal,{retainCallableMetadata:true})).eligible,true);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {parseMakeCodeTs} from '../overlay/scratch-gui/src/lib/bw-makecode/ts-import.js';
import {lowerSdkFontValues} from '../overlay/scratch-gui/src/lib/bw-makecode/lower-sdk-font-values.js';
const lower=source=>lowerSdkFontValues(parseMakeCodeTs(source));
const nodes=(node,type)=>!node||typeof node!=='object'?[]:Array.isArray(node)?node.flatMap(value=>nodes(value,type)):[...(node.type===type?[node]:[]),...Object.values(node).flatMap(value=>nodes(value,type))];
test('Font factories aliases and ordinary function arguments/results retain actual directed producers',()=>{
    const result=lower('function scale(value:image.Font){return image.scaledFont(value,2)} let first=image.font8;let alias=first;let second=scale(alias);let width=second.charWidth;let data=alias.data');
    assert.deepEqual(result.unsupported,[]);
    assert.equal(nodes(result.program,'SdkFontValue').length,1);
    assert.equal(nodes(result.program,'SdkFontCall').length,1);
    assert.deepEqual(nodes(result.program,'SdkFontField').map(node=>node.name),['charWidth','data']);
});
test('lexical namespace shadows never acquire Font factory authority',()=>{
    for(const source of ['let image:any;let first=image.font8','function f(image:any){return image.font8}','function f(){let before=image.font8;let image:any;return before}','if(true){let image:any;let first=image.font8}','for(let image=0;image<1;image++){let value=image.font8}']){
        const result=lower(source);assert.equal(nodes(result.program,'SdkFontValue').length,0,source);assert.equal(nodes(result.program,'SdkFontCall').length,0,source);
    }
});
test('annotation assertion opaque writers and unknown producer results do not supply Font authority',()=>{
    for(const source of ['let font:image.Font;let width=font.charWidth','let font=image.font8;font=unknown();let width=font.charWidth','let font=image.font8;let width=(<image.Font><any>unknown()).charWidth','let imageFont=image.scaledFont(unknown(),2)','function f():image.Font{return unknown()}let font:image.Font=f();let width=font.charWidth']){
        const result=lower(source);assert.ok(result.unsupported.length||nodes(result.program,'SdkFontField').length===0,source);
    }
});
test('record and shared glyph mutation are explicit read-slice refusals',()=>{
    for(const source of ['let font=image.font8;font.charWidth=9','image.font5.charHeight++','let font=image.font8;let data=font.data;data.setNumber(NumberFormat.UInt8LE,0,1)','image.font8.data.fill(0)','image.font8.data[0]=1'])assert.ok(lower(source).unsupported.length,source);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {parseMakeCodeTs} from '../overlay/scratch-gui/src/lib/bw-makecode/ts-import.js';
import {lowerSdkFontValues} from '../overlay/scratch-gui/src/lib/bw-makecode/lower-sdk-font-values.js';
const lower=source=>lowerSdkFontValues(parseMakeCodeTs(source));
const fonts=(node,kind)=>nodes(node,'Call').filter(value=>value.bwFontIntrinsic===kind);
const nodes=(node,type)=>!node||typeof node!=='object'?[]:Array.isArray(node)?node.flatMap(value=>nodes(value,type)):[...(node.type===type?[node]:[]),...Object.values(node).flatMap(value=>nodes(value,type))];
test('Font factories aliases and ordinary function arguments/results retain actual directed producers',()=>{
    const result=lower('function scale(value:image.Font){return image.scaledFont(value,2)} let first=image.font8;let alias=first;let second=scale(alias);let width=second.charWidth;let data=alias.data');
    assert.deepEqual(result.unsupported,[]);
    assert.equal(fonts(result.program,'constant').length,1);
    assert.equal(fonts(result.program,'scaledFont').length,1);
    assert.deepEqual(fonts(result.program,'field').map(node=>node.args[1].value),['charWidth','data']);
});
test('lexical namespace shadows never acquire Font factory authority',()=>{
    for(const source of ['let image:any;let first=image.font8','function f(image:any){return image.font8}','function f(){let before=image.font8;let image:any;return before}','if(true){let image:any;let first=image.font8}','for(let image=0;image<1;image++){let value=image.font8}']){
        const result=lower(source);assert.equal(fonts(result.program,'constant').length,0,source);assert.equal(fonts(result.program,'scaledFont').length,0,source);
    }
});
test('annotation assertion opaque writers and unknown producer results do not supply Font authority',()=>{
    for(const source of ['let font:image.Font;let width=font.charWidth','let font=image.font8;font=unknown();let width=font.charWidth','let font=image.font8;let width=(<image.Font><any>unknown()).charWidth','let imageFont=image.scaledFont(unknown(),2)','function f():image.Font{return unknown()}let font:image.Font=f();let width=font.charWidth']){
        const result=lower(source);assert.ok(result.unsupported.length||fonts(result.program,'field').length===0,source);
    }
});
test('record and shared glyph mutation are explicit read-slice refusals',()=>{
    for(const source of ['let font=image.font8;font.charWidth=9','image.font5.charHeight++','let font=image.font8;let data=font.data;data.setNumber(NumberFormat.UInt8LE,0,1)','image.font8.data.fill(0)','image.font8.data[0]=1'])assert.ok(lower(source).unsupported.length,source);
});

test('missing arguments and fallthrough cannot borrow Font authority from another invocation',()=>{
    for(const source of ['function pass(font?:image.Font){return font}let good=pass(image.font8);let bad=pass();let width=bad.charWidth','function maybe(flag:boolean){if(flag)return image.font8}let good=maybe(true);let bad=maybe(false);let width=bad.charWidth']){
        const result=lower(source);assert.ok(result.unsupported.some(message=>/producer authority/.test(message)),source);assert.equal(fonts(result.program,'field').length,0);
    }
    const valid=lower('function either(flag:boolean){if(flag)return image.font5;else return image.font8}let font=either(false);let width=font.charWidth');
    assert.deepEqual(valid.unsupported,[]);assert.equal(fonts(valid.program,'field').length,1);
});

import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
const projectWithFontReport=(opcode,inputs,extra={})=>({targets:[{isStage:true,name:'Stage',variables:{value:['value',0]},lists:{},broadcasts:{},costumes:[],sounds:[],blocks:{
    hat:{opcode:'arcade_whenSourceStarts',topLevel:true,next:'set',inputs:{},fields:{}},
    set:{opcode:'data_setvariableto',parent:'hat',next:null,inputs:{VALUE:[1,'font']},fields:{VARIABLE:['value','value']}},
    font:{opcode,parent:'set',inputs,fields:{},...extra},
    builtin:{opcode:'arcade_fontValue',parent:'font',inputs:{},fields:{FONT:['font8']},shadow:false},
    text:{opcode:'text',parent:'font',inputs:{},fields:{TEXT:['2']},shadow:true},
    number:{opcode:'math_number',parent:'font',inputs:{},fields:{NUM:['3']},shadow:true}
}}]});
test('serialized Font operands refuse mismatched primitive domains and dynamic fixed selectors',()=>{
    const cases=[
        [projectWithFontReport('arcade_scaleFont',{FONT:[1,'builtin'],SIZE:[1,'text']}),/SIZE requires a proven number/],
        [projectWithFontReport('arcade_fontForText',{TEXT:[1,'number']}),/TEXT requires a proven string/],
        [projectWithFontReport('arcade_fontValue',{FONT:[1,'text']},{fields:{FONT:['font8']}}),/fixed builtin selection/]
    ];
    for(const [project,diagnostic]of cases)assert.ok(projectToArcade(project).unsupported.some(message=>diagnostic.test(message)));
    const valid=projectToArcade(projectWithFontReport('arcade_scaleFont',{FONT:[1,'builtin'],SIZE:[1,'number']}));assert.deepEqual(valid.unsupported,[]);
});

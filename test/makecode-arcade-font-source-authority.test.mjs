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

test('every Font print input uses actual Image and primitive domains',()=>{
    const build=center=>{
        const project=projectWithFontReport('arcade_fontValue',{}, {fields:{FONT:['font8']}}),target=project.targets[0],blocks=target.blocks;
        blocks.font={opcode:center?'arcade_printImageFontCenter':'arcade_printImageFont',parent:'hat',inputs:{IMAGE:[1,'image'],TEXT:[1,'label'],X:[1,'number'],Y:[1,'number'],COLOR:[1,'number'],FONT:[1,'builtin']},fields:{}};blocks.hat.next='font';delete blocks.set;
        blocks.label={opcode:'text',parent:'font',inputs:{},fields:{TEXT:['A']},shadow:true};
        blocks.image={opcode:'arcade_createImage',parent:'font',inputs:{WIDTH:[1,'number'],HEIGHT:[1,'number']},fields:{},shadow:false};return project;
    };
    for(const center of [false,true]){
        assert.deepEqual(projectToArcade(build(center)).unsupported,[]);
        for(const name of center?['Y','COLOR']:['X','Y','COLOR']){const project=build(center);project.targets[0].blocks.font.inputs[name]=[1,'text'];assert.ok(projectToArcade(project).unsupported.some(message=>message.includes(name+' requires a proven number')));}
        const wrongImage=build(center);wrongImage.targets[0].blocks.font.inputs.IMAGE=[1,'builtin'];assert.ok(projectToArcade(wrongImage).unsupported.some(message=>/proven Image/.test(message)));
        const absentImage=build(center);delete absentImage.targets[0].blocks.font.inputs.IMAGE;assert.ok(projectToArcade(absentImage).unsupported.some(message=>/proven Image/.test(message)));
        const missingFont=build(center);delete missingFont.targets[0].blocks.font.inputs.FONT;assert.ok(projectToArcade(missingFont).unsupported.some(message=>/actual typed Font/.test(message)));
    }
});

import {sdkFontInputAuthority} from '../overlay/scratch-gui/src/lib/bw-makecode/sdk-font-input-authority.js';
test('directed Font input proof follows actual writers and unique procedure returns',()=>{
    const target={isStage:true,name:'Stage',variables:{font:['font',0]},blocks:{
        hat:{opcode:'arcade_whenSourceStarts',topLevel:true,next:'set',inputs:{},fields:{}},
        set:{opcode:'data_setvariableto',parent:'hat',next:'print',inputs:{VALUE:[1,'font']},fields:{VARIABLE:['font','font']}},
        font:{opcode:'arcade_fontValue',parent:'set',inputs:{},fields:{FONT:['font8']}},
        print:{opcode:'arcade_printImageFont',parent:'set',inputs:{FONT:[1,[12,'font','font']]},fields:{}}
    }},project={targets:[target]};
    assert.equal(sdkFontInputAuthority(project).accepts(target,target.blocks.print,'FONT','Font'),true);
    target.blocks.bad={opcode:'data_setvariableto',parent:'print',inputs:{VALUE:[1,'opaque']},fields:{VARIABLE:['font','font']}};target.blocks.print.next='bad';
    target.blocks.opaque={opcode:'unqualified_reporter',parent:'bad',inputs:{},fields:{}};
    assert.equal(sdkFontInputAuthority(project).accepts(target,target.blocks.print,'FONT','Font'),false,'every actual writer is considered');
    delete target.blocks.bad;delete target.blocks.opaque;delete target.blocks.print.next;
    const foreign={isStage:false,name:'Other',variables:{},blocks:{reader:{opcode:'arcade_printImageFont',topLevel:true,inputs:{FONT:[1,[12,'font','missing-id']]},fields:{}}}};
    project.targets.push(foreign);assert.equal(sdkFontInputAuthority(project).accepts(foreign,foreign.blocks.reader,'FONT','Font'),false);
    target.blocks.definition={opcode:'procedures_definition',topLevel:true,next:'return',inputs:{custom_block:[1,'prototype']},fields:{}};
    target.blocks.prototype={opcode:'procedures_prototype',parent:'definition',inputs:{},fields:{},mutation:{proccode:'actualFont',argumentnames:'[]'}};
    target.blocks.return={opcode:'arcade_returnValue',parent:'definition',inputs:{VALUE:[1,'returned']},fields:{}};
    target.blocks.returned={opcode:'arcade_fontValue',parent:'return',inputs:{},fields:{FONT:['font8']}};
    target.blocks.call={opcode:'arcade_callFunction',parent:'print',inputs:{ARGS:[1,[10,'[]']]},fields:{NAME:['actualFont']}};
    target.blocks.print.inputs.FONT=[1,'call'];
    assert.equal(sdkFontInputAuthority(project).accepts(target,target.blocks.print,'FONT','Font'),true);
    target.blocks.return.inputs.VALUE=[1,'recursive'];target.blocks.recursive={opcode:'arcade_callFunction',parent:'return',inputs:{ARGS:[1,[10,'[]']]},fields:{NAME:['actualFont']}};
    assert.equal(sdkFontInputAuthority(project).accepts(target,target.blocks.print,'FONT','Font'),false,'recursive return authority is not guessed');
});

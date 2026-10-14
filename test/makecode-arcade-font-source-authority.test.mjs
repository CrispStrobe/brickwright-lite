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


test('source Font print validates all actual Image and primitive producers',()=>{
    for(const center of [false,true]){
        const args=center?['"A"','0','3','f']:['"A"','0','0','3','f'];
        const source=(values,receiver='pic')=>'let f=image.font8;let pic=image.create(8,8);'+receiver+'.'+(center?'printCenter':'print')+'('+values.join(',')+')';
        assert.deepEqual(lower(source(args)).unsupported,[]);
        for(let i=0;i<args.length;i++){const bad=[...args];bad[i]=i===0?'3':i===args.length-1?'"font8"':'"bad"';assert.ok(lower(source(bad)).unsupported.length,source(bad));}
        assert.ok(lower(source(args,'f')).unsupported.some(message=>/Image producer/.test(message)));
        const opaque=source(args)+';pic=unknown()';assert.ok(lower(opaque).unsupported.some(message=>/Image producer/.test(message)));
    }
    const valid=lower('function picture(){return image.create(8,8)}function text(){return "A"}let f=image.font8;let pic=picture();pic.print(text(),-1,2+3,17,f)');assert.deepEqual(valid.unsupported,[]);
    const laundered=lower('let f=image.font8;let pic=image.create(8,8);pic=image.create("bad",8);pic.print("A",0,0,3,f)');assert.ok(laundered.unsupported.some(message=>/Image producer/.test(message)));
});

test('formal argument reporters share all actual setLocal writers with their procedure binding',()=>{
    const target={isStage:true,variables:{},blocks:{
        def:{opcode:'procedures_definition',topLevel:true,next:'write',inputs:{custom_block:[1,'proto']},fields:{}},
        proto:{opcode:'procedures_prototype',parent:'def',inputs:{},fields:{},mutation:{proccode:'identity %s',argumentnames:'["f"]'}},
        write:{opcode:'arcade_setLocal',parent:'def',next:'ret',inputs:{VALUE:[1,'number']},fields:{NAME:['f']}},
        number:{opcode:'math_number',parent:'write',inputs:{},fields:{NUM:['9']}},
        ret:{opcode:'arcade_returnValue',parent:'write',inputs:{VALUE:[1,'param']},fields:{}},
        param:{opcode:'argument_reporter_string_number',parent:'ret',inputs:{},fields:{VALUE:['f']}},
        hat:{opcode:'arcade_whenSourceStarts',topLevel:true,next:'print',inputs:{},fields:{}},
        print:{opcode:'arcade_printImageFont',parent:'hat',inputs:{FONT:[1,'call']},fields:{}},
        call:{opcode:'arcade_callFunction',parent:'print',inputs:{ARGS:[1,'args']},fields:{NAME:['identity %s']}},
        args:{opcode:'arcade_functionArgument',parent:'call',inputs:{VALUE:[1,'font'],REST:[1,[10,'[]']]},fields:{}},
        font:{opcode:'arcade_fontValue',parent:'args',inputs:{},fields:{FONT:['font8']}}
    }},project={targets:[target]};
    assert.equal(sdkFontInputAuthority(project).accepts(target,target.blocks.print,'FONT','Font'),false);
    target.blocks.write.inputs.VALUE=[1,'replacement'];target.blocks.replacement={opcode:'arcade_fontValue',parent:'write',inputs:{},fields:{FONT:['font5']}};
    assert.equal(sdkFontInputAuthority(project).accepts(target,target.blocks.print,'FONT','Font'),true);
});

test('Font local proof requires connected owners literal bindings and dominating first writes',()=>{
    const build=()=>({isStage:true,variables:{f:['f',0]},blocks:{
        hat:{opcode:'arcade_whenSourceStarts',topLevel:true,next:'write',inputs:{},fields:{}},
        write:{opcode:'arcade_setLocal',parent:'hat',next:'use',inputs:{VALUE:[1,'font']},fields:{NAME:['f']}},
        font:{opcode:'arcade_fontValue',parent:'write',inputs:{},fields:{FONT:['font8']}},
        use:{opcode:'arcade_printImageFont',parent:'write',inputs:{FONT:[1,'read']},fields:{}},
        read:{opcode:'arcade_getLocal',parent:'use',inputs:{},fields:{NAME:['f']}}
    }});
    const accepts=target=>sdkFontInputAuthority({targets:[target]}).accepts(target,target.blocks.use,'FONT','Font');
    assert.equal(accepts(build()),true);
    const early=build();early.blocks.hat.next='use';early.blocks.use.next='write';delete early.blocks.write.next;assert.equal(accepts(early),false);
    const disconnected=build();delete disconnected.blocks.hat;assert.equal(accepts(disconnected),false);
    const global=build();global.blocks.hat.next='use';global.blocks.write.opcode='data_setvariableto';global.blocks.write.fields={VARIABLE:['f','f']};delete global.blocks.write.next;global.blocks.read.opcode='data_variable';global.blocks.read.fields={VARIABLE:['f','f']};assert.equal(accepts(global),false);
    const names=build();names.blocks.write.inputs.NAME=[1,'unknown'];names.blocks.read.inputs.NAME=[1,'other'];names.blocks.unknown={opcode:'sensing_username',inputs:{},fields:{}};names.blocks.other={opcode:'sensing_answer',inputs:{},fields:{}};assert.equal(accepts(names),false);
    const capture=build();capture.blocks.use.next='capture';capture.blocks.capture={opcode:'arcade_setCaptured',parent:'use',inputs:{VALUE:[1,'number']},fields:{NAME:['f']}};capture.blocks.number={opcode:'math_number',parent:'capture',inputs:{},fields:{NUM:['9']}};assert.equal(accepts(capture),false);
    const unknown=build();unknown.blocks.write.next='dynamic';unknown.blocks.dynamic={opcode:'arcade_setLocal',parent:'write',next:'use',inputs:{NAME:[1,'computed'],VALUE:[1,'number']},fields:{}};unknown.blocks.computed={opcode:'sensing_answer',parent:'dynamic',inputs:{},fields:{}};unknown.blocks.number={opcode:'math_number',parent:'dynamic',inputs:{},fields:{NUM:['9']}};assert.equal(accepts(unknown),false);
});

test('source Font reads cannot borrow later or branch-only initialization',()=>{
    for(const source of [
        'let font:image.Font;let width=font.charWidth;font=image.font8',
        'function read(){let font:image.Font;let width=font.charWidth;font=image.font8;return width}let result=read()',
        'let font:image.Font;let alias=font;font=image.font8;let width=alias.charWidth',
        'let font:image.Font;if(true)font=image.font8;let width=font.charWidth',
        'let font:image.Font;while(false){font=image.font8}let width=font.charWidth',
        'let font:image.Font;let ignored=true?(font=image.font8):0;let width=font.charWidth',
        'let font:image.Font;let ignored=false&&(font=image.font8);let width=font.charWidth'
    ])assert.ok(lower(source).unsupported.some(message=>/producer authority/.test(message)),source);
    for(const source of [
        'let font:image.Font;font=image.font8;let width=font.charWidth',
        'function read(){let font:image.Font;font=image.font8;return font.charWidth}let result=read()',
        'let font:image.Font;if(true)font=image.font5;else font=image.font8;let width=font.charWidth'
    ])assert.deepEqual(lower(source).unsupported,[],source);
});

test('recursive source Font producers retain an explicit unproved-result boundary',()=>{
    const result=lower('function font(flag:boolean):image.Font{if(flag)return image.font8;else return font(true)}let result=font(false);let width=result.charWidth');
    assert.ok(result.unsupported.some(message=>/producer authority/.test(message)));assert.equal(fonts(result.program,'field').length,0);
});

test('compound and update writes retain actual binding authority after per-read initialization',()=>{
    for(const operation of ['f+=1','f++','--f'])assert.ok(lower('let f=image.font8;'+operation+';let width=f.charWidth').unsupported.length,operation);
    assert.deepEqual(lower('let f=image.font8;let pic=image.create(8,8);let x=0;x+=1;x++;pic.print("A",x,0,3,f)').unsupported,[]);
    assert.ok(lower('let f=image.font8;let pic=image.create(8,8);let x=0;x+="bad";pic.print("A",x,0,3,f)').unsupported.some(message=>/Number producer/.test(message)));
});


test('optional Font multiplier reads do not provide a guaranteed Number operand',()=>{
    assert.deepEqual(lower('let f=image.font8;let multiplier=f.multiplier').unsupported,[]);
    assert.ok(lower('let f=image.font8;let next=image.scaledFont(f,f.multiplier)').unsupported.some(message=>/Number producer/.test(message)));
    assert.ok(lower('let f=image.font8;let pic=image.create(8,8);pic.print("A",f.multiplier,0,3,f)').unsupported.some(message=>/Number producer/.test(message)));
});


test('ordinary class print methods without Font or Image producers retain their own method scope',()=>{
    assert.deepEqual(lower('class Printer{constructor(){}print(a:number,b:number,c:number,d:number,e:number):number{return a+b+c+d+e}}let printer=new Printer();let value=printer.print(1,2,3,4,5)').unsupported,[]);
    assert.deepEqual(lower('class Reader{constructor(){}print(a:number,b:number,c:number,d:number,font:image.Font){return a}}let reader=new Reader();let alias=reader;let font=image.font8;let value=alias.print(1,2,3,4,font)').unsupported,[]);
    assert.deepEqual(lower('class Reader{constructor(){}print(font:image.Font){return font.charWidth}}let reader=new Reader();let value=reader.print(image.font8)').unsupported,[]);
    assert.ok(lower('class Reader{constructor(){}}let receiver:any=new Reader();receiver=image.create(8,8);receiver.print("A",0,0,3,image.font8)').unsupported.some(message=>/Image producer/.test(message)));
    for(const collision of ['function Reader(){return image.create(8,8)}','let Reader:any=image.create(8,8)'])assert.ok(lower('class Reader{constructor(){}}'+collision+'let receiver=new Reader();receiver.print("A",0,0,3,image.font8)').unsupported.some(message=>/Image producer/.test(message)));
});


test('SDK screen and Image dimensions plus primitive concatenation provide actual Font print inputs',()=>{
    for(const source of [
        'let charge=3;let maximum=5;let energy="energy: "+charge+"/"+maximum;let y=screen.height-image.font5.charHeight-1;screen.print(energy,0,y,3,image.font5)',
        'let charge=3;function recharge(){charge++}game.onPaint(function(){let energy="energy: "+charge;let y=screen.height-image.font5.charHeight-1;screen.print(energy,screen.width-40,y,3,image.font5)})',
        'let pic=image.create(8,8);pic.print("width: "+pic.width,0,pic.height-1,3,image.font5)'
    ])assert.deepEqual(lower(source).unsupported,[],source);
});
test('shadowed screen and opaque dimensions or concatenation never gain Font print authority',()=>{
    for(const source of [
        'screen=unknown();screen.print("A",0,0,3,image.font5)',
        'screen=image.create(8,8);screen.print("A",0,0,3,image.font5)',
        'let screen:any;screen.print("A",0,0,3,image.font5)',
        'function draw(screen:any){screen.print("A",0,0,3,image.font5)}',
        'function draw(){screen.print("A",0,0,3,image.font5);let screen:any}',
        'if(true){let screen:any;screen.print("A",0,0,3,image.font5)}',
        'let pic=image.create(8,8);pic=unknown();pic.print("A",0,pic.height,3,image.font5)',
        'screen.print("energy: "+unknown(),0,0,3,image.font5)',
        'screen.print("font: "+image.font5,0,0,3,image.font5)',
        'screen.print("A",0,unknown().height,3,image.font5)'
    ])assert.ok(lower(source).unsupported.length,source);
});

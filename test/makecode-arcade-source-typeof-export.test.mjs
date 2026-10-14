import test from 'node:test';
import assert from 'node:assert/strict';
import Creator from '../overlay/scratch-gui/src/lib/sb3-creator.js';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
const make=source=>{
    const converted=arcadeToPseudocode(source);assert.deepEqual(converted.unsupported,[]);
    const creator=new Creator();creator.parse(converted.code);assert.deepEqual(creator.warnings,[]);return creator.project;
};
test('source typeof export keeps String results separate from admitted operand types',()=>{
    for(const declaration of [
        'let value=17','let value=false','let value="arcade:1"','let value:number',
        'let value=[1,2]','let value=image.create(2,1)','let value=control.createBuffer(0)',
        'class Box { constructor(){} } let value=new Box()',
        'function value(){return "雪"} let result=typeof value()'
    ]){
        const project=make(declaration.includes('let result=')?declaration:`${declaration}\nlet result=typeof value`);
        const exported=projectToArcade(project);assert.deepEqual(exported.unsupported,[],declaration);
        assert.match(exported.ts,/typeof /,declaration);
        assert.match(exported.ts,/let \w*result: string/,declaration);
    }
});
test('BW connected Sprite, Scene, player, animation and callable operands refuse typeof export',()=>{
    for(const opcode of ['arcade_createSprite','arcade_currentScene','arcade_playerLookup','arcade_createAnimation','arcade_createCallable']){
        const project=make('let result=typeof "arcade:1"');
        const target=project.targets.find(target=>Object.values(target.blocks).some(block=>block.opcode==='arcade_sourceTypeOf'));
        const reporter=Object.values(target.blocks).find(block=>block.opcode==='arcade_sourceTypeOf');
        target.blocks.opaque={opcode,inputs:{},fields:{},parent:reporter.id,shadow:false,topLevel:false};
        reporter.inputs.VALUE=[2,'opaque'];
        const exported=projectToArcade(project);
        assert.ok(exported.unsupported.some(message=>/source typeof export requires/.test(message)),opcode);
    }
});
test('unknown assignment cannot borrow String authority from another write',()=>{
    const project=make('let value="arcade:1"\nlet result=typeof value');
    const target=project.targets.find(target=>Object.values(target.blocks).some(block=>block.opcode==='arcade_sourceTypeOf'));
    const assignment=Object.values(target.blocks).find(block=>block.opcode==='data_setvariableto' && block.fields.VARIABLE[0]==='value');
    target.blocks.unknown={opcode:'arcade_createCallable',inputs:{},fields:{},parent:assignment.id,shadow:false,topLevel:false};
    assignment.inputs.VALUE=[2,'unknown'];
    const exported=projectToArcade(project);
    assert.ok(exported.unsupported.some(message=>/source typeof export requires/.test(message)));
});

test('BW class declaration ancestry cannot launder a native Sprite carrier into typeof export',()=>{
    const project=make('class Box {constructor(){}} let value=new Box();let result=typeof value');
    const target=project.targets.find(target=>Object.values(target.blocks).some(block=>block.opcode==='arcade_declareClass'));
    const declaration=Object.values(target.blocks).find(block=>block.opcode==='arcade_declareClass');
    declaration.opcode='arcade_declareSubclass';declaration.inputs.BASE=[1,[10,'Sprite']];
    const exported=projectToArcade(project);
    assert.ok(exported.unsupported.some(message=>/source typeof export requires/.test(message)));
    const ordinary=projectToArcade(make('class Sprite {constructor(){}} let value=new Sprite();let result=typeof value'));
    assert.deepEqual(ordinary.unsupported,[]);
});

test('BW class field annotations cannot supply opaque member typeof export authority',()=>{
    const project=make('class Box {text:string;constructor(){this.text="abc"}} let box=new Box();let result=typeof "abc"');
    const target=project.targets.find(target=>Object.values(target.blocks).some(block=>block.opcode==='arcade_sourceTypeOf'));
    const reporter=Object.values(target.blocks).find(block=>block.opcode==='arcade_sourceTypeOf');
    const variable=Object.values(target.blocks).find(block=>block.opcode==='data_setvariableto' && block.fields.VARIABLE[0]==='box').fields.VARIABLE;
    target.blocks.member={opcode:'arcade_objectField',inputs:{OBJECT:[3,[12,variable[0],variable[1]],[4,'0']],FIELD:[1,[10,'text']]},fields:{},parent:reporter.id,shadow:false,topLevel:false};
    reporter.inputs.VALUE=[2,'member'];
    const exported=projectToArcade(project);assert.ok(exported.unsupported.some(message=>/source typeof export requires/.test(message)));
});

test('mixed local Array receivers keep array dispatch without changing an independently typed local',()=>{
    const creator=new Creator();creator.parse(`DEVICE ARCADE
SPRITE Mixed:
WHEN flag clicked:
  arcade set local value to (0 + (0))
  arcade set local value to (new array reference from "[]")
  mutate array reference (arcade local value) op "push" index 0 value (0 + (1))
SPRITE Typed:
WHEN flag clicked:
  arcade set local value to (new array reference from "[]")
  mutate array reference (arcade local value) op "push" index 0 value (0 + (2))`);
    assert.deepEqual(creator.warnings,[]);
    const exported=projectToArcade(creator.project);assert.deepEqual(exported.unsupported,[]);
    assert.match(exported.ts,/let value: any = 0/);
    assert.match(exported.ts,/__bwArrayAccess\(value\)\.push\(\(0 \+ 1\)\)/);
    assert.match(exported.ts,/value\.push\(\(0 \+ 2\)\)/);
});

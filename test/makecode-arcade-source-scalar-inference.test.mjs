import test from 'node:test';
import assert from 'node:assert/strict';
import {parseMakeCodeTs} from '../overlay/scratch-gui/src/lib/bw-makecode/ts-import.js';
import {sourceScalarDeclarations} from '../overlay/scratch-gui/src/lib/bw-makecode/source-scalar-declarations.js';
const infer = source => Object.fromEntries(sourceScalarDeclarations(parseMakeCodeTs(source)).map(({name, type}) => [name, type]));
test('scalar copies and invocation results do not flow backward into Boolean source cells', () => {
    assert.deepEqual(infer('let yes=true;let no=false;function tap(n:number){return n};let result=tap(1);let lazy=yes&&2;lazy=3'), {yes:'Boolean',no:'Boolean',result:'Number',lazy:'Any'});
    assert.deepEqual(infer('let first=1;let alias=first;alias="text"'), {first:'Number',alias:'Any'});
});
test('explicit scalar declarations persist while unknown references are not guessed', () => {
    assert.deepEqual(infer('let before:boolean;let count:number;let label:string;let dynamic:any;let actor=sprites.create(img`1`,SpriteKind.Player);let list=[1]'), {before:'Boolean',count:'Number',label:'String',dynamic:'Any'});
});

test('image templates cannot disappear from logical scalar flow', () => {
    assert.deepEqual(infer('let a=img`3`;let b=img`5`;let selected=(false&&a)||b;let condition=true;let mixed=condition&&a;let unknown=false||assets.image`missing`'), {condition:'Boolean'});
});

test('typed reference cells and parameters cannot disappear from scalar joins',()=>{
    assert.deepEqual(infer('let image:Image;let sprite:Sprite;let values:number[];let a=false||image;let b=true&&sprite;let c=false||values;function select(value:Image){return false||value};let d=select(image);let unknown:Missing;let e=false||unknown;let explicit:any;let f=false||explicit'),{explicit:'Any'});
});

test('string member results keep directed scalar declarations from actual receivers',()=>{
    assert.deepEqual(infer('let text="abc";let n=text.length;let c=text.charAt(1);let copy=c;let more=copy.length'),
        {text:'String',n:'Number',c:'String',copy:'String',more:'Number'});
    assert.deepEqual(infer('let value=123;let n=(""+value).length;let c=(""+value).charAt(1)'),
        {value:'Number',n:'Number',c:'String'});
});

test('unknown and mixed receivers cannot lend String member result authority',()=>{
    for(const receiver of ['mystery()','[1,2]','1','true','undefined','null']) {
        assert.deepEqual(infer(`let n=(${receiver}).length;let c=(${receiver}).charAt(0)`),{});
    }
    assert.deepEqual(infer('let text="a";text=mystery();let n=text.length;let c=text.charAt(0)'),{});
    assert.deepEqual(infer('let text="a";text=1;let n=text.length;let c=text.charAt(0)'),{text:'Any'});
    assert.deepEqual(infer('let text="a";let wrong=text.charAt();let extra=text.charAt(0,1);let built=new text.charAt(0)'),{text:'String'});
});

test('nullable, computed and argument-mutated receivers retain unknown member results',()=>{
    for(const value of ['undefined','null']) {
        assert.deepEqual(infer(`let text="a";text=${value};let n=text.length;let c=text.charAt(0)`),{text:'String'});
    }
    assert.deepEqual(infer('let text="a";let n=text["length"];let c=text["charAt"](0)'),{text:'String'});
    assert.deepEqual(infer('let text="a";let c=text.charAt(text=mystery());let n=text.length'),{});
    assert.deepEqual(infer('let text="a";let c=text.charAt(text=1);let n=text.length'),{text:'Any'});
});

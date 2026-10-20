import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';

const cases = [
    ['number', 'let value = 17'],
    ['boolean', 'let value = false'],
    ['string', 'let value = "[1,2]雪🙂"'],
    ['undefined', 'let value: number'],
    ['array', 'let value = [1, 2]'],
    ['Image', 'let value = image.create(2, 1)'],
    ['Buffer', 'let value = control.createBuffer(0)'],
    ['class', 'class Box { constructor() {} } let value = new Box()']
];
test('source typeof retains its operator and independent String result for proven operands', () => {
    for (const [name, declaration] of cases) {
        const converted = arcadeToPseudocode(`${declaration}\nlet result = typeof value`);
        assert.deepEqual(converted.unsupported, [], name);
        assert.match(converted.code, /arcade source type of \(/, name);
        assert.match(converted.code, /declare Arcade source scalar result as String/i, name);
    }
});
test('source typeof preserves lexical names and one authored operand evaluation', () => {
    const converted = arcadeToPseudocode('let calls=0\nfunction String(){calls+=1;return 7}\nlet result=typeof String()');
    assert.deepEqual(converted.unsupported, []);
    assert.equal((converted.code.match(/arcade call function "String" arguments/g) || []).length, 1);
    assert.match(converted.code, /arcade source type of/);
});
test('source typeof refuses Sprite, callable and opaque operand authority', () => {
    for (const source of [
        'let value=sprites.create(img`1`,SpriteKind.Player)\nlet result=typeof value',
        'function value(){return 1}\nlet result=typeof value',
        'function query(value:any){return typeof value}\nlet result=query({})'
    ]) {
        const converted = arcadeToPseudocode(source);
        assert.ok(converted.unsupported.some(message => /Source typeof requires/.test(message)), source);
    }
});

test('source typeof Any annotation gains authority only from proven actual argument flow', () => {
    const primitive = arcadeToPseudocode('function query(value:any){return typeof value}\nlet result=query(1)');
    assert.deepEqual(primitive.unsupported, []);
    assert.match(primitive.code, /arcade source type of/);
    const opaque = arcadeToPseudocode('let known=[1]\nlet unknown:any\nlet value=known\nvalue=unknown\nlet result=typeof value');
    assert.ok(opaque.unsupported.some(message=>/Source typeof requires/.test(message)));
});

test('Sprite-backed class ancestry and casts never acquire managed-object typeof authority',()=>{
    for(const base of ['Sprite','sprites.ExtendableSprite'])for(const use of [
        'typeof actor','typeof alias','query(actor)','typeof (<Box><any>actor)'
    ]){
        const converted=arcadeToPseudocode(`class Box {constructor(){}}\nclass Actor extends ${base} {constructor(){super(img\`1\`)}}\nlet actor=new Actor();let alias=actor;function query(value:any){return typeof value}\nlet result=${use}`);
        assert.ok(converted.unsupported.some(message=>/Sprite-backed class carriers/.test(message)),base+' '+use);
    }
    const shadow=arcadeToPseudocode('class Sprite {constructor(){}} let value=new Sprite();let result=typeof value');
    assert.deepEqual(shadow.unsupported,[]);
});

test('class member annotations do not replace actual typeof producer authority',()=>{
    for(const expression of ['box.text','saved','box.read()']){
        const converted=arcadeToPseudocode(`class Box {text:string;constructor(){this.text="abc"}read():string{return this.text}} let box=new Box();let saved=box.text;let result=typeof ${expression}`);
        assert.ok(converted.unsupported.some(message=>/Source typeof requires/.test(message)),expression);
    }
});

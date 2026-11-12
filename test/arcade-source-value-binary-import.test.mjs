import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';

test('source arithmetic keeps Array and primitive writer unions distinct from native helpers and opaque domains',()=>{
    for(const source of [
        'let a:any=0; a=[5]; let text=a+"!"',
        'let a:any=null; a=[5]; let alias=a; let text="!"+alias',
        'let a:any=false; if(true){a=[5]} let alias=a; let text=alias+2'
    ]){
        const imported=arcadeToPseudocode(source);
        assert.deepEqual(imported.unsupported,[],source);
        assert.match(imported.code,/arcade source value/);
    }
    const scalar=arcadeToPseudocode('let a:any=0; a=5; let text=a+"!"');
    assert.deepEqual(scalar.unsupported,[]);assert.doesNotMatch(scalar.code,/arcade source value/);
    for(const source of [
        'let a:any=foreign(); a=[5]; let text=a+"!"',
        'let a:any={}; a=[5]; let text=a+"!"'
    ]){
        const imported=arcadeToPseudocode(source);
        assert.ok(imported.unsupported.some(reason=>reason.includes('Arcade source Array arithmetic requires')),JSON.stringify(imported.unsupported));
        assert.doesNotMatch(imported.code,/arcade source value/);
    }
});

test('source bitwise and complement retain Array identities and primitive unions without changing primitive-only operators',()=>{
    for(const op of ['&','|','^','<<','>>','>>>'])for(const reverse of [false,true]){
        const source=`let a:any=0;a=[5];let alias=a;let result=${reverse?'2 '+op+' alias':'alias '+op+' 2'}`;
        const imported=arcadeToPseudocode(source);
        assert.deepEqual(imported.unsupported,[],source);
        assert.match(imported.code,/arcade source value/);
        assert.ok(imported.code.includes(`op "${op}"`));
    }
    for(const source of [
        'let a:any=null;a=[];let result=~a',
        'let a:any=[[5]];let alias=a;let result=~alias',
        'let storage:any[]=[];storage.push(storage);let a:any=storage;let result=~a'
    ]){const imported=arcadeToPseudocode(source);assert.deepEqual(imported.unsupported,[],source);assert.match(imported.code,/arcade source unary "~" of/);}
    const scalar=arcadeToPseudocode('let a:any=5;let result=(a&3)|(~a);let shift=a>>>1');
    assert.deepEqual(scalar.unsupported,[]);assert.doesNotMatch(scalar.code,/arcade source (?:value|unary)/);
    for(const source of [
        'let a:any;a=5;let result=a&3;let complement=~a',
        'let result=SpriteKind.Player&1;let complement=~SpriteKind.Player',
        'let a:any;let result=a&3;let complement=~a;a=5'
    ]){const imported=arcadeToPseudocode(source);assert.deepEqual(imported.unsupported,[],source);assert.doesNotMatch(imported.code,/arcade source (?:value|unary)/);}
});

test('possible Array bitwise operands refuse unknown, object and SDK Sprite unions without annotation authority',()=>{
    for(const source of [
        'let a:any=foreign();a=[5];let result=a&1',
        'let a:any;a=[5];let result=a&1;a=foreign()',
        'let a:any;a=[5];let result=~a;a={}',
        'let a:any={};a=[5];let result=1|a',
        'let a:any={};a=[];let result=~a',
        'let a:any=sprites.create(img`1`,SpriteKind.Player);a=[5];let result=a^1'
    ]){
        const imported=arcadeToPseudocode(source);
        assert.ok(imported.unsupported.some(reason=>reason.includes('Arcade source Array bitwise operation requires')),JSON.stringify(imported.unsupported));
        assert.doesNotMatch(imported.code,/arcade source (?:value|unary)/);
    }
    const helper='function ordinary(left:any,right:any):number{return left&right};';
    for(const source of ['let rows:any=[];rows=foreign();let answer=ordinary(rows,1);','let rows:any=[5];let answer=ordinary(rows,1);rows={};']){
        const imported=arcadeToPseudocode(helper+source);assert.ok(imported.unsupported.some(reason=>reason.includes('Arcade source Array bitwise operation requires')),JSON.stringify(imported.unsupported));
    }
    const unknown=arcadeToPseudocode(helper+'let value:any=foreign();let answer=ordinary(value,1);');
    assert.ok(unknown.unsupported.some(reason=>reason.includes('Bitwise operation requires proven primitive operands')),JSON.stringify(unknown.unsupported));
    for(const source of ['let a:any;a=5;let result=a&3;a=foreign()','let a:any;a=5;let result=~a;a={}']){
        const imported=arcadeToPseudocode(source);assert.ok(imported.unsupported.some(reason=>reason.includes('Bitwise operation requires proven primitive operands')),JSON.stringify(imported.unsupported));
    }
});

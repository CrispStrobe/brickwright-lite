import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseMakeCodeTs} from '../overlay/scratch-gui/src/lib/bw-makecode/ts-import.js';
import {callableSourceGate} from '../overlay/scratch-gui/src/lib/bw-makecode/callable-source-gate.js';
const gate=source=>callableSourceGate(parseMakeCodeTs(source,{retainCallableMetadata:true,parameterDefaults:true}));
const factory='function counter(seed:number):()=>number {let value=seed;return()=>{value+=7;return value}}';
test('semantic callable gate accepts renamed numeric factories and distinct increments',()=>{
    for(const [name,param,local,increment] of [['counter','seed','value',7],['advance','initial','total',2],['next','score','current',3]]) {
        const source=`function ${name}(${param}:number):()=>number {let ${local}=${param};return()=>{${local}+=${increment};return ${local}}} let a=${name}(4);let alias=a;let b=${name}(8);let x=a();let y=alias();let z=b();`;
        assert.equal(gate(source).eligible,true,JSON.stringify(gate(source)));
    }
});
test('unqualified adjacent closures and broader callable forms remain named refusals',()=>{
    for(const source of [
        factory.replace('seed:number','seed:number=2'),
        factory.replace('seed:number','seed?:number'),
        factory.replace('return()=>','return function()'),
        factory.replace('let value=seed','const value=seed').replace('value+=7;',''),
        factory.replace('value+=7;','if(value>0)value+=7;'),
        factory.replace('()=>number','(n:number)=>number').replace('return()=>','return(n:number)=>'),
        factory+' controller.A.onEvent(ControllerButtonEvent.Pressed,()=>{info.setScore(2)});',
        factory+' function unrelated():number{return 2}',
        factory.replace('return()=>{value+=7;return value}','return()=>()=>value')
    ]) {
        const result=gate(source);
        assert.equal(result.eligible,false,source);assert.ok(result.unsupported.length,source);
        assert.match(result.unsupported.join(';'),/Callable source gate/);
    }
});
test('ordinary programs without a returned callable retain their existing conversion path',()=>{
    assert.deepEqual(gate('controller.A.onEvent(ControllerButtonEvent.Pressed,()=>{info.setScore(2)});'),{eligible:false,unsupported:[]});
});
test('normalized numeric export uses structural helpers and dominating local assignment',()=>{
    const helper='function sum(left:any,right:any):any{return left+right}';
    const normalized='function advance(seed:number):()=>number{let value:number=undefined;value=seed;return()=>{value=sum(value,7);return value}}let first=advance(2);let alias=first;let result=alias();';
    assert.deepEqual(gate(helper+normalized),{eligible:true,unsupported:[]});
    for(const source of [
        helper+normalized.replace('value=seed;',''),
        helper+normalized.replace('value=seed;','value=value;'),
        helper+normalized.replace('sum(value,7)','sum(value,"7")'),
        helper+normalized+'let mixed=sum("x",2);',
        helper+normalized+'let unknown;let opaque=sum(unknown,2);',
        helper.replace('return left+right','info.setScore(2);return left+right')+normalized,
        helper.replace('left+right','left-right+2')+normalized,
        helper+normalized+'let saved=sum;',
        helper.replace('left:any','left:any=2')+normalized
    ]) {
        const result=gate(source);assert.equal(result.eligible,false,source);
        assert.ok(result.unsupported.length,source);
    }
});

test('factory signatures do not grant authority to missing or nonnumeric actual arguments',()=>{
    for(const actual of ['', 'undefined', 'null', '"2"', 'true', '2,3']) {
        const result=gate(factory+`let first=counter(${actual});let answer=first();`);
        assert.equal(result.eligible,false,actual);
        assert.match(result.unsupported.join(';'),/factory call.*concrete numeric/);
    }
});

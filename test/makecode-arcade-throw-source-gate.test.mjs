import test from 'node:test';
import assert from 'node:assert/strict';
import {parseMakeCodeTs} from '../overlay/scratch-gui/src/lib/bw-makecode/ts-import.js';
import {prepareThrowSource} from '../overlay/scratch-gui/src/lib/bw-makecode/throw-source-gate.js';
const proof=source=>prepareThrowSource(parseMakeCodeTs(source,{retainCallableMetadata:true,retainParentheses:true}));
test('Throw source gate accepts actual primitive main and ordinary call/branch producers',()=>{
 for(const source of ['throw 20;','throw "20";','throw true;','throw null;','throw undefined;','function fail(value){throw value}fail(20);','function fail(value){if(value)throw "failure";return 7}let result=fail(true);','function fail(){throw 20}function outer(){fail()}outer();','controller.A.onEvent(ControllerButtonEvent.Pressed,()=>{throw 20});']){
  assert.deepEqual(proof(source).unsupported,[],source);
 }
});
test('Throw source gate refuses opaque, unknown, malformed and incompatible caller contexts',()=>{
 const negatives=[
  'throw unknown;','function fail(value:number){throw value}fail(image.create(1,1));','function fail(value:number){throw value}',
  'function fail(){throw 20}fail=other;fail();','function fail(){throw 20}function fail(){throw 21}fail();',
  'function fail(){throw 20}let alias=fail;alias();','function fail(){throw 20}let value=new fail();',
  'let input=[1];let values=input.map(value=>{throw 20;return value});',
  'function fail(){throw 20}let input=[1];let values=input.map(value=>{fail();return value});',
  'class Reader{constructor(){throw 20}}let reader=new Reader();',
  'game.onUpdate(()=>{throw 20});','sprites.onCreated(SpriteKind.Player,sprite=>{throw 20});',
  'let controller:any={};controller.A.onEvent(ControllerButtonEvent.Pressed,()=>{throw 20});',
  'controller.A.onEvent=other;controller.A.onEvent(ControllerButtonEvent.Pressed,()=>{throw 20});',
  'let alias=controller.A;controller.A.onEvent(ControllerButtonEvent.Pressed,()=>{throw 20});',
  'let event:any=0;controller.A.onEvent(event,()=>{throw 20});',
  'while(true){throw 20}','function fail(){throw 20}while(true){fail()}',
  'let value:number;throw value;value=20;','function fail(){throw value}let value=20;fail();',
  'throw 20;function fail(value){throw value}fail(7);',
  'function read(){return value}let value:number;throw read();value=20;',
  'function fail(value,value){throw value}fail(1,2);',
  'function fail(value){throw value}fail();',
  'function fail(value=20){throw value}fail();',
  'function fail<T>(){throw 20}fail();'
 ];
 for(const source of negatives)assert.ok(proof(source).unsupported.some(message=>message.startsWith('Throw source:')),source);
});
test('ordinary no-Throw source analysis and AST are untouched',()=>{
 const program=parseMakeCodeTs('function helper(x){return x+1}let value=helper(2);');const before=JSON.stringify(program),result=prepareThrowSource(program);
 assert.equal(result.program,program);assert.equal(result.present,false);assert.deepEqual(result.unsupported,[]);assert.equal(JSON.stringify(program),before);
});

test('ordinary formal and result constraints use full-source facts without normal producer grants',()=>{
 for(const source of [
  'function fail(value:number){throw value}fail("bad");',
  'function read():number{return "bad"}throw read();',
  'function fail():number{throw 20;return "bad"}fail();',
  'function fail(value:number){throw 20;value="bad"}fail(7);',
  'function read():number{}read();throw 20;'
 ])assert.ok(proof(source).unsupported.length,source);
 for(const source of [
  'function fail():number{throw 20;return 7}fail();',
  'function fail(value:number){throw 20;value=7}fail(7);',
  'function read(value:boolean):number{if(value)throw 20;return 7}throw read(false);'
 ])assert.deepEqual(proof(source).unsupported,[],source);
});

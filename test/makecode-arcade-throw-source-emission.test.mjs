import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
test('Throw source remains explicitly closed without canonical prototype admission',()=>{
 const result=arcadeToPseudocode('throw 20;');assert.ok(result.unsupported.some(message=>/Throw source.*canonical/.test(message)));assert.doesNotMatch(result.code,/^  arcade throw /m);
});
test('proved Throw source prototype renders actual primitive carriers without sprite mode',()=>{
 for(const [source,pattern] of [['throw 20;',/arcade throw \(\(0 \+ \(20\)\)\)/],['throw "20";',/arcade throw \("20"\)/],['throw null;',/arcade throw \(null value\)/],['throw undefined;',/arcade throw \(undefined value\)/],['throw true;',/arcade throw /]]){
  const result=arcadeToPseudocode(source,{throwPrototype:true});assert.deepEqual(result.unsupported,[],source);assert.match(result.code,pattern,source);
 }
});
test('ordinary Throw procedure call is retained as an actual effectful CALL statement',()=>{
 const result=arcadeToPseudocode('let before=1;function fail(value){throw value}fail(20);let after=2;',{throwPrototype:true});
 assert.deepEqual(result.unsupported,[]);assert.match(result.code,/DEFINE fail \(value\):/);assert.match(result.code,/arcade throw \(arcade local value\)/);assert.match(result.code,/CALL: \(fail \(\(0 \+ \(20\)\)\)\)/);assert.ok(result.code.indexOf('CALL:')<result.code.indexOf('set after'));
});
test('invalid source contexts do not receive an emitting Throw marker',()=>{
 for(const source of ['throw unknown;','game.onUpdate(()=>{throw 20});','function fail(){throw 20}let values=[1].map(value=>{fail();return value});']){
  const result=arcadeToPseudocode(source,{throwPrototype:true});assert.ok(result.unsupported.some(message=>/Throw source:/.test(message)),source);assert.doesNotMatch(result.code,/^  arcade throw /m);
 }
});

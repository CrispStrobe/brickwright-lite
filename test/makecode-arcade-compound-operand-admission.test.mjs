import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
const operators=[['&=','&'],['|=','|'],['^=','^'],['<<=','<<'],['>>=','>>'],['>>>=','>>>']];
test('every actual primitive compound operand is admitted before its later Binary emission',()=>{
 for(const [assignment,operator]of operators){
  const source=`let value=5;let other=2;value${assignment}other;let result=value;`;
  const result=arcadeToPseudocode(source);assert.deepEqual(result.unsupported,[],assignment);
  assert.ok(result.code.includes(`op "${operator}"`),result.code);
 }
});
test('captured formal, negative input and RHS mutation keep original all-writer operand facts',()=>{
 for(const source of [
  'function make(seed:number):()=>number{let current=seed;return()=>{current|=2;return current}}let callback=make(5);let result=callback();',
  'function make(seed:number):()=>number{let current=-seed;return()=>{current|=-2;return current}}let input=-5.75;let callback=make(-input);let result=callback();',
  'let value=1;let calls=0;function right(){value=8;calls+=1;return 2}value|=right();let result=value;'
 ]){const result=arcadeToPseudocode(source);assert.deepEqual(result.unsupported,[],source);assert.match(result.code,/op "\|"/);}
});
test('compound operand indexing cannot create a primitive fact for an opaque writer or receiver',()=>{
 for(const source of [
  'let value=sprites.create(img`1`,SpriteKind.Player);value|=1;',
  'let value:any=3;value=screen;value&=1;',
  'function bad(value:number){value^=1;return value}let result=bad(screen as any);',
  'let value=1;function poison(){value=screen as any}value|=2;',
  'function make(seed:number):()=>number{let current=seed;return()=>{current|=2;return current}}let callback=make(image.create(1,1) as any);let result=callback();'
 ])assert.ok(arcadeToPseudocode(source).unsupported.length,source);
});

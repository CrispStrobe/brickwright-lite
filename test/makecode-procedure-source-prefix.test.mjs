import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
const option={procedureConstraintsPrototype:true};
test('ordinary declaration prefix is explicit and precedes local/body initialization',()=>{
 const source='function keep(value:number){let local=1;return value+local}let result=keep(20);';
 const ordinary=arcadeToPseudocode(source),explicitFalse=arcadeToPseudocode(source,{procedureConstraintsPrototype:false}),selected=arcadeToPseudocode(source,option);
 assert.deepEqual(ordinary,explicitFalse);assert.doesNotMatch(ordinary.code,/declare arcade procedure/);assert.deepEqual(selected.unsupported,[]);
 assert.match(selected.code,/DEFINE keep \(value\):\n  declare arcade procedure "keep %s" parameter "value" as Number\n/);
 assert.ok(selected.code.indexOf('parameter "value"')<selected.code.indexOf('arcade set local local'));
});
test('unused String helper and namespace formals retain real source catalogue identity',()=>{
 for(const source of ['function holdText(thisText:string){game.showLongText(thisText,DialogLayout.Full)}let ready=true;','namespace TextHelpers{export function hold(answer:string){game.showLongText(answer,DialogLayout.Full)}}let ready=true;']){
  const result=arcadeToPseudocode(source,option);assert.deepEqual(result.unsupported,[],source);assert.match(result.code,/declare arcade procedure .* parameter .* as String/);assert.match(result.code,/arcade long text/);
 }
 const renamed=arcadeToPseudocode('function hold(answer:string){game.showLongText(answer,DialogLayout.Full)}',option);assert.deepEqual(renamed.unsupported,[]);assert.match(renamed.code,/DEFINE hold \(answer_\):\n  declare arcade procedure "hold %s" parameter "answer_" as String/);
});
test('primitive obligations reject incompatible actual incoming/formal/captured writers without producer seeds',()=>{
 for(const source of ['function hold(value:number){return value}let result=hold("bad");','function hold(value:string){value=20}hold("ok");','function hold(value:number){game.onUpdate(()=>{value="bad"})}hold(20);'])assert.ok(arcadeToPseudocode(source,option).unsupported.some(message=>/Procedure parameter constraint/.test(message)),source);
 const good=arcadeToPseudocode('function keep(value:number){return value}let result=keep(20);',option);assert.deepEqual(good.unsupported,[]);
});
test('existing independent optional/reference/class and escaped function paths gain no ordinary declaration',()=>{
 for(const source of ['function keep(value:number=1){return value}let result=keep();','function keep<T>(value:number){return value}let result=keep(1);','function width(value:Image){return value.width}let result=width(image.create(1,1));','function keep(value:number){return value}let alias=keep;','class Box{value:number;constructor(value:number){this.value=value}read(value:number){return this.value+value}}let box=new Box(1);let result=box.read(2);']){
  const result=arcadeToPseudocode(source,option);assert.doesNotMatch(result.code,/declare arcade procedure/);
 }
});
test('explicit Throw and parameter protocols compose without annotation producer grants',()=>{
 const result=arcadeToPseudocode('function fail(value:number){throw value}fail(20);',{...option,throwPrototype:true});assert.deepEqual(result.unsupported,[]);assert.match(result.code,/DEFINE fail \(value\):\n  declare arcade procedure "fail %s" parameter "value" as Number\n  arcade throw/);
 const bad=arcadeToPseudocode('function fail(value:number){throw value}fail("20");',{...option,throwPrototype:true});assert.ok(bad.unsupported.some(message=>/Procedure parameter constraint/.test(message)));
});

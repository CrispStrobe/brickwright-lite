import test from 'node:test';import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {parseMakeCodeTs} from '../overlay/scratch-gui/src/lib/bw-makecode/ts-import.js';
import {sourceScalarDeclarations} from '../overlay/scratch-gui/src/lib/bw-makecode/source-scalar-declarations.js';
const prefix='function convert(value:Array<string>):number{return value[0].charCodeAt(0)}let words:string[]=[];';
test('genuine prompt String return flows through typed array element aliases',()=>{
 for(const source of [prefix+"words.push(game.askForString('name'));let result=convert(words)",prefix+"let entered=game.askForString('name');let alias=entered;words.push(alias);let result=convert(words)"])assert.deepEqual(arcadeToPseudocode(source).unsupported,[]);
 assert.deepEqual(sourceScalarDeclarations(parseMakeCodeTs("let entered=game.askForString('name')")),[{name:'entered',type:'String'}]);
});
test('game parameter and hoisted local shadows never acquire SDK prompt return authority',()=>{
 for(const source of ["function f(game:any){let entered=game.askForString('name');return entered.charCodeAt(0)}","function f(){let entered=game.askForString('name');let game:any;return entered.charCodeAt(0)}","let game:any;let entered=game.askForString('name');let result=entered.charCodeAt(0)"])assert.ok(arcadeToPseudocode(source).unsupported.some(x=>/proven string/.test(x)),source);
 assert.deepEqual(sourceScalarDeclarations(parseMakeCodeTs("let game:any;let entered=game.askForString('name')")),[{name:'game',type:'Any'}]);
});
test('API spelling, opaque and reference receivers retain their diagnostics',()=>{
 for(const source of ["let entered=game.unknownPrompt('name');let result=entered.charCodeAt(0)","let entered=img`1`;let result=entered.charCodeAt(0)","let entered:any={x:1};let result=entered.charCodeAt(0)","function f(game:any){return game.askForString('name')}let entered=f({});let result=entered.charCodeAt(0)"])assert.ok(arcadeToPseudocode(source).unsupported.length,source);
});

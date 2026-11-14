import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {numberPromptLengthSourceSafe} from '../overlay/scratch-gui/src/lib/bw-makecode/number-prompt-length-source.js';

test('only literal question and literal lengths one to three receive bounded reporter',()=>{
 for(const length of [1,2,3]){
  const result=arcadeToPseudocode(`let value=game.askForNumber("Input?",${length});value+=0`);
  assert.deepEqual(result.unsupported,[]);assert.match(result.code,new RegExp(`arcade ask number "Input\\?" length ${length}`));
 }
 const original=arcadeToPseudocode('let value=game.askForNumber("Input?")');
 assert.deepEqual(original.unsupported,[]);assert.match(original.code,/arcade ask number "Input\?"/);assert.doesNotMatch(original.code,/length/);
});

test('dynamic, out-of-slice and keyboard options retain named refusal',()=>{
 for(const args of ['"Input?",0','"Input?",4','"Input?",-1','"Input?",1.5','"Input?",NaN','"Input?",Infinity','"Input?",1+1','"Input?",+2','question,2','"Input?",length','"Input?",2,false','"Input?",2,true']){
  const result=arcadeToPseudocode(`let question="Input?";let length=2;let value=game.askForNumber(${args})`);
  assert.ok(result.unsupported.some(reason=>reason.includes('digit limit')),args);assert.doesNotMatch(result.code,/ask number .* length/,args);
 }
});

test('original source namespace, dependency and opaque mutations prevent new admission',()=>{
 const call='let value=game.askForNumber("Input?",2)';
 for(const prefix of ['let game=1;','function hidden(game:any){game.askForNumber("x",2)}',
  'game.askForNumber=function(){return 1};','let alias=game;','let alias=game.askForNumber;',
  'game["askForNumber"]=function(){return 1};','parseFloat=function(){return 1};','String.prototype.substr=function(){return "1"};',
  'Math.min=function(){return 1};','console.inspect=function(){return "different"};','Object.assign(game,{});',
  'class Hidden{constructor(){game.askForNumber=function(){return 1}}}']){
  assert.equal(numberPromptLengthSourceSafe({'main.ts':prefix+call}),false,prefix);
  assert.doesNotMatch(arcadeToPseudocode(prefix+call).code,/ask number .* length/,prefix);
 }
 for(const prefix of ['game?.askForNumber("x",2);','ga\\u006de.askForNumber=function(){};'])assert.equal(numberPromptLengthSourceSafe({'main.ts':prefix+call}),false);
 for(const [name,text] of [['hidden.g.ts','game.askForNumber=function(){return 1}'],['hidden.asm','nop'],['main.py',''],['hidden.d.ts','declare const game:any;']]){
  const files={'main.ts':call,[name]:text,'pxt.json':JSON.stringify({files:['main.ts',name]})};assert.equal(numberPromptLengthSourceSafe(files),false,name);
  assert.doesNotMatch(arcadeToPseudocode(files).code,/ask number .* length/,name);
 }
});

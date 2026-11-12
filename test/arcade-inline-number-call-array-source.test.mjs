import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {parseMakeCodeTs} from '../overlay/scratch-gui/src/lib/bw-makecode/ts-import.js';
import {analyseSourceValueProducers} from '../overlay/scratch-gui/src/lib/bw-makecode/source-value-producers.js';
const TAKE='function take(n:number){return n}\n';
const TAP='let trace=0\nfunction tap(n:number){trace=trace*10+n;return n}\n';
const source=expression=>TAP+TAKE+'let output=take('+expression+')\n';
const walk=(node,callback)=>{if(!node||typeof node!=='object')return;if(Array.isArray(node)){node.forEach(value=>walk(value,callback));return;}callback(node);for(const value of Object.values(node))if(value&&typeof value==='object')walk(value,callback);};
const graphFor=text=>{const ast=parseMakeCodeTs(text,{parameterDefaults:true,retainCallableMetadata:true});return{ast,graph:analyseSourceValueProducers(ast,{arrayValues:true,parenthesized:true,unboundIsOpaque:true})};};
test('fresh homogeneous Number-call Arrays reach ordinary Number formals',()=>{
 for(const text of [source('[tap(1),tap(2)][0]'),source('[tap(1),tap(2)][1]'),source('([tap(1),tap(2)])[0]'),source('[tap(1),2][0]'),source('[tap(1),tap(2),tap(3)][1]'),
  'function constant(){return 7}\n'+TAKE+'let output=take([constant(),constant()][0])\n'])assert.deepEqual(arcadeToPseudocode(text).unsupported,[],text);
});
test('held, mixed, uncertain, SDK and rewritten calls retain ordinary producer refusals',()=>{
 const cases=[
  source('[tap(1),"text"][0]'),
  TAP+'function text(){return "text"}\n'+TAKE+'let output=take([tap(1),text()][0])\n',
  'function bad(n:number){if(n)return 1;return "text"}\n'+TAKE+'let output=take([bad(1),bad(2)][0])\n',
  'function bad(n:number){if(n)return 1}\n'+TAKE+'let output=take([bad(1),bad(2)][0])\n',
  'function bad():number{return <any>"text"}\n'+TAKE+'let output=take([bad(),bad()][0])\n',
  TAP+TAKE+'let x=1\nlet output=take([tap(x),tap(2)][0])\n',
  TAP+TAKE+'let a=[tap(1),tap(2)]\nlet output=take(a[0])\n',
  TAP+TAKE+'let a=[tap(1),tap(2)]\nlet b=a\nlet output=take(b[0])\n',
  TAP+TAKE+'let a=[tap(1),tap(2)]\na[0]=<any>"text"\nlet output=take(a[0])\n',
  TAP+TAKE+'let a=[tap(1),tap(2)]\nunknown(a)\nlet output=take(a[0])\n',
  TAP+TAKE+'function hold(a:any){return a}\nlet output=take(hold([tap(1),tap(2)])[0])\n',
  TAP+TAKE+'let alias=tap\nlet output=take([alias(1),alias(2)][0])\n',
  TAP+TAKE+'function other(n:number){return n}\ntap=other\nlet output=take([tap(1),tap(2)][0])\n',
  'function value(n:any){return n}\n'+TAKE+'let output=take([value(1),value(2)][0])\nvalue("text")\n',
  source('[tap(1),tap(2)][2]'),source('[tap(1),tap(2)][-1]'),
  TAP+TAKE+'let index=0\nlet output=take([tap(1),tap(2)][index])\n',
  TAKE+'let output=take([music.tempo(),music.tempo()][0])\n',
  'function tempo(){return music.tempo()}\n'+TAKE+'let output=take([tempo(),tempo()][0])\n',
  'function value(n:any){let mutate=()=>{n=unknown()};mutate();return n}\n'+TAKE+'let output=take([value(1),value(2)][0])\n',
  'function value(n:any){game.onUpdate(()=>{n=unknown()});return n}\n'+TAKE+'let output=take([value(1),value(2)][0])\n',
  'function value(n:number,other:number){return n}\n'+TAKE+'let output=take([value(1),value(2)][0])\n',
  'function value(n:number){return n}\n'+TAKE+'let output=take([value(1,2),value(2)][0])\n',
  'function loop(){return loop()}\n'+TAKE+'let output=take([loop(),loop()][0])\n'
 ];
 for(const text of cases)assert.ok(arcadeToPseudocode(text).unsupported.some(row=>/Procedure parameter constraint/.test(row)),text);
});
test('fresh calls do not gain String or reference positional authority',()=>{
 for(const [definition,result]of [['function value(){return "text"}','String'],['function value(){return [1]}','Array']]){
  const text=definition+'\nlet output=[value(),value()][0]\n';const {ast,graph}=graphFor(text);let index;walk(ast,node=>{if(node.type==='Index')index=node;});
  assert.ok(index);assert.equal(graph.positionalSlotAt(index),null,result);assert.ok(graph.typesAt(index).has('Undefined'),result+' retains the original general-read frontier');
 }
});
test('mixed call-result domains retain the general-read frontier',()=>{
 const text='function value(n:number){if(n)return 1;return "text"}\nlet output=[value(1),value(2)][0]\n';
 const {ast,graph}=graphFor(text);let index;walk(ast,node=>{if(node.type==='Index')index=node;});
 assert.ok(index);assert.equal(graph.positionalSlotAt(index),null);assert.ok(graph.typesAt(index).has('Undefined'));
});
test('source admission preserves a three-sibling middle-selection emitted order',()=>{
 const translated=arcadeToPseudocode(source('[tap(1),tap(2),tap(3)][1]'));assert.deepEqual(translated.unsupported,[]);
 const pushes=translated.code.split('\n').filter(line=>line.trimStart().startsWith('mutate array reference'));
 assert.equal(pushes.length,3);assert.match(pushes[0],/call function "tap %s" arguments.*\(1\)/);assert.match(pushes[1],/call function "tap %s" arguments.*\(2\)/);assert.match(pushes[2],/call function "tap %s" arguments.*\(3\)/);
 assert.match(translated.code,/DEFINE tap \(n\):[\s\S]*set trace to \(calculate value/);
 assert.ok(translated.code.indexOf(pushes[0])<translated.code.indexOf(pushes[1]));assert.ok(translated.code.indexOf(pushes[1])<translated.code.indexOf(pushes[2]));assert.match(translated.code,/item \(1\) of array reference/);
});

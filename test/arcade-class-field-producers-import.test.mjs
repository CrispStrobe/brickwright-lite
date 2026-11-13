import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';

const box='class Box{constructor(public n:number){}get value():number{return this.n}set value(v:number){this.n=v}}';
const take='function take(v:number){return v}';
const source=(before='',read='box.n',definition=box)=>definition+take+'let box=new Box(2);'+before+'let result=take('+read+');';
const accepted=code=>assert.deepEqual(arcadeToPseudocode(code).unsupported,[],code);
const refused=code=>assert.ok(arcadeToPseudocode(code).unsupported.some(message=>/^Procedure parameter constraint: take.v requires Number from actual producers$/.test(message)),code);

test('actual constructor field and simple getter/setter Number producers reach ordinary Number formals',()=>{
 accepted(source());accepted(source('box.value=3;','box.value'));
 accepted(source('box.n=4;','box.value'));
 accepted(box+take+'let result=take(new Box(2).n);');
 accepted(source('', 'box.n','class Box{n:number;constructor(v:number){this.n=v}}'));
 accepted(source('', 'box.n','class Box{n=7;constructor(){}}').replace('new Box(2)','new Box()'));
});

test('an initialized Number cell preserves its earlier effect and all mixed writers remain visible',()=>{
 const code='let trace="";function tap(){trace=trace+"t";return 3}'+
  'class Box{constructor(public n:number){}}'+take+'let v=tap();let box=new Box(v);let result=take(box.n);';
 const imported=arcadeToPseudocode(code);assert.deepEqual(imported.unsupported,[]);
 const effect=imported.code.indexOf('set v to ((arcade call function "tap"');
 const allocation=imported.code.indexOf('arcade new object class ("Box")');
 const consume=imported.code.indexOf('set result to');
 assert.ok(effect>=0&&effect<allocation&&allocation<consume);
 refused(code.replace('let box=new Box(v);','v=<any>"x";let box=new Box(v);'));
 refused(code.replace('let box=new Box(v);','if(true){v=<any>true;}let box=new Box(v);'));
});

test('actual Text and Boolean constructor, direct field and setter writers stay refused',()=>{
 for(const value of ['<any>"x"','<any>true']){
  refused(source().replace('new Box(2)','new Box('+value+')'));
  refused(source('box.n='+value+';'));
  refused(source('box.value='+value+';','box.value'));
 }
 refused(source('if(true){box.n=<any>"x";}'));
 refused(source('box.n+=1;'));
});

test('field annotations, missing or conditional construction writes do not supply Number evidence',()=>{
 refused(source('', 'box.n','class Box{n:number;constructor(v:number){}}'));
 refused(source('', 'box.n','class Box{n:number;constructor(v:number){if(v){this.n=v}}}'));
 refused(source('', 'box.n','class Box{n:number;constructor(v:number){this.n=this.n}}'));
 refused(source('', 'box.n','class Box{n:number;constructor(v:number){this.n=<any>"x"}}'));
 refused(box+take+'let unready:number;let box=new Box(unready);unready=2;let result=take(box.n);');
});

test('unproved receiver writers, aliasing, rebinding and captured instances stay outside the closed proof',()=>{
 for(const before of ['let alias=box;','let alias=box;alias.n=<any>"x";','box=<any>{n:"x"};','let other:any={};other.n="x";',
  'function later(){box.n=<any>"x";}','let values=[box];','box["n"]=<any>"x";'])refused(source(before));
 refused(box+take+'let result=take(box.n);let box=new Box(2);');
 refused(box+take+'let box=new Box(2);function read(){return take(box.n)}let result=read();');
});

test('getters, setters and constructors with unproved effects or control flow do not get Number authority',()=>{
 refused(source('', 'box.value',box.replace('return this.n','return <any>"x"')));
 refused(source('box.value=3;', 'box.value',box.replace('this.n=v','this.n=<any>"x"')));
 refused(source('box.value=3;', 'box.value',box.replace('this.n=v','if(v){this.n=v}')));
 refused(source('', 'box.n',box.replace('constructor(public n:number){}','constructor(public n:number){this.n=<any>"x"}')));
 const tap='function tap(){console.log("effect");return 3}';
 refused(tap+source().replace('new Box(2)','new Box(tap())'));
 refused(tap+source('', 'box.n','class Box{n:number;constructor(v:number){this.n=tap()}}'));
 refused(tap+source('', 'box.n','class Box{n=tap();constructor(v:number){}}'));
 refused(tap+source('box.value=tap();','box.value'));
 const unused='class Box{n:number;constructor(v:number,unused:number){this.n=v}}';
 refused(tap+source('', 'box.n',unused).replace('new Box(2)','new Box(2,tap())'));
 refused(source('', 'box.n',unused).replace('new Box(2)','new Box(2,<any>"x")'));
 refused(source('', 'box.n',unused).replace('new Box(2)','new Box(2,1e999)'));
 refused(tap+source('', 'box.n','class Box{n=2;constructor(unused:number){}}').replace('new Box(2)','new Box(tap())'));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {parseMakeCodeTs} from '../overlay/scratch-gui/src/lib/bw-makecode/ts-import.js';
import {localArrayDeclarationResetSource} from '../overlay/scratch-gui/src/lib/bw-makecode/local-array-declaration-reset-source.js';
import {createLocalArrayResetPrefixEffects} from '../overlay/scratch-gui/src/lib/bw-makecode/local-array-reset-prefix-effects.js';
import {analyseSourceValueProducers} from '../overlay/scratch-gui/src/lib/bw-makecode/source-value-producers.js';

const source=`function equal(a:any,b:any):boolean{return a===b}
function different(a:any,b:any):boolean{return a!==b}
function read(){return later}
function forward(items:number[]):number[]{let local:number[]=null;local=items;local[0]=7;local.push(3);return local}
function run(){
 let values:string[]=null;let buffer:number[]=null;let matched=false;
 before=read();missing=equal(before,undefined);buffer=[];buffer.push(1);buffer.push(2);
 original=buffer;alias=original;returned=forward(alias);matched=equal(returned,alias);
 if(!!matched){matched=equal(alias,original)}else{matched=different(alias,original)}
 values=[];values.push("ok");let item=values[0];
}
let later:number[];let before:number[];let missing:boolean;let original:number[];let alias:number[];let returned:number[];
run();`;
const observe=(text=source)=>{
 const program=parseMakeCodeTs(text,{retainCallableMetadata:true});
 const fn=program.body.find(node=>node.type==='FunctionDeclaration'&&node.name==='run');
 const decl=fn.body.filter(node=>node.type==='Declaration').flatMap(node=>node.decls).find(decl=>decl.name==='values');
 return {program,fn,decl,proof:localArrayDeclarationResetSource(program),effects:createLocalArrayResetPrefixEffects(program)};
};
const good=text=>{const row=observe(text);assert.equal(row.proof.discount(row.decl),true);assert.ok(row.effects.overwrite(row.decl));return row;};
const bad=text=>{const row=observe(text);assert.equal(row.proof.discount(row.decl),false,text);assert.equal(row.effects.overwrite(row.decl),null,text);return row;};

test('closed synchronous declared calls aliases primitive Array effects and both branches preserve a private reset',()=>{
 const row=good();assert.equal(row.effects.current(),true);
 const graph=analyseSourceValueProducers(row.program,{arrayValues:true,arrayEffectSites:true,unboundIsOpaque:true,initializationEntries:true});
 const item=row.fn.body.at(-1).decls[0].init;assert.deepEqual([...graph.typesAt(item)].sort(),['String','Undefined']);
 const early=bad(source.replace('let values:string[]=null','let early=values[0];let values:string[]=null'));
 const facts=analyseSourceValueProducers(early.program,{arrayValues:true,arrayEffectSites:true,unboundIsOpaque:true,initializationEntries:true});
 assert.equal(facts.isInitializedAt(early.fn.body[0].decls[0].init.object),false);
});

test('both branch heaps are isolated and a source false condition cannot hide an unsafe other branch',()=>{
 good(source.replace('matched=equal(alias,original)}else{matched=different(alias,original)',
  'buffer.push(4);matched=equal(alias,original)}else{buffer.push(5);matched=different(alias,original)'));
 good(source.replace('matched=equal(alias,original)}else{matched=different(alias,original)',
  'buffer=null;matched=equal(alias,original)}else{buffer.push(5);matched=different(alias,original)'));
 bad(source.replace('matched=equal(alias,original)}else{matched=different(alias,original)',
  'pause(1)}else{matched=different(alias,original)'));
 bad(source.replace('matched=equal(alias,original)}else{matched=different(alias,original)',
  'matched=equal(alias,original)}else{return'));
 bad(source.replace('if(!!matched)','if(true)'));
});

test('unknown calls yields namespace dispatch joins and opaque coercion remain barriers',()=>{
 for(const operation of ['pause(1);','foreign();','game.onUpdate(function(){});','buffer.join(",");',
  'buffer.push(foreign());','buffer["push"]=3;','buffer.push=foreign;'])bad(source.replace('before=read();',operation+'before=read();'));
 bad(source.replace('buffer=[];','buffer=[];let other=+buffer;'));
 bad(source.replace('return later','return foreign()'));
 // The declared-call requirement is a conservative supported-profile limit.
 bad('function run(){let values:number[]=null;let buffer=[];buffer.push(1);values=[]}run();');
});

test('candidate reads writes argument exposure and captures cannot cross the prefix',()=>{
 for(const operation of ['let saved=values;','forward(values);','values=null;','values[0]="before";',
  'let capture=()=>values;','function capture(){return values;}'])bad(source.replace('before=read();',operation+'before=read();'));
 bad(source.replace('matched=equal(alias,original)}else{','values=[]}else{'));
});

test('callee mutation aliases defaults recursion and extra entry effects retain the reset',()=>{
 bad(source.replace('function read(){return later}','function read(){return read()}'));
 bad(source.replace('function read(){return later}','function read(value:any=1){return later}'));
 bad(source.replace('before=read();','let escaped=read;before=escaped();'));
 bad(source.replace('run();','read=foreign;run();'));
 bad(source.replace('run();','run();run();'));
 bad(source.replace('run();','foreign();run();'));
 bad(source.replace('run();','Array.prototype.push=foreign;run();'));
 const row=observe(),read=row.program.body.find(node=>node.name==='read');read.isAsync=true;
 assert.equal(createLocalArrayResetPrefixEffects(row.program).overwrite(row.decl),null);
});

test('indexed mutation requires the actual fresh receiver and bounded numeric key and primitive value',()=>{
 for(const mutation of ['local["push"]=7','local[-1]=7','local[0]=[]'])bad(source.replace('local[0]=7',mutation));
 bad(source.replace('original=buffer;','original=foreign();'));
 bad(source.replace('local=items;','local=foreign();'));
 bad(source.replace('returned=forward(alias)','returned=forward(0)'));
 bad(source.replace('before=read();','before=read();before.push(1);'));
 good(source.replace('before=read();','later=[];before=read();before.push(1);'));
});

test('malformed executable edges metadata sparse lists and caller-shaped nodes supply no effect receipt',()=>{
 for(const mutate of [row=>delete row.fn.body[3],row=>{row.fn.body[3].hidden={type:'Call',callee:{type:'Identifier',name:'foreign'},args:[]};},
  row=>{row.fn.body[3].expr.optional=true;},row=>{Object.defineProperty(row.fn.body[3],'hidden',{get(){throw Error('getter must not run');}});},
  row=>{row.program.hidden={type:'ExpressionStatement',expr:{type:'Call',callee:{type:'Identifier',name:'foreign'},args:[]}};},
  row=>{row.program.body.at(-1).hidden={type:'Call',callee:{type:'Identifier',name:'foreign'},args:[]};},
  row=>{row.program.body[0].hidden={type:'Call',callee:{type:'Identifier',name:'foreign'},args:[]};}]){
  const row=observe();mutate(row);assert.equal(createLocalArrayResetPrefixEffects(row.program).overwrite(row.decl),null);
 }
 const row=good();assert.equal(row.effects.overwrite({...row.decl}),null);assert.equal(row.effects.overwrite(null),null);
});

test('source and Array method changes permanently expire the effect and reset receipts',()=>{
 const row=good(),read=row.program.body.find(node=>node.name==='read'),value=read.body[0].value;
 read.body[0].value={type:'Number',value:'0'};assert.equal(row.effects.current(),false);assert.equal(row.proof.discount(row.decl),false);
 read.body[0].value=value;assert.equal(row.effects.overwrite(row.decl),null);assert.equal(row.proof.discount(row.decl),false);
 const method=good(),descriptor=Object.getOwnPropertyDescriptor(Array.prototype,'push');
 try{Object.defineProperty(Array.prototype,'push',{...descriptor,value(){throw Error('changed Array push must not run');}});assert.equal(method.effects.current(),false);assert.equal(method.proof.discount(method.decl),false);}
 finally{Object.defineProperty(Array.prototype,'push',descriptor);}
 assert.equal(method.effects.overwrite(method.decl),null);assert.equal(method.proof.discount(method.decl),false);
});

test('changed Symbol Boolean and Math dispatch expire before any replacement or metadata getter can run',()=>{
 for(const [object,key] of [[globalThis,'Symbol'],[globalThis,'Boolean'],[Math,'max'],[Symbol.prototype,'__bwPrefixMutation']]){
  const row=good(),descriptor=Object.getOwnPropertyDescriptor(object,key);let calls=0;
  try{
   Object.defineProperty(object,key,descriptor?{...descriptor,value(){calls++;throw Error('replacement dispatch must not run');}}:
    {configurable:true,get(){calls++;throw Error('metadata getter must not run');}});
   assert.equal(row.effects.current(),false);assert.equal(row.effects.overwrite(row.decl),null);
   assert.equal(row.proof.discount(row.decl),false);
   assert.equal(createLocalArrayResetPrefixEffects(row.program).overwrite(row.decl),null);
  }finally{if(descriptor)Object.defineProperty(object,key,descriptor);else delete object[key];}
  assert.equal(calls,0);assert.equal(row.effects.current(),false);assert.equal(row.proof.discount(row.decl),false);
 }
});

test('changed predicate dispatch and shared iterator return cannot execute before ambient refusal',()=>{
 const iteratorParent=Object.getPrototypeOf(Object.getPrototypeOf([][Symbol.iterator]()));
 for(const [object,key] of [[RegExp.prototype,'test'],[Array.prototype,'every'],[globalThis,'RegExp'],[iteratorParent,'return']]){
  const row=good(),descriptor=Object.getOwnPropertyDescriptor(object,key);let calls=0;
  try{
   Object.defineProperty(object,key,key==='return'?{configurable:true,get(){calls++;throw Error('inherited iterator return must not run');}}:
    {...descriptor,value(){calls++;throw Error('replacement predicate must not run');}});
   assert.equal(row.effects.current(),false);assert.equal(row.effects.overwrite(row.decl),null);
   assert.equal(createLocalArrayResetPrefixEffects(row.program).overwrite(row.decl),null);
   assert.equal(row.proof.discount(row.decl),false);
  }finally{if(descriptor)Object.defineProperty(object,key,descriptor);else delete object[key];}
  assert.equal(calls,0);assert.equal(row.effects.current(),false);assert.equal(row.proof.discount(row.decl),false);
 }
});
